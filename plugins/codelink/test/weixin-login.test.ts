import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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
});
