import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeadsDownClient } from "@headsdown/sdk";
import { reportRunStarted } from "../src/agent-run-events.js";
import { getRunState } from "../src/agent-run-state.js";
import {
  isBashWriteLikeCommand,
  permissionDeniedHandler,
  postToolUseFailureHandler,
  stopFailureHandler,
} from "../src/hooks/integration-events.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-hook-integration-"));
  process.env.HEADSDOWN_AGENT_RUN_STATE_PATH = join(tempDir, "agent-run-state.json");
  process.env.CLAUDE_SESSION_ID = "sess_test_1";
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_AGENT_RUN_STATE_PATH;
  delete process.env.CLAUDE_SESSION_ID;
  vi.restoreAllMocks();
});

describe("Claude Code integration failure hooks", () => {
  it("reports PermissionDenied as metadata-only permission_denied", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = mockClient(calls);
    await reportRunStarted(client, { proposalId: "proposal-permission" });

    await permissionDeniedHandler(
      JSON.stringify({
        session_id: "sess_test_1",
        tool_name: "Bash",
        tool_use_id: "tool_write_1",
        tool_input: {
          command: "cat <<'EOF' > src/private.ts\nsecret\nEOF",
          file_path: "/Users/example/private/src/private.ts",
        },
        reason: "policy denied raw text that must not be forwarded",
      }),
      client,
    );

    const event = calls.at(-1)!;
    expect(event.eventType).toBe("integration.permission_denied");
    expect(event.proposalRef).toBe("proposal-permission");
    expect(event.payload).toMatchObject({
      session_id: "sess_test_1",
      action_kind_bucket: "shell_destructive",
      resolution: "auto_denied",
    });
    expect((event.payload as Record<string, unknown>).decision_id).toMatch(
      /^decision_[a-f0-9]{16}$/,
    );
    expect(containsProhibitedKey(event)).toBe(false);
    expect(JSON.stringify(event)).not.toContain("/Users/example");
    expect(JSON.stringify(event)).not.toContain("cat <<");
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("reports StopFailure as a turn_failed event", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = mockClient(calls);
    process.env.CLAUDE_SESSION_ID = "different_env_session";
    await reportRunStarted(client, { proposalId: "proposal-other-session" });
    process.env.CLAUDE_SESSION_ID = "sess_test_1";
    await reportRunStarted(client, { proposalId: "proposal-stop-failure" });
    process.env.CLAUDE_SESSION_ID = "different_env_session";

    await stopFailureHandler(
      JSON.stringify({ session_id: "sess_test_1", turn_id: "turn_123", reason: "rate_limited" }),
      client,
    );

    const event = calls.at(-1)!;
    expect(event.eventType).toBe("integration.turn_failed");
    expect(event.runId).toBe("proposal-stop-failure");
    expect(event.payload).toMatchObject({
      session_id: "sess_test_1",
      reason: "rate_limited",
    });
    expect((event.payload as Record<string, unknown>).turn_id).toMatch(
      /^turn_[A-Za-z0-9_.:-]+|turn_[a-f0-9]{16}$/,
    );
    expect(containsProhibitedKey(event)).toBe(false);
  });

  it("reports PostToolUseFailure as tool_failed with reason buckets only", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = mockClient(calls);
    await reportRunStarted(client, { proposalId: "proposal-tool-failure" });

    await postToolUseFailureHandler(
      JSON.stringify({
        session_id: "sess_test_1",
        turn_id: "turn_456",
        tool_name: "Bash",
        tool_use_id: "tool_789",
        reason: "timeout while running local command",
        stderr: "raw command output must stay local",
        tool_input: { command: "npm test -- --runInBand" },
      }),
      client,
    );

    const event = calls.at(-1)!;
    expect(event.eventType).toBe("integration.tool_failed");
    expect(event.payload).toMatchObject({
      session_id: "sess_test_1",
      reason: "timeout",
    });
    expect((event.payload as Record<string, unknown>).tool_id).toMatch(
      /^tool_[A-Za-z0-9_.:-]+|tool_[a-f0-9]{16}$/,
    );
    expect((event.payload as Record<string, unknown>).turn_id).toMatch(
      /^turn_[A-Za-z0-9_.:-]+|turn_[a-f0-9]{16}$/,
    );
    expect(containsProhibitedKey(event)).toBe(false);
    expect(JSON.stringify(event)).not.toContain("npm test");
    expect(JSON.stringify(event)).not.toContain("raw command output");
  });

  it("does not advance local run state when failure signal reporting is rejected", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = mockClient(calls, { ok: false });
    await reportRunStarted(mockClient([]), { proposalId: "proposal-report-rejected" });

    await postToolUseFailureHandler(
      JSON.stringify({
        session_id: "sess_test_1",
        tool_name: "Bash",
        tool_use_id: "tool_rejected",
        reason: "timeout",
      }),
      client,
    );

    const state = await getRunState("proposal-report-rejected");
    expect(calls).toHaveLength(1);
    expect(state?.sequence).toBe(1);
    expect(state?.failureCount).toBe(0);
  });

  it("classifies Bash write-like commands without over-blocking read-only commands", () => {
    expect(isBashWriteLikeCommand("cat package.json")).toBe(false);
    expect(isBashWriteLikeCommand("grep -R TODO src")).toBe(false);
    expect(isBashWriteLikeCommand("grep -R rm src")).toBe(false);
    expect(isBashWriteLikeCommand("grep '>' README.md")).toBe(false);
    expect(isBashWriteLikeCommand("awk '$1 > 0' data.txt")).toBe(false);
    expect(isBashWriteLikeCommand("ls -la && pwd")).toBe(false);
    expect(isBashWriteLikeCommand("echo ok > result.txt")).toBe(true);
    expect(isBashWriteLikeCommand("python -m pip install pytest")).toBe(true);
    expect(isBashWriteLikeCommand("git apply /tmp/fix.patch")).toBe(true);
    expect(isBashWriteLikeCommand("git pull --ff-only")).toBe(true);
    expect(isBashWriteLikeCommand("npm run build")).toBe(true);
  });
});

function mockClient(
  calls: Record<string, unknown>[],
  result: Record<string, unknown> = { ok: true, error: null },
): HeadsDownClient {
  return {
    reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
      calls.push(input);
      return result;
    }),
  } as unknown as HeadsDownClient;
}

function containsProhibitedKey(value: unknown): boolean {
  const prohibited = new Set([
    "prompt",
    "prompts",
    "message",
    "messages",
    "content",
    "code",
    "diff",
    "patch",
    "file_path",
    "file_paths",
    "path",
    "paths",
    "repo",
    "repository",
    "branch",
    "stdout",
    "stderr",
    "log",
    "logs",
    "stacktrace",
    "traceback",
    "command",
    "cwd",
  ]);

  if (!value || typeof value !== "object") return false;

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);

  for (const [key, child] of entries) {
    if (prohibited.has(key.toLowerCase())) return true;
    if (containsProhibitedKey(child)) return true;
  }

  return false;
}
