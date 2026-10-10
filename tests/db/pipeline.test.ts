import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db";

let db: TestDb;
let ownerId: string;
let teamId: string;
let pipelineId: string;
let contactId: string;

beforeAll(() => {
  db = createTestDb();
  db.admin(`insert into public.invites (email, role) values ('owner@rhipo.test', 'owner'), ('team@rhipo.test', 'team');`);
  ownerId = db.signUp("owner@rhipo.test");
  teamId = db.signUp("team@rhipo.test");
  pipelineId = db.admin("select id from public.pipelines where key = 'weddings'");
  contactId = db.as(teamId, "insert into public.contacts (first_name, last_name, partner_name) values ('Priya', 'Sharma', 'Rohan') returning id;");
});

afterAll(() => db?.drop());

const newOpp = (extra = "") =>
  db.as(teamId, `insert into public.opportunities (contact_id, pipeline_id, stage_key${extra ? ", " + extra.split("=")[0] : ""})
    values ('${contactId}', '${pipelineId}', 'new_inquiry'${extra ? ", " + extra.split("=").slice(1).join("=") : ""}) returning id;`);
const opp = (id: string) =>
  db.rows<{ stage_key: string; status: string; lost_reason: string | null; moved: boolean }>(
    teamId,
    `select stage_key, status, lost_reason, stage_changed_at > now() - interval '1 minute' as moved from public.opportunities where id = '${id}'`,
  )[0];

describe("status follows the stage", () => {
  it("is open, then won from Booked onwards, then lost with a reason", () => {
    const id = newOpp();
    expect(opp(id)).toMatchObject({ status: "open" });
    db.as(teamId, `update public.opportunities set stage_key = 'booked' where id = '${id}';`);
    expect(opp(id)).toMatchObject({ stage_key: "booked", status: "won" });
    db.as(teamId, `update public.opportunities set stage_key = 'delivered' where id = '${id}';`);
    expect(opp(id).status).toBe("won");
    db.as(teamId, `update public.opportunities set stage_key = 'cold' where id = '${id}';`);
    expect(opp(id).status).toBe("open");
  });

  it("refuses Lost without a reason, and clears the reason when it comes back", () => {
    const id = newOpp();
    expect(() => db.as(teamId, `update public.opportunities set stage_key = 'lost' where id = '${id}';`)).toThrow(/check constraint/);
    db.as(teamId, `update public.opportunities set stage_key = 'lost', lost_reason = 'price' where id = '${id}';`);
    expect(opp(id)).toMatchObject({ status: "lost", lost_reason: "price" });
    db.as(teamId, `update public.opportunities set stage_key = 'contacted' where id = '${id}';`);
    expect(opp(id)).toMatchObject({ status: "open", lost_reason: null });
  });

  it("ignores a status sent by the app that contradicts the stage", () => {
    const id = newOpp("status='won'");
    expect(opp(id).status).toBe("open");
  });

  it("only resets the time-in-stage clock on a real move", () => {
    const id = newOpp();
    db.admin(`alter table public.opportunities disable trigger opportunities_sync_stage;
      update public.opportunities set stage_changed_at = '2026-01-01' where id = '${id}';
      alter table public.opportunities enable trigger opportunities_sync_stage;`);
    db.as(teamId, `update public.opportunities set venue = 'Oak Hall' where id = '${id}';`);
    expect(opp(id).moved).toBe(false);
    db.as(teamId, `update public.opportunities set stage_key = 'contacted' where id = '${id}';`);
    expect(opp(id).moved).toBe(true);
  });
});

describe("event dates", () => {
  it("must be a list of { name, date: YYYY-MM-DD }", () => {
    newOpp(`event_dates='[{"name":"Sangeet","date":"2027-05-14"}]'`);
    for (const bad of [`'[{"name":"x","date":"May 14"}]'`, `'[{"name":"x"}]'`, `'["2027-05-14"]'`, `'{}'`]) {
      expect(() => newOpp(`event_dates=${bad}`), bad).toThrow(/check constraint/);
    }
  });
});

describe("stages", () => {
  it("keys and kinds can't change, names and order can (owner only)", () => {
    expect(() => db.as(ownerId, "update public.stages set key = 'booked_new' where key = 'booked';")).toThrow(/stage_keys_are_fixed/);
    expect(() => db.as(ownerId, "update public.stages set kind = 'lost' where key = 'booked';")).toThrow(/stage_kind_is_fixed/);
    db.as(ownerId, "update public.stages set name = 'Signed', position = 6 where key = 'booked';");
    expect(db.rows(teamId, "select name from public.stages where key = 'booked'")).toEqual([{ name: "Signed" }]);
    db.as(teamId, "update public.stages set name = 'Team rename' where key = 'booked';");
    expect(db.rows(teamId, "select name from public.stages where key = 'booked'")).toEqual([{ name: "Signed" }]);
  });

  it("can't be deleted from the app", () => {
    expect(() => db.as(ownerId, "delete from public.stages where key = 'cold';")).toThrow(/permission denied/);
  });

  it("mark Booked through Delivered as won", () => {
    expect(db.rows<{ key: string }>(teamId, "select key from public.stages where is_won order by position").map((s) => s.key)).toEqual([
      "booked", "pre_event", "event_done", "delivered",
    ]);
  });
});

describe("pipeline_cards view", () => {
  it("adds contact and event details, and respects RLS", () => {
    const id = newOpp(`event_dates='[{"name":"Reception","date":"2027-05-16"},{"name":"Sangeet","date":"2027-05-14"}]'`);
    db.as(teamId, `update public.opportunities set assigned_to = '${teamId}' where id = '${id}';`);
    db.as(teamId, `update public.users set full_name = 'Sam' where id = '${teamId}';`);
    expect(
      db.rows(teamId, `select contact_name, partner_name, first_event_date, first_event_month, assigned_name from public.pipeline_cards where id = '${id}'`),
    ).toEqual([{ contact_name: "Priya Sharma", partner_name: "Rohan", first_event_date: "2027-05-14", first_event_month: "2027-05", assigned_name: "Sam" }]);
    expect(db.rows("00000000-0000-0000-0000-000000000099", "select id from public.pipeline_cards")).toEqual([]);
    expect(() => db.as(null, "select id from public.pipeline_cards;")).toThrow(/permission denied/);
  });

  it("records each move on the contact's timeline", () => {
    const id = newOpp();
    db.as(teamId, `update public.opportunities set stage_key = 'consult_scheduled' where id = '${id}';`);
    expect(
      db.rows(teamId, `select kind, data from public.contact_activity where opportunity_id = '${id}' order by at`),
    ).toEqual([
      { kind: "opportunity.created", data: { stage: "new_inquiry" } },
      { kind: "stage.changed", data: { from: "new_inquiry", to: "consult_scheduled" } },
    ]);
  });
});
