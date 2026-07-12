import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseSetupArgs,
  platformSupport,
  serviceInstaller,
} from "../scripts/setup-lib.mjs";
import { renderLaunchAgent } from "../scripts/render-launch-agent-lib.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe("跨平台安装计划", () => {
  it.each([
    ["darwin", "arm64", "aarch64-apple-darwin"],
    ["darwin", "x64", "x86_64-apple-darwin"],
    ["linux", "arm64", "aarch64-unknown-linux-musl"],
    ["linux", "x64", "x86_64-unknown-linux-musl"],
    ["win32", "arm64", "aarch64-pc-windows-msvc"],
    ["win32", "x64", "x86_64-pc-windows-msvc"],
  ])("识别 %s/%s 的官方 Codex 目标", (platform, arch, triple) => {
    expect(platformSupport(platform, arch).targetTriple).toBe(triple);
  });

  it("拒绝没有官方 Codex 目标的架构", () => {
    expect(() => platformSupport("linux", "arm")).toThrow("尚不支持");
  });

  it("为三个系统选择各自的用户态常驻方案", () => {
    expect(serviceInstaller("darwin", "/scripts").name).toBe(
      "macOS LaunchAgent",
    );
    expect(serviceInstaller("linux", "/scripts").name).toBe(
      "systemd user service",
    );
    const windows = serviceInstaller("win32", "C:\\scripts", {
      SystemRoot: "C:\\Windows",
    });
    expect(windows.name).toBe("Windows Scheduled Task");
    expect(windows.args.at(-1)).toBe(
      "C:\\scripts\\install-scheduled-task.ps1",
    );
  });

  it("安全转义 LaunchAgent 路径中的 XML 特殊字符", () => {
    const rendered = renderLaunchAgent(
      "<string>__NODE_BIN__</string><string>__STATE_DIR__</string>",
      {
        NODE_BIN: "/Users/A&B/<node>",
        STATE_DIR: '/Users/"owner"/.codelink',
      },
    );
    expect(rendered).toBe(
      "<string>/Users/A&amp;B/&lt;node&gt;</string><string>/Users/&quot;owner&quot;/.codelink</string>",
    );
  });

  it("通过 Node 启动 LaunchAgent 包装器并写入渲染结果", () => {
    const root = fs.mkdtempSync(path.join(testDir, "launch-agent-"));
    try {
      const templatePath = path.join(root, "template.plist");
      const outputPath = path.join(root, "output.plist");
      fs.writeFileSync(
        templatePath,
        "<string>__LABEL__</string><string>__STATE_DIR__</string>",
      );
      const result = spawnSync(
        process.execPath,
        [
          path.resolve(testDir, "..", "scripts", "render-launch-agent.mjs"),
          templatePath,
          outputPath,
          "com.zaigie.codelink",
          process.execPath,
          "/codex",
          "/runtime/cli.cjs",
          "/workdir",
          "/logs",
          "/state&A",
        ],
        { encoding: "utf8" },
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(fs.readFileSync(outputPath, "utf8")).toBe(
        "<string>com.zaigie.codelink</string><string>/state&amp;A</string>",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("解析无副作用安装参数", () => {
    expect(
      parseSetupArgs([
        "--dry-run",
        "--no-login",
        "--no-service",
        "--build",
      ]),
    ).toEqual({
      dryRun: true,
      login: false,
      service: false,
      build: true,
      help: false,
    });
  });

  it("只有显式 --build 才要求 npm，普通预检可使用预构建运行时", () => {
    const pluginRoot = path.resolve(testDir, "..");
    const result = spawnSync(
      process.execPath,
      [path.join(pluginRoot, "scripts", "setup.mjs"), "--dry-run"],
      {
        cwd: pluginRoot,
        env: {
          ...process.env,
          PATH: "",
          CODELINK_CODEX_BIN: process.execPath,
        },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(result.stdout);
    expect(summary).toMatchObject({
      ok: false,
      installMode: "prebuilt",
      runtime: { valid: true },
      codexCapabilities: { plugin: false, appServer: false },
    });
    expect(summary.diagnostics.map(({ code }) => code)).toContain(
      "E_CODEX_PLUGIN_UNSUPPORTED",
    );
    expect(summary.nodeVersion).toMatch(/^v\d+/);
    expect(summary.codexVersion).toBeTruthy();
    if (summary.npm.available) expect(summary.npm.version).toMatch(/^\d+\./);
  });
});
