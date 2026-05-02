import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `hd-claude-autopilot-hook-${Math.random().toString(16).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  await mkdir(join(tempDir, "hooks"));
  await cp(
    "hooks/autopilot-detect-deferral.sh",
    join(tempDir, "hooks", "autopilot-detect-deferral.sh"),
  );
  await chmod(join(tempDir, "hooks", "autopilot-detect-deferral.sh"), 0o755);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("autopilot hooks", () => {
  it("is registered alongside the existing Stop hook", async () => {
    const hooks = JSON.parse(await readFile("hooks/hooks.json", "utf-8"));
    const stopCommands = hooks.hooks.Stop.flatMap((entry: { hooks: Array<{ command: string }> }) =>
      entry.hooks.map((hook) => hook.command),
    );

    const autopilotCommand = stopCommands.find((command) =>
      command.includes("autopilot-detect-deferral.sh"),
    );
    expect(stopCommands).toContain("bash ${CLAUDE_PLUGIN_ROOT}/hooks/session-end.sh");
    expect(autopilotCommand).toContain("CLAUDE_PLUGIN_ROOT");
    expect(stopCommands.indexOf(autopilotCommand!)).toBeLessThan(
      stopCommands.indexOf("bash ${CLAUDE_PLUGIN_ROOT}/hooks/session-end.sh"),
    );
  });

  it("exits zero when CLAUDE_PLUGIN_ROOT is missing", async () => {
    await expect(runHook({}, false)).resolves.toMatchObject({ stdout: "", stderr: "" });
  });

  it("registers the AskUserQuestion PreToolUse hook", async () => {
    const hooks = JSON.parse(await readFile("hooks/hooks.json", "utf-8"));
    const askHook = hooks.hooks.PreToolUse.find(
      (entry: { matcher: string }) => entry.matcher === "AskUserQuestion",
    );

    expect(askHook.hooks[0].command).toContain("autopilot-intercept-ask.sh");
    expect(askHook.hooks[0].command).toContain("CLAUDE_PLUGIN_ROOT");
  });

  it("registered command exits zero when CLAUDE_PLUGIN_ROOT is missing", async () => {
    const command = await registeredAutopilotCommand();

    await expect(runRegisteredCommand(command, {}, false)).resolves.toMatchObject({
      stdout: "",
      stderr: "",
    });
  });

  it("registered command preserves Stop exit 2 nudges", async () => {
    const command = await registeredAutopilotCommand();
    await mkdir(join(tempDir, "dist"));
    await writeFile(
      join(tempDir, "dist", "cli.js"),
      `console.error("Defer this question and continue. Do not wait."); process.exit(2);`,
    );

    await expect(runRegisteredCommand(command)).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining("Defer this question"),
    });
  });

  it("exits zero when the bundled CLI is missing", async () => {
    await expect(runHook()).resolves.toMatchObject({ stdout: "", stderr: "" });
  });

  it("exits zero when the bundled CLI fails", async () => {
    await mkdir(join(tempDir, "dist"));
    await writeFile(join(tempDir, "dist", "cli.js"), "process.exit(42);\n");

    await expect(runHook()).resolves.toMatchObject({ stdout: "", stderr: "" });
  });

  it("preserves Stop exit 2 and stderr for anti-stuck nudges", async () => {
    await mkdir(join(tempDir, "dist"));
    await writeFile(
      join(tempDir, "dist", "cli.js"),
      `console.error("Defer this question and continue. Do not wait."); process.exit(2);`,
    );

    await expect(runHook()).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining("Defer this question"),
    });
  });

  it("session-start emits wake-up additionalContext with the existing systemMessage", async () => {
    await cp("hooks/session-start.sh", join(tempDir, "hooks", "session-start.sh"));
    await chmod(join(tempDir, "hooks", "session-start.sh"), 0o755);
    await mkdir(join(tempDir, "dist"));
    await writeFile(
      join(tempDir, "dist", "cli.js"),
      `const command = process.argv[2]; const sub = process.argv[3];
if (command === "status") console.log(JSON.stringify({ contract: { mode: "online" }, availability: { inReachableHours: true, wrapUpGuidance: {} }, summary: "Mode: online", wrapUpInstruction: null }));
else if (command === "action-marker") console.log("null");
else if (command === "next-window") console.log("null");
else if (command === "digest-count") console.log("0");
else if (command === "continuation") process.exit(1);
else if (command === "autopilot" && sub === "wake-up") console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "Wake-up digest ready." } }));
else process.exit(0);`,
    );

    const result = await execFileAsync("bash", [join(tempDir, "hooks", "session-start.sh")], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: tempDir },
    });
    const output = JSON.parse(result.stdout);

    expect(output.systemMessage).toContain("Axis 1");
    expect(output.hookSpecificOutput).toEqual({
      hookEventName: "SessionStart",
      additionalContext: "Wake-up digest ready.",
    });
  });

  it("invokes the autopilot detect-deferral CLI route", async () => {
    await mkdir(join(tempDir, "dist"));
    const capturePath = join(tempDir, "argv.txt");
    await writeFile(
      join(tempDir, "dist", "cli.js"),
      `const { writeFileSync } = require("node:fs"); writeFileSync(process.env.CAPTURE_PATH, process.argv.slice(2).join(" "));`,
    );

    await runHook({ CAPTURE_PATH: capturePath });

    expect(await readFile(capturePath, "utf-8")).toBe("autopilot detect-deferral");
  });
});

async function registeredAutopilotCommand(): Promise<string> {
  const hooks = JSON.parse(await readFile("hooks/hooks.json", "utf-8"));
  const command = hooks.hooks.Stop.flatMap((entry: { hooks: Array<{ command: string }> }) =>
    entry.hooks.map((hook) => hook.command),
  ).find((candidate: string) => candidate.includes("autopilot-detect-deferral.sh"));
  if (!command) throw new Error("autopilot hook command not registered");
  return command;
}

async function runRegisteredCommand(
  command: string,
  extraEnv: Record<string, string> = {},
  includePluginRoot = true,
) {
  const env = { ...process.env, ...extraEnv };
  if (includePluginRoot) env.CLAUDE_PLUGIN_ROOT = tempDir;
  else delete env.CLAUDE_PLUGIN_ROOT;

  return await execFileAsync("bash", ["-c", command], { env });
}

async function runHook(extraEnv: Record<string, string> = {}, includePluginRoot = true) {
  const env = { ...process.env, ...extraEnv };
  if (includePluginRoot) env.CLAUDE_PLUGIN_ROOT = tempDir;
  else delete env.CLAUDE_PLUGIN_ROOT;

  return await execFileAsync("bash", [join(tempDir, "hooks", "autopilot-detect-deferral.sh")], {
    env,
  });
}
