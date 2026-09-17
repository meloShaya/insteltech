// Public operation metadata only. Provider credentials never belong in this module.
const field = (key, label, type = "text", required = true, value = "") => ({
  key,
  label,
  type,
  required,
  value,
});
const operation = (id, title, provider, fields, write = false) => ({
  id,
  title,
  provider,
  fields,
  write,
});
export const AUTOMATIONS = [
  operation(
    "prospeo.advanced_search",
    "Search with full Prospeo filters",
    "prospeo",
    [
      field("filters", "Prospeo filter object (JSON)", "json", true, "{}"),
      field("page", "Page", "number", true, 1),
    ],
  ),
  operation("crm.sync_campaign", "Sync provider campaign analytics", "crm", [
    field("campaign_id", "CRM campaign ID"),
  ]),
  operation(
    "crm.queue_workflow",
    "Schedule a Codex workflow",
    "crm",
    [
      field("workflow_id", "Workflow"),
      field("brief", "Workflow objective", "textarea"),
      field(
        "allow_provider_writes",
        "Allow provider changes described in this objective",
        "checkbox",
        false,
        false,
      ),
    ],
    true,
  ),
  operation(
    "getleads.tools",
    "Inspect GetLeads search and export tools",
    "getleads",
    [],
  ),
  operation(
    "getleads.call",
    "Run a GetLeads search or export",
    "getleads",
    [
      field("tool", "Tool name from GetLeads"),
      field("arguments", "Tool arguments (JSON)", "json", true, "{}"),
    ],
    true,
  ),
  operation(
    "smartlead.campaign_accounts",
    "List campaign sender accounts",
    "smartlead",
    [field("campaign_id", "Campaign ID")],
  ),
  operation(
    "smartlead.get_sequence",
    "Read campaign sequence IDs",
    "smartlead",
    [field("campaign_id", "Campaign ID")],
  ),
  operation(
    "smartlead.spam_test",
    "Start an inbox placement test",
    "smartlead",
    [
      field("name", "Test name"),
      field("campaign_id", "Campaign ID"),
      field("sequence_id", "Sequence mapping ID"),
      field("emails", "Sender emails (comma separated)"),
    ],
    true,
  ),
  operation(
    "smartlead.test_status",
    "Check inbox placement test",
    "smartlead",
    [field("test_id", "Test ID")],
  ),
  operation(
    "smartlead.test_report",
    "Read inbox placement report",
    "smartlead",
    [
      field("test_id", "Test ID"),
      field(
        "report",
        "Report: providerwise, groupwise, sender-account-wise, spam-filter-details, dkim-details, spf-details, blacklist",
        "text",
        true,
        "providerwise",
      ),
    ],
  ),
  operation(
    "apify.run",
    "Start a scraping actor",
    "apify",
    [
      field("actor_id", "Apify actor ID or owner~name"),
      field("input", "Actor input (JSON)", "json", true, "{}"),
    ],
    true,
  ),
  operation("apify.run_status", "Check scraping progress", "apify", [
    field("run_id", "Apify run ID"),
  ]),
  operation("apify.dataset", "Fetch scraping results", "apify", [
    field("dataset_id", "Apify dataset ID"),
    field("offset", "Offset", "number", true, 0),
    field("limit", "Result limit", "number", true, 100),
  ]),
  operation("apify.actor", "Inspect a scraping actor", "apify", [
    field("actor_id", "Apify actor ID or owner~name"),
  ]),
  operation(
    "crm.import_contacts",
    "Import researched contacts into CRM",
    "crm",
    [field("contacts", "Contact records (JSON; email, first_name, last_name, company, title, website, source, notes, raw_json)", "json", true, "[]")],
    true,
  ),
  operation(
    "crm.draft_campaign",
    "Save a campaign draft in CRM",
    "crm",
    [
      field("name", "Campaign name"),
      field("subject", "Subject"),
      field("body", "Email body", "textarea"),
    ],
    true,
  ),
  operation(
    "crm.add_task",
    "Create a CRM follow-up task",
    "crm",
    [field("title", "Task (maximum 500 characters)"), field("due_at", "Due date (YYYY-MM-DD; defaults to today)", "date", false)],
    true,
  ),
  operation("dns.lookup", "Check domain authentication records", "dns", [
    field("domain", "DNS name (domain, DKIM selector, or _dmarc name)"),
    field("type", "Record type: TXT, MX, CNAME or A", "text", true, "TXT"),
  ]),
  operation("resend.domains", "Check existing Resend domains", "resend", []),
  operation("market.expand", "Expand a market across providers", "market", [
    field("query", "Target businesses and location"),
    field(
      "domains",
      "Seed domains for DiscoLike (comma separated)",
      "text",
      false,
    ),
    field(
      "titles",
      "Target job titles (comma separated)",
      "text",
      true,
      "founder, owner, CEO",
    ),
    field("country", "Country code", "text", true, "zw"),
    field(
      "sources",
      "Discovery sources: maps, disco (comma separated)",
      "text",
      true,
      "maps,disco",
    ),
    field("limit", "Maximum companies", "number", true, 20),
    field("research", "Research each company website", "checkbox", false, true),
    field("verify", "Verify discovered emails", "checkbox", false, true),
  ]),
  operation("maps.search", "Search Google Maps", "maps", [
    field("query", "Business type and location"),
    field("country", "Country code", "text", true, "zw"),
    field("limit", "Maximum results", "number", true, 20),
  ]),
  operation("linkedin.person", "Research a LinkedIn profile", "linkedin", [
    field("url", "LinkedIn profile URL", "url"),
  ]),
  operation("web.search", "Search the internet", "web", [
    field("query", "Research question"),
    field("limit", "Maximum results", "number", true, 10),
  ]),
  operation("web.news", "Find company news", "web", [
    field("query", "Company or topic"),
    field("limit", "Maximum results", "number", true, 10),
  ]),
  operation("web.scrape", "Research a website", "web", [
    field("url", "Website URL", "url"),
  ]),
  operation("disco.discover", "Find similar companies", "disco", [
    field("domains", "Seed domains (comma separated)", "text", false),
    field("query", "Describe your target companies", "text", false),
    field("country", "Country code", "text", false),
    field("limit", "Results per page (5–100)", "number", true, 100),
    field("offset", "Offset", "number", true, 0),
  ]),
  operation("blitz.company", "Find contacts at a company", "blitz", [
    field("domain", "Company domain"),
  ]),
  operation(
    "millionverifier.verify",
    "Verify an email address",
    "millionverifier",
    [field("email", "Email address", "email")],
  ),
  operation("prospeo.search", "Search people", "prospeo", [
    field("titles", "Job titles (comma separated)"),
    field("location", "Location", "text", false),
    field("industries", "Industries (comma separated)", "text", false),
    field("page", "Page", "number", true, 1),
  ]),
  operation("prospeo.enrich", "Reveal a verified email", "prospeo", [
    field("person_id", "Prospeo person ID"),
  ]),
  operation("smartlead.accounts", "Sender health and accounts", "smartlead", [
    field("offset", "Offset", "number", true, 0),
  ]),
  operation(
    "smartlead.warmup",
    "Configure sender warmup",
    "smartlead",
    [
      field("account_id", "Sender account ID"),
      field("enabled", "Enable warmup", "checkbox", false, true),
      field("daily_limit", "Warmup emails per day", "number", true, 40),
      field("ramp", "Daily ramp", "number", true, 5),
      field("reply_rate", "Reply percentage", "number", true, 20),
    ],
    true,
  ),
  operation(
    "smartlead.tags",
    "Set sender tags / insurance",
    "smartlead",
    [
      field("account_id", "Sender account ID"),
      field(
        "tags",
        "Complete tags list (JSON)",
        "json",
        true,
        '[{"name":"insurance","color":"#64748b"}]',
      ),
    ],
    true,
  ),
  operation(
    "smartlead.signature",
    "Update sender signature",
    "smartlead",
    [
      field("account_id", "Sender account ID"),
      field("signature", "Signature", "textarea"),
    ],
    true,
  ),
  operation(
    "smartlead.create",
    "Create a Smartlead campaign",
    "smartlead",
    [field("name", "Campaign name")],
    true,
  ),
  operation(
    "smartlead.sequence",
    "Upload campaign sequence",
    "smartlead",
    [
      field("campaign_id", "Campaign ID"),
      field("sequences", "Smartlead sequences (JSON)", "json", true, "[]"),
    ],
    true,
  ),
  operation(
    "smartlead.settings",
    "Configure reply stopping and tracking",
    "smartlead",
    [
      field("campaign_id", "Campaign ID"),
      field("stop_on_reply", "Stop on reply", "checkbox", false, true),
    ],
    true,
  ),
  operation(
    "smartlead.schedule",
    "Set campaign sending windows",
    "smartlead",
    [
      field("campaign_id", "Campaign ID"),
      field("timezone", "Time zone", "text", true, "Africa/Harare"),
      field(
        "days",
        "Weekdays, 0 = Sunday (comma separated)",
        "text",
        true,
        "1,2,3,4,5",
      ),
      field("start_hour", "Start", "time", true, "09:00"),
      field("end_hour", "End", "time", true, "17:00"),
      field("daily_limit", "New leads per day", "number", true, 30),
      field("interval_minutes", "Minutes between emails", "number", true, 5),
    ],
    true,
  ),
  operation(
    "smartlead.attach",
    "Attach campaign senders",
    "smartlead",
    [
      field("campaign_id", "Campaign ID"),
      field("account_ids", "Sender IDs (comma separated)"),
    ],
    true,
  ),
  operation(
    "smartlead.leads",
    "Upload campaign leads",
    "smartlead",
    [
      field("campaign_id", "Campaign ID"),
      field("leads", "Lead records (JSON)", "json", true, "[]"),
    ],
    true,
  ),
  operation(
    "smartlead.status",
    "Activate or pause campaign",
    "smartlead",
    [
      field("campaign_id", "Campaign ID"),
      field("status", "Status: START or PAUSED", "text", true, "PAUSED"),
    ],
    true,
  ),
  operation("smartlead.analytics", "Sync campaign analytics", "smartlead", [
    field("campaign_id", "Campaign ID"),
  ]),
  operation("smartlead.replies", "Fetch campaign replies", "smartlead", [
    field("campaign_id", "Campaign ID"),
    field("offset", "Offset", "number", true, 0),
  ]),
  operation("smartlead.history", "Read a lead's message history", "smartlead", [
    field("campaign_id", "Campaign ID"),
    field("lead_id", "Smartlead lead ID"),
  ]),
  operation("instantly.accounts", "List Instantly senders", "instantly", [
    field("starting_after", "Next-page cursor", "text", false),
  ]),
  operation(
    "instantly.warmup",
    "Configure Instantly warmup",
    "instantly",
    [
      field("emails", "Sender emails (comma separated)"),
      field("enabled", "Enable warmup", "checkbox", false, true),
    ],
    true,
  ),
  operation(
    "instantly.create",
    "Create an Instantly campaign",
    "instantly",
    [
      field("name", "Campaign name"),
      field("sequences", "Instantly sequences (JSON)", "json", true, "[]"),
      field("schedule", "Campaign schedule (JSON)", "json", true, "{}"),
    ],
    true,
  ),
  operation(
    "instantly.update",
    "Update Instantly sequence and schedule",
    "instantly",
    [
      field("campaign_id", "Campaign ID"),
      field("name", "Campaign name"),
      field("sequences", "Instantly sequences (JSON)", "json", true, "[]"),
      field("schedule", "Campaign schedule (JSON)", "json", true, "{}"),
    ],
    true,
  ),
  operation(
    "instantly.leads",
    "Upload Instantly leads",
    "instantly",
    [
      field("campaign_id", "Campaign ID"),
      field("leads", "Lead records (JSON)", "json", true, "[]"),
    ],
    true,
  ),
  operation(
    "instantly.status",
    "Activate or pause Instantly",
    "instantly",
    [
      field("campaign_id", "Campaign ID"),
      field("status", "Status: activate or pause", "text", true, "pause"),
    ],
    true,
  ),
  operation("instantly.analytics", "Sync Instantly analytics", "instantly", [
    field("campaign_id", "Campaign ID"),
  ]),
  operation("instantly.replies", "Fetch Instantly replies", "instantly", [
    field("campaign_id", "Campaign ID"),
    field("starting_after", "Next-page cursor", "text", false),
  ]),
  operation(
    "instantly.background_job",
    "Check a provider background job",
    "instantly",
    [field("job_id", "Background job ID")],
  ),
  operation(
    "clay.webhook",
    "Run a Clay table workflow",
    "clay",
    [field("rows", "Input rows (JSON)", "json", true, "[]")],
    true,
  ),
];
export const CONNECTIONS = [
  {
    id: "getleads",
    name: "GetLeads · search and exports",
    secrets: ["GETLEADS_API_KEY"],
  },
  {
    id: "apify",
    name: "Apify · LinkedIn, directories and signal scrapers",
    secrets: ["APIFY_TOKEN"],
  },
  {
    id: "resend",
    name: "Resend · existing mailbox",
    secrets: ["RESEND_API_KEY"],
  },
  { id: "maps", name: "Google Maps · RapidAPI", secrets: ["RAPIDAPI_KEY"] },
  { id: "linkedin", name: "LinkedIn · RapidAPI", secrets: ["RAPIDAPI_KEY"] },
  {
    id: "web",
    name: "Internet research · Tavily",
    secrets: ["TAVILY_API_KEY"],
  },
  { id: "prospeo", name: "Prospeo", secrets: ["PROSPEO_API_KEY"] },
  { id: "disco", name: "DiscoLike", secrets: ["DISCOLIKE_API_KEY"] },
  { id: "blitz", name: "Blitz", secrets: ["BLITZ_API_KEY"] },
  {
    id: "millionverifier",
    name: "MillionVerifier",
    secrets: ["MILLIONVERIFIER_API_KEY"],
  },
  { id: "smartlead", name: "Smartlead", secrets: ["SMARTLEAD_API_KEY"] },
  { id: "instantly", name: "Instantly", secrets: ["INSTANTLY_API_KEY"] },
  { id: "clay", name: "Clay", secrets: ["CLAY_WEBHOOK_URL"] },
];
