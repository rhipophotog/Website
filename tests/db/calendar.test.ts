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

const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
type Booked = { appointment_id: string; contact_id: string; opportunity_id: string; created_contact: boolean };
const book = (p: Record<string, unknown>): Booked => JSON.parse(db.as(SERVICE, `select public.book_appointment(${j(p)});`));
const future = (days: number, hour = 18) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe("seed data", () => {
  it("has the three appointment types and default hours", () => {
    expect(db.rows<{ key: string; duration_minutes: number }>(teamId, "select key, duration_minutes from public.appointment_types order by position")).toEqual([
      { key: "discovery", duration_minutes: 20 },
      { key: "consult", duration_minutes: 45 },
      { key: "engagement-planning", duration_minutes: 30 },
    ]);
    expect(db.rows(teamId, "select time_zone, weekly_hours -> '6' as sat, weekly_hours -> '0' as sun from public.availability_settings")).toEqual([
      { time_zone: "America/Los_Angeles", sat: [["10:00", "14:00"]], sun: [] },
    ]);
  });
});

describe("book_appointment", () => {
  it("creates the contact and a Consult scheduled card, logs it, and raises events", () => {
    const r = book({
      type_key: "discovery",
      starts_at: future(3),
      first_name: "Asha",
      partner_name: "Dev",
      email: "Asha@Example.com",
      phone: "+14155550101",
      event_date: "2027-06-12",
      sms_consent_text: "Yes, text me about my booking.",
      guest_time_zone: "America/New_York",
    });
    expect(r.created_contact).toBe(true);
    expect(db.rows(ownerId, `select email, time_zone, source from public.contacts where id = '${r.contact_id}'`)).toEqual([
      { email: "asha@example.com", time_zone: "America/New_York", source: "website" },
    ]);
    expect(db.rows(ownerId, `select stage_key, couple_names, event_dates from public.opportunities where id = '${r.opportunity_id}'`)).toEqual([
      { stage_key: "consult_scheduled", couple_names: "Asha & Dev", event_dates: [{ name: "Wedding", date: "2027-06-12" }] },
    ]);
    expect(db.rows(ownerId, `select source, text from public.consents where contact_id = '${r.contact_id}' and channel = 'sms'`)).toEqual([
      { source: "booking_form", text: "Yes, text me about my booking." },
    ]);
    expect(db.admin(`select string_agg(type, ',' order by type) from public.domain_events where payload ->> 'contact_id' = '${r.contact_id}'`)).toBe(
      "appointment.booked,lead.created",
    );
    expect(db.admin(`select count(*) from public.contact_activity where contact_id = '${r.contact_id}' and kind = 'appointment.booked'`)).toBe("1");
  });

  it("reuses an existing contact and moves an early card to Consult scheduled, without a second lead event", () => {
    const contactId = db.as(teamId, "insert into public.contacts (first_name, email) values ('Mira', 'mira@example.com') returning id;");
    const pipeline = db.admin("select id from public.pipelines where is_default");
    const opp = db.as(teamId, `insert into public.opportunities (contact_id, pipeline_id, stage_key) values ('${contactId}', '${pipeline}', 'contacted') returning id;`);
    const r = book({ type_key: "consult", starts_at: future(4), first_name: "Mira", email: "MIRA@example.com", phone: "+14155550102", sms_consent_text: "ok" });
    expect(r).toMatchObject({ contact_id: contactId, opportunity_id: opp, created_contact: false });
    expect(db.admin(`select stage_key from public.opportunities where id = '${opp}'`)).toBe("consult_scheduled");
    expect(db.admin(`select phone from public.contacts where id = '${contactId}'`)).toBe("+14155550102");
    expect(db.admin(`select count(*) from public.domain_events where type = 'lead.created' and payload ->> 'contact_id' = '${contactId}'`)).toBe("0");
  });

  it("doesn't record SMS consent for a phone number that isn't the contact's", () => {
    const contactId = db.as(teamId, "insert into public.contacts (email, phone) values ('ravi@example.com', '+14155550111') returning id;");
    book({ type_key: "discovery", starts_at: future(5), email: "ravi@example.com", phone: "+14155550999", sms_consent_text: "ok" });
    expect(db.admin(`select count(*) from public.consents where contact_id = '${contactId}' and channel = 'sms'`)).toBe("0");
  });

  it("never double-books: an overlapping slot fails with 23P01, but a cancelled one frees it", () => {
    const start = future(10);
    const first = book({ type_key: "consult", starts_at: start, email: "one@example.com" });
    const overlap = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
    expect(() => book({ type_key: "discovery", starts_at: overlap, email: "two@example.com" })).toThrow(/appointments_no_overlap/);
    db.as(teamId, `update public.appointments set status = 'cancelled' where id = '${first.appointment_id}';`);
    expect(book({ type_key: "discovery", starts_at: overlap, email: "two@example.com" }).appointment_id).toBeTruthy();
  });

  it("rejects unknown or inactive types", () => {
    db.as(ownerId, "update public.appointment_types set active = false where key = 'engagement-planning';");
    expect(() => book({ type_key: "engagement-planning", starts_at: future(12), email: "x@example.com" })).toThrow(/unknown_appointment_type/);
    db.as(ownerId, "update public.appointment_types set active = true where key = 'engagement-planning';");
  });
});

