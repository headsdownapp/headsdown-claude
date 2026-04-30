export const CANONICAL_HEADSDOWN_CALL_KEYS = [
  "good_to_run",
  "keep_it_tight",
  "not_worth_starting_now",
  "off_the_clock",
  "attention_window_closing",
  "ready_to_resume",
  "needs_your_yes",
] as const;

export type CanonicalHeadsDownCallKey = (typeof CANONICAL_HEADSDOWN_CALL_KEYS)[number];

export const DEPRECATED_HEADSDOWN_CALL_KEYS = ["rabbit_hole_detected", "all_contained"] as const;

const CANONICAL_HEADSDOWN_CALL_KEY_SET = new Set<string>(CANONICAL_HEADSDOWN_CALL_KEYS);
const DEPRECATED_HEADSDOWN_CALL_KEY_SET = new Set<string>(DEPRECATED_HEADSDOWN_CALL_KEYS);

export function normalizeHeadsDownCallKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  if (!trimmed) return null;

  return trimmed
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

export function isCanonicalHeadsDownCallKey(
  value: string | null | undefined,
): value is CanonicalHeadsDownCallKey {
  const normalized = normalizeHeadsDownCallKey(value);
  return normalized !== null && CANONICAL_HEADSDOWN_CALL_KEY_SET.has(normalized);
}

export function canonicalHeadsDownCallKey(
  value: string | null | undefined,
): CanonicalHeadsDownCallKey | null {
  const normalized = normalizeHeadsDownCallKey(value);
  return normalized && CANONICAL_HEADSDOWN_CALL_KEY_SET.has(normalized)
    ? (normalized as CanonicalHeadsDownCallKey)
    : null;
}

export function isDeprecatedHeadsDownCallKey(value: string | null | undefined): boolean {
  const normalized = normalizeHeadsDownCallKey(value);
  return normalized !== null && DEPRECATED_HEADSDOWN_CALL_KEY_SET.has(normalized);
}
