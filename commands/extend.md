---
description: Ask HeadsDown for more time on the current run. Defaults to 15 minutes.
argument-hint: "[minutes]"
---

# HeadsDown Extend

1. Call `headsdown_status` and read `headsdownCall`, `availability.wrapUpGuidance`, and `currentRun`.
2. If the current call is not `attention_window_closing`, explain that no window-closing extension is active and stop.
3. Read the target run id from `currentRun.runId`. If it is missing, explain that HeadsDown could not identify an active run to extend and stop.
4. Parse `$ARGUMENTS` as a positive number of minutes. If no argument is provided, use `15`. If an argument is provided but is not a positive number, explain the valid format and stop.
5. Call `headsdown_apply_action` with:
   - `run_id`: `currentRun.runId`
   - `action_key`: `allow_for_duration`
   - `duration_minutes`: parsed minutes
6. Confirm the extension result and summarize the new deadline or remaining time from the response.

Never call `pause_and_summarize` from this command.