import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  loadLocalRefereeContract,
  runLocalReferee,
  __localRefereeRunnerInternal,
} from "../src/referee/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeAll(async () => {
  await runCommand("npm", ["run", "build"], { cwd: ROOT });
});

describe("Claude local Referee runner", () => {
  it("loads a local contract, evaluates local evidence, and renders the markdown receipt", async () => {
    const workspace = await makeWorkspace(validContract());

    try {
      const result = await runLocalReferee({
        cwd: workspace,
        evidence: {
          validationStatus: "passed",
          testsRun: true,
          gitCommitPresent: true,
          outcome: "completed",
          filesTouched: 2,
          toolCalls: 3,
          manualReviewRoundTripsAvoided: 2,
        },
        now: new Date("2026-05-21T00:00:00.000Z"),
      });

      expect(result.evaluation.verdict).toBe("passed");
      expect(result.renderedReceipt).toBe(
        [
          "### HeadsDown Referee",
          "",
          "✓ Definition of done satisfied",
          "✓ Validation completed",
          "✓ Commit present",
          "✓ Scope within contract",
          "↩ Manual review round trips avoided: 2",
          "🔒 Verified locally",
        ].join("\n"),
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses git status for file counts when explicit file evidence is absent", async () => {
    const workspace = await makeWorkspace({
      version: 1,
      checks: [{ type: "max_files_touched", max: 2 }],
    });

    try {
      const result = await runLocalReferee({
        cwd: workspace,
        adapters: {
          gitStatusShort: async () => " M src/a.ts\n?? test/b.test.ts\n",
        },
      });

      expect(result.evidence.filesTouched).toBe(2);
      expect(result.evaluation.verdict).toBe("passed");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps missing tool call evidence unknown instead of treating it as zero", async () => {
    const workspace = await makeWorkspace({
      version: 1,
      checks: [{ type: "max_tool_calls", max: 0 }],
    });

    try {
      const result = await runLocalReferee({
        cwd: workspace,
        evidence: { filesTouched: 0 },
      });

      expect(result.evidence.toolCallsKnown).toBe(false);
      expect(result.evaluation.verdict).toBe("needs_review");
      expect(result.evaluation.checks[0]).toMatchObject({
        status: "failed",
        reasonCode: "tool_calls_unknown",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps malformed explicit file evidence unknown instead of treating it as zero", async () => {
    const workspace = await makeWorkspace({
      version: 1,
      checks: [{ type: "max_files_touched", max: 0 }],
    });

    try {
      const result = await runLocalReferee({
        cwd: workspace,
        evidence: { filesTouched: "not-a-number" },
      });

      expect(result.evidence.filesTouchedKnown).toBe(false);
      expect(result.evaluation.verdict).toBe("needs_review");
      expect(result.evaluation.checks[0]).toMatchObject({
        status: "failed",
        reasonCode: "files_touched_unknown",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails clearly when the local contract is missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hd-claude-referee-missing-"));

    try {
      await expect(loadLocalRefereeContract({ cwd: workspace })).rejects.toThrow(
        "Local Referee contract not found",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects invalid local contracts", async () => {
    const workspace = await makeWorkspace({ version: 1, checks: [] });

    try {
      await expect(loadLocalRefereeContract({ cwd: workspace })).rejects.toThrow(
        "requires at least one check",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects contract paths outside the workspace", async () => {
    const workspace = await makeWorkspace(validContract());
    const outside = await mkdtemp(join(tmpdir(), "hd-claude-referee-outside-"));
    const outsideContract = join(outside, "referee.json");
    await writeFile(outsideContract, JSON.stringify(validContract()), "utf-8");

    try {
      await expect(
        loadLocalRefereeContract({ cwd: workspace, contractPath: outsideContract }),
      ).rejects.toThrow("must stay inside the workspace");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects symlink escapes after resolving the real contract path", async () => {
    const workspace = await makeWorkspace(validContract());
    const outside = await mkdtemp(join(tmpdir(), "hd-claude-referee-symlink-"));
    const outsideContract = join(outside, "referee.json");
    const linkPath = join(workspace, ".headsdown", "linked-referee.json");
    await writeFile(outsideContract, JSON.stringify(validContract()), "utf-8");
    await symlink(outsideContract, linkPath);

    try {
      await expect(
        loadLocalRefereeContract({
          cwd: workspace,
          contractPath: ".headsdown/linked-referee.json",
        }),
      ).rejects.toThrow("must stay inside the workspace");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("does not require network access for local verification", async () => {
    const workspace = await makeWorkspace(validContract());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network should not be called");
    }) as typeof fetch;

    try {
      await expect(
        runLocalReferee({
          cwd: workspace,
          evidence: {
            validationStatus: "passed",
            testsRun: true,
            gitCommitPresent: true,
            outcome: "completed",
            filesTouched: 1,
            toolCalls: 1,
          },
        }),
      ).resolves.toMatchObject({ evaluation: { verdict: "passed" } });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps the local runner independent from auth and hosted clients", async () => {
    const source = await readFile(join(ROOT, "src", "referee", "local-runner.ts"), "utf-8");

    expect(source).toContain("@headsdown/sdk/referee");
    expect(source).not.toContain("HeadsDownClient");
    expect(source).not.toContain("fromCredentials");
    expect(source).not.toContain("fetch(");
    expect(source).not.toMatch(/\.\.\/(?:cli|server|auth)/);
  });

  it("exposes a Claude command for local Referee verification", async () => {
    const command = await readFile(join(ROOT, "commands", "referee.md"), "utf-8");

    expect(command).toContain("node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js referee");
    expect(command).toContain("allowed-tools: Write, Bash(node:*)");
    expect(command).toContain("Use the Write tool to write the exact evidence JSON");
    expect(command).toContain(
      "node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js referee --delete-evidence-file --evidence-file .headsdown/referee-evidence.local.json",
    );
    expect(command).not.toContain("<<'HEADSDOWN_REFEREE_EVIDENCE'");
    expect(command).not.toContain("--evidence-json '$ARGUMENTS'");
    expect(command).not.toContain("printf '%s' \"$ARGUMENTS\"");
    expect(command).toContain("does not require HeadsDown authentication");
    expect(command).toContain("does not contact hosted HeadsDown");
  });

  it("runs from the CLI without HeadsDown credentials", async () => {
    const workspace = await makeWorkspace(validContract());
    const env = {
      ...process.env,
      HOME: workspace,
      HEADSDOWN_API_KEY: "",
      HEADSDOWN_CREDENTIALS_PATH: join(workspace, "missing-credentials.json"),
    };

    try {
      const result = await runCommand(
        "node",
        [
          join(ROOT, "dist", "cli.js"),
          "referee",
          "--evidence-json",
          JSON.stringify({
            validationStatus: "passed",
            testsRun: true,
            gitCommitPresent: true,
            outcome: "completed",
            filesTouched: 1,
            toolCalls: 1,
          }),
        ],
        { cwd: workspace, env },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("### HeadsDown Referee");
      expect(result.stdout).toContain("🔒 Verified locally");
      expect(result.stderr).toBe("");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("runs from the package entrypoint without HeadsDown credentials", async () => {
    const workspace = await makeWorkspace(validContract());
    const env = {
      ...process.env,
      HOME: workspace,
      HEADSDOWN_API_KEY: "",
      HEADSDOWN_CREDENTIALS_PATH: join(workspace, "missing-credentials.json"),
    };

    try {
      const result = await runCommand(
        "node",
        [join(ROOT, "dist", "index.js"), "referee", "--evidence-stdin"],
        {
          cwd: workspace,
          env,
          input: JSON.stringify({
            validationStatus: "passed",
            testsRun: true,
            gitCommitPresent: true,
            outcome: "completed",
            filesTouched: 1,
            toolCalls: 1,
          }),
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("### HeadsDown Referee");
      expect(result.stdout).toContain("🔒 Verified locally");
      expect(result.stderr).toBe("");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("accepts local evidence from stdin", async () => {
    const workspace = await makeWorkspace(validContract());

    try {
      const result = await runCommand(
        "node",
        [join(ROOT, "dist", "cli.js"), "referee", "--evidence-stdin"],
        {
          cwd: workspace,
          input: JSON.stringify({
            validationStatus: "passed",
            testsRun: true,
            gitCommitPresent: true,
            outcome: "completed",
            filesTouched: 1,
            toolCalls: 1,
          }),
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("### HeadsDown Referee");
      expect(result.stdout).toContain("✓ Definition of done satisfied");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("accepts local evidence from a temporary file and deletes it on request", async () => {
    const workspace = await makeWorkspace(validContract());
    const evidencePath = join(workspace, ".headsdown", "referee-evidence.local.json");
    await writeFile(
      evidencePath,
      JSON.stringify({
        validationStatus: "passed",
        testsRun: true,
        gitCommitPresent: true,
        outcome: "completed",
        filesTouched: 1,
        toolCalls: 1,
      }),
      "utf-8",
    );

    try {
      const result = await runCommand(
        "node",
        [
          join(ROOT, "dist", "cli.js"),
          "referee",
          "--delete-evidence-file",
          "--evidence-file",
          evidencePath,
        ],
        { cwd: workspace },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("### HeadsDown Referee");
      expect(result.stdout).toContain("✓ Definition of done satisfied");
      await expect(access(evidencePath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("Claude local Referee internals", () => {
  it("counts touched files from short git status output", () => {
    expect(
      __localRefereeRunnerInternal.countTouchedFilesFromGitStatus(
        " M src/a.ts\nA  src/b.ts\n?? test/c.test.ts\n\n",
      ),
    ).toBe(3);
  });
});

function validContract() {
  return {
    version: 1,
    checks: [
      { type: "outcome", required: "completed" },
      { type: "validation_status", required: "passed" },
      { type: "git_commit_present", required: true },
      { type: "max_files_touched", max: 2 },
      { type: "max_tool_calls", max: 5 },
    ],
  };
}

async function makeWorkspace(contract: unknown): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "hd-claude-referee-"));
  const contractPath = join(workspace, ".headsdown", "referee.json");
  await mkdir(dirname(contractPath), { recursive: true });
  await writeFile(contractPath, JSON.stringify(contract), "utf-8");
  return workspace;
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { input, ...execOptions } = options;
  return await new Promise((resolve, reject) => {
    const child = execFile(command, args, execOptions, (error, stdout, stderr) => {
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
    if (input !== undefined) child.stdin?.end(input);
  });
}
