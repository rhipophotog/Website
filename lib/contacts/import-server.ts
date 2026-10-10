import { randomUUID } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { normalizeRow, type MappedRow, type StageMapping } from "./import-mapping";
import { planBatch, type ExistingContact } from "./import-plan";
import { defaultPipelineId, ensureTagIds, tagContacts } from "./queries";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const IMPORT_BATCH_SIZE = 250;
export const MAX_STORED_ERRORS = 500;

export type RowIssue = { row: number; message: string };

export type BatchResult = {
  created: number;
  updated: number;
  mergedInFile: number;
  skipped: number;
  errors: RowIssue[];
  warnings: RowIssue[];
};

export async function findExisting(
  supabase: Supabase,
  keys: { emails: string[]; phones: string[]; ghlIds: string[] },
): Promise<ExistingContact[]> {
  if (!keys.emails.length && !keys.phones.length && !keys.ghlIds.length) return [];
  const { data, error } = await supabase.rpc("find_contacts_for_import", {
    p_emails: keys.emails,
    p_phones: keys.phones,
    p_ghl_ids: keys.ghlIds,
  });
  if (error) throw new Error(`Couldn't look up existing contacts: ${error.message}`);
  return (data ?? []) as ExistingContact[];
}

/** Validate + dedupe + write one batch. `startRow` is the 1-based CSV line of rows[0] (header = line 1). */
export async function importBatch(
  supabase: Supabase,
  importId: string,
  rows: MappedRow[],
  stageMapping: StageMapping,
  startRow: number,
): Promise<BatchResult> {
  const result: BatchResult = { created: 0, updated: 0, mergedInFile: 0, skipped: 0, errors: [], warnings: [] };

  const valid: Parameters<typeof planBatch>[0] = [];
  rows.forEach((raw, i) => {
    const line = startRow + i;
    const normalized = normalizeRow(raw, stageMapping);
    if (!normalized.ok) {
      result.skipped++;
      result.errors.push({ row: line, message: normalized.error });
      return;
    }
    for (const w of normalized.row.warnings) result.warnings.push({ row: line, message: w });
    valid.push({ index: line, row: normalized.row });
  });

  const existing = await findExisting(supabase, {
    emails: valid.map((v) => v.row.contact.email).filter((v): v is string => Boolean(v)),
    phones: valid.map((v) => v.row.contact.phone).filter((v): v is string => Boolean(v)),
    ghlIds: valid.map((v) => v.row.contact.ghl_contact_id).filter((v): v is string => Boolean(v)),
  });

  const plan = planBatch(valid, existing, randomUUID);

  // 1. New contacts (ids generated here, so later steps can reference them without a round trip).
  const inserts = plan.contacts
    .filter((c) => c.isNew && c.insert)
    .map((c) => {
      const { created_at, ...fields } = c.insert!;
      return { ...fields, ...(created_at ? { created_at } : {}), import_id: importId };
    });
  if (inserts.length) {
    // defaultToNull: false so a row without created_at gets the column default instead of NULL.
    const { error } = await supabase.from("contacts").insert(inserts, { defaultToNull: false });
    if (error) throw new Error(`Couldn't create contacts: ${error.message}`);
  }

  // 2. Fill blanks on existing contacts.
  for (const c of plan.contacts.filter((c) => !c.isNew && Object.keys(c.patch).length)) {
    const { error } = await supabase.from("contacts").update(c.patch).eq("id", c.id);
    if (error) result.warnings.push({ row: c.rows[0], message: `Couldn't update existing contact: ${error.message}` });
  }

  // 3. Tags.
  const allTags = plan.contacts.flatMap((c) => c.tags);
  if (allTags.length) {
    await ensureTagIds(supabase, allTags);
    const { data: tagRows } = await supabase
      .from("tags")
      .select("id, slug")
      .in("slug", [...new Set(allTags.map((t) => t.toLowerCase()))]);
    const idBySlug = new Map((tagRows ?? []).map((t) => [t.slug as string, t.id as string]));
    await tagContacts(
      supabase,
      plan.contacts.flatMap((c) =>
        c.tags.map((t) => ({ contact_id: c.id, tag_id: idBySlug.get(t.toLowerCase())! })).filter((p) => p.tag_id),
      ),
    );
  }

  // 4. Opportunities.
  const opportunities = plan.contacts.flatMap((c) => c.opportunities.map((o) => ({ ...o, contact_id: c.id })));
  if (opportunities.length) {
    const pipeline_id = await defaultPipelineId(supabase);
    const withGhl = opportunities.filter((o) => o.ghl_opportunity_id).map((o) => ({ ...o, pipeline_id }));
    const withoutGhl = opportunities.filter((o) => !o.ghl_opportunity_id).map((o) => ({ ...o, pipeline_id }));
    if (withGhl.length) {
      const { error } = await supabase
        .from("opportunities")
        .upsert(withGhl, { onConflict: "ghl_opportunity_id", ignoreDuplicates: true });
      if (error) throw new Error(`Couldn't create opportunities: ${error.message}`);
    }
    if (withoutGhl.length) {
      const { error } = await supabase.from("opportunities").insert(withoutGhl);
      if (error) throw new Error(`Couldn't create opportunities: ${error.message}`);
    }
  }

  // 5. Notes, only for contacts this import created (re-imports don't repeat them).
  const notes = plan.contacts
    .filter((c) => c.isNew)
    .flatMap((c) => c.notes.map((body) => ({ contact_id: c.id, channel: "note", direction: "internal", body: `Imported note:\n${body}` })));
  if (notes.length) {
    const { error } = await supabase.from("messages").insert(notes);
    if (error) result.warnings.push({ row: startRow, message: `Couldn't save imported notes: ${error.message}` });
  }

  for (const outcome of plan.outcomes.values()) {
    if (outcome === "created") result.created++;
    else if (outcome === "updated") result.updated++;
    else result.mergedInFile++;
  }
  return result;
}
