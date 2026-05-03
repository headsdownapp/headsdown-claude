import type {
  AgentControlOverview,
  AgentRunSummary,
  HeadsDownCall,
  HeadsDownClient,
} from "@headsdown/sdk";
import {
  isHeadsDownActionKey,
  isHeadsDownCallKey,
  renderHeadsDownCallForAgent,
  type AgentHeadsDownCallRender,
} from "@headsdown/sdk/agent";
import { getLowLevelGraphQLClient } from "./sdk-compat.js";

export type HeadsDownCallView = Partial<HeadsDownCall> & {
  key: string;
};

export type AgentRunSummaryView = Pick<AgentRunSummary, "runId" | "callKey" | "allowedActionKeys">;

export interface AgentControlOverviewView {
  headsdownCall: HeadsDownCallView;
  runSummaries?: AgentRunSummaryView[] | null;
}

export interface RenderedHeadsDownCall {
  key: string;
  knownKey: string | null;
  title: string;
  text: string;
  intervention: boolean;
  safeFallback: boolean;
  allowedActionKeys: string[];
}

const NON_INTERVENTION_KEYS = new Set(["good_to_run", "ready_to_resume", "all_contained"]);

const AGENT_CONTROL_OVERVIEW_QUERY = `
  query AgentControlOverviewForClaudeRendering {
    agentControlOverview {
      headsdownCall {
        key
        knownKey
        title
        body
        severity
        urgency
        primaryActionLabel
        primaryActionKey
        primaryActionKnownKey
        primaryActionIntent
        secondaryActionLabel
        secondaryActionKey
        secondaryActionKnownKey
        secondaryActionIntent
        recommendedActionKey
        recommendedActionKnownKey
        allowedActionKeys
        allowedActionKnownKeys
        allowedUiIntents
        reasonCodes
        confidence
        evidenceSource
        privacyMode
        expiresAt
      }
      runSummaries {
        runId
        callKey
        allowedActionKeys
      }
    }
  }
`;

export function renderHeadsDownCall(call: HeadsDownCallView): RenderedHeadsDownCall {
  const rendered = renderHeadsDownCallForAgent(toSdkHeadsDownCall(call));
  const allowedActionKeys = rendered.allowedActions.map((action) => action.key);
  const allowedActionsLine = renderAllowedActionsLine(allowedActionKeys);

  const text = [
    `HeadsDown call: ${rendered.title}.`,
    rendered.body,
    allowedActionsLine,
    "Claude Code controls the model. HeadsDown controls the run.",
  ].join("\n");

  return {
    key: rendered.originalKey,
    knownKey: rendered.unknownKey ? null : rendered.callKey,
    title: rendered.title,
    text,
    intervention: isInterventionCall(rendered),
    safeFallback: rendered.fallbackReason !== "known_key",
    allowedActionKeys,
  };
}

export async function getAgentControlOverviewCompat(
  client: HeadsDownClient,
): Promise<AgentControlOverviewView | null> {
  try {
    if (typeof client.getAgentControlOverview === "function") {
      const overview = await client.getAgentControlOverview();
      return overview as AgentControlOverview;
    }

    const graphql = getLowLevelGraphQLClient(client);
    if (!graphql) return null;

    const data = await graphql.request(AGENT_CONTROL_OVERVIEW_QUERY);
    return (data.agentControlOverview as AgentControlOverviewView | null | undefined) ?? null;
  } catch {
    return null;
  }
}

function toSdkHeadsDownCall(call: HeadsDownCallView): HeadsDownCall {
  return {
    key: cleanText(call.key) ?? "needs_your_yes",
    knownKey: normalizeCallKey(call.knownKey) ?? normalizeCallKey(call.key),
    title: cleanText(call.title) ?? "",
    body: cleanText(call.body) ?? "",
    severity: normalizeSeverity(call.severity),
    urgency: normalizeUrgency(call.urgency),
    primaryActionLabel: cleanText(call.primaryActionLabel),
    primaryActionKey: cleanText(call.primaryActionKey),
    primaryActionKnownKey:
      normalizeActionKey(call.primaryActionKnownKey) ?? normalizeActionKey(call.primaryActionKey),
    primaryActionIntent: normalizeUiIntent(call.primaryActionIntent),
    secondaryActionLabel: cleanText(call.secondaryActionLabel),
    secondaryActionKey: cleanText(call.secondaryActionKey),
    secondaryActionKnownKey:
      normalizeActionKey(call.secondaryActionKnownKey) ??
      normalizeActionKey(call.secondaryActionKey),
    secondaryActionIntent: normalizeUiIntent(call.secondaryActionIntent),
    recommendedActionKey: cleanText(call.recommendedActionKey),
    recommendedActionKnownKey:
      normalizeActionKey(call.recommendedActionKnownKey) ??
      normalizeActionKey(call.recommendedActionKey),
    allowedActionKeys: normalizeStrings(call.allowedActionKeys),
    allowedActionKnownKeys: normalizeActionKeys(
      call.allowedActionKnownKeys && call.allowedActionKnownKeys.length > 0
        ? call.allowedActionKnownKeys
        : call.allowedActionKeys,
    ),
    allowedUiIntents: normalizeUiIntents(call.allowedUiIntents),
    reasonCodes: normalizeStrings(call.reasonCodes),
    confidence: normalizeConfidence(call.confidence),
    evidenceSource: normalizeEvidenceSource(call.evidenceSource),
    privacyMode: normalizePrivacyMode(call.privacyMode),
    expiresAt: cleanText(call.expiresAt),
  };
}

