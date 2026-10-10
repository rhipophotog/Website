import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, SERVICE, type TestDb } from "./db";

let db: TestDb;
let ownerId: string;
let teamId: string;

beforeAll(() => {
  db = createTestDb();
  db.admin(`insert into public.invites (email, role) values ('owner@rhipo.test', 'owner'), ('team@rhipo.test', 'team');`);
  ownerId = db.signUp("owner@rhipo.test");
  teamId = db.signUp("team@rhipo.test");
});

afterAll(() => db?.drop());

type Result = { contact_id: string; opportunity_id: string; submission_id: string; created_contact: boolean; duplicate_delivery: boolean };

const CONSENT = "Yes, RHIPO may text me. Reply STOP to opt out.";
const capture = (lead: Record<string, unknown>, as: string | null = SERVICE): Result =>
  JSON.parse(db.as(as, `select public.capture_lead('${JSON.stringify(lead).replace(/'/g, "''")}'::jsonb);`));

describe("capture_lead", () => {
  it("creates contact, SMS consent, New inquiry card, submission, note, activity and lead.created", () => {
    const r = capture({
      source: "website",
      form_key: "inquiry",
      first_name: "Priya",
      last_name: "Sharma",
      partner_name: "Rohan",
      email: "Priya.Lead@Example.com",
      phone: "+14155550111",
      event_date: "2027-06-14",
      event_type: "hindu",
      venue: "Oak Hall",
      city: "Fresno",
      services: ["photo", "video", "catering"],
      budget: "$10–20k",
      heard_about: "Instagram",
      message: "We'd love candid shots! It's a 3-day wedding.",
      sms_consent_text: CONSENT,
      ip_hash: "abc",
    });
    expect(r).toMatchObject({ created_contact: true, duplicate_delivery: false });

    expect(db.rows(ownerId, `select first_name, email, phone, source from public.contacts where id = '${r.contact_id}'`)).toEqual([
      { first_name: "Priya", email: "priya.lead@example.com", phone: "+14155550111", source: "website" },
    ]);
    expect(db.rows(ownerId, `select channel, granted, text, source, recorded_by from public.consents where contact_id = '${r.contact_id}'`)).toEqual([
      { channel: "sms", granted: true, text: CONSENT, source: "website_form", recorded_by: null },
    ]);
    expect(
      db.rows(ownerId, `select stage_key, status, couple_names, event_type, event_dates, venue, services, source from public.opportunities where id = '${r.opportunity_id}'`),
    ).toEqual([
      {
        stage_key: "new_inquiry",
        status: "open",
        couple_names: "Priya & Rohan",
        event_type: "hindu",
        event_dates: [{ name: "Wedding", date: "2027-06-14" }],
        venue: "Oak Hall",
        services: ["photo", "video"],
        source: "website",
      },
    ]);
    expect(db.rows(ownerId, `select source, ip_hash, created_contact, data->>'budget' as budget from public.form_submissions where id = '${r.submission_id}'`)).toEqual([
      { source: "website", ip_hash: "abc", created_contact: true, budget: "$10–20k" },
    ]);
    const [note] = db.rows<{ body: string }>(ownerId, `select body from public.messages where contact_id = '${r.contact_id}'`);
    expect(note.body).toContain("New inquiry via website form");
    expect(note.body).toContain("Wedding date: 2027-06-14");
    expect(note.body).toContain("candid shots");
    expect(db.rows(ownerId, `select kind from public.contact_activity where contact_id = '${r.contact_id}' and kind = 'lead.captured'`)).toHaveLength(1);
    expect(db.admin(`select payload->>'source' from public.domain_events where type = 'lead.created' and payload->>'contact_id' = '${r.contact_id}'`)).toBe("website");
  });

  it("dedupes on email or phone: fills blanks, keeps the active card, still records the inquiry", () => {
    const first = capture({ source: "website", first_name: "Anika", email: "anika.lead@example.com" });
    const again = capture({ source: "meta_ads", first_name: "Ani", last_name: "Rao", email: "ANIKA.lead@example.com", phone: "+14155550122", campaign: "Fall promo" });
    expect(again).toMatchObject({ contact_id: first.contact_id, opportunity_id: first.opportunity_id, created_contact: false });
    expect(db.rows(ownerId, `select first_name, last_name, phone, source from public.contacts where id = '${first.contact_id}'`)).toEqual([
      { first_name: "Anika", last_name: "Rao", phone: "+14155550122", source: "website" },
    ]);
    expect(db.admin(`select count(*) from public.opportunities where contact_id = '${first.contact_id}'`)).toBe("1");
    expect(db.admin(`select count(*) from public.form_submissions where contact_id = '${first.contact_id}'`)).toBe("2");

    const byPhone = capture({ source: "google_ads", phone: "+14155550122" });
    expect(byPhone.contact_id).toBe(first.contact_id);
  });

  it("opens a new card when their last one was lost", () => {
    const first = capture({ source: "website", email: "returning@example.com" });
    db.as(ownerId, `update public.opportunities set stage_key = 'lost', lost_reason = 'price' where id = '${first.opportunity_id}';`);
    const again = capture({ source: "website", email: "returning@example.com" });
    expect(again.opportunity_id).not.toBe(first.opportunity_id);
    expect(db.admin(`select count(*) from public.opportunities where contact_id = '${first.contact_id}'`)).toBe("2");
  });

  it("ignores repeat webhook deliveries of the same lead", () => {
    const first = capture({ source: "meta_ads", external_id: "leadgen_1", email: "meta1@example.com" });
    const retry = capture({ source: "meta_ads", external_id: "leadgen_1", email: "meta1@example.com" });
    expect(retry).toEqual({ ...first, duplicate_delivery: true });
    expect(db.admin("select count(*) from public.form_submissions where external_id = 'leadgen_1'")).toBe("1");
  });

  it("records SMS consent only for the number they typed", () => {
    const first = capture({ source: "website", email: "twophones@example.com", phone: "+14155550133" });
    capture({ source: "website", email: "twophones@example.com", phone: "+14155550144", sms_consent_text: CONSENT });
    expect(db.admin(`select count(*) from public.consents where contact_id = '${first.contact_id}'`)).toBe("0");
    capture({ source: "website", email: "twophones@example.com", phone: "+14155550133", sms_consent_text: CONSENT });
    expect(db.admin(`select count(*) from public.consents where contact_id = '${first.contact_id}'`)).toBe("1");
  });

  it("rejects leads with no way to reach them, and unknown sources", () => {
    expect(() => capture({ source: "website", first_name: "Nobody" })).toThrow(/capture_lead_needs_email_or_phone/);
    expect(() => capture({ source: "tiktok", email: "x@example.com" })).toThrow(/capture_lead_bad_source/);
  });

  it("drops a malformed event date instead of failing", () => {
    const r = capture({ source: "website", email: "baddate@example.com", event_date: "June 14" });
    expect(db.rows(ownerId, `select event_dates from public.opportunities where id = '${r.opportunity_id}'`)).toEqual([{ event_dates: [] }]);
  });
});

