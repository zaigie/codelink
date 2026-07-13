# CodeLink 固定安装要求

本文是交给 Codex 执行的安装契约。用户只需要提供本文件链接；克隆或更新源码、执行安装和验证都应由 Codex 完成，不应要求用户先手动 `git clone`。

## 安装结论

- 不安装、不启动 OpenClaw，也不从当前用户主目录下的 `.openclaw` 或其他机器复制 session/token；
- 扫码前提醒用户在微信 **设置 → 插件** 中找到并启用 **微信 ClawBot**；
- 首次安装直接使用 CodeLink 的腾讯 iLink 登录，展示二维码并等待用户扫码；
- 默认把源码放在当前用户主目录下的 `.codelink/source`（Windows 路径由 PowerShell 的 `Join-Path` 生成），而不是临时工作区；
- 使用同一个 Node 跨平台安装器，再按系统注册用户态后台服务；
- 任何输出、日志、截图、提交和聊天消息都不得包含 bot token、context token 或完整 session。

## 支持范围

CodeLink 核心由 Node.js 和纯 JavaScript 依赖组成，不含原生扩展。当前自动安装范围由官方 Codex 原生二进制决定：

| 系统 | 架构 | 默认常驻方式 | 备注 |
| --- | --- | --- | --- |
| macOS | x64、arm64 | LaunchAgent | 支持 Intel 和 Apple Silicon |
| Linux | x64、arm64 | systemd user service | 非 systemd 发行版可使用 `--no-service` 和自己的进程管理器 |
| Windows | x64、arm64 | 当前用户 Scheduled Task | 随用户登录启动，不要求系统级服务 |

macOS 常驻路线已经实机运行。Linux 与 Windows 安装器具备纯函数、`--dry-run` 和脚本语法测试，但在正式标记稳定前仍需各完成一次对应系统的真实注册、重启和卸载回归。安装时应如实报告实际验收结果，不把静态测试描述成跨平台实机验证。

普通安装依赖：

- Node.js 22 或更高版本；Codex App 内置的独立 `node` 可直接使用，不要求同时包含 npm；
- Git；
- 已安装并登录的 Codex，且其二进制支持 `plugin` 与 `app-server`；
- 可访问 GitHub 和腾讯 iLink；
- 可使用微信 ClawBot/iLink 的微信账号。

仓库内包含经过 SHA-256 清单校验的预构建 MCP/CLI 运行时。只有开发者明确使用 `--build` 时才要求 npm；开发依赖固定为 `npm@10.9.8`，不得在用户机器上自举 npm latest。

安装器会解析 npm 安装的 Codex wrapper，并把对应的 `codex`/`codex.exe` 原生二进制绝对路径保存到后台服务环境中。因此 NVM、用户级 npm 和 Windows `codex.cmd` 不会因为后台 PATH 不同而成为系统限制。若使用自定义安装，可预先设置 `CODELINK_CODEX_BIN` 为原生二进制绝对路径。

## Codex 应执行的安装流程

### 1. 检查环境

先只读检查操作系统、CPU 架构、`node --version`、`git --version`，以及 PATH 中或 Codex App 内置二进制的 `codex --version`。npm 是可选开发依赖：存在时记录路径和版本，不存在不阻断普通安装。Node 低于 22 或 Codex 尚未登录时，先向用户说明缺项；不要用 OpenClaw 绕过。

### 2. 克隆或安全更新持久源码

先检查是否已有一个来自 `https://github.com/zaigie/codelink` 的持久 CodeLink checkout，并确认其中没有用户未提交修改；有则在原位置快进更新，避免为同名 `codelink-local` marketplace 再造第二个来源。只有首次安装或旧来源不可继续使用时，才采用下面的默认目录。

Unix（macOS/Linux）参考：

```bash
SOURCE_DIR="${CODELINK_SOURCE_DIR:-$HOME/.codelink/source}"
mkdir -p "$(dirname "$SOURCE_DIR")"
if [ -d "$SOURCE_DIR/.git" ]; then
  git -C "$SOURCE_DIR" pull --ff-only
else
  git clone https://github.com/zaigie/codelink.git "$SOURCE_DIR"
fi
```

Windows PowerShell 参考：

```powershell
$SourceDir = if ($env:CODELINK_SOURCE_DIR) {
    $env:CODELINK_SOURCE_DIR
} else {
    Join-Path $HOME ".codelink\source"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SourceDir) | Out-Null
if (Test-Path (Join-Path $SourceDir ".git")) {
    git -C $SourceDir pull --ff-only
} else {
    git clone https://github.com/zaigie/codelink.git $SourceDir
}
```

