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

CodeLink 只持久化 thread ID；完整对话历史仍由 Codex 管理。新建会话才创建 `~/Documents/Codex/CodeLink/<date>/...` 工作目录并注入 CodeLink developer instructions。恢复已有桌面任务时，只提交 `threadId` 和用户输入，不覆盖原任务的 cwd、模型、sandbox、approval policy 或 developer instructions。

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

daemon 在回复“已收到”之前记录消息到达时的绑定，保证这条微信消息不会因回执期间出现的新通知而误投到别的 thread。任务完成后只在绑定仍与启动快照一致时更新当前会话；若较新的桌面通知已经切换绑定，旧任务仍返回结果，但不会抢回绑定。

通知发送失败时同样按绑定版本做条件恢复，因此较早失败的通知不会回滚掉较晚成功的同 thread 通知。这些保证针对单个常驻 daemon 进程；同一状态目录不支持多个 daemon 同时写入。

## 独立登录

默认登录直接调用腾讯 iLink 二维码接口。空 CodeLink 状态使用空 `local_token_list`，不读取 `~/.openclaw`。OpenClaw 导入导出只用于用户明确要求保留既有 Bot 身份的可选迁移。

## HITL

当前版本不通过微信处理 Codex 审批。未来若增加 HITL，应单独持久化有时限的审批请求、验证精确 turn 和幂等响应，而不是扩大 daemon sandbox。
