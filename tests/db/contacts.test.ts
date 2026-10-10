import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db";

let db: TestDb;
let ownerId: string;
let teamId: string;
const outsider = "00000000-0000-0000-0000-000000000099";

beforeAll(() => {
  db = createTestDb();
  db.admin(`insert into public.invites (email, role) values ('owner@rhipo.test', 'owner'), ('team@rhipo.test', 'team');`);
  ownerId = db.signUp("owner@rhipo.test");
  teamId = db.signUp("team@rhipo.test");
});

afterAll(() => db?.drop());

const pipelineId = () => db.admin("select id from public.pipelines where key = 'weddings'");
const contact = (as: string, fields: string) => db.as(as, `insert into public.contacts ${fields} returning id;`);
const activity = (contactId: string) =>
  db.rows<{ kind: string; data: Record<string, unknown>; actor_id: string | null }>(
    ownerId,
    `select kind, data, actor_id from public.contact_activity where contact_id = '${contactId}' order by at, created_at`,
  );

describe("contacts table additions", () => {
  it("stores emails trimmed and lower-case", () => {
    const id = contact(teamId, "(first_name, email) values ('Priya', '  Priya@Example.COM ')");
    expect(db.rows(teamId, `select email from public.contacts where id = '${id}'`)).toEqual([{ email: "priya@example.com" }]);
  });

  it("allows many contacts without a GoHighLevel id but not two with the same one", () => {
    contact(ownerId, "(first_name) values ('A')");
    contact(ownerId, "(first_name) values ('B')");
    contact(ownerId, "(first_name, ghl_contact_id) values ('C', 'ghl_1')");
    expect(() => contact(ownerId, "(first_name, ghl_contact_id) values ('D', 'ghl_1')")).toThrow(/duplicate key/);
  });
});

describe("activity timeline (written by triggers)", () => {
  it("records creation, edits, tags, pipeline moves and consent with the actor", () => {
    const id = contact(teamId, "(first_name, source) values ('Anika', 'instagram')");
    db.as(teamId, `update public.contacts set city = 'Fresno', partner_name = 'Dev' where id = '${id}';`);
    db.as(teamId, `update public.contacts set updated_at = now() where id = '${id}';`); // no real change → no entry
    const tag = db.as(teamId, "insert into public.tags (name) values ('VIP') returning id;");
    db.as(teamId, `insert into public.contact_tags (contact_id, tag_id) values ('${id}', '${tag}');`);
    db.as(teamId, `delete from public.contact_tags where contact_id = '${id}';`);
    const opp = db.as(teamId, `insert into public.opportunities (contact_id, pipeline_id, stage_key) values ('${id}', '${pipelineId()}', 'new_inquiry') returning id;`);
    db.as(teamId, `update public.opportunities set stage_key = 'contacted' where id = '${opp}';`);
    db.as(teamId, `update public.opportunities set venue = 'Oak Hall' where id = '${opp}';`); // not a stage change
    db.as(teamId, `insert into public.consents (contact_id, channel, granted, text, source) values ('${id}', 'sms', true, 'OK to text?', 'verbal');`);

    expect(activity(id)).toEqual([
      { kind: "contact.created", data: { source: "instagram" }, actor_id: teamId },
      { kind: "contact.updated", data: { fields: ["city", "partner_name"] }, actor_id: teamId },
      { kind: "tag.added", data: { tag: "VIP" }, actor_id: teamId },
      { kind: "tag.removed", data: { tag: "VIP" }, actor_id: teamId },
      { kind: "opportunity.created", data: { stage: "new_inquiry" }, actor_id: teamId },
      { kind: "stage.changed", data: { from: "new_inquiry", to: "contacted" }, actor_id: teamId },
      { kind: "consent.recorded", data: { channel: "sms", granted: true, source: "verbal" }, actor_id: teamId },
    ]);
  });

  it("can't be written or edited by users", () => {
    const id = contact(ownerId, "(first_name) values ('Fake')");
    expect(() => db.as(ownerId, `insert into public.contact_activity (contact_id, kind) values ('${id}', 'fake');`)).toThrow(/permission denied/);
    expect(() => db.as(ownerId, `update public.contact_activity set kind = 'x';`)).toThrow(/permission denied/);
    expect(() => db.as(ownerId, `select public.log_activity('${id}', 'fake');`)).toThrow(/permission denied/);
  });

  it("deleting a contact removes everything about them", () => {
    const id = contact(ownerId, "(first_name, email) values ('Gone', 'gone@example.com')");
    const tag = db.as(ownerId, "insert into public.tags (name) values ('Temp') returning id;");
    db.as(ownerId, `insert into public.contact_tags (contact_id, tag_id) values ('${id}', '${tag}');`);
    db.as(ownerId, `insert into public.messages (contact_id, channel, direction, body) values ('${id}', 'note', 'internal', 'secret');`);
    db.as(ownerId, `insert into public.consents (contact_id, channel, granted, text, source) values ('${id}', 'sms', true, 'ok?', 'verbal');`);
    db.as(ownerId, `delete from public.contacts where id = '${id}';`);
    for (const table of ["contact_tags", "messages", "consents", "contact_activity"]) {
      expect(db.admin(`select count(*) from public.${table} where contact_id = '${id}'`), table).toBe("0");
    }
  });
});

