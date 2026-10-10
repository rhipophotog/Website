import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { emailProviderFor } from "@/lib/messaging/providers";
import { resendProvider } from "@/lib/messaging/providers/resend";
import { testOutbox } from "@/lib/messaging/providers/test-outbox";
import {
  buildMergeContext,
  formatEventDate,
  htmlToText,
  parseAddress,
  render,
  stripQuotedReply,
  textToHtml,
  unknownFields,
} from "@/lib/messaging/render";
import { verifySvix } from "@/lib/messaging/svix";
import { unsubscribeSecret, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/messaging/unsubscribe";

describe("render", () => {
  const ctx = { first_name: "Priya", event_date: "June 14, 2027", booking_link: "https://cal.example/rhipo" };

  it("fills merge fields and falls back sensibly when one is unknown", () => {
    expect(render("Hi {{first_name}}, about {{ event_date }}: {{booking_link}}", ctx)).toBe("Hi Priya, about June 14, 2027: https://cal.example/rhipo");
    expect(render("Hi {{first_name}} & {{partner_name}}", {})).toBe("Hi there & your partner");
    expect(render("Keep {{not_a_field}} as typed", ctx)).toBe("Keep {{not_a_field}} as typed");
  });

  it("flags typos in merge fields", () => {
    expect(unknownFields("Hi {{firstname}} {{first_name}} {{ venue }}")).toEqual(["firstname"]);
  });

  it("builds the context from the contact, wedding and studio settings", () => {
    expect(
      buildMergeContext({
        contact: { first_name: "Priya", partner_name: "Rohan" },
        opportunity: { event_dates: [{ date: "2027-06-15" }, { date: "2027-06-14" }], venue: null, city: "Fresno" },
        settings: { owner_name: "Hitesh", booking_link: "https://b" },
      }),
    ).toMatchObject({ first_name: "Priya", partner_name: "Rohan", event_date: "June 14, 2027", venue: "Fresno", owner_name: "Hitesh", booking_link: "https://b" });
    expect(formatEventDate("nope")).toBeNull();
  });
});

describe("textToHtml", () => {
  it("escapes HTML, keeps paragraphs and line breaks, and links URLs", () => {
    const html = textToHtml("Hi <b>Priya</b> & Rohan\nsecond line\n\nSee https://rhipo.example/work.");
    expect(html).toContain("Hi &lt;b&gt;Priya&lt;/b&gt; &amp; Rohan<br>second line");
    expect(html).toContain('<a href="https://rhipo.example/work" style="color:#9a7740">https://rhipo.example/work</a>.');
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).not.toContain("<b>");
  });
});

describe("reading replies", () => {
  it("drops the quoted history", () => {
    const reply = "Yes, June 14 works!\n\nThanks,\nPriya\n\nOn Mon, Oct 12, 2026 at 9:00 AM RHIPO <hello@rhipo.example> wrote:\n> Hi Priya,\n> Does June 14 work?";
    expect(stripQuotedReply(reply)).toBe("Yes, June 14 works!\n\nThanks,\nPriya");
    expect(stripQuotedReply("> only quoted")).toBe("> only quoted");
  });

  it("turns HTML-only emails into text", () => {
    expect(htmlToText("<div>Hi there<br>Line two</div><p>Para &amp; more</p><style>p{}</style>")).toBe("Hi there\nLine two\n\nPara & more");
  });

  it("parses From headers", () => {
    expect(parseAddress('"Priya Sharma" <Priya@Example.com>')).toEqual({ name: "Priya Sharma", address: "priya@example.com" });
    expect(parseAddress("priya@example.com")).toEqual({ name: null, address: "priya@example.com" });
    expect(parseAddress(undefined)).toEqual({ name: null, address: null });
  });
});

describe("Svix webhook signatures (Resend)", () => {
  const secret = `whsec_${Buffer.from("super-secret-key").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    createHmac("sha256", Buffer.from("super-secret-key")).update(`${id}.${ts}.${body}`).digest("base64");
  const now = 1_790_000_000_000;
  const ts = String(now / 1000);
  const body = '{"type":"email.delivered"}';

  it("accepts a valid signature (also among several)", () => {
    expect(verifySvix(body, { id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}` }, secret, now)).toBe(true);
    expect(verifySvix(body, { id: "msg_1", timestamp: ts, signature: `v1,bogus v1,${sign("msg_1", ts, body)}` }, secret, now)).toBe(true);
  });

  it("rejects tampering, wrong secrets, missing headers and stale timestamps", () => {
    const sig = `v1,${sign("msg_1", ts, body)}`;
    expect(verifySvix(body + " ", { id: "msg_1", timestamp: ts, signature: sig }, secret, now)).toBe(false);
    expect(verifySvix(body, { id: "msg_2", timestamp: ts, signature: sig }, secret, now)).toBe(false);
    expect(verifySvix(body, { id: "msg_1", timestamp: ts, signature: sig }, "whsec_d3Jvbmc=", now)).toBe(false);
    expect(verifySvix(body, { id: null, timestamp: ts, signature: sig }, secret, now)).toBe(false);
    expect(verifySvix(body, { id: "msg_1", timestamp: ts, signature: sig }, secret, now + 10 * 60 * 1000)).toBe(false);
  });
});

