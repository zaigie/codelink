# Architecture decisions

## Daemon 与 MCP 分工

Codex 只在任务上下文中启动插件 MCP server，因此没有 Codex 任务运行时，MCP 不能持续接收微信消息。CodeLink 分成两部分：

- 常驻 Node daemon：腾讯 iLink 长轮询、白名单、会话路由、Codex App Server 调用和微信发送；
- 任务内 stdio MCP server：检查状态、查看近期记录、从 Codex 桌面任务发送通知。

MCP 只访问 `http://127.0.0.1:18791`，不会获得微信 bot token。

## 会话路由

每个微信用户在 `conversations.json` 中最多保存一个当前 Codex thread ID。

```text
无绑定或明确新会话请求
  → thread/start
  → turn/start
  → 保存 thread ID

已有绑定
  → thread/resume
  → 活动 turn 存在时 turn/steer
  → 否则 turn/start

桌面任务 @CodeLink 通知
  → 从 MCP 请求 _meta 读取调用方 thread ID
  → 更新对应微信用户的绑定
  → 发送带固定尾注的通知
```

CodeLink 只持久化会话路由所需的 thread ID；完整对话历史仍由 Codex 管理。新建会话才创建 `~/Documents/Codex/CodeLink/<date>/...` 工作目录并注入 CodeLink developer instructions。恢复已有桌面任务时，只提交 `threadId` 和用户输入，不覆盖原任务的 cwd、模型、sandbox、approval policy 或 developer instructions。

## 新会话意图

`/new` 是确定性控制命令。自然语言切换由 daemon 在消息进入旧 thread 前用保守规则识别，只接受句首明确表达，例如“开个新会话”或“换个话题：……”。它不使用 LLM 分类，以避免额外延迟和不确定性。

## 两种上下文

- 腾讯 `context_token`：微信 `sendmessage` 所需的最近入站上下文；
- Codex `threadId`：要新建、续接或覆盖的 Codex 会话。

两者分别保存，不能互相替代。

## 通知绑定

Codex 当前会在 MCP `tools/call` 的 `_meta.threadId` 中提供调用方 thread。这个行为已经通过官方 Codex 二进制真实验证，但公开文档尚未承诺字段稳定性，因此实现会校验 UUID 格式，并在字段缺失时只发送通知、不更新绑定。

绑定发生在消息发送之前；若发送失败且绑定期间没有再次变化，daemon 恢复之前的绑定，避免用户没有收到通知却被静默切换。

## 并发与最近绑定优先

daemon 在接受任务时记录消息到达时的绑定，保证这条微信消息不会因执行期间出现的新通知而误投到别的 thread。任务完成后只在绑定仍与启动快照一致时更新当前会话；若较新的桌面通知已经切换绑定，旧任务仍返回结果，但不会抢回绑定。

通知发送失败时同样按绑定版本做条件恢复，因此较早失败的通知不会回滚掉较晚成功的同 thread 通知。这些保证针对单个常驻 daemon 进程；同一状态目录不支持多个 daemon 同时写入。

长任务不会阻塞微信长轮询。daemon 先把完整恢复请求以私有 `accepted` 记录写入，再提交 `get_updates_buf`，随后在后台执行；临时输入状态失败不会阻止 Codex。首个新 thread 尚未返回 ID 时，同一用户的后续消息只等待“路由建立”而不等待整个任务，拿到 ID 后即可通过 `turn/steer` 进入活动 turn。同一批更新里的连续消息也遵循这条规则。

会话状态另有单调 generation。即使当前没有 thread，显式 `/new` 也会推进 generation，因此更早的异步 `thread/start` 不能在稍后抢回绑定。

重启恢复采用保守语义：尚未开始的 `accepted` 请求可以重放；已经进入 `running` 的请求不会盲目重放，以免重复文件修改或外部副作用，而是标记中断并通知用户重新发送或继续已知 thread。终态后会清除完整请求正文，只保留预览。

## 微信投递与持久化 outbox

