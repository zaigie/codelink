#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  classifyPortResponse,
  classifyPortError,
  installRuntimeArtifacts,
  installationFailure,
  normalizeInstallationError,
  parseSetupArgs,
  platformSupport,
  resolveCodexExecutable,
  resolveNpmInvocation,
  serviceInstaller,
  validateRuntimeArtifacts,
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
  if (result.error) {
    throw installationFailure({
      code: "E_COMMAND_START_FAILED",
      command,
      status: "未启动",
      nextStep: options.nextStep ?? "请确认命令路径和执行权限后重试。",
    });
  }
  if (result.status !== 0) {
    throw installationFailure({
      code: options.errorCode ?? "E_COMMAND_FAILED",
      command,
      status: result.status,
      nextStep: options.nextStep ?? "请检查上方日志后重试。",
    });
  }
}

function commandVersion(command, argsPrefix = []) {
  const result = spawnSync(command, [...argsPrefix, "--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return String(result.stdout || result.stderr).trim() || null;
}

async function waitForHealth(port = 18791, attempts = 50) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const probe = await probeInstallationPort(port);
    if (probe.state === "codelink" && probe.ready) return;
    if (probe.state === "occupied") {
      throw new Error(
        `E_PORT_OCCUPIED：127.0.0.1:${port} 被其他服务占用；请释放端口后重试。`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    "E_SERVICE_UNHEALTHY：后台服务未就绪；请按 INSTALL.md 中对应系统的方式检查日志。",
  );
}

function probeInstallationPort(port = 18791) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: "127.0.0.1", port, path: "/healthz", timeout: 1000 },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (body.length < 4096) body += chunk;
        });
        response.on("end", () => {
          const state = classifyPortResponse(response.statusCode, body);
          let ready = false;
          try {
            ready = state === "codelink" && JSON.parse(body).ok === true;
          } catch {
            // Invalid JSON is already classified as another service.
          }
          resolve({ state, ready });
        });
      },
    );
    request.on("error", (error) =>
      resolve({
        state: classifyPortError(error?.code),
        ready: false,
      }),
    );
    request.on("timeout", () => {
      request.destroy();
      resolve({ state: "transient", ready: false });
    });
  });
}

function commandSucceeds(command, args) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

function verifyInstalledMcp(nodeBin, runtimeCli) {
  const result = spawnSync(nodeBin, [runtimeCli, "doctor"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      "E_MCP_DIAGNOSTIC_FAILED：无法运行已安装 runtime 的安全自检；请检查 Node 路径和安装日志后重试。",
    );
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      "E_MCP_DIAGNOSTIC_FAILED：runtime doctor 未返回有效结果；请重新安装后重试。",
    );
  }
  if (report?.mcpEndpointReady !== true) {
    throw new Error(
      "E_MCP_UNHEALTHY：CodeLink MCP endpoint 未就绪；请检查 daemon 日志后重试。",
    );
  }
}

