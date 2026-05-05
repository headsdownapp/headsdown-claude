import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type CliRunner = (args: string[], input?: string) => Promise<CliResult>;

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export function parseJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function defaultCliPath(): string | null {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return null;
  return `${pluginRoot}/dist/cli.js`;
}

export function createCliRunner(cliPath = defaultCliPath()): CliRunner {
  return async (args, input) => {
    if (!cliPath) return { code: 1, stdout: "", stderr: "" };

    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], {
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf-8");
      child.stderr?.setEncoding("utf-8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
      if (input !== undefined) child.stdin?.end(input);
    });
  };
}

export async function runCliJson(
  runner: CliRunner,
  args: string[],
  fallback: unknown,
): Promise<unknown> {
  const result = await runner(args);
  if (result.code !== 0 || !result.stdout) return fallback;
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    return fallback;
  }
}

export function outputJson(payload: unknown): void {
  if (payload === undefined || payload === null) return;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stringField(value: unknown): string {
  return typeof value === "string" && value !== "null" ? value : "";
}

export function boolField(value: unknown): boolean {
  return value === true;
}

export function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function readCounter(path: string): Promise<number> {
  try {
    const value = (await readFile(path, "utf-8")).trim();
    return /^\d+$/.test(value) ? Number.parseInt(value, 10) : 0;
  } catch {
    return 0;
  }
}

export async function writeCounter(path: string, value: number): Promise<void> {
  await writeFile(path, String(value));
}
