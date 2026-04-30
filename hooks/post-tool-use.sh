#!/bin/bash
# HeadsDown PostToolUse hook
# Runs after tools and reports privacy-safe progress metadata.
# Tracks a per-session running count of file modifications and warns when
# the count significantly exceeds the approved proposal estimate.

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"

# Only run if the CLI exists and is built
if [ ! -f "$CLI" ]; then
  exit 0
fi

HOOK_INPUT=$(cat 2>/dev/null || true)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // .toolName // empty' 2>/dev/null || true)
TOOL_TYPE="external"
case "$TOOL_NAME" in
  Read|Grep|Glob|LS)
    TOOL_TYPE="read"
    ;;
  Write|Edit|MultiEdit)
    TOOL_TYPE="write"
    ;;
esac

# Per-session counter file
SESSION_ID="${CLAUDE_SESSION_ID:-default}"
COUNTER_FILE="/tmp/headsdown-file-count-${SESSION_ID}"

# Increment count for write-like tools only. This stays local and is used only for the scope warning.
current=0
count=0
if [ -f "$COUNTER_FILE" ]; then
  current=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
  if ! [[ "$current" =~ ^[0-9]+$ ]]; then
    current=0
  fi
fi
if [ "$TOOL_TYPE" = "write" ]; then
  count=$((current + 1))
  echo "$count" > "$COUNTER_FILE"
else
  count="$current"
fi

# Check proposal for scope comparison
estimated_files=0
proposal_json=$(node "$CLI" proposals 2>/dev/null) || proposal_json="null"
if [ -n "$proposal_json" ] && [ "$proposal_json" != "null" ]; then
  raw_est=$(echo "$proposal_json" | jq -r '.estimatedFiles // 0' 2>/dev/null)
  if [[ "$raw_est" =~ ^[0-9]+$ ]]; then
    estimated_files=$raw_est
  fi
fi

# Report privacy-safe progress metadata. Never block the hook on telemetry failures.
progress_json=$(node "$CLI" report-progress "$TOOL_TYPE" "$count" 2>/dev/null) || progress_json=""

message="[HeadsDown] ${count} file(s) modified this session."
emit_system_message="false"
additional_context=""

# Warn if count exceeds estimate by more than 50%
if [ "$estimated_files" -gt 0 ]; then
  threshold=$((estimated_files * 3 / 2))
  if [ "$count" -gt "$threshold" ]; then
    message="$message Scope warning: approved proposal estimated ${estimated_files} file(s), ${count} have been modified. Consider calling headsdown_propose with updated estimates."
  fi
fi

attention_window_closing="false"
run_id=""
allow_duration_supported="false"
wrap_supported="false"

if [ -n "$progress_json" ] && [ "$progress_json" != "null" ]; then
  attention_window_closing=$(echo "$progress_json" | jq -r '.attentionWindowClosing // false' 2>/dev/null || echo "false")
  run_id=$(echo "$progress_json" | jq -r '.runId // empty' 2>/dev/null || echo "")
  allow_duration_supported=$(echo "$progress_json" | jq -r '(.allowedActionKeys // []) | index("allow_for_duration") != null' 2>/dev/null || echo "false")
  wrap_supported=$(echo "$progress_json" | jq -r '(.allowedActionKeys // []) | index("pause_and_summarize") != null' 2>/dev/null || echo "false")
fi

if [ "$attention_window_closing" = "true" ]; then
  deadline_at=$(echo "$progress_json" | jq -r '.attentionWindow.deadlineAt // empty' 2>/dev/null || echo "")
  threshold_minutes=$(echo "$progress_json" | jq -r '.attentionWindow.thresholdMinutes // empty' 2>/dev/null || echo "")
  remaining_minutes=$(echo "$progress_json" | jq -r '.attentionWindow.remainingMinutes // empty' 2>/dev/null || echo "")
  hints_text=$(echo "$progress_json" | jq -r '(.attentionWindow.hints // []) | map(select(type == "string" and length > 0)) | join("; ")' 2>/dev/null || echo "")

  attention_context="HeadsDown call: Window closing. Do not autonomously call headsdown_apply_action with action_key pause_and_summarize for this call. The user must invoke /headsdown:wrap explicitly. You may call headsdown_apply_action with action_key allow_for_duration only if the user explicitly asks for an extension."

  if [ -n "$run_id" ]; then
    attention_context="$attention_context Target run_id: ${run_id}."
  else
    attention_context="$attention_context If run_id is missing, call headsdown_status to re-establish the target run before applying actions."
  fi

  if [ "$wrap_supported" = "true" ]; then
    attention_context="$attention_context Wrap action is currently allowed."
  fi

  if [ "$allow_duration_supported" = "true" ]; then
    attention_context="$attention_context Extend action is currently allowed."
  fi

  if [ -n "$deadline_at" ]; then
    attention_context="$attention_context Deadline: ${deadline_at}."
  fi

  if [ -n "$remaining_minutes" ]; then
    attention_context="$attention_context Remaining minutes: ${remaining_minutes}."
  fi

  if [ -n "$threshold_minutes" ]; then
    attention_context="$attention_context Warning threshold minutes: ${threshold_minutes}."
  fi

  if [ -n "$hints_text" ]; then
    attention_context="$attention_context Current wrap-up hints: ${hints_text}."
  fi

  additional_context="$attention_context"

  if [ "$TOOL_TYPE" = "write" ]; then
    emit_system_message="true"
    message="$message Window closing is active. Use /headsdown:extend to request more time or /headsdown:wrap to pause and summarize."
  fi
fi

if [ "$TOOL_TYPE" = "write" ]; then
  emit_system_message="true"
fi

if [ "$emit_system_message" = "true" ] && [ -n "$additional_context" ]; then
  jq -nc --arg systemMessage "$message" --arg additionalContext "$additional_context" '{systemMessage: $systemMessage, hookSpecificOutput: {additionalContext: $additionalContext}}'
  exit 0
fi

if [ "$emit_system_message" = "true" ]; then
  jq -nc --arg systemMessage "$message" '{systemMessage: $systemMessage}'
  exit 0
fi

if [ -n "$additional_context" ]; then
  jq -nc --arg additionalContext "$additional_context" '{hookSpecificOutput: {additionalContext: $additionalContext}}'
  exit 0
fi