describe("unsubscribe links", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  it("verify only with the right secret and untouched contact id", () => {
    const token = unsubscribeToken(id, "s1");
    expect(verifyUnsubscribeToken(token, "s1")).toBe(id);
    expect(verifyUnsubscribeToken(token, "s2")).toBeNull();
    expect(verifyUnsubscribeToken(token.replace("1111", "9999"), "s1")).toBeNull();
    expect(verifyUnsubscribeToken("garbage", "s1")).toBeNull();
  });

  it("derive a secret from the service key when none is set", () => {
    const a = unsubscribeSecret({ SUPABASE_SERVICE_ROLE_KEY: "key-a", LEAD_IP_SALT: "x" });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(unsubscribeSecret({ SUPABASE_SERVICE_ROLE_KEY: "key-b", LEAD_IP_SALT: "x" })).not.toBe(a);
    expect(unsubscribeSecret({ UNSUBSCRIBE_SECRET: "explicit", LEAD_IP_SALT: "x" })).toBe("explicit");
  });
});

describe("Resend provider", () => {
  it("only exists in production with credentials", () => {
    expect(emailProviderFor("development", { RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.co" }).mode).toBe("test");
    expect(emailProviderFor("production", { RESEND_API_KEY: "re_x", EMAIL_FROM: "RHIPO <a@b.co>" }).mode).toBe("live");
    expect(() => emailProviderFor("production", { RESEND_API_KEY: "re_x" })).toThrow(/EMAIL_FROM/);
  });

  it("sends with the idempotency key, reply-to and threading headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    const provider = resendProvider("re_key", "RHIPO <hello@rhipo.example>", fetchMock);
    const result = await provider.send({
      to: "priya@example.com",
      subject: "Hi",
      text: "Hello",
      html: "<p>Hello</p>",
      replyTo: "replies@reply.rhipo.example",
      headers: { "In-Reply-To": "<abc@mail>" },
      idempotencyKey: "autoreply:sub-1",
    });
    expect(result).toEqual({ status: "sent", providerId: "re_123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_key", "Idempotency-Key": "autoreply:sub-1" });
    expect(JSON.parse(init.body)).toEqual({
      from: "RHIPO <hello@rhipo.example>",
      to: ["priya@example.com"],
      subject: "Hi",
      text: "Hello",
      html: "<p>Hello</p>",
      reply_to: ["replies@reply.rhipo.example"],
      headers: { "In-Reply-To": "<abc@mail>" },
    });
  });

  it("surfaces Resend errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "validation_error", message: "Domain not verified" }), { status: 403 }));
    await expect(resendProvider("k", "a@b.co", fetchMock).send({ to: "x@y.co", subject: "s", text: "t", idempotencyKey: "k" })).rejects.toThrow(
      /403: validation_error Domain not verified/,
    );
  });
});

// emailContact talks to the database; this is a small in-memory stand-in for the two queries it makes.
function fakeDb() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    from: () => ({
      select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: rows.find((r) => r.idempotency_key === v) ?? null }) }) }),
      insert: (row: Record<string, unknown>) => {
        rows.push(row);
        return { select: () => ({ single: async () => ({ data: { id: `m${rows.length}` }, error: null }) }), then: (fn: (v: unknown) => void) => fn({ error: null }) };
      },
    }),
  };
}

describe("emailContact (test mode)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test";
    process.env.APP_ENV = "test";
    process.env.APP_URL = "https://crm.rhipo.example";
  });

  const contact = { id: "11111111-2222-4333-8444-555555555555", email: "priya@example.com", dnd_email: false, email_marketing_consent: false };

  it("records a rendered email to the thread instead of sending", async () => {
    const { emailContact } = await import("@/lib/messaging/email");
    const db = fakeDb();
    const out = await emailContact(db as never, { contact, subject: "Hi {{first_name}}", body: "Congrats {{first_name}}!", context: { first_name: "Priya" } });
    expect(out).toEqual({ status: "test", messageId: "m1" });
    expect(db.rows[0]).toMatchObject({ subject: "Hi Priya", body: "Congrats Priya!", status: "test", direction: "out", to_address: "priya@example.com" });
    expect(testOutbox.list("email").at(-1)?.message).toMatchObject({ subject: "Hi Priya" });
  });

  it("respects do-not-email and marketing opt-outs, and adds unsubscribe to marketing", async () => {
    const { emailContact } = await import("@/lib/messaging/email");
    expect(await emailContact(fakeDb() as never, { contact: { ...contact, dnd_email: true }, subject: "s", body: "b", context: {} })).toEqual({ status: "skipped", reason: "dnd_email" });
    expect(await emailContact(fakeDb() as never, { contact: { ...contact, email: null }, subject: "s", body: "b", context: {} })).toEqual({ status: "skipped", reason: "no_email" });
    expect(await emailContact(fakeDb() as never, { contact, subject: "s", body: "b", context: {}, category: "marketing" })).toEqual({
      status: "skipped",
      reason: "marketing_opt_out",
    });

    const db = fakeDb();
    await emailContact(db as never, { contact: { ...contact, email_marketing_consent: true }, subject: "News", body: "Hello", context: {}, category: "marketing" });
    const sent = testOutbox.list("email").at(-1)!.message as { text: string; html: string; headers: Record<string, string> };
    expect(sent.text).toMatch(/Unsubscribe: https:\/\/crm\.rhipo\.example\/u\/11111111-2222-4333-8444-555555555555\./);
    expect(sent.html).toContain("Unsubscribe</a>");
    expect(sent.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/crm\.rhipo\.example\/u\//);
  });

  it("won't send twice with the same idempotency key", async () => {
    const { emailContact } = await import("@/lib/messaging/email");
    const db = fakeDb();
    const req = { contact, subject: "s", body: "b", context: {}, idempotencyKey: "autoreply:sub-9" };
    expect((await emailContact(db as never, req)).status).toBe("test");
    expect(await emailContact(db as never, req)).toEqual({ status: "skipped", reason: "duplicate" });
    expect(db.rows).toHaveLength(1);
  });
});
