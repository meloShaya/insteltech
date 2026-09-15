import { escapeHTML, renderTemplate, campaignMetrics } from "./domain.mjs";

export function campaignDisplayMetrics(campaign, deliveries) {
  const metrics = campaignMetrics(deliveries);
  if (!campaign.provider || campaign.provider === "resend") return metrics;
  const p = campaign.provider_metrics || {};
  return {
    ...metrics,
    sent: p.sent ?? "—",
    replied: p.replies ?? "—",
    positive: p.positive ?? "—",
    positiveRate:
      p.sent && p.positive != null ? (100 * p.positive) / p.sent : 0,
  };
}
export function sequenceConfig(campaign) {
  const settings = {
    timezone: "Africa/Harare",
    days: [1, 2, 3, 4, 5],
    start_hour: "09:00",
    end_hour: "17:00",
    daily_limit: 30,
    interval_minutes: 5,
    stop_on_reply: true,
    autonomous: false,
    sender_ids: "",
    ...campaign.sending_config,
  };
  for (const key of ["autonomous", "stop_on_reply"])
    if (typeof settings[key] !== "boolean")
      throw new Error(
        `Use a true/false setting for ${key.replaceAll("_", " ")}.`,
      );
  try {
    new Intl.DateTimeFormat("en", { timeZone: settings.timezone });
  } catch {
    throw new Error("Choose a valid IANA time zone.");
  }
  if (
    !Array.isArray(settings.days) ||
    !settings.days.length ||
    settings.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error("Choose at least one sending day.");
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.start_hour) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.end_hour) ||
    settings.start_hour >= settings.end_hour
  )
    throw new Error("Sending must end after it starts, on the same day.");
  for (const [key, max] of [
    ["daily_limit", 1000],
    ["interval_minutes", 1440],
  ])
    if (
      !Number.isInteger(Number(settings[key])) ||
      Number(settings[key]) < 1 ||
      Number(settings[key]) > max
    )
      throw new Error(`Invalid ${key.replaceAll("_", " ")}.`);
  const steps = [
    { subject: campaign.subject, body: campaign.body, delay_days: 0 },
    ...(campaign.sequence || []),
  ];
  if (steps.length > 20) throw new Error("Use at most 20 sequence steps.");
  for (const [index, step] of steps.entries()) {
    if (!step.subject?.trim() || !step.body?.trim())
      throw new Error(`Add a subject and body to step ${index + 1}.`);
    if (
      !Number.isInteger(Number(step.delay_days)) ||
      Number(step.delay_days) < (index ? 1 : 0) ||
      Number(step.delay_days) > 365
    )
      throw new Error(
        `Choose a follow-up delay of 1 to 365 days for step ${index + 1}.`,
      );
  }
  return { settings, steps };
}
export function campaignPlan(campaign, contacts, profile) {
  if (!["smartlead", "instantly"].includes(campaign.provider))
    throw new Error(
      "Choose Smartlead or Instantly for outbound sequence publishing.",
    );
  const { settings, steps } = sequenceConfig(campaign);
  if (!settings.sender_ids.trim())
    throw new Error("Choose sender accounts before publishing.");
  if (!profile.physical_address?.trim() || !profile.unsubscribe_email?.trim())
    throw new Error(
      "Complete the campaign sender address and opt-out mailbox in Settings.",
    );
  if (!contacts.length || contacts.length > 5000)
    throw new Error("Choose 1 to 5,000 contacts for this campaign.");
  if (contacts.some((c) => c.suppressed))
    throw new Error("Remove suppressed contacts from this audience.");
  // Validate every personalization before any provider write. This catches missing names/titles.
  for (const contact of contacts)
    for (const step of steps) {
      renderTemplate(step.subject, contact);
      renderTemplate(step.body, contact);
    }
  const footer = `\n\n${profile.company_name || ""}\n${profile.physical_address}\nTo stop receiving these messages, reply “unsubscribe” or email ${profile.unsubscribe_email}.`;
  const html = (body) => escapeHTML(body + footer).replaceAll("\n", "<br>");
  const plan = [],
    add = (operation, input) => plan.push({ operation, input });
  let campaignId = campaign.provider_campaign_id;
  if (!campaignId) campaignId = { $step: 0, path: "resource_id" };
  if (campaign.provider === "smartlead") {
    if (!campaign.provider_campaign_id)
      add("smartlead.create", { name: campaign.name });
    add("smartlead.sequence", {
      campaign_id: campaignId,
      sequences: steps.map((s, i) => ({
        seq_number: i + 1,
        seq_delay_details: { delay_in_days: Number(s.delay_days) },
        subject: s.subject,
        email_body: html(s.body),
      })),
    });
    add("smartlead.attach", {
      campaign_id: campaignId,
      account_ids: settings.sender_ids,
    });
    add("smartlead.settings", {
      campaign_id: campaignId,
      stop_on_reply: settings.stop_on_reply,
    });
    add("smartlead.schedule", {
      campaign_id: campaignId,
      ...settings,
      days: settings.days.join(","),
    });
  } else {
    const input = {
      name: campaign.name,
      sequences: [
        {
          steps: steps.map((s, i) => ({
            type: "email",
            delay: i < steps.length - 1 ? Number(steps[i + 1].delay_days) : 0,
            variants: [{ subject: s.subject, body: html(s.body) }],
          })),
        },
      ],
      schedule: {
        schedules: [
          {
            name: "CRM sending window",
            timing: { from: settings.start_hour, to: settings.end_hour },
            days: Object.fromEntries(
              Array.from({ length: 7 }, (_, i) => [
                String(i),
                settings.days.includes(i),
              ]),
            ),
            timezone: settings.timezone,
          },
        ],
      },
      daily_limit: Number(settings.daily_limit),
      stop_on_reply: settings.stop_on_reply,
      emails: settings.sender_ids,
    };
    add(
      campaign.provider_campaign_id ? "instantly.update" : "instantly.create",
      {
        ...input,
        ...(campaign.provider_campaign_id ? { campaign_id: campaignId } : {}),
      },
    );
  }
  const batchSize = campaign.provider === "smartlead" ? 100 : 1000;
  for (let start = 0; start < contacts.length; start += batchSize) {
    add(`${campaign.provider}.leads`, {
      campaign_id: campaignId,
      leads: contacts.slice(start, start + batchSize).map((c) => ({
        email: c.email,
        first_name: c.first_name || "",
        last_name: c.last_name || "",
        company_name: c.company || "",
        [campaign.provider === "smartlead"
          ? "custom_fields"
          : "custom_variables"]: {
          company: c.company || "",
          title: c.title || "",
          website: c.website || "",
        },
      })),
    });
  }
  if (settings.autonomous)
    add(`${campaign.provider}.status`, {
      campaign_id: campaignId,
      status: campaign.provider === "smartlead" ? "START" : "activate",
    });
  return plan;
}
