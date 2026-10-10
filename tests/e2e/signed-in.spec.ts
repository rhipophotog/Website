import { expect, test, type Page } from "@playwright/test";

/**
 * Signs in for real with a magic link: requests it on /login, then reads it from
 * Mailpit (Supabase's local mail catcher). Needs `npx supabase start` + `npx supabase db reset`
 * (which seeds the owner@rhipo.test and team@rhipo.test invites). Skipped when Supabase isn't running.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function supabaseIsRunning() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function latestMagicLink(email: string, after: number): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages = [] } = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const fresh = messages.find((m) => Date.parse(m.Created) >= after - 1000);
    if (fresh) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`)).json()) as { Text: string };
      const link = message.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link email for ${email}`);
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  const requestedAt = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await page.goto(await latestMagicLink(email, requestedAt));
  await expect(page).toHaveURL(/\/$/);
}

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
