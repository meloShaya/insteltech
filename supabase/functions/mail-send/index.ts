import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assertEmailAddresses,
  assertOptionalEmailAddresses,
  attachmentContentType,
  bytesToBase64,
  buildResendPayload,
  formatMailSender,
  MAIL_ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  normalizeSubject,
  safeFilename,
  type MailAttachmentInput,
} from "../_shared/mail.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000;
const ALLOWED_ORIGINS = new Set([
  "https://insteltech.co.zw",
  "https://www.insteltech.co.zw",
  "http://localhost:8000",
  "http://localhost:8080",
]);

type SendRequest = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  thread_id?: string;
  client_send_id?: string;
  in_reply_to?: string;
  references?: string;
  attachments?: MailAttachmentInput[];
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://insteltech.co.zw",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function assertRecipientsLimit(addresses: string[], label: string): void {
  if (addresses.length > MAX_RECIPIENTS) {
    throw new Error(`${label} may contain at most ${MAX_RECIPIENTS} addresses`);
  }
}

function startsWithBytes(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function validateAttachmentBytes(filename: string, bytes: Uint8Array): void {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  if (
    extension === ".pdf" &&
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new Error(`${filename} is not a valid PDF`);
  }

  if (
    [".doc", ".xls", ".ppt"].includes(extension) &&
    !startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    throw new Error(`${filename} is not a valid legacy Office document`);
  }

  if (
    [".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"].includes(extension) &&
    !startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])
  ) {
    throw new Error(`${filename} is not a valid Office document`);
  }
}

function assertBody(request: SendRequest): {
  subject: string;
  text: string;
  html?: string;
} {
  const subject = asString(request.subject);
  const text = typeof request.text === "string" ? request.text.trim() : "";
  const html = typeof request.html === "string" ? request.html.trim() : "";

  if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `subject is required and must be ${MAX_SUBJECT_LENGTH} characters or fewer`,
    );
  }
  if (!text && !html) {
    throw new Error("text or html email content is required");
  }
  if (text.length > MAX_BODY_LENGTH || html.length > MAX_BODY_LENGTH) {
    throw new Error("email content is too large");
  }

  return { subject, text, ...(html ? { html } : {}) };
}

async function loadAttachments(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  inputs: MailAttachmentInput[] | undefined,
) {
  const attachments = inputs ?? [];
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`at most ${MAX_ATTACHMENTS} attachments are allowed`);
  }

  let totalBytes = 0;
  const loaded = [];

  for (const input of attachments) {
    if (
      !input ||
      typeof input.path !== "string" ||
      typeof input.filename !== "string"
    ) {
      throw new Error("each attachment needs a storage path and filename");
    }

    const expectedPrefix = `outgoing/${userId}/`;
    if (!input.path.startsWith(expectedPrefix) || input.path.includes("..")) {
      throw new Error("attachment path is outside the current user workspace");
    }

    const filename = safeFilename(input.filename, "attachment.pdf");
    const contentType = attachmentContentType(filename);
    if (!contentType) {
      throw new Error(`unsupported attachment format: ${filename}`);
    }

    const { data, error } = await supabase.storage
      .from(MAIL_ATTACHMENTS_BUCKET)
      .download(input.path);
    if (error || !data) {
      throw new Error(`could not read attachment ${filename}`);
    }

    const bytes = new Uint8Array(await data.arrayBuffer());
    validateAttachmentBytes(filename, bytes);
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `${filename} exceeds the ${MAX_ATTACHMENT_BYTES} byte attachment limit`,
      );
    }

    totalBytes += bytes.length;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `total attachments exceed the ${MAX_ATTACHMENT_BYTES} byte limit`,
      );
    }

    loaded.push({
      path: input.path,
      filename,
      content_type: contentType,
      byte_size: bytes.length,
      content: bytesToBase64(bytes),
    });
  }

  return loaded;
}

