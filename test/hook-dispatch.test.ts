import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
