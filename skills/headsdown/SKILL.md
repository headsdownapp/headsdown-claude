---
name: headsdown
description: HeadsDown availability awareness. This skill should be used before starting any significant task, when the user mentions availability, focus mode, or availability windows, or when you need to check whether work should proceed or be deferred. Checks focus mode, availability state, and submits task proposals for verdict.
---

# HeadsDown Availability Skill

This skill connects you to [HeadsDown](https://headsdown.app) so you're aware of the user's availability before starting work. It tells you whether the user is in focus mode, what their availability state looks like, and whether a task should proceed or be deferred.

## MCP Tools Available

This plugin provides seven MCP tools. Use them via normal tool calls:

- **headsdown_status**: Check current availability (mode, availability state, time remaining)
- **headsdown_propose**: Submit a task proposal for verdict (approved/deferred)
- **headsdown_digest**: View notifications and messages that arrived during focus time
- **headsdown_grants**: List/create/revoke delegation grants for actor-scoped permissions
- **headsdown_override**: Get/set/clear temporary availability overrides
- **headsdown_report**: Report task outcome for calibration (completed/failed/etc.)
- **headsdown_auth**: Authenticate with HeadsDown via Device Flow

## When to Check

**Before starting any non-trivial task**, check the user's availability:

1. Call `headsdown_status` to see their current mode and availability state.
2. If they have an active contract (especially busy, limited, or offline), call `headsdown_propose` with a clear description of what you plan to do.
3. Follow the verdict:
   - **approved**: Proceed normally.
   - **deferred**: Tell the user the task was deferred and why. Suggest postponing or reducing scope.

**Skip the check** for trivial tasks like answering a question, reading a file, or running a quick command.

## Interpreting Availability

### Modes

- **online**: User is available. Proceed with tasks normally.
- **busy**: User is in deep focus. Only proceed with approved proposals. Scope work down if deferred.
- **limited**: User has reduced availability. Prefer smaller, focused tasks.
- **offline**: User is away. Defer all non-trivial work.

### Schedule Context

The status also returns availability window information:
- **Available hours**: `inReachableHours: true` means the user is currently in an available window.
- **Outside available hours**: `inReachableHours: false` means the user is currently outside available windows.
- **Active window**: The currently active availability window (when present), including mode and label.
- **Next window / transition**: Upcoming availability window and transition time when available.

### Locked Status

If the status shows `lock: true`, the user explicitly does not want their mode changed. Respect this; don't suggest they change their status.

## Verdict Decisions

When you submit a proposal:

- **approved**: The task fits within the user's current availability. Start working.
- **deferred**: The task should wait. Tell the user:
  - What the verdict was and why
  - Suggest postponing to a better time
  - Or offer to scope the task down to something smaller

## Mid-Task Scope Escalation

If you realize mid-task that you will touch significantly more files or modules than the approved proposal estimated, call `headsdown_propose` again with updated `estimated_files`, `estimated_minutes`, and `scope_summary`. Do not silently overrun the original scope. A new approved verdict is lightweight; an unauthorized scope expansion undermines the availability contract.

Watch for signals that scope has grown: you're editing files in a third module, you've discovered a dependency that requires changes in multiple layers, or the PostToolUse context message notes that your file count has exceeded the estimate. When you see these, pause and re-propose before continuing.

## Digest: What You Missed

The digest collects notifications and messages that arrived while the user was in focus mode. Use `headsdown_digest` to review them.

**When to show the digest:**
- At the start of a new session, if the SessionStart context mentions pending digest entries
- When the user asks "what did I miss?" or "any messages while I was focused?"
- When transitioning between tasks (natural break point to catch up)

**How to present it:**
- Summarize the digest concisely: "While you were focused, you got 3 Slack messages from Sarah about the API design and 2 GitHub notifications on PR #142."
- Group by source and actor for readability
- Don't overwhelm; if there are many entries, highlight the most recent or highest-count summaries
- This is read-only. You cannot dismiss or acknowledge digest entries.

**Digest follow-up — turning notifications into queued work:**

After summarizing, scan for actionable items: direct requests, assigned issues, flagged PRs, or anything that requires a response or code change. For each actionable item, offer to draft a proposal. Example: "Sarah's Slack message looks like a feature request — want me to propose it as a task?" This closes the loop from "I was in focus mode and missed this" to "here's the follow-up work queued."

## Task Outcome Reporting

After completing a task that was approved via `headsdown_propose`, call `headsdown_report` to record the outcome. This helps HeadsDown calibrate future verdicts for better accuracy.

Report outcomes: `completed`, `failed`, `partially_completed`, `cancelled`, or `timed_out`. Include `error_category` for failures and `tests_passed` when relevant.

**Proactive session-end reporting:** If a session is ending — the user says they're done, you've finished the work, or you're in a wrap-up wind-down — and there is an approved proposal that hasn't been reported yet, call `headsdown_report` before finishing. Don't wait to be asked.

## Wrap-Up Handoff Notes

When the execution policy is `wrap_up`, end the session with a brief structured handoff in the conversation before you stop:

- **Completed:** What was finished and is ready (merged, tested, or otherwise done)
- **Deferred:** What was scoped out or left in progress
- **Pick up here:** The next concrete step and any relevant file, branch, or ticket reference

Keep it to 3–6 bullets — this is for the user to scan in 30 seconds, not a design doc. If there's nothing deferred, say so explicitly so the user knows the slate is clean.

## Delegation and Subagents

When spawning a subagent (via the `Agent` tool) that will make file changes on the user's behalf, call `headsdown_grants` with `action: list_active` first. If no active grant covers the subagent's session or workspace:

- **Create one**: `headsdown_grants` with `action: create`, `scope: session`, and the appropriate `permissions`
- **Or surface the gap**: tell the user no grant exists and ask whether to create one before continuing

This ensures subagent writes are traceable and authorized under the same availability contract as the parent session. Skip this check for read-only subagents that won't modify files.

## Scheduling Agents

When setting up a scheduled or recurring agent with `/schedule`, call `headsdown_status` first and check `availability.activeWindow` and `availability.nextWindow`. Prefer scheduling runs during `online` windows. Avoid scheduling during `busy` or `offline` windows unless the task is explicitly availability-independent (e.g., a background data sync the user won't interact with).

If the user asks to schedule something during a time when HeadsDown shows a `busy` or `offline` window, flag it: "That time falls in your busy window — want to schedule it for your next online window instead?"

## Authentication

If any tool returns an authentication error, call `headsdown_auth`. This starts a Device Flow where the user visits a URL and enters a code to grant access. The API key is saved locally at `~/.config/headsdown/credentials.json`.

## Error Handling

- **"Not authenticated"**: Run `headsdown_auth` to connect.
- **"API key is invalid"**: Run `headsdown_auth` to re-authenticate.
- **"Could not reach HeadsDown"**: Network issue. Inform the user and proceed without availability data.
