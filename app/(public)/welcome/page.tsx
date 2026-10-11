import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Inbox, KanbanSquare, ShieldCheck } from "lucide-react";
import { APP_NAME, STUDIO_NAME } from "@/lib/brand";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const code = serverEnv().GOOGLE_SITE_VERIFICATION;
  return {
    title: { absolute: `${APP_NAME} · ${STUDIO_NAME}` },
    description: `${APP_NAME} is the private client-management app of ${STUDIO_NAME}: inquiries, bookings and client messages in one place.`,
    robots: { index: true, follow: true },
    ...(code ? { verification: { google: code } } : {}),
  };
}

const FEATURES = [
  { icon: Inbox, title: "Inquiries and messages", text: "Wedding and event inquiries from our website, ads and referrals land in one inbox, so every couple gets a quick, personal reply." },
  { icon: KanbanSquare, title: "Client pipeline", text: "We track each couple from first inquiry to consult, booking and delivery, so nothing slips through the cracks." },
  {
    icon: CalendarCheck,
    title: "Booking calendar",
    text: "Couples book discovery calls and consults online. With the studio owner's permission, the app checks the owner's Google Calendar for busy times and adds confirmed bookings to it, so we're never double-booked.",
  },
  { icon: ShieldCheck, title: "Private by design", text: "Only the studio team can sign in. Client details are never sold or shared for advertising." },
];

export default function WelcomePage() {
  return (
    <>
      <section className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{APP_NAME}</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
          The private studio app of <strong className="text-ink">{STUDIO_NAME}</strong>. We use it to answer inquiries, schedule calls with couples and keep
          every client conversation in one place.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/book" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 font-medium text-white">
            Book a call with us
          </Link>
          <Link href="/f/inquiry" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-5 font-medium">
            Send an inquiry
          </Link>
        </div>
      </section>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <Icon className="text-accent" size={20} strokeWidth={1.75} aria-hidden />
            <h2 className="mt-2 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ul>

      <section className="mt-12 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
        <h2 className="font-semibold text-ink">How {APP_NAME} uses Google data</h2>
        <p className="mt-2">
          The studio owner can connect their own Google Calendar. {APP_NAME} then reads free/busy times to offer only open slots, and creates, moves or
          removes the calendar events for consults booked through this app. It doesn&apos;t read the content of other events, and it doesn&apos;t use
          Google data for anything else. Details are in our{" "}
          <Link href="/privacy" className="text-accent underline">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </>
  );
}
