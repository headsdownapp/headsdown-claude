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
last_error_fingerprint=""

emit_diagnostic() {
  local fingerprint="$1"
  local detail="$2"

  if [ "$fingerprint" != "$last_error_fingerprint" ]; then
    echo "[HeadsDown] Attention-window monitor warning: ${detail}" >&2
    last_error_fingerprint="$fingerprint"
  fi
}

while true; do
  if ! status_json=$(node "$CLI" status 2>/dev/null); then
    emit_diagnostic "status-command" "could not query headsdown status."
    sleep "$POLL_SECONDS"
    continue
  fi

  if [ -z "$status_json" ]; then
    emit_diagnostic "empty-status" "headsdown status returned no output."
    sleep "$POLL_SECONDS"
    continue
  fi

  if ! echo "$status_json" | jq -e . >/dev/null 2>&1; then
    emit_diagnostic "invalid-status-json" "headsdown status returned invalid JSON."
    sleep "$POLL_SECONDS"
    continue
  fi

  last_error_fingerprint=""
  call_key=$(echo "$status_json" | jq -r '.headsdownCall.key // .headsdownCall.knownKey // empty' 2>/dev/null || echo "")
  normalized_key=$(echo "$call_key" | tr '[:upper:]' '[:lower:]' | tr '-' '_' | xargs)

  deadline_at=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.deadlineAt // .availability.wrapUpGuidance.deadlineAt // empty' 2>/dev/null || echo "")
  threshold_minutes=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.thresholdMinutes // .availability.wrapUpGuidance.thresholdMinutes // empty' 2>/dev/null || echo "")
  remaining_minutes=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.remainingMinutes // .availability.wrapUpGuidance.remainingMinutes // empty' 2>/dev/null || echo "")
  hints=$(echo "$status_json" | jq -r '(.effectiveAttentionWindow.hints // .availability.wrapUpGuidance.hints // []) | map(select(type == "string" and length > 0)) | join("; ")' 2>/dev/null || echo "")
  effective_source=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.source // empty' 2>/dev/null || echo "")
  should_warn="false"

  if [ "$normalized_key" = "attention_window_closing" ]; then
    should_warn="true"
  elif [ "$effective_source" = "time_box" ] && [ -n "$remaining_minutes" ] && [ -n "$threshold_minutes" ]; then
    if [ "$remaining_minutes" -le "$threshold_minutes" ] 2>/dev/null; then
      should_warn="true"
    fi
  fi

  if [ "$should_warn" = "true" ]; then
    fingerprint="${deadline_at}|${threshold_minutes}"
    if [ -n "$deadline_at" ] && [ "$fingerprint" != "$last_fingerprint" ]; then
      notice="[HeadsDown] Window closing. Use /headsdown:extend to request more time or /headsdown:wrap to pause and summarize."
      if [ "$effective_source" = "time_box" ]; then
        notice="$notice Active box deadline is driving this warning."
      fi
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

  sleep "$POLL_SECONDS"
done