describe("tags", () => {
  it("match case-insensitively, so upserts by slug don't duplicate", () => {
    db.as(teamId, "insert into public.tags (name) values ('Sangeet') on conflict (slug) do nothing;");
    db.as(teamId, "insert into public.tags (name) values ('sangeet') on conflict (slug) do nothing;");
    expect(db.rows(teamId, "select name from public.tags where slug = 'sangeet'")).toEqual([{ name: "Sangeet" }]);
  });

  it("team members can tag but only the owner deletes or renames tags", () => {
    const tag = db.as(teamId, "insert into public.tags (name) values ('Mehndi') returning id;");
    db.as(teamId, `delete from public.tags where id = '${tag}';`);
    db.as(teamId, `update public.tags set name = 'Renamed' where id = '${tag}';`);
    expect(db.rows(ownerId, `select name from public.tags where id = '${tag}'`)).toEqual([{ name: "Mehndi" }]);
    db.as(ownerId, `delete from public.tags where id = '${tag}';`);
    expect(db.rows(ownerId, `select id from public.tags where id = '${tag}'`)).toEqual([]);
  });
});

describe("consents", () => {
  it("are append-only evidence recorded as yourself", () => {
    const id = contact(teamId, "(first_name) values ('Consent')");
    db.as(teamId, `insert into public.consents (contact_id, channel, granted, text, source) values ('${id}', 'sms', true, 'OK to text?', 'verbal');`);
    expect(db.rows(teamId, `select recorded_by from public.consents where contact_id = '${id}'`)).toEqual([{ recorded_by: teamId }]);
    expect(() =>
      db.as(teamId, `insert into public.consents (contact_id, channel, granted, text, source, recorded_by) values ('${id}', 'sms', true, 'x', 'verbal', '${ownerId}');`),
    ).toThrow(/row-level security/);
    expect(() => db.as(ownerId, `update public.consents set granted = false;`)).toThrow(/permission denied/);
    expect(() => db.as(ownerId, `delete from public.consents;`)).toThrow(/permission denied/);
    expect(() =>
      db.as(teamId, `insert into public.consents (contact_id, channel, granted, text, source) values ('${id}', 'sms', true, '  ', 'verbal');`),
    ).toThrow(/check constraint/);
  });
});

