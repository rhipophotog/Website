import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn, supabaseIsRunning } from "./helpers";

/** Contacts journeys. Skipped when local Supabase isn't running (see helpers.ts). */

test.describe("contacts", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    test.skip(!(await supabaseIsRunning()), "Local Supabase isn't running (npx supabase start)");
  });

  test("quick-add a contact, then adding them again updates the same record", async ({ page }) => {
    await signIn(page, "owner@rhipo.test");
    const email = `quick.${Date.now()}@example.com`;

    await page.goto("/contacts/new");
    await page.getByLabel("First name").fill("Kavya");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone").fill("(415) 555-0142");
    await page.getByLabel("Tags").fill("VIP");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Kavya" })).toBeVisible();
    await expect(page.getByText("(415) 555-0142")).toBeVisible();
    await expect(page.getByText("Not recorded, no texts")).toBeVisible();
    const firstUrl = page.url();

    await page.goto("/contacts/new");
    await page.getByLabel("First name").fill("Kavya");
    await page.getByLabel("Email").fill(email.toUpperCase());
    await page.getByLabel("Partner's name").fill("Arjun");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("already in your contacts")).toBeVisible();
    expect(page.url().split("?")[0]).toBe(firstUrl.split("?")[0]);

    await page.getByLabel("Note").fill("Prefers WhatsApp for quick questions");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Prefers WhatsApp for quick questions")).toBeVisible();
  });

  test("import a GoHighLevel opportunities export", async ({ page }) => {
    await signIn(page, "owner@rhipo.test");
    await page.goto("/contacts/import");
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures/ghl-opportunities-sample.csv"));
    await expect(page.getByText("Looks like a GoHighLevel export")).toBeVisible();
    await expect(page.getByLabel("Stage for Booked")).toHaveValue("booked");
    await expect(page.getByLabel("Stage for Closed Lost")).toHaveValue("lost");

    await page.getByRole("button", { name: /Check 5 rows/ }).click();
    await expect(page.getByText("Will be skipped")).toBeVisible();
    await page.getByRole("button", { name: "Import now" }).click();
    await expect(page.getByRole("link", { name: "View contacts" })).toBeVisible({ timeout: 30_000 });

    await page.goto("/contacts?q=e2e");
    await expect(page.getByRole("link", { name: /Priya Sharma/ })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Anika Rao/ })).toBeVisible();
  });
});
