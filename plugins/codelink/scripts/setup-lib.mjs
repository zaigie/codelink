import fs from "node:fs";
import path from "node:path";

const CODEX_TARGETS = {
  "darwin:x64": {
    packageName: "codex-darwin-x64",
    targetTriple: "x86_64-apple-darwin",
    executable: "codex",
  },
  "darwin:arm64": {
    packageName: "codex-darwin-arm64",
    targetTriple: "aarch64-apple-darwin",
    executable: "codex",
  },
  "linux:x64": {
    packageName: "codex-linux-x64",
    targetTriple: "x86_64-unknown-linux-musl",
    executable: "codex",
  },
  "linux:arm64": {
    packageName: "codex-linux-arm64",
    targetTriple: "aarch64-unknown-linux-musl",
    executable: "codex",
  },
  "win32:x64": {
    packageName: "codex-win32-x64",
    targetTriple: "x86_64-pc-windows-msvc",
    executable: "codex.exe",
  },
  "win32:arm64": {
    packageName: "codex-win32-arm64",
    targetTriple: "aarch64-pc-windows-msvc",
    executable: "codex.exe",
  },
};

export function platformSupport(platform, arch) {
  const target = CODEX_TARGETS[`${platform}:${arch}`];
  if (!target) {
    throw new Error(
      `CodeLink 的自动安装尚不支持 ${platform}/${arch}；` +
        "需要 Node.js 22 和官方 Codex 原生二进制均支持该架构。",
    );
  }
  return target;
}

export function serviceInstaller(platform, scriptsDir, env = process.env) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  switch (platform) {
    case "darwin":
      return {
        name: "macOS LaunchAgent",
        command: "/bin/sh",
        args: [pathApi.join(scriptsDir, "install-launch-agent.sh")],
      };
    case "linux":
      return {
        name: "systemd user service",
        command: "/bin/sh",
        args: [pathApi.join(scriptsDir, "install-systemd-user.sh")],
      };
    case "win32":
      return {
        name: "Windows Scheduled Task",
        command:
          env.SystemRoot || env.WINDIR
            ? path.win32.join(
                env.SystemRoot || env.WINDIR,
                "System32",
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe",
              )
            : "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          pathApi.join(scriptsDir, "install-scheduled-task.ps1"),
        ],
      };
    default:
      throw new Error(`没有适用于 ${platform} 的 CodeLink 常驻安装器。`);
  }
}

export function parseSetupArgs(args) {
  const options = {
    dryRun: false,
    login: true,
    service: true,
    help: false,
  };

  for (const arg of args) {
    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-login":
        options.login = false;
        break;
      case "--no-service":
        options.service = false;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`未知安装参数：${arg}`);
    }
  }
  return options;
}

export function findCommandOnPath(command, options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const pathApi = platform === "win32" ? path.win32 : path;

  if (pathApi.isAbsolute(command) || /[\\/]/.test(command)) {
    return exists(command) ? command : null;
  }

  const directories = (env.PATH || env.Path || "").split(pathApi.delimiter);
  const extensions =
    platform === "win32"
      ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
          .map((extension) => extension.toLowerCase())
      : [""];
  const hasExtension = platform === "win32" && Boolean(pathApi.extname(command));

  for (const directory of directories) {
    if (!directory) continue;
    for (const extension of hasExtension ? [""] : extensions) {
      const candidate = pathApi.join(directory, `${command}${extension}`);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

export function codexNativeCandidates(entryPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const realpath = options.realpath ?? fs.realpathSync;
  const target = platformSupport(platform, arch);
  const pathApi = platform === "win32" ? path.win32 : path;
  let resolvedEntry = entryPath;
  try {
    resolvedEntry = realpath(entryPath);
  } catch {
    // The caller will report the missing executable after checking candidates.
  }

  const packageRoots = [];
  if (
    pathApi.basename(resolvedEntry).toLowerCase() === "codex.js" &&
    pathApi.basename(pathApi.dirname(resolvedEntry)).toLowerCase() === "bin"
  ) {
    packageRoots.push(pathApi.dirname(pathApi.dirname(resolvedEntry)));
  }

  if (/^codex\.(?:cmd|bat)$/i.test(pathApi.basename(entryPath))) {
    packageRoots.push(
      pathApi.join(pathApi.dirname(entryPath), "node_modules", "@openai", "codex"),
    );
  }

  const candidates = [];
  for (const packageRoot of packageRoots) {
    const packageParent = pathApi.dirname(pathApi.dirname(packageRoot));
    for (const platformRoot of [
      pathApi.join(
        packageRoot,
        "node_modules",
        "@openai",
        target.packageName,
      ),
      pathApi.join(packageParent, "@openai", target.packageName),
      packageRoot,
    ]) {
      candidates.push(
        pathApi.join(
          platformRoot,
          "vendor",
          target.targetTriple,
          "bin",
          target.executable,
        ),
      );
    }
  }
  return [...new Set(candidates)];
}

export function resolveCodexExecutable(options = {}) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const realpath = options.realpath ?? fs.realpathSync;
  platformSupport(platform, arch);

  const requested = env.CODELINK_CODEX_BIN?.trim();
  const entries = [];
  if (requested) entries.push(requested);
  if (!requested && platform === "darwin") {
    entries.push(
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      "/Applications/Codex.app/Contents/Resources/codex",
    );
  }
  if (!requested) {
    const onPath = findCommandOnPath("codex", { platform, env, exists });
    if (onPath) entries.push(onPath);
  }

  for (const entry of entries) {
    const nativeCandidates = codexNativeCandidates(entry, {
      platform,
      arch,
      realpath,
    });
    for (const candidate of nativeCandidates) {
      if (exists(candidate)) return candidate;
    }
    if (
      nativeCandidates.length === 0 &&
      exists(entry) &&
      !/\.(?:cmd|bat)$/i.test(entry)
    )
      return entry;
  }

  throw new Error(
    "未找到可供后台服务直接启动的 Codex 原生二进制。" +
      "请安装并登录 Codex CLI，或设置 CODELINK_CODEX_BIN 为 codex/codex.exe 的绝对路径。",
  );
}

export function resolveNpmExecutable(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const processExecPath = options.processExecPath ?? process.execPath;
  const sibling = path.join(
    path.dirname(processExecPath),
    platform === "win32" ? "npm.cmd" : "npm",
  );
  return (
    (exists(sibling) && sibling) ||
    findCommandOnPath("npm", { platform, env, exists })
  );
}

export function resolveNpmInvocation(options = {}) {
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? fs.existsSync;
  const processExecPath = options.processExecPath ?? process.execPath;
  const npmBin = resolveNpmExecutable({ ...options, platform, exists });
  if (!npmBin) return null;
  if (platform !== "win32" || !/\.(?:cmd|bat)$/i.test(npmBin)) {
    return { command: npmBin, argsPrefix: [] };
  }
  const npmCli = path.win32.join(
    path.win32.dirname(npmBin),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (!exists(npmCli)) {
    throw new Error(
      `找到 ${npmBin}，但缺少可由 Node 直接执行的 ${npmCli}；请修复 Node.js/npm 安装。`,
    );
  }
  return { command: processExecPath, argsPrefix: [npmCli] };
}