describe("messages (notes)", () => {
  it("members add notes as themselves; only the author edits; owner deletes", () => {
    const id = contact(teamId, "(first_name) values ('Notes')");
    const note = db.as(teamId, `insert into public.messages (contact_id, channel, direction, body) values ('${id}', 'note', 'internal', 'Loves candids') returning id;`);
    db.as(ownerId, `update public.messages set body = 'edited by owner' where id = '${note}';`);
    expect(db.rows(teamId, `select body from public.messages where id = '${note}'`)).toEqual([{ body: "Loves candids" }]);
    db.as(teamId, `update public.messages set body = 'Loves candid shots' where id = '${note}';`);
    expect(db.rows(teamId, `select body from public.messages where id = '${note}'`)).toEqual([{ body: "Loves candid shots" }]);
    db.as(teamId, `delete from public.messages where id = '${note}';`);
    expect(db.rows(ownerId, `select id from public.messages where id = '${note}'`)).toHaveLength(1);
    db.as(ownerId, `delete from public.messages where id = '${note}';`);
    expect(db.rows(ownerId, `select id from public.messages where id = '${note}'`)).toHaveLength(0);
  });

  it("can't be used to fake email/SMS history or impersonate another author", () => {
    const id = contact(teamId, "(first_name) values ('Fake msg')");
    expect(() =>
      db.as(teamId, `insert into public.messages (contact_id, channel, direction, body) values ('${id}', 'email', 'out', 'hi');`),
    ).toThrow(/row-level security/);
    expect(() =>
      db.as(teamId, `insert into public.messages (contact_id, channel, direction, body, author_id) values ('${id}', 'note', 'internal', 'x', '${ownerId}');`),
    ).toThrow(/row-level security/);
  });
});

describe("saved views", () => {
  it("are private unless shared", () => {
    db.as(teamId, `insert into public.saved_views (name, filters) values ('Mine', '{"tag":"VIP"}');`);
    db.as(ownerId, `insert into public.saved_views (name, filters, shared) values ('Team view', '{}', true);`);
    db.as(ownerId, `insert into public.saved_views (name, filters) values ('Owner private', '{}');`);
    expect(db.rows<{ name: string }>(teamId, "select name from public.saved_views order by name").map((v) => v.name)).toEqual(["Mine", "Team view"]);
    db.as(teamId, "delete from public.saved_views where name = 'Team view';");
    expect(db.rows(ownerId, "select id from public.saved_views where name = 'Team view'")).toHaveLength(1);
  });
});

describe("imports", () => {
  it("are owner-only", () => {
    expect(() => db.as(teamId, "insert into public.imports (filename) values ('x.csv');")).toThrow(/row-level security/);
    const id = db.as(ownerId, "insert into public.imports (filename) values ('ghl.csv') returning id;");
    expect(db.rows(teamId, "select * from public.imports")).toEqual([]);
    expect(db.rows(ownerId, `select created_by from public.imports where id = '${id}'`)).toEqual([{ created_by: ownerId }]);
  });
});

describe("contact_list view", () => {
  it("adds display name, tags, stages and event months, and respects RLS", () => {
    const id = contact(teamId, "(first_name, last_name) values ('Meera', 'Patel')");
    const tag = db.as(teamId, "insert into public.tags (name) values ('2027') on conflict (slug) do update set name = excluded.name returning id;");
    db.as(teamId, `insert into public.contact_tags (contact_id, tag_id) values ('${id}', '${tag}');`);
    db.as(teamId, `insert into public.opportunities (contact_id, pipeline_id, stage_key, event_dates)
      values ('${id}', '${pipelineId()}', 'booked', '[{"name":"Sangeet","date":"2027-05-14"},{"name":"Ceremony","date":"2027-05-15"}]');`);

    expect(db.rows(teamId, `select display_name, tag_names, stage_keys, event_months, first_event_date from public.contact_list where id = '${id}'`)).toEqual([
      { display_name: "Meera Patel", tag_names: ["2027"], stage_keys: ["booked"], event_months: ["2027-05"], first_event_date: "2027-05-14" },
    ]);
    expect(db.rows(outsider, "select id from public.contact_list")).toEqual([]);
    expect(() => db.as(null, "select id from public.contact_list;")).toThrow(/permission denied/);
  });
});

describe("find_contacts_for_import", () => {
  it("matches on email, phone or GoHighLevel id, under RLS", () => {
    const a = contact(ownerId, "(first_name, email) values ('E', 'match@example.com')");
    const b = contact(ownerId, "(first_name, phone) values ('P', '+14155550199')");
    const c = contact(ownerId, "(first_name, ghl_contact_id) values ('G', 'ghl_match')");
    const found = db.rows<{ id: string }>(
      teamId,
      "select id from public.find_contacts_for_import(array['match@example.com'], array['+14155550199'], array['ghl_match'])",
    );
    expect(found.map((r) => r.id).sort()).toEqual([a, b, c].sort());
    expect(db.rows(outsider, "select id from public.find_contacts_for_import(array['match@example.com'], '{}', '{}')")).toEqual([]);
  });
});

