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
  wrap_up_instruction=$(echo "$output" | jq -r '.wrapUpInstruction // empty')
  in_reachable_hours=$(echo "$output" | jq -r '.availability.inReachableHours // false')
  active_window_label=$(echo "$output" | jq -r '.availability.activeWindow.label // empty')

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

  if [ "$in_reachable_hours" = "true" ]; then
    context="$context Currently in available hours."
  else
    context="$context Currently outside available hours."
  fi

  if [ -n "$active_window_label" ] && [ "$active_window_label" != "null" ]; then
    context="$context Active window: $active_window_label."
  fi

  if [ -n "$summary" ] && [ "$summary" != "null" ]; then
    context="$context ($summary)"
  fi

  if [ -n "$wrap_up_instruction" ] && [ "$wrap_up_instruction" != "null" ]; then
    context="$context Execution guidance: $wrap_up_instruction"
  fi

  # Check for pending digest entries
  digest_count=$(node "$CLI" digest-count 2>/dev/null) || digest_count="0"
  if [ "$digest_count" != "0" ] && [ -n "$digest_count" ]; then
    if [ "$digest_count" = "1" ]; then
      context="$context You have 1 digest summary from your last focus session. Use headsdown_digest to review what you missed."
    else
      context="$context You have $digest_count digest summaries from your last focus session. Use headsdown_digest to review what you missed."
    fi
  fi

  # Output as JSON with systemMessage so Claude sees it in context
  echo "{\"systemMessage\": \"$context\"}"
fi
