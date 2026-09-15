import test from "node:test";
import assert from "node:assert/strict";
import {
  handleTool,
  clayCommand,
  toolDefinitions,
} from "../scripts/crm-mcp.mjs";
test("CRM MCP advertises only permitted provider operations and blocks writes again at execution", async () => {
  const tools = toolDefinitions(false);
  assert.ok(
    tools[0].inputSchema.properties.operation.enum.includes("maps.search"),
  );
  assert.equal(
    tools[0].inputSchema.properties.operation.enum.includes("smartlead.create"),
    false,
  );
  await assert.rejects(
    handleTool(
      "provider_operation",
      { operation: "smartlead.create", input: { name: "x" }, call_id: "one" },
      { allow_provider_writes: false },
    ),
    /disabled/,
  );
  await assert.rejects(
    handleTool(
      "clay",
      { operation: "publish", input: { workflow_id: "x" } },
      { allow_provider_writes: false },
    ),
    /disabled/,
  );
});
test("CRM MCP forwards a stable job-scoped call ID and never returns credentials", async () => {
  let body;
  const result = await handleTool(
    "provider_operation",
    {
      operation: "web.search",
      input: { query: "company" },
      call_id: "research-company-1",
    },
    {
      url: "https://fixture.supabase.co",
      job_id: "job",
      token: "worker-test",
      anonKey: "anon-test",
    },
    async (url, init) => {
      assert.equal(url, "https://fixture.supabase.co/functions/v1/crm-action");
      assert.equal(init.headers["x-crm-worker"], "worker-test");
      body = JSON.parse(init.body);
      return Response.json({
        status: "completed",
        run_id: "run",
        output: { records: [] },
      });
    },
  );
  assert.equal(body.call_id, "research-company-1");
  assert.equal(body.job_id, "job");
  assert.equal(JSON.parse(result).status, "completed");
  assert.ok(!result.includes("worker-test"));
});
test("Clay commands cannot become arbitrary shell commands; workflow references stay in the library", async () => {
  assert.deepEqual(clayCommand("node_create", { workflow_id: "wf123" }), [
    "workflows",
    "nodes",
    "create",
    "wf123",
    "--input",
    "-",
  ]);
  assert.deepEqual(clayCommand("create", { name: "$(not-a-shell-command)" }), [
    "workflows",
    "create",
    "--name",
    "$(not-a-shell-command)",
  ]);
  assert.throws(() =>
    clayCommand("node_get", { workflow_id: "wf123", node_id: "../secret" }),
  );
  assert.throws(() => clayCommand("delete_everything", {}));
  await assert.rejects(
    handleTool("workflow_reference", { path: "../../.env" }, {}),
    /inside the imported/,
  );
  assert.match(
    await handleTool(
      "workflow_reference",
      { path: "skills/playbooks/clay-playbooks/clay-cli-harness.md" },
      {},
    ),
    /Clay CLI harness/,
  );
});
