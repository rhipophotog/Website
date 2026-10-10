import { expect, test } from "@playwright/test";
import { signIn, supabaseIsRunning } from "./helpers";

/** Skipped when local Supabase isn't running (see helpers.ts). */

test.describe("signed in", () => {
  test.beforeAll(async () => {
    test.skip(!(await supabaseIsRunning()), "Local Supabase isn't running (npx supabase start)");
  });

  test("the owner can move between every section", async ({ page, isMobile }) => {
    await signIn(page, "owner@rhipo.test");
    const nav = isMobile ? page.getByRole("navigation", { name: "Tabs" }) : page.getByRole("navigation", { name: "Main" });

    for (const [label, path, heading] of [
      ["Inbox", "/inbox", "Inbox"],
      ["Pipeline", "/pipeline", "Pipeline"],
      ["Contacts", "/contacts", "Contacts"],
      ["Calendar", "/calendar", "Calendar"],
    ] as const) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }

    await expect(page.locator("[data-stage]")).toHaveCount(11);

    if (isMobile) await page.getByRole("link", { name: "Settings" }).click();
    else await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  });

  test("a team member doesn't get settings", async ({ page }) => {
    await signIn(page, "team@rhipo.test");
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByText("Settings are owner-only")).toBeVisible();
  });
});
