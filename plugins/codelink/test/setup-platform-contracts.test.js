import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function hasSh() {
  return (
    spawnSync("sh", ["-c", "exit 0"], {
      stdio: "ignore",
    }).status === 0
  );
}

describe("小白安装契约", () => {
  it("要求先启用微信 ClawBot，并在主会话直接展示二维码图片", () => {
    const repoRoot = path.resolve(testDir, "..", "..", "..");
    const read = (name) =>
      fs.readFileSync(path.join(repoRoot, name), "utf8");
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
    const repoRoot = path.resolve(testDir, "..", "..", "..");
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

  it("面向用户的目录说明不把 POSIX home 简写当作跨平台路径", () => {
    const repoRoot = path.resolve(testDir, "..", "..", "..");
    const userFacingFiles = [
      "README.md",
      "INSTALL.md",
      "docs/CAPABILITY_BOUNDARY.md",
      "docs/architecture.md",
      "plugins/codelink/.codex-plugin/plugin.json",
      "plugins/codelink/.mcp.json",
      "plugins/codelink/skills/wechat-codelink/SKILL.md",
    ];

    for (const name of userFacingFiles) {
      const content = fs.readFileSync(path.join(repoRoot, name), "utf8");
      expect(content, name).not.toContain("~/.codelink");
      expect(content, name).not.toContain("~/Documents/Codex/CodeLink");
      expect(content, name).not.toMatch(/\/Users\/|[A-Za-z]:\\Users\\/);
    }

    const skill = fs.readFileSync(
      path.join(
        repoRoot,
        "plugins",
        "codelink",
        "skills",
        "wechat-codelink",
        "SKILL.md",
      ),
      "utf8",
    );
    expect(skill).toContain("POSIX");
    expect(skill).toContain("PowerShell");

    const migration = fs.readFileSync(
      path.join(repoRoot, "docs", "OPENCLAW_MIGRATION.md"),
      "utf8",
    );
    expect(migration).not.toContain("~/.openclaw");
    expect(migration).toContain("Windows PowerShell");
  });

  it("工具缺失回退不依赖裸 Node，也不循环要求新建任务", () => {
    const repoRoot = path.resolve(testDir, "..", "..", "..");
    const skill = fs.readFileSync(
      path.join(
        repoRoot,
        "plugins",
        "codelink",
        "skills",
        "wechat-codelink",
        "SKILL.md",
      ),
      "utf8",
    );

    expect(skill).not.toContain('node "$STATE_DIR/runtime/cli.cjs" doctor');
    expect(skill).toContain("不要重复建议新建任务");
    expect(skill).toContain("http://127.0.0.1:18791/healthz");
  });

  it("CI 明确检查 macOS/Linux 的 x64 与 arm64 依赖解析", () => {
    const repoRoot = path.resolve(testDir, "..", "..", "..");
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

describe("安装脚本语法", () => {
  it.each([
    "setup.sh",
    "install-launch-agent.sh",
    "uninstall-launch-agent.sh",
    "install-systemd-user.sh",
    "uninstall-systemd-user.sh",
    "start-mcp.sh",
  ])("%s 在 sh 可用时通过 sh -n", (script) => {
    if (!hasSh()) return;
    const scriptPath = path.resolve("scripts", script);
    const result = spawnSync("sh", ["-n", scriptPath], {
      cwd: path.resolve(testDir, ".."),
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
        testDir,
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
  }, 20_000);
});
