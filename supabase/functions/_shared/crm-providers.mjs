// Prospeo's current search API returns unrevealed email objects; enrichment is a separate credit action.
// Contracts: https://prospeo.io/api-docs/search-person and /api-docs/enrich-person
export function prospeoSearchRequest(input) {
  const list = (value) =>
    String(value || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 10);
  const titles = list(input.titles),
    locations = String(input.location || "").trim()
      ? [String(input.location).trim()]
      : [],
    industries = list(input.industry || input.industries);
  if (!titles.length && !locations.length && !industries.length)
    throw new Error(
      "Add a job title, location, or industry to focus your search.",
    );
  const page = Number(input.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000)
    throw new Error("Page must be between 1 and 1,000.");
  const filters = {
    ...(titles.length ? { person_job_title: { include: titles } } : {}),
    ...(locations.length
      ? { person_location_search: { include: locations } }
      : {}),
    ...(industries.length ? { company_industry: { include: industries } } : {}),
    person_contact_details: { email: ["VERIFIED"] },
  };
  return { page, filters };
}
export function prospeoPerson(record) {
  const person = record.person || {},
    company = record.company || {};
  const email =
    typeof person.email === "object" && person.email?.revealed
      ? person.email.email
      : "";
  return {
    person_id: person.person_id || "",
    first_name: person.first_name || "",
    last_name: person.last_name || "",
    title: person.current_job_title || "",
    company: company.name || "",
    website: company.domain ? `https://${company.domain}` : "",
    email: email || "",
    source: "Prospeo",
    email_status: person.email?.status || "UNREVEALED",
  };
}
export async function callProspeo(path, payload, apiKey, fetcher = fetch) {
  if (!apiKey)
    throw new Error(
      "Prospeo is not connected. Add PROSPEO_API_KEY to Supabase secrets.",
    );
  if (!["search-person", "enrich-person"].includes(path))
    throw new Error("Provider operation is not allowed.");
  const response = await fetcher(`https://api.prospeo.io/${path}`, {
    method: "POST",
    headers: { "X-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(
      `Prospeo could not complete this request (${response.status}). ${String(data.message || data.error_code || "Check your key, filters, and credit balance.").slice(0, 300)}`,
    );
  return data;
}
