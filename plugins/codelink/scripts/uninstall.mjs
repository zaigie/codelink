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
  const codexBin = resolveCodexExecutable({ platform });
  const uninstaller = serviceUninstaller(platform, SCRIPT_DIR);
  const env = {
    ...process.env,
    CODELINK_CODEX_BIN: codexBin,
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
    runCodex: (commandArgs) => run(codexBin, commandArgs),
  });

  const stateDir = process.env.CODELINK_STATE_DIR?.trim() || "~/.codelink";
  process.stdout.write(
    `CodeLink 插件、marketplace、后台服务和 runtime 已卸载；状态保留在 ${stateDir}\n`,
  );
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