async function main(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const token = bearerToken(req);

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error("mail-send is missing a required server secret");
    return jsonResponse(req, { error: "Mail service is not configured" }, 500);
  }
  if (!token) {
    return jsonResponse(req, { error: "Authentication required" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse(req, { error: "Invalid authentication" }, 401);
  }

  const { data: member, error: memberError } = await supabase
    .from("mail_members")
    .select("user_id, role, active")
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (memberError || !member) {
    return jsonResponse(
      req,
      { error: "You are not authorized to send mail" },
      403,
    );
  }

  let request: SendRequest;
  try {
    request = await req.json();
  } catch {
    return jsonResponse(req, { error: "Request body must be valid JSON" }, 400);
  }

  try {
    const to = Array.isArray(request.to) ? request.to : [request.to];
    const cc =
      request.cc === undefined
        ? []
        : Array.isArray(request.cc)
          ? request.cc
          : [request.cc];
    const bcc =
      request.bcc === undefined
        ? []
        : Array.isArray(request.bcc)
          ? request.bcc
          : [request.bcc];
    assertEmailAddresses(to, "to");
    assertOptionalEmailAddresses(cc, "cc");
    assertOptionalEmailAddresses(bcc, "bcc");
    assertRecipientsLimit(to, "to");
    assertRecipientsLimit(cc, "cc");
    assertRecipientsLimit(bcc, "bcc");

    const { subject, text, html } = assertBody(request);
    const senderEmail = userData.user.email?.trim() || "";
    const sender = formatMailSender(senderEmail);
    const clientSendId = asString(request.client_send_id);
    if (!clientSendId || clientSendId.length > 100) {
      throw new Error(
        "client_send_id is required and must be 100 characters or fewer",
      );
    }

    const { data: existing } = await supabase
      .from("mail_messages")
      .select("id, thread_id, status, provider_id")
      .eq("client_send_id", clientSendId)
      .maybeSingle();
    if (existing) {
      if (existing.status === "sent") {
        return jsonResponse(req, {
          ok: true,
          duplicate: true,
          message_id: existing.id,
          thread_id: existing.thread_id,
          provider_id: existing.provider_id,
        });
      }
      return jsonResponse(
        req,
        {
          error:
            "This send request already exists; inspect its status before retrying",
          status: existing.status,
          message_id: existing.id,
        },
        409,
      );
    }

    const loadedAttachments = await loadAttachments(
      supabase,
      userData.user.id,
      request.attachments,
    );

    let threadId = asString(request.thread_id);
    if (threadId && !isUuid(threadId)) {
      throw new Error("thread_id must be a valid UUID");
    }
    if (threadId) {
      const { data: thread } = await supabase
        .from("mail_threads")
        .select("id")
        .eq("id", threadId)
        .maybeSingle();
      if (!thread) throw new Error("thread was not found");
    } else {
      const { data: thread, error: threadError } = await supabase
        .from("mail_threads")
        .insert({ subject, normalized_subject: normalizeSubject(subject) })
        .select("id")
        .single();
      if (threadError || !thread)
        throw new Error("could not create mail thread");
      threadId = thread.id;
    }

    const inReplyTo = asString(request.in_reply_to) || null;
    const references = asString(request.references) || null;
    const { data: message, error: messageError } = await supabase
      .from("mail_messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        client_send_id: clientSendId,
        from_address: senderEmail,
        to_addresses: to,
        cc_addresses: cc,
        bcc_addresses: bcc,
        subject,
        text_body: text,
        html_body: html || null,
        headers: { "Reply-To": senderEmail },
        in_reply_to: inReplyTo,
        references_header: references,
        status: "sending",
        created_by: userData.user.id,
        backup_forward_status: "not_configured",
      })
      .select("id")
      .single();
    if (messageError || !message)
      throw new Error("could not create outgoing mail record");

    if (loadedAttachments.length > 0) {
      const { error: attachmentError } = await supabase
        .from("mail_attachments")
        .insert(
          loadedAttachments.map((attachment) => ({
            message_id: message.id,
            storage_path: attachment.path,
            filename: attachment.filename,
            content_type: attachment.content_type,
            byte_size: attachment.byte_size,
          })),
        );
      if (attachmentError) {
        await supabase
          .from("mail_messages")
          .update({
            status: "failed",
            error_message: "could not record outgoing attachment",
          })
          .eq("id", message.id);
        throw new Error("could not record outgoing attachment");
      }
    }

    const resendPayload = buildResendPayload({
      from: sender,
      replyTo: senderEmail,
      to,
      subject,
      text,
      html,
      cc,
      bcc,
      inReplyTo,
      references,
      attachments: loadedAttachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        content_type: attachment.content_type,
      })),
    });

    let resendResponse: Response;
    try {
      resendResponse = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": clientSendId,
        },
        body: JSON.stringify(resendPayload),
      });
    } catch (error) {
      console.error("Resend network error:", error);
      await supabase
        .from("mail_messages")
        .update({
          status: "unknown",
          error_message:
            "Resend request outcome is unknown; check Resend before retrying",
        })
        .eq("id", message.id);
      return jsonResponse(
        req,
        {
          error: "The send outcome is unknown. Check Resend before retrying.",
          message_id: message.id,
        },
        504,
      );
    }

    const responseText = await resendResponse.text();
    let responseBody: Record<string, unknown> = {};
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { message: responseText };
    }

    if (!resendResponse.ok) {
      const errorMessage =
        typeof responseBody.message === "string"
          ? responseBody.message
          : "Resend rejected the email";
      await supabase
        .from("mail_messages")
        .update({
          status: "failed",
          error_message: errorMessage.slice(0, 500),
        })
        .eq("id", message.id);
      return jsonResponse(
        req,
        { error: errorMessage, message_id: message.id },
        502,
      );
    }

    const providerId =
      typeof responseBody.id === "string" ? responseBody.id : null;
    await supabase
      .from("mail_messages")
      .update({
        status: "sent",
        provider_id: providerId,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", message.id);
    await supabase
      .from("mail_threads")
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    return jsonResponse(req, {
      ok: true,
      message_id: message.id,
      thread_id: threadId,
      provider_id: providerId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid send request";
    return jsonResponse(req, { error: message }, 400);
  }
}

Deno.serve(main);
