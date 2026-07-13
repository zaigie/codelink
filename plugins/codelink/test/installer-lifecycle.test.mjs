import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  MARKETPLACE_ABSENT_ERROR,
  uninstallLifecycle,
} from "../scripts/uninstall-lib.mjs";
import { serviceUninstaller } from "../scripts/setup-lib.mjs";

const cleanup = [];

afterEach(() => {
  for (const directory of cleanup.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("共享卸载生命周期", () => {
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

  it("严格按 stop、plugin、marketplace、cleanup 执行", () => {
    const calls = [];

    uninstallLifecycle({
      runServicePhase(phase) {
        calls.push(`service:${phase}`);
        return success();
      },
      runCodex(args) {
        calls.push(`codex:${args.join(" ")}`);
        return success();
      },
    });

    expect(calls).toEqual([
      "service:stop",
      "codex:plugin remove codelink@codelink-local --json",
      "codex:plugin marketplace remove codelink-local --json",
      "service:cleanup",
    ]);
  });

  it("按稳定错误标志把 marketplace absent 当作幂等成功", () => {
    let installed = true;
    let cleanupCount = 0;
    const run = () =>
      uninstallLifecycle({
        runServicePhase(phase) {
          if (phase === "cleanup") cleanupCount += 1;
          return success();
        },
        runCodex(args) {
          if (args[1] === "remove") return success();
          if (installed) {
            installed = false;
            return success();
          }
          return failure(MARKETPLACE_ABSENT_ERROR);
        },
      });

    expect(run).not.toThrow();
    expect(run).not.toThrow();
    expect(cleanupCount).toBe(2);

    // 版本间措辞轻微变化（如结尾标点）仍按 absent 处理。
    expect(() =>
      uninstallLifecycle({
        runServicePhase: () => success(),
        runCodex(args) {
          return args[1] === "remove"
            ? success()
            : failure(`${MARKETPLACE_ABSENT_ERROR}.`);
        },
      }),
    ).not.toThrow();

    // 不含 absent 标志的真实错误仍然 fail-closed。
    expect(() =>
      uninstallLifecycle({
        runServicePhase: () => success(),
        runCodex(args) {
          return args[1] === "remove"
            ? success()
            : failure("Error: permission denied while removing marketplace");
        },
      }),
    ).toThrow("移除 CodeLink marketplace");
  });

  it("没有可用 Codex 时仍停止服务并清理 runtime，只跳过插件步骤", () => {
    const calls = [];
    const skipped = [];

    uninstallLifecycle({
      runServicePhase(phase) {
        calls.push(`service:${phase}`);
        return success();
      },
      onSkip(step) {
        skipped.push(step);
      },
    });

    expect(calls).toEqual(["service:stop", "service:cleanup"]);
    expect(skipped).toEqual(["移除 CodeLink 插件与 marketplace"]);
  });

  it.each([
    ["stop", ["service:stop"]],
    ["plugin", ["service:stop", "codex:plugin"]],
    ["marketplace", ["service:stop", "codex:plugin", "codex:marketplace"]],
    [
      "cleanup",
      ["service:stop", "codex:plugin", "codex:marketplace", "service:cleanup"],
    ],
  ])("%s 真实失败后不执行后续步骤", (failureAt, expectedCalls) => {
    const calls = [];

    expect(() =>
      uninstallLifecycle({
        runServicePhase(phase) {
          calls.push(`service:${phase}`);
          return failureAt === phase ? failure("real service error") : success();
        },
        runCodex(args) {
          const step = args[1] === "remove" ? "plugin" : "marketplace";
          calls.push(`codex:${step}`);
          return failureAt === step ? failure(`real ${step} error`) : success();
        },
      }),
    ).toThrow("real");
    expect(calls).toEqual(expectedCalls);
  });

  it(
    "macOS 重复卸载保留 state，并对真实 stop 失败保持现场",
    () => {
      const fixture = createMacFixture();

      expectSuccess(fixture.run());
      expect(fs.existsSync(fixture.plistPath)).toBe(false);
      expect(fs.existsSync(fixture.runtimeDir)).toBe(false);
      expect(fs.readFileSync(fixture.sessionPath, "utf8")).toBe(
        "session-state\n",
      );

      expectSuccess(fixture.run());
      expect(fs.readFileSync(fixture.sessionPath, "utf8")).toBe(
        "session-state\n",
      );
      expect(
        fs.readFileSync(fixture.commandLog, "utf8").trim().split("\n"),
      ).toEqual([
        "service:bootout",
        "codex:plugin remove codelink@codelink-local --json",
        "codex:plugin marketplace remove codelink-local --json",
        "service:bootout",
        "codex:plugin remove codelink@codelink-local --json",
        "codex:plugin marketplace remove codelink-local --json",
      ]);

      fixture.resetArtifacts();
      const failed = fixture.run({
        FAKE_SERVICE_FAILURE: "permission-denied",
      });
      expect(failed.status).not.toBe(0);
      expect(failed.stderr).toContain("Operation not permitted");
      expect(fs.existsSync(fixture.plistPath)).toBe(true);
      expect(fs.existsSync(fixture.runtimeDir)).toBe(true);
      expect(fs.readFileSync(fixture.sessionPath, "utf8")).toBe(
        "session-state\n",
      );

      fixture.resetArtifacts();
      const nearAbsent = fixture.run({
        FAKE_SERVICE_FAILURE: "near-absent",
      });
      // launchctl 的 absent 判定按「No such process」标志容忍措辞漂移。
      expect(nearAbsent.status).toBe(0);
      expect(fs.existsSync(fixture.plistPath)).toBe(false);
      expect(fs.existsSync(fixture.runtimeDir)).toBe(false);
    },
    15_000,
  );
});

function createMacFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-lifecycle-"));
  cleanup.push(root);
  const home = path.join(root, "home & <owner>");
  const stateDir = path.join(home, ".codelink");
  const runtimeDir = path.join(stateDir, "runtime");
  const sessionPath = path.join(stateDir, "weixin-session.json");
  const plistPath = path.join(
    home,
    "Library",
    "LaunchAgents",
    "ai.codelink.daemon.plist",
  );
  const fakeBin = path.join(root, "bin & tools");
  const codexBin = path.join(fakeBin, "codex");
  const commandLog = path.join(root, "commands.log");
  const serviceState = path.join(root, "service-running");
  const marketplaceState = path.join(root, "marketplace-installed");

  fs.mkdirSync(fakeBin, { recursive: true });
  writeExecutable(
    path.join(fakeBin, "launchctl"),
    [
      'printf "service:%s\\n" "${1:-}" >> "$TEST_COMMAND_LOG"',
      'if [ "${FAKE_SERVICE_FAILURE:-}" = "permission-denied" ]; then',
      "  echo 'Boot-out failed: 1: Operation not permitted' >&2",
      "  exit 1",
      "fi",
      'if [ "${FAKE_SERVICE_FAILURE:-}" = "near-absent" ]; then',
      "  echo 'Boot-out failed: 3: No such process (unexpected)' >&2",
      "  exit 3",
      "fi",
      'if [ -f "$FAKE_SERVICE_STATE" ]; then',
      '  rm -f "$FAKE_SERVICE_STATE"',
      "  exit 0",
      "fi",
      "echo 'Boot-out failed: 3: No such process' >&2",
      "exit 3",
    ].join("\n"),
  );
  writeExecutable(
    codexBin,
    [
      'printf "codex:%s\\n" "$*" >> "$TEST_COMMAND_LOG"',
      'if [ "$1 $2" = "plugin remove" ]; then exit 0; fi',
      'if [ "$1 $2 $3" = "plugin marketplace remove" ]; then',
      '  if [ -f "$FAKE_MARKETPLACE_STATE" ]; then',
      '    rm -f "$FAKE_MARKETPLACE_STATE"',
      "    exit 0",
      "  fi",
      `  echo '${MARKETPLACE_ABSENT_ERROR}' >&2`,
      "  exit 1",
      "fi",
      'echo "unexpected codex command: $*" >&2',
      "exit 9",
    ].join("\n"),
  );

  const resetArtifacts = () => {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, "cli.cjs"), "runtime\n");
    fs.writeFileSync(sessionPath, "session-state\n");
    fs.writeFileSync(plistPath, "installed\n");
    fs.writeFileSync(serviceState, "running\n");
    fs.writeFileSync(marketplaceState, "installed\n");
  };
  resetArtifacts();

  const baseEnv = {
    ...process.env,
    HOME: home,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`,
    CODELINK_CODEX_BIN: codexBin,
    CODELINK_NODE_BIN: process.execPath,
    CODELINK_STATE_DIR: stateDir,
    FAKE_MARKETPLACE_STATE: marketplaceState,
    FAKE_SERVICE_STATE: serviceState,
    TEST_COMMAND_LOG: commandLog,
  };

  return {
    commandLog,
    plistPath,
    resetArtifacts,
    runtimeDir,
    sessionPath,
    run(extraEnv = {}) {
      return spawnSync(path.resolve("scripts/uninstall-launch-agent.sh"), [], {
        cwd: path.resolve(import.meta.dirname, ".."),
        encoding: "utf8",
        env: { ...baseEnv, ...extraEnv },
      });
    },
  };
}

function success(stdout = "") {
  return { status: 0, stdout, stderr: "" };
}

function failure(stderr) {
  return { status: 1, stdout: "", stderr };
}

function expectSuccess(result) {
  expect(
    result.status,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  ).toBe(0);
}

function writeExecutable(destination, body) {
  fs.writeFileSync(destination, `#!/bin/sh\nset -eu\n${body}\n`, {
    mode: 0o755,
  });
}
