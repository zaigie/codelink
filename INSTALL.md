# CodeLink 固定安装要求

这份文件是 CodeLink 的安装契约。无论由用户还是 Codex 执行安装，都应以这里的步骤为准。

## 结论先说

安装 CodeLink **不需要 OpenClaw**，也不需要从 OpenClaw 复制 session。首次安装直接运行 CodeLink 自带的登录命令，扫描腾讯 iLink 二维码即可。

## 支持范围

- macOS；
- Node.js 22 或更高版本；
- 已安装并登录 ChatGPT/Codex App，或已登录的 Codex CLI；
- Git 和可正常访问 GitHub、npm、腾讯 iLink 的网络；
- 一个能够使用微信 ClawBot/iLink 的微信账号。

自动常驻使用 macOS LaunchAgent。其他系统目前不在小白安装支持范围内。

## 安装

```bash
git clone https://github.com/zaigie/codelink.git
cd codelink
chmod +x plugins/codelink/scripts/*.sh
./plugins/codelink/scripts/setup.sh
```

安装脚本会依次完成：

1. 使用 `npm ci` 安装锁定依赖并构建；
2. 添加仓库内 marketplace 并安装 `codelink` 插件；
3. 在没有 CodeLink session 时显示微信二维码并等待扫码；
4. 把单文件运行时安装到 `~/.codelink/runtime`；
5. 注册 LaunchAgent，并验证 `127.0.0.1:18791` 健康状态。

扫码产生的凭证只保存在 `~/.codelink`，权限为 `0600`。安装器不会读取 `~/.openclaw`。

## 验收

安装完成后：

1. 新建一个 Codex 任务，使新插件生效；
2. 在 Codex 中说“检查微信连接状态”；
3. 从微信向 Bot 发送 `/status`；
4. 再发送一条普通文字，确认微信先收到“正在创建任务”，随后收到带 thread ID 的最终结果；
5. 在任意 Codex 任务中说“完成后通过微信通知我”，确认收到主动通知。

## 更新

```bash
cd codelink
git pull
./plugins/codelink/scripts/setup.sh
```

已有 `~/.codelink/weixin-session.json` 时不会要求重复扫码。

## 卸载

```bash
cd codelink/plugins/codelink
./scripts/uninstall-launch-agent.sh
```

卸载脚本保留 `~/.codelink` 中的微信会话和任务状态。如需彻底删除凭证，请由用户自行确认后删除该目录。

## 常见问题

### 二维码过期

重新运行：

```bash
cd codelink/plugins/codelink
node dist/cli.cjs login
```

不要先安装 OpenClaw，也不要复制其他机器的 token。只有正在迁移一个已有 OpenClaw Bot 时，才需要参考可选的 [迁移说明](docs/OPENCLAW_MIGRATION.md)。

### 为什么微信会话没有出现在 Codex App 左侧

这是当前明确的能力边界。CodeLink 通过官方 App Server 启动独立 Codex 会话，但外部 App Server 没有公开接口向正在运行的 Codex App 侧栏推送新任务。会话仍会返回 thread ID、保存在 Codex 本地存储，并可通过 CodeLink 的近期任务工具查询。详见 [能力边界](docs/CAPABILITY_BOUNDARY.md)。

### 后台服务没有启动

```bash
curl http://127.0.0.1:18791/health
tail -n 100 ~/.codelink/daemon.stderr.log
```

任何日志、截图或反馈中都不要粘贴 `weixin-session.json`、`context-tokens.json` 或其中的 token。