describe("guest functions", () => {
  it("cancel and reschedule only future, active bookings", () => {
    const r = book({ type_key: "discovery", starts_at: future(20), email: "guest@example.com" });
    const later = future(21);
    expect(db.as(SERVICE, `select public.guest_reschedule_appointment('${r.appointment_id}', '${later}');`)).toBe("t");
    expect(db.rows(ownerId, `select (ends_at - starts_at) = interval '20 minutes' as ok from public.appointments where id = '${r.appointment_id}'`)).toEqual([{ ok: true }]);
    expect(db.admin(`select count(*) from public.domain_events where type = 'appointment.rescheduled' and payload ->> 'appointment_id' = '${r.appointment_id}'`)).toBe("1");
    expect(db.as(SERVICE, `select public.guest_cancel_appointment('${r.appointment_id}', 'Plans changed');`)).toBe("t");
    expect(db.as(SERVICE, `select public.guest_cancel_appointment('${r.appointment_id}', 'again');`)).toBe("f");
    expect(db.as(SERVICE, `select public.guest_reschedule_appointment('${r.appointment_id}', '${future(22)}');`)).toBe("f");
  });

  it("busy_ranges returns times only", () => {
    const rows = db.rows<Record<string, unknown>>(SERVICE, `select * from public.busy_ranges(now(), now() + interval '90 days')`);
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]).sort()).toEqual(["ends_at", "starts_at"]);
  });

  it("are server-only", () => {
    for (const sql of [
      `select public.book_appointment('{}'::jsonb);`,
      `select public.guest_cancel_appointment(gen_random_uuid(), 'x');`,
      `select public.busy_ranges(now(), now());`,
      `select public.recent_bookings('x', 5);`,
    ]) {
      expect(() => db.as(teamId, sql)).toThrow(/permission denied/);
      expect(() => db.as(null, sql)).toThrow(/permission denied/);
    }
  });
});

describe("permissions", () => {
  it("members read and update appointments; studio inserts only; owner deletes", () => {
    const r = book({ type_key: "discovery", starts_at: future(30), email: "perm@example.com" });
    db.as(teamId, `update public.appointments set status = 'confirmed' where id = '${r.appointment_id}';`);
    expect(db.admin(`select status from public.appointments where id = '${r.appointment_id}'`)).toBe("confirmed");
    const typeId = db.admin("select id from public.appointment_types where key = 'discovery'");
    const values = `('${typeId}', '${r.contact_id}', '${future(31)}', '${future(31, 19)}'`;
    expect(() => db.as(teamId, `insert into public.appointments (type_id, contact_id, starts_at, ends_at, booked_by) values ${values}, 'guest');`)).toThrow(
      /row-level security/,
    );
    db.as(teamId, `insert into public.appointments (type_id, contact_id, starts_at, ends_at, booked_by) values ${values}, 'studio');`);
    db.as(teamId, `delete from public.appointments where id = '${r.appointment_id}';`);
    expect(db.admin(`select count(*) from public.appointments where id = '${r.appointment_id}'`)).toBe("1");
    db.as(ownerId, `delete from public.appointments where id = '${r.appointment_id}';`);
    expect(db.admin(`select count(*) from public.appointments where id = '${r.appointment_id}'`)).toBe("0");
    expect(() => db.as(null, "select * from public.appointments;")).toThrow(/permission denied/);
  });

  it("only the owner edits availability, types and days off", () => {
    db.as(teamId, "update public.availability_settings set max_per_day = 9;");
    expect(db.admin("select max_per_day from public.availability_settings")).toBe("4");
    expect(() => db.as(teamId, "insert into public.blocked_dates (date) values ('2027-01-01');")).toThrow(/row-level security/);
    db.as(ownerId, "update public.availability_settings set max_per_day = 5;");
    db.as(ownerId, "insert into public.blocked_dates (date, note) values ('2027-01-01', 'New year');");
    expect(db.rows(teamId, "select max_per_day from public.availability_settings")).toEqual([{ max_per_day: 5 }]);
  });

  it("Google tokens are never readable by signed-in users", () => {
    db.admin("insert into public.google_calendar_connection (account_email, refresh_token_enc) values ('studio@gmail.com', 'v1.secret');");
    expect(db.rows(teamId, "select account_email from public.google_calendar_connection")).toEqual([{ account_email: "studio@gmail.com" }]);
    expect(() => db.as(ownerId, "select refresh_token_enc from public.google_calendar_connection;")).toThrow(/permission denied/);
    expect(() => db.as(ownerId, "select * from public.google_calendar_connection;")).toThrow(/permission denied/);
    expect(() => db.as(ownerId, "update public.google_calendar_connection set calendar_id = 'x';")).toThrow(/permission denied/);
    db.as(teamId, "delete from public.google_calendar_connection where id;");
    expect(db.admin("select count(*) from public.google_calendar_connection")).toBe("1");
    db.as(ownerId, "delete from public.google_calendar_connection where id;");
    expect(db.admin("select count(*) from public.google_calendar_connection")).toBe("0");
  });
});
