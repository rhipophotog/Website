import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { supabaseIsRunning } from "./helpers";

test.describe("public inquiry form", () => {
  test("is public, embeddable, and the app itself isn't", async ({ request }) => {
    const form = await request.get("/f/inquiry", { maxRedirects: 0 });
    expect(form.status()).toBe(200);
    expect(form.headers()["content-security-policy"]).toBe("frame-ancestors *");

    const login = await request.get("/login");
    expect(login.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");

    const embed = await request.get("/embed.js");
    expect(embed.status()).toBe(200);
    expect(await embed.text()).toContain("rhipo-form-height");
  });

  test("submits a real inquiry end to end", async ({ page }) => {
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY || !(await supabaseIsRunning()), "Needs local Supabase + SUPABASE_SERVICE_ROLE_KEY");
    await page.goto("/f/inquiry");
    await page.getByLabel("Your first name *").fill("E2E");
    await page.getByLabel("Email *").fill(`inquiry.${Date.now()}@example.com`);
    await page.getByLabel("Phone").fill("(415) 555-0199");
    await page.getByLabel("Wedding date").fill("2027-06-14");
    await page.getByLabel("Photography").check();
    await page.getByRole("checkbox", { name: /may text me/ }).check();
    // Cloudflare's test site key passes automatically.
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("We've got your inquiry")).toBeVisible();
  });
});

test.describe("lead webhooks reject anything unauthenticated", () => {
  test("Meta: subscription check needs the verify token", async ({ request }) => {
    const ok = await request.get("/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=e2e-verify-token&hub.challenge=12345");
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await request.get("/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345");
    expect(bad.status()).toBe(403);
  });

  test("Meta: POSTs need a valid signature", async ({ request }) => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const unsigned = await request.post("/api/webhooks/meta", { data: body, headers: { "content-type": "application/json" } });
    expect(unsigned.status()).toBe(401);
    const forged = await request.post("/api/webhooks/meta", {
      data: body,
      headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", "wrong").update(body).digest("hex")}` },
    });
    expect(forged.status()).toBe(401);
    const signed = await request.post("/api/webhooks/meta", {
      data: body,
      headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", "e2e-meta-secret").update(body).digest("hex")}` },
    });
    expect(signed.status()).toBe(200);
    expect(await signed.json()).toEqual({ ok: true, leads: 0 });
  });

  test("Google Ads: needs the shared key", async ({ request }) => {
    const lead = { lead_id: "e2e-1", user_column_data: [{ column_id: "EMAIL", string_value: "g@example.com" }] };
    expect((await request.post("/api/webhooks/google-ads", { data: lead })).status()).toBe(401);
    expect((await request.post("/api/webhooks/google-ads", { data: { ...lead, google_key: "wrong" } })).status()).toBe(401);
    expect((await request.post("/api/webhooks/google-ads", { data: "not json" })).status()).toBe(400);
  });
});
