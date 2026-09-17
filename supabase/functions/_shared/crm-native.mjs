import { prepareContacts } from "../../../crm/domain.mjs";
import { sequenceConfig } from "../../../crm/campaign-sequences.mjs";
import catalog from "../../../crm/catalog.json" with { type: "json" };
import { executeProvider } from "./crm-adapters.mjs";
const check = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
export async function executeCRMOperation(
  db,
  operation,
  input,
  actor,
  connection,
) {
  let records, data;
  if (operation === "crm.sync_campaign") {
    const campaign = check(
      await db
        .from("crm_campaigns")
        .select("*")
        .eq("id", input.campaign_id)
        .single(),
    );
    if (
      !campaign?.provider_campaign_id ||
      !["smartlead", "instantly"].includes(campaign.provider)
    )
      throw new Error(
        "Publish this campaign to an outbound provider before syncing.",
      );
    const result = await executeProvider(
      `${campaign.provider}.analytics`,
      { campaign_id: campaign.provider_campaign_id },
      connection,
    );
    const raw = result.records[0] || {};
    const count = (...keys) => {
      for (const key of keys)
        if (raw[key] != null && Number.isFinite(Number(raw[key])))
          return Number(raw[key]);
      return null;
    };
    data = {
      sent: count("emails_sent_count", "sent_count", "sent"),
      replies: count("reply_count", "replied_count"),
      positive: count("positive_reply_count"),
      bounced: count("bounced_count", "bounce_count"),
      raw,
      source: campaign.provider,
    };
    check(
      await db
        .from("crm_campaigns")
        .update({
          provider_metrics: data,
          provider_synced_at: result.fetched_at,
        })
        .eq("id", campaign.id),
    );
    records = [data];
  } else if (operation === "crm.queue_workflow") {
    const workflow = catalog.find((w) => w.id === input.workflow_id);
    if (
      !workflow ||
      typeof input.brief !== "string" ||
      !input.brief.trim() ||
      input.brief.length > 12000
    )
      throw new Error("Choose a workflow and provide its objective.");
    const profile = check(await db.from("crm_settings").select("*").single());
    const existing = check(
      await db
        .from("crm_jobs")
        .select("id,title,status")
        .eq("workflow_id", workflow.id)
        .eq("created_by", actor)
        .in("status", ["queued", "running"])
        .contains("input", { brief: input.brief })
        .limit(1),
    );
    data =
      existing[0] ||
      check(
        await db
          .from("crm_jobs")
          .insert({
            workflow_id: workflow.id,
            title: workflow.title,
            created_by: actor,
            input: {
              brief: input.brief,
              profile,
              contacts: [],
              execution: {
                allow_provider_writes: input.allow_provider_writes === true,
              },
            },
          })
          .select("id,title,status")
          .single(),
      );
    records = [data];
  } else if (operation === "crm.import_contacts") {
    if (
      !Array.isArray(input.contacts) ||
      !input.contacts.length ||
      input.contacts.length > 500
    )
      throw new Error("Import 1 to 500 contacts per operation.");
    const existing = check(
      await db
        .from("crm_contacts")
        .select("email")
        .in(
          "email",
          input.contacts.map((c) =>
            String(c.email || "")
              .trim()
              .toLowerCase(),
          ),
        ),
    );
    const prepared = prepareContacts(input.contacts, existing);
    records = prepared.contacts.length
      ? check(
          await db
            .from("crm_contacts")
            .upsert(prepared.contacts, {
              onConflict: "email",
              ignoreDuplicates: true,
            })
            .select("*"),
        )
      : [];
    data = {
      imported: records.length,
      duplicates: prepared.duplicates,
      errors: prepared.errors,
    };
  } else if (operation === "crm.draft_campaign") {
    if (
      !input.name?.trim() ||
      !input.subject?.trim() ||
      !input.body?.trim() ||
      input.subject.length > 200 ||
      input.body.length > 50000
    )
      throw new Error(
        "Provide campaign name, subject and body within the editor limits.",
      );
    const provider = input.provider || "resend";
    if (!["resend", "smartlead", "instantly"].includes(provider))
      throw new Error("Invalid campaign provider.");
    sequenceConfig(input);
    const campaign = {
      name: input.name.slice(0, 200),
      subject: input.subject,
      body: input.body,
      provider,
      sequence: input.sequence || [],
      sending_config: input.sending_config || {},
      audience_stage: input.audience_stage || "qualified",
      status: "draft",
      automation_owner: actor,
    };
    data = check(
      await db.from("crm_campaigns").insert(campaign).select("*").single(),
    );
    records = [data];
  } else if (operation === "crm.add_task") {
    if (
      typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 500
    )
      throw new Error("Provide a nonempty task title of at most 500 characters.");
    let due_at;
    if (input.due_at !== undefined && input.due_at !== null && input.due_at !== "") {
      const value = input.due_at;
      const invalid = () => new Error("Provide due_at as a real calendar date (YYYY-MM-DD) or an ISO timestamp; omit it for today.");
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))
        throw invalid();
      due_at = value.slice(0, 10);
      const date = new Date(`${due_at}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== due_at || !Number.isFinite(Date.parse(value)))
        throw invalid();
    }
    data = check(
      await db
        .from("crm_tasks")
        .insert({ title: input.title.trim(), ...(due_at ? { due_at } : {}), completed: false })
        .select("*")
        .single(),
    );
    records = [data];
  } else throw new Error("Unknown native CRM operation");
  return {
    operation,
    records,
    data,
    resource_id: data.id || null,
    source: "Instel CRM",
    fetched_at: new Date().toISOString(),
  };
}
