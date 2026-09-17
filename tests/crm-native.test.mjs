import test from "node:test";
import assert from "node:assert/strict";
import { executeCRMOperation } from "../supabase/functions/_shared/crm-native.mjs";

function taskDB() {
  return { from(table) {
    assert.equal(table, "crm_tasks");
    return { insert(row) { return { select() { return { single: async () => ({ data: { id: "saved-task", ...row } }) }; } }; } };
  } };
}

test("CRM task dates accept a calendar date or ISO timestamp and use the database default when omitted", async () => {
  for (const due_at of ["2026-09-18", "2026-09-18T00:00:00Z", "2026-09-18T23:00:00-04:00"]) {
    const result = await executeCRMOperation(taskDB(), "crm.add_task", { title: "Continue research", due_at });
    assert.equal(result.records[0].id, "saved-task");
    assert.equal(result.records[0].due_at, "2026-09-18");
  }
  const result = await executeCRMOperation(taskDB(), "crm.add_task", { title: "Continue research" });
  assert.equal(Object.hasOwn(result.records[0], "due_at"), false);
});

test("CRM task date validation rejects impossible or ambiguous dates before inserting", async () => {
  for (const due_at of ["2026-02-30", "tomorrow", "18/09/2026", "2026-09-18T99:00:00Z"]) {
    await assert.rejects(executeCRMOperation(taskDB(), "crm.add_task", { title: "Continue research", due_at }), /YYYY-MM-DD/);
  }
});
