# CodeLink

CodeLink 是一个不依赖 OpenClaw 的微信 ↔ Codex 桥接器，同时也是可安装的 Codex 插件。

它提供两条能力：

1. 微信向 CodeLink Bot 发送文字，后台守护进程为每条消息创建一个独立 Codex thread，并把最终结果回传微信。
2. 任意 Codex 任务可以调用 CodeLink MCP 工具，把进度、完成通知或总结发送到微信。

当前版本专注于“独立任务”和通知，不提供 HITL 审批。

## 架构

```text
微信用户
  │  腾讯 iLink getupdates / sendmessage
  ▼
CodeLink daemon ─────── codex app-server ─────── Codex App task
  ▲                                                     │
  │ localhost HTTP                                     │ Codex app task/session store
  │                                                     ▼
CodeLink MCP server ◀──────────────────────────── 任意 Codex 任务
```

后台守护进程是必要的：如果没有任何 Codex 任务处于打开状态，普通 MCP server 不会持续运行，因而无法从微信主动创建新任务。

## 开发安装

要求：macOS、Node.js 22+、已安装并登录 ChatGPT/Codex App。CodeLink 优先使用 App 自带的 `codex`，也可以通过 `CODELINK_CODEX_BIN` 指定兼容二进制。

```bash
cd plugins/codelink
npm install
npm run build
```

登录微信：

```bash
node dist/cli.cjs login
```

命令会同时：

- 在终端显示二维码；
- 保存一张 `~/.codelink/login-qr.png`；
- 扫码成功后将微信凭证保存到 `~/.codelink/weixin-session.json`，权限为 `0600`。

前台运行守护进程：

```bash
node dist/cli.cjs daemon
```

或安装为当前用户的 macOS LaunchAgent：

```bash
chmod +x scripts/*.sh
./scripts/install-launch-agent.sh
```

安装脚本会把已构建的单文件运行时复制到 `~/.codelink/runtime` 后再注册 LaunchAgent，避免后台进程依赖 Desktop 下的开发 checkout 或其隐私权限。卸载时只删除该运行时和 LaunchAgent，不删除微信会话与任务状态。

在没有微信登录时，可以先验证独立 Codex 任务创建链路：

```bash
node dist/cli.cjs task "只回复 CodeLink smoke test passed"
```

## 安装 Codex 插件

仓库包含 repo-local marketplace：`.agents/plugins/marketplace.json`，名称为 `codelink-local`。

```bash
codex plugin marketplace add /absolute/path/to/codelink
codex plugin add codelink@codelink-local
```

安装或更新插件后请新建 Codex 任务，使新的 skills 和 MCP tools 生效。

## 本地状态与凭证

默认状态目录为 `~/.codelink`；可以通过 `CODELINK_STATE_DIR` 覆盖。

| 文件                  | 内容                                       | 权限   |
| --------------------- | ------------------------------------------ | ------ |
| `config.json`         | daemon、Codex sandbox、白名单设置          | `0600` |
| `weixin-session.json` | `bot_token`、Bot ID、扫码用户 ID、网关地址 | `0600` |
| `get-updates.json`    | iLink 长轮询游标 `get_updates_buf`         | `0600` |
| `context-tokens.json` | 每个微信用户最近的回复上下文               | `0600` |
| `tasks.json`          | 微信消息与 Codex thread 的映射及状态       | `0600` |
| `login-qr.png`        | 最近一次登录二维码                         | `0600` |

可以安全查看路径而不打印 token：

```bash
node dist/cli.cjs state
```

腾讯官方 `@tencent-weixin/openclaw-weixin@2.4.6` 在 OpenClaw 中的默认落盘位置则是：

```text
~/.openclaw/openclaw-weixin/accounts.json
~/.openclaw/openclaw-weixin/accounts/<accountId>.json
~/.openclaw/openclaw-weixin/accounts/<accountId>.sync.json
~/.openclaw/openclaw-weixin/accounts/<accountId>.context-tokens.json
```

