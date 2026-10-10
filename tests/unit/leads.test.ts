import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseServerEnv, TURNSTILE_TEST_SECRET_KEY } from "@/lib/env";
import { googleLeadSchema, googleLeadToAdLead, leadgenIds, metaLeadSchema, metaLeadToAdLead, metaWebhookSchema } from "@/lib/leads/ad-leads";
import { inquiryFormObject, inquirySchema, inquiryToLead, sourceFromHeardAbout } from "@/lib/leads/inquiry";
import { clientIp, hashIp, safeEqual, verifyMetaSignature } from "@/lib/leads/security";
import { verifyTurnstile } from "@/lib/leads/turnstile";
import { isPublicPath } from "@/lib/routes";

const form = (entries: [string, string][]) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return inquirySchema.safeParse(inquiryFormObject(fd));
};

describe("inquiry form", () => {
  it("cleans a full inquiry", () => {
    const r = form([
      ["first_name", " Priya "],
      ["email", " Priya@Example.com "],
      ["phone", "(415) 555-0123"],
      ["event_date", "2027-06-14"],
      ["event_type", "sikh"],
      ["services", "photo"],
      ["services", "video"],
      ["budget", "$10k–20k"],
      ["heard_about", "Instagram"],
      ["sms_consent", "on"],
      ["message", "3-day wedding"],
    ]);
    expect(r.success && r.data).toMatchObject({
      first_name: "Priya",
      email: "priya@example.com",
      phone: "+14155550123",
      services: ["photo", "video"],
      sms_consent: true,
      event_type: "sikh",
    });
  });

  it("needs a first name and a valid email; phone is optional unless they want texts", () => {
    expect(form([["email", "a@b.co"]]).error?.issues[0].path).toEqual(["first_name"]);
    expect(form([["first_name", "P"], ["email", "nope"]]).success).toBe(false);
    expect(form([["first_name", "P"], ["email", "a@b.co"]]).success).toBe(true);
    const noPhone = form([["first_name", "P"], ["email", "a@b.co"], ["sms_consent", "on"]]);
    expect(noPhone.error?.issues[0]).toMatchObject({ path: ["phone"], message: expect.stringContaining("text you") });
    expect(form([["first_name", "P"], ["email", "a@b.co"], ["phone", "123"]]).success).toBe(false);
  });

  it("rejects values the form doesn't offer", () => {
    expect(form([["first_name", "P"], ["email", "a@b.co"], ["budget", "$1M"]]).success).toBe(false);
    expect(form([["first_name", "P"], ["email", "a@b.co"], ["services", "catering"]]).success).toBe(false);
  });

  it("only records consent text when the box was ticked and there's a phone", () => {
    const base = { first_name: "P", email: "a@b.co" };
    const ticked = inquirySchema.parse({ ...base, phone: "4155550123", sms_consent: "on" });
    expect(inquiryToLead(ticked, "CONSENT", "hash")).toMatchObject({ sms_consent_text: "CONSENT", source: "website", form_key: "inquiry" });
    const unticked = inquirySchema.parse({ ...base, phone: "4155550123" });
    expect(inquiryToLead(unticked, "CONSENT", null).sms_consent_text).toBeNull();
  });

  it("maps 'how did you hear' to a contact source", () => {
    expect(sourceFromHeardAbout("Instagram")).toBe("instagram");
    expect(sourceFromHeardAbout("A friend or family")).toBe("referral");
    expect(sourceFromHeardAbout("Google")).toBe("website");
    expect(sourceFromHeardAbout(null)).toBe("website");
  });
});

describe("Turnstile", () => {
  it("passes the token, secret and IP to Cloudflare and trusts only success: true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    expect(await verifyTurnstile("tok", "secret", "1.2.3.4", fetchMock)).toBe(true);
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: "secret", response: "tok", remoteip: "1.2.3.4" });

    expect(await verifyTurnstile("tok", "s", null, vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }))))).toBe(false);
    expect(await verifyTurnstile("tok", "s", null, vi.fn().mockResolvedValue(new Response("oops", { status: 500 })))).toBe(false);
    expect(await verifyTurnstile("tok", "s", null, vi.fn().mockRejectedValue(new Error("network")))).toBe(false);
  });

  it("fails without a token, without calling Cloudflare", async () => {
    const fetchMock = vi.fn();
    expect(await verifyTurnstile("", "s", null, fetchMock)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Cloudflare's test keys until real ones are set", () => {
    const env = parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://x.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" });
    expect(env.TURNSTILE_SECRET_KEY).toBe(TURNSTILE_TEST_SECRET_KEY);
    expect(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY).toBe("1x00000000000000000000AA");
  });
});

