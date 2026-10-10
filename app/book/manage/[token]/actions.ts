"use server";

import { after } from "next/server";
import { z } from "zod";
import { afterCancelled, afterRescheduled, availableSlots, verifyManageToken } from "@/lib/calendar/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ManageState = { ok: boolean; message: string } | null;

export async function cancelBooking(token: string, _prev: ManageState, formData: FormData): Promise<ManageState> {
  const id = verifyManageToken(token);
  const admin = createAdminClient();
  if (!id || !admin) return { ok: false, message: "This link isn't valid." };
  const reason = z.string().max(500).catch("").parse(formData.get("reason"));
  const { data: done } = await admin.rpc("guest_cancel_appointment", { p_id: id, p_reason: reason });
  if (!done) return { ok: false, message: "This booking can't be cancelled (it may already be cancelled or in the past)." };
  after(() => afterCancelled(admin, id, { notifyGuest: true }));
  return { ok: true, message: "Your booking is cancelled. We've emailed you a confirmation." };
}

export async function rescheduleBooking(token: string, startsAt: string): Promise<ManageState> {
  const id = verifyManageToken(token);
  const admin = createAdminClient();
  if (!id || !admin) return { ok: false, message: "This link isn't valid." };
  const start = z.iso.datetime({ offset: true }).safeParse(startsAt);
  if (!start.success) return { ok: false, message: "Pick a time." };

  const { data: appt } = await admin.from("appointments").select("starts_at, ends_at, type:appointment_types(*)").eq("id", id).maybeSingle();
  if (!appt) return { ok: false, message: "Booking not found." };
  const type = appt.type as unknown as Parameters<typeof availableSlots>[1];
  const { slots } = await availableSlots(admin, type, { ignore: { start: new Date(appt.starts_at), end: new Date(appt.ends_at) } });
  const when = new Date(start.data);
  if (!slots.some((s) => s.start.getTime() === when.getTime())) return { ok: false, message: "Sorry, that time isn't available any more." };

  const { data: done, error } = await admin.rpc("guest_reschedule_appointment", { p_id: id, p_starts_at: when.toISOString() });
  if (error?.code === "23P01") return { ok: false, message: "Sorry, that time was just taken." };
  if (!done) return { ok: false, message: "This booking can't be changed (it may be cancelled or in the past)." };
  after(() => afterRescheduled(admin, id));
  return { ok: true, message: "Done! Your booking has moved. We've emailed you the new details." };
}
