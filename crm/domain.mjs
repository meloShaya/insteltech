export const STAGES = [
  "new",
  "qualified",
  "contacted",
  "meeting",
  "proposal",
  "won",
  "lost",
];
export const LABELS = {
  new: "New lead",
  qualified: "Qualified",
  contacted: "Contacted",
  meeting: "Meeting",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};
export const escapeHTML = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const emailValid = (value) =>
  /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(value));
export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) quoted = false;
      else if (!field) quoted = true;
      else throw new Error("Unexpected quote in CSV. Quote the entire field.");
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  );
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV has duplicate column names.");
  if (!headers.includes("email"))
    throw new Error(
      "CSV needs an email column. Supported columns: email, first_name, last_name, company, title, website, source.",
    );
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(
        `Row ${i + 2} has ${values.length} fields; expected ${headers.length}.`,
      );
    return Object.fromEntries(headers.map((h, j) => [h, values[j].trim()]));
  });
}
export function prepareContacts(rows, existing = []) {
  const seen = new Set(existing.map((c) => c.email.toLowerCase()));
  const contacts = [],
    errors = [];
  let duplicates = 0;
  rows.forEach((row, i) => {
    const email = String(row.email || "")
      .trim()
      .toLowerCase();
    if (!emailValid(email)) {
      errors.push(`Row ${i + 2}: invalid email`);
      return;
    }
    if (seen.has(email)) {
      duplicates++;
      return;
    }
    seen.add(email);
    // Imports never grant permission to send, even if the CSV claims consent.
    contacts.push({
      email,
      first_name: (row.first_name || "").slice(0, 120),
      last_name: (row.last_name || "").slice(0, 120),
      company: (row.company || "").slice(0, 200),
      title: (row.title || "").slice(0, 200),
      website: (row.website || "").slice(0, 500),
      source: (row.source || "CSV import").slice(0, 200),
      stage: "new",
      consent: false,
      consent_note: "",
    });
  });
  return { contacts, errors, duplicates };
}
export function toCSV(rows, columns) {
  const quote = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    columns.map(quote).join(","),
    ...rows.map((row) => columns.map((key) => quote(row[key])).join(",")),
  ].join("\r\n");
}
export function scoreList(contacts) {
  const n = contacts.length;
  const pct = (fn) =>
    n ? Math.round((100 * contacts.filter(fn).length) / n) : 0;
  const dimensions = [
    ["Valid email format", pct((c) => emailValid(c.email))],
    [
      "Unique addresses",
      n
        ? Math.round(
            (new Set(contacts.map((c) => c.email?.toLowerCase())).size / n) *
              100,
          )
        : 0,
    ],
    ["Named contacts", pct((c) => c.first_name && c.last_name)],
    ["Company coverage", pct((c) => c.company)],
    ["Job title coverage", pct((c) => c.title)],
    ["Website coverage", pct((c) => c.website)],
    ["Source recorded", pct((c) => c.source)],
    ["Permission recorded", pct((c) => c.consent && c.consent_note)],
  ];
  return {
    score: n
      ? Math.round(dimensions.reduce((s, d) => s + d[1], 0) / dimensions.length)
      : 0,
    dimensions,
  };
}
export function checkCopy(subject, body) {
  const combined = `${subject} ${body}`;
  const phrases = [
    "act now",
    "guaranteed",
    "risk free",
    "free money",
    "limited time",
    "100% free",
    "no obligation",
    "buy now",
  ];
  return [
    ...phrases
      .filter((p) => combined.toLowerCase().includes(p))
      .map((p) => `Review “${p}”: promotional language.`),
    ...(body.split(/\s+/).filter(Boolean).length > 150
      ? ["Body exceeds 150 words. Consider a shorter message."]
      : []),
    ...((combined.match(/https?:\/\//g) || []).length > 2
      ? ["More than two links can distract from your call to action."]
      : []),
    ...(/!{2,}/.test(combined) ? ["Remove repeated exclamation marks."] : []),
    ...(!subject.trim() ? ["Add a subject line."] : []),
    ...(!body.trim() ? ["Add a message."] : []),
  ];
}
export function renderTemplate(template, contact) {
  const fields = ["first_name", "last_name", "company", "title", "email"];
  const result = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (!fields.includes(key)) throw new Error(`Unknown merge field: ${key}`);
    if (!contact[key]) throw new Error(`Missing ${key} for ${contact.email}`);
    return contact[key];
  });
  const expanded = expandSpintax(
    result,
    contact.email || contact.first_name || "instel",
  );
  if (/\{\{|\}\}/.test(expanded)) throw new Error("Unresolved merge field.");
  return expanded;
}
export function expandSpintax(template, seed = "instel") {
  let n = [...seed].reduce(
      (h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0,
      2166136261,
    ),
    text = template;
  for (let depth = 0; depth < 10; depth++) {
    let changed = false;
    text = text.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, choices) => {
      changed = true;
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      const options = choices.split("|");
      return options[n % options.length];
    });
    if (!changed) break;
  }
  if (/\{[^}]*\|/.test(text))
    throw new Error("Spintax is malformed or nested too deeply.");
  return text;
}
export function campaignMetrics(recipients) {
  const sent = recipients.filter((r) => r.status === "sent").length;
  const positive = recipients.filter(
    (r) => r.reply_sentiment === "positive",
  ).length;
  const replied = recipients.filter(
    (r) => r.reply_sentiment && r.reply_sentiment !== "none",
  ).length;
  return {
    sent,
    positive,
    replied,
    positiveRate: sent ? (positive / sent) * 100 : 0,
    replyRate: sent ? (replied / sent) * 100 : 0,
  };
}
