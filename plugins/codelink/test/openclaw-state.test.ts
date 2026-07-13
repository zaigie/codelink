import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  exportOpenClawState,
  importOpenClawState,
} from "../src/openclaw-state.js";
import { StateStore } from "../src/state.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("OpenClaw state migration", () => {
  it("exports only the WeChat allowlisted fields and imports them into CodeLink", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-openclaw-"));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-import-"));
    cleanup.push(root, target);
    const accountsDir = path.join(root, "openclaw-weixin", "accounts");
    fs.mkdirSync(accountsDir, { recursive: true });
    fs.writeFileSync(
      path.join(root, "openclaw-weixin", "accounts.json"),
      JSON.stringify(["bot-im-bot"]),
    );
    fs.writeFileSync(
      path.join(accountsDir, "bot-im-bot.json"),
      JSON.stringify({
        token: "wechat-secret",
        baseUrl: "https://ilinkai.weixin.qq.com",
        userId: "owner@im.wechat",
        savedAt: "2026-07-12T00:00:00.000Z",
      }),
    );
    fs.writeFileSync(
      path.join(accountsDir, "bot-im-bot.sync.json"),
      JSON.stringify({ get_updates_buf: "cursor" }),
    );
    fs.writeFileSync(
      path.join(accountsDir, "bot-im-bot.context-tokens.json"),
      JSON.stringify({ "owner@im.wechat": "context" }),
    );
    fs.writeFileSync(
      path.join(root, "openclaw.json"),
      JSON.stringify({
        models: { providers: { private: { apiKey: "must-not-export" } } },
        channels: {
          "openclaw-weixin": {
            routeTag: "route-a",
            botAgent: "Bootstrap/1.0",
          },
        },
        gateway: { auth: { token: "gateway-secret" } },
      }),
    );

    const outputPath = path.join(root, "bundle.json");
    const bundle = exportOpenClawState({ stateDir: root, outputPath });

    const raw = fs.readFileSync(outputPath, "utf8");
    expect(raw).toContain("wechat-secret");
    expect(raw).not.toContain("must-not-export");
    expect(raw).not.toContain("gateway-secret");
    expect(bundle.routeTag).toBe("route-a");

    const store = new StateStore(target);
    const summary = importOpenClawState({ inputPath: outputPath, store });
    expect(summary).toMatchObject({
      accountId: "bot-im-bot",
      userIdPresent: true,
      tokenPresent: true,
      syncCursorImported: true,
      contextTokensImported: 1,
      routeTagImported: true,
    });
    // CLI 摘要不得携带微信用户 ID 原文。
    expect(JSON.stringify(summary)).not.toContain("owner@im.wechat");
    expect(store.loadSession()?.token).toBe("wechat-secret");
    expect(store.loadSyncCursor()).toBe("cursor");
    expect(store.getContextToken("owner@im.wechat")?.contextToken).toBe(
      "context",
    );
    expect(store.loadConfig().weixin.routeTag).toBe("route-a");
    expect(store.loadConfig().security.allowedUserIds).toContain(
      "owner@im.wechat",
    );
  });
});
