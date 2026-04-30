import type { HeadsDownCallPayload } from "./current-headsdown-call.js";
import {
  type CanonicalHeadsDownCallKey,
  isCanonicalHeadsDownCallKey,
  isDeprecatedHeadsDownCallKey,
  normalizeHeadsDownCallKey,
} from "./headsdown-call-keys.js";
export {
  CANONICAL_HEADSDOWN_CALL_KEYS,
  type CanonicalHeadsDownCallKey,
} from "./headsdown-call-keys.js";

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
    body: "Non-urgent agent decisions wait until the next work window. New asks should queue.",
    primaryCta: "Queue for later",
  },
  attention_window_closing: {
    title: "Window closing",
    body: "Your attention window is closing. Choose whether to extend or wrap with a summary while context is fresh.",
    primaryCta: "Extend",
  },
  ready_to_resume: {
    title: "Ready to resume",
    body: "HeadsDown saved the thread so the agent can pick up without starting over. Resume the approved work or keep it queued.",
    primaryCta: "Resume approved work",
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

  const knownKey = isCanonicalHeadsDownCallKey(normalizedKey) ? normalizedKey : null;
  const deprecated = isDeprecatedHeadsDownCallKey(normalizedKey);
  const template = knownKey ? CALL_TEMPLATES[knownKey] : UNKNOWN_TEMPLATE;

  const title = deprecated ? UNKNOWN_TEMPLATE.title : firstPresent(payload?.title, template.title);
  const body = deprecated ? UNKNOWN_TEMPLATE.body : firstPresent(payload?.body, template.body);
  const primaryCta = deprecated
    ? UNKNOWN_TEMPLATE.primaryCta
    : knownKey
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

function normalizeKey(value: string | null): string | null {
  return normalizeHeadsDownCallKey(value);
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
