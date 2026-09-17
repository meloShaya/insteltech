import { AUTOMATIONS, CONNECTIONS } from "../../../crm/automation-catalog.mjs";
import { prospeoSearchRequest, prospeoPerson } from "./crm-providers.mjs";

export class ProviderError extends Error {
  constructor(
    message,
    { retryable = false, uncertain = false, retryAfter = 0, status = 0 } = {},
  ) {
    super(message);
    this.name = "ProviderError";
    Object.assign(this, { retryable, uncertain, retryAfter, status });
  }
}
const text = (value, name, max = 500) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ProviderError(
      `Enter a valid ${name} (maximum ${max} characters).`,
    );
  return value.trim();
};
const integer = (value, fallback, min, max) => {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new ProviderError(`Expected a whole number from ${min} to ${max}.`);
  return n;
};
const identifier = (value) => {
  const id = text(String(value ?? ""), "provider identifier", 150);
  if (!/^[a-zA-Z0-9_@.+-]+$/.test(id))
    throw new ProviderError("Invalid provider identifier.");
  return encodeURIComponent(id);
};
const list = (value) =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 100);
const array = (value, max = 100) => {
  if (!Array.isArray(value) || !value.length || value.length > max)
    throw new ProviderError(`Provide between 1 and ${max} records.`);
  return value;
};
export function publicURL(value, linkedin = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError("Enter an absolute HTTPS URL.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  )
    throw new ProviderError(
      "Use a public HTTPS website without credentials or a custom port.",
    );
  if (linkedin && host !== "linkedin.com" && !host.endsWith(".linkedin.com"))
    throw new ProviderError("Enter a linkedin.com URL.");
  url.hash = "";
  return url.href;
}
export function connectionStatus(secrets) {
  return CONNECTIONS.map((c) => ({
    ...c,
    connected: c.secrets.every((key) => Boolean(secrets(key))),
    missing: c.secrets.filter((key) => !secrets(key)),
  }));
}

// Requests are constructed from named operations, never a browser-supplied URL or HTTP method.
export function providerRequest(operationId, input, secrets) {
  const operation = AUTOMATIONS.find((o) => o.id === operationId);
  if (!operation) throw new ProviderError("Unknown automation operation.");
  for (const field of operation.fields)
    if (
      field.type === "checkbox" &&
      input[field.key] !== undefined &&
      typeof input[field.key] !== "boolean"
    )
      throw new ProviderError(`${field.label} must be true or false.`);
  const need = (key) => {
    const value = secrets(key);
    if (!value)
      throw new ProviderError(
        `Connection required: add ${key} in Supabase secrets.`,
      );
    return value;
  };
  let url,
    body,
    method = "GET",
    headers = {};
  const post = (payload) => {
    method = "POST";
    body = payload;
  };
  const pathId = () => identifier(input.campaign_id);
  switch (operation.provider) {
    case "apify": {
      headers.Authorization = `Bearer ${need("APIFY_TOKEN")}`;
      const actor = () => {
        const value = text(input.actor_id, "actor ID", 150);
        if (!/^[a-zA-Z0-9_~.-]+$/.test(value))
          throw new ProviderError("Use an actor ID or owner~actor-name.");
        return encodeURIComponent(value);
      };
      if (operationId === "apify.run") {
        if (
          !input.input ||
          typeof input.input !== "object" ||
          Array.isArray(input.input)
        )
          throw new ProviderError("Provide the actor's input object.");
        url = new URL(`https://api.apify.com/v2/acts/${actor()}/runs`);
        post(input.input);
      } else if (operationId === "apify.actor")
        url = new URL(`https://api.apify.com/v2/acts/${actor()}`);
      else if (operationId === "apify.run_status")
        url = new URL(
          `https://api.apify.com/v2/actor-runs/${identifier(input.run_id)}`,
        );
      else {
        url = new URL(
          `https://api.apify.com/v2/datasets/${identifier(input.dataset_id)}/items`,
        );
        url.searchParams.set("clean", "true");
        url.searchParams.set(
          "offset",
          String(integer(input.offset, 0, 0, 10000000)),
        );
        url.searchParams.set(
          "limit",
          String(integer(input.limit, 100, 1, 1000)),
        );
      }
      break;
    }
    case "dns": {
      const name = text(input.domain, "DNS name", 253);
      if (
        !/^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9_-]+$/.test(name) ||
        !["TXT", "MX", "CNAME", "A"].includes(input.type)
      )
        throw new ProviderError("Choose a valid DNS name and record type.");
      url = new URL("https://cloudflare-dns.com/dns-query");
      url.searchParams.set("name", name);
      url.searchParams.set("type", input.type);
      headers.Accept = "application/dns-json";
      break;
    }
    case "resend":
      url = new URL("https://api.resend.com/domains");
      headers.Authorization = `Bearer ${need("RESEND_API_KEY")}`;
      break;
    case "maps": {
      const host = "maps-data.p.rapidapi.com";
      headers = {
        "X-RapidAPI-Key": need("RAPIDAPI_KEY"),
        "X-RapidAPI-Host": host,
      };
      url = new URL(
        `https://${host}/${operationId === "maps.search" ? "searchmaps.php" : "place.php"}`,
      );
      if (operationId === "maps.search") {
        url.searchParams.set("query", text(input.query, "search query"));
        const country = text(
          input.country || "us",
          "country code",
          2,
        ).toLowerCase();
        if (!/^[a-z]{2}$/.test(country))
          throw new ProviderError("Use a two-letter country code.");
        url.searchParams.set("country", country);
        url.searchParams.set("limit", String(integer(input.limit, 20, 1, 100)));
      } else
        url.searchParams.set(
          "business_id",
          text(input.business_id, "business ID"),
        );
      break;
    }
    case "linkedin": {
      const host =
        secrets("LINKEDIN_RAPIDAPI_HOST") ||
        "linkedin-bulk-data-scraper.p.rapidapi.com";
      if (
        ![
          "linkedin-bulk-data-scraper.p.rapidapi.com",
          "realtime-linkedin-bulk-data.p.rapidapi.com",
        ].includes(host)
      )
        throw new ProviderError("Choose a supported LinkedIn RapidAPI host.");
      headers = {
        "X-RapidAPI-Key": need("RAPIDAPI_KEY"),
        "X-RapidAPI-Host": host,
      };
      const paths = {
        "linkedin.person": "person",
      };
      url = new URL(`https://${host}/${paths[operationId]}`);
      post({ link: publicURL(input.url, true) });
      break;
    }
    case "web": {
      url = new URL(
        `https://api.tavily.com/${operationId === "web.scrape" ? "extract" : "search"}`,
      );
      headers.Authorization = `Bearer ${need("TAVILY_API_KEY")}`;
      post(
        operationId === "web.scrape"
          ? {
              urls: [publicURL(input.url)],
              extract_depth: "advanced",
              format: "text",
            }
          : {
              query: text(input.query, "research query", 2000),
              topic: operationId === "web.news" ? "news" : "general",
              search_depth: "advanced",
              max_results: integer(input.limit, 10, 1, 20),
              include_raw_content: "text",
            },
      );
      break;
    }
    case "disco": {
      url = new URL("https://api.discolike.com/v1/discover");
      headers["x-discolike-key"] = need("DISCOLIKE_API_KEY");
      if (!input.domains && !input.query)
        throw new ProviderError(
          "Provide seed domains or a company description.",
        );
      // https://docs.discolike.com/api/endpoints/discover/
      if (input.domains) {
        const domains = list(input.domains);
        if (!domains.length || domains.length > 10)
          throw new ProviderError("Provide 1 to 10 DiscoLike seed domains.");
        for (const domain of domains) url.searchParams.append("domain", domain);
      }
      if (input.query) {
        const query = text(input.query, "company description", 4000);
        if (query.length < 3) throw new ProviderError("Use at least 3 characters for the company description.");
        url.searchParams.set(
          "icp_text",
          query,
        );
      }
      if (input.country) {
        const country = text(input.country, "country", 2).toUpperCase();
        if (!/^[A-Z]{2}$/.test(country)) throw new ProviderError("Use a two-letter country code.");
        url.searchParams.set("country", country);
      }
      url.searchParams.set("max_records", String(integer(input.limit, 100, 5, 100)));
      url.searchParams.set(
        "offset",
        String(integer(input.offset, 0, 0, 10000)),
      );
      break;
    }
    case "blitz":
      url = new URL("https://api.useblitz.com/api/enrichment/company");
      headers.Authorization = `Bearer ${need("BLITZ_API_KEY")}`;
      post({
        domain: new URL(
          publicURL(`https://${text(input.domain, "company domain")}`),
        ).hostname,
      });
      break;
    case "millionverifier": {
      url = new URL("https://api.millionverifier.com/api/v3/");
      url.searchParams.set("api", need("MILLIONVERIFIER_API_KEY"));
      const email = text(input.email, "email").toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new ProviderError("Enter a valid email address.");
      url.searchParams.set("email", email);
      url.searchParams.set("timeout", "10");
      break;
    }
    case "prospeo":
      url = new URL(
        `https://api.prospeo.io/${operationId !== "prospeo.enrich" ? "search-person" : "enrich-person"}`,
      );
      headers["X-KEY"] = need("PROSPEO_API_KEY");
      if (operationId === "prospeo.advanced_search") {
        if (
          !input.filters ||
          typeof input.filters !== "object" ||
          Array.isArray(input.filters) ||
          !Object.keys(input.filters).length ||
          JSON.stringify(input.filters).length > 50000
        )
          throw new ProviderError(
            "Provide a non-empty Prospeo filter object, at most 50 KB.",
          );
        post({ page: integer(input.page, 1, 1, 1000), filters: input.filters });
      } else
        post(
          operationId === "prospeo.search"
            ? prospeoSearchRequest(input)
            : {
                data: { person_id: text(input.person_id, "person ID", 100) },
                only_verified_email: true,
              },
        );
      break;
    case "smartlead": {
      let path;
      switch (operationId) {
        case "smartlead.accounts":
          path = "/email-accounts";
          break;
        case "smartlead.campaign_accounts":
          path = `/campaigns/${pathId()}/email-accounts`;
          break;
        case "smartlead.get_sequence":
          path = `/campaigns/${pathId()}/sequences`;
          break;
        case "smartlead.spam_test":
          path = "/spam-test/manual";
          post({
            test_name: text(input.name, "test name", 200),
            campaign_id: integer(
              input.campaign_id,
              0,
              1,
              Number.MAX_SAFE_INTEGER,
            ),
            sequence_mapping_id: integer(
              input.sequence_id,
              0,
              1,
              Number.MAX_SAFE_INTEGER,
            ),
            sender_accounts: array(list(input.emails), 100),
            provider_ids: [20, 21],
            spam_filters: ["spam_assassin"],
            link_checker: true,
            all_email_sent_without_time_gap: false,
            min_time_btwn_emails: 1,
            min_time_unit: "minutes",
            is_warmup: true,
          });
          break;
        case "smartlead.test_status":
          path = `/spam-test/${identifier(input.test_id)}`;
          break;
        case "smartlead.test_report": {
          if (
            ![
              "providerwise",
              "groupwise",
              "sender-account-wise",
              "spam-filter-details",
              "dkim-details",
              "spf-details",
              "blacklist",
            ].includes(input.report)
          )
            throw new ProviderError(
              "Choose a supported inbox placement report.",
            );
          path = `/spam-test/report/${identifier(input.test_id)}/${input.report}`;
          break;
        }
        case "smartlead.warmup":
          path = `/email-accounts/${identifier(input.account_id)}/warmup`;
          post(
            input.enabled
              ? {
                  warmup_enabled: "true",
                  total_warmup_per_day: integer(input.daily_limit, 40, 1, 100),
                  daily_rampup: integer(input.ramp, 5, 0, 100),
                  reply_rate_percentage: integer(input.reply_rate, 20, 0, 100),
                }
              : { warmup_enabled: "false" },
          );
          break;
        case "smartlead.tags":
          path = "/email-accounts/tag";
          post({
            email_account_ids: [
              integer(input.account_id, 0, 1, Number.MAX_SAFE_INTEGER),
            ],
            tags: array(input.tags).map((tag) => ({
              ...(tag.id ? { id: tag.id } : {}),
              name: text(tag.name, "tag name", 100),
              color: tag.color || "#64748b",
            })),
          });
          break;
        case "smartlead.signature":
          path = "/email-accounts/save";
          post({
            id: integer(input.account_id, 0, 1, Number.MAX_SAFE_INTEGER),
            signature: text(input.signature, "signature", 10000),
          });
          break;
        case "smartlead.create":
          path = "/campaigns/create";
          post({ name: text(input.name, "campaign name", 200) });
          break;
        case "smartlead.sequence":
          path = `/campaigns/${pathId()}/sequences`;
          post({ sequences: array(input.sequences, 20) });
          break;
        case "smartlead.settings":
          path = `/campaigns/${pathId()}/settings`;
          post({
            track_settings: ["DONT_TRACK_EMAIL_OPEN", "DONT_TRACK_LINK_CLICK"],
            stop_lead_settings:
              input.stop_on_reply !== false ? "REPLY_TO_AN_EMAIL" : "NEVER",
            send_as_plain_text: true,
          });
          break;
        case "smartlead.schedule": {
          path = `/campaigns/${pathId()}/schedule`;
          try {
            new Intl.DateTimeFormat("en", { timeZone: input.timezone });
          } catch {
            throw new ProviderError("Enter a valid IANA time zone.");
          }
          const days = array(list(input.days), 7).map((day) =>
            integer(day, 0, 0, 6),
          );
          if (
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start_hour) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.end_hour) ||
            input.start_hour >= input.end_hour
          )
            throw new ProviderError(
              "Choose a sending window ending after it starts.",
            );
          post({
            timezone: input.timezone,
            days_of_the_week: days,
            start_hour: input.start_hour,
            end_hour: input.end_hour,
            min_time_btw_emails: integer(input.interval_minutes, 5, 1, 1440),
            max_new_leads_per_day: integer(input.daily_limit, 30, 1, 1000),
          });
          break;
        }
        case "smartlead.attach":
          path = `/campaigns/${pathId()}/email-accounts`;
          post({
            email_account_ids: array(list(input.account_ids)).map((id) =>
              integer(id, 0, 1, Number.MAX_SAFE_INTEGER),
            ),
          });
          break;
        case "smartlead.leads":
          path = `/campaigns/${pathId()}/leads`;
          post({ lead_list: validateLeads(input.leads, 100) });
          break;
        case "smartlead.status":
          path = `/campaigns/${pathId()}/status`;
          if (!["START", "PAUSED", "STOPPED"].includes(input.status))
            throw new ProviderError("Choose START, PAUSED or STOPPED.");
          post({ status: input.status });
          break;
        case "smartlead.analytics":
          path = `/campaigns/${pathId()}/analytics`;
          break;
        case "smartlead.replies":
          path = `/campaigns/${pathId()}/leads`;
          break;
        case "smartlead.history":
          path = `/campaigns/${pathId()}/leads/${identifier(input.lead_id)}/message-history`;
          break;
      }
      url = new URL(`https://server.smartlead.ai/api/v1${path}`);
      if (
        operationId === "smartlead.spam_test" ||
        operationId.startsWith("smartlead.test_")
      )
        url.hostname = "smartdelivery.smartlead.ai";
      url.searchParams.set("api_key", need("SMARTLEAD_API_KEY"));
      if (["smartlead.accounts", "smartlead.replies"].includes(operationId)) {
        url.searchParams.set(
          "offset",
          String(integer(input.offset, 0, 0, 1000000)),
        );
        url.searchParams.set("limit", "100");
      }
      break;
    }
    case "instantly": {
      let path;
      headers.Authorization = `Bearer ${need("INSTANTLY_API_KEY")}`;
      switch (operationId) {
        case "instantly.accounts":
          path = "/accounts";
          break;
        case "instantly.warmup":
          path = `/accounts/warmup/${input.enabled ? "enable" : "disable"}`;
          post({ emails: array(list(input.emails)) });
          break;
        case "instantly.create":
        case "instantly.update":
          path =
            operationId === "instantly.create"
              ? "/campaigns"
              : `/campaigns/${pathId()}`;
          if (!input.schedule?.schedules?.length)
            throw new ProviderError(
              "Provide a campaign schedule with at least one sending window.",
            );
          post({
            name: text(input.name, "campaign name", 200),
            sequences: array(input.sequences, 20),
            campaign_schedule: input.schedule,
            daily_limit: integer(input.daily_limit, 30, 1, 1000),
            stop_on_reply: input.stop_on_reply !== false,
            ...(input.emails ? { email_list: array(list(input.emails)) } : {}),
          });
          if (operationId === "instantly.update") method = "PATCH";
          break;
        case "instantly.leads":
          path = "/leads/bulk-create";
          post({
            campaign: text(input.campaign_id, "campaign ID"),
            leads: validateLeads(input.leads, 1000),
          });
          break;
        case "instantly.status":
          if (!["activate", "pause"].includes(input.status))
            throw new ProviderError("Choose activate or pause.");
          path = `/campaigns/${pathId()}/${input.status}`;
          post({});
          break;
        case "instantly.analytics":
          path = "/campaigns/analytics";
          break;
        case "instantly.replies":
          path = "/emails";
          break;
        case "instantly.background_job":
          path = `/background-jobs/${identifier(input.job_id)}`;
          break;
      }
      url = new URL(`https://api.instantly.ai/api/v2${path}`);
      if (operationId === "instantly.analytics")
        url.searchParams.set("id", text(input.campaign_id, "campaign ID"));
      if (operationId === "instantly.replies") {
        url.searchParams.set(
          "campaign_id",
          text(input.campaign_id, "campaign ID"),
        );
        url.searchParams.set("email_type", "received");
      }
      if (["instantly.accounts", "instantly.replies"].includes(operationId)) {
        url.searchParams.set("limit", "100");
        if (input.starting_after)
          url.searchParams.set(
            "starting_after",
            text(input.starting_after, "cursor"),
          );
      }
      break;
    }
    case "clay": {
      url = new URL(publicURL(need("CLAY_WEBHOOK_URL")));
      if (
        url.hostname !== "api.clay.com" &&
        !url.hostname.endsWith(".clay.com")
      )
        throw new ProviderError(
          "CLAY_WEBHOOK_URL must be a Clay HTTPS webhook.",
        );
      post({ rows: array(input.rows, 100), source: "instel-crm" });
      break;
    }
  }
  return {
    url,
    init: {
      method,
      headers: {
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    operation,
  };
}
function validateLeads(leads, max) {
  return array(leads, max).map((lead) => {
    if (!lead || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || ""))
      throw new ProviderError("Every lead must have a valid email address.");
    if (lead.suppressed)
      throw new ProviderError("Suppressed contacts cannot be uploaded.");
    return lead;
  });
}
export async function executeProvider(
  operationId,
  input,
  { secrets, fetcher = fetch, timeoutMs = 20000 } = {},
) {
  if (operationId.startsWith("getleads."))
    return await executeGetLeads(operationId, input, { secrets, fetcher });
  const request = providerRequest(operationId, input, secrets);
  let response;
  try {
    response = await fetcher(request.url.href, {
      ...request.init,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
  } catch {
    throw new ProviderError(
      `${request.operation.provider} connection interrupted. ${request.operation.write ? "The write may have been accepted; reconcile before retrying." : "The request can be retried."}`,
      {
        retryable: !request.operation.write,
        uncertain: request.operation.write,
      },
    );
  }
  if (!response.ok) {
    const transient = response.status === 429 || response.status >= 500;
    const uncertain = request.operation.write && response.status >= 500;
    const retryHeader = response.headers.get("retry-after");
    const seconds =
      Number(retryHeader) ||
      Math.max(0, (Date.parse(retryHeader || "") - Date.now()) / 1000) ||
      0;
    let guidance = response.status === 401 || response.status === 403
      ? "Check the API key and provider subscription."
      : uncertain ? "Reconcile this write in the provider before retrying."
      : "Review the operation inputs and connection.";
    // Classify known provider errors; never echo arbitrary upstream bodies,
    // which can contain credentials or submitted contact data.
    if (response.status === 403 && request.operation.provider === "maps") {
      try {
        const body = await response.json();
        if (typeof body?.message === "string" && /not subscribed/i.test(body.message))
          guidance = "The RapidAPI application for RAPIDAPI_KEY needs an active Maps Data subscription (maps-data.p.rapidapi.com). A subscription to another RapidAPI API does not enable Maps Data.";
      } catch { /* Keep the generic guidance for non-JSON errors. */ }
    }
    throw new ProviderError(
      `${request.operation.provider} returned HTTP ${response.status}. ${guidance}`,
      {
        status: response.status,
        retryable: transient && !uncertain,
        uncertain,
        retryAfter: Math.min(86400, seconds),
      },
    );
  }
  let data;
  try {
    data = response.status === 204 ? { ok: true } : await response.json();
  } catch {
    throw new ProviderError("Provider returned an unreadable result.", {
      uncertain: request.operation.write,
      retryable: !request.operation.write,
    });
  }
  if (
    data?.error ||
    data?.success === false ||
    data?.status === "error" ||
    data?.status === false
  )
    throw new ProviderError(
      `${request.operation.provider} reported an unsuccessful operation. Check the provider account and request inputs.`,
      { uncertain: request.operation.write },
    );
  if (operationId.endsWith(".create") && !data?.id && !data?.campaign_id)
    throw new ProviderError(
      "The provider accepted creation but returned no object ID. Reconcile the created object before proceeding.",
      { uncertain: true },
    );
  let records = Array.isArray(data)
    ? data
    : data.results || data.data || data.items || [data];
  if (!Array.isArray(records)) records = [records];
  if (["prospeo.search", "prospeo.advanced_search"].includes(operationId))
    records = records.map(prospeoPerson);
  if (operationId === "prospeo.enrich") records = [prospeoPerson(data)];
  if (operationId === "blitz.company")
    records = (data.employees || []).map((person) => ({
      first_name: person.first_name || "",
      last_name: person.last_name || "",
      email: person.email || "",
      title: person.title || "",
      company: data.company?.name || "",
      website: `https://${input.domain}`,
      linkedin_url: person.linkedin_url || "",
    }));
  if (operationId === "dns.lookup") records = data.Answer || [];
  return {
    operation: operationId,
    records,
    data,
    resource_id: data?.id || data?.campaign_id || data?.data?.id || null,
    fetched_at: new Date().toISOString(),
    source: request.operation.provider,
    warnings: data?.failed_results || [],
  };
}

async function executeGetLeads(operationId, input, { secrets, fetcher }) {
  const key = secrets("GETLEADS_API_KEY");
  if (!key)
    throw new ProviderError(
      "Connection required: add GETLEADS_API_KEY in Supabase secrets.",
    );
  let session;
  const rpc = async (payload, write = false) => {
    let response;
    try {
      response = await fetcher("https://app.getleads.io/api/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2024-11-05",
          ...(session ? { "mcp-session-id": session } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
    } catch {
      throw new ProviderError("GetLeads connection interrupted.", {
        uncertain: write,
        retryable: !write,
      });
    }
    if (!response.ok)
      throw new ProviderError(`GetLeads returned HTTP ${response.status}.`, {
        uncertain: write && response.status >= 500,
        retryable:
          response.status === 429 || (!write && response.status >= 500),
        status: response.status,
      });
    session = response.headers.get("mcp-session-id") || session;
    const raw = await response.text();
    if (!raw.trim()) return {};
    let data;
    try {
      const lines = raw
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter((line) => line && line !== "[DONE]");
      data = JSON.parse(lines.length ? lines.at(-1) : raw);
    } catch {
      throw new ProviderError("Unreadable GetLeads response.", {
        uncertain: write,
        retryable: !write,
      });
    }
    if (data.error || data.result?.isError)
      throw new ProviderError(
        "GetLeads rejected the tool request. Inspect the current tool schema and account credits.",
        { uncertain: write },
      );
    return data.result || data;
  };
  await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "instel-crm", version: "1.0.0" },
    },
  });
  await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  let data;
  if (operationId === "getleads.tools")
    data = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
  else {
    if (
      typeof input.tool !== "string" ||
      !/^[a-zA-Z0-9_.-]{1,150}$/.test(input.tool) ||
      !input.arguments ||
      typeof input.arguments !== "object" ||
      Array.isArray(input.arguments)
    )
      throw new ProviderError("Choose a GetLeads tool and its input object.");
    data = await rpc(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: input.tool, arguments: input.arguments },
      },
      true,
    );
    if (data.content?.[0]?.text) {
      try {
        data = JSON.parse(data.content[0].text);
      } catch {
        data = { text: data.content[0].text };
      }
    }
    if (data.ok === false || data.error)
      throw new ProviderError(
        "GetLeads could not complete the operation. Check the tool input and account.",
      );
  }
  const records =
    data.tools || (Array.isArray(data) ? data : data.results || [data]);
  return {
    operation: operationId,
    records,
    data,
    resource_id: data.id || data.export_id || null,
    source: "getleads",
    fetched_at: new Date().toISOString(),
  };
}
