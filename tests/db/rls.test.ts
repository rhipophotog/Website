import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, SqlError, type TestDb } from "./db";

let db: TestDb;
let ownerId: string;
let teamId: string;

beforeAll(() => {
  db = createTestDb();
  db.admin(`insert into public.invites (email, role) values ('owner@rhipo.test', 'owner'), ('team@rhipo.test', 'team');`);
  ownerId = db.signUp("owner@rhipo.test");
  teamId = db.signUp("Team@Rhipo.test"); // invite match is case-insensitive
});

afterAll(() => db?.drop());

const contactsOf = (userId: string | null) => db.rows<{ id: string }>(userId, "select id from public.contacts");
const insertContact = (userId: string, first = "Priya") =>
  db.as(userId, `insert into public.contacts (first_name, email) values ('${first}', '${first.toLowerCase()}@example.com') returning id;`);

describe("schema", () => {
  it("has row-level security enabled on every public table", () => {
    const missing = db.admin(`
      select coalesce(string_agg(c.relname, ','), '') from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;`);
    expect(missing).toBe("");
  });

  it("gives every public table id, created_at and updated_at", () => {
    const tables = db.admin(`
      select string_agg(table_name, ',') from (
        select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
        except
        select table_name from information_schema.columns where table_schema = 'public'
          and column_name in ('id', 'created_at', 'updated_at')
          group by table_name having count(*) = 3
      ) t;`);
    expect(tables).toBe("");
  });

  it("seeds the 11 wedding stages in order", () => {
    const stages = db.rows<{ key: string }>(ownerId, "select key from public.stages order by position");
    expect(stages.map((s) => s.key)).toEqual([
      "new_inquiry", "contacted", "consult_scheduled", "consult_done", "proposal_sent",
      "booked", "pre_event", "event_done", "delivered", "lost", "cold",
    ]);
  });
});

describe("sign-up", () => {
  it("creates a profile with the invited role and marks the invite accepted", () => {
    const users = db.rows<{ id: string; role: string }>(ownerId, "select id, role from public.users order by role");
    expect(users).toEqual([
      { id: ownerId, role: "owner" },
      { id: teamId, role: "team" },
    ]);
    expect(db.admin("select count(*) from public.invites where accepted_at is null")).toBe("0");
  });

  it("rejects anyone who wasn't invited", () => {
    expect(() => db.signUp("stranger@example.com")).toThrow(/signup_not_invited/);
    expect(db.admin("select count(*) from auth.users where email = 'stranger@example.com'")).toBe("0");
  });
});

describe("anonymous visitors", () => {
  it("can't read or write any table", () => {
    for (const table of ["users", "invites", "pipelines", "stages", "contacts", "opportunities", "audit_log"]) {
      expect(() => db.as(null, `select * from public.${table};`), table).toThrow(SqlError);
    }
    expect(() => db.as(null, "insert into public.contacts (first_name) values ('x');")).toThrow(/permission denied/);
  });
});

describe("signed-in users who aren't studio members", () => {
  it("see nothing", () => {
    const outsider = "00000000-0000-0000-0000-000000000099";
    insertContact(ownerId, "Visible");
    expect(contactsOf(outsider)).toEqual([]);
    expect(db.rows(outsider, "select * from public.stages")).toEqual([]);
    expect(() => insertContact(outsider)).toThrow(/row-level security/);
  });
});

