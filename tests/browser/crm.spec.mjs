import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/crm/?demo=1");
  await expect(page.locator("#app")).toBeVisible();
});

test("campaign sequence editor preserves follow-ups and automatic daily settings", async ({
  page,
}) => {
  await page.goto("/crm/?demo=1#campaigns");
  await page.getByRole("button", { name: "＋ New campaign" }).click();
  await page.getByLabel("Campaign name").fill("Sequence fixture");
  await page.getByLabel("Subject line").fill("Hello {{first_name}}");
  await page
    .locator('#dialog [name="body"]')
    .fill("Thanks for connecting, {{first_name}}.");
  await page.locator("#dialog button[type=submit]").click();
  await page
    .locator('[data-action="campaign"]')
    .filter({ hasText: "Sequence fixture" })
    .click();
  await page.getByRole("button", { name: "Sequence & schedule" }).click();
  await page.getByRole("button", { name: "Add a follow-up" }).click();
  await page.getByLabel("Days after the previous email").fill("4");
  await page.getByLabel("Subject", { exact: true }).fill("One more thought");
  await page
    .getByLabel("Enable automatic daily sending after activation")
    .check();
  await page.getByLabel("Maximum delivery attempts").fill("3");
  await page
    .getByRole("button", { name: "Save sequence", exact: false })
    .click();
  await page
    .locator('[data-action="campaign"]')
    .filter({ hasText: "Sequence fixture" })
    .click();
  await page.getByRole("button", { name: "Sequence & schedule" }).click();
  await expect(page.getByLabel("Days after the previous email")).toHaveValue(
    "4",
  );
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "One more thought",
  );
  await expect(
    page.getByLabel("Enable automatic daily sending after activation"),
  ).toBeChecked();
  await expect(page.getByLabel("Maximum delivery attempts")).toHaveValue("3");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("automation desk configures Maps jobs and Codex research without making provider calls", async ({
  page,
}) => {
  await page.goto("/crm/?demo=1#workflows");
  await page.getByRole("button", { name: "Google Maps", exact: false }).click();
  await page
    .getByLabel("Business type and location")
    .fill("Dentists in Harare");
  await page
    .getByRole("button", { name: "Queue operation", exact: false })
    .click();
  await expect(page.locator("#dialog")).toContainText("Search Google Maps");
  await page.locator('#dialog [data-action="automation-run-detail"]').click();
  await expect(page.locator("#dialog")).toContainText("0 attempt(s)");
  await page.getByRole("button", { name: "Run next step now" }).click();
  await expect(page.locator("#toast")).toContainText(
    "Demo mode never calls paid APIs",
  );
  await page.locator("#close-dialog").click();
  await page.goto("/crm/?demo=1#settings");
  await page.getByRole("button", { name: "Codex settings" }).click();
  await page.getByLabel("Enable Codex sub-agents").check();
  await page
    .getByLabel("Sub-agent model", { exact: false })
    .fill("gpt-5.6-luna");
  await page
    .getByRole("button", { name: "Save changes", exact: false })
    .click();
  await page.getByRole("button", { name: "Codex settings" }).click();
  await expect(page.getByLabel("Enable Codex sub-agents")).toBeChecked();
  await expect(
    page.getByLabel("Sub-agent model", { exact: false }),
  ).toHaveValue("gpt-5.6-luna");
});
test("desktop overview, every route, and mobile layout render without script errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator("#content h1")).toContainText("connection");
  await page.screenshot({
    path: "artifacts/crm-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const route of [
    "contacts",
    "companies",
    "pipeline",
    "campaigns",
    "inbox",
    "workflows",
    "reports",
    "settings",
  ]) {
    await page.locator(`#main-nav a[href="#${route}"]`).click();
    await expect(page.locator("#breadcrumb")).toHaveText(
      route[0].toUpperCase() + route.slice(1),
    );
    await expect(page.locator("#content h1")).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crm/?demo=1#overview");
  await expect(page.locator("#breadcrumb")).toHaveText("Overview");
  await page.screenshot({
    path: "artifacts/crm-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.locator("#menu").click();
  await page.locator('#main-nav a[href="#contacts"]').click();
  await expect(page.locator("#content h1")).toContainText("Your people");
  expect(errors).toEqual([]);
});
test("contact creation, stage update, search, and XSS-safe notes survive navigation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "＋ Add contact", exact: true })
    .click();
  await page.locator("[name=first_name]").fill("Ada");
  await page.locator("[name=last_name]").fill("Tester");
  await page.locator("#dialog [name=email]").fill("ada@example.com");
  await page
    .locator("[name=company]")
    .fill('<script>throw new Error("xss")</script>');
  await page.locator("[name=stage]").selectOption("proposal");
  await page.locator("[name=value]").fill("1200");
  await page.locator("#dialog button[type=submit]").click();
  await expect(page.locator("#dialog")).not.toBeVisible();
  await page.locator('#main-nav a[href="#contacts"]').click();
  await page.locator("#table-search").fill("ada@example.com");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Proposal");
  await expect(page.locator("tbody")).toContainText("<script>");
  await page
    .locator("[data-action=contact]")
    .filter({ hasText: "Ada Tester" })
    .click();
  await page.locator("[name=body]").fill("A follow-up worth remembering.");
  await page.locator("#dialog button[type=submit]").click();
  await expect(page.locator("#dialog")).toContainText(
    "A follow-up worth remembering.",
  );
});
test("CSV import previews duplicates and invalid rows without importing claimed permission", async ({
  page,
}) => {
  await page.locator('#main-nav a[href="#contacts"]').click();
  await page.getByRole("button", { name: "↑ Import CSV" }).click();
  await page.locator("[type=file]").setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'email,first_name,company,consent\nnew@example.com,New,"A, B",true\nnew@example.com,Duplicate,B,true\ninvalid,Bad,C,true',
    ),
  });
  await page.locator("#dialog button[type=submit]").click();
  await expect(page.locator("#dialog-title")).toHaveText("Review your import");
  await page.locator("#dialog button[type=submit]").click();
  await page.locator("#table-search").fill("new@example.com");
  await expect(page.locator("#content tbody tr")).toHaveCount(1);
  await expect(page.locator("#content tbody")).toContainText("Not recorded");
});
test("campaign drafts and AI jobs are reviewable while demo cannot send", async ({
  page,
}) => {
  await page.locator('#main-nav a[href="#campaigns"]').click();
  await page.getByRole("button", { name: "＋ New campaign" }).click();
  await page.locator("[name=name]").fill("A useful introduction");
  await page.locator("[name=subject]").fill("Hi {{first_name}}");
  await page
    .locator("[name=body]")
    .fill("Hello {{first_name}}, thank you for connecting.");
  await page.locator("#dialog button[type=submit]").click();
  await expect(page.locator("tbody")).toContainText("A useful introduction");
  await page
    .locator('[data-action="campaign"]')
    .filter({ hasText: "A useful introduction" })
    .click();
  await expect(page.locator("#dialog .badge").first()).toHaveText("draft");
  await page.getByRole("button", { name: "Choose audience" }).click();
  await page.locator("#dialog button[type=submit]").click();
  await page.getByRole("button", { name: "Review & activate" }).click();
  await page.locator("#dialog input[type=checkbox]").check();
  await page.locator("#dialog button[type=submit]").click();
  await page.getByRole("button", { name: "Send next batch · up to 5" }).click();
  await expect(page.locator("#toast")).toContainText(
    "Demo mode never sends mail",
  );
  await page.locator("#close-dialog").click();
  await page.locator('#main-nav a[href="#workflows"]').click();
  await page
    .locator("[data-action=run-workflow][data-id=campaign-strategy]")
    .click();
  await page
    .locator("[name=brief]")
    .fill("Plan a focused campaign for our existing customers.");
  await page.locator("#dialog button[type=submit]").click();
  await expect(page.locator("#dialog-title")).toHaveText("Your workflow queue");
  await expect(page.locator("#dialog")).toContainText("queued");
});
