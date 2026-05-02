---
description: Pause the current run cleanly with a handoff note for next session
---

# HeadsDown Wrap

1. Call `headsdown_status` and verify the current call is `attention_window_closing`.
2. Read the target run id from `currentRun.runId`. If it is missing, explain that HeadsDown could not identify an active run to wrap and stop.
3. Build a short privacy-safe handoff summary from current progress with no sensitive content.
4. Call `headsdown_apply_action` with:
   - `run_id`: `currentRun.runId`
   - `action_key`: `pause_and_summarize`
   - `handoff_summary`: the privacy-safe summary
5. Confirm that the run is paused and the handoff is saved.

Only run this action when the user explicitly invokes `/headsdown:wrap`. Do not auto-trigger it.