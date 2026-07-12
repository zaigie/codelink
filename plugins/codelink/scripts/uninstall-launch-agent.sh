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
    if [ "$output" = "Boot-out failed: 3: No such process" ]; then
      exit 0
    fi
    printf '%s\n' "$output" >&2
    exit 1
    ;;
  --service-cleanup)
    rm -f "$PLIST_PATH"
    rm -rf "$STATE_DIR/runtime"
    exit 0
    ;;
  "")
    NODE_BIN="${CODELINK_NODE_BIN:-$(command -v node)}"
    exec "$NODE_BIN" "$SCRIPT_DIR/uninstall.mjs" --platform darwin
    ;;
  *)
    echo "Unknown uninstall phase: $1" >&2
    exit 2
    ;;
esac
