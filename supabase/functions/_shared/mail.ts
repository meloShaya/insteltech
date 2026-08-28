export const MAIL_DISPLAY_NAME = "Instel Tech";
export const MAIL_ATTACHMENTS_BUCKET = "mail-attachments";
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const MAIL_ATTACHMENT_CONTENT_TYPES: Readonly<Record<string, string>> =
  Object.freeze({
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AddressInput = string | string[] | null | undefined;

export type MailAttachmentInput = {
  path: string;
  filename: string;
  content_type?: string;
  byte_size?: number;
};

export type ResendAttachment = {
  filename: string;
  content: string;
  content_type?: string;
};

export type ResendPayloadInput = {
  from: string;
  replyTo?: string | null;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: ResendAttachment[];
};

export type ResendPayload = {
  from: string;
  reply_to?: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  headers?: Record<string, string>;
  attachments?: ResendAttachment[];
};

export function buildResendPayload(input: ResendPayloadInput): ResendPayload {
  const attachments = input.attachments ?? [];
  const headers = {
    ...(input.inReplyTo ? { "In-Reply-To": input.inReplyTo } : {}),
    ...(input.references ? { References: input.references } : {}),
  };

  return {
    from: input.from,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    ...(input.cc && input.cc.length > 0 ? { cc: input.cc } : {}),
    ...(input.bcc && input.bcc.length > 0 ? { bcc: input.bcc } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

export function formatMailSender(email: string): string {
  const address = email.trim();
  assertEmailAddresses([address], "sender");
  return `${MAIL_DISPLAY_NAME} <${address}>`;
}

export function attachmentContentType(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return MAIL_ATTACHMENT_CONTENT_TYPES[extension] ?? null;
}

export function asAddressList(value: AddressInput): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function assertEmailAddresses(addresses: string[], label: string): void {
  if (addresses.length === 0) {
    throw new Error(`${label} must contain at least one email address`);
  }

  const invalid = addresses.find((address) => !EMAIL_PATTERN.test(address));
  if (invalid) {
    throw new Error(`Invalid ${label} email address: ${invalid}`);
  }
}

export function assertOptionalEmailAddresses(
  addresses: string[],
  label: string,
): void {
  if (addresses.length === 0) return;
  const invalid = addresses.find((address) => !EMAIL_PATTERN.test(address));
  if (invalid) {
    throw new Error(`Invalid ${label} email address: ${invalid}`);
  }
}

export function headerValue(
  headers: Record<string, string> | null | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === wanted,
  );
  return entry?.[1]?.trim() || null;
}

export function normalizeSubject(subject: string | null | undefined): string {
  const value = (subject ?? "").trim() || "(no subject)";
  return value
    .replace(/^(re:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function safeFilename(
  filename: string | null | undefined,
  fallback = "attachment.bin",
) {
  const value = (filename ?? "").trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return value || fallback;
}

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}