CodeLink 没有依赖 OpenClaw，因此使用自己的 `~/.codelink` 目录，避免污染或依赖 OpenClaw 状态。

### 从云端 OpenClaw 迁移既有微信连接

如果微信已经绑定到云端 OpenClaw，不要在本机反复扫码。官方 2.4.6 会把既有 `bot_token` 作为 `local_token_list` 上送，用来识别已绑定实例；本机缺少这份状态时，微信端可能把重复绑定显示为二维码过期。

在云端机器的 CodeLink checkout 中运行：

```bash
cd plugins/codelink
npm install
npm run build
node dist/cli.cjs export-openclaw /tmp/codelink-weixin-export.json ~/.openclaw
```

输出文件权限为 `0600`，只包含以下白名单字段：

- `accountId`、`bot_token`、`baseUrl`、扫码用户 ID；
- `get_updates_buf`；
- 每用户最近的 `context_token`；
- `routeTag` 和 `botAgent`。

它不会复制整个 `openclaw.json`，因而不会带出模型、Gateway 或其他插件密钥。

通过 `scp`、Tailscale 或其他受保护通道将文件传到本机，然后执行：

```bash
node dist/cli.cjs import-openclaw /secure/path/codelink-weixin-export.json
rm -f /secure/path/codelink-weixin-export.json
node dist/cli.cjs daemon
```

如果 bearer token 可跨机器使用，CodeLink 会直接接管；若腾讯将 token 绑定到云端环境，则应把微信收发保留为云端轻量 relay，本机插件通过受认证隧道接收任务，而不是重新部署完整 OpenClaw。

## 微信使用

扫码登录的用户自动成为默认白名单用户。之后直接向 Bot 发送文字，每条文字都会建立一个新的独立 Codex thread。

```text
分析下面这段错误并给出排查步骤：...
```

支持命令：

- `/status`：检查连接和任务数；
- `/help`：显示简要说明。

## Codex 中使用

安装插件后，可以在任意项目或普通任务中提出：

```text
这个任务完成后通过微信通知我。
把当前结论总结后发到微信。
检查一下微信连接状态。
```

MCP 工具：

- `get_wechat_status`
- `list_recent_wechat_tasks`
- `send_wechat_message`

主动通知要求目标用户之前至少向 CodeLink 发送过一条消息，因为微信 `sendmessage` 需要最近的 `context_token`。

## 安全默认值

- 只监听 `127.0.0.1`；
- 扫码用户自动进入 `allowedUserIds`，其他用户消息被忽略；
- 每个微信消息使用独立生成目录，不附着到现有代码项目；
- Codex 使用 `workspace-write`、`approvalPolicy: never`、默认禁止网络；
- 不提供 `danger-full-access` 自动配置；
- MCP 工具不会返回微信 token；
- 通知文本不应包含密钥、隐藏推理或无关本地路径。

## 验证

```bash
cd plugins/codelink
npm run typecheck
npm test
npm run build
python3 /Users/zaigie/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

## 上游协议说明

微信登录和消息协议依据腾讯发布的 MIT 包 [`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 的公开源码与 Backend API Protocol 实现。CodeLink 仅实现文本消息所需的最小 iLink API，不分发 OpenClaw 代码，也不需要 OpenClaw 运行时。

### 登录兼容诊断

默认登录严格使用腾讯 2.4.6 的 POST 流程。如果腾讯新网关返回的二维码在微信端立即失效，可以对照旧协议：

```bash
node dist/cli.cjs login --legacy-get
```

该模式使用腾讯 1.x/2.0 源码中的裸 GET 获取二维码，并只用 `iLink-App-ClientVersion: 1` 轮询状态。若两个模式都由腾讯成功签发二维码、但微信端都立即提示过期，应优先检查微信账号的 ClawBot/iLink 灰度资格或腾讯服务状态，而不是反复扫码。
