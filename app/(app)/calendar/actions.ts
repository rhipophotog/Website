"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { afterBooked, afterCancelled, calendarAdmin, loadAvailability, loadType, locationText } from "@/lib/calendar/server";
import { zonedTimeToUtc } from "@/lib/calendar/time";
import type { FormState } from "@/lib/contacts/schema";
import { createClient } from "@/lib/supabase/server";

async function member() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Completed / no-show / confirmed: plain update under RLS; the trigger logs it and raises the workflow event. */
export async function setAppointmentStatus(id: string, status: "confirmed" | "completed" | "no_show"): Promise<void> {
  await member();
  const supabase = await createClient();
  await supabase.from("appointments").update({ status }).eq("id", z.uuid().parse(id));
  revalidatePath("/calendar");
}

export async function cancelAppointment(id: string, formData: FormData): Promise<void> {
  await member();
  const appointmentId = z.uuid().parse(id);
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .update({ status: "cancelled", cancel_reason: "Cancelled by the studio" })
    .eq("id", appointmentId)
    .in("status", ["booked", "confirmed"])
    .select("id");
  if (data?.length) {
    const notifyGuest = formData.get("notify") === "on";
    after(() => afterCancelled(calendarAdmin(), appointmentId, { notifyGuest }));
  }
  revalidatePath("/calendar");
}

const manualSchema = z.object({
  contact_id: z.uuid(),
  type_key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time."),
  send_confirmation: z.string().optional().transform((v) => v === "on"),
});

/** Book on someone's behalf (e.g. they called). Studio time zone; not limited to open hours, but never double-booked. */
export async function bookForContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await member();
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the booking." };

  const admin = calendarAdmin();
  const [type, availability] = await Promise.all([loadType(admin, parsed.data.type_key), loadAvailability(admin)]);
  if (!type) return { ok: false, message: "Pick an appointment type." };
  const { data: contact } = await (await createClient()).from("contacts").select("id, phone").eq("id", parsed.data.contact_id).maybeSingle();
  if (!contact) return { ok: false, message: "Contact not found." };

  const start = zonedTimeToUtc(parsed.data.date, parsed.data.time, availability.time_zone);
  const { data, error } = await admin.rpc("book_appointment", {
    p: {
      type_key: type.key,
      starts_at: start.toISOString(),
      contact_id: contact.id,
      location: locationText(type, availability, contact.phone),
      booked_by: "studio",
      created_by: user.id,
    },
  });
  if (error) {
    return { ok: false, message: error.code === "23P01" ? "That overlaps another booking. Pick a different time." : "Couldn't book it. Try again." };
  }
  const appointmentId = (data as { appointment_id: string }).appointment_id;
  after(() => afterBooked(admin, appointmentId, { sendConfirmation: parsed.data.send_confirmation }));
  revalidatePath("/calendar");
  redirect(`/calendar?booked=${appointmentId}`);
}
