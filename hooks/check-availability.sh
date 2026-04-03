#!/bin/bash
# HeadsDown PreToolUse hook
# Checks the user's availability before file modifications (Write/Edit).
# - online or no contract: silent pass
# - busy/limited: allow but inject a warning into Claude's context
# - offline: ask the user for explicit permission

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"

# If CLI isn't built, allow silently
if [ ! -f "$CLI" ]; then
  exit 0
fi

# Fetch current availability. On any failure, allow silently.
output=$(node "$CLI" status 2>/dev/null) || exit 0

# Parse mode from the response
mode=$(echo "$output" | jq -r '.contract.mode // "none"')
status_text=$(echo "$output" | jq -r '.contract.statusText // empty')
lock=$(echo "$output" | jq -r '.contract.lock // false')
off_hours=$(echo "$output" | jq -r '.calendar.offHours // false')

case "$mode" in
  online|none)
    # Online or no contract: allow silently
    exit 0
    ;;

  busy)
    emoji=""
    if [ -n "$status_text" ] && [ "$status_text" != "null" ]; then
      emoji=" ($status_text)"
    fi

    # If locked, escalate to ask
    if [ "$lock" = "true" ]; then
      cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "ask"
  },
  "systemMessage": "[HeadsDown] User is in BUSY mode${emoji} with status locked. They explicitly do not want interruptions. Ask the user before making this change. If no task proposal was approved via headsdown_propose, submit one first."
}
EOF
    else
      cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "allow"
  },
  "systemMessage": "[HeadsDown] User is in BUSY mode${emoji}. If you haven't submitted a task proposal via headsdown_propose for this work, do so now before continuing. Only proceed with approved work."
}
EOF
    fi
    ;;

  limited)
    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "allow"
  },
  "systemMessage": "[HeadsDown] User has LIMITED availability. Keep changes small and focused. If this is part of a larger task, submit a proposal via headsdown_propose first."
}
EOF
    ;;

  offline)
    reason="User is in OFFLINE mode"
    if [ "$off_hours" = "true" ]; then
      reason="User is offline (off-hours)"
    fi

    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "ask"
  },
  "systemMessage": "[HeadsDown] ${reason}. All non-trivial changes should be deferred. Ask the user for explicit permission before making this modification."
}
EOF
    ;;

  *)
    # Unknown mode, allow silently
    exit 0
    ;;
esac
