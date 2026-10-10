import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Workflows" };

export default function WorkflowsPage() {
  return (
    <>
      <PageHeader title="Workflows" description="Automatic follow-ups, reminders and pipeline moves." />
      <ComingSoon milestone={8}>
        The ten starter workflows (instant reply, follow-ups until they book, consult reminders, pre-event milestones…)
        with on/off switches and a log of what happened to each lead. The instant reply already runs today.
      </ComingSoon>
    </>
  );
}
