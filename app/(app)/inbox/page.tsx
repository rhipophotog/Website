import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <>
      <PageHeader title="Inbox" description="Email and SMS with every couple, in one thread." />
      <ComingSoon milestone={5}>Email threads arrive in milestone 5 and SMS in milestone 6.</ComingSoon>
    </>
  );
}