describe("team member", () => {
  it("can add, read and edit contacts and opportunities", () => {
    const id = insertContact(teamId, "Anika");
    expect(contactsOf(teamId).map((c) => c.id)).toContain(id);

    db.as(teamId, `update public.contacts set partner_name = 'Rohan' where id = '${id}';`);
    expect(db.rows(ownerId, `select partner_name from public.contacts where id = '${id}'`)).toEqual([{ partner_name: "Rohan" }]);

    const pipeline = db.admin("select id from public.pipelines where key = 'weddings'");
    db.as(teamId, `insert into public.opportunities (contact_id, pipeline_id, stage_key) values ('${id}', '${pipeline}', 'new_inquiry');`);
    expect(db.rows(teamId, `select stage_key from public.opportunities where contact_id = '${id}'`)).toEqual([{ stage_key: "new_inquiry" }]);
  });

  it("can't delete contacts (owner-only hard delete)", () => {
    const id = insertContact(ownerId, "Keep");
    db.as(teamId, `delete from public.contacts where id = '${id}';`);
    expect(contactsOf(ownerId).map((c) => c.id)).toContain(id);
  });

  it("can't see or create invites", () => {
    expect(db.rows(teamId, "select * from public.invites")).toEqual([]);
    expect(() => db.as(teamId, "insert into public.invites (email) values ('friend@example.com');")).toThrow(/row-level security/);
  });

  it("can't change pipeline stages", () => {
    db.as(teamId, "update public.stages set name = 'Hacked' where key = 'booked';");
    expect(db.rows(ownerId, "select name from public.stages where key = 'booked'")).toEqual([{ name: "Booked" }]);
  });

  it("can edit their own profile but not promote themselves", () => {
    db.as(teamId, `update public.users set full_name = 'Sam', time_zone = 'America/New_York' where id = '${teamId}';`);
    expect(db.rows(teamId, `select full_name from public.users where id = '${teamId}'`)).toEqual([{ full_name: "Sam" }]);
    expect(() => db.as(teamId, `update public.users set role = 'owner' where id = '${teamId}';`)).toThrow(/only_owner_can_change_roles/);
  });

  it("can't edit someone else's profile", () => {
    db.as(teamId, `update public.users set full_name = 'Nope' where id = '${ownerId}';`);
    expect(db.rows(ownerId, `select full_name from public.users where id = '${ownerId}'`)).toEqual([{ full_name: null }]);
  });

  it("can append to the audit log only as themselves, and can't read it", () => {
    db.as(teamId, "insert into public.audit_log (action, entity) values ('test.event', 'contacts');");
    expect(() =>
      db.as(teamId, `insert into public.audit_log (action, entity, actor_id) values ('spoof', 'contacts', '${ownerId}');`),
    ).toThrow(/row-level security/);
    expect(db.rows(teamId, "select * from public.audit_log")).toEqual([]);
    expect(db.rows<{ actor_id: string }>(ownerId, "select actor_id from public.audit_log where action = 'test.event'")).toEqual([
      { actor_id: teamId },
    ]);
  });
});

describe("owner", () => {
  it("manages invites and deletes contacts", () => {
    db.as(ownerId, "insert into public.invites (email) values ('assistant@example.com');");
    expect(db.rows(ownerId, "select email from public.invites where accepted_at is null")).toEqual([{ email: "assistant@example.com" }]);

    const id = insertContact(ownerId, "Gone");
    db.as(ownerId, `delete from public.contacts where id = '${id}';`);
    expect(contactsOf(ownerId).map((c) => c.id)).not.toContain(id);
  });

  it("can't edit the audit log", () => {
    expect(() => db.as(ownerId, "delete from public.audit_log;")).toThrow(/permission denied/);
    expect(() => db.as(ownerId, "update public.audit_log set action = 'x';")).toThrow(/permission denied/);
  });

  it("can't leave the studio without an owner", () => {
    expect(() => db.as(ownerId, `update public.users set role = 'team' where id = '${ownerId}';`)).toThrow(/studio_needs_an_owner/);
  });

  it("can't delete themselves", () => {
    db.as(ownerId, `delete from public.users where id = '${ownerId}';`);
    expect(db.rows(ownerId, `select id from public.users where id = '${ownerId}'`)).toHaveLength(1);
  });
});

describe("data rules", () => {
  it("requires a lost reason when an opportunity is lost", () => {
    const contact = insertContact(ownerId, "Lost");
    const pipeline = db.admin("select id from public.pipelines where key = 'weddings'");
    expect(() =>
      db.as(ownerId, `insert into public.opportunities (contact_id, pipeline_id, stage_key, status) values ('${contact}', '${pipeline}', 'lost', 'lost');`),
    ).toThrow(/check constraint/);
  });

  it("only accepts known stage keys", () => {
    const contact = insertContact(ownerId, "Stage");
    const pipeline = db.admin("select id from public.pipelines where key = 'weddings'");
    expect(() =>
      db.as(ownerId, `insert into public.opportunities (contact_id, pipeline_id, stage_key) values ('${contact}', '${pipeline}', 'made_up');`),
    ).toThrow(/foreign key/);
  });

  it("stores phone numbers in E.164 only", () => {
    expect(() => db.as(ownerId, "insert into public.contacts (phone) values ('(415) 555-0123');")).toThrow(/check constraint/);
    db.as(ownerId, "insert into public.contacts (phone) values ('+14155550123');");
  });

  it("bumps updated_at on change", () => {
    const id = insertContact(ownerId, "Clock");
    db.admin(`alter table public.contacts disable trigger contacts_updated_at;
      update public.contacts set updated_at = '2020-01-01' where id = '${id}';
      alter table public.contacts enable trigger contacts_updated_at;`);
    db.as(ownerId, `update public.contacts set city = 'Fresno' where id = '${id}';`);
    const [row] = db.rows<{ fresh: boolean }>(ownerId, `select updated_at > now() - interval '1 minute' as fresh from public.contacts where id = '${id}'`);
    expect(row.fresh).toBe(true);
  });
});
