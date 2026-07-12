import fs from "node:fs";
import os from "node:os";
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
  serviceUninstaller,
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

  it("为三个系统选择共享生命周期使用的卸载适配器", () => {
    expect(
      serviceUninstaller("darwin", "/scripts").argsForPhase("stop"),
    ).toEqual(["/scripts/uninstall-launch-agent.sh", "--service-stop"]);
    expect(
      serviceUninstaller("linux", "/scripts").argsForPhase("cleanup"),
    ).toEqual(["/scripts/uninstall-systemd-user.sh", "--service-cleanup"]);
    expect(
      serviceUninstaller("win32", "C:\\scripts", {
        SystemRoot: "C:\\Windows",
      }).argsForPhase("stop"),
    ).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\scripts\\uninstall-scheduled-task.ps1",
      "-Phase",
      "stop",
    ]);
  });

  it("完整 LaunchAgent 对特殊路径做 XML 回环并通过 plutil", () => {
    const template = fs.readFileSync(
      path.resolve("scripts/launch-agent.plist.template"),
      "utf8",
    );
    const codexBin = '/Applications/Code & <Tool>/"Codex"\'/codex';
    const rendered = renderLaunchAgent(
      template,
      {
        LABEL: "ai.codelink.daemon",
        NODE_BIN: '/Users/A&B/<node>/"runtime"\'/node',
        CODEX_BIN: codexBin,
        CLI_PATH: '/Users/A&B/<state>/runtime/"cli"\'/cli.cjs',
        WORKDIR: '/Users/A&B/<state>/runtime',
        LOG_DIR: '/Users/A&B/<logs>/"daemon"\'',
        STATE_DIR: '/Users/A&B/<state>/"owner"\'',
      },
    );
    expect(rendered).not.toContain("__CODEX_BIN__");
    expect(rendered).toContain(
      "/Applications/Code &amp; &lt;Tool&gt;/&quot;Codex&quot;&apos;/codex",
    );

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-plist-"));
    const plistPath = path.join(directory, "ai.codelink.daemon.plist");
    try {
      fs.writeFileSync(plistPath, rendered);
      const lint = spawnSync("plutil", ["-lint", plistPath], {
        encoding: "utf8",
      });
      if (lint.error?.code !== "ENOENT") {
        expect(lint.stderr).toBe("");
        expect(lint.status).toBe(0);
        const extracted = spawnSync(
          "plutil",
          [
            "-extract",
            "EnvironmentVariables.CODELINK_CODEX_BIN",
            "raw",
            "-o",
            "-",
            plistPath,
          ],
          { encoding: "utf8" },
        );
        expect(extracted.status).toBe(0);
        expect(extracted.stdout.trim()).toBe(codexBin);
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
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
  it("把标准 PATH 与相对 override 都规范化为可执行绝对路径", () => {
    const existing = new Set([
      "tools/codex",
      "relative/codex",
      "/repo/tools/codex",
      "/repo/relative/codex",
    ]);
    const realpath = (candidate) =>
      candidate.startsWith("/") ? candidate : `/repo/${candidate}`;
    const isExecutable = (candidate) => existing.has(candidate);

    expect(
      resolveCodexExecutable({
        platform: "linux",
        arch: "x64",
        env: { PATH: "tools" },
        cwd: "/repo",
        exists: (candidate) => existing.has(candidate),
        realpath,
        isExecutable,
      }),
    ).toBe("/repo/tools/codex");
    expect(
      resolveCodexExecutable({
        platform: "linux",
        arch: "x64",
        env: { CODELINK_CODEX_BIN: "relative/codex" },
        cwd: "/repo",
        exists: (candidate) => existing.has(candidate),
        realpath,
        isExecutable,
      }),
    ).toBe("/repo/relative/codex");
  });

  it("拒绝存在但不可执行的 Codex 文件", () => {
    expect(() =>
      resolveCodexExecutable({
        platform: "linux",
        arch: "x64",
        env: { CODELINK_CODEX_BIN: "/tools/codex" },
        exists: () => true,
        realpath: (candidate) => candidate,
        isExecutable: () => false,
      }),
    ).toThrow("不可执行");
  });

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
        isExecutable: (candidate) => existing.has(candidate),
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
  it("systemd unit 对含空格、引号和百分号的路径保持原值", () => {
    if (!hasSh) return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-systemd-"));
    try {
      const pluginRoot = path.join(root, 'plugin & <bundle> "quoted"');
      const scriptsDir = path.join(pluginRoot, "scripts");
      const fakeBin = path.join(root, 'bin % "tools"');
      const stateDir = path.join(root, 'state % "owner"');
      const xdgDir = path.join(root, 'config % "owner"');
      const nodeBin = path.join(fakeBin, 'node % "22"');
      const codexBin = path.join(fakeBin, 'codex % "native"');
      fs.mkdirSync(path.join(pluginRoot, "dist"), { recursive: true });
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.mkdirSync(fakeBin, { recursive: true });
      fs.copyFileSync(
        path.resolve("scripts/install-systemd-user.sh"),
        path.join(scriptsDir, "install-systemd-user.sh"),
      );
      fs.writeFileSync(path.join(pluginRoot, "dist", "cli.cjs"), "runtime\n");
      for (const executable of ["systemctl", nodeBin, codexBin]) {
        const destination = path.isAbsolute(executable)
          ? executable
          : path.join(fakeBin, executable);
        fs.writeFileSync(destination, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      }

      const result = spawnSync(
        "sh",
        [path.join(scriptsDir, "install-systemd-user.sh")],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`,
            CODELINK_CODEX_BIN: codexBin,
            CODELINK_NODE_BIN: nodeBin,
            CODELINK_STATE_DIR: stateDir,
            XDG_CONFIG_HOME: xdgDir,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      const unit = fs.readFileSync(
        path.join(xdgDir, "systemd", "user", "ai.codelink.daemon.service"),
        "utf8",
      );
      expect(unit).toContain(
        `Environment="CODELINK_CODEX_BIN=${systemdEscape(codexBin)}"`,
      );
      expect(unit).toContain(
        `ExecStart="${systemdEscape(nodeBin)}" "${systemdEscape(
          path.join(stateDir, "runtime", "cli.cjs"),
        )}" daemon`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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

function systemdEscape(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%");
}
