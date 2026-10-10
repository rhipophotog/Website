import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  test("the dashboard sends you to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "RHIPO Studio" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  });

  for (const path of ["/inbox", "/pipeline", "/contacts", "/contacts/new", "/contacts/import", "/pipeline/new", "/settings/pipeline", "/settings/studio", "/settings/templates", "/settings/leads", "/calendar", "/settings"]) {
    test(`${path} requires sign-in and comes back after`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    });
  }

  test("search engines are kept out of everything but the inquiry form", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const text = await robots.text();
    expect(text).toContain("Allow: /f/");
    expect(text).toContain("Disallow: /");
  });

  test("contact exports need sign-in", async ({ request }) => {
    const res = await request.get("/contacts/export", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login");
  });

  test("an expired link shows a clear error", async ({ page }) => {
    await page.goto("/auth/callback?code=bogus");
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(page.getByText("That sign-in link has expired")).toBeVisible();
  });

  test("a used-up link that lands on any page explains what happened", async ({ page }) => {
    await page.goto("/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
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
    expect(await manifest.json()).toMatchObject({ name: "RHIPO Studio", display: "standalone", theme_color: "#1570EF" });

    for (const path of ["/brand/icon-192.png", "/brand/icon-512.png", "/brand/icon-maskable-512.png", "/apple-icon.png", "/icon.png"]) {
      const icon = await request.get(path);
      expect(icon.headers()["content-type"], path).toBe("image/png");
    }
  });
});
