import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, SERVICE, type TestDb } from "./db";

let db: TestDb;
let ownerId: string;
let teamId: string;
let contactId: string;

beforeAll(() => {
  db = createTestDb();
  db.admin(`insert into public.invites (email, role) values ('owner@rhipo.test', 'owner'), ('team@rhipo.test', 'team');`);
  ownerId = db.signUp("owner@rhipo.test");
  teamId = db.signUp("team@rhipo.test");
  contactId = db.as(teamId, "insert into public.contacts (first_name, email) values ('Priya', 'priya.mail@example.com') returning id;");
});

afterAll(() => db?.drop());

const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const inbound = (p: Record<string, unknown>) => JSON.parse(db.as(SERVICE, `select public.record_inbound_email(${j(p)});`));
const sendAs = (userId: string, providerId: string, extra = "") =>
  db.as(userId, `insert into public.messages (contact_id, channel, direction, subject, body, status, provider_id, to_address${extra ? ", idempotency_key" : ""})
    values ('${contactId}', 'email', 'out', 'Hi', 'Hello', 'sent', '${providerId}', 'priya.mail@example.com'${extra ? `, '${extra}'` : ""}) returning id;`);

describe("seed data", () => {
  it("has the starter templates and one settings row", () => {
    expect(db.rows<{ key: string }>(teamId, "select key from public.templates where channel = 'email'").map((t) => t.key)).toContain("inquiry_autoreply");
    expect(db.admin("select count(*) from public.templates where channel = 'sms' and length(body) > 160")).toBe("0");
    expect(db.admin("select count(*) from public.templates where channel = 'email' and subject is null")).toBe("0");
    expect(db.rows(teamId, "select autoreply_enabled, automations_paused from public.studio_settings")).toEqual([
      { autoreply_enabled: true, automations_paused: false },
    ]);
  });
});

describe("templates and settings permissions", () => {
  it("members read; only the owner edits", () => {
    db.as(teamId, "update public.templates set body = 'hacked' where key = 'inquiry_autoreply';");
    db.as(teamId, "update public.studio_settings set automations_paused = true;");
    expect(db.rows(ownerId, "select body <> 'hacked' as ok from public.templates where key = 'inquiry_autoreply'")).toEqual([{ ok: true }]);
    expect(db.rows(ownerId, "select automations_paused from public.studio_settings")).toEqual([{ automations_paused: false }]);
    db.as(ownerId, "update public.studio_settings set owner_name = 'Hitesh A', booking_link = 'https://cal.example';");
    expect(db.rows(teamId, "select owner_name from public.studio_settings")).toEqual([{ owner_name: "Hitesh A" }]);
    expect(() => db.as(null, "select * from public.templates;")).toThrow(/permission denied/);
  });

  it("settings stay a single row", () => {
    expect(() => db.admin("insert into public.studio_settings (id) values (false);")).toThrow(/check constraint/);
  });
});

describe("outbound email messages", () => {
  it("members record emails they sent as themselves, never as someone else or as inbound", () => {
    sendAs(teamId, "re_team_1");
    expect(() =>
      db.as(teamId, `insert into public.messages (contact_id, channel, direction, body, author_id) values ('${contactId}', 'email', 'out', 'x', '${ownerId}');`),
    ).toThrow(/row-level security/);
    expect(() => db.as(teamId, `insert into public.messages (contact_id, channel, direction, body) values ('${contactId}', 'email', 'in', 'fake reply');`)).toThrow(
      /row-level security/,
    );
    expect(() => db.as(teamId, `insert into public.messages (contact_id, channel, direction, body) values ('${contactId}', 'sms', 'out', 'x');`)).toThrow(
      /row-level security/,
    );
  });

  it("can't be sent twice with the same idempotency key", () => {
    sendAs(teamId, "re_idem_1", "autoreply:sub-1");
    expect(() => sendAs(teamId, "re_idem_2", "autoreply:sub-1")).toThrow(/duplicate key/);
  });

  it("only allow known statuses", () => {
    expect(() =>
      db.as(teamId, `insert into public.messages (contact_id, channel, direction, body, status) values ('${contactId}', 'email', 'out', 'x', 'yolo');`),
    ).toThrow(/check constraint/);
  });
});

describe("record_email_event", () => {
  it("moves status forward only, and bounces switch on do-not-email", () => {
    sendAs(ownerId, "re_status_1");
    db.as(SERVICE, "select public.record_email_event('re_status_1', 'delivered');");
    db.as(SERVICE, "select public.record_email_event('re_status_1', 'sent');"); // late, out-of-order event
    expect(db.rows(ownerId, "select status from public.messages where provider_id = 're_status_1'")).toEqual([{ status: "delivered" }]);

    expect(db.rows(ownerId, `select dnd_email from public.contacts where id = '${contactId}'`)).toEqual([{ dnd_email: false }]);
    db.as(SERVICE, "select public.record_email_event('re_status_1', 'bounced', 'Mailbox does not exist');");
    expect(db.rows(ownerId, "select status, error from public.messages where provider_id = 're_status_1'")).toEqual([
      { status: "bounced", error: "Mailbox does not exist" },
    ]);
    expect(db.rows(ownerId, `select dnd_email from public.contacts where id = '${contactId}'`)).toEqual([{ dnd_email: true }]);
    db.as(ownerId, `update public.contacts set dnd_email = false where id = '${contactId}';`);
  });

  it("is server-only", () => {
    expect(() => db.as(ownerId, "select public.record_email_event('x', 'delivered');")).toThrow(/permission denied/);
  });
});

