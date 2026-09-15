import test from "node:test";
import assert from "node:assert/strict";
import { sendSequenceBatch } from "../supabase/functions/_shared/crm-sequence-send.mjs";
function fixture(contact = {}) {
  const updates = [],
    delivery = {
      id: "recipient",
      contact_id: "contact",
      attempts: 1,
      delivery_key: null,
    };
  let claimed = false;
  const db = {
    rpc: async () => ({
      data: claimed
        ? null
        : ((claimed = true),
          {
            table: "crm_recipients",
            delivery,
            copy: { subject: "Hello {{first_name}}", body: "A note" },
          }),
      error: null,
    }),
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        update(patch) {
          updates.push({ table, patch });
          return this;
        },
        single: async () => ({
          data: {
            email: "alex@example.com",
            first_name: "Alex",
            consent: true,
            consent_note: "Opt-in",
            suppressed: false,
            ...contact,
          },
          error: null,
        }),
        then(resolve) {
          resolve({ data: null, error: null });
        },
      };
    },
  };
  return { db, updates, delivery };
}
const campaign = {
  id: "campaign",
  automation_owner: "owner",
  sending_config: { max_attempts: 3 },
};
const profile = {
  company_name: "Fixture",
  physical_address: "Harare",
  unsubscribe_email: "stop@example.com",
};
const connection = {
  url: "https://fixture.supabase.co",
  token: "fixture-token",
  anonKey: "fixture-anon",
  scheduled: true,
};
test("Scheduled Resend send forwards the active actor and a durable delivery key", async () => {
  const f = fixture();
  await sendSequenceBatch(f.db, campaign, profile, {
    ...connection,
    fetcher: async (_, init) => {
      assert.equal(init.headers["x-crm-actor"], "owner");
      const body = JSON.parse(init.body);
      assert.equal(body.client_send_id, "recipient");
      assert.equal(body.subject, "Hello Alex");
      assert.match(body.text, /stop@example.com/);
      return Response.json({ ok: true, message_id: "mail" });
    },
  });
  assert.equal(f.updates[0].patch.status, "sent");
});
test("Scheduled sends recheck permission and only retry explicit provider rate refusals", async () => {
  const suppressed = fixture({ suppressed: true });
  await sendSequenceBatch(suppressed.db, campaign, profile, {
    ...connection,
    fetcher: async () => {
      throw new Error("Must not send");
    },
  });
  assert.equal(suppressed.updates[0].patch.status, "suppressed");
  const rate = fixture();
  await sendSequenceBatch(rate.db, campaign, profile, {
    ...connection,
    fetcher: async () =>
      Response.json(
        { provider_status: 429, error: "Rate limited" },
        { status: 502 },
      ),
  });
  assert.equal(rate.updates[0].patch.status, "pending");
  assert.notEqual(rate.updates[0].patch.delivery_key, "recipient");
  assert.ok(Date.parse(rate.updates[0].patch.next_attempt_at) > Date.now());
  for (const fetcher of [
    async () => {
      throw new Error("Network reset");
    },
    async () => Response.json({ status: "unknown" }, { status: 502 }),
    async () => Response.json({ status: "sending" }, { status: 409 }),
  ]) {
    const f = fixture();
    await sendSequenceBatch(f.db, campaign, profile, {
      ...connection,
      fetcher,
    });
    assert.equal(f.updates[0].patch.status, "unknown");
    assert.equal(f.updates[0].patch.delivery_key, undefined);
  }
});