describe("duplicates and merge", () => {
  it("lists contacts sharing an email or phone", () => {
    const a = contact(ownerId, "(first_name, email) values ('Dup', 'dup@example.com')");
    const b = contact(ownerId, "(first_name, email) values ('Dup2', 'DUP@example.com')");
    expect(db.rows(ownerId, `select matched_on from public.contact_duplicates where contact_id in ('${a}', '${b}') and duplicate_id in ('${a}', '${b}')`)).toEqual([
      { matched_on: "email" },
    ]);
  });

  it("merges everything into the kept contact in one step", () => {
    const keep = contact(ownerId, "(first_name, email, city, dnd_sms) values ('Priya', 'priya.m@example.com', null, false)");
    const dup = contact(ownerId, "(first_name, last_name, email, phone, city, dnd_sms, ghl_contact_id) values ('Pri', 'Sharma', 'priya.m@example.com', '+14155550177', 'Fresno', true, 'ghl_dup')");
    const t1 = db.as(ownerId, "insert into public.tags (name) values ('MergeA') returning id;");
    const t2 = db.as(ownerId, "insert into public.tags (name) values ('MergeB') returning id;");
    db.as(ownerId, `insert into public.contact_tags (contact_id, tag_id) values ('${keep}', '${t1}'), ('${dup}', '${t1}'), ('${dup}', '${t2}');`);
    db.as(ownerId, `insert into public.opportunities (contact_id, pipeline_id, stage_key) values ('${dup}', '${pipelineId()}', 'booked');`);
    db.as(ownerId, `insert into public.messages (contact_id, channel, direction, body) values ('${dup}', 'note', 'internal', 'from dup');`);
    // A note by someone else must move too (the owner can't edit it directly).
    db.as(teamId, `insert into public.messages (contact_id, channel, direction, body) values ('${dup}', 'note', 'internal', 'team note');`);
    db.as(ownerId, `insert into public.consents (contact_id, channel, granted, text, source) values ('${dup}', 'sms', true, 'ok?', 'verbal');`);

    db.as(ownerId, `select public.merge_contacts('${keep}', '${dup}', array['first_name']);`);

    expect(db.rows(ownerId, `select first_name, last_name, phone, city, dnd_sms, ghl_contact_id from public.contacts where id = '${keep}'`)).toEqual([
      { first_name: "Pri", last_name: "Sharma", phone: "+14155550177", city: "Fresno", dnd_sms: true, ghl_contact_id: "ghl_dup" },
    ]);
    expect(db.rows(ownerId, `select id from public.contacts where id = '${dup}'`)).toEqual([]);
    expect(db.rows<{ tag_names: string[] }>(ownerId, `select tag_names from public.contact_list where id = '${keep}'`)[0].tag_names).toEqual(["MergeA", "MergeB"]);
    expect(db.admin(`select count(*) from public.opportunities where contact_id = '${keep}'`)).toBe("1");
    expect(db.admin(`select count(*) from public.messages where contact_id = '${keep}'`)).toBe("2");
    expect(db.admin(`select count(*) from public.consents where contact_id = '${keep}'`)).toBe("1");
    const kinds = activity(keep).map((a) => a.kind);
    expect(kinds.at(-1)).toBe("contact.merged");
    expect(kinds.filter((k) => k === "contact.updated")).toHaveLength(0);
  });

  it("is owner-only and rejects unknown fields", () => {
    const a = contact(ownerId, "(first_name) values ('M1')");
    const b = contact(ownerId, "(first_name) values ('M2')");
    expect(() => db.as(teamId, `select public.merge_contacts('${a}', '${b}');`)).toThrow(/only_owner_can_merge/);
    expect(() => db.as(ownerId, `select public.merge_contacts('${a}', '${b}', array['role']);`)).toThrow(/merge_field_not_allowed/);
    expect(() => db.as(ownerId, `select public.merge_contacts('${a}', '${a}');`)).toThrow(/merge_same_contact/);
    expect(db.rows(ownerId, `select id from public.contacts where id in ('${a}', '${b}')`)).toHaveLength(2);
  });
});
