export const MAIL_FROM = "InstelTech Marketing <marketing@insteltech.co.zw>";
export const MAIL_FROM_ADDRESS = "marketing@insteltech.co.zw";
export const MAIL_ATTACHMENTS_BUCKET = "mail-attachments";
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AddressInput = string | string[] | null | undefined;

export type MailAttachmentInput = {
  path: string;
  filename: string;
  content_type?: string;
  byte_size?: number;
};

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
