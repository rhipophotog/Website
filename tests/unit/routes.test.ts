import { describe, expect, it } from "vitest";
import { isActive, isPublicPath, safeNextPath } from "@/lib/routes";

describe("isPublicPath", () => {
  it.each(["/login", "/auth/callback", "/book", "/book/discovery", "/book/manage/abc.def", "/f/inquiry", "/api/webhooks/twilio", "/manifest.webmanifest", "/brand/icon-192.png", "/apple-icon.png"])(
    "%s is public",
    (path) => expect(isPublicPath(path)).toBe(true),
  );

  it.each(["/", "/contacts", "/settings", "/loginx", "/inbox/123", "/api/contacts", "/booking"])("%s needs sign-in", (path) =>
    expect(isPublicPath(path)).toBe(false),
  );
});

describe("safeNextPath", () => {
  it("keeps in-app paths", () => {
    expect(safeNextPath("/contacts?tag=vip")).toBe("/contacts?tag=vip");
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null])("rejects %s", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });
});

describe("isActive", () => {
  it("matches the dashboard only exactly", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/contacts")).toBe(false);
  });

  it("matches nested pages", () => {
    expect(isActive("/contacts", "/contacts/abc")).toBe(true);
    expect(isActive("/contacts", "/contactsx")).toBe(false);
  });
});
