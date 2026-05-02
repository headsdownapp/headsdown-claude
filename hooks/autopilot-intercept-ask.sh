#!/bin/bash
# HeadsDown PreToolUse hook
# Denies AskUserQuestion during autopilot mode and asks Claude to defer instead.
# Exits silently on local errors so normal Claude sessions are not disrupted.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  exit 0
fi

CLI="$PLUGIN_ROOT/dist/cli.js"

if [ ! -f "$CLI" ]; then
  exit 0
fi

node "$CLI" autopilot intercept-ask 2>/dev/null || exit 0
