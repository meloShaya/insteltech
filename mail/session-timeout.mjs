export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1e12 ? value * 1000 : value;
  }

  if (typeof value !== "string") return 0;

  const normalized = value.trim();
  if (!normalized) return 0;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return numeric > 0 && numeric < 1e12 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSessionActivityAt({
  storedActivityAt,
  sessionCreatedAt,
  lastSignInAt,
} = {}) {
  return (
    parseTimestamp(storedActivityAt) ||
    parseTimestamp(sessionCreatedAt) ||
    parseTimestamp(lastSignInAt)
  );
}

export function isSessionIdle(
  lastActivityAt,
  now = Date.now(),
  timeoutMs = SESSION_IDLE_TIMEOUT_MS,
) {
  const activityAt = parseTimestamp(lastActivityAt);
  return !activityAt || now - activityAt >= timeoutMs;
}

export function getIdleTimeoutDelay(
  lastActivityAt,
  now = Date.now(),
  timeoutMs = SESSION_IDLE_TIMEOUT_MS,
) {
  const activityAt = parseTimestamp(lastActivityAt);
  if (!activityAt) return 0;

  return Math.max(0, timeoutMs - Math.max(0, now - activityAt));
}
