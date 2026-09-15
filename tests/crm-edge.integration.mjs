// Local integration test: real Supabase Edge Runtime + fake auth/database/mail HTTP service.
// No provider credentials, subscription calls, or real mail are used.
import { createServer } from "node:http";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const ownerId = "11111111-1111-4111-8111-111111111111";
const campaignId = "44444444-4444-4444-8444-444444444444";
const contactId = "33333333-3333-4333-8333-333333333333";
const recipientId = "66666666-6666-4666-8666-666666666666";
const messageId = "77777777-7777-4777-8777-777777777777";
const container = `instel-crm-edge-check-${process.pid}`;
let data;
function reset(overrides = {}) {
  data = {
    contact: {
      id: contactId,
      email: "test@example.com",
      first_name: "Ada",
      company: "Acme",
      consent: true,
      consent_note: "Test opt-in",
      suppressed: false,
    },
    campaign: {
      id: campaignId,
      status: "active",
      subject: "Hi {{first_name}}",
      body: "{Hello|Hi} {{first_name}}, thanks for connecting.",
    },
    settings: {
      company_name: "Test company",
      physical_address: "Test address",
      unsubscribe_email: "stop@example.com",
    },
    recipient: {
      id: recipientId,
      campaign_id: campaignId,
      contact_id: contactId,
      status: "pending",
    },
    outbox: [],
    sendStatus: 200,
    ...overrides,
  };
}
reset();
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://localhost");
  const respond = (payload, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  const rows = (value) =>
    respond(
      req.headers.accept?.includes("vnd.pgrst.object")
        ? (value[0] ?? null)
        : value,
    );
  if (url.pathname === "/auth/v1/user") {
    if (req.headers.authorization !== "Bearer member-token")
      return respond({ message: "Invalid token" }, 401);
    return respond({
      id: ownerId,
      aud: "authenticated",
      role: "authenticated",
      email: "owner@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  if (url.pathname === "/rest/v1/mail_members")
    return rows([{ user_id: ownerId, role: "owner", active: true }]);
  if (url.pathname === "/rest/v1/crm_campaigns") return rows([data.campaign]);
  if (url.pathname === "/rest/v1/crm_settings") return rows([data.settings]);
  if (url.pathname === "/rest/v1/crm_contacts") return rows([data.contact]);
  if (url.pathname === "/rest/v1/rpc/crm_claim_recipient") {
    if (
      data.recipient.status !== "pending" ||
      data.campaign.status !== "active"
    )
      return respond([]);
    data.recipient.status = "sending";
    return respond([{ ...data.recipient }]);
  }
  if (url.pathname === "/rest/v1/crm_recipients") {
    if (req.method === "PATCH") {
      Object.assign(data.recipient, body);
      return respond(null);
    }
    return rows([data.recipient]);
  }
  if (url.pathname === "/functions/v1/mail-send") {
    data.outbox.push(body);
    return data.sendStatus === 200
      ? respond({ ok: true, message_id: messageId })
      : respond(
          { error: "Outcome unknown", message_id: messageId },
          data.sendStatus,
        );
  }
  return respond({ message: `Unexpected mock route ${url.pathname}` }, 404);
});
await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
const mockPort = server.address().port;
const edgePort = 19082;
const call = async (
  body,
  token = "member-token",
  origin = "http://localhost:8000",
) => {
  const response = await fetch(`http://127.0.0.1:${edgePort}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Origin: origin,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
};
try {
  const dockerOS = execFileSync(
    "docker",
    ["info", "--format", "{{.OperatingSystem}}"],
    { encoding: "utf8" },
  );
  const hostArgs = dockerOS.includes("Docker Desktop")
    ? []
    : ["--add-host=host.docker.internal:host-gateway"];
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      container,
      "-p",
      `127.0.0.1:${edgePort}:9000`,
      ...hostArgs,
      "-v",
      `${root}/supabase/functions:/home/deno/functions/supabase/functions:ro`,
      "-v",
      `${root}/crm:/home/deno/functions/crm:ro`,
      "-e",
      `SUPABASE_URL=http://host.docker.internal:${mockPort}`,
      "-e",
      "SUPABASE_SERVICE_ROLE_KEY=local-test-service-key",
      "-e",
      "SUPABASE_ANON_KEY=local-test-anon-key",
      "--entrypoint",
      "edge-runtime",
      "public.ecr.aws/supabase/edge-runtime:v1.68.3",
      "start",
      "--main-service",
      "/home/deno/functions/supabase/functions/crm-action",
    ],
    { stdio: "pipe" },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${edgePort}`, {
        method: "OPTIONS",
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    const logs = spawnSync("docker", ["logs", "--tail", "15", container], {
      encoding: "utf8",
    });
    throw new Error(
      "Local Edge Runtime did not become ready: " + logs.stdout + logs.stderr,
    );
  }
  assert.equal(
    (
      await call(
        { action: "send_batch", campaign_id: campaignId },
        "invalid-token",
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        { action: "send_batch", campaign_id: campaignId },
        "member-token",
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(data.outbox.length, 0);

  let result = await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(data.outbox.length, 1);
  assert.equal(data.outbox[0].client_send_id, recipientId);
  assert.equal(data.outbox[0].subject, "Hi Ada");
  assert.match(data.outbox[0].text, /Test address/);
  assert.match(data.outbox[0].text, /stop@example.com/);
  assert.doesNotMatch(data.outbox[0].text, /\{\{|\|/);
  assert.equal(data.recipient.status, "sent");
  await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(
    data.outbox.length,
    1,
    "A second batch must not resend a claimed recipient",
  );

  reset();
  data.contact.consent = false;
  await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(data.outbox.length, 0);
  assert.equal(data.recipient.status, "suppressed");
  reset();
  data.contact.suppressed = true;
  await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(data.outbox.length, 0);
  assert.equal(data.recipient.status, "suppressed");
  reset();
  data.settings.physical_address = "";
  result = await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(result.status, 400);
  assert.equal(data.recipient.status, "pending");
  reset();
  data.contact.first_name = "";
  await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(data.outbox.length, 0);
  assert.equal(data.recipient.status, "failed");
  reset({ sendStatus: 504 });
  await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(data.recipient.status, "unknown");
  await call({ action: "send_batch", campaign_id: campaignId });
  assert.equal(
    data.outbox.length,
    1,
    "Unknown outcomes must never be retried automatically",
  );
  console.log(
    "Edge integration passed: authentication, CORS, consent, suppression, merge fields, opt-out footer, duplicate prevention, and unknown outcomes.",
  );
} finally {
  try {
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  } catch {}
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
