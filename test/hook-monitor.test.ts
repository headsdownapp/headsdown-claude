import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

let tempDir: string;
let pluginRoot: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-hook-test-"));
  pluginRoot = join(tempDir, "plugin");
  await writeFile(join(tempDir, ".keep"), "");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("post-tool-use hook", () => {
  it("emits additionalContext without a systemMessage for read tools during attention-window-closing", async () => {
    await writeCliStub(`
      const command = process.argv[2];
      if (command === "proposals") {
        console.log("null");
      } else if (command === "report-progress") {
        console.log(JSON.stringify({
          reported: true,
          runId: "run-window",
          proposalRef: "proposal-window",
          attentionWindowClosing: true,
          attentionWindow: {
            deadlineAt: "2026-04-29T18:00:00Z",
            thresholdMinutes: 30,
            remainingMinutes: 9,
            hints: ["finish the slice"]
          },
          allowedActionKeys: ["allow_for_duration", "pause_and_summarize"]
        }));
      } else {
        console.log("null");
      }
    `);

    const result = await runScript(
      "dist/cli.js",
      JSON.stringify({ tool_name: "Read" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "read-context",
      },
      ["hook", "post-tool-use"],
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.systemMessage).toBeUndefined();
    expect(payload.hookSpecificOutput.additionalContext).toContain("Target run_id: run-window");
    expect(payload.hookSpecificOutput.additionalContext).toContain("Window closing");
    expect(payload.hookSpecificOutput.additionalContext).toContain("Remaining minutes: 9");
  });

  it("emits both systemMessage and additionalContext for write tools during attention-window-closing", async () => {
    await writeCliStub(`
      const command = process.argv[2];
      if (command === "proposals") {
        console.log(JSON.stringify({ estimatedFiles: 4 }));
      } else if (command === "report-progress") {
        console.log(JSON.stringify({
          reported: true,
          runId: "run-write",
          attentionWindowClosing: true,
          attentionWindow: {
            deadlineAt: "2026-04-29T18:00:00Z",
            thresholdMinutes: 30,
            remainingMinutes: 7,
            hints: []
          },
          allowedActionKeys: ["allow_for_duration"]
        }));
      } else {
        console.log("null");
      }
    `);

    const result = await runScript(
      "dist/cli.js",
      JSON.stringify({ tool_name: "Write" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "write-context",
      },
      ["hook", "post-tool-use"],
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.systemMessage).toContain("[HeadsDown]");
    expect(payload.systemMessage).toContain("Window closing is active");
    expect(payload.hookSpecificOutput.additionalContext).toContain("Target run_id: run-write");
    expect(payload.hookSpecificOutput.additionalContext).toContain(
      "Extend action is currently allowed",
    );
  });

  it("surfaces local box state errors from progress reporting", async () => {
    await writeCliStub(`
      const command = process.argv[2];
      if (command === "proposals") {
        console.log("null");
      } else if (command === "report-progress") {
        console.log(JSON.stringify({
          reported: true,
          runId: null,
          attentionWindowClosing: false,
          attentionWindow: null,
          allowedActionKeys: [],
          timeBoxError: "Invalid HeadsDown box at /tmp/time-box.json: file is corrupt"
        }));
      } else {
        console.log("null");
      }
    `);

    const result = await runScript(
      "dist/cli.js",
      JSON.stringify({ tool_name: "Write" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "box-error-context",
      },
      ["hook", "post-tool-use"],
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.systemMessage).toContain("HeadsDown box state could not be read");
    expect(payload.hookSpecificOutput.additionalContext).toContain("HeadsDown box state warning");
    expect(payload.hookSpecificOutput.additionalContext).toContain("file is corrupt");
    expect(payload.hookSpecificOutput.additionalContext).toContain("/headsdown:timebox clear");
  });

  it("surfaces report-progress command failures", async () => {
    await writeCliStub(`
      const command = process.argv[2];
      if (command === "proposals") {
        console.log("null");
      } else if (command === "report-progress") {
        console.error("boom");
        process.exit(2);
      } else {
        console.log("null");
      }
    `);

    const result = await runScript(
      "dist/cli.js",
      JSON.stringify({ tool_name: "Read" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "progress-command-error-context",
      },
      ["hook", "post-tool-use"],
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.systemMessage).toBeUndefined();
    expect(payload.hookSpecificOutput.additionalContext).toContain(
      "HeadsDown progress command warning",
    );
    expect(payload.hookSpecificOutput.additionalContext).toContain("boom");
  });

  it("surfaces degraded progress reporting and availability warnings", async () => {
    await writeCliStub(`
      const command = process.argv[2];
      if (command === "proposals") {
        console.log("null");
      } else if (command === "report-progress") {
        console.log(JSON.stringify({
          reported: false,
          reason: "unavailable",
          errorCategory: "auth",
          message: "HeadsDown authentication is unavailable. Run /headsdown:auth before relying on progress reporting.",
          details: "Missing credentials",
          availabilityError: "Could not query HeadsDown availability for wrap-up guidance: network down",
          progressReportError: "Could not send HeadsDown progress telemetry."
        }));
      } else {
        console.log("null");
      }
    `);

    const result = await runScript(
      "dist/cli.js",
      JSON.stringify({ tool_name: "Read" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "progress-error-context",
      },
      ["hook", "post-tool-use"],
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.systemMessage).toBeUndefined();
    expect(payload.hookSpecificOutput.additionalContext).toContain(
      "HeadsDown progress reporting warning",
    );
    expect(payload.hookSpecificOutput.additionalContext).toContain("HeadsDown authentication");
    expect(payload.hookSpecificOutput.additionalContext).toContain("Missing credentials");
    expect(payload.hookSpecificOutput.additionalContext).toContain(
      "HeadsDown availability warning",
    );
    expect(payload.hookSpecificOutput.additionalContext).toContain(
      "HeadsDown progress telemetry warning",
    );
  });

  it("keeps window-closing guidance when a box tightens an active closing run", async () => {
    await writeCliStub(`
      const command = process.argv[2];
      if (command === "proposals") {
        console.log("null");
      } else if (command === "report-progress") {
        console.log(JSON.stringify({
          reported: true,
          runId: "run-window",
          attentionWindowClosing: true,
          attentionWindow: {
            deadlineAt: "2026-04-29T18:00:00Z",
            thresholdMinutes: 15,
            remainingMinutes: 6,
            hints: ["box is active"],
            source: "time_box"
          },
          allowedActionKeys: ["allow_for_duration", "pause_and_summarize"]
        }));
      } else {
        console.log("null");
      }
    `);

    const result = await runScript(
      "dist/cli.js",
      JSON.stringify({ tool_name: "Write" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "box-tightens-window-context",
      },
      ["hook", "post-tool-use"],
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.systemMessage).toContain("Window closing is active");
    expect(payload.systemMessage).toContain("/headsdown:extend");
    expect(payload.hookSpecificOutput.additionalContext).toContain("Target run_id: run-window");
    expect(payload.hookSpecificOutput.additionalContext).toContain(
      "Active box deadline is driving this warning",
    );
  });

  it("uses box-specific guidance for local time-box warnings", async () => {
    await writeCliStub(`
      const command = process.argv[2];
      if (command === "proposals") {
        console.log("null");
      } else if (command === "report-progress") {
        console.log(JSON.stringify({
          reported: true,
          runId: "run-good",
          attentionWindowClosing: true,
          attentionWindow: {
            deadlineAt: "2026-04-29T18:00:00Z",
            thresholdMinutes: 15,
            remainingMinutes: 6,
            hints: ["box is active"],
            source: "time_box"
          },
          allowedActionKeys: ["narrow_scope"]
        }));
      } else {
        console.log("null");
      }
    `);

    const result = await runScript(
      "dist/cli.js",
      JSON.stringify({ tool_name: "Write" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "box-context",
      },
      ["hook", "post-tool-use"],
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.systemMessage).toContain("Box deadline is near");
    expect(payload.systemMessage).not.toContain("/headsdown:extend");
    expect(payload.systemMessage).not.toContain("/headsdown:wrap");
    expect(payload.hookSpecificOutput.additionalContext).toContain("HeadsDown box warning");
    expect(payload.hookSpecificOutput.additionalContext).toContain("/headsdown:timebox clear");
    expect(payload.hookSpecificOutput.additionalContext).not.toContain("Target run_id");
  });
});

describe("SessionEnd hook dispatch", () => {
  it.each(["logout", "prompt_input_exit"])("fires exactly once for %s", async (reason) => {
    const capturePath = join(pluginRoot, "session-end-capture.jsonl");
    await writeCliStub(`
      const fs = require("fs");
      const chunks = [];
      process.stdin.on("data", chunk => chunks.push(chunk));
      process.stdin.on("end", () => {
        fs.appendFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args: process.argv.slice(2), input: Buffer.concat(chunks).toString("utf-8") }) + "\\n");
      });
    `);

    const result = await runScript(
      "hooks/dispatch.sh",
      JSON.stringify({ session_id: "sess_dispatch", reason }),
      { CLAUDE_PLUGIN_ROOT: pluginRoot },
      ["session-end"],
    );

    expect(result.code).toBe(0);
    const lines = (await readFile(capturePath, "utf-8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const invocation = JSON.parse(lines[0]);
    expect(invocation.args).toEqual(["hook", "session-end"]);
    expect(JSON.parse(invocation.input)).toEqual({ session_id: "sess_dispatch", reason });
  });
});

describe("attention-window monitor", () => {
  it("exits cleanly when Claude terminates it with SIGTERM", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({ attentionWindowClosing: false, availability: { wrapUpGuidance: null } }));
      }
    `);

    const result = await runMonitor(`signal-monitor-${process.pid}-${Date.now()}`, 120);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("Traceback");
    expect(result.stderr).not.toContain("Error:");
  });

  it("emits one notice for repeated status with the same warning fingerprint", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          headsdownCall: { key: "attention_window_closing" },
          availability: {
            wrapUpGuidance: {
              deadlineAt: "2026-04-29T18:00:00Z",
              thresholdMinutes: 30,
              remainingMinutes: 6,
              hints: ["wrap soon"]
            }
          }
        }));
      }
    `);

    const result = await runMonitor(`dedupe-monitor-${process.pid}-${Date.now()}`, 600);
    const notices = result.stdout
      .split("\n")
      .filter((line) => line.includes("[HeadsDown] Window closing"));

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("Remaining minutes: 6");
    expect(notices[0]).toContain("Hints: wrap soon");
  });

  it("emits one notice when remainingMinutes ticks down across polls but the deadline is unchanged", async () => {
    const counterFile = join(pluginRoot, "dist", ".tick-counter");
    await writeCliStub(`
      const fs = require("fs");
      const path = ${JSON.stringify(counterFile)};
      let tick = 0;
      try { tick = parseInt(fs.readFileSync(path, "utf-8"), 10) || 0; } catch {}
      tick += 1;
      fs.writeFileSync(path, String(tick));
      const remaining = Math.max(1, 6 - (tick - 1));
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          headsdownCall: { key: "attention_window_closing" },
          availability: {
            wrapUpGuidance: {
              deadlineAt: "2026-04-29T18:00:00Z",
              thresholdMinutes: 30,
              remainingMinutes: remaining,
              hints: ["wrap soon"]
            }
          }
        }));
      }
    `);

    const result = await runMonitor(`ticking-monitor-${process.pid}-${Date.now()}`, 600);
    const notices = result.stdout
      .split("\n")
      .filter((line) => line.includes("[HeadsDown] Window closing"));

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("Remaining minutes: 6");
  });

  it("emits a window-closing notice when deadlineAt is null but remainingMinutes is present", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          headsdownCall: { key: "attention_window_closing" },
          availability: {
            wrapUpGuidance: {
              deadlineAt: null,
              thresholdMinutes: 30,
              remainingMinutes: 6,
              hints: ["wrap soon"]
            }
          }
        }));
      }
    `);

    const result = await runMonitor(`null-deadline-monitor-${process.pid}-${Date.now()}`, 600);
    const notices = result.stdout
      .split("\n")
      .filter((line) => line.includes("[HeadsDown] Window closing"));

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("Remaining minutes: 6");
    expect(notices[0]).toContain("Hints: wrap soon");
  });

  it("stays quiet when status says attention-window guidance is suppressed", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          attentionWindowClosing: false,
          headsdownCall: { key: "attention_window_closing" },
          effectiveAttentionWindow: null,
          availability: {
            wrapUpGuidance: {
              active: true,
              selectedMode: "full_depth",
              source: "forced_full_depth",
              deadlineAt: "2026-04-29T18:00:00Z",
              thresholdMinutes: 30,
              remainingMinutes: 6,
              hints: ["full depth active"]
            }
          }
        }));
      }
    `);

    const result = await runMonitor(`suppressed-window-monitor-${process.pid}-${Date.now()}`, 120);

    expect(result.stdout).not.toContain("[HeadsDown] Window closing");
    expect(result.stdout).not.toContain("[HeadsDown] Box deadline near");
  });

  it("uses the effective time-box deadline when it drives the warning", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          headsdownCall: { key: "good_to_run" },
          effectiveAttentionWindow: {
            deadlineAt: "2026-04-29T17:30:00Z",
            thresholdMinutes: 15,
            remainingMinutes: 10,
            hints: ["self-declared box is active"],
            source: "time_box"
          },
          availability: {
            wrapUpGuidance: {
              deadlineAt: "2026-04-29T18:00:00Z",
              thresholdMinutes: 30,
              remainingMinutes: 40,
              hints: ["backend hint"]
            }
          }
        }));
      }
    `);

    const result = await runMonitor(`time-box-monitor-${process.pid}-${Date.now()}`, 600);
    const notices = result.stdout
      .split("\n")
      .filter((line) => line.includes("[HeadsDown] Box deadline near"));

    expect(notices).toHaveLength(1);
    expect(notices[0]).not.toContain("/headsdown:extend");
    expect(notices[0]).not.toContain("/headsdown:wrap");
    expect(notices[0]).toContain("/headsdown:timebox clear");
    expect(notices[0]).toContain("Remaining minutes: 10");
    expect(notices[0]).toContain("self-declared box is active");
  });

  it("stays quiet for a time box outside its warning threshold", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          headsdownCall: { key: "good_to_run" },
          effectiveAttentionWindow: {
            deadlineAt: "2026-04-29T17:30:00Z",
            thresholdMinutes: 15,
            remainingMinutes: 20,
            hints: ["self-declared box is active"],
            source: "time_box"
          },
          availability: { wrapUpGuidance: null }
        }));
      }
    `);

    const result = await runMonitor(`quiet-time-box-monitor-${process.pid}-${Date.now()}`, 120);

    expect(result.stdout).not.toContain("[HeadsDown] Box deadline near");
    expect(result.stdout).not.toContain("[HeadsDown] Window closing");
  });

  it("keeps window-closing monitor guidance when a box tightens an active closing run", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          headsdownCall: { key: "attention_window_closing" },
          effectiveAttentionWindow: {
            deadlineAt: "2026-04-29T17:30:00Z",
            thresholdMinutes: 15,
            remainingMinutes: 10,
            hints: ["self-declared box is active"],
            source: "time_box"
          },
          availability: { wrapUpGuidance: null }
        }));
      }
    `);

    const result = await runMonitor(`mixed-window-monitor-${process.pid}-${Date.now()}`, 600);
    const notices = result.stdout
      .split("\n")
      .filter((line) => line.includes("[HeadsDown] Window closing"));

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("/headsdown:extend");
    expect(notices[0]).toContain("Active box deadline is driving this warning");
  });

  it("emits a diagnostic when status includes a time-box error", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log(JSON.stringify({
          headsdownCall: { key: "good_to_run" },
          timeBoxError: "Invalid HeadsDown box at /tmp/time-box.json: file is corrupt",
          availability: { wrapUpGuidance: null }
        }));
      }
    `);

    const result = await runMonitor("time-box-error-monitor", 120);
    const warnings = result.stderr
      .split("\n")
      .filter((line) => line.includes("Attention-window monitor warning"));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("file is corrupt");
  });

  it("emits a diagnostic when status polling fails", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        process.exit(2);
      }
    `);

    const result = await runMonitor("failing-monitor", 120);
    const warnings = result.stderr
      .split("\n")
      .filter((line) => line.includes("Attention-window monitor warning"));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not query headsdown status");
  });

  it("emits a diagnostic when status output is invalid JSON", async () => {
    await writeCliStub(`
      if (process.argv[2] === "status") {
        console.log("not-json");
      }
    `);

    const result = await runMonitor("invalid-json-monitor", 120);
    const warnings = result.stderr
      .split("\n")
      .filter((line) => line.includes("Attention-window monitor warning"));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("invalid JSON");
  });
});

async function writeCliStub(source: string): Promise<void> {
  await mkdir(join(pluginRoot, "dist"), { recursive: true });
  await writeFile(join(pluginRoot, "dist", "cli.js"), `#!/usr/bin/env node\n${source}\n`);
}

async function runScript(
  scriptPath: string,
  input: string,
  env: Record<string, string>,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return await new Promise((resolve, reject) => {
    const command = scriptPath.endsWith(".js") ? process.execPath : "bash";
    const commandArgs = scriptPath.endsWith(".js") ? [scriptPath, ...args] : [scriptPath, ...args];
    const child = spawn(command, commandArgs, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code }));
    child.stdin.end(input);
  });
}

async function runMonitor(
  sessionId: string,
  durationMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("bash", ["monitors/attention-window-monitor.sh"], {
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: sessionId,
        HEADSDOWN_ATTENTION_MONITOR_INTERVAL_SECONDS: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), durationMs);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}
