import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDoctorReport } from "../src/doctor.js";
import { StateStore } from "../src/state.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("CodeLink doctor", () => {
  it("只输出安装就绪布尔值，不泄露微信、会话或路径标识", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-doctor-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveSession({
      accountId: "secret-account",
      token: "secret-token",
      userId: "secret-owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "2026-07-12T00:00:00.000Z",
    });
    const pluginRoot = createInstalledPlugin(dir);
    store.saveInstallReceipt({
      schemaVersion: 1,
      pluginInstalled: true,
      mcpBundleReady: true,
      pluginRoot,
      pluginVersion: "0.1.0+codex.test",
      mcpSha256:
        "1e6ed65d77d6364eeaed5a745ba5c4985ae2b700dd85d7cf7f027bdf294a33fc",
      installedAt: "2026-07-12T00:00:00.000Z",
    });
    createRuntime(dir);

    const report = createDoctorReport({
      store,
      daemonStatus: {
        ok: true,
        accountId: "secret-account",
        ownerUserId: "secret-owner",
        allowedUserIds: ["secret-owner"],
        activeThreadId: "secret-thread",
        hasDefaultContextToken: true,
      },
    });

    expect(report).toEqual({
      ok: true,
      runtimeReady: true,
      pluginInstalled: true,
      mcpBundleReady: true,
      daemonHealthy: true,
      wechatLoggedIn: true,
      defaultRecipientReady: true,
      currentConversationBound: true,
      newTaskRequired: true,
    });
    expect(JSON.stringify(report)).not.toMatch(
      /secret-account|secret-owner|secret-thread|secret-token|codelink-doctor-/,
    );
  });

  it("运行时被篡改或插件缓存被删除后不会继续报告就绪", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-doctor-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveSession({
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "2026-07-12T00:00:00.000Z",
    });
    const pluginRoot = createInstalledPlugin(dir);
    store.saveInstallReceipt({
      schemaVersion: 1,
      pluginInstalled: true,
      mcpBundleReady: true,
      pluginRoot,
      pluginVersion: "0.1.0+codex.test",
      mcpSha256:
        "1e6ed65d77d6364eeaed5a745ba5c4985ae2b700dd85d7cf7f027bdf294a33fc",
      installedAt: "2026-07-12T00:00:00.000Z",
    });
    createRuntime(dir);
    const status = { ok: true, hasDefaultContextToken: true };

    fs.writeFileSync(path.join(dir, "runtime", "cli.cjs"), "tampered");
    expect(createDoctorReport({ store, daemonStatus: status })).toMatchObject({
      ok: false,
      runtimeReady: false,
    });

    createRuntime(dir);
    fs.writeFileSync(path.join(pluginRoot, "dist", "mcp.js"), "tampered");
    expect(createDoctorReport({ store, daemonStatus: status })).toMatchObject({
      ok: false,
      pluginInstalled: true,
      mcpBundleReady: false,
    });

    fs.writeFileSync(path.join(pluginRoot, "dist", "mcp.js"), "bundle");
    fs.rmSync(pluginRoot, { recursive: true, force: true });
    expect(createDoctorReport({ store, daemonStatus: status })).toMatchObject({
      ok: false,
      pluginInstalled: false,
      mcpBundleReady: false,
    });
  });

  it("daemon 离线时返回可执行诊断结果而不是抛错", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-doctor-"));
    cleanup.push(dir);
    const store = new StateStore(dir);

    expect(createDoctorReport({ store, daemonStatus: null })).toMatchObject({
      ok: false,
      runtimeReady: false,
      pluginInstalled: false,
      daemonHealthy: false,
      wechatLoggedIn: false,
    });
  });
});

function createRuntime(stateDir: string): void {
  const runtimeDir = path.join(stateDir, "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "cli.cjs"), "runtime-cli");
  fs.writeFileSync(path.join(runtimeDir, "mcp.js"), "runtime-mcp");
  fs.writeFileSync(
    path.join(runtimeDir, "runtime-manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      files: {
        "cli.cjs":
          "4cf8728efc238ec3915aa4d9a74abc158d92819820204a1427cd7503f9e6ade9",
        "mcp.js":
          "a6035c2e1e57b55ec69cd0a91ab0924ed01d208478c6490da93d143d0205e14b",
      },
    }),
  );
}

function createInstalledPlugin(stateDir: string): string {
  const pluginRoot = path.join(stateDir, "secret-plugin-cache");
  fs.mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "codelink", version: "0.1.0+codex.test" }),
  );
  fs.writeFileSync(
    path.join(pluginRoot, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        codelink: { command: "node", args: ["./dist/mcp.js"], cwd: "." },
      },
    }),
  );
  fs.writeFileSync(path.join(pluginRoot, "dist", "mcp.js"), "bundle");
  return pluginRoot;
}
