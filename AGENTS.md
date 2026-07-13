# CodeLink 开发约定

## 沟通

- 始终使用简体中文回复。
- 先说明用户可感知的结果，再说明实现细节和验证证据。
- 不把尚未实机验证的平台、协议或 Codex 能力描述成已经支持。

## 产品与架构边界

- CodeLink 是“微信与 Codex 当前会话之间的轻量桥”，不是完整的远程 Codex 控制台，也不依赖或部署 OpenClaw。
- 只使用腾讯公开 iLink 协议和 OpenAI 公开 Codex/App Server/插件接口；不得修改 Codex App 数据库、伪装官方客户端或依赖私有 IPC。
- 每个微信用户只维护一个当前 Codex thread。桌面任务通知可覆盖当前绑定；较早任务完成不得抢回较新的绑定。
- 微信普通消息继续当前 thread；`/new` 或明确的自然语言新会话意图才切换上下文。
- 微信续接不是 HITL 审批，不得通过微信自动批准工具调用或权限请求。

## 状态与安全

- 源码、预构建运行时和用户状态必须分离。升级、重装插件和替换 runtime 时必须保留 `~/.codelink` 中的微信 session、同步游标、context token、会话绑定和任务记录。
- 不得在测试、日志、聊天、提交或 issue 中输出 bot token、context token、二维码内容、完整 session、微信用户 ID 或健康接口中的内部标识。
- 状态目录使用 `0700`，凭证、绑定、安装回执等状态文件使用 `0600`；写入必须保持原子替换语义。
- 二维码是短期敏感产物。Codex 安装流程使用 PNG-only 模式，在主会话展示，成功或超时后清理；终端二维码仅作为直接 CLI 的兼容交互。
- 卸载默认移除常驻服务、runtime、CodeLink 插件注册与本地 marketplace；Codex 不可用时跳过插件步骤但仍完成其余卸载。删除用户状态必须获得用户明确确认。

## 测试方法

- 修改前先运行相关基线测试。优先采用纵向红绿切片：一条用户可观察行为测试失败后，只实现使其通过的最小代码，再进入下一条。
- 测试公共接口和真实协议边界，不依赖私有实现细节。关键缝隙包括：iLink 请求协议、App Server JSON-RPC、daemon HTTP、MCP stdio、持久状态、安装器 CLI 和各平台服务脚本。
- 时间、并发和恢复逻辑必须覆盖慢请求、迟到结果、重复调用、进程重启、旧状态升级和部分投递失败。
- 开发中经常运行定向测试和 `npm run typecheck`；交付前必须运行完整 `npm test`、`npm run typecheck`、`npm run build`，并验证预构建 runtime 清单没有陈旧。
- 安装链路必须在干净依赖环境验证 `npm ci`，并覆盖仓库声明的 Node/npm 组合。普通用户安装链路不得依赖 npm。

## 构建与安装

- `plugins/codelink/dist/cli.cjs`、`dist/mcp.js` 和 `dist/runtime-manifest.json` 是面向用户安装的已发布产物，必须与源码一起提交。
- 修改会进入 CLI 或 MCP bundle 的源码后必须运行 `npm run build`，不得只提交 TypeScript 源码或手工修改 bundle/哈希清单。
- 普通安装使用 `setup.mjs` 消费并校验预构建 runtime；`--build` 只用于开发者显式重建，不能成为缺少发布产物时的静默回退。
- 安装、更新和服务重启不得破坏已有微信登录态。安装失败应保留可重试状态，并给出短错误码和下一步。

## 本地插件更新流程

- 插件源码、Skill、MCP 或 manifest 变化后，使用 `plugin-creator/scripts/update_plugin_cachebuster.py` 替换 `.codex-plugin/plugin.json` 的 cachebuster，不要手工叠加版本后缀。
- 更新后验证插件结构，确认 repo marketplace 仍指向当前源码；随后重新安装 `codelink@codelink-local`，重启对应用户态服务并等待安全健康检查通过。
- 真实微信验证复用现有 session，只输出成功或失败；不得为了验收强迫用户重新扫码。
- 最终提示用户新建 Codex 任务；如果新任务仍看不到工具，再重启 Codex App。旧任务不作为新版插件加载失败的证据。

## 文档与交付

- 行为、安装要求、平台状态或能力边界变化时，同步更新 README、INSTALL、Skill 和能力边界文档。
- 功能完成后审查两条轴：是否符合仓库约定；是否完整满足用户需求且没有范围蔓延或负面功能回退。
- 只提交当前任务相关文件。是否推送远端由用户请求决定；本地插件重装与 Git 推送是两个独立动作。
