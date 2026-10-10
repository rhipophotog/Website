import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SOURCE_KEYS, SOURCES } from "@/lib/contacts/fields";
import { defaultPipelineId } from "@/lib/contacts/queries";
import { formatMoney, type Card, type Stage } from "@/lib/pipeline/board";
import { createClient } from "@/lib/supabase/server";
import { Board } from "./board";

export const metadata: Metadata = { title: "Pipeline" };

const filtersSchema = z.object({
  month: z.string().regex(/^(\d{4}-\d{2})?$/).catch("").default(""),
  source: z.enum([...SOURCE_KEYS, ""]).catch("").default(""),
  assigned: z.union([z.uuid(), z.literal("me"), z.literal("")]).catch("").default(""),
});

const MAX_CARDS = 1000;

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const user = await requireUser();
  const raw = await searchParams;
  const filters = filtersSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const supabase = await createClient();
  const pipelineId = await defaultPipelineId(supabase).catch(() => "00000000-0000-0000-0000-000000000000");

  let query = supabase
    .from("pipeline_cards")
    .select(
      "id, contact_id, stage_key, status, couple_names, contact_name, partner_name, event_type, first_event_date, venue, city, value_cents, source, assigned_name, stage_changed_at",
    )
    .eq("pipeline_id", pipelineId)
    .limit(MAX_CARDS);
  if (filters.month) query = query.eq("first_event_month", filters.month);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.assigned) query = query.eq("assigned_to", filters.assigned === "me" ? user.id : filters.assigned);

  const [{ data: stages, error: stagesError }, { data: cards, error: cardsError }, { data: team }] = await Promise.all([
    supabase.from("stages").select("key, name, position, kind, is_won").eq("pipeline_id", pipelineId).order("position"),
    query,
    supabase.from("users").select("id, full_name, email").order("created_at"),
  ]);

  const filtered = Boolean(filters.month || filters.source || filters.assigned);
  const openValue = (cards ?? []).filter((c) => c.status === "open").reduce((sum, c) => sum + (c.value_cents ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${(cards ?? []).length} ${filtered ? "matching" : "couples"}${openValue ? ` · ${formatMoney(openValue)} open` : ""}`}
        actions={<ButtonLink href="/contacts/new" variant="primary">Add</ButtonLink>}
      />

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <input name="month" type="month" defaultValue={filters.month} aria-label="Event month" className="min-h-11 rounded-lg border border-line bg-surface px-2" />
        <select name="source" defaultValue={filters.source} aria-label="Source" className="min-h-11 rounded-lg border border-line bg-surface px-2">
          <option value="">Any source</option>
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="assigned" defaultValue={filters.assigned} aria-label="Assigned to" className="min-h-11 rounded-lg border border-line bg-surface px-2">
          <option value="">Anyone</option>
          <option value="me">Me</option>
          {team
            ?.filter((m) => m.id !== user.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name ?? m.email}
              </option>
            ))}
        </select>
        <button className="min-h-11 rounded-lg bg-ink px-4 text-sm font-medium text-paper">Filter</button>
        {filtered && (
          <Link href="/pipeline" className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline">
            Clear
          </Link>
        )}
      </form>

      {stagesError || cardsError ? (
        <Notice tone="danger">
          Couldn&apos;t load the pipeline. If you just updated the app, run the Milestone 3 database update in Supabase.
        </Notice>
      ) : (
        <>
          {(cards ?? []).length >= MAX_CARDS && <Notice>Showing the first {MAX_CARDS}. Filter by month to narrow it down.</Notice>}
          <Board stages={(stages ?? []) as Stage[]} cards={(cards ?? []) as unknown as Card[]} />
          {(cards ?? []).length === 0 && !filtered && (
            <p className="mt-2 text-sm text-muted">
              Nothing in the pipeline yet. Add couples from a contact page, or in bulk from{" "}
              <Link href="/contacts" className="underline">
                Contacts
              </Link>{" "}
              (filter, then &ldquo;Add to pipeline&rdquo;).
            </p>
          )}
        </>
      )}
    </>
  );
}
