---
description: Extend the current attention window by applying allow_for_duration to the active HeadsDown run
---

# HeadsDown Extend

1. Call `headsdown_status` and read `headsdownCall` plus `availability.wrapUpGuidance`.
2. If the current call is not `attention_window_closing`, explain that no window-closing extension is active and stop.
3. Resolve the active `run_id` from the call context, then call `headsdown_apply_action` with:
   - `run_id`: active run id
   - `action_key`: `allow_for_duration`
   - `duration_minutes`: use `$ARGUMENTS` when provided and valid, otherwise default to `15`
4. Confirm the extension result and summarize the new deadline or remaining time from the response.

Never call `pause_and_summarize` from this command.