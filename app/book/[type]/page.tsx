import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { availableSlots, loadType } from "@/lib/calendar/server";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookSlot } from "./actions";
import { BookingFlow } from "./booking-flow";

export const metadata: Metadata = { title: "Book a call" };
export const dynamic = "force-dynamic";

export default async function BookTypePage({ params }: PageProps<"/book/[type]">) {
  const { type: key } = await params;
  const admin = createAdminClient();
  if (!admin) {
    return <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600">Online booking isn&apos;t available right now.</p>;
  }
  const type = await loadType(admin, key);
  if (!type) notFound();

  const { slots, availability } = await availableSlots(admin, type);
  const { data: form } = await admin.from("forms").select("sms_consent_text").eq("key", "inquiry").maybeSingle();

  return (
    <BookingFlow
      type={{ key: type.key, name: type.name, description: type.description, duration: type.duration_minutes, location: type.location_kind }}
      slots={slots.map((s) => s.start.toISOString())}
      studioTimeZone={availability.time_zone}
      consentText={form?.sms_consent_text ?? null}
      siteKey={publicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      action={bookSlot.bind(null, type.key)}
    />
  );
}
