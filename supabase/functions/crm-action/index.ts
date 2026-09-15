import { createClient } from "npm:@supabase/supabase-js@2";
import { renderTemplate, emailValid } from "../../../crm/domain.mjs";
import {
  callProspeo,
  prospeoSearchRequest,
  prospeoPerson,
} from "../_shared/crm-providers.mjs";
import { AUTOMATIONS } from "../../../crm/automation-catalog.mjs";
import { executeNext } from "../_shared/crm-automation.mjs";
import { sendSequenceBatch } from "../_shared/crm-sequence-send.mjs";

const origins = new Set([
  "https://insteltech.co.zw",
  "https://www.insteltech.co.zw",
  "http://localhost:8000",
  "http://localhost:8080",
]);
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const uuid = (v: unknown): string => {
  if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v))
    throw new Error("Invalid identifier");
  return v;
};
const check = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": origins.has(origin)
      ? origin
      : "https://insteltech.co.zw",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-crm-worker",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (origin && !origins.has(origin))
    return json({ error: "Origin not allowed" }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 600_000) return json({ error: "Request too large" }, 413);
    const body = JSON.parse(raw);
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const workerToken = req.headers.get("x-crm-worker");
    if (workerToken) {
      if (workerToken.length < 40 || workerToken.length > 200)
        return json({ error: "Invalid runner token" }, 401);
      const worker = check(
        await db
          .from("crm_workers")
          .select("id,created_by")
          .eq("token_hash", await hash(workerToken))
          .eq("active", true)
          .maybeSingle(),
      );
      if (!worker) return json({ error: "Runner revoked or unknown" }, 401);
      const owner = check(
        await db
          .from("mail_members")
          .select("user_id")
          .eq("user_id", worker.created_by)
          .eq("active", true)
          .eq("role", "owner")
          .maybeSingle(),
      );
      if (!owner)
        return json({ error: "Runner owner no longer has access" }, 403);
      check(
        await db
          .from("crm_workers")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", worker.id),
      );
      if (body.action === "claim_job")
        return json({
          job:
            check(
              await db.rpc("crm_claim_job", { p_worker: worker.id }),
            )?.[0] || null,
        });
      if (body.action === "heartbeat") {
        check(
          await db
            .from("crm_jobs")
            .update({ claimed_at: new Date().toISOString() })
            .eq("worker_id", worker.id)
            .eq("status", "running"),
        );
        const active = body.job_id
          ? check(
              await db
                .from("crm_jobs")
                .select("id")
                .eq("id", uuid(body.job_id))
                .eq("worker_id", worker.id)
                .eq("status", "running")
                .maybeSingle(),
            )
          : true;
        return json({ ok: true, active: Boolean(active) });
      }
      if (body.action === "provider_operation") {
        const operation = AUTOMATIONS.find((o) => o.id === body.operation);
        if (
          !operation ||
          !body.input ||
          typeof body.input !== "object" ||
          Array.isArray(body.input)
        )
          throw new Error("Invalid provider operation");
        const run = check(
          await db.rpc("crm_queue_tool", {
            p_job: uuid(body.job_id),
            p_worker: worker.id,
            p_call: String(body.call_id || ""),
            p_operation: operation.id,
            p_input: body.input,
            p_write: operation.write,
          }),
        );
        await executeNext(db, {
          runId: run,
          secrets: (key: string) => Deno.env.get(key),
        });
        const step = check(
          await db
            .from("crm_automation_steps")
            .select("status,output,error,due_at")
            .eq("run_id", run)
            .eq("position", 0)
            .single(),
        );
        return json({ run_id: run, ...step });
      }
      if (body.action === "finish_job") {
        const result = check(
          await db
            .from("crm_jobs")
            .update({
              status: body.error ? "failed" : "completed",
              output: String(body.output || "").slice(0, 500_000),
              error: body.error ? String(body.error).slice(0, 2000) : null,
              finished_at: new Date().toISOString(),
            })
            .eq("id", uuid(body.id))
            .eq("worker_id", worker.id)
            .eq("status", "running")
            .select("id"),
        );
        return json({ ok: Boolean(result?.length) });
      }
      return json({ error: "Runner action not allowed" }, 403);
    }
    const token =
      req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user)
      return json({ error: "Sign in to continue" }, 401);
    const member = check(
      await db
        .from("mail_members")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("active", true)
        .maybeSingle(),
    );
    if (!member)
      return json({ error: "Active mail team membership required" }, 403);
    if (body.action === "search_prospects") {
      const data = await callProspeo(
        "search-person",
        prospeoSearchRequest(body),
        Deno.env.get("PROSPEO_API_KEY"),
      );
      return json({
        people: (data.results || []).slice(0, 25).map(prospeoPerson),
        pagination: data.pagination,
      });
    }
    if (body.action === "reveal_prospect") {
      if (
        typeof body.person_id !== "string" ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(body.person_id)
      )
        throw new Error("Invalid Prospeo person identifier");
      const data = await callProspeo(
        "enrich-person",
        { data: { person_id: body.person_id }, only_verified_email: true },
        Deno.env.get("PROSPEO_API_KEY"),
      );
      return json({ person: prospeoPerson(data) });
    }
    if (body.action === "connect_worker") {
      if (member.role !== "owner")
        return json(
          { error: "Only a workspace owner can connect a runner" },
          403,
        );
      const token = crypto.randomUUID() + crypto.randomUUID();
      const worker = check(
        await db
          .from("crm_workers")
          .insert({
            name: String(body.name || "Codex runner").slice(0, 100),
            token_hash: await hash(token),
            created_by: auth.user.id,
          })
          .select("id")
          .single(),
      );
      if (!worker) throw new Error("Runner registration returned no record");
      return json({
        id: worker.id,
        token,
        url,
        anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
      });
    }
    if (body.action === "revoke_worker") {
      if (member.role !== "owner")
        return json(
          { error: "Only a workspace owner can revoke a runner" },
          403,
        );
      check(
        await db
          .from("crm_workers")
          .update({ active: false })
          .eq("id", uuid(body.id)),
      );
      return json({ ok: true });
    }
    if (body.action === "cancel_job") {
      check(await db.rpc("crm_cancel_job", { p_job: uuid(body.id) }));
      return json({ ok: true });
    }
    if (body.action === "infrastructure") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      let domains = [],
        domainError = null;
      if (resendKey) {
        const r = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${resendKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) domains = (await r.json()).data || [];
        else
          domainError =
            "This Resend key cannot read domains. Check verification in Resend.";
      }
      return json({
        resend: Boolean(resendKey),
        domains,
        domainError,
        providers: {
          prospeo: Boolean(Deno.env.get("PROSPEO_API_KEY")),
          blitz: Boolean(Deno.env.get("BLITZ_API_KEY")),
          millionverifier: Boolean(Deno.env.get("MILLIONVERIFIER_API_KEY")),
          rapidapi: Boolean(Deno.env.get("RAPIDAPI_KEY")),
          smartlead: Boolean(Deno.env.get("SMARTLEAD_API_KEY")),
        },
      });
    }
    if (body.action === "enroll") {
      const campaignId = uuid(body.campaign_id);
      const campaign = check(
        await db
          .from("crm_campaigns")
          .select("status,provider")
          .eq("id", campaignId)
          .single(),
      );
      if (!campaign) throw new Error("Campaign not found");
      if (campaign.status !== "draft" && campaign.status !== "paused")
        throw new Error("Pause the campaign before changing its audience");
      if (
        !Array.isArray(body.contacts) ||
        body.contacts.length > 500 ||
        !body.contacts.length
      )
        throw new Error("Choose between 1 and 500 contacts");
      const ids = body.contacts.map(uuid);
      const contacts =
        check(
          await db
            .from("crm_contacts")
            .select("id,consent,consent_note,suppressed")
            .in("id", ids),
        ) || [];
      if (
        contacts.length !== new Set(ids).size ||
        contacts.some(
          (c) =>
            c.suppressed ||
            ((campaign.provider || "resend") === "resend" &&
              (!c.consent || !c.consent_note.trim())),
        )
      )
        throw new Error(
          "Resend campaigns require recorded permission for every contact and exclude suppressed contacts",
        );
      check(
        await db.from("crm_recipients").upsert(
          contacts.map((c) => ({ campaign_id: campaignId, contact_id: c.id })),
          { onConflict: "campaign_id,contact_id", ignoreDuplicates: true },
        ),
      );
      return json({ ok: true, enrolled: contacts.length });
    }
    if (body.action === "score_reply") {
      if (
        !["positive", "neutral", "negative", "unsubscribe", "none"].includes(
          body.sentiment,
        )
      )
        throw new Error("Invalid sentiment");
      const r = check(
        await db
          .from("crm_recipients")
          .update({ reply_sentiment: body.sentiment })
          .eq("id", uuid(body.id))
          .eq("status", "sent")
          .select("contact_id")
          .single(),
      );
      if (!r) throw new Error("Sent recipient not found");
      if (body.sentiment === "unsubscribe") {
        check(
          await db
            .from("crm_contacts")
            .update({ suppressed: true })
            .eq("id", r.contact_id),
        );
        check(
          await db
            .from("crm_recipients")
            .update({ status: "suppressed" })
            .eq("contact_id", r.contact_id)
            .eq("status", "pending"),
        );
      }
      return json({ ok: true });
    }
    if (body.action === "reconcile_sends") {
      let recovered = 0,
        remaining = 0;
      for (const table of ["crm_recipients", "crm_followups"]) {
        const deliveries =
          check(
            await db
              .from(table)
              .select("id,delivery_key")
              .eq("campaign_id", uuid(body.campaign_id))
              .in("status", ["sending", "unknown"])
              .limit(100),
          ) || [];
        if (!deliveries.length) continue;
        const messages =
          check(
            await db
              .from("mail_messages")
              .select("id,client_send_id,status,sent_at,error_message")
              .in(
                "client_send_id",
                deliveries.map((d) => d.delivery_key || d.id),
              ),
          ) || [];
        for (const delivery of deliveries) {
          const message = messages.find(
            (m) => m.client_send_id === (delivery.delivery_key || delivery.id),
          );
          if (!message || !["sent", "failed"].includes(message.status)) {
            remaining++;
            continue;
          }
          check(
            await db
              .from(table)
              .update({
                status: message.status,
                message_id: message.id,
                sent_at: message.sent_at,
                error: message.error_message,
              })
              .eq("id", delivery.id)
              .in("status", ["sending", "unknown"]),
          );
          recovered++;
        }
      }
      return json({ reconciled: recovered, held: remaining });
    }
    if (body.action === "retry_deliveries") {
      let queued = 0;
      for (const table of ["crm_recipients", "crm_followups"]) {
        const failed =
          check(
            await db
              .from(table)
              .select("id,message_id")
              .eq("campaign_id", uuid(body.campaign_id))
              .eq("status", "failed")
              .limit(100),
          ) || [];
        for (const delivery of failed) {
          if (delivery.message_id) {
            const message = check(
              await db
                .from("mail_messages")
                .select("status")
                .eq("id", delivery.message_id)
                .maybeSingle(),
            );
            if (!message || message.status !== "failed") continue;
          }
          check(
            await db
              .from(table)
              .update({
                status: "pending",
                attempts: 0,
                delivery_key: crypto.randomUUID(),
                message_id: null,
                error: null,
                [table === "crm_followups" ? "due_at" : "next_attempt_at"]:
                  new Date().toISOString(),
              })
              .eq("id", delivery.id)
              .eq("status", "failed"),
          );
          queued++;
        }
      }
      return json({ queued });
    }
    if (body.action === "send_batch") {
      const campaignId = uuid(body.campaign_id);
      const campaign = check(
        await db
          .from("crm_campaigns")
          .select("*")
          .eq("id", campaignId)
          .single(),
      );
      const settings = check(
        await db.from("crm_settings").select("*").single(),
      );
      if (!campaign || !settings)
        throw new Error("Campaign or sender settings not found");
      if (campaign.provider && campaign.provider !== "resend")
        throw new Error(
          "Use the campaign's connected provider to send this sequence.",
        );
      if (
        campaign.sequence?.length ||
        Object.keys(campaign.sending_config || {}).length
      ) {
        return json(
          await sendSequenceBatch(db, campaign, settings, {
            url,
            token,
            anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
          }),
        );
      }
      if (!campaign.subject.trim() || !campaign.body.trim())
        throw new Error("Add campaign copy before sending");
      if (
        !settings.physical_address.trim() ||
        !emailValid(settings.unsubscribe_email)
      )
        throw new Error(
          "Add your physical address and opt-out mailbox in Settings",
        );
      if (campaign.status !== "active")
        throw new Error("Activate the reviewed campaign first");
      const results = [];
      // Five per click keeps requests bounded; the operator sees every batch outcome.
      for (let i = 0; i < 5; i++) {
        const recipient = check(
          await db.rpc("crm_claim_recipient", { p_campaign: campaignId }),
        )?.[0];
        if (!recipient) break;
        let attempted = false;
        try {
          const contact = check(
            await db
              .from("crm_contacts")
              .select("*")
              .eq("id", recipient.contact_id)
              .single(),
          );
          if (!contact) throw new Error("Contact no longer exists");
          if (
            !contact.consent ||
            !contact.consent_note.trim() ||
            contact.suppressed
          ) {
            check(
              await db
                .from("crm_recipients")
                .update({
                  status: "suppressed",
                  error: "Permission missing or contact suppressed",
                })
                .eq("id", recipient.id),
            );
            results.push({ id: recipient.id, status: "suppressed" });
            continue;
          }
          const subject = renderTemplate(campaign.subject, contact);
          const text =
            renderTemplate(campaign.body, contact) +
            `\n\n${settings.company_name}\n${settings.physical_address}\nTo stop receiving these messages, reply “unsubscribe” or email ${settings.unsubscribe_email}.`;
          attempted = true;
          const response = await fetch(`${url}/functions/v1/mail-send`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: contact.email,
              subject,
              text,
              client_send_id: recipient.id,
            }),
            signal: AbortSignal.timeout(20000),
          });
          const result = await response.json();
          const status =
            response.ok && result.ok
              ? "sent"
              : response.status === 504 || result.status === "unknown"
                ? "unknown"
                : "failed";
          check(
            await db
              .from("crm_recipients")
              .update({
                status,
                message_id: result.message_id || null,
                sent_at: status === "sent" ? new Date().toISOString() : null,
                error: result.error || null,
              })
              .eq("id", recipient.id),
          );
          results.push({ id: recipient.id, status, error: result.error });
          if (status !== "sent") break;
        } catch (error) {
          const status = attempted ? "unknown" : "failed";
          check(
            await db
              .from("crm_recipients")
              .update({ status, error: String(error).slice(0, 1000) })
              .eq("id", recipient.id),
          );
          results.push({ id: recipient.id, status });
          break;
        }
      }
      return json({ results });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Request failed" },
      400,
    );
  }
});
