import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  codexNativeCandidates,
  findCommandOnPath,
  parseSetupArgs,
  platformSupport,
  resolveCodexExecutable,
  resolveNpmInvocation,
  serviceInstaller,
} from "../scripts/setup-lib.mjs";
import { renderLaunchAgent } from "../scripts/render-launch-agent.mjs";

const hasSh = spawnSync("sh", ["-c", "exit 0"], {
  stdio: "ignore",
}).status === 0;

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
    expect(parseSetupArgs(["--dry-run", "--no-login", "--no-service"])).toEqual(
      { dryRun: true, login: false, service: false, help: false },
    );
  });
});

describe("小白安装契约", () => {
  it("要求先启用微信 ClawBot，并在主会话直接展示二维码图片", () => {
    const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
    const read = (name) => fs.readFileSync(path.join(repoRoot, name), "utf8");
    const readme = read("README.md");
    const install = read("INSTALL.md");
    const prompt = read("INSTALL_PROMPT.md");

    for (const document of [readme, install, prompt]) {
      expect(document).toContain("微信 ClawBot");
      expect(document).toContain("主会话");
    }
    expect(install).toContain("不能只打印文件路径");
    expect(prompt).toContain("不要把图片藏在需要展开的执行过程里");
  });
});

describe("Codex 可执行文件解析", () => {
  it("按 Windows PATHEXT 找到 codex.cmd", () => {
    const existing = new Set(["C:\\Tools\\codex.cmd"]);
    expect(
      findCommandOnPath("codex", {
        platform: "win32",
        env: { PATH: "C:\\Tools", PATHEXT: ".EXE;.CMD" },
        exists: (candidate) => existing.has(candidate),
      }),
    ).toBe("C:\\Tools\\codex.cmd");
  });

  it("从 npm 的 Windows wrapper 推导原生 codex.exe", () => {
    const candidates = codexNativeCandidates(
      "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
      {
        platform: "win32",
        arch: "x64",
        realpath: (value) => value,
      },
    );
    expect(candidates).toContain(
      "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe",
    );
  });

  it("为 Windows 后台服务返回原生 codex.exe 而不是 cmd wrapper", () => {
    const wrapper = "C:\\Tools\\codex.cmd";
    const native =
      "C:\\Tools\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe";
    const existing = new Set([wrapper, native]);
    expect(
      resolveCodexExecutable({
        platform: "win32",
        arch: "x64",
        env: { PATH: "C:\\Tools", PATHEXT: ".EXE;.CMD" },
        exists: (candidate) => existing.has(candidate),
        realpath: (value) => value,
      }),
    ).toBe(native);
  });

  it("不把缺少原生包的 npm JavaScript wrapper 写入后台服务", () => {
    const wrapper = "/tools/codex";
    expect(() =>
      resolveCodexExecutable({
        platform: "linux",
        arch: "x64",
        env: { PATH: "/tools" },
        exists: (candidate) => candidate === wrapper,
        realpath: (candidate) =>
          candidate === wrapper
            ? "/packages/@openai/codex/bin/codex.js"
            : candidate,
      }),
    ).toThrow("原生二进制");
  });
});

describe("npm 调用解析", () => {
  it("在 Windows 通过 node 直接执行带空格路径旁的 npm-cli.js", () => {
    const node = "C:\\Program Files\\nodejs\\node.exe";
    const wrapper = "C:\\Program Files\\nodejs\\npm.cmd";
    const npmCli =
      "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
    const existing = new Set([node, wrapper, npmCli]);

    expect(
      resolveNpmInvocation({
        platform: "win32",
        env: {
          PATH: "C:\\Program Files\\nodejs",
          PATHEXT: ".EXE;.CMD",
        },
        processExecPath: node,
        exists: (candidate) => existing.has(candidate),
      }),
    ).toEqual({ command: node, argsPrefix: [npmCli] });
  });
});

describe("安装脚本语法", () => {
  it.each([
    "setup.sh",
    "install-launch-agent.sh",
    "uninstall-launch-agent.sh",
    "install-systemd-user.sh",
    "uninstall-systemd-user.sh",
    "start-mcp.sh",
  ])("%s 在 sh 可用时通过 sh -n", (script) => {
    if (!hasSh) return;
    const scriptPath = path.resolve("scripts", script);
    const result = spawnSync("sh", ["-n", scriptPath], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("在可用时用 PowerShell parser 校验 ps1，不注册任务", () => {
    const shell = ["pwsh", "powershell.exe"].find((candidate) => {
      const probe = spawnSync(
        candidate,
        ["-NoProfile", "-Command", "$PSVersionTable.PSVersion"],
        { stdio: "ignore" },
      );
      return probe.status === 0;
    });
    if (!shell) return;

    for (const script of [
      "install-scheduled-task.ps1",
      "uninstall-scheduled-task.ps1",
    ]) {
      const scriptPath = path.resolve(
        import.meta.dirname,
        "..",
        "scripts",
        script,
      );
      const command = [
        "$errors = $null",
        `[void][System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replaceAll("'", "''")}', [ref]$null, [ref]$errors)`,
        "if ($errors.Count -gt 0) { $errors | Out-String | Write-Error; exit 1 }",
      ].join("; ");
      const result = spawnSync(shell, ["-NoProfile", "-Command", command], {
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    }
  });
});
