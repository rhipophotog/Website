import { expect, type Page } from "@playwright/test";

/**
 * Real sign-in for e2e tests: requests a magic link on /login, then reads it from
 * Mailpit (Supabase's local mail catcher). Needs `npx supabase start` + `npx supabase db reset`.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function supabaseIsRunning() {
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

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  const requestedAt = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await page.goto(await latestMagicLink(email, requestedAt));
  await expect(page).toHaveURL(/\/$/);
}

