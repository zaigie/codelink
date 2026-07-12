import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
    const pluginRoot = path.resolve(import.meta.dirname, "..");
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
    const pluginDir = fs.mkdtempSync(path.join(import.meta.dirname, "runtime-"));
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
    const root = fs.mkdtempSync(path.join(import.meta.dirname, "install-"));
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
    expect(prompt).toContain(
      "https://github.com/zaigie/codelink/blob/main/INSTALL.md",
    );
  });

  it("把历史工程经验固化为仓库级开发约定", () => {
    const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
    const agents = fs.readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");

    for (const rule of [
      "纵向红绿切片",
      "保留 `~/.codelink`",
      "update_plugin_cachebuster.py",
      "重新安装 `codelink@codelink-local`",
      "新建 Codex 任务",
    ]) {
      expect(agents).toContain(rule);
    }
  });

  it("CI 明确检查 macOS/Linux 的 x64 与 arm64 依赖解析", () => {
    const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
    const workflow = fs.readFileSync(
      path.join(repoRoot, ".github", "workflows", "ci.yml"),
      "utf8",
    );

    for (const value of ["dependency-resolution", "darwin", "linux", "x64", "arm64"]) {
      expect(workflow).toContain(value);
    }
    expect(workflow).toContain("npm_config_os");
    expect(workflow).toContain("npm_config_cpu");
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
  it("允许只有 Node、没有 npm 的 Codex 内置运行时", () => {
    expect(
      resolveNpmInvocation({
        platform: "darwin",
        env: { PATH: "" },
        processExecPath: "/codex-runtime/bin/node",
        exists: (candidate) => candidate === "/codex-runtime/bin/node",
      }),
    ).toBeNull();
  });

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
