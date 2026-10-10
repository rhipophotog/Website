import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelAppointment, setAppointmentStatus } from "./actions";

export const metadata: Metadata = { title: "Calendar" };

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  location: string | null;
  notes: string | null;
  contact: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  type: { name: string } | null;
};

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "danger" }> = {
  booked: { label: "Booked", tone: "accent" },
  confirmed: { label: "Confirmed", tone: "accent" },
  completed: { label: "Completed", tone: "neutral" },
  no_show: { label: "No-show", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const { booked, show } = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const from = new Date(now.getTime() - 14 * 86_400_000);
  const to = new Date(now.getTime() + 60 * 86_400_000);

  let query = supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, location, notes, contact:contacts(id, first_name, last_name, email), type:appointment_types(name)")
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at");
  if (show !== "all") query = query.neq("status", "cancelled");
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const tz = user.timeZone;
  const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));

  // Past consults that still say "booked" need an outcome.
  const needsOutcome = rows.filter((r) => new Date(r.ends_at) < now && (r.status === "booked" || r.status === "confirmed"));
  const upcoming = rows.filter((r) => new Date(r.ends_at) >= now);
  const groups = new Map<string, Row[]>();
  for (const r of upcoming) groups.set(dayLabel(r.starts_at), [...(groups.get(dayLabel(r.starts_at)) ?? []), r]);

  const name = (r: Row) => [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(" ") || r.contact?.email || "Contact";

  const item = (r: Row, past: boolean) => (
    <li key={r.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold tabular">
            {time(r.starts_at)}–{time(r.ends_at)} · {r.type?.name}
          </p>
          <Link href={`/contacts/${r.contact?.id}`} className="text-accent underline">
            {name(r)}
          </Link>
          {r.location && <p className="mt-1 text-sm text-muted">{r.location}</p>}
          {r.notes && <p className="mt-1 text-sm text-muted">&ldquo;{r.notes}&rdquo;</p>}
        </div>
        <Pill tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Pill>
      </div>
      {(r.status === "booked" || r.status === "confirmed") && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {past ? (
            <>
              <form action={setAppointmentStatus.bind(null, r.id, "completed")}>
                <button className="min-h-10 rounded-lg bg-accent px-3 font-medium text-white">Completed</button>
              </form>
              <form action={setAppointmentStatus.bind(null, r.id, "no_show")}>
                <button className="min-h-10 rounded-lg border border-line px-3 font-medium">No-show</button>
              </form>
            </>
          ) : (
            <>
              {r.status === "booked" && (
                <form action={setAppointmentStatus.bind(null, r.id, "confirmed")}>
                  <button className="min-h-10 rounded-lg border border-line px-3 font-medium">Mark confirmed</button>
                </form>
              )}
              <details className="relative">
                <summary className="flex min-h-10 cursor-pointer items-center rounded-lg border border-line px-3 font-medium text-danger">Cancel…</summary>
                <form action={cancelAppointment.bind(null, r.id)} className="mt-2 space-y-2 rounded-lg border border-line bg-surface p-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="notify" defaultChecked className="size-5" /> Email them that it&apos;s cancelled
                  </label>
                  <button className="min-h-10 rounded-lg bg-danger px-3 font-medium text-white">Cancel booking</button>
                </form>
              </details>
            </>
          )}
        </div>
      )}
    </li>
  );

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Consults and calls, in your time zone."
        actions={
          user.role === "owner" ? (
            <ButtonLink href="/settings/calendar">
              <Settings2 size={18} strokeWidth={1.75} className="mr-1.5" aria-hidden /> Availability
            </ButtonLink>
          ) : undefined
        }
      />
      {typeof booked === "string" && <Notice>Booked. It&apos;s on the calendar (and Google Calendar, if connected).</Notice>}
      {error && <Notice tone="danger">Couldn&apos;t load the calendar. If you just updated the app, run the Milestone 7 database update.</Notice>}

      {needsOutcome.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">How did these go?</h2>
          <ul className="space-y-3">{needsOutcome.map((r) => item(r, true))}</ul>
        </section>
      )}

      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          <CalendarCheck className="mx-auto mb-2 text-accent" size={28} strokeWidth={1.75} aria-hidden />
          Nothing booked yet. Share your booking link, or book someone from their contact page.
        </div>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([label, list]) => (
            <section key={label}>
              <h2 className="mb-2 font-semibold">{label}</h2>
              <ul className="space-y-3">{list.map((r) => item(r, false))}</ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm">
        <Link href={show === "all" ? "/calendar" : "/calendar?show=all"} className="text-muted underline">
          {show === "all" ? "Hide cancelled" : "Show cancelled"}
        </Link>
      </p>
    </>
  );
}
