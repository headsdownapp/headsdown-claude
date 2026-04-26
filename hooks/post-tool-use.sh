#!/bin/bash
# HeadsDown PostToolUse hook
# Runs after Write/Edit/MultiEdit succeeds.
# Tracks a per-session running count of file modifications and warns when
# the count significantly exceeds the approved proposal estimate.
#
# Counter is stored in /tmp keyed by CLAUDE_SESSION_ID (falls back to "default").
# If not authenticated or CLI is not built, exits silently.

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

# Build message
message="[HeadsDown] ${count} file(s) modified this session."

# Warn if count exceeds estimate by more than 50%
if [ "$estimated_files" -gt 0 ]; then
  threshold=$((estimated_files * 3 / 2))
  if [ "$count" -gt "$threshold" ]; then
    message="$message Scope warning: approved proposal estimated ${estimated_files} file(s), ${count} have been modified. Consider calling headsdown_propose with updated estimates."
  fi
fi

rabbit_hole_detected="false"
if [ -n "$progress_json" ] && [ "$progress_json" != "null" ]; then
  rabbit_hole_detected=$(echo "$progress_json" | jq -r '.rabbitHoleDetected // false' 2>/dev/null || echo "false")
  if [ "$rabbit_hole_detected" = "true" ]; then
    run_id=$(echo "$progress_json" | jq -r '.runId // empty' 2>/dev/null || echo "")

    if [ -n "$run_id" ]; then
      message="$message Rabbit hole detected. Pause before this becomes cleanup work. Claude Code controls the model. HeadsDown controls the run. Stop broad exploration. While the call is still rabbit_hole_detected, call headsdown_apply_action with run_id ${run_id}, action_key pause_and_summarize, and a privacy-safe handoff_summary so the pause and handoff are saved together."

      allow_duration_supported=$(echo "$progress_json" | jq -r '(.allowedActionKeys // []) | index("allow_for_duration") != null' 2>/dev/null || echo "false")
      if [ "$allow_duration_supported" = "true" ]; then
        message="$message If continuing now is necessary, you may call headsdown_apply_action with run_id ${run_id}, action_key allow_for_duration, and duration_minutes instead of pausing. Do not call allow_for_duration after pause_and_summarize transitions the run to ready_to_resume."
      fi
    else
      message="$message Rabbit hole detected. Pause before this becomes cleanup work. Claude Code controls the model. HeadsDown controls the run. Stop broad exploration and check headsdown_status to re-establish the target run before applying an action."
    fi
  fi
fi

if [ "$TOOL_TYPE" = "write" ] || [ "$rabbit_hole_detected" = "true" ]; then
  echo "{\"systemMessage\": \"$message\"}"
fi
