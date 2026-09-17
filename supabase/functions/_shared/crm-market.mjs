// One paid request per checkpoint. Long expansions survive edge-runtime limits and restarts.
const split = (value) =>
  String(value || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
const domainOf = (value) => {
  try {
    const url = new URL(
      String(value).startsWith("http") ? value : `https://${value}`,
    );
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
export async function advanceMarket(input, previous, execute) {
  const limit = Number(input.limit || 20),
    sources = split(input.sources || "maps,disco");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Choose 1 to 100 companies per expansion.");
  if (!sources.length || sources.some((s) => !["maps", "disco"].includes(s)))
    throw new Error("Choose maps, disco, or both discovery sources.");
  if (!String(input.query || "").trim())
    throw new Error("Describe the market to expand.");
  const state = structuredClone(
    previous || {
      phase: "discover",
      source_index: 0,
      company_index: 0,
      email_index: 0,
      companies: [],
      contacts: [],
      calls: 0,
    },
  );
  const callsBefore = state.calls;
  const call = async (operation, args) => {
    const result = await execute(operation, args);
    state.calls++;
    return result;
  };
  if (state.phase === "discover") {
    const source = sources[state.source_index];
    const result = await call(
      source === "maps" ? "maps.search" : "disco.discover",
      source === "maps"
        ? { query: input.query, country: input.country || "us", limit }
        : {
            query: input.query,
            domains: input.domains,
            country: input.country,
            limit: Math.max(5, limit),
          },
    );
    for (const row of result.records) {
      const domain = domainOf(
        row.domain || row.website || row.website_url || row.site || "",
      );
      if (!domain || state.companies.some((c) => c.domain === domain)) continue;
      state.companies.push({
        domain,
        company: row.name || row.company_name || row.title || domain,
        website: `https://${domain}`,
        source,
        source_id: row.business_id || row.place_id || domain,
      });
    }
    state.source_index++;
    if (state.source_index >= sources.length) {
      state.companies = state.companies.slice(0, limit);
      state.phase = "enrich";
    }
  } else if (
    state.phase === "enrich" &&
    state.company_index < state.companies.length
  ) {
    const company = state.companies[state.company_index];
    const result = await call("blitz.company", { domain: company.domain });
    const titles = split(input.titles);
    for (const employee of result.data.employees || []) {
      if (
        titles.length &&
        !titles.some((title) =>
          String(employee.title || "")
            .toLowerCase()
            .includes(title),
        )
      )
        continue;
      const email = String(employee.email || "")
        .trim()
        .toLowerCase();
      if (!email || state.contacts.some((c) => c.email === email)) continue;
      if (state.contacts.length >= 500) break;
      state.contacts.push({
        email,
        first_name: employee.first_name || "",
        last_name: employee.last_name || "",
        title: employee.title || "",
        company: result.data.company?.name || company.company,
        website: company.website,
        linkedin_url: employee.linkedin_url || "",
        source: `${company.source} → blitz`,
        verification: "not_checked",
        consent: false,
        consent_note: "",
      });
    }
    state.phase = input.research ? "research" : "enrich";
    if (!input.research) state.company_index++;
  } else if (state.phase === "research") {
    const company = state.companies[state.company_index];
    const result = await call("web.scrape", { url: company.website });
    company.research = result.records.map((r) => ({
      url: r.url,
      content: String(r.raw_content || r.content || "").slice(0, 10000),
    }));
    if (result.warnings?.length) company.research_errors = result.warnings;
    state.company_index++;
    state.phase = "enrich";
  }
  if (state.phase === "enrich" && state.company_index >= state.companies.length)
    state.phase = input.verify ? "verify" : "done";
  if (state.phase === "verify" && state.calls === callsBefore) {
    if (state.email_index < state.contacts.length) {
      const contact = state.contacts[state.email_index];
      const result = await call("millionverifier.verify", {
        email: contact.email,
      });
      contact.verification =
        Number(result.data.resultcode) === 1
          ? "verified"
          : String(result.data.result || "unverified");
      contact.verification_result = result.data;
      state.email_index++;
    }
    if (state.email_index >= state.contacts.length) state.phase = "done";
  }
  return {
    done: state.phase === "done",
    checkpoint: state,
    output: {
      operation: "market.expand",
      source: "multi-provider expansion",
      fetched_at: new Date().toISOString(),
      records: state.contacts,
      data: {
        companies: state.companies,
        phase: state.phase,
        provider_calls: state.calls,
        company_count: state.companies.length,
        contact_count: state.contacts.length,
        verified_count: state.contacts.filter(
          (c) => c.verification === "verified",
        ).length,
      },
    },
  };
}