若目标目录存在但不是这个仓库，或存在无法快进的本地修改，停止并向用户说明，不能覆盖或重置用户文件。

### 3. 先做无副作用预检

```text
node <源码目录>/plugins/codelink/scripts/setup.mjs --dry-run
```

预检应显示当前平台、架构、Node/Codex 路径和版本、可选 npm 路径和版本、`plugin`/`app-server` 命令能力、Codex 原生目标、源码与 runtime 目标、预构建运行时校验结果、现有插件状态、端口状态和将采用的常驻方式。失败项使用稳定错误码（例如 `E_CODEX_PLUGIN_UNSUPPORTED`、`E_PORT_OCCUPIED`）并给出下一步。它不构建、不扫码、不修改插件配置，也不注册服务。

### 4. 执行统一安装器

```text
node <源码目录>/plugins/codelink/scripts/setup.mjs
```

安装器会依次：

1. 校验仓库内预构建 MCP/CLI 运行时的 SHA-256 清单，普通安装不运行 npm；
2. 添加当前持久源码为本地 marketplace，并安装 `codelink` 插件；
3. 若没有现有 CodeLink session，启动腾讯 iLink 登录；
4. 复制最小运行时到状态目录的 `runtime` 子目录；状态目录优先使用 `CODELINK_STATE_DIR`，否则使用当前用户主目录下的 `.codelink`；随后注册当前系统的用户态后台服务；
5. 通过不含用户标识的 `127.0.0.1:18791/healthz` 验证 daemon，再通过 `127.0.0.1:18791/mcp` 完成 MCP 初始化和工具清单验证；只有两者都就绪才报告安装成功。

登录期间，安装器使用 PNG-only 模式在状态目录生成 `login-qr.png`；状态目录优先使用 `CODELINK_STATE_DIR`，否则由系统路径 API 解析为当前用户主目录下的 `.codelink`。Codex 必须立即读取该 PNG，并把二维码图片直接发在当前主会话中，然后暂停等待扫码。不能只打印文件路径、备用链接或终端二维码，也不能让用户展开执行过程才能看到图片；不得把二维码内容解析成文本输出。二维码内容不会写入安装终端日志，登录成功或超时后会清理 PNG。已有 `weixin-session.json` 时安装器会保留登录态并跳过扫码。

可选参数只用于明确场景：

- `--no-login`：保留现有登录或开发预装；
- `--no-service`：不注册后台服务，由现有进程管理器运行 `node dist/cli.cjs daemon`；
- `--dry-run`：仅预检。
- `--build`：仅供源码开发者使用 npm 重新安装依赖和构建；普通安装不要使用。

旧的 `setup.sh` 仍可在 macOS/Linux 使用，但它只是上述 Node 安装器的兼容入口。Windows 直接运行 `setup.mjs`。

## 验收

安装完成后至少验证：

1. 后台服务健康，且只监听 loopback；
2. 新建一个 Codex 任务，使新插件和 MCP 生效；
3. 在 Codex 中说“检查 CodeLink 微信连接和当前会话状态”；
4. 微信发送 `/status`；
5. 第一条普通消息创建会话，第二条追问沿用同一 thread；
6. `/new 新的问题` 和“开个新会话，……”都切换到新 thread；
7. 桌面任务输入 `@CodeLink 完成后微信通知我`，通知到达且微信回复能继续该桌面 thread；
8. 另一个桌面任务通知后，以最近通知的任务为当前绑定；
9. 发送一个需要数秒的微信请求，处理期间应显示原生“正在输入”，完成后只收到 Codex 正文，不出现消息 ID、thread ID 或“会话已回复”标签；
10. `/new 新的问题` 的最终正文前只出现一次旧上下文不会带入的提示。
11. 连续创建两个微信新会话时，thread ID 不同，但 App Server 返回的 cwd 都是当前用户主目录下同一个由系统路径 API 生成的 `Documents/Codex/CodeLink`；不得再出现按日期或时间戳生成的会话工作目录。

安装器会写入不含用户标识的私有安装回执。可运行下面的安全自检；它只输出布尔状态，不输出账号、微信用户 ID、thread ID、token 或本地路径。不要把 POSIX 的 `~` 简写直接复制到 Windows；按当前 shell 解析状态目录。

macOS/Linux（POSIX shell）：

```bash
STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"
"<安装器预检输出的 Node 绝对路径>" "$STATE_DIR/runtime/cli.cjs" doctor
```

Windows PowerShell：

