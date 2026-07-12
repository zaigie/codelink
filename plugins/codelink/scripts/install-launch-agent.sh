#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_DIR=$(dirname "$SCRIPT_DIR")
NODE_BIN="${CODELINK_NODE_BIN:-$(command -v node)}"
CODEX_BIN="${CODELINK_CODEX_BIN:-$(command -v codex)}"
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

"$NODE_BIN" "$SCRIPT_DIR/render-launch-agent.mjs" \
  "$PLUGIN_DIR/scripts/launch-agent.plist.template" \
  "$PLIST_PATH" \
  "$LABEL" \
  "$NODE_BIN" \
  "$CODEX_BIN" \
  "$RUNTIME_CLI" \
  "$RUNTIME_DIR" \
  "$LOG_DIR" \
  "$LOG_DIR"
chmod 600 "$PLIST_PATH"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true

# launchd may report EIO when a service is bootstrapped immediately after
# bootout. Wait for the old label to disappear, then retry a bounded number
# of times so upgrades remain unattended and deterministic.
wait_count=0
while launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; do
  wait_count=$((wait_count + 1))
  if [ "$wait_count" -ge 10 ]; then
    echo "Timed out waiting for $LABEL to stop" >&2
    exit 1
  fi
  sleep 1
done

bootstrap_count=0
until launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"; do
  bootstrap_count=$((bootstrap_count + 1))
  if [ "$bootstrap_count" -ge 3 ]; then
    echo "Failed to bootstrap $LABEL after 3 attempts" >&2
    exit 1
  fi
  sleep 1
done
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "Installed and started $LABEL"
echo "Logs: $LOG_DIR/daemon.stdout.log and $LOG_DIR/daemon.stderr.log"
