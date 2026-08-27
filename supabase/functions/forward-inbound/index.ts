import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";
import {
  escapeHtml,
  headerValue,
  MAIL_ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_BYTES,
  normalizeSubject,
  safeFilename,
  stripHtml,
} from "../_shared/mail.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FORWARD_TO_EMAIL =
  Deno.env.get("FORWARD_TO_EMAIL") ?? "meloshaya02@gmail.com";
const FORWARD_FROM_EMAIL =
  Deno.env.get("FORWARD_FROM_EMAIL") ?? "forwarder@insteltech.co.zw";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

type ReceivedEmailEvent = {
  type: "email.received";
  data: {
    email_id: string;
    created_at?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
  };
};

type ReceivedEmail = {
  id?: string;
  created_at?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string> | null;
  message_id?: string;
  attachments?: ReceivedAttachment[];
};

type ReceivedAttachment = {
  id: string;
  filename?: string | null;
  size?: number;
  content_type?: string;
  content_disposition?: string | null;
};

type ReceivedAttachmentDetail = {
  id: string;
  filename?: string;
  size: number;
  content_type: string;
  download_url: string;
};

type StoredMessage = {
  id: string;
  thread_id: string;
  provider_id: string;
  backup_forward_status: "pending" | "sent" | "failed" | "not_configured";
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  text_body: string;
  html_body: string | null;
};

function asAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchResendJson<T>(url: string): Promise<T> {
  if (!RESEND_API_KEY) throw new Error("Resend API key is not configured");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const responseText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = { message: responseText };
  }
  if (!response.ok) {
    const message =
      responseBody &&
      typeof responseBody === "object" &&
      "message" in responseBody
        ? String(responseBody.message)
        : "Resend request failed";
    throw new Error(message);
  }
  return responseBody as T;
}

async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  return await fetchResendJson<ReceivedEmail>(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
  );
}

