#!/bin/bash
# HeadsDown PreCompact hook
# Runs before Claude Code compacts the context window.
# Reminds Claude of its active proposal and execution policy so it can
# include in-progress context in its compaction summary.
#
# If not authenticated or the CLI is not built, exits silently.

set -euo pipefail

CLI="${CLAUDE_PLUGIN_ROOT}/dist/cli.js"

# Only run if the CLI exists and is built
if [ ! -f "$CLI" ]; then
  exit 0
fi

# Try to get proposal state
proposal_json=$(node "$CLI" proposals 2>/dev/null) || proposal_json="null"
proposal_desc=""
estimated_files=""

if [ -n "$proposal_json" ] && [ "$proposal_json" != "null" ]; then
  proposal_desc=$(echo "$proposal_json" | jq -r '.description // empty' 2>/dev/null)
  estimated_files=$(echo "$proposal_json" | jq -r '.estimatedFiles // empty' 2>/dev/null)
fi

# Try to get wrap-up instruction
status_output=$(node "$CLI" status 2>/dev/null) || status_output=""
wrap_up_instruction=""
if [ -n "$status_output" ]; then
  wrap_up_instruction=$(echo "$status_output" | jq -r '.wrapUpInstruction // empty' 2>/dev/null)
fi

# Exit silently if nothing active to inject
if [ -z "$proposal_desc" ] && [ -z "$wrap_up_instruction" ]; then
  exit 0
fi

# Build context message
context="[HeadsDown] Before compaction:"

if [ -n "$proposal_desc" ] && [ "$proposal_desc" != "null" ]; then
  context="$context You have an approved proposal: '${proposal_desc}'."
  if [ -n "$estimated_files" ] && [ "$estimated_files" != "null" ] && [ "$estimated_files" != "0" ]; then
    context="$context (estimated ${estimated_files} files)"
  fi
  context="$context Include this in your compaction summary so you can resume the task after context is rebuilt."
fi

if [ -n "$wrap_up_instruction" ] && [ "$wrap_up_instruction" != "null" ]; then
  context="$context Execution policy: ${wrap_up_instruction}"
fi

echo "{\"systemMessage\": \"$context\"}"
