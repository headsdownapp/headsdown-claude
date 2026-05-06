import type {
  AgentRunEventInput as SdkAgentRunEventInput,
  AgentRunProgressMetadata,
  HeadsDownClient,
} from "@headsdown/sdk";

export interface AgentRunEventInput {
  runId: string;
  eventType: string;
  sequence: number;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  progressPayload?: Record<string, unknown>;
  correlationId?: string;
  proposalRef?: string;
  occurredAt?: string;
}

export async function reportAgentRunEventCompat(
  client: HeadsDownClient,
  input: AgentRunEventInput,
): Promise<boolean> {
  try {
    const result = await client.reportAgentRunEvent(buildSdkEventInput(input));
    return isSuccessfulReportResult(result);
  } catch {
    return false;
  }
}

export function buildSdkEventInput(input: AgentRunEventInput): SdkAgentRunEventInput {
  return stripUndefined({
    eventType: input.eventType,
    runId: input.runId,
    workspaceRef: "unknown",
    source: "claude_code",
    client: { kind: "claude_code", name: "Claude Code", version: "0.2.0" },
    actor: { kind: "agent", ref: "claude-code" },
    privacyMode: "metadata_only",
    sequence: input.sequence,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId ?? input.runId,
    proposalRef: proposalRefFor(input),
    payload: input.payload,
    progressPayload: input.progressPayload as AgentRunProgressMetadata | undefined,
  }) as SdkAgentRunEventInput;
}

function proposalRefFor(input: AgentRunEventInput): string | undefined {
  if (input.proposalRef) return input.proposalRef;
  if (input.eventType.startsWith("integration.")) return undefined;
  return input.runId;
}

function isSuccessfulReportResult(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  const record = result as Record<string, unknown>;
  if (!("ok" in record) && !("error" in record)) return true;
  return record.ok === true && (record.error === null || record.error === undefined);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
  return Object.fromEntries(entries) as T;
}
