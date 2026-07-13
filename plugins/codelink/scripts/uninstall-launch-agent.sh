#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LABEL="ai.codelink.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"

case "${1:-}" in
  --service-stop)
    if output=$(launchctl bootout "gui/$(id -u)/$LABEL" 2>&1); then
      exit 0
    fi
    case "$output" in
      *"No such process"*)
        exit 0
        ;;
    esac
    printf '%s\n' "$output" >&2
    exit 1
    ;;
  --service-cleanup)
    rm -f "$PLIST_PATH"
    rm -rf "$STATE_DIR/runtime"
    exit 0
    ;;
  "")
    NODE_BIN="${CODELINK_NODE_BIN:-$(command -v node || true)}"
    if [ -z "$NODE_BIN" ]; then
      echo "未找到 node；请设置 CODELINK_NODE_BIN 后重新运行卸载。" >&2
      exit 1
    fi
    exec "$NODE_BIN" "$SCRIPT_DIR/uninstall.mjs" --platform darwin
    ;;
  *)
    echo "Unknown uninstall phase: $1" >&2
    exit 2
    ;;
esac
