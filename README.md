# CodeLink

在微信里继续 Codex，也让任意 Codex 任务主动找你。

- 微信消息默认继续当前 Codex 会话；没有当前会话时自动新建；
- 在 Codex 桌面版使用 `@CodeLink` 发送通知，这个任务就会成为微信当前会话；
- 收到通知后可直接在微信回复继续，也可以自然地要求开始新会话；
- 不安装、不运行、也不依赖 OpenClaw。

## 它怎么工作

| 你做什么 | CodeLink 做什么 |
| --- | --- |
| 微信发送普通消息 | 继续当前会话；没有当前会话时新建并绑定 |
| 微信发送 `/new` 或 `/new 帮我……` | 忽略旧绑定，从新会话开始 |
| 微信说“开个新会话”“换个话题……” | 识别明确意图，不强制记忆 `/new` |
| 桌面任务中说 `@CodeLink 完成后微信通知我` | 通知微信，并把这个桌面任务设为当前会话 |
| 另一个桌面任务再次 `@CodeLink` | 切换到最近通知的任务 |
| 收到通知后直接回复 | 继续通知来源的 Codex 会话 |

每个授权微信用户各自维护一个当前会话。Codex 对话历史由 Codex 保存，CodeLink 只需保存当前 thread ID。
若多个任务同时运行，以最近一次成功的切换为准；较早任务稍后完成时只返回结果，不会抢回当前会话。

## 安装

要求：macOS、Node.js 22+，以及已登录的 ChatGPT/Codex App 或 Codex CLI。

最简单的方式是新建一个 Codex 任务，把 [INSTALL_PROMPT.md](INSTALL_PROMPT.md) 中的提示词完整复制进去。

也可以手动运行：

```bash
git clone https://github.com/zaigie/codelink.git
cd codelink
chmod +x plugins/codelink/scripts/*.sh
./plugins/codelink/scripts/setup.sh
```

安装器会构建插件、展示腾讯 iLink 登录二维码、注册 macOS LaunchAgent，并检查后台服务。微信凭证只保存在 `~/.codelink`，不会读取 `~/.openclaw`。

完整要求、更新和卸载方式见 [INSTALL.md](INSTALL.md)。

## 在微信中使用

首次扫码的用户会成为默认授权用户。之后直接发送文字即可：

```text
分析这个报错，并给我排查步骤……
```

下一条消息默认继续同一会话：

```text
再结合刚才的日志缩小一下范围。
```

需要新上下文时，可以使用任一种表达：

```text
/new
/new 帮我规划另一个项目
开个新会话，帮我分析这份方案
换个话题：解释一下这个 API
```

辅助命令：

- `/status`：查看连接状态和当前 thread ID；
- `/help`：查看简要说明。

## 在 Codex 桌面版中使用

安装后新建一个 Codex 任务，在输入框键入 `@` 选择 **CodeLink**：

```text
@CodeLink 这个任务完成后微信通知我。
@CodeLink 把当前进度发到微信，我稍后从微信继续。
```

通知由后台统一追加：

```text
—— CodeLink 任务通知
此任务已设为微信当前 Codex 会话；可直接回复继续，发送 /new 或直接说“开个新会话”开始新会话。
```

模型不需要知道或填写 thread ID；CodeLink 从 Codex 提供给 MCP 工具的调用元数据中读取它。若当前环境未提供可信 thread 元数据，通知仍可发送，但不会错误切换已有绑定。

## 两类会话

- **微信新建的会话**：CodeLink 创建独立工作目录，使用安全默认配置；它会保存到 Codex，但不保证实时出现在 Codex App 左侧列表。
- **桌面任务绑定的会话**：保留原任务的项目、上下文和设置；微信回复会通过官方 `thread/resume` 继续它。

CodeLink 使用 OpenAI 官方公开的 [Codex App Server](https://learn.chatgpt.com/docs/app-server)，不会修改 App 数据库、伪装官方客户端或连接私有 IPC。详细边界见 [docs/CAPABILITY_BOUNDARY.md](docs/CAPABILITY_BOUNDARY.md)。

## 当前边界

- 当前只处理文字消息；
- 微信续接不等于 HITL 审批，不能在微信批准 Codex 工具调用或权限请求；
- 当前小白常驻安装只支持 macOS LaunchAgent；
- 微信新建会话的 Codex App 侧栏展示不作为验收项。

## 开发

```bash
cd plugins/codelink
npm ci
npm run typecheck
npm test
npm run build
```

架构说明见 [docs/architecture.md](docs/architecture.md)。已有 OpenClaw Bot 的可选迁移方式见 [docs/OPENCLAW_MIGRATION.md](docs/OPENCLAW_MIGRATION.md)；普通安装不需要阅读或执行迁移步骤。
