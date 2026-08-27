#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "InstelTech Marketing <marketing@insteltech.co.zw>";

const USAGE = `Usage:
  RESEND_API_KEY=... node scripts/send-client-email.mjs \\
    --to client@example.com \\
    --pdf ./path/to/document.pdf \\
    --subject "Your InstelTech document" \\
    --message "Please find your document attached."

Options:
  --to       Recipient email address. Comma-separated addresses are supported.
  --pdf      Path to the PDF file to attach.
  --subject  Email subject.
  --message  Plain-text email body.
  --reply-to Optional reply-to email address.
  --dry-run  Validate the inputs without sending an email.
  --help     Show this help text.
`;

function fail(message) {
  throw new Error(`${message}\n\n${USAGE}`);
}

function parseArgs(args) {
  const options = { dryRun: false };
  const optionNames = new Map([
    ["to", "to"],
    ["pdf", "pdf"],
    ["subject", "subject"],
    ["message", "message"],
    ["reply-to", "replyTo"],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--help" || argument === "-h") {
      console.log(USAGE);
      process.exit(0);
    }

    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (!argument.startsWith("--")) {
      fail(`Unexpected argument: ${argument}`);
    }

    const equalsIndex = argument.indexOf("=");
    const option = argument.slice(
      2,
      equalsIndex === -1 ? undefined : equalsIndex,
    );
    const key = optionNames.get(option);

    if (!key) {
      fail(`Unknown option: --${option}`);
    }

    const value =
      equalsIndex === -1 ? args[++index] : argument.slice(equalsIndex + 1);
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${option}`);
    }

    options[key] = value;
  }

  for (const required of ["to", "pdf", "subject", "message"]) {
    if (!options[required]) {
      fail(`Missing required option: --${required}`);
    }
  }

  return options;
}

function parseRecipients(value) {
  const recipients = value
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    fail("At least one recipient is required");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidRecipient = recipients.find(
    (recipient) => !emailPattern.test(recipient),
  );
  if (invalidRecipient) {
    fail(`Invalid recipient email address: ${invalidRecipient}`);
  }

  return recipients;
}

function validateEmailAddress(value, optionName) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(value)) {
    fail(`Invalid ${optionName} email address: ${value}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const recipients = parseRecipients(options.to);

  if (options.replyTo) {
    validateEmailAddress(options.replyTo, "--reply-to");
  }

  const pdfPath = resolve(options.pdf);
  const pdf = await readFile(pdfPath);

  if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    fail(`The attachment does not look like a PDF: ${pdfPath}`);
  }

  const payload = {
    from: FROM,
    to: recipients,
    subject: options.subject,
    text: options.message,
    attachments: [
      {
        filename: basename(pdfPath),
        content: pdf.toString("base64"),
      },
    ],
  };

  if (options.replyTo) {
    payload.reply_to = options.replyTo;
  }

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          from: payload.from,
          to: payload.to,
          subject: payload.subject,
          attachment: {
            filename: payload.attachments[0].filename,
            bytes: pdf.length,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    fail("RESEND_API_KEY is not set");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = { message: responseText };
  }

  if (!response.ok) {
    const details = responseBody?.message || responseBody?.name || responseText;
    throw new Error(
      `Resend rejected the email (${response.status}): ${details}`,
    );
  }

  console.log(
    `Email sent to ${recipients.join(", ")}. Resend id: ${responseBody?.id ?? "unknown"}`,
  );
}

main().catch((error) => {
  console.error(`Unable to send email: ${error.message}`);
  process.exitCode = 1;
});