所有文本发送统一经过 `WeixinTextDelivery`：按 UTF-8 2048 字节限制切块，优先段落、换行和完整 Markdown fence/list item；整条消息全局串行；chunk 间节流；`ret=-2` 只做有限退避。每个 chunk 使用稳定 `client_id`，同一次重试以及 daemon 在 pending outbox 上的重启恢复都会复用相同 ID。

任务执行状态与微信投递状态分别记录。Codex 成功但微信失败时，任务仍为 `completed`，投递记录单独为 `failed`。最终消息在执行提交前先以完整 payload 写入私有 outbox；投递成功后移除 payload。新版本不再创建或发送永久 acknowledgement；升级时发现旧版 pending acknowledgement 会直接标为 `skipped`，避免重启后冒出过期回执。`/tasks` 只返回预览和投递摘要，不暴露恢复正文、outbox 文本或稳定键。

## 微信输入状态

`WeixinClient` 封装腾讯公开的 `getconfig → typing_ticket → sendtyping` 线协议，并只在内存中按用户缓存 ticket，最长 24 小时。`WeixinTypingIndicator` 对 daemon 暴露一个 `during()` 接口，内部完成立即开始、每 5 秒保活、串行更新和最终取消。typing 请求使用可取消信号，避免慢速 ticket 请求在正文已经发送后产生迟到的“正在输入”。

同一账号和微信用户的并发任务使用引用计数共享状态；一个任务结束不会取消仍在工作的另一个任务。保活在上一次请求结束后再计时，避免慢网络积压；连续失败两次后转为每 60 秒静默探测，新工作到来会提前重试，成功后恢复 5 秒节奏，避免无效请求和日志放大。所有 typing 错误只写安全日志，不改变 Codex 任务或正文投递结果。CANCEL 共享幂等关闭流程并有 3 秒总时限，daemon 不会因状态接口失联而卡住退出。桌面任务通过 `@CodeLink` 主动发送的通知不启动 typing，因为它不是正在处理的微信入站请求。

## App Server 可靠性

每次运行严格筛选目标 `threadId + turnId` 的通知；RPC 和整个 turn 分别有 30 秒与 30 分钟上限。若完成通知缺少 `final_answer`，只通过官方 `thread/read(includeTurns: true)` 读取目标 turn。需要客户端响应的审批与 elicitation 会被明确拒绝，用户输入和权限请求返回空安全响应，未知 request 返回 method-not-supported，不会静默挂起或使当前 RPC 误失败。后台安装优先固定官方原生 Codex 路径，前台 Windows 运行也能解析 `codex.cmd`/`.bat` shim。

## 独立登录

默认登录直接调用腾讯 iLink 二维码接口。空 CodeLink 状态使用空 `local_token_list`，不读取 `~/.openclaw`。二维码过期时在同一登录超时窗口内自动获取新码、重写 PNG 并再次触发展示回调。OpenClaw 导入导出只用于用户明确要求保留既有 Bot 身份的可选迁移。

## 跨平台运行与常驻

daemon、MCP 和状态存储只使用 Node.js API 与纯 JavaScript 依赖，不依赖 macOS framework 或本机编译扩展。平台差异收敛在安装层：

- macOS 用 LaunchAgent；
- Linux 用 systemd user service；
- Windows 用当前用户 Scheduled Task；
- 不具备上述服务管理器时，daemon 仍可由其他进程管理器前台启动。

统一安装器根据 `process.platform/process.arch` 匹配官方 Codex 的 x64/arm64 target，并解析 npm wrapper 后面的原生 `codex`/`codex.exe`。Node 与 Codex 的绝对路径会写进服务环境，避免后台会话与交互式 shell 的 PATH 不一致。当前未承诺的架构是官方 Codex 没有对应原生 target 的组合，而不是 CodeLink 主动限制操作系统。

## HITL

当前版本不通过微信处理 Codex 审批。未来若增加 HITL，应单独持久化有时限的审批请求、验证精确 turn 和幂等响应，而不是扩大 daemon sandbox。