describe("security helpers", () => {
  it("hashes IPs with a salt and never returns the IP", () => {
    const h = hashIp("1.2.3.4", "salt")!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("1.2.3.4");
    expect(hashIp("1.2.3.4", "other")).not.toBe(h);
    expect(hashIp(null, "salt")).toBeNull();
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBeNull();
  });

  it("verifies Meta's X-Hub-Signature-256", () => {
    const body = '{"object":"page"}';
    const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, sig, "app-secret")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, sig, "wrong-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", "app-secret")).toBe(false);
  });

  it("compares secrets in constant time, any length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("lets the embed script and forms load without sign-in", () => {
    expect(isPublicPath("/embed.js")).toBe(true);
    expect(isPublicPath("/f/inquiry")).toBe(true);
    expect(isPublicPath("/api/webhooks/meta")).toBe(true);
  });
});

describe("Meta lead ads", () => {
  it("collects leadgen ids from a webhook delivery", () => {
    const payload = metaWebhookSchema.parse({
      object: "page",
      entry: [
        { changes: [{ field: "leadgen", value: { leadgen_id: "111", form_id: "f" } }, { field: "feed", value: { leadgen_id: "x" } }] },
        { changes: [{ field: "leadgen", value: { leadgen_id: 222 } }] },
      ],
    });
    expect(leadgenIds(payload)).toEqual(["111", "222"]);
  });

  it("turns a Graph API lead into a contact, including custom wedding questions", () => {
    const lead = metaLeadToAdLead(
      metaLeadSchema.parse({
        id: "999",
        campaign_name: "Fall 2026",
        ad_name: "Reel 3",
        field_data: [
          { name: "full_name", values: ["Anika Rao"] },
          { name: "email", values: ["Anika@Example.com"] },
          { name: "phone_number", values: ["+1 415 555 0177"] },
          { name: "when_is_your_wedding?", values: ["2027-03-21"] },
          { name: "partner's_name", values: ["Dev"] },
          { name: "wedding_venue", values: ["Oak Hall"] },
        ],
      }),
    );
    expect(lead).toMatchObject({
      source: "meta_ads",
      external_id: "meta:999",
      first_name: "Anika",
      last_name: "Rao",
      email: "anika@example.com",
      phone: "+14155550177",
      event_date: "2027-03-21",
      partner_name: "Dev",
      venue: "Oak Hall",
      campaign: "Fall 2026",
      ad: "Reel 3",
    });
  });
});

describe("Google Ads lead forms", () => {
  it("turns a webhook payload into a contact", () => {
    const lead = googleLeadToAdLead(
      googleLeadSchema.parse({
        lead_id: "g-1",
        google_key: "k",
        campaign_id: 123,
        is_test: true,
        user_column_data: [
          { column_id: "FULL_NAME", string_value: "Meera Patel" },
          { column_id: "EMAIL", string_value: "meera@example.com" },
          { column_id: "PHONE_NUMBER", string_value: "4155550188" },
          { column_name: "Wedding date", string_value: "6/14/2027" },
        ],
      }),
    );
    expect(lead).toMatchObject({
      source: "google_ads",
      external_id: "google:g-1",
      first_name: "Meera",
      last_name: "Patel",
      phone: "+14155550188",
      event_date: "2027-06-14",
      campaign: "Campaign 123",
      ad: "TEST lead",
    });
  });

  it("requires a lead id", () => {
    expect(googleLeadSchema.safeParse({ user_column_data: [] }).success).toBe(false);
  });
});

describe("inquiry form without the SMS box ticked", () => {
  it("is accepted and means no consent", () => {
    const r = inquirySchema.safeParse({ first_name: "P", email: "a@b.co" });
    expect(r.success && r.data.sms_consent).toBe(false);
  });
});
