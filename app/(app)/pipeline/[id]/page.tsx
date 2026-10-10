import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatPhone } from "@/lib/contacts/phone";
import { timeInStage, type Stage } from "@/lib/pipeline/board";
import { createClient } from "@/lib/supabase/server";
import { deleteOpportunity, updateOpportunity } from "../actions";
import { OpportunityForm } from "../opportunity-form";

export const metadata: Metadata = { title: "Opportunity" };

export default async function OpportunityPage({ params, searchParams }: PageProps<"/pipeline/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { notice } = await searchParams;
  const supabase = await createClient();

  const { data: opp } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!opp) notFound();

  const [{ data: contact }, { data: stages }, { data: team }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, partner_name, email, phone").eq("id", opp.contact_id).single(),
    supabase.from("stages").select("key, name, position, kind, is_won").eq("pipeline_id", opp.pipeline_id).order("position"),
    supabase.from("users").select("id, full_name, email").order("created_at"),
  ]);

  const stage = stages?.find((s) => s.key === opp.stage_key);
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || contact?.email || "Contact";

  return (
    <>
      <PageHeader
        title={opp.couple_names ?? [contactName, contact?.partner_name].filter(Boolean).join(" & ")}
        description={`${stage?.name ?? opp.stage_key} · ${timeInStage(opp.stage_changed_at)} in this stage`}
      />
      {notice === "created" && <Notice>Added to the pipeline.</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OpportunityForm
            action={updateOpportunity.bind(null, id)}
            values={{ ...opp, event_dates: opp.event_dates ?? [], services: opp.services ?? [] }}
            stages={(stages ?? []) as Stage[]}
            team={(team ?? []).map((m) => ({ id: m.id, name: m.full_name ?? m.email }))}
            submitLabel="Save"
          />
        </div>
        <div className="space-y-4">
          <Card title="Contact">
            <p className="font-medium">
              <Link href={`/contacts/${opp.contact_id}`} className="underline">
                {contactName}
              </Link>
            </p>
            <p className="mt-1 text-sm text-muted">
              {[contact?.email, formatPhone(contact?.phone)].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone={opp.status === "lost" ? "danger" : "accent"}>{opp.status}</Pill>
            </div>
          </Card>
          {user.role === "owner" && (
            <Card title="Remove from pipeline" className="border-danger/30">
              <p className="mb-3 text-sm text-muted">Deletes this opportunity only. The contact and their history stay.</p>
              <form action={deleteOpportunity.bind(null, id)}>
                <button className="min-h-11 rounded-lg border border-danger px-4 text-sm font-medium text-danger">Remove</button>
              </form>
            </Card>
          )}
          <p className="text-sm">
            <Link href="/pipeline" className="text-muted underline">
              ← Back to pipeline
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
