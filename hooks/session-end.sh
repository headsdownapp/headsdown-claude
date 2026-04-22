#!/bin/bash
# HeadsDown Stop hook
# Auto-reports task outcome to HeadsDown when a session ends with an approved proposal.
# Outcome: partially_completed if a continuation artifact exists, completed otherwise.
# Exits silently on any error — must never disrupt session end.

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"

if [ ! -f "$CLI" ]; then
  exit 0
fi

node "$CLI" report 2>/dev/null || exit 0
