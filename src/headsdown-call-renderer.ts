import type { HeadsDownCallPayload } from "./current-headsdown-call.js";

export const CANONICAL_HEADSDOWN_CALL_KEYS = [
  "good_to_run",
  "keep_it_tight",
  "not_worth_starting_now",
  "off_the_clock",
  "rabbit_hole_detected",
  "ready_to_resume",
  "all_contained",
  "needs_your_yes",
] as const;

export type CanonicalHeadsDownCallKey = (typeof CANONICAL_HEADSDOWN_CALL_KEYS)[number];

export type RenderedHeadsDownCall = {
  key: string;
  knownKey: CanonicalHeadsDownCallKey | null;
  title: string;
  body: string;
  primaryCta: string | null;
  summary: string;
  fallback: boolean;
};

type HeadsDownCallTemplate = {
  title: string;
  body: string;
  primaryCta: string | null;
};

const CALL_TEMPLATES: Record<CanonicalHeadsDownCallKey, HeadsDownCallTemplate> = {
  good_to_run: {
    title: "Good to run",
    body: "This task fits the time, scope, and attention available right now. Let the agent proceed within the approved bounds.",
    primaryCta: "Let the agent proceed",
  },
  keep_it_tight: {
    title: "Keep it tight",
    body: "There is enough room for a useful slice, not an open-ended run. Ask the agent for the smallest version that still ships value.",
    primaryCta: "Narrow scope",
  },
  not_worth_starting_now: {
    title: "Not worth starting now",
    body: "The likely cost is higher than the likely value right now. Queue it for later instead of burning time on a weak run.",
    primaryCta: "Queue for later",
  },
  off_the_clock: {
    title: "Off the clock",
    body: "Non-urgent agent decisions wait until the next work window. Safe continuation can stay contained, but new asks should queue.",
    primaryCta: "Queue for later",
  },
  rabbit_hole_detected: {
    title: "Rabbit hole detected",
    body: "Pause before this becomes cleanup work.",
    primaryCta: "Pause + summarize",
  },
  ready_to_resume: {
    title: "Ready to resume",
    body: "HeadsDown saved the thread so the agent can pick up without starting over. Resume the approved work or keep it queued.",
    primaryCta: "Resume approved work",
  },
  all_contained: {
    title: "All contained",
    body: "Runs are staying inside your time, scope, and interruption limits. Nothing needs you right now.",
    primaryCta: null,
  },
  needs_your_yes: {
    title: "Needs your yes",
    body: "An agent wants to cross a boundary that should not be automatic. Review the request and approve, narrow, or keep it queued.",
    primaryCta: "Review request",
  },
};

const UNKNOWN_TEMPLATE: HeadsDownCallTemplate = {
  title: "Needs your yes",
  body: "HeadsDown needs a human decision before this agent continues.",
  primaryCta: "Review request",
};

export function renderHeadsDownCall(
  payload: HeadsDownCallPayload | null | undefined,
): RenderedHeadsDownCall | null {
  const normalizedKey = normalizeKey(payload?.key ?? payload?.knownKey ?? null);
  if (!normalizedKey) {
    return null;
  }

  const knownKey = isCanonicalCallKey(normalizedKey) ? normalizedKey : null;
  const template = knownKey ? CALL_TEMPLATES[knownKey] : UNKNOWN_TEMPLATE;

  const title = firstPresent(payload?.title, template.title);
  const body = firstPresent(payload?.body, template.body);
  const primaryCta = knownKey
    ? firstPresent(payload?.primaryActionLabel, template.primaryCta)
    : template.primaryCta;

  return {
    key: normalizedKey,
    knownKey,
    title,
    body,
    primaryCta,
    summary: formatSummary(title, body, primaryCta),
    fallback: knownKey === null,
  };
}

function isCanonicalCallKey(value: string): value is CanonicalHeadsDownCallKey {
  return CANONICAL_HEADSDOWN_CALL_KEYS.includes(value as CanonicalHeadsDownCallKey);
}

function normalizeKey(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

function firstPresent(value: string | null | undefined, fallback: string): string;
function firstPresent(value: string | null | undefined, fallback: string | null): string | null;
function firstPresent(value: string | null | undefined, fallback: string | null): string | null {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function formatSummary(title: string, body: string, primaryCta: string | null): string {
  if (!primaryCta) {
    return `${title}. ${body}`;
  }

  return `${title}. ${body} Next move: ${primaryCta}.`;
}
