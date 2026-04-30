#!/bin/bash
# HeadsDown monitor for attention-window-closing calls.
# Emits a notification line when the warning fingerprint changes.

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"
if [ ! -f "$CLI" ]; then
  exit 0
fi

SESSION_ID="${CLAUDE_SESSION_ID:-default}"
STATE_FILE="/tmp/headsdown-attention-window-monitor-${SESSION_ID}.state"
POLL_SECONDS="${HEADSDOWN_ATTENTION_MONITOR_INTERVAL_SECONDS:-8}"

last_fingerprint=""
if [ -f "$STATE_FILE" ]; then
  last_fingerprint=$(cat "$STATE_FILE" 2>/dev/null || echo "")
fi

while true; do
  status_json=$(node "$CLI" status 2>/dev/null || echo "")

  if [ -n "$status_json" ]; then
    call_key=$(echo "$status_json" | jq -r '.headsdownCall.key // .headsdownCall.knownKey // empty' 2>/dev/null || echo "")
    normalized_key=$(echo "$call_key" | tr '[:upper:]' '[:lower:]' | tr '-' '_' | xargs)

    if [ "$normalized_key" = "attention_window_closing" ]; then
      deadline_at=$(echo "$status_json" | jq -r '.availability.wrapUpGuidance.deadlineAt // empty' 2>/dev/null || echo "")
      threshold_minutes=$(echo "$status_json" | jq -r '.availability.wrapUpGuidance.thresholdMinutes // empty' 2>/dev/null || echo "")
      remaining_minutes=$(echo "$status_json" | jq -r '.availability.wrapUpGuidance.remainingMinutes // empty' 2>/dev/null || echo "")
      hints=$(echo "$status_json" | jq -r '(.availability.wrapUpGuidance.hints // []) | map(select(type == "string" and length > 0)) | join("; ")' 2>/dev/null || echo "")

      fingerprint="${deadline_at}|${threshold_minutes}"
      if [ -n "$deadline_at" ] && [ "$fingerprint" != "$last_fingerprint" ]; then
        notice="[HeadsDown] Window closing. Use /headsdown:extend to request more time or /headsdown:wrap to pause and summarize."
        if [ -n "$remaining_minutes" ]; then
          notice="$notice Remaining minutes: ${remaining_minutes}."
        fi
        if [ -n "$hints" ]; then
          notice="$notice Hints: ${hints}."
        fi
        echo "$notice"
        last_fingerprint="$fingerprint"
        printf '%s' "$last_fingerprint" > "$STATE_FILE"
      fi
    fi
  fi

  sleep "$POLL_SECONDS"
done
