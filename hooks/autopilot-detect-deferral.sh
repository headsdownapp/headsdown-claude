#!/bin/bash
# HeadsDown Stop hook
# Captures privacy-safe autopilot deferrals after assistant text turns.
# Exits silently on any error and must never disrupt session end.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  exit 0
fi

CLI="$PLUGIN_ROOT/dist/cli.js"

if [ ! -f "$CLI" ]; then
  exit 0
fi

node "$CLI" autopilot detect-deferral 2>/dev/null || exit 0
