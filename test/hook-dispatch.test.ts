import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadsDownClient } from "@headsdown/sdk";
import { describe, expect, it, vi } from "vitest";
import { reportRunStarted } from "../src/agent-run-events.js";
import { getRunState } from "../src/agent-run-state.js";
import { runHook } from "../src/hooks/index.js";
import type { CliResult } from "../src/hooks/runtime.js";

type ResponseMap = Record<string, Partial<CliResult> | ((args: string[]) => Partial<CliResult>)>;

function runnerFor(responses: ResponseMap) {
  return async (args: string[]): Promise<CliResult> => {
    const key = args.join(" ");
    const response = typeof responses[key] === "function" ? responses[key](args) : responses[key];
    if (!response) return { code: 1, stdout: "", stderr: "" };
    return {
      code: response.code ?? 0,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

describe("TypeScript hook dispatch handlers", () => {
  it("session-start preserves execution directive and continuation guidance", async () => {
    const result = await runHook(
      "session-start",
      "",
      runnerFor({
        "action-marker active": { code: 1 },
        status: {
          stdout: json({
            contract: { mode: "busy", statusText: "deep work" },
            availability: { inReachableHours: true, wrapUpGuidance: { remainingMinutes: 12 } },
            executionDirective: { code: "wrap_up", summary: "Capture handoff before the meeting." },
            wrapUpInstruction: "Finish the current edit only.",
          }),
        },
        "next-window": { stdout: "null" },
        "digest-count": { stdout: "0" },
        "continuation check": { code: 0 },
        "autopilot wake-up": { code: 1 },
        "autopilot prompt --as-session-context": { code: 1 },
      }),
    );

    expect(result).toMatchObject({
      systemMessage: expect.stringContaining(
        "Axis 2 (execution directive, schedule-derived): wrap_up",
      ),
    });
    expect((result as { systemMessage: string }).systemMessage).toContain("Capture handoff");
    expect((result as { systemMessage: string }).systemMessage).toContain("headsdown_continuation");
  });

  it("asks before editing sensitive paths matched by doublestar globs", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_input: { file_path: "config/secrets/prod/key.json" } }),
      runnerFor({
        "action-marker active": { code: 1 },
        config: { stdout: json({ trustLevel: "active", sensitivePaths: ["secrets/**"] }) },
      }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: { permissionDecision: "ask" },
      systemMessage: expect.stringContaining("Sensitive file detected"),
    });
  });

  it("does not gate read-only Bash commands", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_name: "Bash", tool_input: { command: "grep -R TODO src && cat package.json" } }),
      runnerFor({}),
    );

    expect(result).toBeUndefined();
  });

  it("gates Bash write commands through the existing availability policy", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_name: "Bash", tool_input: { command: "echo ok > result.txt" } }),
      runnerFor({
        "action-marker active": { code: 1 },
        config: { stdout: json({ trustLevel: "advisory", sensitivePaths: [] }) },
        status: { stdout: json({ contract: { mode: "offline" } }) },
      }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: { permissionDecision: "ask" },
      systemMessage: expect.stringContaining("User is OFFLINE"),
    });
  });

  it("asks for Bash writes to sensitive paths", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_name: "Bash", tool_input: { command: "echo ok > config/secrets/key.json" } }),
      runnerFor({
        "action-marker active": { code: 1 },
        config: { stdout: json({ trustLevel: "active", sensitivePaths: ["secrets/**"] }) },
      }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: { permissionDecision: "ask" },
      systemMessage: expect.stringContaining("Sensitive file detected"),
    });
  });

  it("asks for Bash writes when protected paths are configured and target is unknown", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_name: "Bash", tool_input: { command: "npm run build" } }),
      runnerFor({
        "action-marker active": { code: 1 },
        config: { stdout: json({ trustLevel: "active", sensitivePaths: ["dist/**"] }) },
      }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: { permissionDecision: "ask" },
      systemMessage: expect.stringContaining("write target could not be verified"),
    });
  });

  it("counts post-tool-use Bash writes as file modifications", async () => {
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = `hook_dispatch_bash_write_${process.pid}_${Date.now()}`;

    try {
      const result = await runHook(
        "post-tool-use",
        json({ tool_name: "Bash", tool_input: { command: "echo ok > result.txt" } }),
        runnerFor({
          proposals: { code: 1 },
          "report-progress write 1": { stdout: json({ reported: true }) },
        }),
      );

      expect(result).toMatchObject({
        systemMessage: expect.stringContaining("1 file(s) modified"),
      });
    } finally {
      restoreEnv("CLAUDE_SESSION_ID", originalSessionId);
    }
  });

  it("does not count post-tool-use read-only Bash as a file modification", async () => {
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = `hook_dispatch_bash_read_${process.pid}_${Date.now()}`;

    try {
      const result = await runHook(
        "post-tool-use",
        json({
          tool_name: "Bash",
          tool_input: { command: "grep -R TODO src && cat package.json" },
        }),
        runnerFor({
          proposals: { code: 1 },
          "report-progress external 0": { stdout: json({ reported: true }) },
        }),
      );

      expect(result).toBeUndefined();
    } finally {
      restoreEnv("CLAUDE_SESSION_ID", originalSessionId);
    }
  });

  it("session-end-report uses the captured session id instead of the ambient process session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "hd-session-end-report-"));
    const calls: Record<string, unknown>[] = [];
    const client = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
        return { ok: true, error: null };
      }),
    };
    const withActor = vi.fn(() => client);
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    const originalStatePath = process.env.HEADSDOWN_AGENT_RUN_STATE_PATH;
    const originalEndSessionId = process.env.HEADSDOWN_SESSION_END_SESSION_ID;
    const originalEndReason = process.env.HEADSDOWN_SESSION_END_REASON;
    const originalEndAt = process.env.HEADSDOWN_SESSION_END_ENDED_AT;

    try {
      process.env.HEADSDOWN_AGENT_RUN_STATE_PATH = join(tempDir, "agent-run-state.json");
      process.env.CLAUDE_SESSION_ID = "ambient_session";
      await reportRunStarted(client as never, { proposalId: "proposal-ambient" });
      process.env.CLAUDE_SESSION_ID = "captured_session";
      await reportRunStarted(client as never, { proposalId: "proposal-captured" });
      process.env.CLAUDE_SESSION_ID = "ambient_session";
      process.env.HEADSDOWN_SESSION_END_SESSION_ID = "captured_session";
      process.env.HEADSDOWN_SESSION_END_REASON = "clear";
      process.env.HEADSDOWN_SESSION_END_ENDED_AT = "2026-05-05T12:00:00.000Z";
      vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue({ withActor } as never);

      await runHook("session-end-report", "", runnerFor({}));

      const event = calls.at(-1)!;
      expect(event).toMatchObject({
        runId: "proposal-captured",
        eventType: "integration.session_ended",
        occurredAt: "2026-05-05T12:00:00.000Z",
        payload: { session_id: "captured_session", outcome: "succeeded" },
      });
      expect(await getRunState("proposal-captured")).toBeNull();
      expect(await getRunState("proposal-ambient")).not.toBeNull();
    } finally {
      restoreEnv("CLAUDE_SESSION_ID", originalSessionId);
      restoreEnv("HEADSDOWN_AGENT_RUN_STATE_PATH", originalStatePath);
      restoreEnv("HEADSDOWN_SESSION_END_SESSION_ID", originalEndSessionId);
      restoreEnv("HEADSDOWN_SESSION_END_REASON", originalEndReason);
      restoreEnv("HEADSDOWN_SESSION_END_ENDED_AT", originalEndAt);
      vi.restoreAllMocks();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("session-end spawns background reporting with sanitized metadata", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "hd-session-end-dispatch-"));
    const capturePath = join(tempDir, "capture.json");
    const childPath = join(tempDir, "child.mjs");
    const originalArgv1 = process.argv[1];

    await writeFile(
      childPath,
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args: process.argv.slice(2), sessionId: process.env.HEADSDOWN_SESSION_END_SESSION_ID, reason: process.env.HEADSDOWN_SESSION_END_REASON, endedAt: process.env.HEADSDOWN_SESSION_END_ENDED_AT }));`,
    );

    try {
      process.argv[1] = childPath;
      await runHook(
        "session-end",
        json({ session_id: "unsafe/session", reason: "prompt_input_exit" }),
        runnerFor({}),
      );

      const captured = JSON.parse(await waitForFile(capturePath));
      expect(captured.args).toEqual(["hook", "session-end-report"]);
      expect(captured.sessionId).toBe("default");
      expect(captured.reason).toBe("prompt_input_exit");
      expect(captured.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    } finally {
      process.argv[1] = originalArgv1;
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("active trust auto-allows busy edits only with an approved proposal", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_input: { file_path: "src/index.ts" } }),
      runnerFor({
        "action-marker active": { code: 1 },
        config: { stdout: json({ trustLevel: "active", sensitivePaths: [] }) },
        status: { stdout: json({ contract: { mode: "busy", statusText: "heads down" } }) },
        "proposals --check": { code: 0 },
        proposals: { stdout: json({ description: "fix hook dispatch" }) },
      }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: { permissionDecision: "allow" },
      systemMessage: expect.stringContaining("Auto-approved"),
    });
  });

  it("active trust warns but does not ask for busy edits without an approved proposal", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_input: { file_path: "src/index.ts" } }),
      runnerFor({
        "action-marker active": { code: 1 },
        config: { stdout: json({ trustLevel: "active", sensitivePaths: [] }) },
        status: { stdout: json({ contract: { mode: "busy", statusText: "heads down" } }) },
        "proposals --check": { code: 1 },
      }),
    );

    expect(result).toEqual({
      systemMessage:
        "[HeadsDown] User is BUSY (heads down). Submit a task proposal via headsdown_propose before making changes.",
    });
  });

  it("guarded trust asks for busy edits without an approved proposal", async () => {
    const result = await runHook(
      "pre-tool-use-edit",
      json({ tool_input: { file_path: "src/index.ts" } }),
      runnerFor({
        "action-marker active": { code: 1 },
        config: { stdout: json({ trustLevel: "guarded", sensitivePaths: [] }) },
        status: { stdout: json({ contract: { mode: "busy", statusText: "heads down" } }) },
        "proposals --check": { code: 1 },
      }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: { permissionDecision: "ask" },
      systemMessage: expect.stringContaining("No approved proposal found"),
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function waitForFile(path: string): Promise<string> {
  const deadline = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf-8");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}
