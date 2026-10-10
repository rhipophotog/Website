import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  test("the dashboard sends you to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "RHIPO Studio" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  });

  for (const path of ["/inbox", "/pipeline", "/contacts", "/calendar", "/settings"]) {
    test(`${path} requires sign-in and comes back after`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    });
  }

  test("an expired link shows a clear error", async ({ page }) => {
    await page.goto("/auth/callback?code=bogus");
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(page.getByText("That sign-in link has expired")).toBeVisible();
  });

  test("Google sign-in stays hidden until it's configured", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  });

  test("the app can be installed: manifest and icons are public", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect(await manifest.json()).toMatchObject({ name: "RHIPO Studio", display: "standalone" });

    const icon = await request.get("/pwa-icon/192");
    expect(icon.headers()["content-type"]).toBe("image/png");
    expect((await request.get("/pwa-icon/13")).status()).toBe(404);
  });
});
