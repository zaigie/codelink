# CodeLink 能力边界

CodeLink 当前的核心能力是：为每个授权微信用户维护一个“当前 Codex 会话”，让微信和 Codex 桌面任务可以自然地接力。

## 当前能力

### 微信直接登录

- CodeLink 可以在空状态目录中直接请求腾讯 iLink 二维码并完成登录；
- 不需要安装、运行或部署 OpenClaw，也不需要复制其 session；
- 微信凭证只保存在 CodeLink 状态目录；它优先使用 `CODELINK_STATE_DIR`，否则由系统路径 API 解析为当前用户主目录下的 `.codelink`。Unix 文件使用 `0600`，Windows 使用用户配置目录继承的 ACL。

### 当前会话

- 没有绑定时，第一条微信普通消息通过官方 `thread/start` 创建并绑定 Codex 会话；
- 后续普通消息通过 `thread/resume` 继续同一个 thread；
- 若原任务仍在运行，CodeLink 使用官方 `turn/steer` 把微信回复加入当前 turn；否则使用 `turn/start` 开始下一轮；
- 绑定保存在 `conversations.json`，每个微信用户相互独立。

### 回复状态与正文

- Codex 处理微信请求期间，CodeLink 通过腾讯公开 iLink `getconfig` / `sendtyping` 协议显示微信原生“正在输入”状态；
- 状态立即开始、每 5 秒保活，在成功、失败或 daemon 停止时尽力取消；状态接口失败不会阻止 Codex 执行或最终正文；
- 同一用户有多个并发任务时共享一份输入状态，最后一个任务结束后才取消；
- 普通回复只包含 Codex 正文，不附加消息 ID、thread ID、“当前会话已回复”或“新会话已回复”；
- 首次没有绑定时自动创建会话，但不显示多余的新会话提示；只有 `/new <请求>` 或明确自然语言切换才提示旧上下文不会带入；
- `/status` 等用户主动诊断命令仍可显示当前 thread。

typing 线协议依据腾讯公开、MIT 授权且随包发布源码的 [`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin)。CodeLink 自己实现该公开协议，不安装或运行 OpenClaw。

### 新会话

- `/new` 清除当前绑定，下一条消息从新上下文开始；
- `/new <请求>` 立即新建会话并执行请求；
- “开个新会话”“重新开一个会话，……”或“换个话题：……”等句首明确意图也能切换；
- 讨论“如何实现新建会话功能”等普通请求不会触发切换；
- 每个新会话有独立 thread ID，但 `thread/start` 统一使用当前用户主目录下由系统路径 API 生成的 `Documents/Codex/CodeLink` cwd，不再由 CodeLink 为每个会话生成时间戳项目目录；Codex 远程界面的刷新时机和历史项目呈现不在公开 App Server 的控制范围内；
- 绑定已有桌面 thread 时不覆盖原任务的 cwd，升级也不改写或删除旧版本已创建的历史 thread。

### 桌面任务绑定与通知

- 任意加载了插件的新 Codex 桌面任务都可以通过 `@CodeLink` 发送微信通知；
- CodeLink 从 Codex 提供给 MCP 调用的可信 `_meta.threadId` 读取调用方 thread，不让模型或用户填写 thread ID；
- 通知发送前先绑定调用方 thread，微信随后可以直接回复继续；
- 另一个任务再次通知时，以最近一次成功通知的绑定为准；
- 较早的微信任务稍后完成时，不会覆盖期间产生的更新绑定；
- daemon 统一追加任务通知标签和回复说明；
- 如果当前 Codex 环境没有提供可信 thread 元数据，通知仍可发送，但不会改变当前绑定，并会明确提示降级结果。

`_meta.threadId` 已由当前官方 Codex 客户端真实验证，但尚未写入公开 App Server 文档。CodeLink 因此保留缺失检测和不绑定降级，不把它当作不可变化的永久协议字段。

## 安全与产品边界

### Codex App 左侧任务列表

CodeLink 新建的微信会话会保存到本机 Codex 存储并返回 thread ID，但外部 App Server 没有公开接口向已经运行的 Codex App 侧栏推送新的任务事件。因此不保证微信新建的会话：

- 实时出现在左侧任务列表；
- 排在侧栏顶部；
- 自动打开或获得未读标记。

这条限制不影响已经存在并通过 `@CodeLink` 绑定的桌面任务。CodeLink 不会伪装官方客户端、修改 App SQLite/UI 状态、劫持私有 IPC 或使用未公开 deeplink 绕过限制。

### 其他边界

- 当前只处理文字消息；
- 微信续接不等于 HITL 审批，不能批准 Codex 工具调用或权限请求；
- daemon 作为非交互 App Server 客户端，会拒绝命令与文件审批以及 MCP elicitation，返回空的用户输入与权限授予，并对未知 server request 返回 method-not-supported 错误且在日志记录方法名，避免 turn 无期限等待且保持可诊断；
- 微信新建的会话统一使用 CodeLink 工作目录；绑定的桌面任务保持原项目、上下文和设置；
- 核心运行时面向官方 Codex 与 Node.js 22 覆盖的 macOS、Linux、Windows x64/arm64；macOS 已实机运行，Linux/Windows 安装器仍待对应系统首轮实机回归；
- 自动常驻分别使用 macOS LaunchAgent、Linux systemd user service 和 Windows 当前用户 Scheduled Task；非 systemd Linux 需要用户已有的进程管理器；
- 本地 daemon API 只应监听 loopback 地址。

## 验收标准

1. 裸登录不依赖 OpenClaw；
2. 微信第一条消息创建 thread，第二条普通消息沿用同一 ID；
3. `/new` 和明确自然语言切换后获得新 ID；
4. 桌面任务 `@CodeLink` 后收到带固定标识的微信通知；
5. 微信回复继续该桌面 thread；
6. 后续桌面任务通知可以覆盖当前绑定；
7. 较早任务在新绑定之后完成时，不会把当前会话切回去；
8. daemon 重启后仍能从保存的 thread ID 继续；
9. 长任务显示临时“正在输入”，普通最终回复不暴露内部 ID 或运行标签；
10. MCP 和日志不暴露 bot token、context token 或 typing ticket；
11. 两个新建 thread 的 ID 不同且 cwd 都等于同一个 CodeLink 工作目录，不再生成时间戳项目。

微信新建会话是否出现在 Codex App 侧栏不作为验收项。
