import {
  asAddressList,
  attachmentContentType,
  assertEmailAddresses,
  buildResendPayload,
  formatMailSender,
  normalizeSubject,
  safeFilename,
  stripHtml,
} from "./mail.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("normalizes comma-separated address input", () => {
  assertEqual(
    asAddressList("one@example.com, two@example.com"),
    ["one@example.com", "two@example.com"],
    "address list",
  );
});

Deno.test("normalizes reply prefixes for thread matching", () => {
  assertEqual(
    normalizeSubject(" Re: RE: Project update "),
    "project update",
    "subject",
  );
});

Deno.test("converts basic HTML into safe plain text", () => {
  assertEqual(
    stripHtml("<p>Hello</p><p>World &amp; team</p>"),
    "Hello\n\nWorld & team",
    "HTML text",
  );
});

Deno.test("sanitizes attachment filenames", () => {
  assertEqual(
    safeFilename("client quote (final).pdf"),
    "client_quote__final_.pdf",
    "filename",
  );
});

Deno.test("rejects malformed email addresses", () => {
  let rejected = false;
  try {
    assertEmailAddresses(["not-an-email"], "to");
  } catch {
    rejected = true;
  }
  assert(rejected, "invalid address should be rejected");
});

Deno.test("omits attachments when no files are supplied", () => {
  const payload = buildResendPayload({
    from: "Instel Tech <alex@insteltech.co.zw>",
    to: ["client@example.com"],
    subject: "No attachment",
    text: "Hello",
    attachments: [],
  });
  assert(!("attachments" in payload), "empty attachments must be omitted");
});

Deno.test("keeps supported attachments in the Resend payload", () => {
  const payload = buildResendPayload({
    from: "Instel Tech <alex@insteltech.co.zw>",
    to: ["client@example.com"],
    subject: "Office document",
    text: "Please review the attached document.",
    attachments: [
      {
        filename: "quotation.docx",
        content: "UEsDBA==",
        content_type: attachmentContentType("quotation.docx") || undefined,
      },
    ],
  });
  assert(payload.attachments?.length === 1, "attachment should be preserved");
  assert(
    attachmentContentType("spreadsheet.xlsx") ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx content type",
  );
  assert(attachmentContentType("unknown.exe") === null, "unknown type");
});

Deno.test("builds a user-specific sender and reply-to header", () => {
  const sender = formatMailSender("alex@insteltech.co.zw");
  const payload = buildResendPayload({
    from: sender,
    replyTo: "alex@insteltech.co.zw",
    to: ["client@example.com"],
    subject: "User sender",
    text: "Hello",
  });

  assertEqual(sender, "Instel Tech <alex@insteltech.co.zw>", "sender");
  assertEqual(payload.from, sender, "from header");
  assertEqual(payload.reply_to, "alex@insteltech.co.zw", "reply-to header");
});
