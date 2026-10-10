"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { IMPORT_FIELD_KEYS, normalizeRow } from "@/lib/contacts/import-mapping";
import { findExisting, importBatch, IMPORT_BATCH_SIZE, MAX_STORED_ERRORS, type BatchResult, type RowIssue } from "@/lib/contacts/import-server";
import { createClient } from "@/lib/supabase/server";

/**
 * CSV import, owner only. The browser parses the file and applies the column mapping;
 * every batch is re-validated here, so nothing from the client is trusted.
 */

async function ownerClient() {
  const user = await getCurrentUser();
  if (user?.role !== "owner") throw new Error("Only the owner can import contacts.");
  return createClient();
}

const mappedRowSchema = z.record(z.enum(IMPORT_FIELD_KEYS), z.string().max(10_000));
const rowsSchema = z.array(mappedRowSchema).max(IMPORT_BATCH_SIZE);
const stageMappingSchema = z.record(z.string().max(200), z.string().regex(/^[a-z_]*$/).max(40));

export type PreviewRow = {
  row: number;
  status: "error" | "existing" | "new";
  keys: string[];
  message?: string;
  warnings: string[];
};

/** Dry run for one batch: validity + whether each row matches an existing contact. Writes nothing. */
export async function previewBatch(input: { rows: unknown; stageMapping: unknown; startRow: number }): Promise<PreviewRow[]> {
  const supabase = await ownerClient();
  const rows = rowsSchema.parse(input.rows);
  const stageMapping = stageMappingSchema.parse(input.stageMapping);
  const startRow = z.number().int().min(2).parse(input.startRow);

  const normalized = rows.map((r) => normalizeRow(r, stageMapping));
  const ok = normalized.flatMap((n) => (n.ok ? [n.row] : []));
  const existing = await findExisting(supabase, {
    emails: ok.map((r) => r.contact.email).filter((v): v is string => Boolean(v)),
    phones: ok.map((r) => r.contact.phone).filter((v): v is string => Boolean(v)),
    ghlIds: ok.map((r) => r.contact.ghl_contact_id).filter((v): v is string => Boolean(v)),
  });
  const existingKeys = new Set(existing.flatMap((c) => [c.email && `email:${c.email}`, c.phone && `phone:${c.phone}`, c.ghl_contact_id && `ghl:${c.ghl_contact_id}`]));

  return normalized.map((n, i) => {
    const row = startRow + i;
    if (!n.ok) return { row, status: "error", keys: [], message: n.error, warnings: [] };
    const c = n.row.contact;
    const keys = [c.ghl_contact_id && `ghl:${c.ghl_contact_id}`, c.email && `email:${c.email}`, c.phone && `phone:${c.phone}`].filter(
      (k): k is string => Boolean(k),
    );
    return { row, status: keys.some((k) => existingKeys.has(k)) ? "existing" : "new", keys, warnings: n.row.warnings };
  });
}

export async function startImport(input: { filename: string; totalRows: number; mapping: unknown; ghl: boolean }): Promise<string> {
  const supabase = await ownerClient();
  const { data, error } = await supabase
    .from("imports")
    .insert({
      filename: z.string().trim().min(1).max(200).parse(input.filename),
      total_rows: z.number().int().min(0).max(1_000_000).parse(input.totalRows),
      source: input.ghl ? "gohighlevel" : "csv",
      mapping: z.record(z.string(), z.unknown()).parse(input.mapping),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't start the import.");
  return data.id as string;
}

export async function runImportBatch(input: {
  importId: string;
  rows: unknown;
  stageMapping: unknown;
  startRow: number;
}): Promise<BatchResult> {
  const supabase = await ownerClient();
  return importBatch(
    supabase,
    z.uuid().parse(input.importId),
    rowsSchema.parse(input.rows),
    stageMappingSchema.parse(input.stageMapping),
    z.number().int().min(2).parse(input.startRow),
  );
}

export async function finishImport(input: {
  importId: string;
  created: number;
  updated: number;
  skipped: number;
  errors: RowIssue[];
  failed?: boolean;
}): Promise<void> {
  const supabase = await ownerClient();
  const count = z.number().int().min(0);
  const issues = z.array(z.object({ row: z.number().int(), message: z.string().max(500) })).parse(input.errors);
  await supabase
    .from("imports")
    .update({
      status: input.failed ? "failed" : "completed",
      created_count: count.parse(input.created),
      updated_count: count.parse(input.updated),
      skipped_count: count.parse(input.skipped),
      error_count: issues.length,
      errors: issues.slice(0, MAX_STORED_ERRORS),
    })
    .eq("id", z.uuid().parse(input.importId));
  revalidatePath("/contacts");
}

/** Deletes the contacts this import created. Contacts it only updated are left alone. */
export async function undoImport(importId: string): Promise<void> {
  const supabase = await ownerClient();
  const id = z.uuid().parse(importId);
  const { error } = await supabase.from("contacts").delete().eq("import_id", id);
  if (error) throw new Error("Couldn't undo the import.");
  await supabase.from("imports").update({ status: "undone" }).eq("id", id);
  await supabase.from("audit_log").insert({ action: "import.undone", entity: "imports", entity_id: id });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/imports/${id}`);
}
