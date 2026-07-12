#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_DIR=$(dirname "$SCRIPT_DIR")
NODE_BIN=$(command -v node)
LABEL="ai.codelink.daemon"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="${CODELINK_STATE_DIR:-$HOME/.codelink}"
RUNTIME_DIR="$LOG_DIR/runtime"
RUNTIME_CLI="$RUNTIME_DIR/cli.cjs"

mkdir -p "$PLIST_DIR" "$LOG_DIR" "$RUNTIME_DIR"
chmod 700 "$LOG_DIR" "$RUNTIME_DIR"
rm -f "$RUNTIME_DIR/cli.js" "$RUNTIME_DIR/cli.mjs" "$RUNTIME_DIR/cli.cjs"
cp "$PLUGIN_DIR/dist/cli.cjs" "$RUNTIME_CLI"
chmod 700 "$RUNTIME_CLI"

sed \
  -e "s|__LABEL__|$LABEL|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__CLI_PATH__|$RUNTIME_CLI|g" \
  -e "s|__WORKDIR__|$RUNTIME_DIR|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__STATE_DIR__|$LOG_DIR|g" \
  "$PLUGIN_DIR/scripts/launch-agent.plist.template" > "$PLIST_PATH"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "Installed and started $LABEL"
echo "Logs: $LOG_DIR/daemon.stdout.log and $LOG_DIR/daemon.stderr.log"
