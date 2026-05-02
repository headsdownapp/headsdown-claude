#!/bin/bash
# HeadsDown UserPromptSubmit hook
# Injects fresh autopilot classifier policy into Claude context when the user is offline.

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"

if [ ! -f "$CLI" ]; then
  exit 0
fi

node "$CLI" autopilot prompt
