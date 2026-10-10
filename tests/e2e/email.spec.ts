import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signIn, supabaseIsRunning } from "./helpers";

const SECRET = Buffer.from("e2e-resend-secret");
const sign = (id: string, ts: string, body: string) => createHmac("sha256", SECRET).update(`${id}.${ts}.${body}`).digest("base64");

test.describe("Resend webhook", () => {
  test("rejects unsigned, forged and stale requests", async ({ request }) => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_x" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const post = (headers: Record<string, string>) => request.post("/api/webhooks/resend", { data: body, headers: { "content-type": "application/json", ...headers } });

    expect((await post({})).status()).toBe(401);
    expect((await post({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": "v1,AAAA" })).status()).toBe(401);
    const old = String(Number(ts) - 3600);
    expect((await post({ "svix-id": "msg_1", "svix-timestamp": old, "svix-signature": `v1,${sign("msg_1", old, body)}` })).status()).toBe(401);
  });

  test("ignores signed events it doesn't handle", async ({ request }) => {
    const body = JSON.stringify({ type: "email.opened", data: { email_id: "re_x" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await request.post("/api/webhooks/resend", {
      data: body,
      headers: { "content-type": "application/json", "svix-id": "msg_2", "svix-timestamp": ts, "svix-signature": `v1,${sign("msg_2", ts, body)}` },
    });
    // 503 when the server key isn't configured (sandbox), otherwise the event is acknowledged.
    expect([200, 503]).toContain(res.status());
  });
});

test("an invalid unsubscribe link explains what to do", async ({ page }) => {
  await page.goto("/u/not-a-real-token");
  await expect(page.getByRole("heading", { name: "Email preferences" })).toBeVisible();
  await expect(page.getByText("This link isn't valid")).toBeVisible();
});

test.describe("emailing a contact", () => {
  test.beforeAll(async () => {
    test.skip(!(await supabaseIsRunning()), "Local Supabase isn't running (npx supabase start)");
  });

  test("send from a template; outside production it's saved as a test email", async ({ page }) => {
    await signIn(page, "owner@rhipo.test");
    await page.goto("/contacts/new");
    const email = `mail.${Date.now()}@example.com`;
    await page.getByLabel("First name").fill("Mailtest");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Add contact" }).click();

    await page.getByLabel("Template").selectOption("followup_day3");
    await expect(page.getByText("Preview with their details")).toBeVisible();
    await expect(page.getByLabel("Subject")).toHaveValue("A few weddings we think you'll love");
    await page.getByRole("button", { name: "Send email" }).click();
    await expect(page.getByText("Saved as a test email")).toBeVisible();
    await expect(page.getByText("Test (not sent)")).toBeVisible();

    await page.goto("/inbox");
    await expect(page.getByRole("link", { name: /Mailtest/ })).toBeVisible();
  });
});
