import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  prepareContacts,
  toCSV,
  renderTemplate,
  scoreList,
  campaignMetrics,
  escapeHTML,
  checkCopy,
  expandSpintax,
} from "../crm/domain.mjs";

test("CSV import preserves quoted commas, multiline fields, escaped quotes, and BOM", () => {
  assert.deepEqual(
    parseCSV(
      '\uFEFFemail,company,source\r\nhello@example.com,"A, B","Met at\n\"\"Build\"\""\r\n',
    ),
    [
      {
        email: "hello@example.com",
        company: "A, B",
        source: 'Met at\n"Build"',
      },
    ],
  );
});
test("CSV refuses malformed rows, duplicate headers, and missing email columns", () => {
  for (const text of [
    "company,name\na,b",
    "email,email\na,b",
    "email,company\na",
    'email\n"unclosed',
  ])
    assert.throws(() => parseCSV(text));
});
test("imports normalize and deduplicate addresses without accepting consent from a file", () => {
  const result = prepareContacts(
    [
      { email: " HELLO@EXAMPLE.COM ", consent: true },
      { email: "hello@example.com" },
      { email: "invalid" },
      { email: "old@example.com" },
    ],
    [{ email: "OLD@example.com" }],
  );
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].email, "hello@example.com");
  assert.equal(result.contacts[0].consent, false);
  assert.equal(result.duplicates, 2);
  assert.equal(result.errors.length, 1);
});
test("CSV export neutralizes spreadsheet formulas and quotes embedded punctuation", () => {
  const csv = toCSV(
    [{ email: "a@example.com", company: '=HYPERLINK("x")' }],
    ["email", "company"],
  );
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});
test("contact imports retain research notes and structured provenance without granting consent", () => {
  const raw_json = { source_url: "https://example.com/team", qualification: { size: "unknown" } };
  const result = prepareContacts([{ email: "research@example.com", notes: "Size unconfirmed", raw_json, consent: true }]);
  assert.equal(result.contacts[0].notes, "Size unconfirmed");
  assert.deepEqual(result.contacts[0].raw_json, raw_json);
  assert.equal(result.contacts[0].consent, false);
  const csv = prepareContacts([{ email: "csv@example.com", raw_json: JSON.stringify(raw_json) }]);
  assert.deepEqual(csv.contacts[0].raw_json, raw_json);
  const invalid = prepareContacts([{ email: "bad@example.com", raw_json: "not JSON" }]);
  assert.equal(invalid.contacts.length, 0);
  assert.match(invalid.errors[0], /raw_json/);
});
test("personalization refuses missing or unknown fields instead of sending broken copy", () => {
  assert.equal(
    renderTemplate("Hi {{ first_name }}, {{company}}", {
      first_name: "Ada",
      company: "Acme",
    }),
    "Hi Ada, Acme",
  );
  assert.throws(
    () => renderTemplate("{{company}}", { email: "a@example.com" }),
    /Missing/,
  );
  assert.throws(() => renderTemplate("{{password}}", {}), /Unknown/);
  assert.throws(() => renderTemplate("{{bad-token}}", {}), /Unresolved/);
});
test("spintax supports nested variations and produces stable copy for a recipient", () => {
  const template =
    "{Hi|{Hello|Hey}} {{first_name}}, {how are you|good to meet you}?";
  const person = { first_name: "Ada", email: "ada@example.com" };
  const first = renderTemplate(template, person);
  assert.equal(first, renderTemplate(template, person));
  assert.doesNotMatch(first, /[{}|]/);
  assert.match(first, /Ada/);
  assert.throws(() => expandSpintax("{hello|goodbye"), /malformed/);
});
test("positive reply rate uses confirmed sends as denominator", () => {
  const m = campaignMetrics([
    { status: "sent", reply_sentiment: "positive" },
    { status: "sent", reply_sentiment: "neutral" },
    { status: "pending", reply_sentiment: "none" },
    { status: "unknown", reply_sentiment: "none" },
  ]);
  assert.equal(m.sent, 2);
  assert.equal(m.positiveRate, 50);
  assert.equal(m.replyRate, 100);
  assert.equal(campaignMetrics([]).positiveRate, 0);
});
test("quality scores empty lists honestly and keeps permission distinct from syntax", () => {
  assert.equal(scoreList([]).score, 0);
  const s = scoreList([
    {
      email: "a@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
      company: "Acme",
      title: "Founder",
      website: "https://example.com",
      source: "CSV",
    },
  ]);
  assert.equal(s.dimensions[0][1], 100);
  assert.equal(s.dimensions[7][1], 0);
});
test("rendered user content is escaped and copy checks avoid a delivery guarantee", () => {
  assert.equal(
    escapeHTML('<img src=x onerror="x">'),
    "&lt;img src=x onerror=&quot;x&quot;&gt;",
  );
  assert.ok(checkCopy("Act now!!", "This is guaranteed.").length >= 2);
});
