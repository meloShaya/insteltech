import {
  asAddressList,
  assertEmailAddresses,
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