function isInterventionCall(call: AgentHeadsDownCallRender): boolean {
  if (NON_INTERVENTION_KEYS.has(call.callKey)) return false;
  if (call.allowedActions.length > 0) return true;
  return !NON_INTERVENTION_KEYS.has(call.callKey);
}

function renderAllowedActionsLine(allowedActionKeys: string[]): string {
  if (allowedActionKeys.length === 0) {
    return "Allowed actions: none.";
  }

  return `Allowed actions: ${allowedActionKeys.join(", ")}.`;
}

function normalizeCallKey(value: string | null | undefined): HeadsDownCall["knownKey"] {
  const normalized = normalizeToken(value);
  return normalized && isHeadsDownCallKey(normalized) ? normalized : null;
}

function normalizeActionKey(
  value: string | null | undefined,
): HeadsDownCall["primaryActionKnownKey"] {
  const normalized = normalizeToken(value);
  return normalized && isHeadsDownActionKey(normalized) ? normalized : null;
}

function normalizeActionKeys(
  values: readonly string[] | null | undefined,
): HeadsDownCall["allowedActionKnownKeys"] {
  return [
    ...new Set(
      normalizeStrings(values)
        .map(normalizeActionKey)
        .filter((value): value is NonNullable<HeadsDownCall["primaryActionKnownKey"]> => !!value),
    ),
  ];
}

function normalizeStrings(values: readonly string[] | null | undefined): string[] {
  if (!values || values.length === 0) return [];

  return [...new Set(values.map(cleanText).filter((value): value is string => !!value))];
}

function normalizeUiIntent(value: string | null | undefined): HeadsDownCall["primaryActionIntent"] {
  const normalized = normalizeToken(value);

  switch (normalized) {
    case "view_details":
    case "review_request":
    case "review_runs":
    case "review_handoff":
    case "view_queue":
    case "view_receipts":
    case "adjust_playbooks":
    case "start_run":
    case "none":
      return normalized;
    default:
      return "none";
  }
}

function normalizeUiIntents(
  values: readonly string[] | null | undefined,
): HeadsDownCall["allowedUiIntents"] {
  if (!values || values.length === 0) return [];
  return [...new Set(values.map(normalizeUiIntent))];
}

function normalizeSeverity(value: string | null | undefined): HeadsDownCall["severity"] {
  const normalized = normalizeToken(value);

  switch (normalized) {
    case "positive":
    case "neutral":
    case "caution":
    case "boundary":
    case "action_required":
    case "critical":
      return normalized;
    default:
      return "neutral";
  }
}

function normalizeUrgency(value: string | null | undefined): HeadsDownCall["urgency"] {
  const normalized = normalizeToken(value);

  switch (normalized) {
    case "low":
    case "normal":
    case "elevated":
    case "high":
      return normalized;
    default:
      return "normal";
  }
}

function normalizeConfidence(value: string | null | undefined): HeadsDownCall["confidence"] {
  const normalized = normalizeToken(value);

  switch (normalized) {
    case "exact":
    case "estimated":
    case "unknown":
      return normalized;
    default:
      return "exact";
  }
}

function normalizeEvidenceSource(
  value: string | null | undefined,
): HeadsDownCall["evidenceSource"] {
  const normalized = normalizeToken(value);

  switch (normalized) {
    case "contract":
    case "engine":
    case "run_summary":
    case "needs_your_yes":
    case "fallback":
      return normalized;
    default:
      return "fallback";
  }
}

function normalizePrivacyMode(value: string | null | undefined): HeadsDownCall["privacyMode"] {
  const normalized = normalizeToken(value);

  switch (normalized) {
    case "privacy_restricted":
    case "unknown":
      return normalized;
    default:
      return "privacy_safe";
  }
}

function normalizeToken(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;

  return cleaned
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}
