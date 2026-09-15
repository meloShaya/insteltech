import test from "node:test";
import assert from "node:assert/strict";
import {
  providerRequest,
  executeProvider,
  publicURL,
  connectionStatus,
} from "../supabase/functions/_shared/crm-adapters.mjs";
import {
  validatePlan,
  resolveInput,
  retryOutcome,
} from "../supabase/functions/_shared/crm-automation.mjs";
import { codexArguments, codexConfig } from "../crm/codex-config.mjs";
import { campaignPlan, sequenceConfig } from "../crm/campaign-sequences.mjs";
import { advanceMarket } from "../supabase/functions/_shared/crm-market.mjs";
const secrets = key => key === "LINKEDIN_RAPIDAPI_HOST" ? undefined : "fixture-key-only";

test("Maps search uses the upstream RapidAPI contract and bounded query parameters", () => {
  const request = providerRequest(
    "maps.search",
    { query: "dentists Harare", country: "ZW", limit: 20 },
    secrets,
  );
  assert.equal(request.url.hostname, "maps-data.p.rapidapi.com");
  assert.equal(request.url.pathname, "/searchmaps.php");
  assert.equal(request.url.searchParams.get("country"), "zw");
  assert.equal(request.init.headers["X-RapidAPI-Host"], request.url.hostname);
  assert.throws(() =>
    providerRequest("maps.search", { query: "x", limit: 9999 }, secrets),
  );
});
test("LinkedIn and website research cannot redirect requests to private services", () => {
  for (const url of [
    "http://example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "https://a.internal",
    "https://name:secret@example.com",
    "https://example.com:8443",
  ])
    assert.throws(() => publicURL(url));
  assert.throws(() =>
    providerRequest(
      "linkedin.person",
      { url: "https://linkedin.com.evil.example/in/alex" },
      secrets,
    ),
  );
  const request = providerRequest(
    "linkedin.person",
    { url: "https://www.linkedin.com/in/alex" },
    secrets,
  );
  assert.deepEqual(JSON.parse(request.init.body), {
    link: "https://www.linkedin.com/in/alex",
  });
  assert.equal(
    providerRequest("web.scrape", { url: "https://example.com/about" }, secrets)
      .url.href,
    "https://api.tavily.com/extract",
  );
});
test("Smartlead sequence, warmup and insurance tags use explicit write contracts", () => {
  assert.equal(JSON.parse(providerRequest("smartlead.settings", { campaign_id: "123", stop_on_reply: false }, secrets).init.body).stop_lead_settings, "NEVER");
  const warmup = providerRequest(
    "smartlead.warmup",
    {
      account_id: "12",
      enabled: true,
      daily_limit: 15,
      ramp: 0,
      reply_rate: 20,
    },
    secrets,
  );
  assert.equal(warmup.url.pathname, "/api/v1/email-accounts/12/warmup");
  assert.deepEqual(JSON.parse(warmup.init.body), {
    warmup_enabled: "true",
    total_warmup_per_day: 15,
    daily_rampup: 0,
    reply_rate_percentage: 20,
  });
  const signature = providerRequest(
    "smartlead.signature",
    { account_id: "12", signature: "Alex" },
    secrets,
  );
  assert.equal(signature.url.pathname, "/api/v1/email-accounts/save");
  assert.equal(JSON.parse(signature.init.body).id, 12);
  assert.throws(() =>
    providerRequest(
      "smartlead.status",
      { campaign_id: "../../accounts", status: "START" },
      secrets,
    ),
  );
  assert.throws(() =>
    providerRequest(
      "smartlead.leads",
      {
        campaign_id: "123",
        leads: [{ email: "a@example.com", suppressed: true }],
      },
      secrets,
    ),
  );
});
test("Provider failures never expose keys and hold ambiguous writes", async () => {
  const input = { name: "Test" };
  for (const fetcher of [
    async () => {
      throw new Error("secret in network message");
    },
    async () => new Response("secret", { status: 503 }),
    async () => new Response("invalid json"),
  ]) {
    await assert.rejects(
      executeProvider("smartlead.create", input, { secrets, fetcher }),
      (error) => error.uncertain === true && !error.message.includes("secret"),
    );
  }
  await assert.rejects(
    executeProvider(
      "web.search",
      { query: "company news" },
      {
        secrets,
        fetcher: async () =>
          new Response("rate limited", {
            status: 429,
            headers: { "Retry-After": "120" },
          }),
      },
    ),
    (error) => error.retryable && error.retryAfter === 120 && !error.uncertain,
  );
});
test("Research response retains source evidence and fetch time", async () => {
  const result = await executeProvider(
    "web.search",
    { query: "company news" },
    {
      secrets,
      fetcher: async () =>
        Response.json({
          results: [
            {
              title: "News",
              url: "https://example.com/news",
              content: "Evidence",
            },
          ],
        }),
    },
  );
  assert.equal(result.records[0].url, "https://example.com/news");
  assert.equal(result.source, "web");
  assert.ok(Date.parse(result.fetched_at));
  assert.equal(
    connectionStatus(() => undefined).every((c) => !c.connected),
    true,
  );
});
test("Durable plans resolve only earlier saved results and never executable expressions", () => {
  const plan = validatePlan([
    { operation: "smartlead.create", input: { name: "New campaign" } },
    {
      operation: "smartlead.sequence",
      input: {
        campaign_id: { $step: 0, path: "data.id" },
        sequences: [{ seq_number: 1 }],
      },
    },
  ]);
  assert.equal(plan[0].is_write, true);
  assert.equal(
    resolveInput(plan[1].input, [{ data: { id: 42 } }]).campaign_id,
    42,
  );
  assert.throws(() =>
    validatePlan([
      {
        operation: "web.search",
        input: { query: { $step: 0, path: "data.id" } },
      },
    ]),
  );
  assert.throws(() => resolveInput({ $step: 0, path: "constructor" }, [{}]));
  assert.throws(() => resolveInput({ $step: 0, path: "data.id" }, [{}]));
  assert.deepEqual(retryOutcome({ retryable: true, uncertain: true }, 1, 6), {
    status: "held",
    delay: 0,
  });
  assert.deepEqual(retryOutcome({ retryable: true, retryAfter: 120 }, 1, 3), {
    status: "queued",
    delay: 120,
  });
  assert.equal(retryOutcome({ retryable: true }, 3, 3).status, "failed");
});
test("Codex settings enable live research and configurable sub-agent models without config injection", () => {
  const args = codexArguments({
    subagents: true,
    agent_model: "gpt-5.6-luna",
    agent_reasoning_effort: "high",
    max_agents: 4,
  });
  assert.deepEqual(args.slice(0, 2), ["--enable", "multi_agent"]);
  assert.ok(args.includes('web_search="live"'));
  assert.ok(args.includes('agents.default_subagent_model="gpt-5.6-luna"'));
  assert.ok(args.includes('agents.default_subagent_reasoning_effort="high"'));
  assert.ok(
    codexArguments({ web_search: false }).includes('web_search="disabled"'),
  );
  assert.throws(() => codexConfig({ model: 'model"\n[hooks]' }));
  assert.throws(() => codexConfig({ max_agents: 100 }));
});
test("Campaign publishing builds complete provider sequences and never activates unless configured", () => {
  const campaign = {
    name: "Fixture",
    provider: "smartlead",
    subject: "Hello {{first_name}}",
    body: "At {{company}}",
    sequence: [
      { subject: "Following up", body: "Hi {{first_name}}", delay_days: 3 },
    ],
    sending_config: { sender_ids: "12,13" },
  };
  const contacts = [
    { first_name: "Alex", company: "Example", email: "a@example.com" },
  ];
  const profile = {
    company_name: "Fixture",
    physical_address: "Harare",
    unsubscribe_email: "stop@example.com",
  };
  const plan = campaignPlan(campaign, contacts, profile);
  assert.deepEqual(
    plan.map((s) => s.operation),
    [
      "smartlead.create",
      "smartlead.sequence",
      "smartlead.attach",
      "smartlead.settings",
      "smartlead.schedule",
      "smartlead.leads",
    ],
  );
  assert.equal(plan[1].input.sequences[1].seq_delay_details.delay_in_days, 3);
  assert.equal(plan[1].input.sequences[0].seq_delay_details.delay_in_days, 0);
  assert.deepEqual(plan[1].input.campaign_id, {
    $step: 0,
    path: "resource_id",
  });
  assert.match(plan[1].input.sequences[0].email_body, /stop@example.com/);
  campaign.sending_config.autonomous = true;
  assert.equal(
    campaignPlan(campaign, contacts, profile).at(-1).operation,
    "smartlead.status",
  );
  campaign.provider = "instantly";
  campaign.sending_config.sender_ids = "sender@example.com";
  const instant = campaignPlan(campaign, contacts, profile);
  assert.equal(instant[0].input.sequences[0].steps[0].delay, 3);
  assert.equal(instant[0].input.stop_on_reply, true);
  assert.equal(instant[0].input.schedule.schedules[0].days["0"], false);
  assert.equal(instant.at(-1).input.status, "activate");
  assert.throws(
    () => campaignPlan(campaign, [{ ...contacts[0], first_name: "" }], profile),
    /first_name/,
  );
  assert.throws(
    () =>
      sequenceConfig({ ...campaign, sending_config: { timezone: "invalid" } }),
    /time zone/,
  );
  assert.throws(
    () => sequenceConfig({ ...campaign, sending_config: { days: [] } }),
    /sending day/,
  );
});
test("Multi-provider expansion checkpoints discovery, enrichment, research and verification without replay", async () => {
  const calls = [],
    execute = async (op, input) => {
      calls.push(op);
      if (op === "maps.search")
        return {
          records: [{ website: "https://example.com", name: "Example" }],
        };
      if (op === "disco.discover")
        return { records: [{ domain: "example.com", name: "Duplicate" }] };
      if (op === "blitz.company")
        return {
          data: {
            company: { name: "Example" },
            employees: [
              { first_name: "Alex", title: "CEO", email: "alex@example.com" },
              { title: "Engineer", email: "engineer@example.com" },
            ],
          },
        };
      if (op === "web.scrape")
        return {
          records: [{ url: input.url, raw_content: "Company evidence" }],
        };
      return { data: { resultcode: 1, result: "ok" } };
    };
  const input = {
    query: "companies",
    sources: "maps,disco",
    titles: "CEO",
    research: true,
    verify: true,
    limit: 10,
  };
  let progress;
  for (let i = 0; i < 10; i++) {
    const before = calls.length;
    progress = await advanceMarket(input, progress?.checkpoint, execute);
    assert.ok(
      calls.length - before <= 1,
      "At most one provider call per checkpoint",
    );
    if (progress.done) break;
  }
  assert.equal(progress.done, true);
  assert.deepEqual(calls, [
    "maps.search",
    "disco.discover",
    "blitz.company",
    "web.scrape",
    "millionverifier.verify",
  ]);
  assert.equal(progress.output.records.length, 1);
  assert.equal(progress.output.records[0].verification, "verified");
  assert.equal(progress.output.records[0].consent, false);
  assert.equal(progress.output.data.companies.length, 1);
});
test("GetLeads initializes its own MCP session and parses SSE tool results", async () => {
  const calls = [];
  const output = await executeProvider(
    "getleads.call",
    { tool: "count_contacts", arguments: { company_domain: "example.com" } },
    {
      secrets,
      fetcher: async (_, init) => {
        const body = JSON.parse(init.body);
        calls.push(body.method);
        if (body.method === "initialize")
          return Response.json(
            { jsonrpc: "2.0", id: 1, result: {} },
            { headers: { "mcp-session-id": "fixture-session" } },
          );
        assert.equal(init.headers["mcp-session-id"], "fixture-session");
        if (body.method === "notifications/initialized")
          return new Response(null, { status: 202 });
        return new Response(
          'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"count\\":42}"}]}}\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    },
  );
  assert.deepEqual(calls, [
    "initialize",
    "notifications/initialized",
    "tools/call",
  ]);
  assert.equal(output.data.count, 42);
});
test("Scraping actors use asynchronous run IDs and paginated datasets", async () => {
  const request = providerRequest(
    "apify.run",
    { actor_id: "owner~actor", input: { urls: ["https://example.com"] } },
    secrets,
  );
  assert.equal(
    request.url.href,
    "https://api.apify.com/v2/acts/owner~actor/runs",
  );
  const result = await executeProvider(
    "apify.run",
    { actor_id: "owner~actor", input: {} },
    {
      secrets,
      fetcher: async () =>
        Response.json({
          data: { id: "run1", status: "READY", defaultDatasetId: "dataset1" },
        }),
    },
  );
  assert.equal(result.resource_id, "run1");
  const dataset = providerRequest(
    "apify.dataset",
    { dataset_id: "dataset1", offset: 100, limit: 100 },
    secrets,
  );
  assert.equal(dataset.url.searchParams.get("offset"), "100");
  assert.equal(dataset.url.searchParams.get("clean"), "true");
});
