#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LABEL="ai.codelink.daemon"
STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/$LABEL.service"

load_state() {
  if output=$(systemctl --user show "$LABEL.service" --property=LoadState --value 2>&1); then
    printf '%s' "$output"
    return 0
  fi
  printf '%s\n' "$output" >&2
  return 1
}

case "${1:-}" in
  --service-stop)
    current_state=$(load_state)
    if [ "$current_state" = "not-found" ]; then
      exit 0
    fi
    systemctl --user stop "$LABEL.service"
    exit 0
    ;;
  --service-cleanup)
    current_state=$(load_state)
    if [ "$current_state" != "not-found" ]; then
      systemctl --user disable "$LABEL.service"
    fi
    rm -f "$UNIT_PATH"
    systemctl --user daemon-reload
    rm -rf "$STATE_DIR/runtime"
    exit 0
    ;;
  "")
    NODE_BIN="${CODELINK_NODE_BIN:-$(command -v node || true)}"
    if [ -z "$NODE_BIN" ]; then
      echo "未找到 node；请设置 CODELINK_NODE_BIN 后重新运行卸载。" >&2
      exit 1
    fi
    exec "$NODE_BIN" "$SCRIPT_DIR/uninstall.mjs" --platform linux
    ;;
  *)
    echo "Unknown uninstall phase: $1" >&2
    exit 2
    ;;
esac
