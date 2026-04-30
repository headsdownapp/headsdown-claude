export interface TimeBoxState {
  schemaVersion: 1;
  sessionIdHash: string;
  durationMinutes: number;
  createdAt: string;
  expiresAt: string;
  source: "slash_command";
}

export interface TimeBoxStatus {
  active: boolean;
  state: TimeBoxState | null;
  deadlineAt: string | null;
  remainingMinutes: number | null;
  thresholdMinutes: number | null;
  isPastDeadline: boolean;
  message: string;
}

export interface AttentionWindowInput {
  active?: boolean | null;
  deadlineAt?: string | null;
  thresholdMinutes?: number | null;
  remainingMinutes?: number | null;
  hints?: string[] | null;
  selectedMode?: string | null;
  source?: string | null;
}

export interface EffectiveAttentionWindow {
  deadlineAt: string | null;
  thresholdMinutes: number | null;
  remainingMinutes: number | null;
  hints: string[];
  source: "backend" | "time_box";
  selectedMode?: string | null;
  backendSource?: string | null;
}

const DEFAULT_TIME_BOX_THRESHOLD_MINUTES = 15;
const MINUTES_PER_HOUR = 60;

export function parseTimeBoxDuration(input: string): number {
  const normalized = input.trim().toLowerCase();
  const match = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);

  if (!match || (!match[1] && !match[2])) {
    throw new Error("Use a duration like 30m, 45m, 1h, or 1h30m.");
  }

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const totalMinutes = hours * MINUTES_PER_HOUR + minutes;

  if (!Number.isInteger(totalMinutes) || totalMinutes <= 0) {
    throw new Error("Use a positive duration like 30m, 45m, 1h, or 1h30m.");
  }

  return totalMinutes;
}

export function createTimeBox(input: {
  durationText: string;
  sessionIdHash: string;
  now?: Date;
}): TimeBoxState {
  const now = input.now ?? new Date();
  const durationMinutes = parseTimeBoxDuration(input.durationText);
  const sessionIdHash = input.sessionIdHash.trim();
  if (!sessionIdHash) {
    throw new Error("HeadsDown box requires a session id.");
  }
  const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);

  return {
    schemaVersion: 1,
    sessionIdHash,
    durationMinutes,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: "slash_command",
  };
}

export function buildTimeBoxStatus(
  state: TimeBoxState | null,
  now: Date = new Date(),
): TimeBoxStatus {
  if (!state) {
    return {
      active: false,
      state: null,
      deadlineAt: null,
      remainingMinutes: null,
      thresholdMinutes: null,
      isPastDeadline: false,
      message: "No active HeadsDown box for this session.",
    };
  }

  const remainingMinutes = minutesUntil(state.expiresAt, now);
  const thresholdMinutes = resolveTimeBoxThresholdMinutes(state.durationMinutes);
  const isPastDeadline = remainingMinutes <= 0;

  return {
    active: true,
    state,
    deadlineAt: state.expiresAt,
    remainingMinutes,
    thresholdMinutes,
    isPastDeadline,
    message: formatTimeBoxStatus(state, now),
  };
}

export function formatTimeBoxConfirmation(state: TimeBoxState, now: Date = new Date()): string {
  const remaining = minutesUntil(state.expiresAt, now);
  return `HeadsDown box set for ${state.durationMinutes} minutes. Deadline: ${formatTimeBoxClock(state.expiresAt)}. Remaining minutes: ${remaining}.`;
}

export function formatTimeBoxStatus(state: TimeBoxState, now: Date = new Date()): string {
  const remaining = minutesUntil(state.expiresAt, now);
  const threshold = resolveTimeBoxThresholdMinutes(state.durationMinutes);

  if (remaining <= 0) {
    return `HeadsDown box deadline passed at ${formatTimeBoxClock(state.expiresAt)}. Keep going with tighter wrap-up guidance until the box is cleared or replaced.`;
  }

  return `HeadsDown box active until ${formatTimeBoxClock(state.expiresAt)}. Remaining minutes: ${remaining}. Warning threshold minutes: ${threshold}.`;
}

