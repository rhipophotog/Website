import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: stages, error } = await supabase
    .from("stages")
    .select("key, name, position, kind, pipelines!inner(is_default)")
    .eq("pipelines.is_default", true)
    .order("position");

  return (
    <>
      <PageHeader title="Pipeline" description="Every couple, from inquiry to delivered." />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load stages.
        </p>
      ) : (
        <div className="-mx-4 mb-6 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {stages?.map((stage) => (
            <section
              key={stage.key}
              data-stage={stage.key}
              className="w-64 shrink-0 snap-start rounded-xl border border-line bg-surface p-3"
            >
              <h2 className="text-sm font-semibold">
                {stage.kind === "open" && <span className="mr-1.5 text-muted">{stage.position}</span>}
                {stage.name}
              </h2>
              <p className="mt-6 text-center text-xs text-muted">No couples yet</p>
            </section>
          ))}
        </div>
      )}
      <ComingSoon milestone={3}>Drag-and-drop board, opportunity drawer and lost reasons.</ComingSoon>
    </>
  );
}