describe("record_inbound_email", () => {
  it("threads a reply onto the existing contact, unread, and raises message.received", () => {
    const r = inbound({ provider_id: "in_1", from_address: "PRIYA.MAIL@example.com", from_name: "Priya", subject: "Re: Hi", body: "Yes please!", rfc_message_id: "<r1@mail>" });
    expect(r).toMatchObject({ contact_id: contactId, created_contact: false, duplicate_delivery: false });
    expect(db.rows(teamId, `select direction, status, body, read_at from public.messages where id = '${r.message_id}'`)).toEqual([
      { direction: "in", status: "received", body: "Yes please!", read_at: null },
    ]);
    expect(db.admin(`select count(*) from public.domain_events where type = 'message.received' and payload->>'contact_id' = '${contactId}'`)).toBe("1");
  });

  it("ignores repeat deliveries", () => {
    const again = inbound({ provider_id: "in_1", from_address: "priya.mail@example.com", body: "Yes please!" });
    expect(again.duplicate_delivery).toBe(true);
    expect(db.admin("select count(*) from public.messages where provider_id = 'in_1'")).toBe("1");
  });

  it("starts a new contact in New inquiry for unknown senders", () => {
    const r = inbound({ provider_id: "in_2", from_address: "new.person@example.com", from_name: "Meera Patel", subject: "Wedding in May", body: "Are you free?" });
    expect(r.created_contact).toBe(true);
    expect(db.rows(ownerId, `select first_name, last_name, email from public.contacts where id = '${r.contact_id}'`)).toEqual([
      { first_name: "Meera", last_name: "Patel", email: "new.person@example.com" },
    ]);
    expect(db.rows(ownerId, `select stage_key from public.opportunities where contact_id = '${r.contact_id}'`)).toEqual([{ stage_key: "new_inquiry" }]);
  });

  it("is server-only", () => {
    expect(() => db.as(teamId, `select public.record_inbound_email(${j({ provider_id: "x", from_address: "a@b.co", body: "" })});`)).toThrow(/permission denied/);
  });
});

describe("inbox", () => {
  it("lists threads with unread counts and needs-reply, and opening marks them read", () => {
    const [thread] = db.rows<{ unread: number; needs_reply: boolean; last_direction: string }>(
      teamId,
      `select unread, needs_reply, last_direction from public.inbox_threads where contact_id = '${contactId}'`,
    );
    expect(thread).toEqual({ unread: 1, needs_reply: true, last_direction: "in" });

    db.as(teamId, `select public.mark_conversation_read('${contactId}');`);
    expect(db.rows(teamId, `select unread from public.inbox_threads where contact_id = '${contactId}'`)).toEqual([{ unread: 0 }]);
    expect(db.rows("00000000-0000-0000-0000-000000000099", "select * from public.inbox_threads")).toEqual([]);
    expect(() => db.as(null, "select * from public.inbox_threads;")).toThrow(/permission denied/);
  });

  it("an outsider can't mark anything read", () => {
    inbound({ provider_id: "in_3", from_address: "priya.mail@example.com", body: "One more thing" });
    db.as("00000000-0000-0000-0000-000000000099", `select public.mark_conversation_read('${contactId}');`);
    expect(db.rows(teamId, `select unread from public.inbox_threads where contact_id = '${contactId}'`)).toEqual([{ unread: 1 }]);
  });
});

describe("unsubscribe_contact", () => {
  it("opts them out of marketing email and records why", () => {
    db.as(ownerId, `update public.contacts set email_marketing_consent = true where id = '${contactId}';`);
    expect(db.as(SERVICE, `select public.unsubscribe_contact('${contactId}', 'Clicked unsubscribe');`)).toBe("t");
    expect(db.rows(ownerId, `select email_marketing_consent from public.contacts where id = '${contactId}'`)).toEqual([{ email_marketing_consent: false }]);
    expect(db.rows(ownerId, `select channel, granted, source from public.consents where contact_id = '${contactId}' and channel = 'email'`)).toEqual([
      { channel: "email", granted: false, source: "unsubscribe_link" },
    ]);
    expect(db.as(SERVICE, "select public.unsubscribe_contact('00000000-0000-0000-0000-000000000000', 'x');")).toBe("f");
    expect(() => db.as(null, `select public.unsubscribe_contact('${contactId}', 'x');`)).toThrow(/permission denied/);
  });
});