function helpText() {
  return (
    `CodeLink 跨平台安装器\n\n` +
    `用法：node scripts/setup.mjs [选项]\n\n` +
    `  --dry-run     只检查平台、Node、Codex 和安装路线\n` +
    `  --no-login    跳过微信扫码（已有 session 或仅开发时使用）\n` +
    `  --no-service  不注册常驻服务\n` +
    `  --build       开发者模式：使用 npm 重新安装依赖并构建运行时\n` +
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
    throw new Error(
      `E_NODE_UNSUPPORTED：需要 Node.js 22+，当前为 ${process.version}；请改用受支持的 Node 后重试。`,
    );
  }

  let codexBin = null;
  let codexResolutionError = null;
  try {
    codexBin = resolveCodexExecutable();
  } catch (error) {
    codexResolutionError = error;
  }
  const npm = resolveNpmInvocation();
  const npmVersion = npm
    ? commandVersion(npm.command, npm.argsPrefix)
    : null;
  const installer = serviceInstaller(process.platform, SCRIPT_DIR);
  let runtime = validateRuntimeArtifacts(PLUGIN_DIR);
  const stateDir =
    process.env.CODELINK_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".codelink");
  const codexVersion = codexBin ? commandVersion(codexBin) : null;
  const codexCapabilities = {
    plugin: Boolean(codexBin && commandSucceeds(codexBin, ["plugin", "--help"])),
    appServer: Boolean(
      codexBin && commandSucceeds(codexBin, ["app-server", "--help"]),
    ),
  };
  const port = await probeInstallationPort();
  const diagnostics = [];
  if (!codexBin) {
    diagnostics.push({
      code: "E_CODEX_NOT_FOUND",
      message:
        codexResolutionError instanceof Error
          ? codexResolutionError.message
          : "未找到 Codex 原生二进制。",
    });
  } else if (!codexVersion) {
    diagnostics.push({
      code: "E_CODEX_UNUSABLE",
      message: "Codex 二进制存在但无法执行 --version。",
    });
  }
  if (!codexCapabilities.plugin) {
    diagnostics.push({
      code: "E_CODEX_PLUGIN_UNSUPPORTED",
      message: "当前 Codex 不支持 plugin 命令。",
    });
  }
  if (!codexCapabilities.appServer) {
    diagnostics.push({
      code: "E_CODEX_APP_SERVER_UNSUPPORTED",
      message: "当前 Codex 不支持 app-server 命令。",
    });
  }
  if (port.state === "occupied") {
    diagnostics.push({
      code: "E_PORT_OCCUPIED",
      message: "127.0.0.1:18791 已被其他服务占用。",
    });
  }
  if (options.build && (!npm || !npmVersion)) {
    diagnostics.push({
      code: "E_NPM_MISSING",
      message: "--build 需要可执行的 npm。",
    });
  }
  if (!options.build && !runtime.valid) {
    diagnostics.push({
      code: runtime.code,
      message: "官方预构建运行时缺失或校验失败。",
    });
  }

  if (!options.dryRun && options.build && (!npm || !npmVersion)) {
    throw new Error(
      "E_NPM_MISSING：--build 需要 npm；普通安装请去掉 --build 并使用官方预构建运行时。",
    );
  }
  if (!options.dryRun && !options.build && !runtime.valid) {
    throw new Error(
      `${runtime.code}：官方预构建运行时缺失或校验失败；请重新获取官方源码。开发者可使用 --build 重建。`,
    );
  }

  if (options.dryRun) {
    const pluginManifest = JSON.parse(
      fs.readFileSync(
        path.join(PLUGIN_DIR, ".codex-plugin", "plugin.json"),
        "utf8",
      ),
    );
    const codexHome =
      process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
    const installedPluginRoot = path.join(
      codexHome,
      "plugins",
      "cache",
      "codelink-local",
      "codelink",
      pluginManifest.version,
    );
    const ok = diagnostics.length === 0;
    process.stdout.write(
      `${JSON.stringify(
        {
          ok,
          platform: process.platform,
          arch: process.arch,
          codexTarget: target.targetTriple,
          node: process.execPath,
          nodeVersion: process.version,
          npm: {
            available: Boolean(npm && npmVersion),
            ...(npm && npmVersion
              ? {
                  command: npm.command,
                  version: npmVersion,
                }
              : {}),
          },
          codex: codexBin,
          codexVersion,
          codexCapabilities,
          service: options.service ? installer.name : "disabled",
          source: REPO_ROOT,
          installMode: options.build ? "build" : "prebuilt",
          runtime,
          runtimeTarget: path.join(stateDir, "runtime"),
          pluginInstalled: fs.existsSync(installedPluginRoot),
          port: {
            number: 18791,
            state: port.state,
          },
          diagnostics,
        },
        null,
        2,
      )}\n`,
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  if (!codexBin) {
    throw new Error(
      "E_CODEX_NOT_FOUND：未找到 Codex 原生二进制；请安装并登录 Codex，或设置 CODELINK_CODEX_BIN。",
    );
  }
  if (!codexVersion) {
    throw new Error(
      "E_CODEX_UNUSABLE：Codex 二进制无法执行 --version；请修复或更新 Codex 后重试。",
    );
  }
  if (!codexCapabilities.plugin) {
    throw new Error(
      "E_CODEX_PLUGIN_UNSUPPORTED：当前 Codex 不支持 plugin 命令；请更新 Codex 后重试。",
    );
  }
  if (!codexCapabilities.appServer) {
    throw new Error(
      "E_CODEX_APP_SERVER_UNSUPPORTED：当前 Codex 不支持 app-server；请更新 Codex 后重试。",
    );
  }
  if (port.state === "occupied") {
    throw new Error(
      "E_PORT_OCCUPIED：127.0.0.1:18791 被其他服务占用；请释放端口后重试。",
    );
  }

  process.stdout.write("[1/5] 准备 CodeLink 运行时\n");
  if (options.build) {
    process.stdout.write("开发者模式：安装锁定依赖并重新构建。\n");
    run(npm.command, [...npm.argsPrefix, "ci"], {
      cwd: PLUGIN_DIR,
      errorCode: "E_NPM_CI_FAILED",
      nextStep: "请使用仓库指定的 npm 版本检查 package-lock.json。",
    });
    run(npm.command, [...npm.argsPrefix, "run", "build"], {
      cwd: PLUGIN_DIR,
      errorCode: "E_BUILD_FAILED",
      nextStep: "请修复类型或构建错误后重新运行 --build。",
    });
    runtime = validateRuntimeArtifacts(PLUGIN_DIR);
  }
  if (!runtime.valid) {
    throw new Error(
      `${runtime.code}：官方预构建运行时缺失或校验失败；请重新获取官方源码。开发者可使用 --build 重建。`,
    );
  }
  process.stdout.write(
    options.build
      ? "运行时重新构建并校验通过。\n"
      : "预构建运行时校验通过，无需 npm。\n",
  );
  installRuntimeArtifacts(PLUGIN_DIR, stateDir);

  process.stdout.write("[2/5] 安装 Codex 插件\n");
  run(codexBin, ["plugin", "marketplace", "add", REPO_ROOT], {
    errorCode: "E_MARKETPLACE_FAILED",
    nextStep: "请确认当前源码目录可读且 Codex 支持 plugin 命令。",
  });
  run(codexBin, ["plugin", "add", "codelink@codelink-local"], {
    errorCode: "E_PLUGIN_INSTALL_FAILED",
    nextStep: "请检查 codelink-local marketplace 后重试插件安装。",
  });

  const sessionPath = path.join(stateDir, "weixin-session.json");
  const pluginManifest = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_DIR, ".codex-plugin", "plugin.json"), "utf8"),
  );
  const runtimeManifest = JSON.parse(
    fs.readFileSync(
      path.join(PLUGIN_DIR, "dist", "runtime-manifest.json"),
      "utf8",
    ),
  );
  const codexHome =
    process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const pluginRoot = path.join(
    codexHome,
    "plugins",
    "cache",
    "codelink-local",
    "codelink",
    pluginManifest.version,
  );
  if (
    !fs.existsSync(path.join(pluginRoot, ".mcp.json")) ||
    !fs.existsSync(path.join(pluginRoot, "dist", "mcp.js"))
  ) {
    throw new Error(
      "E_PLUGIN_VERIFY_FAILED：Codex 已返回安装成功，但插件缓存或 MCP bundle 不完整；请重新安装 codelink@codelink-local。",
    );
  }
  saveInstallReceipt(stateDir, {
    schemaVersion: 1,
    pluginInstalled: true,
    mcpBundleReady: true,
    pluginRoot,
    pluginVersion: pluginManifest.version,
    mcpSha256: runtimeManifest.files["mcp.js"],
    installedAt: new Date().toISOString(),
  });
  process.stdout.write("[3/5] 登录微信\n");
  if (!options.login) {
    process.stdout.write("已按 --no-login 跳过。\n");
  } else if (fs.existsSync(sessionPath)) {
    process.stdout.write(
      "检测到已有 CodeLink 微信会话，跳过扫码；需要换号时运行 codelink login。\n",
    );
  } else {
    run(
      process.execPath,
      [
        path.join(PLUGIN_DIR, "dist", "cli.cjs"),
        "login",
        "--qr-output",
        "png",
      ],
      {
        cwd: PLUGIN_DIR,
        errorCode: "E_WECHAT_LOGIN_FAILED",
        nextStep: "请确认已启用微信 ClawBot，然后重新运行登录。",
      },
    );
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
      errorCode: "E_SERVICE_INSTALL_FAILED",
      nextStep: "请按 INSTALL.md 检查当前平台的用户态服务状态和日志。",
      env: {
        ...process.env,
        CODELINK_CODEX_BIN: codexBin,
        CODELINK_NODE_BIN: process.execPath,
      },
    });
  }

  process.stdout.write("[5/5] 验证后台服务\n");
  if (options.service) {
    await waitForHealth();
    verifyInstalledMcp(
      process.execPath,
      path.join(stateDir, "runtime", "cli.cjs"),
    );
    process.stdout.write("daemon 与 MCP endpoint 均已就绪。\n");
  } else process.stdout.write("未注册服务，跳过健康检查。\n");

  process.stdout.write(
    `${options.service ? "CodeLink 后台、微信与插件安装已完成。" : "CodeLink 运行时与插件安装已完成；未注册后台服务。"}\n` +
      "下一步：新建一个 Codex 任务加载 CodeLink；如果工具仍未出现，请重启 Codex App。\n" +
      `安全自检：${process.execPath} ${path.join(stateDir, "runtime", "cli.cjs")} doctor\n` +
      "然后在新任务中检查 CodeLink 状态，并从微信发送 /status。\n",
  );
}

function saveInstallReceipt(stateDir, receipt) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const target = path.join(stateDir, "install-receipt.json");
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temp, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Best effort on filesystems without POSIX permissions.
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${normalizeInstallationError(error).message}\n`);
    process.exitCode = 1;
  });
}
