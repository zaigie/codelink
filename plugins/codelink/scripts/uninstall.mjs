#!/usr/bin/env node

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  resolveCodexExecutable,
  serviceUninstaller,
} from "./setup-lib.mjs";
import { uninstallLifecycle } from "./uninstall-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.dirname(SCRIPT_DIR);

export function main(args = process.argv.slice(2)) {
  const platform = parsePlatform(args);
  const uninstaller = serviceUninstaller(platform, SCRIPT_DIR);
  // 卸载不得被 Codex 可执行文件阻塞：用户可能已先卸载 Codex，
  // 此时仍必须停止后台服务并清理 runtime，只跳过插件/marketplace 移除。
  let codexBin;
  try {
    codexBin = resolveCodexExecutable({ platform });
  } catch (error) {
    process.stderr.write(
      `未找到可用的 Codex 可执行文件：${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  const env = {
    ...process.env,
    ...(codexBin ? { CODELINK_CODEX_BIN: codexBin } : {}),
    CODELINK_NODE_BIN: process.execPath,
  };
  const run = (command, commandArgs) =>
    spawnSync(command, commandArgs, {
      cwd: PLUGIN_DIR,
      encoding: "utf8",
      env,
    });

  uninstallLifecycle({
    runServicePhase: (phase) =>
      run(uninstaller.command, uninstaller.argsForPhase(phase)),
    ...(codexBin
      ? { runCodex: (commandArgs) => run(codexBin, commandArgs) }
      : {}),
    onSkip: (step) =>
      process.stderr.write(
        `跳过「${step}」：Codex 不可用；如需清理插件注册，重装 Codex 后重新运行卸载。\n`,
      ),
  });

  const stateDir = process.env.CODELINK_STATE_DIR?.trim() || "~/.codelink";
  const codexScope = codexBin
    ? "插件、marketplace、后台服务和 runtime 已卸载"
    : "后台服务和 runtime 已卸载（插件与 marketplace 步骤已跳过）";
  process.stdout.write(`CodeLink ${codexScope}；状态保留在 ${stateDir}\n`);
}

function parsePlatform(args) {
  if (args.length === 0) return process.platform;
  if (args.length === 2 && args[0] === "--platform") return args[1];
  throw new Error(`未知卸载参数：${args.join(" ")}`);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
