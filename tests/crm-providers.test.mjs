import test from "node:test";
import assert from "node:assert/strict";
import {
  prospeoSearchRequest,
  prospeoPerson,
  callProspeo,
} from "../supabase/functions/_shared/crm-providers.mjs";
test("Prospeo search is bounded and requires explicit targeting", () => {
  const request = prospeoSearchRequest({ titles: "Founder, CEO", page: 2 });
  assert.deepEqual(request.filters.person_job_title.include, [
    "Founder",
    "CEO",
  ]);
  assert.equal(request.page, 2);
  assert.deepEqual(
    prospeoSearchRequest({ location: "California, United States #US" }).filters
      .person_location_search.include,
    ["California, United States #US"],
  );
  assert.throws(() => prospeoSearchRequest({}), /focus/);
  assert.throws(() => prospeoSearchRequest({ titles: "CEO", page: 0 }), /Page/);
});
test("Prospeo search never treats an unrevealed email object as an address", () => {
  assert.equal(
    prospeoPerson({
      person: { email: { revealed: false, email: "hidden@example.com" } },
    }).email,
    "",
  );
  assert.equal(
    prospeoPerson({
      person: { email: { revealed: true, email: "real@example.com" } },
    }).email,
    "real@example.com",
  );
});
test("provider adapter uses a fixed endpoint and reports credit/auth failures", async () => {
  let request;
  const data = await callProspeo(
    "search-person",
    { page: 1 },
    "test-key",
    async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ error: false, results: [] }));
    },
  );
  assert.equal(request.url, "https://api.prospeo.io/search-person");
  assert.equal(request.options.headers["X-KEY"], "test-key");
  assert.deepEqual(data.results, []);
  await assert.rejects(
    callProspeo("https://evil.example", {}, "test-key"),
    /not allowed/,
  );
  await assert.rejects(
    callProspeo(
      "search-person",
      {},
      "test-key",
      async () =>
        new Response(
          JSON.stringify({ error: true, message: "Insufficient credits" }),
          { status: 402 },
        ),
    ),
    /Insufficient credits/,
  );
});
