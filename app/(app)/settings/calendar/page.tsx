import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { googleCreds } from "@/lib/calendar/server";
import { appUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { addBlockedDate, disconnectGoogle, removeBlockedDate } from "./actions";
import { AppointmentTypeEditor, AvailabilityEditor, type AvailabilityForm, type TypeForm } from "./forms";

export const metadata: Metadata = { title: "Calendar settings" };

const GOOGLE_MESSAGES: Record<string, { text: string; tone: "neutral" | "danger" }> = {
  connected: { text: "Google Calendar connected.", tone: "neutral" },
  denied: { text: "Google access wasn't granted.", tone: "danger" },
  failed: { text: "Couldn't connect Google Calendar. Try again.", tone: "danger" },
  forbidden: { text: "Only the owner can connect Google Calendar.", tone: "danger" },
  not_configured: { text: "Google isn't set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel.", tone: "danger" },
};

export default async function CalendarSettingsPage({ searchParams }: PageProps<"/settings/calendar">) {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Settings are owner-only.</Notice>;
  const { google } = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, { data: blocked }, { data: types }, { data: connection }] = await Promise.all([
    supabase.from("availability_settings").select("*").maybeSingle(),
    supabase.from("blocked_dates").select("id, date, note").gte("date", new Date().toISOString().slice(0, 10)).order("date"),
    supabase.from("appointment_types").select("id, key, name, description, duration_minutes, location_kind, location_detail, active").order("position"),
    supabase.from("google_calendar_connection").select("account_email, calendar_id, connected_at").maybeSingle(),
  ]);
  const message = typeof google === "string" ? GOOGLE_MESSAGES[google] : undefined;
  const base = appUrl();

  if (!settings) {
    return (
      <>
        <PageHeader title="Calendar" />
        <Notice tone="danger">Run the Milestone 7 database update in Supabase first.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Calendar" description="When couples can book you, and what they can book." />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="max-w-2xl space-y-4">
        <Card title="Google Calendar">
          {connection ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                Connected as <strong>{connection.account_email ?? "your Google account"}</strong>. Busy times there block bookings, and new
                bookings are added to it.
              </span>
              <form action={disconnectGoogle}>
                <button className="min-h-11 text-danger underline">Disconnect</button>
              </form>
            </div>
          ) : googleCreds() ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted">Not connected. Bookings still work; they just won&apos;t sync.</span>
              {/* A plain link: the route redirects to Google's consent screen. */}
              <a href="/api/google/connect" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-white">
                Connect Google Calendar
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted">{GOOGLE_MESSAGES.not_configured.text}</p>
          )}
        </Card>

        <Card title="Booking links">
          <ul className="divide-y divide-line text-sm">
            {(types ?? []).map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-2">
                <span>
                  {t.name}
                  <span className="block break-all text-xs text-muted">
                    {base}/book/{t.key}
                  </span>
                </span>
                <Pill tone={t.active ? "accent" : "neutral"}>{t.active ? "Live" : "Hidden"}</Pill>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{"{{booking_link}}"} in templates points to the discovery call unless you set another link in Studio &amp; email.</p>
        </Card>

        <Card title="Availability">
          <AvailabilityEditor settings={settings as AvailabilityForm} />
        </Card>

        <Card title="Days off">
          <ul className="divide-y divide-line text-sm">
            {(blocked ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <span className="tabular">
                  {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
                    new Date(`${b.date}T00:00:00Z`),
                  )}
                  {b.note && <span className="ml-2 text-muted">{b.note}</span>}
                </span>
                <form action={removeBlockedDate.bind(null, b.id)}>
                  <button className="min-h-11 px-2 text-xs text-danger underline">Remove</button>
                </form>
              </li>
            ))}
            {!blocked?.length && <li className="py-2 text-muted">No days off coming up.</li>}
          </ul>
          <form action={addBlockedDate} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <input aria-label="Date" name="date" type="date" required className="min-h-11 rounded-lg border border-line bg-surface px-3" />
            <input aria-label="Note" name="note" placeholder="Note (e.g. wedding in Napa)" className="min-h-11 flex-1 rounded-lg border border-line bg-surface px-3" />
            <button className="min-h-11 rounded-lg border border-line px-4 font-medium">Block day</button>
          </form>
        </Card>

        {(types ?? []).map((t) => (
          <Card key={t.id} title={t.name}>
            <AppointmentTypeEditor type={t as TypeForm} />
          </Card>
        ))}
        <Card title="New appointment type">
          <AppointmentTypeEditor type={null} />
        </Card>

        <p className="text-sm">
          <Link href="/settings" className="text-muted underline">
            ← Settings
          </Link>
        </p>
      </div>
    </>
  );
}
