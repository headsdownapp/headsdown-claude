import type { HeadsDownClient } from "@headsdown/sdk";
import { getLowLevelGraphQLClient } from "./sdk-compat.js";

export interface HeadsDownCallView {
  key: string;
  knownKey?: string | null;
  title?: string | null;
  body?: string | null;
  severity?: string | null;
  urgency?: string | null;
  primaryActionLabel?: string | null;
  primaryActionKey?: string | null;
  primaryActionKnownKey?: string | null;
  primaryActionIntent?: string | null;
  secondaryActionLabel?: string | null;
  secondaryActionKey?: string | null;
  secondaryActionKnownKey?: string | null;
  secondaryActionIntent?: string | null;
  recommendedActionKey?: string | null;
  recommendedActionKnownKey?: string | null;
  allowedActionKeys?: string[] | null;
  allowedActionKnownKeys?: string[] | null;
  allowedUiIntents?: string[] | null;
  reasonCodes?: string[] | null;
  confidence?: string | null;
  evidenceSource?: string | null;
  privacyMode?: string | null;
}

export interface AgentRunSummaryView {
  runId: string;
  callKey?: string | null;
  allowedActionKeys?: string[] | null;
}

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

const CANONICAL_CALL_KEYS = new Set([
  "good_to_run",
  "keep_it_tight",
  "not_worth_starting_now",
  "off_the_clock",
  "rabbit_hole_detected",
  "ready_to_resume",
  "all_contained",
  "needs_your_yes",
]);
const NON_INTERVENTION_KEYS = new Set(["good_to_run", "ready_to_resume", "all_contained"]);

export const AGENT_CONTROL_OVERVIEW_QUERY = `
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
  const knownKey = normalizeEnumValue(call.knownKey) ?? canonicalKnownKey(call.key);
  const safeFallback = knownKey === null;
  const title = cleanText(call.title) ?? fallbackTitle(call);
  const body = cleanText(call.body) ?? fallbackBody(call);
  const intervention = isInterventionCall(call);
  const allowedActionKeys = canonicalAllowedActionKeys(call);
  const allowedActionsLine = renderAllowedActionsLine(allowedActionKeys);

  const text = intervention
    ? renderInterventionCall(call, title, body, allowedActionKeys, allowedActionsLine)
    : [
        `HeadsDown call: ${title}.`,
        body,
        allowedActionsLine,
        "Claude Code controls the model. HeadsDown controls the run.",
      ].join("\n");

  return {
    key: call.key,
    knownKey,
    title,
    text,
    intervention,
    safeFallback,
    allowedActionKeys,
  };
}

export async function getAgentControlOverviewCompat(
  client: HeadsDownClient,
): Promise<AgentControlOverviewView | null> {
  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) return null;

  try {
    const data = await graphql.request(AGENT_CONTROL_OVERVIEW_QUERY);
    return (data.agentControlOverview as AgentControlOverviewView | null | undefined) ?? null;
  } catch {
    return null;
  }
}

function renderInterventionCall(
  call: HeadsDownCallView,
  title: string,
  body: string,
  allowedActionKeys: string[],
  allowedActionsLine: string,
): string {
  return [
    `HeadsDown call: ${title}.`,
    body,
    `Call: ${title}.`,
    `Trap: ${trapText(call)}`,
    `Play: ${playText(call, allowedActionKeys)}`,
    `Escalation: ${escalationText(call, allowedActionKeys)}`,
    allowedActionsLine,
    "Claude Code controls the model. HeadsDown controls the run.",
  ].join("\n");
}

function isInterventionCall(call: HeadsDownCallView): boolean {
  const knownKey = normalizeEnumValue(call.knownKey);
  if (knownKey && NON_INTERVENTION_KEYS.has(knownKey)) return false;
  if (
    call.allowedActionKeys?.length ||
    call.allowedUiIntents?.some((intent) => normalizeEnumValue(intent) === "review_request")
  )
    return true;
  const key = normalizeEnumValue(call.key);
  return key !== null && !NON_INTERVENTION_KEYS.has(key);
}

function trapText(call: HeadsDownCallView): string {
  const reasons = call.reasonCodes?.map(humanizeToken).filter(Boolean) ?? [];
  if (reasons.length > 0) {
    return `HeadsDown saw ${reasons.join(", ")}.`;
  }

  return "The run may cross a boundary that needs a human decision.";
}

function playText(call: HeadsDownCallView, allowedActionKeys: string[]): string {
  const recommendedAction = normalizeActionKey(
    call.recommendedActionKey ?? call.recommendedActionKnownKey,
  );
  if (recommendedAction && allowedActionKeys.includes(recommendedAction)) {
    return `Use canonical action ${recommendedAction}.`;
  }

  const primaryAction = normalizeActionKey(call.primaryActionKey ?? call.primaryActionKnownKey);
  if (primaryAction && allowedActionKeys.includes(primaryAction)) {
    return `Use canonical action ${primaryAction}.`;
  }

  if (allowedActionKeys.length > 0) {
    return "Choose one of the allowed backend actions. Do not invent a local action.";
  }

  return "No backend action is available for this call. Ask before going deeper.";
}

function escalationText(call: HeadsDownCallView, allowedActionKeys: string[]): string {
  const urgency = normalizeEnumValue(call.urgency);
  if ((urgency === "high" || urgency === "critical") && allowedActionKeys.length > 0) {
    return "Do not continue until the user gives a clear yes or one allowed action is applied.";
  }

  return "Ask before going deeper if the run crosses time, scope, spend, or interruption boundaries.";
}

function fallbackTitle(call: HeadsDownCallView): string {
  const knownKey = normalizeEnumValue(call.knownKey) ?? canonicalKnownKey(call.key);
  if (knownKey === "rabbit_hole_detected") return "Rabbit hole detected";
  if (knownKey === null) return "Needs your yes";
  return humanizeToken(call.key) || "HeadsDown call";
}

function fallbackBody(call: HeadsDownCallView): string {
  const knownKey = normalizeEnumValue(call.knownKey) ?? canonicalKnownKey(call.key);
  if (knownKey === "rabbit_hole_detected") {
    return "Pause before this becomes cleanup work.";
  }

  if (knownKey === null) {
    return "HeadsDown returned a call this Claude integration does not recognize. Ask before going deeper.";
  }

  return "HeadsDown returned a call without display copy. Follow the allowed actions and ask before expanding scope.";
}

function renderAllowedActionsLine(allowedActionKeys: string[]): string {
  if (allowedActionKeys.length === 0) {
    return "Allowed actions: none.";
  }

  return `Allowed actions: ${allowedActionKeys.join(", ")}.`;
}

function canonicalAllowedActionKeys(call: HeadsDownCallView): string[] {
  const raw = call.allowedActionKeys ?? [];
  const known = call.allowedActionKnownKeys ?? [];
  const values = raw.length > 0 ? raw : known;
  return [
    ...new Set(
      values.map((value) => normalizeActionKey(value)).filter((value): value is string => !!value),
    ),
  ];
}

function normalizeActionKey(value: string | null | undefined): string | null {
  return normalizeEnumValue(value);
}

function canonicalKnownKey(value: string | null | undefined): string | null {
  const key = normalizeEnumValue(value);
  return key && CANONICAL_CALL_KEYS.has(key) ? key : null;
}

function normalizeEnumValue(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return cleaned.toLowerCase().replace(/-/g, "_");
}

function humanizeToken(value: string | null | undefined): string {
  const cleaned = cleanText(value);
  if (!cleaned) return "";
  return cleaned.replace(/[_-]+/g, " ");
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}
