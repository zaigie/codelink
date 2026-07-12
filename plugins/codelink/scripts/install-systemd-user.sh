#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_DIR=$(dirname "$SCRIPT_DIR")
LABEL="ai.codelink.daemon"
STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"
RUNTIME_DIR="$STATE_DIR/runtime"
RUNTIME_CLI="$RUNTIME_DIR/cli.cjs"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/$LABEL.service"
NODE_BIN="${CODELINK_NODE_BIN:-$(command -v node)}"
CODEX_BIN="${CODELINK_CODEX_BIN:-$(command -v codex)}"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "未找到 systemctl；请使用 --no-service 后由现有进程管理器运行 codelink daemon。" >&2
  exit 1
fi

unit_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/%/%%/g'
}

mkdir -p "$STATE_DIR" "$RUNTIME_DIR" "$UNIT_DIR"
chmod 700 "$STATE_DIR" "$RUNTIME_DIR"
rm -f "$RUNTIME_DIR/cli.js" "$RUNTIME_DIR/cli.mjs" "$RUNTIME_DIR/cli.cjs"
cp "$PLUGIN_DIR/dist/cli.cjs" "$RUNTIME_CLI"
chmod 700 "$RUNTIME_CLI"

NODE_VALUE=$(unit_escape "$NODE_BIN")
CODEX_VALUE=$(unit_escape "$CODEX_BIN")
CLI_VALUE=$(unit_escape "$RUNTIME_CLI")
RUNTIME_VALUE=$(unit_escape "$RUNTIME_DIR")
STATE_VALUE=$(unit_escape "$STATE_DIR")

{
  printf '%s\n' '[Unit]'
  printf '%s\n' 'Description=CodeLink WeChat bridge'
  printf '%s\n' 'After=network-online.target'
  printf '%s\n' 'Wants=network-online.target'
  printf '\n%s\n' '[Service]'
  printf 'Type=simple\n'
  printf 'ExecStart="%s" "%s" daemon\n' "$NODE_VALUE" "$CLI_VALUE"
  printf 'WorkingDirectory="%s"\n' "$RUNTIME_VALUE"
  printf 'Environment="CODELINK_STATE_DIR=%s"\n' "$STATE_VALUE"
  printf 'Environment="CODELINK_CODEX_BIN=%s"\n' "$CODEX_VALUE"
  printf '%s\n' 'Restart=always'
  printf '%s\n' 'RestartSec=10'
  printf '\n%s\n' '[Install]'
  printf '%s\n' 'WantedBy=default.target'
} > "$UNIT_PATH"
chmod 600 "$UNIT_PATH"

systemctl --user daemon-reload
systemctl --user enable "$LABEL.service"
systemctl --user restart "$LABEL.service"
echo "Installed and started $LABEL.service"
echo "Logs: journalctl --user -u $LABEL.service"
