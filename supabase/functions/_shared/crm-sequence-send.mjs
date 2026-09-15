import { renderTemplate, emailValid } from "../../../crm/domain.mjs";
const check = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
export async function sendSequenceBatch(
  db,
  campaign,
  settings,
  { url, token, anonKey, scheduled = false, fetcher = fetch },
) {
  if (
    !settings.physical_address?.trim() ||
    !emailValid(settings.unsubscribe_email)
  )
    throw new Error(
      "Complete the sender address and opt-out mailbox in Settings.",
    );
  const results = [];
  for (let i = 0; i < (scheduled ? 1 : 5); i++) {
    const claim = check(
      await db.rpc("crm_claim_sequence", {
        p_campaign: campaign.id,
        p_scheduled: scheduled,
      }),
    );
    if (!claim) break;
    const { table, delivery, copy } = claim;
    if (!["crm_recipients", "crm_followups"].includes(table))
      throw new Error("Invalid delivery claim");
    let attempted = false,
      patch;
    try {
      const contact = check(
        await db
          .from("crm_contacts")
          .select("*")
          .eq("id", delivery.contact_id)
          .single(),
      );
      if (
        !contact ||
        contact.suppressed ||
        !contact.consent ||
        !contact.consent_note?.trim()
      ) {
        patch = {
          status: "suppressed",
          error: "Permission missing or contact suppressed",
        };
      } else {
        const subject = renderTemplate(copy.subject, contact);
        const text =
          renderTemplate(copy.body, contact) +
          `\n\n${settings.company_name}\n${settings.physical_address}\nTo stop receiving these messages, reply “unsubscribe” or email ${settings.unsubscribe_email}.`;
        let thread = {};
        if (table === "crm_followups") {
          const recipient = check(
            await db
              .from("crm_recipients")
              .select("message_id")
              .eq("id", delivery.recipient_id)
              .single(),
          );
          if (recipient?.message_id) {
            const message = check(
              await db
                .from("mail_messages")
                .select("thread_id,internet_message_id")
                .eq("id", recipient.message_id)
                .maybeSingle(),
            );
            if (message)
              thread = {
                thread_id: message.thread_id,
                ...(message.internet_message_id
                  ? { in_reply_to: message.internet_message_id }
                  : {}),
              };
          }
        }
        attempted = true;
        const response = await fetcher(`${url}/functions/v1/mail-send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
            "Content-Type": "application/json",
            ...(scheduled ? { "x-crm-actor": campaign.automation_owner } : {}),
          },
          body: JSON.stringify({
            to: contact.email,
            subject,
            text,
            client_send_id: delivery.delivery_key || delivery.id,
            ...thread,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const result = await response.json();
        const status =
          response.ok && result.ok
            ? "sent"
            : response.status === 504 ||
                result.status === "unknown" ||
                response.status === 409
              ? "unknown"
              : "failed";
        patch = {
          status,
          message_id: result.message_id || null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          error: result.error || null,
        };
        const maximum = Math.min(
          6,
          Math.max(1, Number(campaign.sending_config?.max_attempts || 1)),
        );
        // A provider's explicit 429 is a known refusal. No other write error is automatically retried.
        if (
          status === "failed" &&
          result.provider_status === 429 &&
          delivery.attempts < maximum
        ) {
          patch.status = "pending";
          patch.delivery_key = crypto.randomUUID();
          patch[table === "crm_followups" ? "due_at" : "next_attempt_at"] =
            new Date(
              Date.now() + 60000 * 2 ** (delivery.attempts - 1),
            ).toISOString();
        }
      }
    } catch (error) {
      patch = {
        status: attempted ? "unknown" : "failed",
        error: String(error.message || error).slice(0, 1000),
      };
    }
    check(
      await db
        .from(table)
        .update(patch)
        .eq("id", delivery.id)
        .eq("status", "sending"),
    );
    results.push({ id: delivery.id, table, status: patch.status });
    if (!["sent", "suppressed"].includes(patch.status)) break;
  }
  return { results };
}
export async function sendScheduledSequences(db, connection) {
  const campaigns = check(
    await db
      .from("crm_campaigns")
      .select("*")
      .eq("status", "active")
      .eq("provider", "resend")
      .contains("sending_config", { autonomous: true })
      .order("updated_at")
      .limit(100),
  );
  const settings = check(await db.from("crm_settings").select("*").single());
  for (const campaign of campaigns) {
    const result = await sendSequenceBatch(db, campaign, settings, {
      ...connection,
      scheduled: true,
    });
    if (result.results.length) return result;
  }
  return { results: [] };
}
