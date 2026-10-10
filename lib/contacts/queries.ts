import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { SOURCE_KEYS } from "./fields";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const PAGE_SIZE = 50;

export const filtersSchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  tag: z.string().trim().max(60).catch("").default(""),
  source: z.enum([...SOURCE_KEYS, ""]).catch("").default(""),
  stage: z.string().regex(/^[a-z_]*$/).max(40).catch("").default(""),
  month: z.string().regex(/^(\d{4}-\d{2})?$/).catch("").default(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type ContactFilters = z.infer<typeof filtersSchema>;

export function parseFilters(params: Record<string, string | string[] | undefined>): ContactFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return filtersSchema.parse(flat);
}

export function filtersToQuery(filters: Partial<ContactFilters>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v && !(k === "page" && v === 1)) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Strip characters that have meaning inside a PostgREST `or=(...)` filter. */
export function searchTerm(q: string): string {
  return q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

export type ContactListRow = {
  id: string;
  display_name: string;
  partner_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  tag_names: string[];
  stage_keys: string[];
  first_event_date: string | null;
  created_at: string;
};

export async function listContacts(supabase: Supabase, filters: ContactFilters) {
  let query = supabase
    .from("contact_list")
    .select("id, display_name, partner_name, email, phone, source, tag_names, stage_keys, first_event_date, created_at", {
      count: "exact",
    });

  const term = searchTerm(filters.q);
  if (term) {
    const digits = term.replace(/\D/g, "");
    const clauses = [`display_name.ilike."*${term}*"`, `partner_name.ilike."*${term}*"`, `email.ilike."*${term}*"`];
    if (digits.length >= 3) clauses.push(`phone.ilike."*${digits}*"`);
    query = query.or(clauses.join(","));
  }
  if (filters.tag) query = query.contains("tag_names", [filters.tag]);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.stage) query = query.contains("stage_keys", [filters.stage]);
  if (filters.month) query = query.contains("event_months", [filters.month]);

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as ContactListRow[], count: count ?? 0, error };
}

/** Find-or-create tags by name (case-insensitive). Returns their ids. */
export async function ensureTagIds(supabase: Supabase, names: string[]): Promise<string[]> {
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
  if (unique.length === 0) return [];
  const { error } = await supabase
    .from("tags")
    .upsert(unique.map((name) => ({ name })), { onConflict: "slug", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't save tags: ${error.message}`);
  const { data, error: readError } = await supabase.from("tags").select("id, slug").in("slug", unique.map((n) => n.toLowerCase()));
  if (readError) throw new Error(`Couldn't read tags: ${readError.message}`);
  return (data ?? []).map((t) => t.id as string);
}

export async function tagContacts(supabase: Supabase, pairs: { contact_id: string; tag_id: string }[]) {
  if (pairs.length === 0) return;
  const { error } = await supabase.from("contact_tags").upsert(pairs, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't tag contacts: ${error.message}`);
}

export async function defaultPipelineId(supabase: Supabase): Promise<string> {
  const { data, error } = await supabase.from("pipelines").select("id").eq("is_default", true).single();
  if (error || !data) throw new Error("No default pipeline");
  return data.id as string;
}
