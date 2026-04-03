#!/bin/bash
# HeadsDown SessionStart hook
# Injects the user's current availability into Claude's context at session start.
# If not authenticated or the API is unreachable, exits silently (no disruption).

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"

# Only run if the CLI exists and is built
if [ ! -f "$CLI" ]; then
  exit 0
fi

# Try to fetch availability. If it fails (not authenticated, network error),
# exit cleanly so the session starts without disruption.
output=$(node "$CLI" status 2>/dev/null) || exit 0

# If we got valid JSON output, format it as a system message for Claude
if echo "$output" | jq -e . > /dev/null 2>&1; then
  mode=$(echo "$output" | jq -r '.contract.mode // "unknown"')
  status_text=$(echo "$output" | jq -r '.contract.statusText // empty')
  summary=$(echo "$output" | jq -r '.summary // empty')
  off_hours=$(echo "$output" | jq -r '.calendar.offHours // false')
  work_hours=$(echo "$output" | jq -r '.calendar.workHours // false')

  # Build context message
  context="[HeadsDown] User availability at session start:"

  if [ "$mode" = "null" ] || [ "$mode" = "unknown" ]; then
    context="$context No active availability contract set."
  else
    context="$context Mode: $mode."
    if [ -n "$status_text" ] && [ "$status_text" != "null" ]; then
      context="$context Status: $status_text."
    fi
  fi

  if [ "$off_hours" = "true" ]; then
    context="$context Currently off-hours."
  elif [ "$work_hours" = "true" ]; then
    context="$context Work hours active."
  fi

  if [ -n "$summary" ] && [ "$summary" != "null" ]; then
    context="$context ($summary)"
  fi

  # Output as JSON with systemMessage so Claude sees it in context
  echo "{\"systemMessage\": \"$context\"}"
fi
