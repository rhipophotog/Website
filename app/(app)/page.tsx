import { ComingSoon, PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { formatInTimeZone } from "@/lib/time";

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = (user.fullName ?? user.email).split(/[\s@]/)[0];
  const today = formatInTimeZone(new Date(), user.timeZone, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <PageHeader title={`Hi, ${firstName}`} description={today} />
      <ComingSoon milestone={9}>
        Today&apos;s tasks, new leads, needs-reply count, upcoming consults and events, pipeline value and lead
        sources.
      </ComingSoon>
    </>
  );
}
