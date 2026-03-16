import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET");

const FORWARD_TO_EMAIL =
  Deno.env.get("FORWARD_TO_EMAIL") ?? "meloshaya02@gmail.com";
const FORWARD_FROM_EMAIL =
  Deno.env.get("FORWARD_FROM_EMAIL") ?? "forwarder@insteltech.co.zw";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!resend || !RESEND_WEBHOOK_SECRET) {
    return new Response("Server not configured", { status: 500 });
  }

  const payload = await req.text();
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return new Response("Missing webhook headers", { status: 400 });
  }

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

  let event: ReceivedEmailEvent | { type: string; data: { email_id: string } };
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: RESEND_WEBHOOK_SECRET,
    }) as { type: string; data: { email_id: string } };
  } catch (error) {
    console.error("Invalid webhook signature:", error);
    return new Response("Invalid webhook", { status: 400 });
  }

  if (event.type !== "email.received") {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const safeJoin = (items?: string[]) =>
      items && items.length > 0 ? items.join(", ") : "None";

    const forwardedText = [
      "Forwarded message",
      `From: ${event.data.from ?? "Unknown sender"}`,
      `To: ${safeJoin(event.data.to)}`,
      `Cc: ${safeJoin(event.data.cc)}`,
      `Bcc: ${safeJoin(event.data.bcc)}`,
      `Date: ${event.data.created_at ?? "Unknown date"}`,
      `Subject: ${event.data.subject ?? "(no subject)"}`,
      "",
    ].join("\n");

    const forwardedHtml = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">
        <p style="margin: 0 0 8px;"><strong>Forwarded message</strong></p>
        <p style="margin: 0;"><strong>From:</strong> ${event.data.from ?? "Unknown sender"}</p>
        <p style="margin: 0;"><strong>To:</strong> ${safeJoin(event.data.to)}</p>
        <p style="margin: 0;"><strong>Cc:</strong> ${safeJoin(event.data.cc)}</p>
        <p style="margin: 0;"><strong>Bcc:</strong> ${safeJoin(event.data.bcc)}</p>
        <p style="margin: 0;"><strong>Date:</strong> ${event.data.created_at ?? "Unknown date"}</p>
        <p style="margin: 0 0 12px;"><strong>Subject:</strong> ${event.data.subject ?? "(no subject)"}</p>
      </div>
    `;

    const { data, error } = await resend.emails.receiving.forward({
      emailId: event.data.email_id,
      to: FORWARD_TO_EMAIL,
      from: FORWARD_FROM_EMAIL,
      passthrough: false,
      text: forwardedText,
      html: forwardedHtml,
    });

    if (error) {
      console.error("Forward error:", error);
      return new Response("Failed to forward email", { status: 500 });
    }

    return Response.json({ ok: true, data });
  } catch (error) {
    console.error("Forward exception:", error);
    return new Response("Failed to forward email", { status: 500 });
  }
});
