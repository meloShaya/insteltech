import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_IDLE_TIMEOUT_MS,
  getIdleTimeoutDelay,
  getSessionActivityAt,
  isSessionIdle,
} from "../mail/session-timeout.mjs";

const NOW = Date.parse("2026-08-28T12:00:00.000Z");

test("a persisted activity marker older than 30 minutes expires on reload", () => {
  const lastActivityAt = NOW - SESSION_IDLE_TIMEOUT_MS - 1;

  assert.equal(
    getSessionActivityAt({ storedActivityAt: String(lastActivityAt) }),
    lastActivityAt,
  );
  assert.equal(isSessionIdle(lastActivityAt, NOW), true);
  assert.equal(getIdleTimeoutDelay(lastActivityAt, NOW), 0);
});

test("recent persisted activity keeps the session alive", () => {
  const lastActivityAt = NOW - SESSION_IDLE_TIMEOUT_MS + 1;

  assert.equal(isSessionIdle(lastActivityAt, NOW), false);
  assert.equal(getIdleTimeoutDelay(lastActivityAt, NOW), 1);
});

test("a new session falls back to its creation time when no activity marker exists", () => {
  const sessionCreatedAt = (NOW - SESSION_IDLE_TIMEOUT_MS - 1) / 1000;

  assert.equal(
    getSessionActivityAt({
      sessionCreatedAt,
      lastSignInAt: "2026-08-28T11:59:00.000Z",
    }),
    NOW - SESSION_IDLE_TIMEOUT_MS - 1,
  );
  assert.equal(
    isSessionIdle(
      getSessionActivityAt({ sessionCreatedAt }),
      NOW,
    ),
    true,
  );
});

test("a session with no trustworthy age is treated as idle", () => {
  assert.equal(getSessionActivityAt({}), 0);
  assert.equal(isSessionIdle(0, NOW), true);
  assert.equal(getIdleTimeoutDelay(0, NOW), 0);
});
