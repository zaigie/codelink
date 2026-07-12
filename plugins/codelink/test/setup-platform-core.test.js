import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  codexNativeCandidates,
  classifyPortResponse,
  classifyPortError,
  findCommandOnPath,
  installRuntimeArtifacts,
  installationFailure,
  normalizeInstallationError,
  parseSetupArgs,
  platformSupport,
  resolveCodexExecutable,
  resolveNpmInvocation,
  serviceInstaller,
  validateRuntimeArtifacts,
} from "../scripts/setup-lib.mjs";
import { renderLaunchAgent } from "../scripts/render-launch-agent.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function hasSh() {
  return (
    spawnSync("sh", ["-c", "exit 0"], {
      stdio: "ignore",
    }).status === 0
  );
}

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
    expect(
      summary.diagnostics.map(({ code }) => code),
    ).toContain(
      "E_CODEX_PLUGIN_UNSUPPORTED",
    );
    expect(summary.nodeVersion).toMatch(/^v\d+/);
    expect(summary.codexVersion).toBeTruthy();
    if (summary.npm.available) expect(summary.npm.version).toMatch(/^\d+\./);
  });
});

describe("端口预检", () => {
  it("区分现有 CodeLink 和占用同端口的未知服务", () => {
    expect(
      classifyPortResponse(200, JSON.stringify({ service: "codelink", ok: true })),
    ).toBe("codelink");
    expect(classifyPortResponse(503, JSON.stringify({ ok: false }))).toBe(
      "codelink",
    );
    expect(classifyPortResponse(200, "<html>other service</html>")).toBe(
      "occupied",
    );
  });

  it("服务重启期间的连接重置是可重试状态，不误报端口占用", () => {
    expect(classifyPortError("ECONNREFUSED")).toBe("available");
    expect(classifyPortError("ECONNRESET")).toBe("transient");
    expect(classifyPortError("ETIMEDOUT")).toBe("transient");
  });
});

describe("预构建运行时", () => {
  it("校验清单中的两个运行时文件并拒绝被篡改的内容", () => {
    const pluginDir = fs.mkdtempSync(path.join(testDir, "runtime-"));
    try {
      const distDir = path.join(pluginDir, "dist");
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, "cli.cjs"), "cli");
      fs.writeFileSync(path.join(distDir, "mcp.js"), "mcp");
      fs.writeFileSync(
        path.join(distDir, "runtime-manifest.json"),
        JSON.stringify({
          schemaVersion: 1,
          files: {
            "cli.cjs":
              "99bb88401742848e032fd6f51709415fb6be169a72d2e5d7fc44289255160d3c",
            "mcp.js":
              "10182ab855ff772753c05b2fea333666b5f312835d32936b6b03e08ef2cbd6d3",
          },
        }),
      );

      expect(validateRuntimeArtifacts(pluginDir)).toMatchObject({ valid: true });
      fs.writeFileSync(path.join(distDir, "cli.cjs"), "changed");
      expect(validateRuntimeArtifacts(pluginDir)).toMatchObject({
        valid: false,
        code: "E_RUNTIME_HASH_MISMATCH",
      });
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  it("无服务安装也复制最小运行时，并保留已有用户状态", () => {
    const root = fs.mkdtempSync(path.join(testDir, "install-"));
    try {
      const pluginDir = path.join(root, "plugin");
      const stateDir = path.join(root, "state");
      fs.mkdirSync(path.join(pluginDir, "dist"), { recursive: true });
      fs.mkdirSync(stateDir, { recursive: true, mode: 0o755 });
      if (process.platform !== "win32") fs.chmodSync(stateDir, 0o755);
      for (const [name, content] of [
        ["cli.cjs", "cli"],
        ["mcp.js", "mcp"],
        ["runtime-manifest.json", "manifest"],
      ]) {
        fs.writeFileSync(path.join(pluginDir, "dist", name), content);
      }
      fs.writeFileSync(path.join(stateDir, "weixin-session.json"), "session");

      installRuntimeArtifacts(pluginDir, stateDir);

      expect(fs.readFileSync(path.join(stateDir, "runtime", "cli.cjs"), "utf8"))
        .toBe("cli");
      expect(fs.readFileSync(path.join(stateDir, "runtime", "mcp.js"), "utf8"))
        .toBe("mcp");
      expect(fs.readFileSync(path.join(stateDir, "weixin-session.json"), "utf8"))
        .toBe("session");
      if (process.platform !== "win32") {
        expect(fs.statSync(stateDir).mode & 0o777).toBe(0o700);
        expect(fs.statSync(path.join(stateDir, "runtime")).mode & 0o777).toBe(
          0o700,
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("安装失败摘要", () => {
  it("包含稳定错误码、失败命令和可执行下一步", () => {
    expect(
      installationFailure({
        code: "E_PLUGIN_INSTALL_FAILED",
        command: "/Applications/Codex/codex",
        status: 7,
        nextStep: "请新建任务后重试插件安装。",
      }).message,
    ).toBe(
      "E_PLUGIN_INSTALL_FAILED：codex 执行失败（退出码 7）。请新建任务后重试插件安装。",
    );
  });

  it("为未分类异常补充通用错误码，同时保留已有稳定错误码", () => {
    expect(normalizeInstallationError(new Error("spawn failed")).message).toBe(
      "E_INSTALL_UNEXPECTED：spawn failed。请检查安装日志和 INSTALL.md 后重试。",
    );
    expect(
      normalizeInstallationError(
        new Error("E_PORT_OCCUPIED：端口被占用；请释放端口。"),
      ).message,
    ).toBe("E_PORT_OCCUPIED：端口被占用；请释放端口。");
  });
});

