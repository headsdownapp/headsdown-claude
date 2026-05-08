---
description: Request more time for the current HeadsDown session timebox. Defaults to 15 minutes.
argument-hint: "[15|30]"
---

# HeadsDown Extend

1. Call `headsdown_status` and read `sessionTimeboxPrompt`.
2. If `sessionTimeboxPrompt.active` is false, explain that no session timebox extension is active and stop.
3. Parse `$ARGUMENTS` as a positive number of minutes. If no argument is provided, use `15`. Only `15` and `30` are valid for hosted session timebox requests.
4. Call `headsdown_session_timebox` with:
   - `action`: `request_extension`
   - `session_id`: `sessionTimeboxPrompt.sessionId`
   - `requested_extension_minutes`: parsed minutes
5. Confirm the extension request result.

Never call `pause_and_summarize` from this command. Never include prompts, transcripts, file paths, repo names, logs, code, or free-form reasons in a session timebox extension request.
