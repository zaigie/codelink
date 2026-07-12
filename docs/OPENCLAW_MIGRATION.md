# 可选：从已有 OpenClaw Bot 迁移

普通安装不需要阅读或执行本页。CodeLink 可以直接裸登录腾讯 iLink。

只有当用户明确要求沿用一台现有 OpenClaw 机器上的同一个 Bot 时，才使用这里的迁移工具。

在原机器的 CodeLink checkout 中：

```bash
cd plugins/codelink
npm ci
npm run build
node dist/cli.cjs export-openclaw /tmp/codelink-weixin-export.json ~/.openclaw
```

通过受保护通道把状态包传到新机器，再执行：

```bash
node dist/cli.cjs import-openclaw /secure/path/codelink-weixin-export.json
rm -f /secure/path/codelink-weixin-export.json
```

状态包权限为 `0600`，只包含微信连接所需的白名单字段。它仍然是敏感凭证，不得提交 Git、粘贴到聊天或保留在公共目录。
