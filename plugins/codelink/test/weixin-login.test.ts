import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import qrcodeTerminal from "qrcode-terminal";

import { StateStore } from "../src/state.js";
import { loginWithQr } from "../src/weixin/login.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
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
    expect(fs.statSync(store.path("weixin-session.json")).mode & 0o777).toBe(
      0o600,
    );
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
      timeoutMs: 1_000,
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
