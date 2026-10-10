import { describe, expect, it } from "vitest";
import { normalizeRow, type MappedRow } from "@/lib/contacts/import-mapping";
import { planBatch, type ExistingContact } from "@/lib/contacts/import-plan";

let n = 0;
const newId = () => `new-${++n}`;

function rows(...mapped: MappedRow[]) {
  return mapped.map((m, i) => {
    const r = normalizeRow(m);
    if (!r.ok) throw new Error(r.error);
    return { index: i + 2, row: r.row };
  });
}

const existing = (over: Partial<ExistingContact>): ExistingContact => ({
  id: "existing-1",
  email: null,
  phone: null,
  ghl_contact_id: null,
  first_name: null,
  last_name: null,
  partner_name: null,
  city: null,
  state: null,
  country: null,
  language: null,
  source: null,
  referral_by: null,
  has_opportunity: false,
  ...over,
});

describe("planBatch", () => {
  it("creates new contacts with generated ids", () => {
    const plan = planBatch(rows({ first_name: "Priya", email: "priya@example.com" }), [], newId);
    expect(plan.contacts).toHaveLength(1);
    expect(plan.contacts[0]).toMatchObject({ isNew: true, insert: { first_name: "Priya", email: "priya@example.com" } });
    expect(plan.outcomes.get(2)).toBe("created");
  });

  it("combines rows for the same person within a file (email, then phone)", () => {
    const plan = planBatch(
      rows(
        { first_name: "Priya", email: "priya@example.com", tags: "VIP" },
        { phone: "4155550123", email: "PRIYA@example.com", tags: "vip, 2027", city: "Fresno" },
        { phone: "(415) 555-0123", partner_name: "Rohan" },
      ),
      [],
      newId,
    );
    expect(plan.contacts).toHaveLength(1);
    expect(plan.contacts[0].insert).toMatchObject({ first_name: "Priya", phone: "+14155550123", city: "Fresno", partner_name: "Rohan" });
    expect(plan.contacts[0].tags).toEqual(["VIP", "2027"]);
    expect([...plan.outcomes.values()]).toEqual(["created", "merged_in_file", "merged_in_file"]);
  });

  it("only fills blanks on existing contacts, never overwrites", () => {
    const plan = planBatch(
      rows({ first_name: "P.", last_name: "Sharma", email: "priya@example.com", city: "Fresno", dnd: "true" }),
      [existing({ email: "priya@example.com", first_name: "Priya" })],
      newId,
    );
    expect(plan.contacts).toHaveLength(1);
    expect(plan.contacts[0]).toMatchObject({ id: "existing-1", isNew: false });
    expect(plan.contacts[0].patch).toEqual({ last_name: "Sharma", city: "Fresno", dnd_sms: true, dnd_email: true });
    expect(plan.outcomes.get(2)).toBe("updated");
  });

  it("matches existing contacts on GoHighLevel id even when email changed", () => {
    const plan = planBatch(rows({ ghl_contact_id: "c_1", email: "new@example.com" }), [existing({ ghl_contact_id: "c_1", email: "old@example.com" })], newId);
    expect(plan.contacts[0].id).toBe("existing-1");
    expect(plan.contacts[0].patch).toEqual({});
  });

  it("adds an opportunity to an existing contact only if they have none, or it has a GoHighLevel id", () => {
    const withOpp = existing({ email: "a@b.co", has_opportunity: true });
    expect(planBatch(rows({ email: "a@b.co", stage: "New" }), [withOpp], newId).contacts[0].opportunities).toHaveLength(0);
    expect(
      planBatch(rows({ email: "a@b.co", stage: "New", ghl_opportunity_id: "o1" }), [withOpp], newId).contacts[0].opportunities,
    ).toHaveLength(1);
    expect(planBatch(rows({ email: "a@b.co", stage: "New" }), [existing({ email: "a@b.co" })], newId).contacts[0].opportunities).toHaveLength(1);
  });

  it("doesn't add the same opportunity twice from one file", () => {
    const plan = planBatch(
      rows({ email: "a@b.co", ghl_opportunity_id: "o1", stage: "x" }, { email: "a@b.co", ghl_opportunity_id: "o1", stage: "x" }),
      [],
      newId,
    );
    expect(plan.contacts[0].opportunities).toHaveLength(1);
  });
});
