import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { dateKeyIn } from "@/lib/calendar/time";
import { createClient } from "@/lib/supabase/server";
import { ManualBookingForm } from "./manual-booking-form";

export const metadata: Metadata = { title: "Book a call" };

export default async function NewAppointmentPage({ searchParams }: PageProps<"/calendar/new">) {
  await requireUser();
  const contactId = z.uuid().safeParse((await searchParams).contact);
  if (!contactId.success) notFound();
  const supabase = await createClient();
  const [{ data: contact }, { data: types }, { data: availability }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, email").eq("id", contactId.data).maybeSingle(),
    supabase.from("appointment_types").select("key, name, duration_minutes").eq("active", true).order("position"),
    supabase.from("availability_settings").select("time_zone").maybeSingle(),
  ]);
  if (!contact) notFound();
  const tz = availability?.time_zone ?? "America/Los_Angeles";
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact";

  return (
    <>
      <PageHeader title="Book a call" description={`For ${name}. Times are in ${tz.replace(/_/g, " ")}.`} />
      <ManualBookingForm contactId={contact.id} types={types ?? []} today={dateKeyIn(new Date(), tz)} hasEmail={Boolean(contact.email)} />
    </>
  );
}