describe("who can capture leads", () => {
  it("only the server (service role), never the public or signed-in users directly", () => {
    expect(() => capture({ source: "website", email: "anon@example.com" }, null)).toThrow(/permission denied/);
    expect(() => capture({ source: "website", email: "team@example.com" }, teamId)).toThrow(/permission denied/);
    expect(() => db.as(null, "select public.recent_submissions('x', 10);")).toThrow(/permission denied/);
  });

  it("the public can't read or write forms, submissions or events", () => {
    for (const table of ["forms", "form_submissions", "domain_events"]) {
      expect(() => db.as(null, `select * from public.${table};`), table).toThrow(/permission denied/);
    }
    expect(() => db.as(null, "insert into public.form_submissions (source) values ('website');")).toThrow(/permission denied/);
  });

  it("members read submissions but not the event outbox; only the owner edits forms", () => {
    expect(db.rows(teamId, "select id from public.form_submissions").length).toBeGreaterThan(0);
    expect(() => db.as(teamId, "select * from public.domain_events;")).toThrow(/permission denied/);
    db.as(teamId, "update public.forms set sms_consent_text = 'hacked' where key = 'inquiry';");
    expect(db.rows(teamId, "select sms_consent_text from public.forms where key = 'inquiry'")[0]).not.toEqual({ sms_consent_text: "hacked" });
  });
});

describe("recent_submissions (rate limit)", () => {
  it("counts submissions from one IP hash in a time window", () => {
    capture({ source: "website", email: "r1@example.com", ip_hash: "rate-ip" });
    capture({ source: "website", email: "r2@example.com", ip_hash: "rate-ip" });
    expect(db.as(SERVICE, "select public.recent_submissions('rate-ip', 10);")).toBe("2");
    expect(db.as(SERVICE, "select public.recent_submissions('other-ip', 10);")).toBe("0");
  });
});
