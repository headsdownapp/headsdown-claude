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

if [ "$TOOL_TYPE" = "write" ]; then
  echo "{\"systemMessage\": \"$message\"}"
fi