async function loadInboundAttachments(
  supabase: ReturnType<typeof createClient>,
  emailId: string,
  attachments: ReceivedAttachment[] | undefined,
) {
  const loaded = [];
  let totalBytes = 0;

  for (const attachment of attachments ?? []) {
    if (!attachment.id) continue;

    const detail = await fetchResendJson<ReceivedAttachmentDetail>(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachment.id)}`,
    );
    const response = await fetch(detail.download_url);
    if (!response.ok)
      throw new Error(
        `could not download ${detail.filename ?? "inbound attachment"}`,
      );

    const bytes = new Uint8Array(await response.arrayBuffer());
    totalBytes += bytes.length;
    if (
      bytes.length > MAX_ATTACHMENT_BYTES ||
      totalBytes > MAX_ATTACHMENT_BYTES
    ) {
      throw new Error("inbound attachments exceed the mailbox size limit");
    }

    const filename = safeFilename(
      detail.filename ?? attachment.filename,
      "attachment.bin",
    );
    const storagePath = `inbound/${emailId}/${crypto.randomUUID()}-${filename}`;
    const { error: uploadError } = await supabase.storage
      .from(MAIL_ATTACHMENTS_BUCKET)
      .upload(storagePath, bytes, {
        contentType:
          detail.content_type ||
          attachment.content_type ||
          "application/octet-stream",
        upsert: false,
      });
    if (uploadError) throw new Error(`could not store ${filename}`);

    loaded.push({
      provider_attachment_id: attachment.id,
      storage_path: storagePath,
      filename,
      content_type:
        detail.content_type ||
        attachment.content_type ||
        "application/octet-stream",
      byte_size: bytes.length,
    });
  }

  return loaded;
}

async function findThreadId(
  supabase: ReturnType<typeof createClient>,
  subject: string,
  headers: Record<string, string> | null | undefined,
): Promise<string> {
  const parentIds = new Set<string>();
  const inReplyTo = headerValue(headers, "in-reply-to");
  if (inReplyTo) parentIds.add(inReplyTo);
  for (const reference of headerValue(headers, "references")?.match(
    /<[^>]+>/g,
  ) ?? []) {
    parentIds.add(reference);
  }

  for (const parentId of parentIds) {
    const { data: parent } = await supabase
      .from("mail_messages")
      .select("thread_id")
      .eq("internet_message_id", parentId)
      .maybeSingle();
    if (parent?.thread_id) return parent.thread_id;
  }

  const { data: existingThread } = await supabase
    .from("mail_threads")
    .select("id")
    .eq("normalized_subject", normalizeSubject(subject))
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingThread?.id) return existingThread.id;

  const { data: newThread, error } = await supabase
    .from("mail_threads")
    .insert({
      subject: subject || "(no subject)",
      normalized_subject: normalizeSubject(subject),
    })
    .select("id")
    .single();
  if (error || !newThread)
    throw new Error("could not create inbound mail thread");
  return newThread.id;
}

async function storeInboundMessage(
  supabase: ReturnType<typeof createClient>,
  event: ReceivedEmailEvent,
  received: ReceivedEmail,
): Promise<StoredMessage> {
  const subject =
    received.subject?.trim() || event.data.subject?.trim() || "(no subject)";
  const headers = received.headers ?? {};
  const textBody = received.text?.trim() || stripHtml(received.html);
  const threadId = await findThreadId(supabase, subject, headers);
  const attachments = await loadInboundAttachments(
    supabase,
    event.data.email_id,
    received.attachments,
  );

  const { data: message, error: messageError } = await supabase
    .from("mail_messages")
    .insert({
      thread_id: threadId,
      direction: "inbound",
      provider_id: event.data.email_id,
      internet_message_id:
        received.message_id || headerValue(headers, "message-id"),
      in_reply_to: headerValue(headers, "in-reply-to"),
      references_header: headerValue(headers, "references"),
      from_address: received.from || event.data.from || "unknown sender",
      to_addresses: received.to ?? event.data.to ?? [],
      cc_addresses: received.cc ?? event.data.cc ?? [],
      bcc_addresses: received.bcc ?? event.data.bcc ?? [],
      subject,
      text_body: textBody,
      html_body: received.html || null,
      headers,
      status: "received",
      backup_forward_status: "pending",
      created_at: received.created_at || event.data.created_at || undefined,
    })
    .select(
      "id, thread_id, provider_id, backup_forward_status, from_address, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body",
    )
    .single();
  if (messageError || !message) throw new Error("could not store inbound mail");

  if (attachments.length > 0) {
    const { error: attachmentError } = await supabase
      .from("mail_attachments")
      .insert(
        attachments.map((attachment) => ({
          message_id: message.id,
          ...attachment,
        })),
      );
    if (attachmentError)
      throw new Error("could not store inbound attachment metadata");
  }

  await supabase
    .from("mail_threads")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  return {
    ...message,
    to_addresses: asAddressList(message.to_addresses),
    cc_addresses: asAddressList(message.cc_addresses),
    bcc_addresses: asAddressList(message.bcc_addresses),
  } as StoredMessage;
}

async function existingMessage(
  supabase: ReturnType<typeof createClient>,
  providerId: string,
): Promise<StoredMessage | null> {
  const { data } = await supabase
    .from("mail_messages")
    .select(
      "id, thread_id, provider_id, backup_forward_status, from_address, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body",
    )
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    to_addresses: asAddressList(data.to_addresses),
    cc_addresses: asAddressList(data.cc_addresses),
    bcc_addresses: asAddressList(data.bcc_addresses),
  } as StoredMessage;
}

async function forwardToBackupInbox(
  supabase: ReturnType<typeof createClient>,
  message: StoredMessage,
): Promise<void> {
  if (!resend) throw new Error("Resend is not configured");

  const metadataText = [
    "Forwarded message",
    `From: ${message.from_address}`,
    `To: ${message.to_addresses.join(", ") || "None"}`,
    `Cc: ${message.cc_addresses.join(", ") || "None"}`,
    `Bcc: ${message.bcc_addresses.join(", ") || "None"}`,
    `Subject: ${message.subject}`,
    "",
  ].join("\n");
  const forwardedText = `${metadataText}\n${message.text_body}`.trim();
  const forwardedHtml = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">
      <p><strong>Forwarded message</strong></p>
      <p><strong>From:</strong> ${escapeHtml(message.from_address)}</p>
      <p><strong>To:</strong> ${escapeHtml(message.to_addresses.join(", ") || "None")}</p>
      <p><strong>Cc:</strong> ${escapeHtml(message.cc_addresses.join(", ") || "None")}</p>
      <p><strong>Bcc:</strong> ${escapeHtml(message.bcc_addresses.join(", ") || "None")}</p>
      <p><strong>Subject:</strong> ${escapeHtml(message.subject)}</p>
      <hr>
      <pre style="white-space: pre-wrap; font: inherit;">${escapeHtml(message.text_body)}</pre>
    </div>
  `;

  const { error } = await resend.emails.receiving.forward({
    emailId: message.provider_id,
    to: FORWARD_TO_EMAIL,
    from: FORWARD_FROM_EMAIL,
    passthrough: false,
    text: forwardedText,
    html: forwardedHtml,
  });

  if (error) {
    await supabase
      .from("mail_messages")
      .update({
        backup_forward_status: "failed",
        error_message: `Backup forwarding failed: ${error.message}`.slice(
          0,
          500,
        ),
      })
      .eq("id", message.id);
    throw new Error("backup forwarding failed");
  }

  await supabase
    .from("mail_messages")
    .update({
      backup_forward_status: "sent",
      backup_forwarded_at: new Date().toISOString(),
    })
    .eq("id", message.id);
}

async function main(req: Request): Promise<Response> {
  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405 });
  if (
    !resend ||
    !RESEND_WEBHOOK_SECRET ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error("forward-inbound is missing a required server secret");
    return new Response("Server not configured", { status: 500 });
  }

  const payload = await req.text();
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature)
    return new Response("Missing webhook headers", { status: 400 });

  let event: ReceivedEmailEvent | { type: string; data: { email_id: string } };
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: RESEND_WEBHOOK_SECRET,
    }) as ReceivedEmailEvent;
  } catch (error) {
    console.error("Invalid webhook signature:", error);
    return new Response("Invalid webhook", { status: 400 });
  }

  if (event.type !== "email.received")
    return jsonResponse({ ok: true, ignored: true });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const duplicate = await existingMessage(supabase, event.data.email_id);
    const message =
      duplicate ??
      (await storeInboundMessage(
        supabase,
        event,
        await fetchReceivedEmail(event.data.email_id),
      ));

    if (message.backup_forward_status !== "sent") {
      await forwardToBackupInbox(supabase, message);
    }

    return jsonResponse({
      ok: true,
      duplicate: Boolean(duplicate),
      message_id: message.id,
      thread_id: message.thread_id,
      backup_forwarded: true,
    });
  } catch (error) {
    console.error("Inbound mail processing failed:", error);
    return new Response("Failed to process inbound email", { status: 500 });
  }
}

Deno.serve(main);
