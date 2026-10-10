import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { defaultPipelineId } from "@/lib/contacts/queries";
import { createClient } from "@/lib/supabase/server";
import { StagesForm } from "./rename-form";

export const metadata: Metadata = { title: "Pipeline stages" };

export default async function PipelineSettingsPage() {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Settings are owner-only.</Notice>;
  const supabase = await createClient();
  const pipelineId = await defaultPipelineId(supabase);
  const { data: stages } = await supabase.from("stages").select("key, name, kind").eq("pipeline_id", pipelineId).order("position");

  return (
    <>
      <PageHeader title="Pipeline stages" description="Rename or reorder stages. Each stage's key (grey) never changes, so automations keep working." />
      <div className="max-w-2xl">
        <StagesForm stages={stages ?? []} />
        <p className="mt-6 text-sm">
          <Link href="/settings" className="text-muted underline">
            ← Settings
          </Link>
        </p>
      </div>
    </>
  );
}
