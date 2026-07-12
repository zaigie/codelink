# 可选：从已有 OpenClaw Bot 迁移

普通安装不需要阅读或执行本页。CodeLink 可以直接裸登录腾讯 iLink。

只有当用户明确要求沿用一台现有 OpenClaw 机器上的同一个 Bot 时，才使用这里的迁移工具。

在原机器的 CodeLink checkout 中，先选择与当前 shell 匹配的命令。macOS/Linux（POSIX shell）：

```bash
cd plugins/codelink
EXPORT_FILE="${TMPDIR:-/tmp}/codelink-weixin-export.json"
OPENCLAW_STATE_DIR="$HOME/.openclaw"
node dist/cli.cjs export-openclaw "$EXPORT_FILE" "$OPENCLAW_STATE_DIR"
```

Windows PowerShell：

```powershell
Set-Location plugins\codelink
$ExportFile = Join-Path ([System.IO.Path]::GetTempPath()) "codelink-weixin-export.json"
$OpenClawStateDir = Join-Path $HOME ".openclaw"
node dist\cli.cjs export-openclaw $ExportFile $OpenClawStateDir
```

通过受保护通道把状态包传到新机器，再把下面的 `<状态包路径>` 替换为该机器上的实际路径：

```text
node dist/cli.cjs import-openclaw <状态包路径>
```

导入成功后使用当前平台的安全删除方式清理该文件。状态包在 Unix 上的权限为 `0600`，只包含微信连接所需的白名单字段；Windows 使用当前用户目录或临时目录继承的 ACL。它仍然是敏感凭证，不得提交 Git、粘贴到聊天或保留在公共目录。
