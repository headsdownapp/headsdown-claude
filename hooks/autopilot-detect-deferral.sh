#!/bin/bash
# HeadsDown Stop hook
# Captures privacy-safe autopilot deferrals after assistant text turns.
# Exit 2 is intentional for anti-stuck nudges; other local errors fail open.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  exit 0
fi

CLI="$PLUGIN_ROOT/dist/cli.js"

if [ ! -f "$CLI" ]; then
  exit 0
fi

stderr_file=$(mktemp)
set +e
node "$CLI" autopilot detect-deferral 2>"$stderr_file"
status=$?
set -e

if [ "$status" -eq 2 ]; then
  cat "$stderr_file" >&2
  rm -f "$stderr_file"
  exit 2
fi

rm -f "$stderr_file"
exit 0
