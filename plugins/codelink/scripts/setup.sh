#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_DIR=$(dirname "$SCRIPT_DIR")
REPO_ROOT=$(CDPATH= cd -- "$PLUGIN_DIR/../.." && pwd)
STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "CodeLink 的自动安装目前仅支持 macOS。" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js 22 或更高版本。请先安装 Node.js。" >&2
  exit 1
fi

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 版本过低：需要 22+，当前为 $(node --version)。" >&2
  exit 1
fi

if [ -n "${CODELINK_CODEX_BIN:-}" ]; then
  CODEX_BIN="$CODELINK_CODEX_BIN"
elif [ -x "/Applications/ChatGPT.app/Contents/Resources/codex" ]; then
  CODEX_BIN="/Applications/ChatGPT.app/Contents/Resources/codex"
elif [ -x "/Applications/Codex.app/Contents/Resources/codex" ]; then
  CODEX_BIN="/Applications/Codex.app/Contents/Resources/codex"
elif command -v codex >/dev/null 2>&1; then
  CODEX_BIN=$(command -v codex)
else
  echo "未找到 ChatGPT/Codex App 或 codex CLI。请先安装并登录 Codex。" >&2
  exit 1
fi

echo "[1/5] 安装依赖并构建 CodeLink"
cd "$PLUGIN_DIR"
npm ci
npm run build

echo "[2/5] 安装 Codex 插件"
"$CODEX_BIN" plugin marketplace add "$REPO_ROOT"
"$CODEX_BIN" plugin add codelink@codelink-local

echo "[3/5] 登录微信"
if [ -f "$STATE_DIR/weixin-session.json" ]; then
  echo "检测到已有 CodeLink 微信会话，跳过扫码。需要换号时请手动运行：node dist/cli.cjs login"
else
  node dist/cli.cjs login
fi

echo "[4/5] 安装并启动后台服务"
chmod +x scripts/*.sh
./scripts/install-launch-agent.sh

echo "[5/5] 验证服务"
attempt=0
until curl -fsS http://127.0.0.1:18791/health >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 10 ]; then
    echo "后台服务未就绪。请检查 $STATE_DIR/daemon.stderr.log" >&2
    exit 1
  fi
  sleep 1
done

echo "CodeLink 安装完成。请新建一个 Codex 任务，让插件和 MCP 工具生效。"
echo "随后从微信向刚绑定的 Bot 发送 /status 进行最终验证。"
