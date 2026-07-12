#!/bin/sh
set -eu

LABEL="ai.codelink.daemon"
STATE_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/$LABEL.service"

systemctl --user disable --now "$LABEL.service" >/dev/null 2>&1 || true
rm -f "$UNIT_PATH"
systemctl --user daemon-reload
systemctl --user reset-failed "$LABEL.service" >/dev/null 2>&1 || true
rm -rf "$STATE_DIR/runtime"
echo "Uninstalled $LABEL.service (state in $STATE_DIR was preserved)"
