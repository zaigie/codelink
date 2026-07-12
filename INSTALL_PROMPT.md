# 复制给 Codex 的安装提示词

将下面整段复制到一个新的 Codex 任务中：

```text
请帮我在这台 Mac 上安装 CodeLink：
https://github.com/zaigie/codelink

要求：
1. 克隆仓库后，先完整阅读仓库根目录的 INSTALL.md，并严格按它执行。
2. 不要安装或启动 OpenClaw，不要从 ~/.openclaw 或其他机器复制 session/token。
3. 使用仓库提供的 plugins/codelink/scripts/setup.sh 完成依赖安装、构建、插件安装和 LaunchAgent 注册。
4. 当 CodeLink 生成微信二维码时，把 login-qr.png 直接展示给我，然后暂停等待我扫码。
5. 扫码后继续验证 localhost 健康状态、微信 /status、微信触发独立 Codex 会话并收到结果，以及 Codex 主动发送微信通知。
6. 接受仓库 docs/CAPABILITY_BOUNDARY.md 中的边界：外部会话不保证出现在 Codex App 左侧任务列表；不要伪装官方客户端、修改 App 数据库或连接私有 IPC。
7. 任何输出、日志、提交和聊天消息都不得包含 bot_token、context_token 或完整 session 内容。
8. 完成后告诉我安装路径、LaunchAgent 状态、插件版本和逐项验收结果。
```
