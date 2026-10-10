import { expect, test } from "@playwright/test";
import { supabaseIsRunning } from "./helpers";

test.describe("public booking", () => {
  test("the booking pages are public and indexable-safe", async ({ request }) => {
    const index = await request.get("/book", { maxRedirects: 0 });
    expect(index.status()).toBe(200);
    const manage = await request.get("/book/manage/not-a-token", { maxRedirects: 0 });
    expect(manage.status()).toBe(200);
  });

  test("a bad manage link explains itself instead of erroring", async ({ page }) => {
    await page.goto("/book/manage/11111111-2222-4333-8444-555555555555.forged");
    await expect(page.getByText("This link isn't valid")).toBeVisible();
  });

  test("an unknown appointment type is a 404", async ({ request }) => {
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY || !(await supabaseIsRunning()), "Needs local Supabase + SUPABASE_SERVICE_ROLE_KEY");
    expect((await request.get("/book/no-such-type")).status()).toBe(404);
  });

  test("Google connect needs sign-in", async ({ request }) => {
    const res = await request.get("/api/google/connect", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login");
  });
});
