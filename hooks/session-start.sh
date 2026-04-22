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
  # Axis 1: availability mode (user-set)
  mode=$(echo "$output" | jq -r '.contract.mode // "unknown"')
  status_text=$(echo "$output" | jq -r '.contract.statusText // empty')
  # Axis 2: execution directive (schedule-derived)
  execution_directive_code=$(echo "$output" | jq -r '.executionDirective.code // empty')
  execution_directive_summary=$(echo "$output" | jq -r '.executionDirective.summary // empty')
  # Supporting context
  summary=$(echo "$output" | jq -r '.summary // empty')
  wrap_up_instruction=$(echo "$output" | jq -r '.wrapUpInstruction // empty')
  remaining_minutes=$(echo "$output" | jq -r '.availability.wrapUpGuidance.remainingMinutes // empty')
  in_reachable_hours=$(echo "$output" | jq -r '.availability.inReachableHours // false')
  active_window_label=$(echo "$output" | jq -r '.availability.activeWindow.label // empty')

  # Build context message
  context="[HeadsDown] User availability at session start:"

  # Axis 1
  if [ "$mode" = "null" ] || [ "$mode" = "unknown" ]; then
    context="$context Axis 1 (availability mode): not set."
  else
    context="$context Axis 1 (availability mode, user-set): $mode."
    if [ -n "$status_text" ] && [ "$status_text" != "null" ]; then
      context="$context Status: $status_text."
    fi
  fi

  # Axis 2
  if [ -n "$execution_directive_code" ] && [ "$execution_directive_code" != "null" ]; then
    context="$context Axis 2 (execution directive, schedule-derived): $execution_directive_code."
    if [ -n "$execution_directive_summary" ] && [ "$execution_directive_summary" != "null" ]; then
      context="$context $execution_directive_summary"
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

  if [ -n "$remaining_minutes" ] && [ "$remaining_minutes" != "null" ]; then
    context="$context Remaining attention budget: ${remaining_minutes} minutes."
  fi

  if [ -n "$wrap_up_instruction" ] && [ "$wrap_up_instruction" != "null" ]; then
    context="$context Execution guidance: $wrap_up_instruction"
  fi

  # Check for imminent availability window transitions (within 60 minutes)
  transition_json=$(node "$CLI" next-window 2>/dev/null) || transition_json="null"
  if [ -n "$transition_json" ] && [ "$transition_json" != "null" ]; then
    minutes_until=$(echo "$transition_json" | jq -r '.minutesUntil // empty')
    next_label=$(echo "$transition_json" | jq -r '.nextWindowLabel // empty')
    next_mode=$(echo "$transition_json" | jq -r '.nextWindowMode // empty')
    wrap_threshold=$(echo "$transition_json" | jq -r '.wrapUpThresholdMinutes // empty')

    if [ -n "$minutes_until" ] && [ "$minutes_until" != "null" ]; then
      if [ -n "$next_label" ] && [ "$next_label" != "null" ]; then
        context="$context Transition in ${minutes_until} minutes: next window is '${next_label}' (${next_mode})."
      else
        context="$context Availability window transition in ${minutes_until} minutes."
      fi
      if [ -n "$wrap_threshold" ] && [ "$wrap_threshold" != "null" ]; then
        context="$context Wrap-up threshold is ${wrap_threshold} minutes before transition."
      fi
    fi
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

  # Check for a continuation artifact from a previous session
  if node "$CLI" continuation check 2>/dev/null; then
    # Peek at the file for a summary — don't consume it; Claude does that via the MCP tool
    CONTINUATION_FILE="$HOME/.config/headsdown/continuation.json"
    if [ -f "$CONTINUATION_FILE" ]; then
      resume=$(jq -r '.resumeInstruction // empty' "$CONTINUATION_FILE" 2>/dev/null)
      branch=$(jq -r '.branch // empty' "$CONTINUATION_FILE" 2>/dev/null)
      pending_count=$(jq -r '.pendingSteps | length' "$CONTINUATION_FILE" 2>/dev/null)

      continuation_msg="A previous session left resumable work."
      if [ -n "$branch" ] && [ "$branch" != "null" ]; then
        continuation_msg="$continuation_msg Branch: ${branch}."
      fi
      if [ -n "$pending_count" ] && [ "$pending_count" != "0" ]; then
        continuation_msg="$continuation_msg ${pending_count} step(s) remaining."
      fi
      if [ -n "$resume" ] && [ "$resume" != "null" ]; then
        continuation_msg="$continuation_msg Resume: ${resume}"
      fi
      continuation_msg="$continuation_msg Call headsdown_continuation with action 'load' for full details."

      context="$context [Continuation] $continuation_msg"
    fi
  fi

  # Output as JSON with systemMessage so Claude sees it in context
  echo "{\"systemMessage\": \"$context\"}"
fi
