import { expect, test } from "@playwright/test";
import { signIn, supabaseIsRunning } from "./helpers";

/** Pipeline journeys. Skipped when local Supabase isn't running (see helpers.ts). */

test.describe("pipeline", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    test.skip(!(await supabaseIsRunning()), "Local Supabase isn't running (npx supabase start)");
  });

  test("add a couple, move them with the menu, mark lost with a reason", async ({ page }) => {
    await signIn(page, "owner@rhipo.test");
    const name = `Board ${Date.now()}`;

    await page.goto("/contacts/new");
    await page.getByLabel("First name").fill(name);
    await page.getByLabel("Email").fill(`${Date.now()}@board.example.com`);
    await page.getByLabel("Wedding date").fill("2027-06-14");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    await page.goto("/pipeline");
    const newColumn = page.getByRole("region", { name: "New inquiry" });
    await expect(newColumn.getByRole("link", { name })).toBeVisible();

    await page.getByLabel(`Move ${name} to`).selectOption("consult_scheduled");
    await expect(page.getByRole("region", { name: "Consult scheduled" }).getByRole("link", { name })).toBeVisible();

    await page.getByLabel(`Move ${name} to`).selectOption("lost");
    await expect(page.getByRole("dialog")).toContainText(`Why was ${name} lost?`);
    await page.getByLabel("Price").check();
    await page.getByRole("button", { name: "Mark lost" }).click();

    await page.reload();
    await page.getByRole("button", { name: /Show/ }).click();
    await expect(page.getByRole("region", { name: "Lost" }).getByRole("link", { name })).toBeVisible();

    await page.getByRole("region", { name: "Lost" }).getByRole("link", { name }).click();
    await expect(page.getByLabel("Why was it lost?")).toHaveValue("price");
    await expect(page.getByLabel("Event 1 date")).toHaveValue("2027-06-14");
  });
});
