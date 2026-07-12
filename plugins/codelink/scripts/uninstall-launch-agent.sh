#!/bin/sh
set -eu
LABEL="ai.codelink.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"
rm -rf "$STATE_DIR/runtime"
echo "Uninstalled $LABEL (state in $STATE_DIR was preserved)"
