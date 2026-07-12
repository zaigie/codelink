# CodeLink 能力边界

本文档定义 CodeLink 当前承诺的能力，避免把“Codex 会话存在”误解为“Codex App 侧栏一定展示”。

## 已支持并验证

### 微信直接登录

- CodeLink 可以在空状态目录中直接请求腾讯 iLink 二维码并完成登录；
- 不需要安装、启动或部署 OpenClaw；
- 不需要从 OpenClaw 或其他机器复制 session；
- 微信凭证只保存在 `~/.codelink`，权限为 `0600`。

### 微信触发 Codex

- 微信普通文字会启动一个独立 Codex 会话；
- 使用 OpenAI 官方公开的 [Codex App Server](https://learn.chatgpt.com/docs/app-server) stdio 协议；
- 每次执行都有独立工作目录、thread ID、运行状态和最终回复；
- 完成或失败结果会返回微信；
- CodeLink 保留最近的消息与 thread ID 映射，可通过 MCP 工具查询。

### Codex 主动通知微信

- 任意加载了插件的 Codex 项目或任务可以检查微信连接；
- 可以发送进度、结果或总结到已授权微信用户；
- MCP 响应不会暴露 bot token 或 context token。

## 不承诺的能力

### Codex App 左侧任务列表

外部 CodeLink daemon 会启动自己的 App Server 进程。线程能保存到本机 Codex 会话存储，也能通过 thread ID 读取，但 OpenAI 当前没有公开接口让第三方后台进程把 `thread/started` 事件注入已经运行的 Codex App 连接。

因此 CodeLink 不保证微信创建的会话：

- 实时出现在 Codex App 左侧任务列表；
- 按预期顺序排在侧栏顶部；
- 自动打开或获得未读标记。

CodeLink 明确不会通过以下方式绕过边界：

- 伪装 `Codex Desktop` 或其他官方客户端身份；
- 修改 Codex App SQLite 数据库或 UI 状态；
- 劫持桌面 App 的 stdio、Unix socket 或私有 IPC；
- 使用未公开 deeplink 强制打开会话。

如果 OpenAI 后续公开面向第三方 daemon 的 App 任务创建或刷新接口，CodeLink 才会把侧栏集成加入正式能力。

### 其他边界

- 微信任务不会自动附着到某个现有项目；
- 当前只处理文字消息；
- 当前不提供微信 HITL 审批；
- 当前小白常驻安装只支持 macOS LaunchAgent。

## 验收标准

CodeLink 安装成功应满足：

1. 微信 `/status` 返回运行状态；
2. 微信普通消息能触发 Codex，并收到带 thread ID 的最终结果；
3. CodeLink 近期任务列表能查到消息、状态和 thread ID；
4. Codex 能主动向微信发送通知；
5. 无 OpenClaw 进程、依赖或必需状态文件。

Codex App 侧栏是否展示该 thread 不作为验收项。
