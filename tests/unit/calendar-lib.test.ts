import { beforeAll, describe, expect, it, vi } from "vitest";
import { bookingSchema } from "@/app/book/schema";
import { decrypt, encrypt } from "@/lib/calendar/crypto";
import { authUrl, emailFromIdToken, exchangeCode, googleCalendar, GOOGLE_SCOPES, revokeToken } from "@/lib/calendar/google";
import { buildIcs } from "@/lib/calendar/ics";
import { derivedSecret, signId, verifySignedId } from "@/lib/calendar/signing";

const ID = "11111111-2222-4333-8444-555555555555";
const creds = { clientId: "cid", clientSecret: "csecret", redirectUri: "https://crm.example/api/google/callback" };

describe("ics", () => {
  const ics = buildIcs({
    uid: `${ID}@rhipo`,
    start: new Date("2026-11-02T18:00:00Z"),
    end: new Date("2026-11-02T18:20:00Z"),
    summary: "Discovery call; RHIPO, with Asha",
    description: "Line one\nLine two — ".repeat(10),
    location: "https://zoom.us/j/123",
    organizerName: "RHIPO",
    organizerEmail: "hello@rhipo.example",
    now: new Date("2026-10-10T00:00:00Z"),
  });

  it("is CRLF, UTC and escaped", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(ics).toContain("DTSTART:20261102T180000Z\r\nDTEND:20261102T182000Z");
    expect(ics).toContain("SUMMARY:Discovery call\\; RHIPO\\, with Asha");
    expect(ics).toContain("METHOD:REQUEST");
  });

  it("folds long lines at 75 octets", () => {
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DESCRIPTION:Line one\\nLine two — Line one");
  });

  it("marks cancellations", () => {
    const cancel = buildIcs({ uid: "x", start: new Date(), end: new Date(), summary: "s", organizerName: "R", method: "CANCEL", sequence: 3 });
    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
    expect(cancel).toContain("SEQUENCE:3");
  });
});

describe("signed links", () => {
  const secret = derivedSecret("appointment", "material");
  it("round-trips and is purpose-bound", () => {
    const token = signId("appointment", ID, secret);
    expect(verifySignedId("appointment", token, secret)).toBe(ID);
    expect(verifySignedId("unsubscribe", token, secret)).toBeNull();
    expect(verifySignedId("appointment", token, derivedSecret("appointment", "other"))).toBeNull();
    expect(verifySignedId("appointment", `${ID}.forged`, secret)).toBeNull();
    expect(verifySignedId("appointment", "not-an-id.abc", secret)).toBeNull();
  });
});

describe("token encryption", () => {
  it("round-trips, uses a fresh IV, and rejects tampering or the wrong key", () => {
    const a = encrypt("refresh-token", "k1");
    expect(a).not.toContain("refresh-token");
    expect(encrypt("refresh-token", "k1")).not.toBe(a);
    expect(decrypt(a, "k1")).toBe("refresh-token");
    expect(() => decrypt(a, "k2")).toThrow();
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), "k1")).toThrow();
  });
});

describe("google", () => {
  it("asks for offline access with the minimal scopes", () => {
    const url = new URL(authUrl(creds, "state123"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPES.join(" "));
    expect(GOOGLE_SCOPES.some((s) => s.endsWith("/auth/calendar"))).toBe(false); // never full calendar access
  });

  it("reads the email from the id token", () => {
    const token = `x.${Buffer.from(JSON.stringify({ email: "studio@gmail.com" })).toString("base64url")}.y`;
    expect(emailFromIdToken(token)).toBe("studio@gmail.com");
    expect(emailFromIdToken("garbage")).toBeNull();
  });

  it("requires a refresh token on connect", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ access_token: "a", expires_in: 3600 }));
    await expect(exchangeCode(creds, "code", fetchImpl as never)).rejects.toThrow(/refresh token/);
  });

  it("refreshes an expired token once, persists it, and calls freeBusy", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      if (String(url).includes("oauth2")) return Response.json({ access_token: "fresh", expires_in: 3600 });
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fresh");
      return Response.json({ calendars: { primary: { busy: [{ start: "2026-11-02T18:00:00Z", end: "2026-11-02T19:00:00Z" }] } } });
    });
    const onRefresh = vi.fn(async () => {});
    const cal = googleCalendar(
      { calendar_id: "primary", refresh_token_enc: encrypt("refresh", "k"), access_token_enc: null, access_token_expires_at: null },
      { creds, secret: "k", onRefresh, fetchImpl: fetchImpl as never },
    );
    const busy = await cal.busy(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-08T00:00:00Z"));
    await cal.busy(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-08T00:00:00Z"));
    expect(busy).toEqual([{ start: new Date("2026-11-02T18:00:00Z"), end: new Date("2026-11-02T19:00:00Z") }]);
    expect(calls.filter((c) => c.includes("oauth2"))).toHaveLength(1);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(decrypt((onRefresh.mock.calls[0] as unknown as [string])[0], "k")).toBe("fresh");
  });

  it("revokes the token at Google on disconnect", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    await revokeToken("refresh", fetchImpl as never);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(String(init.body)).toBe("token=refresh");
  });

  it("treats an already-deleted event as done and surfaces other errors", async () => {
    const conn = { calendar_id: "primary", refresh_token_enc: encrypt("r", "k"), access_token_enc: encrypt("a", "k"), access_token_expires_at: "2999-01-01T00:00:00Z" };
    const gone = googleCalendar(conn, { creds, secret: "k", fetchImpl: (async () => new Response(null, { status: 410 })) as never });
    await expect(gone.deleteEvent("evt")).resolves.toBeUndefined();
    const broken = googleCalendar(conn, { creds, secret: "k", fetchImpl: (async () => Response.json({ error: { message: "nope" } }, { status: 403 })) as never });
    await expect(broken.createEvent({ summary: "s", description: "d", start: new Date(), end: new Date() })).rejects.toThrow(/403: nope/);
  });
});

describe("oauth state", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test";
    process.env.APP_ENV = "test";
  });

  it("is bound to the user and expires after 10 minutes", async () => {
    const { oauthState, verifyOauthState } = await import("@/lib/calendar/server");
    const now = Date.now();
    const state = oauthState("user-1", now);
    expect(verifyOauthState(state, "user-1", now + 60_000)).toBe(true);
    expect(verifyOauthState(state, "user-2", now + 60_000)).toBe(false);
    expect(verifyOauthState(state, "user-1", now + 11 * 60_000)).toBe(false);
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user-1", exp: now + 10 ** 9 })).toString("base64url");
    expect(verifyOauthState(`${forged}.${sig}`, "user-1", now)).toBe(false);
    expect(verifyOauthState(payload, "user-1", now)).toBe(false);
  });
});

describe("booking form", () => {
  const base = { starts_at: "2026-11-02T18:00:00.000Z", first_name: "Asha", email: " Asha@Example.com " };
  it("normalises email and phone", () => {
    const r = bookingSchema.parse({ ...base, phone: "(415) 555-0101", sms_consent: "on" });
    expect(r).toMatchObject({ email: "asha@example.com", phone: "+14155550101", sms_consent: true });
  });
  it("needs a phone for SMS consent, a name, and a real time", () => {
    expect(bookingSchema.safeParse({ ...base, sms_consent: "on" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...base, first_name: " " }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...base, starts_at: "tomorrow" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...base, phone: "12" }).success).toBe(false);
  });
});
