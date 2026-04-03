#!/bin/bash
# HeadsDown PreToolUse hook
# Checks the user's availability before file modifications (Write/Edit/MultiEdit).
#
# Trust levels:
#   advisory (default) - warnings only, never auto-approves
#   active             - auto-approves when an approved proposal exists
#   guarded            - requires an approved proposal in busy/limited/offline modes
#
# Sensitive paths always force "ask" regardless of trust level.

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"

# If CLI isn't built, pass through silently
if [ ! -f "$CLI" ]; then
  exit 0
fi

# --- Read tool input (file path being written) ---

# Hook receives JSON on stdin with tool_input containing the file path
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.filePath // empty' 2>/dev/null)

# --- Load config ---

config=$(node "$CLI" config 2>/dev/null) || config='{"trustLevel":"advisory","sensitivePaths":[]}'
trust_level=$(echo "$config" | jq -r '.trustLevel // "advisory"')
sensitive_paths=$(echo "$config" | jq -r '.sensitivePaths // [] | .[]' 2>/dev/null)

# --- Check sensitive paths ---
# Sensitive files always force "ask" regardless of trust level or proposal status.

if [ -n "$file_path" ] && [ -n "$sensitive_paths" ]; then
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue

    # Convert glob pattern to a basic check
    # Handle ** (any path), * (any segment), and exact matches
    regex=$(echo "$pattern" | sed 's/\*\*/DOUBLESTAR/g' | sed 's/\*/[^\/]*/g' | sed 's/DOUBLESTAR/.*/g')

    if echo "$file_path" | grep -qE "(^|/)${regex}$"; then
      cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "ask"
  },
  "systemMessage": "[HeadsDown] Sensitive file detected: ${file_path} matches protected pattern '${pattern}'. User confirmation required regardless of availability mode."
}
EOF
      exit 0
    fi
  done <<< "$sensitive_paths"
fi

# --- Fetch availability ---

status_output=$(node "$CLI" status 2>/dev/null) || exit 0

mode=$(echo "$status_output" | jq -r '.contract.mode // "none"')
status_text=$(echo "$status_output" | jq -r '.contract.statusText // empty')
lock=$(echo "$status_output" | jq -r '.contract.lock // false')

# --- Check proposal state (for active/guarded trust levels) ---

has_proposal=false
proposal_desc=""
if [ "$trust_level" = "active" ] || [ "$trust_level" = "guarded" ]; then
  if node "$CLI" proposals --check 2>/dev/null; then
    has_proposal=true
    proposal_json=$(node "$CLI" proposals 2>/dev/null) || true
    proposal_desc=$(echo "$proposal_json" | jq -r '.description // empty' 2>/dev/null)
  fi
fi

# --- Build status label ---

status_label=""
if [ -n "$status_text" ] && [ "$status_text" != "null" ]; then
  status_label=" ($status_text)"
fi

# --- Decision logic ---

case "$trust_level" in
  advisory)
    # Never auto-approve. Omit permissionDecision for online/busy/limited.
    # Only return "ask" for locked or offline.
    case "$mode" in
      online|none)
        exit 0
        ;;
      busy)
        if [ "$lock" = "true" ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User is in BUSY mode${status_label} with status locked. Ask before making changes."
}
EOF
        else
          cat <<EOF
{
  "systemMessage": "[HeadsDown] User is in BUSY mode${status_label}. Consider submitting a task proposal via headsdown_propose before proceeding."
}
EOF
        fi
        ;;
      limited)
        cat <<EOF
{
  "systemMessage": "[HeadsDown] User has LIMITED availability${status_label}. Keep changes small and focused."
}
EOF
        ;;
      offline)
        cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User is OFFLINE. Ask for explicit permission before making changes."
}
EOF
        ;;
      *)
        exit 0
        ;;
    esac
    ;;

  active)
    # Auto-approve when a proposal is approved. Warn when not.
    case "$mode" in
      online|none)
        if [ "$has_proposal" = true ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "allow" },
  "systemMessage": "[HeadsDown] Auto-approved: online mode with approved proposal (${proposal_desc})."
}
EOF
        else
          # Online without proposal: no opinion, let Claude's normal permissions handle it
          exit 0
        fi
        ;;
      busy)
        if [ "$lock" = "true" ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User is in BUSY mode${status_label} with status locked. Ask before proceeding."
}
EOF
        elif [ "$has_proposal" = true ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "allow" },
  "systemMessage": "[HeadsDown] Auto-approved: proposal approved (${proposal_desc}). User is busy${status_label}."
}
EOF
        else
          cat <<EOF
{
  "systemMessage": "[HeadsDown] User is BUSY${status_label}. Submit a task proposal via headsdown_propose before making changes."
}
EOF
        fi
        ;;
      limited)
        if [ "$has_proposal" = true ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "allow" },
  "systemMessage": "[HeadsDown] Auto-approved: proposal approved (${proposal_desc}). Keep changes focused."
}
EOF
        else
          cat <<EOF
{
  "systemMessage": "[HeadsDown] User has LIMITED availability${status_label}. Submit a proposal or keep changes small."
}
EOF
        fi
        ;;
      offline)
        cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User is OFFLINE. Ask for explicit permission even with an approved proposal."
}
EOF
        ;;
      *)
        exit 0
        ;;
    esac
    ;;

  guarded)
    # Require a proposal for writes in busy/limited/offline. Block if none exists.
    case "$mode" in
      online|none)
        # Online: pass through, no restrictions
        exit 0
        ;;
      busy)
        if [ "$lock" = "true" ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User is BUSY${status_label} with status locked. Explicit permission required."
}
EOF
        elif [ "$has_proposal" = true ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "allow" },
  "systemMessage": "[HeadsDown] Approved: proposal verified (${proposal_desc}). Proceeding in busy mode."
}
EOF
        else
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User is BUSY${status_label}. No approved proposal found. Submit one via headsdown_propose or ask the user for permission."
}
EOF
        fi
        ;;
      limited)
        if [ "$has_proposal" = true ]; then
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "allow" },
  "systemMessage": "[HeadsDown] Approved: proposal verified (${proposal_desc}). Keep changes focused."
}
EOF
        else
          cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User has LIMITED availability${status_label}. No approved proposal. Ask before proceeding."
}
EOF
        fi
        ;;
      offline)
        cat <<EOF
{
  "hookSpecificOutput": { "permissionDecision": "ask" },
  "systemMessage": "[HeadsDown] User is OFFLINE. All changes require explicit permission."
}
EOF
        ;;
      *)
        exit 0
        ;;
    esac
    ;;

  *)
    # Unknown trust level, pass through
    exit 0
    ;;
esac
