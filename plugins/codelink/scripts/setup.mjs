#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  parseSetupArgs,
  platformSupport,
  resolveCodexExecutable,
  resolveNpmInvocation,
  serviceInstaller,
} from "./setup-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.dirname(SCRIPT_DIR);
const REPO_ROOT = path.resolve(PLUGIN_DIR, "..", "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} 执行失败（退出码 ${result.status}）。`);
  }
}

async function waitForHealth(cliPath, stateDir, attempts = 50) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (statusIsReady(cliPath, stateDir)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("后台服务未就绪。请按 INSTALL.md 中对应系统的方式检查日志。");
}

export function statusIsReady(cliPath, stateDir, options = {}) {
  const spawn = options.spawnSync ?? spawnSync;
  const result = spawn(options.nodePath ?? process.execPath, [cliPath, "status"], {
    cwd: path.dirname(cliPath),
    env: {
      ...(options.env ?? process.env),
      CODELINK_STATE_DIR: stateDir,
    },
    stdio: "ignore",
  });
  return !result.error && result.status === 0;
}

function helpText() {
  return (
    `CodeLink 跨平台安装器\n\n` +
    `用法：node scripts/setup.mjs [选项]\n\n` +
    `  --dry-run     只检查平台、Node、Codex 和安装路线\n` +
    `  --no-login    跳过微信扫码（已有 session 或仅开发时使用）\n` +
    `  --no-service  不注册常驻服务\n` +
    `  -h, --help    显示帮助\n`
  );
}

export async function main(args = process.argv.slice(2)) {
  const options = parseSetupArgs(args);
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const target = platformSupport(process.platform, process.arch);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) {
    throw new Error(`需要 Node.js 22+，当前为 ${process.version}。`);
  }

  const codexBin = resolveCodexExecutable();
  const npm = resolveNpmInvocation();
  if (!npm) throw new Error("未找到 npm；请安装包含 npm 的 Node.js 22+。 ");
  const installer = serviceInstaller(process.platform, SCRIPT_DIR);

  if (options.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          platform: process.platform,
          arch: process.arch,
          codexTarget: target.targetTriple,
          node: process.execPath,
          codex: codexBin,
          service: options.service ? installer.name : "disabled",
          source: REPO_ROOT,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write("[1/5] 安装锁定依赖并构建 CodeLink\n");
  run(npm.command, [...npm.argsPrefix, "ci"], { cwd: PLUGIN_DIR });
  run(npm.command, [...npm.argsPrefix, "run", "build"], {
    cwd: PLUGIN_DIR,
  });

  process.stdout.write("[2/5] 安装 Codex 插件\n");
  run(codexBin, ["plugin", "marketplace", "add", REPO_ROOT]);
  run(codexBin, ["plugin", "add", "codelink@codelink-local"]);

  const stateDir =
    process.env.CODELINK_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".codelink");
  const sessionPath = path.join(stateDir, "weixin-session.json");
  const runtimeCli = path.join(PLUGIN_DIR, "dist", "cli.cjs");
  process.stdout.write("[3/5] 登录微信\n");
  if (!options.login) {
    process.stdout.write("已按 --no-login 跳过。\n");
  } else if (fs.existsSync(sessionPath)) {
    process.stdout.write(
      "检测到已有 CodeLink 微信会话，跳过扫码；需要换号时运行 codelink login。\n",
    );
  } else {
    run(process.execPath, [runtimeCli, "login"], {
      cwd: PLUGIN_DIR,
    });
  }

  process.stdout.write("[4/5] 安装并启动后台服务\n");
  if (!options.service) {
    process.stdout.write(
      `已按 --no-service 跳过；可前台运行：node ${path.join(
        PLUGIN_DIR,
        "dist",
        "cli.cjs",
      )} daemon\n`,
    );
  } else {
    run(installer.command, installer.args, {
      cwd: PLUGIN_DIR,
      env: {
        ...process.env,
        CODELINK_CODEX_BIN: codexBin,
        CODELINK_NODE_BIN: process.execPath,
      },
    });
  }

  process.stdout.write("[5/5] 验证后台服务\n");
  if (options.service) await waitForHealth(runtimeCli, stateDir);
  else process.stdout.write("未注册服务，跳过健康检查。\n");

  process.stdout.write(
    "CodeLink 安装完成。请新建一个 Codex 任务加载插件，再从微信发送 /status。\n",
  );
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
