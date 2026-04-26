import { randomUUID } from "node:crypto";
import type { HeadsDownClient } from "@headsdown/sdk";
import { getLowLevelGraphQLClient } from "./sdk-compat.js";

const REPORT_AGENT_RUN_EVENT_MUTATION = `
  mutation ReportAgentRunEvent($input: ReportAgentRunEventInput!) {
    reportAgentRunEvent(input: $input) {
      ok
      error {
        code
        message
        details
      }
      event {
        eventId
        eventType
      }
    }
  }
`;

export interface AgentRunEventInput {
  runId: string;
  eventType: string;
  sequence: number;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  progressPayload?: Record<string, unknown>;
  correlationId?: string;
  proposalRef?: string;
}

export async function reportAgentRunEventCompat(
  client: HeadsDownClient,
  input: AgentRunEventInput,
): Promise<boolean> {
  try {
    const eventClient = client as unknown as {
      reportAgentRunEvent?: (value: Record<string, unknown>) => Promise<unknown>;
    };

    const eventInput = buildSdkEventInput(input);

    if (typeof eventClient.reportAgentRunEvent === "function") {
      await eventClient.reportAgentRunEvent(eventInput);
      return true;
    }

    const graphql = getLowLevelGraphQLClient(client);
    if (!graphql) return false;

    await graphql.request(REPORT_AGENT_RUN_EVENT_MUTATION, {
      input: serializeAgentRunEventForGraphQL(eventInput),
    });

    return true;
  } catch {
    return false;
  }
}

export function buildSdkEventInput(input: AgentRunEventInput): Record<string, unknown> {
  return stripUndefined({
    eventId: randomUUID(),
    eventType: input.eventType,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    runId: input.runId,
    workspaceRef: "unknown",
    source: "claude_code",
    client: { kind: "claude_code", name: "Claude Code", version: "0.2.0" },
    actor: { kind: "agent", ref: "claude-code" },
    privacyMode: "metadata_only",
    sequence: input.sequence,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId ?? input.runId,
    proposalRef: input.proposalRef ?? input.runId,
    payload: input.payload,
    progressPayload: input.progressPayload,
  });
}

function toAgentRunGraphQLEnum(value: string): string {
  return /^\d/.test(value) ? `_${value.toUpperCase()}` : value.toUpperCase();
}

function serializeAgentRunEventForGraphQL(input: Record<string, unknown>): Record<string, unknown> {
  const progressPayload = input.progressPayload as Record<string, unknown> | undefined;
  const serializedProgress = progressPayload
    ? stripUndefined({
        ...progressPayload,
        filesReadBucket: toAgentRunGraphQLEnum(String(progressPayload.filesReadBucket)),
        filesModifiedBucket: toAgentRunGraphQLEnum(String(progressPayload.filesModifiedBucket)),
        validationLevel: String(progressPayload.validationLevel).toUpperCase(),
        validationStatus: String(progressPayload.validationStatus).toUpperCase(),
        progressState: String(progressPayload.progressState).toUpperCase(),
        scopeGrowthBucket: progressPayload.scopeGrowthBucket
          ? toAgentRunGraphQLEnum(String(progressPayload.scopeGrowthBucket))
          : undefined,
        confidenceBucket: progressPayload.confidenceBucket
          ? String(progressPayload.confidenceBucket).toUpperCase()
          : undefined,
        spendEstimateBucket: progressPayload.spendEstimateBucket
          ? toAgentRunGraphQLEnum(String(progressPayload.spendEstimateBucket))
          : undefined,
      })
    : undefined;

  return stripUndefined({
    ...input,
    privacyMode: "METADATA_ONLY",
    progressPayload: serializedProgress,
  });
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
  return Object.fromEntries(entries) as T;
}
