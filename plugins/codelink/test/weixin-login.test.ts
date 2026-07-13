import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";

import { StateStore } from "../src/state.js";
import { loginWithQr } from "../src/weixin/login.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("loginWithQr", () => {
  it("logs in from an empty CodeLink state without an OpenClaw token", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-login-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveConfig(store.loadConfig());
    const getQrCode = vi.fn(async () => ({
      qrcode: "fresh-qr",
      qrcode_img_content: "https://example.test/fresh-qr",
    }));
    const getQrStatus = vi.fn(async () => ({
      status: "confirmed" as const,
      bot_token: "fresh-token",
      ilink_bot_id: "fresh-bot@im.bot",
      ilink_user_id: "owner",
      baseurl: "https://ilinkai.weixin.qq.com",
    }));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const session = await loginWithQr({
      client: { getQrCode, getQrStatus } as never,
      store,
      timeoutMs: 1_000,
    });

    expect(getQrCode).toHaveBeenCalledWith([]);
    expect(session.accountId).toBe("fresh-bot-im-bot");
    expect(store.loadSession()).toMatchObject({ token: "fresh-token" });
    expect(store.loadConfig().security.allowedUserIds).toEqual(["owner"]);
    if (process.platform !== "win32") {
      expect(fs.statSync(store.path("weixin-session.json")).mode & 0o777).toBe(
        0o600,
      );
    }
  });

  it("allows the new owner when replacing an existing login", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-login-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveSession({
      accountId: "old-bot",
      token: "old-token",
      userId: "old-owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "2026-07-12T00:00:00.000Z",
    });
    const config = store.loadConfig();
    config.security.allowedUserIds = ["old-owner"];
    store.saveConfig(config);
    const getQrCode = vi.fn(async () => ({
      qrcode: "replacement-qr",
      qrcode_img_content: "https://example.test/replacement-qr",
    }));
    const getQrStatus = vi.fn(async () => ({
      status: "confirmed" as const,
      bot_token: "new-token",
      ilink_bot_id: "new-bot@im.bot",
      ilink_user_id: "new-owner",
      baseurl: "https://ilinkai.weixin.qq.com",
    }));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await loginWithQr({
      client: { getQrCode, getQrStatus } as never,
      store,
      timeoutMs: 1_000,
    });

    expect(getQrCode).toHaveBeenCalledWith(["old-token"]);
    expect(store.loadConfig().security.allowedUserIds).toEqual(["new-owner"]);
  });

  it("preserves an explicit allowlist when replacing an existing login", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-login-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveSession({
      accountId: "old-bot",
      token: "old-token",
      userId: "old-owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "2026-07-12T00:00:00.000Z",
    });
    const config = store.loadConfig();
    config.security.allowedUserIds = ["old-owner", "teammate"];
    store.saveConfig(config);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await loginWithQr({
      client: {
        getQrCode: vi.fn(async () => ({
          qrcode: "replacement-qr",
          qrcode_img_content: "https://example.test/replacement-qr",
        })),
        getQrStatus: vi.fn(async () => ({
          status: "confirmed" as const,
          bot_token: "new-token",
          ilink_bot_id: "new-bot@im.bot",
          ilink_user_id: "new-owner",
          baseurl: "https://ilinkai.weixin.qq.com",
        })),
      } as never,
      store,
      timeoutMs: 1_000,
    });

    expect(store.loadConfig().security.allowedUserIds).toEqual([
      "old-owner",
      "teammate",
      "new-owner",
    ]);
  });

  it("backs off before retrying an immediate QR status failure", async () => {
    vi.useFakeTimers();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-login-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveConfig(store.loadConfig());
    vi.spyOn(QRCode, "toFile").mockResolvedValue(undefined);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const getQrStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ status: "verify_code_blocked" as const });

    const login = loginWithQr({
      client: {
        getQrCode: vi.fn(async () => ({
          qrcode: "retry-qr",
          qrcode_img_content: "https://example.test/retry-qr",
        })),
        getQrStatus,
      } as never,
      store,
      timeoutMs: 5_000,
    });
    const result = login.then(
      () => ({ status: "resolved" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(getQrStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(getQrStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const outcome = await result;
    expect(outcome.status).toBe("rejected");
    expect(outcome).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining("配对码验证被暂时阻止"),
      }),
    });
    expect(getQrStatus).toHaveBeenCalledTimes(2);
  });

  it("backs off before polling again after a non-terminal QR status", async () => {
    vi.useFakeTimers();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-login-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveConfig(store.loadConfig());
    vi.spyOn(QRCode, "toFile").mockResolvedValue(undefined);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const getQrStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: "wait" as const })
      .mockResolvedValueOnce({ status: "verify_code_blocked" as const });

    const login = loginWithQr({
      client: {
        getQrCode: vi.fn(async () => ({
          qrcode: "waiting-qr",
          qrcode_img_content: "https://example.test/waiting-qr",
        })),
        getQrStatus,
      } as never,
      store,
      timeoutMs: 5_000,
    });
    const result = login.then(
      () => ({ status: "resolved" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(getQrStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(getQrStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const outcome = await result;
    expect(outcome.status).toBe("rejected");
    expect(outcome).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining("配对码验证被暂时阻止"),
      }),
    });
    expect(getQrStatus).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired QR code without abandoning the login flow", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-login-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveConfig(store.loadConfig());
    const getQrCode = vi
      .fn()
      .mockResolvedValueOnce({
        qrcode: "expired-qr",
        qrcode_img_content: "https://example.test/expired-qr",
      })
      .mockResolvedValueOnce({
        qrcode: "fresh-qr",
        qrcode_img_content: "https://example.test/fresh-qr",
      });
    const getQrStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: "expired" as const })
      .mockResolvedValueOnce({
        status: "confirmed" as const,
        bot_token: "fresh-token",
        ilink_bot_id: "fresh-bot@im.bot",
        ilink_user_id: "owner",
        baseurl: "https://ilinkai.weixin.qq.com",
      });
    const onQr = vi.fn(
      async ({ qrPath }: { qrPath: string; qrContent: string }) => {
        expect(fs.readFileSync(qrPath).subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
      },
    );
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const session = await loginWithQr({
      client: { getQrCode, getQrStatus } as never,
      store,
      timeoutMs: 5_000,
      onQr,
    });

    expect(session.token).toBe("fresh-token");
    expect(getQrCode).toHaveBeenCalledTimes(2);
    expect(getQrStatus.mock.calls.map(([qrcode]) => qrcode)).toEqual([
      "expired-qr",
      "fresh-qr",
    ]);
    expect(onQr.mock.calls.map(([progress]) => progress.qrContent)).toEqual([
      "https://example.test/expired-qr",
      "https://example.test/fresh-qr",
    ]);
  });

  it("支持安装专用 PNG 模式，不把可扫码内容写进终端并在成功后清理图片", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-login-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const terminalQr = vi.spyOn(qrcodeTerminal, "generate");
    let qrExistedDuringCallback = false;
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await loginWithQr({
      client: {
        getQrCode: vi.fn(async () => ({
          qrcode: "fresh-qr",
          qrcode_img_content: "https://example.test/sensitive-qr",
        })),
        getQrStatus: vi.fn(async () => ({
          status: "confirmed" as const,
          bot_token: "fresh-token",
          ilink_bot_id: "fresh-bot@im.bot",
          ilink_user_id: "owner",
          baseurl: "https://ilinkai.weixin.qq.com",
        })),
      } as never,
      store,
      timeoutMs: 1_000,
      qrOutput: "png",
      onQr: ({ qrPath }) => {
        qrExistedDuringCallback = fs.existsSync(qrPath);
      },
    });

    expect(qrExistedDuringCallback).toBe(true);
    expect(terminalQr).not.toHaveBeenCalled();
    expect(fs.existsSync(store.path("login-qr.png"))).toBe(false);
    expect(stdout.mock.calls.flat().join(" ")).not.toContain("fresh-bot");
  });
});
