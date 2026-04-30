import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

beforeAll(async () => {
  await runCommand("npm", ["run", "build"], { cwd: process.cwd() });
});

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-time-box-cli-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("time-box CLI", () => {
  it("sets, reports, activates, and clears a session-scoped box", async () => {
    const env = timeBoxEnv("cli-session");

    const setResult = await runCli(["time-box", "set", "30m"], env);
    expect(setResult.code).toBe(0);
    const setPayload = JSON.parse(setResult.stdout);
    expect(setPayload.ok).toBe(true);
    expect(setPayload.action).toBe("set");
    expect(setPayload.timeBox.active).toBe(true);
    expect(setPayload.timeBox.remainingMinutes).toBeGreaterThan(0);

    const statusResult = await runCli(["time-box", "status"], env);
    expect(statusResult.code).toBe(0);
    const statusPayload = JSON.parse(statusResult.stdout);
    expect(statusPayload.active).toBe(true);
    expect(statusPayload.thresholdMinutes).toBe(15);
    expect(statusPayload.state.sessionIdHash).toBe(setPayload.timeBox.state.sessionIdHash);

    const activeResult = await runCli(["time-box", "active"], env);
    expect(activeResult.code).toBe(0);
    expect(JSON.parse(activeResult.stdout).active).toBe(true);

    const clearResult = await runCli(["time-box", "clear"], env);
    expect(clearResult.code).toBe(0);
    expect(JSON.parse(clearResult.stdout)).toMatchObject({ ok: true, action: "clear" });

    const inactiveResult = await runCli(["time-box", "active"], env);
    expect(inactiveResult.code).toBe(1);
    expect(JSON.parse(inactiveResult.stdout)).toBeNull();
  });

  it("exits non-zero and explains corrupted local state", async () => {
    const env = timeBoxEnv("corrupt-cli-session");
    await writeFile(env.HEADSDOWN_TIME_BOX_PATH!, "not-json");

    const result = await runCli(["time-box", "status"], env);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Invalid HeadsDown box");
  });

  it("exits non-zero with the documented error for invalid duration input", async () => {
    const result = await runCli(["time-box", "set", "soon"], timeBoxEnv("invalid-cli-session"));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Use a duration like 30m, 45m, 1h, or 1h30m.");
  });

  it("returns local status and time-box guidance when full status is unavailable", async () => {
    const env = unavailableHeadsDownEnv("status-local-box");
    await runCli(["time-box", "set", "1m"], env);

    const result = await runCli(["status"], env);
    const payload = JSON.parse(result.stdout);

    expect(result.code).toBe(0);
    expect(payload.availabilityError).toContain("HeadsDown authentication is unavailable");
    expect(payload.timeBox.active).toBe(true);
    expect(payload.effectiveAttentionWindow).toMatchObject({
      source: "time_box",
      thresholdMinutes: 1,
    });
  });

  it("passes through local box state errors from full status", async () => {
    const env = unavailableHeadsDownEnv("status-corrupt-box");
    await writeFile(env.HEADSDOWN_TIME_BOX_PATH!, "not-json");

    const result = await runCli(["status"], env);
    const payload = JSON.parse(result.stdout);

    expect(result.code).toBe(0);
    expect(payload.timeBoxError).toContain("Invalid HeadsDown box");
    expect(payload.availabilityError).toContain("HeadsDown authentication is unavailable");
  });

  it("returns local time-box guidance when report-progress is unavailable", async () => {
    const env = unavailableHeadsDownEnv("report-progress-local-box");
    await runCli(["time-box", "set", "1m"], env);

    const result = await runCli(["report-progress", "write", "1"], env);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      reported: false,
      reason: "unavailable",
      errorCategory: "auth",
      message:
        "HeadsDown authentication is unavailable. Run /headsdown auth before relying on progress reporting.",
      attentionWindowClosing: true,
      attentionWindow: {
        source: "time_box",
        thresholdMinutes: 1,
      },
    });
  });

  it("returns a sanitized category when report-progress is unavailable", async () => {
    const result = await runCli(
      ["report-progress", "write", "1"],
      unavailableHeadsDownEnv("missing-auth"),
    );

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      reported: false,
      reason: "unavailable",
      errorCategory: "auth",
      message:
        "HeadsDown authentication is unavailable. Run /headsdown auth before relying on progress reporting.",
      attentionWindowClosing: false,
      attentionWindow: null,
    });
  });
});

function timeBoxEnv(sessionId: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLAUDE_SESSION_ID: sessionId,
    HEADSDOWN_TIME_BOX_PATH: join(tempDir, `${sessionId}.json`),
  };
}

function unavailableHeadsDownEnv(sessionId: string): NodeJS.ProcessEnv {
  return {
    ...timeBoxEnv(sessionId),
    HOME: tempDir,
    HEADSDOWN_API_KEY: "",
    HEADSDOWN_CREDENTIALS_PATH: join(tempDir, "missing-credentials.json"),
    HEADSDOWN_AGENT_RUN_STATE_PATH: join(tempDir, "missing-run-state.json"),
  };
}

async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return await runCommand("node", ["dist/cli.js", ...args], { env });
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return await new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error && typeof (error as NodeJS.ErrnoException).code !== "number") {
        reject(error);
        return;
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code:
          error && typeof (error as NodeJS.ErrnoException).code === "number"
            ? Number((error as NodeJS.ErrnoException).code)
            : 0,
      });
    });
    child.on("error", reject);
  });
}
