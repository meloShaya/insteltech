import { createClient } from "npm:@supabase/supabase-js@2";
import { validatePlan, executeNext } from "../_shared/crm-automation.mjs";
import { connectionStatus } from "../_shared/crm-adapters.mjs";
import { campaignPlan } from "../../../crm/campaign-sequences.mjs";
import { sendScheduledSequences } from "../_shared/crm-sequence-send.mjs";

const origins = new Set([
  "https://insteltech.co.zw",
  "https://www.insteltech.co.zw",
  "http://localhost:8000",
  "http://localhost:8080",
]);
const checked = (result: any) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const uuid = (id: unknown) => {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))
    throw new Error("Invalid run ID");
  return id;
};
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origins.has(origin)
      ? origin
      : "https://insteltech.co.zw",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (origin && !origins.has(origin))
    return json({ error: "Origin not allowed" }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 500000) return json({ error: "Request too large" }, 413);
    const body = JSON.parse(raw);
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token =
      req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const scheduler = Boolean(service) && token === service && !origin;
    if (scheduler) {
      if (body.action !== "tick")
        return json({ error: "Scheduler action not allowed" }, 403);
      checked(await db.rpc("crm_enqueue_due_schedules"));
      let mail;
      try {
        mail = await sendScheduledSequences(db, {
          url,
          token: service,
          anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
        });
      } catch (error) {
        mail = {
          error:
            error instanceof Error ? error.message : "Scheduled sending failed",
        };
      }
      return json({
        ...(await executeNext(db, {
          secrets: (key: string) => Deno.env.get(key),
        })),
        mail,
      });
    }
    const { data: auth, error } = await db.auth.getUser(token);
    if (error || !auth.user) return json({ error: "Sign in to continue" }, 401);
    const member = checked(
      await db
        .from("mail_members")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("active", true)
        .maybeSingle(),
    );
    if (!member)
      return json({ error: "Active workspace membership required" }, 403);
    if (body.action === "connections")
      return json({
        connections: connectionStatus((key: string) => Deno.env.get(key)),
        scheduler: checked(await db.rpc("crm_scheduler_status")),
      });
    if (body.action === "scheduler") {
      if (member.role !== "owner")
        return json(
          { error: "Only a workspace owner can change the scheduler" },
          403,
        );
      return json({
        enabled: checked(
          await db.rpc("crm_configure_scheduler", {
            p_url: url,
            p_service_key: service,
            p_enabled: body.enabled === true,
          }),
        ),
      });
    }
    if (body.action === "queue") {
      const steps = validatePlan(body.steps);
      const attempts = Number(body.max_attempts ?? 3);
      if (!Number.isInteger(attempts) || attempts < 1 || attempts > 6)
        throw new Error("Choose 1 to 6 attempts.");
      const due = body.due_at ? new Date(body.due_at) : new Date();
      if (!Number.isFinite(due.getTime()))
        throw new Error("Choose a valid start date.");
      const title = String(body.title || "Automation run")
        .trim()
        .slice(0, 200);
      if (body.recurring) {
        const timezone = String(body.recurring.timezone || "");
        try {
          new Intl.DateTimeFormat("en", { timeZone: timezone });
        } catch {
          throw new Error("Choose a valid time zone.");
        }
        const days = body.recurring.days;
        if (
          !Array.isArray(days) ||
          !days.length ||
          days.length > 7 ||
          days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)
        )
          throw new Error("Choose valid recurring weekdays.");
        const time = body.recurring.time;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
          throw new Error("Choose a valid recurring start time.");
        const next = checked(
          await db.rpc("crm_next_schedule", {
            p_after: new Date().toISOString(),
            p_zone: timezone,
            p_time: time,
            p_days: days,
          }),
        );
        const schedule = checked(
          await db
            .from("crm_automation_schedules")
            .insert({
              title,
              steps,
              timezone,
              time_of_day: time,
              days,
              max_attempts: attempts,
              next_run_at: next,
              created_by: auth.user.id,
            })
            .select("id")
            .single(),
        );
        return json({ schedule_id: schedule.id, next_run_at: next });
      }
      const id = checked(
        await db.rpc("crm_queue_automation", {
          p_title: title,
          p_creator: auth.user.id,
          p_steps: steps,
          p_attempts: attempts,
          p_due: due.toISOString(),
        }),
      );
      return json({ id });
    }
    if (
      body.action === "campaign_publish" ||
      body.action === "campaign_status"
    ) {
      const campaign = checked(
        await db
          .from("crm_campaigns")
          .select("*")
          .eq("id", uuid(body.id))
          .single(),
      );
      if (!["smartlead", "instantly"].includes(campaign.provider))
        throw new Error("Choose an outbound provider first.");
      if (body.action === "campaign_status") {
        if (!campaign.provider_campaign_id)
          throw new Error("Publish this campaign before activating it.");
        if (!["active", "paused"].includes(body.status))
          throw new Error("Choose active or paused.");
        if (body.status === "paused" && campaign.provider_run_id) {
          checked(
            await db
              .from("crm_automation_runs")
              .update({
                status: "cancelled",
                finished_at: new Date().toISOString(),
              })
              .eq("id", campaign.provider_run_id)
              .in("status", ["queued", "running", "held"]),
          );
          checked(
            await db
              .from("crm_automation_steps")
              .update({ status: "cancelled" })
              .eq("run_id", campaign.provider_run_id)
              .eq("status", "queued"),
          );
        }
        const steps = validatePlan([
          {
            operation: `${campaign.provider}.status`,
            input: {
              campaign_id: campaign.provider_campaign_id,
              status:
                campaign.provider === "smartlead"
                  ? body.status === "active"
                    ? "START"
                    : "PAUSED"
                  : body.status === "active"
                    ? "activate"
                    : "pause",
            },
          },
        ]);
        const id = checked(
          await db.rpc("crm_queue_automation", {
            p_title: `${body.status === "active" ? "Activate" : "Pause"}: ${campaign.name}`,
            p_creator: auth.user.id,
            p_steps: steps,
          }),
        );
        checked(
          await db
            .from("crm_automation_runs")
            .update({ campaign_id: campaign.id })
            .eq("id", id),
        );
        const execution = await executeNext(db, {
          runId: id,
          secrets: (key: string) => Deno.env.get(key),
        });
        return json({ id, execution });
      }
      const recipients = checked(
        await db
          .from("crm_recipients")
          .select("contact_id")
          .eq("campaign_id", campaign.id)
          .limit(5001),
      );
      if (!recipients.length || recipients.length > 5000)
        throw new Error("Enroll 1 to 5,000 contacts before publishing.");
      const contacts = [];
      for (let start = 0; start < recipients.length; start += 100)
        contacts.push(
          ...checked(
            await db
              .from("crm_contacts")
              .select("*")
              .in(
                "id",
                recipients
                  .slice(start, start + 100)
                  .map((r: any) => r.contact_id),
              ),
          ),
        );
      const profile = checked(
        await db.from("crm_settings").select("*").single(),
      );
      const steps = validatePlan(campaignPlan(campaign, contacts, profile));
      const due = campaign.sending_config.launch_at
        ? new Date(campaign.sending_config.launch_at)
        : new Date();
      if (!Number.isFinite(due.getTime()))
        throw new Error("Invalid launch date.");
      const id = checked(
        await db.rpc("crm_queue_campaign", {
          p_campaign: campaign.id,
          p_creator: auth.user.id,
          p_steps: steps,
          p_due: due.toISOString(),
        }),
      );
      return json({ id });
    }
    if (body.action === "run")
      return json(
        await executeNext(db, {
          runId: uuid(body.id),
          secrets: (key: string) => Deno.env.get(key),
        }),
      );
    if (body.action === "pause_schedule") {
      checked(
        await db
          .from("crm_automation_schedules")
          .update({ active: false })
          .eq("id", uuid(body.id)),
      );
      return json({ ok: true });
    }
    if (body.action === "cancel") {
      const id = uuid(body.id);
      checked(
        await db
          .from("crm_automation_runs")
          .update({
            status: "cancelled",
            finished_at: new Date().toISOString(),
          })
          .eq("id", id)
          .in("status", ["queued", "running", "held", "failed"]),
      );
      checked(
        await db
          .from("crm_automation_steps")
          .update({ status: "cancelled" })
          .eq("run_id", id)
          .eq("status", "queued"),
      );
      return json({ ok: true });
    }
    if (body.action === "retry") {
      const id = uuid(body.id);
      // Failed is a known failure. Unknown writes are held and cannot enter this path.
      checked(await db.rpc("crm_retry_automation", { p_run: id }));
      return json({ ok: true });
    }
    if (body.action === "reconcile") {
      if (
        typeof body.executed !== "boolean" ||
        typeof body.note !== "string" ||
        body.note.trim().length < 20
      )
        throw new Error(
          "Record the outcome and how you verified it in the provider account.",
        );
      const step = checked(
        await db
          .from("crm_automation_steps")
          .select("*")
          .eq("id", uuid(body.step_id))
          .eq("status", "held")
          .single(),
      );
      const data = body.result || {};
      if (
        body.executed &&
        step.operation.endsWith(".create") &&
        !data.id &&
        !data.campaign_id
      )
        throw new Error(
          "Include the created provider object's id in the verified result.",
        );
      const output = {
        operation: step.operation,
        records: Array.isArray(data) ? data : [data],
        data,
        resource_id: data.id || data.campaign_id || null,
        source: "operator reconciliation",
        fetched_at: new Date().toISOString(),
      };
      checked(
        await db.rpc("crm_reconcile_automation", {
          p_step: step.id,
          p_executed: body.executed,
          p_output: output,
          p_note: body.note,
          p_actor: auth.user.id,
        }),
      );
      const run = checked(
        await db
          .from("crm_automation_runs")
          .select("campaign_id")
          .eq("id", step.run_id)
          .single(),
      );
      if (
        body.executed &&
        run.campaign_id &&
        output.resource_id &&
        step.operation.endsWith(".create")
      )
        checked(
          await db
            .from("crm_campaigns")
            .update({ provider_campaign_id: String(output.resource_id) })
            .eq("id", run.campaign_id),
        );
      return json({ ok: true, run_id: step.run_id });
    }
    return json({ error: "Unknown automation action" }, 400);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Automation failed" },
      400,
    );
  }
});
