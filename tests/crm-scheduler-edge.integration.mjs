// Authentication and queue integration against real Edge Runtime; providers are never contacted.
import { createServer } from "node:http";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const actor = "11111111-1111-4111-8111-111111111111";
const service = "fixture-service-key-for-local-integration";
let member = true,
  requests = [];
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const part of req) raw += part;
  const body = raw ? JSON.parse(raw) : {},
    path = new URL(req.url, "http://localhost").pathname;
  requests.push({ path, body });
  const respond = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const rows = (data) =>
    respond(
      req.headers.accept?.includes("vnd.pgrst.object") ? data[0] || null : data,
    );
  const user = {
    id: actor,
    email: "owner@example.com",
    aud: "authenticated",
    role: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  };
  if (path === "/auth/v1/user")
    return req.headers.authorization === "Bearer member-token"
      ? respond(user)
      : respond({ message: "Invalid user" }, 401);
  if (path === `/auth/v1/admin/users/${actor}`) return respond(user);
  if (path === "/rest/v1/mail_members")
    return rows(
      member ? [{ user_id: actor, role: "owner", active: true }] : [],
    );
  if (path === "/rest/v1/crm_campaigns") return rows([]);
  if (path === "/rest/v1/crm_settings") return rows([{}]);
  if (path === "/rest/v1/rpc/crm_enqueue_due_schedules") return respond(0);
  if (path === "/rest/v1/rpc/crm_claim_automation") return respond([]);
  if (path === "/rest/v1/rpc/crm_queue_automation")
    return respond("22222222-2222-4222-8222-222222222222");
  return respond({ message: `Unexpected fixture request ${path}` }, 404);
});
await new Promise((done) => server.listen(0, "0.0.0.0", done));
const mockPort = server.address().port;
const containers = [];
const dockerOS = execFileSync(
  "docker",
  ["info", "--format", "{{.OperatingSystem}}"],
  { encoding: "utf8" },
);
async function start(name, port) {
  const container = `instel-${name}-fixture-${process.pid}`;
  containers.push(container);
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      container,
      "-p",
      `127.0.0.1:${port}:9000`,
      ...(dockerOS.includes("Docker Desktop")
        ? []
        : ["--add-host=host.docker.internal:host-gateway"]),
      "-v",
      `${root}supabase/functions:/home/deno/functions/supabase/functions:ro`,
      "-v",
      `${root}crm:/home/deno/functions/crm:ro`,
      "-e",
      `SUPABASE_URL=http://host.docker.internal:${mockPort}`,
      "-e",
      `SUPABASE_SERVICE_ROLE_KEY=${service}`,
      "-e",
      "SUPABASE_ANON_KEY=fixture-anon",
      "-e",
      "RESEND_API_KEY=fixture-never-used",
      "--entrypoint",
      "edge-runtime",
      "public.ecr.aws/supabase/edge-runtime:v1.68.3",
      "start",
      "--verbose",
      "--main-service",
      `/home/deno/functions/supabase/functions/${name}`,
    ],
    { stdio: "pipe" },
  );
  // Cold containers must fetch the SDK before their first request can run.
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        body: "{}",
        signal: AbortSignal.timeout(2000),
      });
      if (r.status !== 503) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  const logs = spawnSync("docker", ["logs", "--tail", "30", container], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  throw new Error(`${name} did not become ready: ${logs.stdout}${logs.stderr}`);
}
async function call(port, body, token = "member-token", extra = {}) {
  const r = await fetch(`http://127.0.0.1:${port}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...extra,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: r.status, data: await r.json() };
}
try {
  await start("crm-automation", 19083);
  assert.equal(
    (await call(19083, { action: "queue" }, "bad-token")).status,
    401,
  );
  assert.equal((await call(19083, { action: "queue" }, service)).status, 403);
  assert.equal(
    (
      await call(19083, { action: "tick" }, service, {
        Origin: "http://localhost:8000",
      })
    ).status,
    401,
  );
  const tick = await call(19083, { action: "tick" }, service);
  assert.equal(tick.status, 200);
  assert.equal(tick.data.idle, true);
  member = false;
  assert.equal((await call(19083, { action: "queue" })).status, 403);
  member = true;
  assert.equal(
    (
      await call(19083, {
        action: "queue",
        steps: [{ operation: "arbitrary.fetch", input: {} }],
      })
    ).status,
    400,
  );
  const queue = await call(19083, {
    action: "queue",
    title: "Fixture research",
    steps: [
      { operation: "web.search", input: { query: "example" }, is_write: true },
    ],
  });
  assert.equal(queue.status, 200);
  const queued = requests.findLast((r) =>
    r.path.endsWith("crm_queue_automation"),
  );
  assert.equal(queued.body.p_creator, actor);
  assert.equal(queued.body.p_steps[0].is_write, false);
  await start("mail-send", 19084);
  const invalidMessage = {
    to: "test@example.com",
    text: "Fixture",
    client_send_id: "fixture",
  }; // No subject: fails before provider transport.
  requests = [];
  assert.equal(
    (await call(19084, invalidMessage, service, { "x-crm-actor": actor }))
      .status,
    400,
  );
  assert.ok(requests.some((r) => r.path === `/auth/v1/admin/users/${actor}`));
  requests = [];
  assert.equal(
    (
      await call(19084, invalidMessage, "member-token", {
        "x-crm-actor": actor,
      })
    ).status,
    400,
  );
  assert.equal(
    requests.some((r) => r.path.startsWith("/auth/v1/admin/")),
    false,
  );
  member = false;
  assert.equal(
    (await call(19084, invalidMessage, service, { "x-crm-actor": actor }))
      .status,
    403,
  );
  console.log(
    "Scheduler/mail Edge integration passed: service-only ticks, active membership, named operations, queue ownership and non-spoofable scheduled actors. No provider requests.",
  );
} finally {
  for (const container of containers) {
    try {
      execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
    } catch {}
  }
  await new Promise((done) => server.close(done));
}
