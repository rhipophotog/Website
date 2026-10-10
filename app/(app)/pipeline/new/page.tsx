import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { defaultPipelineId } from "@/lib/contacts/queries";
import type { Stage } from "@/lib/pipeline/board";
import { createClient } from "@/lib/supabase/server";
import { createOpportunity } from "../actions";
import { OpportunityForm } from "../opportunity-form";

export const metadata: Metadata = { title: "Add to pipeline" };

export default async function NewOpportunityPage({ searchParams }: PageProps<"/pipeline/new">) {
  await requireUser();
  const contactId = z.uuid().safeParse((await searchParams).contact);
  if (!contactId.success) notFound();

  const supabase = await createClient();
  const { data: contact } = await supabase.from("contacts").select("id, first_name, last_name, partner_name, source").eq("id", contactId.data).maybeSingle();
  if (!contact) notFound();
  const pipelineId = await defaultPipelineId(supabase);
  const [{ data: stages }, { data: team }] = await Promise.all([
    supabase.from("stages").select("key, name, position, kind, is_won").eq("pipeline_id", pipelineId).order("position"),
    supabase.from("users").select("id, full_name, email").order("created_at"),
  ]);

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  return (
    <>
      <PageHeader title="Add to pipeline" description={name || undefined} />
      <OpportunityForm
        action={createOpportunity.bind(null, contact.id)}
        values={{
          stage_key: "new_inquiry",
          lost_reason: null,
          couple_names: [contact.first_name, contact.partner_name].filter(Boolean).join(" & ") || null,
          event_type: null,
          event_dates: [],
          venue: null,
          city: null,
          services: [],
          value_cents: null,
          source: contact.source,
          assigned_to: null,
          notes: null,
        }}
        stages={(stages ?? []) as Stage[]}
        team={(team ?? []).map((m) => ({ id: m.id, name: m.full_name ?? m.email }))}
        submitLabel="Add to pipeline"
      />
    </>
  );
}
