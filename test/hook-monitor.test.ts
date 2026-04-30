import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
      "hooks/post-tool-use.sh",
      JSON.stringify({ tool_name: "Read" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "read-context",
      },
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
      "hooks/post-tool-use.sh",
      JSON.stringify({ tool_name: "Write" }),
      {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_SESSION_ID: "write-context",
      },
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
});

describe("attention-window monitor", () => {
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
      .filter((line) => line.includes("[HeadsDown] Window closing"));

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("Active box deadline is driving this warning");
    expect(notices[0]).toContain("Remaining minutes: 10");
    expect(notices[0]).toContain("self-declared box is active");
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
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("bash", [scriptPath], {
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
