#!/bin/bash
set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  exit 0
fi

CLI="$PLUGIN_ROOT/dist/cli.js"
if [ ! -f "$CLI" ]; then
  exit 0
fi

EVENT_NAME="${1:-}"
if [ -z "$EVENT_NAME" ]; then
  exit 0
fi

exec node "$CLI" hook "$EVENT_NAME"
