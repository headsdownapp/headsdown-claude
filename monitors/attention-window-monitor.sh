#!/bin/bash
# HeadsDown monitor for attention-window and local box deadline warnings.
# Emits a notification line when the warning fingerprint changes.

set -euo pipefail

# Claude Code substitutes ${CLAUDE_PLUGIN_ROOT} in the command string but does
# not export it as an env var to monitor processes (hooks do get it). Derive
# the plugin root from this script's own location so set -u does not bite.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"
CLI="$PLUGIN_ROOT/dist/cli.js"
if [ ! -f "$CLI" ]; then
  exit 0
fi

SESSION_ID="${CLAUDE_SESSION_ID:-default}"
STATE_FILE="/tmp/headsdown-attention-window-monitor-${SESSION_ID}.state"
POLL_SECONDS="${HEADSDOWN_ATTENTION_MONITOR_INTERVAL_SECONDS:-8}"

cleanup() {
  exit 0
}

trap cleanup TERM INT

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

  time_box_error=$(echo "$status_json" | jq -r '.timeBoxError // empty' 2>/dev/null || echo "")
  if [ -n "$time_box_error" ]; then
    emit_diagnostic "time-box-error:${time_box_error}" "${time_box_error}"
  else
    last_error_fingerprint=""
  fi
  call_key=$(echo "$status_json" | jq -r '.headsdownCall.key // .headsdownCall.knownKey // empty' 2>/dev/null || echo "")
  normalized_key=$(echo "$call_key" | tr '[:upper:]' '[:lower:]' | tr '-' '_' | xargs)

  deadline_at=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.deadlineAt // .availability.wrapUpGuidance.deadlineAt // empty' 2>/dev/null || echo "")
  threshold_minutes=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.thresholdMinutes // .availability.wrapUpGuidance.thresholdMinutes // empty' 2>/dev/null || echo "")
  remaining_minutes=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.remainingMinutes // .availability.wrapUpGuidance.remainingMinutes // empty' 2>/dev/null || echo "")
  hints=$(echo "$status_json" | jq -r '(.effectiveAttentionWindow.hints // .availability.wrapUpGuidance.hints // []) | map(select(type == "string" and length > 0)) | join("; ")' 2>/dev/null || echo "")
  effective_source=$(echo "$status_json" | jq -r '.effectiveAttentionWindow.source // empty' 2>/dev/null || echo "")
  session_timebox_active=$(echo "$status_json" | jq -r 'if .sessionTimeboxPrompt.active == true then "true" else "false" end' 2>/dev/null || echo "false")
  session_timebox_fingerprint=$(echo "$status_json" | jq -r '.sessionTimeboxPrompt.fingerprint // empty' 2>/dev/null || echo "")
  session_timebox_session_id=$(echo "$status_json" | jq -r '.sessionTimeboxPrompt.sessionId // empty' 2>/dev/null || echo "")
  session_timebox_remaining=$(echo "$status_json" | jq -r '.sessionTimeboxPrompt.remainingMinutes // empty' 2>/dev/null || echo "")
  session_timebox_threshold=$(echo "$status_json" | jq -r '.sessionTimeboxPrompt.thresholdMinutes // empty' 2>/dev/null || echo "")
  resolved_attention_window_closing=$(echo "$status_json" | jq -r 'if has("attentionWindowClosing") then (.attentionWindowClosing | tostring) else "" end' 2>/dev/null || echo "")
  should_warn="false"

  if [ "$resolved_attention_window_closing" = "true" ]; then
    should_warn="true"
  elif [ "$resolved_attention_window_closing" = "false" ]; then
    should_warn="false"
  elif [ "$normalized_key" = "attention_window_closing" ]; then
    should_warn="true"
  elif [ "$effective_source" = "time_box" ] && [ -n "$remaining_minutes" ] && [ -n "$threshold_minutes" ]; then
    if [ "$remaining_minutes" -le "$threshold_minutes" ] 2>/dev/null; then
      should_warn="true"
    fi
  fi

  if [ "$session_timebox_active" = "true" ] && [ -n "$session_timebox_fingerprint" ]; then
    fingerprint="session-timebox:${session_timebox_fingerprint}"
    if [ "$fingerprint" != "$last_fingerprint" ]; then
      notice="[HeadsDown] Session timebox closing. Ask the user whether to request 15 more minutes, request 30 more minutes, or wrap up. If they choose more time, call headsdown_session_timebox with only session_id=${session_timebox_session_id} and the requested minute count."
      if [ -n "$session_timebox_remaining" ]; then
        notice="$notice Remaining minutes: ${session_timebox_remaining}."
      fi
      if [ -n "$session_timebox_threshold" ]; then
        notice="$notice Warning threshold minutes: ${session_timebox_threshold}."
      fi
      echo "$notice"
      last_fingerprint="$fingerprint"
      printf '%s' "$last_fingerprint" > "$STATE_FILE"
    fi
  elif [ "$should_warn" = "true" ]; then
    # Fingerprint excludes remaining_minutes on purpose: it ticks down every
    # poll, and including it would re-emit the warning every minute. We want
    # one notice per (deadline, threshold, source) regime; if the user extends
    # or replaces the time-box, deadline_at moves and the warning re-fires.
    fingerprint="${deadline_at}|${threshold_minutes}|${effective_source}"
    if [ "$fingerprint" != "$last_fingerprint" ]; then
      if [ "$effective_source" = "time_box" ] && [ "$normalized_key" != "attention_window_closing" ]; then
        notice="[HeadsDown] Box deadline near. Keep scope tight; the box will not stop work automatically. Use /headsdown:timebox clear to clear it or /headsdown:timebox <duration> to replace it."
      else
        notice="[HeadsDown] Window closing. Use /headsdown:wrap to pause and summarize if you want to stop here. Session timebox extension requests are handled by the session timebox prompt."
        if [ "$effective_source" = "time_box" ]; then
          notice="$notice Active box deadline is driving this warning."
        fi
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
