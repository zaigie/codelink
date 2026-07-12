#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js 22 或更高版本。请先安装 Node.js。" >&2
  exit 1
fi
exec node "$SCRIPT_DIR/setup.mjs" "$@"
