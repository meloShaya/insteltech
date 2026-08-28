#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "Instel Tech <marketing@insteltech.co.zw>";
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_CONTENT_TYPES = Object.freeze({
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".rtf": "application/rtf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
});

const USAGE = `Usage:
  RESEND_API_KEY=... node scripts/send-client-email.mjs \
    --to client@example.com \
    --subject "Your InstelTech document" \
    --message $'Dear Team,\n\nPlease find your document attached.' \
    --attachment ./path/to/document.pdf

Options:
  --to         Recipient email address. Comma-separated addresses are supported.
  --attachment Path to a file to attach. Repeat for multiple files.
  --pdf        Backward-compatible alias for --attachment.
  --subject    Email subject.
  --message    Plain-text email body.
  --reply-to   Optional reply-to email address.
  --dry-run    Validate the inputs without sending an email.
  --help       Show this help text.

Attachments may be PDF, Word, Excel, CSV, text, RTF, PowerPoint, OpenDocument,
JPG, JPEG, or PNG files. The combined attachment limit is 25 MB.
`;

function fail(message) {
  throw new Error(`${message}\n\n${USAGE}`);
}

function attachmentContentType(filename) {
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return ATTACHMENT_CONTENT_TYPES[extension] || null;
}

function startsWithBytes(bytes, prefix) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function validateAttachmentBytes(filename, bytes) {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  if (
    extension === ".pdf" &&
    bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    fail(`${filename} is not a valid PDF`);
  }

  if (
    [".doc", ".xls", ".ppt"].includes(extension) &&
    !startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    fail(`${filename} is not a valid legacy Office document`);
  }

  if (
    [".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"].includes(extension) &&
    !startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])
  ) {
    fail(`${filename} is not a valid Office document`);
  }
}

function parseArgs(args) {
  const options = { dryRun: false, attachments: [] };
  const optionNames = new Map([
    ["to", "to"],
    ["attachment", "attachment"],
    ["pdf", "attachment"],
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

    if (key === "attachment") {
      options.attachments.push(value);
    } else {
      options[key] = value;
    }
  }

  for (const required of ["to", "subject", "message"]) {
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

async function loadAttachments(paths) {
  if (paths.length > MAX_ATTACHMENTS) {
    fail(`At most ${MAX_ATTACHMENTS} attachments are allowed`);
  }

  let totalBytes = 0;
  const attachments = [];

  for (const pathValue of paths) {
    const filePath = resolve(pathValue);
    const filename = basename(filePath);
    const contentType = attachmentContentType(filename);
    if (!contentType) {
      fail(`Unsupported attachment format: ${filename}`);
    }

    const bytes = await readFile(filePath);
    validateAttachmentBytes(filename, bytes);
    totalBytes += bytes.length;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      fail("Combined attachments exceed the 25 MB limit");
    }

    attachments.push({
      filename,
      content: bytes.toString("base64"),
      content_type: contentType,
      byte_size: bytes.length,
    });
  }

  return attachments;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const recipients = parseRecipients(options.to);

  if (options.replyTo) {
    validateEmailAddress(options.replyTo, "--reply-to");
  }

  const attachments = await loadAttachments(options.attachments);
  const payload = {
    from: FROM,
    to: recipients,
    subject: options.subject,
    text: options.message,
  };

  if (options.replyTo) {
    payload.reply_to = options.replyTo;
  }
  if (attachments.length > 0) {
    payload.attachments = attachments.map(
      ({ filename, content, content_type }) => ({
        filename,
        content,
        content_type,
      }),
    );
  }

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          from: payload.from,
          to: payload.to,
          subject: payload.subject,
          attachments: attachments.map(({ filename, byte_size }) => ({
            filename,
            bytes: byte_size,
          })),
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
    throw new Error(`Resend rejected email (${response.status}): ${details}`);
  }

  console.log(
    `Email sent to ${recipients.join(", ")}. Resend id: ${responseBody?.id ?? "unknown"}`,
  );
}

main().catch((error) => {
  console.error(`Unable to send email: ${error.message}`);
  process.exitCode = 1;
});
