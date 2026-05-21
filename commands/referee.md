---
description: Verify this run locally against a HeadsDown Referee contract and print a privacy-safe receipt
allowed-tools: Write, Bash(node:*)
argument-hint: "[optional evidence JSON]"
---

# HeadsDown Referee

The local Referee verifies the current run from local evidence only. It does not require HeadsDown authentication and does not contact hosted HeadsDown.

## Instructions

If the user provided no arguments, run:

`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js referee`

If the user provided JSON evidence, do not place it inside a shell command. Use the Write tool to write the exact evidence JSON to `.headsdown/referee-evidence.local.json`, then run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js referee --delete-evidence-file --evidence-file .headsdown/referee-evidence.local.json
```

Useful evidence keys include `validationStatus`, `testsRun`, `gitCommitPresent`, `outcome`, `filesTouched`, `toolCalls`, `elapsedMinutes`, `manualReviewRoundTripsAvoided`, and `networkRequired`.

Print the generated receipt exactly as returned. Do not add prompts, code, logs, file paths, repository names, branch names, terminal output, or message contents to the receipt.

User provided: $ARGUMENTS
