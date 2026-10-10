import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="Consultations and events." />
      <ComingSoon milestone={7}>Availability, public booking pages and Google Calendar sync.</ComingSoon>
    </>
  );
}