export function formatTimeBoxClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function resolveEffectiveAttentionWindow(input: {
  backend?: AttentionWindowInput | null;
  timeBox?: TimeBoxState | null;
  now?: Date;
  forceTimeBoxWarning?: boolean;
}): EffectiveAttentionWindow | null {
  const now = input.now ?? new Date();
  const backendInput = input.backend ?? null;
  if (isFullDepthSuppressedBackendWindow(backendInput)) return null;

  const backend = normalizeBackendWindow(backendInput);
  const timeBox = input.timeBox ?? null;
  const timeBoxWindow = timeBox ? normalizeTimeBoxWindow(timeBox, now) : null;

  if (!timeBoxWindow) return backend;
  if (!backend) {
    if (!input.forceTimeBoxWarning && !isWithinWarningWindow(timeBoxWindow)) return null;
    return timeBoxWindow;
  }

  if (isTimeBoxEarlierOrEqual(backend, timeBoxWindow)) {
    return {
      ...timeBoxWindow,
      hints: mergeHints(backend.hints, timeBoxWindow.hints),
    };
  }

  return backend;
}

export function isWithinWarningWindow(window: EffectiveAttentionWindow): boolean {
  if (window.remainingMinutes === null || window.thresholdMinutes === null) return false;
  return window.remainingMinutes <= window.thresholdMinutes;
}

function isTimeBoxEarlierOrEqual(
  backend: EffectiveAttentionWindow,
  timeBoxWindow: EffectiveAttentionWindow,
): boolean {
  if (backend.deadlineAt && timeBoxWindow.deadlineAt) {
    return Date.parse(timeBoxWindow.deadlineAt) <= Date.parse(backend.deadlineAt);
  }

  if (backend.remainingMinutes !== null && timeBoxWindow.remainingMinutes !== null) {
    return timeBoxWindow.remainingMinutes <= backend.remainingMinutes;
  }

  return !!timeBoxWindow.deadlineAt && !backend.deadlineAt;
}

function normalizeBackendWindow(
  input: AttentionWindowInput | null,
): EffectiveAttentionWindow | null {
  if (!input || input.active === false) return null;

  const deadlineAt = normalizeIsoTimestamp(input.deadlineAt);
  const thresholdMinutes = normalizeNonNegativeFiniteNumber(input.thresholdMinutes);
  const remainingMinutes = normalizeNonNegativeFiniteNumber(input.remainingMinutes);
  const hints = normalizeHints(input.hints);

  if (!deadlineAt && thresholdMinutes === null && remainingMinutes === null && hints.length === 0) {
    return null;
  }

  const selectedMode = normalizeText(input.selectedMode);
  const backendSource = normalizeText(input.source);

  return {
    deadlineAt,
    thresholdMinutes,
    remainingMinutes,
    hints,
    source: "backend",
    ...(selectedMode ? { selectedMode } : {}),
    ...(backendSource ? { backendSource } : {}),
  };
}

function isFullDepthSuppressedBackendWindow(input: AttentionWindowInput | null): boolean {
  if (!input) return false;
  return (
    normalizeText(input.selectedMode) === "full_depth" ||
    normalizeText(input.source) === "forced_full_depth"
  );
}

function normalizeTimeBoxWindow(state: TimeBoxState, now: Date): EffectiveAttentionWindow | null {
  const deadlineAt = normalizeIsoTimestamp(state.expiresAt);
  if (!deadlineAt) return null;

  return {
    deadlineAt,
    thresholdMinutes: resolveTimeBoxThresholdMinutes(state.durationMinutes),
    remainingMinutes: minutesUntil(deadlineAt, now),
    hints: [
      "Self-declared box is active. Keep scope tight before the deadline; do not stop automatically when it passes.",
    ],
    source: "time_box",
  };
}

function resolveTimeBoxThresholdMinutes(durationMinutes: number): number {
  return Math.min(DEFAULT_TIME_BOX_THRESHOLD_MINUTES, Math.max(1, durationMinutes));
}

function minutesUntil(value: string, now: Date): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 60_000));
}

function normalizeIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

function normalizeNonNegativeFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeHints(values: string[] | null | undefined): string[] {
  return Array.isArray(values)
    ? values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
    : [];
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function mergeHints(first: string[], second: string[]): string[] {
  return [...new Set([...first, ...second])];
}
