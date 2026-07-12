# CodeLink

CodeLink 是一个微信 ↔ Codex 桥接器，也是可安装的 Codex 插件。

- 从微信发送文字，自动启动一个独立 Codex 会话，并把结果回复到微信；
- 在任意 Codex 项目或任务中，让 Codex 主动把进度、结果或总结发送到微信；
- 不依赖、不安装、不运行 OpenClaw；首次使用直接扫描腾讯 iLink 二维码登录。

当前版本聚焦独立任务和通知，暂不提供微信 HITL 审批。

## 最简单的安装方式

打开一个新的 Codex 任务，把 [INSTALL_PROMPT.md](INSTALL_PROMPT.md) 中的整段提示词复制进去。Codex 会读取固定安装要求、执行安装、展示二维码并逐项验收。

也可以手动执行：

```bash
git clone https://github.com/zaigie/codelink.git
cd codelink
chmod +x plugins/codelink/scripts/*.sh
./plugins/codelink/scripts/setup.sh
```

完整前置条件、更新、卸载和故障排查见 [INSTALL.md](INSTALL.md)。

> CodeLink 裸登录已在一个全新的空状态目录中真实验证成功。正常用户不需要先装 OpenClaw，也不需要复制 OpenClaw session。

## 工作方式

```text
微信用户
  │  腾讯 iLink getupdates / sendmessage
  ▼
CodeLink daemon ─────── codex app-server ─────── 独立 Codex 会话
  ▲                                                     │
  │ localhost HTTP                                     │ 本地任务存储
  │                                                     ▼
CodeLink MCP server ◀──────────────────────────── 任意 Codex 任务
```

后台 daemon 负责持续接收微信消息；任务内的 MCP server 只负责查询连接状态、查看近期微信任务和主动发消息。微信 token 不会进入 MCP 工具响应。

微信原文是会话中的用户消息。CodeLink 的安全约束通过 developer instructions 注入，不会污染用户请求。每次执行使用 `~/Documents/Codex/CodeLink/<date>/...` 下的独立目录，不会自动加入任何现有项目。

CodeLink 使用 OpenAI 官方公开的 App Server 协议运行 Codex，但它启动的是独立 App Server 进程。会话会写入本机 Codex 存储并返回 thread ID，**不保证实时出现在正在运行的 Codex App 左侧任务列表中**。CodeLink 不会为此伪装官方客户端、修改 App 数据库或连接私有 IPC。完整边界见 [docs/CAPABILITY_BOUNDARY.md](docs/CAPABILITY_BOUNDARY.md)。

## 微信中使用

扫码登录的微信用户会自动成为默认白名单用户。

- 发送普通文字：启动新的独立 Codex 会话并回复最终结果；
- `/status`：检查连接、通知上下文和任务数量；
- `/help`：显示简要帮助。

示例：

```text
分析下面这段错误并给出排查步骤：...
```

## Codex 中使用

安装插件后新建一个 Codex 任务，然后可以直接说：

```text
检查微信连接状态。
把当前结论总结后发到微信。
这个任务完成后通过微信通知我。
```

插件提供三个 MCP 工具：

- `get_wechat_status`
- `list_recent_wechat_tasks`
- `send_wechat_message`

主动通知依赖微信最近一次入站消息里的 `context_token`，因此目标微信用户至少需要先向 Bot 发送过一条消息。

## 本地状态与安全

默认状态目录是 `~/.codelink`，可用 `CODELINK_STATE_DIR` 覆盖。

| 文件 | 用途 | 权限 |
| --- | --- | --- |
| `config.json` | daemon、Codex sandbox、用户白名单 | `0600` |
| `weixin-session.json` | 微信 Bot 凭证与账号信息 | `0600` |
| `get-updates.json` | iLink 长轮询游标 | `0600` |
| `context-tokens.json` | 每个用户最近的回复上下文 | `0600` |
| `tasks.json` | 微信消息与 Codex 任务映射 | `0600` |
| `login-qr.png` | 最近一次登录二维码 | `0600` |

安全默认值：

- daemon 只监听 `127.0.0.1`；
- 只接受扫码用户或显式白名单用户；
- Codex 使用 `workspace-write`、`approvalPolicy: never`、默认禁止网络；
- 不自动配置 `danger-full-access`；
- token、二维码、context token 和任务状态均被 Git 忽略；
- 通知不应包含密钥、隐藏推理、完整日志或无关本地路径。

## 开发

```bash
cd plugins/codelink
npm ci
npm run typecheck
npm test
npm run build
```

插件结构校验：

```bash
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
```

架构决策见 [docs/architecture.md](docs/architecture.md)。如果需要迁移一个已经存在的 OpenClaw Bot，参考可选的 [docs/OPENCLAW_MIGRATION.md](docs/OPENCLAW_MIGRATION.md)；这不是普通安装步骤。

## 上游协议

微信登录和消息协议依据腾讯发布的 MIT 包 [`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 的公开源码与 Backend API Protocol 实现。CodeLink 只实现文本消息需要的最小 iLink API，不分发 OpenClaw 代码，也不需要 OpenClaw 运行时。
