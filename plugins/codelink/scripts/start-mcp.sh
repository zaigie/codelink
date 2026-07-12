#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_DIR=$(dirname "$SCRIPT_DIR")
exec node "$PLUGIN_DIR/dist/mcp.js"
