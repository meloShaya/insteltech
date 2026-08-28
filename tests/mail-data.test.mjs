import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchActiveThreads,
  updateThreadDeletedAt,
} from "../mail/mail-data.mjs";

function createQueryDouble(result) {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    is(column, value) {
      calls.push(["is", column, value]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return this;
    },
    limit(value) {
      calls.push(["limit", value]);
      return this;
    },
    update(values) {
      calls.push(["update", values]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return Promise.resolve(result);
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return {
    calls,
    supabase: {
      from(table) {
        calls.push(["from", table]);
        return query;
      },
    },
  };
}

test("fetches only active mailbox threads", async () => {
  const thread = { id: "thread-1", subject: "Project update" };
  const { calls, supabase } = createQueryDouble({ data: [thread], error: null });

  const result = await fetchActiveThreads(supabase);

  assert.deepEqual(result, [thread]);
  assert.deepEqual(calls, [
    ["from", "mail_threads"],
    [
      "select",
      "id, subject, normalized_subject, last_message_at, created_at",
    ],
    ["is", "deleted_at", null],
    ["order", "last_message_at", { ascending: false }],
    ["limit", 100],
  ]);
});

test("soft deletes a thread by persisting its deletion timestamp", async () => {
  const { calls, supabase } = createQueryDouble({ data: null, error: null });
  const deletedAt = "2026-08-28T08:00:00.000Z";

  await updateThreadDeletedAt(supabase, "thread-1", deletedAt);

  assert.deepEqual(calls, [
    ["from", "mail_threads"],
    ["update", { deleted_at: deletedAt }],
    ["eq", "id", "thread-1"],
  ]);
});

test("surfaces database errors when updating a thread", async () => {
  const { supabase } = createQueryDouble({
    data: null,
    error: new Error("permission denied"),
  });

  await assert.rejects(
    () => updateThreadDeletedAt(supabase, "thread-1", null),
    /permission denied/,
  );
});