```powershell
$StateDir = if ($env:CODELINK_STATE_DIR) {
    $env:CODELINK_STATE_DIR
} else {
    Join-Path $HOME ".codelink"
}
& "<安装器预检输出的 Node 绝对路径>" (Join-Path $StateDir "runtime\cli.cjs") doctor
```

`daemonHealthy=true` 只说明后台与微信轮询正常；`pluginInstalled` 和 `mcpBundleReady` 说明插件配置及 MCP bundle 已安装；`mcpEndpointReady=true` 表示 doctor 已通过真实 MCP 初始化和工具清单验证。Codex 任务中的工具加载仍以“新建任务”为边界；更新后创建的新任务仍看不到 CodeLink 时，只重启 Codex App 一次。重启后新任务仍缺少工具，应重新运行安装器并检查 `E_MCP_UNHEALTHY`，不要循环新建任务。

检查服务状态时不要输出健康接口中的用户 ID，也不要读取或展示 session 文件内容。

| 系统 | 状态与日志 |
| --- | --- |
| macOS | `launchctl print gui/$(id -u)/ai.codelink.daemon`；日志默认在 `$HOME/.codelink/daemon.*.log` |
| Linux | `systemctl --user status ai.codelink.daemon`；`journalctl --user -u ai.codelink.daemon` |
| Windows | `Get-ScheduledTask -TaskName "CodeLink Daemon"`；日志在 `$HOME\.codelink\daemon.*.log` |

## 更新

用户再次给 Codex 同一段安装提示即可。Codex 应对持久源码执行 `git pull --ff-only`，然后重新运行 `setup.mjs`。安装器替换预构建 runtime、重装本地插件并重启服务，但保留已有微信 session、同步游标、context token、会话绑定和任务记录，不应要求重复扫码。更新完成后新建 Codex 任务加载新版插件。

更新不会改写或删除已有 Codex thread。旧版本已经创建的时间戳项目会继续作为历史记录保留；更新后的微信新会话统一归入当前用户主目录下由系统路径 API 生成的 `Documents/Codex/CodeLink`。

## 卸载后台服务

卸载只移除常驻服务和复制的 runtime，保留微信登录与任务状态：

```text
macOS:  sh <源码目录>/plugins/codelink/scripts/uninstall-launch-agent.sh
Linux:  sh <源码目录>/plugins/codelink/scripts/uninstall-systemd-user.sh
Windows: powershell -NoProfile -ExecutionPolicy Bypass -File <源码目录>\plugins\codelink\scripts\uninstall-scheduled-task.ps1
```

删除状态目录（`CODELINK_STATE_DIR`，未设置时为当前用户主目录下的 `.codelink`）会删除凭证和绑定；默认源码也位于当前用户主目录下的 `.codelink/source`，若它落在同一目录中也会被删除。执行前必须获得用户明确确认。

## 平台说明与故障排查

### Linux 没有 systemd user session

这不影响核心运行。使用 `--no-service` 安装，然后让用户现有的 systemd system service、supervisord、容器或其他进程管理器运行 `node <源码目录>/plugins/codelink/dist/cli.cjs daemon`。不要因此描述成“CodeLink 不支持 Linux”。

### Windows 找到的只有 codex.cmd

统一安装器会从官方 npm wrapper 定位架构对应的 `codex.exe`，再把绝对路径保存进计划任务。如果 Codex 使用非标准布局，设置 `CODELINK_CODEX_BIN` 为原生 `codex.exe` 后重试 `--dry-run`。

### 后台服务没有启动

按上表查看当前平台的服务状态和日志。常见原因是交互式终端使用了临时 Node/Codex 路径、端口 `18791` 被占用，或用户会话的 systemd/Task Scheduler 不可用。统一安装器已固定当前 Node 与 Codex 的绝对路径；修复环境后重新运行即可。

### 二维码问题

重新运行 `node <源码目录>/plugins/codelink/dist/cli.cjs login`。直接在终端使用时默认同时显示终端二维码和 PNG；自动化安装应使用 `--qr-output png`。不要安装 OpenClaw，也不要复制其他机器的 token。只有明确迁移已有 OpenClaw Bot 身份时，才参考 [docs/OPENCLAW_MIGRATION.md](docs/OPENCLAW_MIGRATION.md)。

### 微信新会话没有出现在 Codex App 左侧

这是产品边界，不是安装失败。外部 App Server 没有公开接口向正在运行的 Codex App 侧栏推送新任务；会话仍会保存在 Codex，并可由 CodeLink 继续。详见 [docs/CAPABILITY_BOUNDARY.md](docs/CAPABILITY_BOUNDARY.md)。
