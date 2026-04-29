---
name: headsdown
description: HeadsDown availability awareness. This skill should be used before starting any significant task, when the user mentions availability, focus mode, or availability windows, or when you need to check whether work should proceed or be deferred. Checks focus mode, availability state, and submits task proposals for verdict.
---

# HeadsDown Availability Skill

This skill connects you to [HeadsDown](https://headsdown.app) so you're aware of the user's availability before starting work. It tells you whether the user is in focus mode, what their availability state looks like, and whether a task should proceed or be deferred.

## MCP Tools Available

This plugin provides MCP tools. Use them via normal tool calls:

- **headsdown_status**: Check current availability (mode, execution directive, time remaining)
- **headsdown_propose**: Submit a task proposal for verdict (approved/deferred)
- **headsdown_interrupt**: Check whether it's appropriate to interrupt the user mid-task
- **headsdown_digest**: View notifications and messages that arrived during focus time
- **headsdown_grants**: List/create/revoke delegation grants for actor-scoped permissions
- **headsdown_override**: Get/set/clear temporary availability overrides
- **headsdown_apply_action**: Apply canonical run-governance actions such as `pause_and_summarize` and `allow_for_duration`
- **headsdown_report**: Report task outcome for calibration (completed/failed/etc.)
- **headsdown_continuation**: Save/load structured continuation artifacts for resumable work sessions
- **headsdown_auth**: Authenticate with HeadsDown via Device Flow

## Two-Axis Availability Model

`headsdown_status` returns two independent signals. Read both before starting work.

**Axis 1 — Availability mode** (`mode` field, user-set):
- `online` / `busy` / `limited` / `offline`
- What the user explicitly chose. Stable until they change it.

**Axis 2 — Execution directive** (`executionDirective` field, schedule-derived):
- `proceed`: No time pressure. Work at full depth.
- `proceed_with_caution`: Window ending soon or transitioning. Scope conservatively.
- `defer`: Outside available hours or in a blocked window. Defer non-trivial work.
- Derived from schedule, wrap-up guidance, and remaining window time.

These axes are **independent**. A user can be `online` (Axis 1) with a `proceed_with_caution` directive (Axis 2) if their window is ending. Or `busy` (Axis 1) with `proceed` (Axis 2) if they're in focus mode but there's no time pressure.

The `executionDirective` also includes `hardLimits` — machine-readable constraints:
- `avoidNewRefactors`: don't start new refactors mid-session
- `requireHandoffIfIncomplete`: must write handoff notes before stopping
- `requireConfirmationBeforeLargeChanges`: ask before touching many files
- `maxScope`: "minimal" | "normal" | "full_depth"

Respect `hardLimits` as firm constraints, not suggestions.

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

## Time-Aware Task Planning

After calling `headsdown_status`, check `remainingMinutes` (the attention budget until the current window closes). Compare it to your estimated task duration:

- **Task fits the window:** Proceed normally. Include `estimated_minutes` in your proposal so HeadsDown can calibrate.
- **Task exceeds the window:** Decompose the task into slices that fit. Propose only the first slice via `headsdown_propose` and note the deferred slices in `scope_summary`. Example: "This refactor has 3 layers: types, service logic, and tests. I can land types + service in 35 minutes. Tests deferred to next window."
- **`remainingMinutes` is null:** No deadline pressure. Proceed normally.

When slicing, prefer cuts along natural boundaries (modules, layers, test vs. implementation) over arbitrary partial work. Each slice should be independently shippable — it compiles, tests pass, and doesn't leave the codebase in a broken state.

## Verdict Decisions

When you submit a proposal:

- **approved**: The task fits within the user's current availability. Start working.
- **deferred**: The task should wait. Tell the user:
  - What the verdict was and why
  - Suggest postponing to a better time
  - Or offer to scope the task down to something smaller

### Full-Depth Override

If the user explicitly asks to go deep on a task — "do the full implementation," "don't skip tests," "I have time for this" — pass `delivery_mode: full_depth` in the proposal. This signals to HeadsDown that the user wants complete execution even if wrap-up guidance is active. Use `delivery_mode: wrap_up` to explicitly request minimal-scope execution. Omit `delivery_mode` (or use `auto`) to let HeadsDown decide based on the current availability context.

## Commit Strategy

Adapt your commit frequency to the current execution policy:

- **`wrap_up` mode:** Commit after every meaningful change. Smaller, safer commits ensure nothing is lost if the session ends abruptly. Prefer "land what's done" over "one polished commit."
- **`full_depth` mode:** Batch commits logically. Group related changes into coherent commits that tell a clear story in the git log.
- **`auto` / no execution policy:** Standard behavior — commit at natural boundaries (after a feature slice, after tests pass, etc.).
- **`limited` availability:** Commit frequently AND keep each commit independently reviewable, so the user can review in short windows without needing to hold the full context.

## Mid-Task Scope Escalation

If you realize mid-task that you will touch significantly more files or modules than the approved proposal estimated, call `headsdown_propose` again with updated `estimated_files`, `estimated_minutes`, and `scope_summary`. Do not silently overrun the original scope. A new approved verdict is lightweight; an unauthorized scope expansion undermines the availability contract.

Watch for signals that scope has grown: you're editing files in a third module, you've discovered a dependency that requires changes in multiple layers, or the PostToolUse context message notes that your file count has exceeded the estimate. When you see these, pause and re-propose before continuing.

## Interrupt Evaluation

Before asking the user a **non-critical** clarifying question mid-task, call `headsdown_interrupt`.

- If `allowed: true`: Proceed with the question.
- If `allowed: false` and `autoResponse` is set: Use the `autoResponse` text as your reply instead of asking. Do not surface the question.
- If `allowed: false` and `autoResponse` is null: Continue without asking. Make a reasonable assumption and note it in your handoff.

Use the `handle` parameter to describe the interrupt type:
- `"clarifying_question"` — you need more information
- `"scope_change"` — the task is larger than expected
- `"error"` — you hit a blocking error
- `"status_update"` — you want to share progress

**Skip `headsdown_interrupt`** for critical blockers (security risks, destructive irreversible actions, ambiguous destructive intent). Those always require user input.

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
- After presenting entries, offer to dismiss them. Call `headsdown_digest` with `action: dismiss` and the entry `id` to clear it.

**Smart triage — prioritize what matters now:**

When presenting digest entries, cross-reference them with your current working context: the active branch, recently modified files (from git status), and the active proposal description. Entries that relate to the current work come first. In `busy` or `limited` mode, only surface entries relevant to current work unless the user explicitly asks for everything. This keeps catch-up focused and avoids context-switching into unrelated threads.

**Digest follow-up — turning notifications into queued work:**

After summarizing, scan for actionable items: direct requests, assigned issues, flagged PRs, or anything that requires a response or code change. For each actionable item, offer to draft a proposal. Example: "Sarah's Slack message looks like a feature request — want me to propose it as a task?" This closes the loop from "I was in focus mode and missed this" to "here's the follow-up work queued."

## Task Outcome Reporting

After completing a task that was approved via `headsdown_propose`, call `headsdown_report` to record the outcome. This helps HeadsDown calibrate future verdicts for better accuracy.

Report outcomes: `completed`, `failed`, `partially_completed`, `cancelled`, or `timed_out`. Include `error_category` for failures and `tests_passed` when relevant.

**Proactive session-end reporting:** A Stop hook auto-reports `completed` or `partially_completed` (based on whether a continuation artifact exists) when the session ends. You still need to call `headsdown_report` manually for `failed`, `cancelled`, or `timed_out` outcomes — the Stop hook only handles the normal-exit cases. If a session is ending due to an error or cancellation, call `headsdown_report` before finishing.

## Wrap-Up Handoff Notes

When the execution policy is `wrap_up`, end the session with a brief structured handoff in the conversation before you stop:

- **Completed:** What was finished and is ready (merged, tested, or otherwise done)
- **Deferred:** What was scoped out or left in progress
- **Pick up here:** The next concrete step and any relevant file, branch, or ticket reference

Keep it to 3–6 bullets — this is for the user to scan in 30 seconds, not a design doc. If there's nothing deferred, say so explicitly so the user knows the slate is clean.

**Saving a continuation for the next session:**

After producing the handoff, call `headsdown_continuation` with `action: save` to persist structured resumption data. Include:
- `branch`: current git branch
- `completed_steps`: what you finished this session
- `pending_steps`: what's left to do
- `dirty_files`: any files with uncommitted changes
- `open_decisions`: questions that need the user's input before work can continue
- `resume_instruction`: a single sentence telling the next session what to do first

The next session will automatically detect this artifact and offer to resume.

## Session Resume

When the SessionStart context includes `[Continuation]`, a previous session left resumable work. Ask the user if they want to continue from where things left off. If yes, call `headsdown_continuation` with `action: load` to retrieve the full details (branch, pending steps, open decisions, resume instruction), then proceed accordingly. The `load` action consumes the artifact — it won't appear again in future sessions.

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
