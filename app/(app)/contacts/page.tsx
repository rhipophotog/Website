import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <>
      <PageHeader title="Contacts" description="Every lead and client in one place." />
      <ComingSoon milestone={2}>Search, filters, tags, timeline, and CSV import from GoHighLevel.</ComingSoon>
    </>
  );
}
