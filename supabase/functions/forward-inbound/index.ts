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

  let event: { type: string; data: { email_id: string } };
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
    const { data, error } = await resend.emails.receiving.forward({
      emailId: event.data.email_id,
      to: FORWARD_TO_EMAIL,
      from: FORWARD_FROM_EMAIL,
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
