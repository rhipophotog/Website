import type { NormalizedContact, NormalizedOpportunity, NormalizedRow } from "./import-mapping";

/**
 * Decides, for one batch of normalised rows, which contacts to create and which existing
 * contacts to update. Pure: the caller supplies the existing matches and an id generator.
 *
 * Rules (SPEC §4/§5 dedupe):
 * - A row matches an existing contact, or an earlier row, on GoHighLevel id, email or phone.
 * - Existing contacts are never overwritten: only blank fields are filled in, tags are added.
 * - DND flags only ever switch on.
 * - An opportunity is added to an existing contact only when it carries a GoHighLevel
 *   opportunity id (re-imports stay idempotent) or the contact has no opportunity yet.
 */

export type ExistingContact = {
  id: string;
  email: string | null;
  phone: string | null;
  ghl_contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  partner_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  language: string | null;
  source: string | null;
  referral_by: string | null;
  has_opportunity: boolean;
};

export type ContactInsert = NormalizedContact & { id: string };

export type PlannedContact = {
  id: string;
  isNew: boolean;
  insert?: ContactInsert;
  patch: Partial<NormalizedContact>;
  tags: string[];
  notes: string[];
  opportunities: NormalizedOpportunity[];
  rows: number[];
};

export type BatchPlan = {
  contacts: PlannedContact[];
  /** row index → what happened to it */
  outcomes: Map<number, "created" | "updated" | "merged_in_file">;
};

const FILLABLE = [
  "first_name",
  "last_name",
  "partner_name",
  "email",
  "phone",
  "ghl_contact_id",
  "city",
  "state",
  "country",
  "language",
  "source",
  "referral_by",
] as const;

export function planBatch(
  rows: { index: number; row: NormalizedRow }[],
  existing: ExistingContact[],
  newId: () => string,
): BatchPlan {
  type Entry = PlannedContact & { current: Record<string, unknown>; hasOpportunity: boolean };
  const entries: Entry[] = [];
  const byKey = new Map<string, Entry>();
  const outcomes: BatchPlan["outcomes"] = new Map();

  const keysOf = (c: { email: string | null; phone: string | null; ghl_contact_id: string | null }) =>
    [c.ghl_contact_id && `ghl:${c.ghl_contact_id}`, c.email && `email:${c.email}`, c.phone && `phone:${c.phone}`].filter(
      Boolean,
    ) as string[];

  const index = (entry: Entry) => {
    for (const key of keysOf(entry.current as ExistingContact)) if (!byKey.has(key)) byKey.set(key, entry);
  };

  const existingEntries = new Map<string, Entry>();
  const existingFor = (c: ExistingContact): Entry => {
    let entry = existingEntries.get(c.id);
    if (!entry) {
      entry = {
        id: c.id,
        isNew: false,
        patch: {},
        tags: [],
        notes: [],
        opportunities: [],
        rows: [],
        current: { ...c },
        hasOpportunity: c.has_opportunity,
      };
      existingEntries.set(c.id, entry);
    }
    return entry;
  };
  const existingByKey = new Map<string, ExistingContact>();
  for (const c of existing) for (const key of keysOf(c)) if (!existingByKey.has(key)) existingByKey.set(key, c);

  for (const { index: rowIndex, row } of rows) {
    const keys = keysOf(row.contact);
    let entry = keys.map((k) => byKey.get(k)).find(Boolean);
    if (!entry) {
      const match = keys.map((k) => existingByKey.get(k)).find(Boolean);
      if (match) {
        entry = existingFor(match);
        if (!entries.includes(entry)) entries.push(entry);
      }
    }

    if (!entry) {
      const id = newId();
      entry = {
        id,
        isNew: true,
        insert: { ...row.contact, id },
        patch: {},
        tags: [],
        notes: [],
        opportunities: [],
        rows: [],
        current: { ...row.contact },
        hasOpportunity: false,
      };
      entries.push(entry);
      outcomes.set(rowIndex, "created");
    } else {
      outcomes.set(rowIndex, entry.isNew ? "merged_in_file" : "updated");
      for (const field of FILLABLE) {
        const incoming = row.contact[field];
        if (incoming != null && entry.current[field] == null) {
          entry.current[field] = incoming;
          if (entry.isNew && entry.insert) (entry.insert as Record<string, unknown>)[field] = incoming;
          else (entry.patch as Record<string, unknown>)[field] = incoming;
        }
      }
      for (const flag of ["dnd_sms", "dnd_email"] as const) {
        if (row.contact[flag] && !entry.current[flag]) {
          entry.current[flag] = true;
          if (entry.isNew && entry.insert) entry.insert[flag] = true;
          else entry.patch[flag] = true;
        }
      }
    }

    entry.rows.push(rowIndex);
    index(entry);

    for (const tag of row.tags) {
      if (!entry.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) entry.tags.push(tag);
    }
    if (row.note && !entry.notes.includes(row.note)) entry.notes.push(row.note);

    const opp = row.opportunity;
    if (opp) {
      const sameId = opp.ghl_opportunity_id && entry.opportunities.some((o) => o.ghl_opportunity_id === opp.ghl_opportunity_id);
      const allowed = opp.ghl_opportunity_id ? !sameId : !entry.hasOpportunity;
      if (allowed) {
        entry.opportunities.push(opp);
        entry.hasOpportunity = true;
      }
    }
  }

  return {
    contacts: entries.map((e) => ({
      id: e.id,
      isNew: e.isNew,
      insert: e.insert,
      patch: e.patch,
      tags: e.tags,
      notes: e.notes,
      opportunities: e.opportunities,
      rows: e.rows,
    })),
    outcomes,
  };
}
