"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { bookingSchema } from "@/app/book/schema";
import { afterBooked, availableSlots, loadType, locationText, manageUrl } from "@/lib/calendar/server";
import { serverEnv } from "@/lib/env";
import { HONEYPOT_FIELD } from "@/lib/leads/inquiry";
import { clientIp, hashIp } from "@/lib/leads/security";
import { verifyTurnstile } from "@/lib/leads/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";

export type BookingState =
  | { ok: true; startsAt: string; manageUrl: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; slotTaken?: boolean }
  | null;

const RATE_LIMIT = { max: 5, minutes: 60 };

export async function bookSlot(typeKey: string, _prev: BookingState, formData: FormData): Promise<BookingState> {
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim()) return { ok: false, message: "Please try again." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Booking isn't available right now. Please email us instead." };

  const env = serverEnv();
  const ip = clientIp(await headers());
  const ipHash = hashIp(ip, env.LEAD_IP_SALT);
  if (ipHash) {
    const { data: recent } = await admin.rpc("recent_bookings", { p_ip_hash: ipHash, p_minutes: RATE_LIMIT.minutes });
    if (typeof recent === "number" && recent >= RATE_LIMIT.max) {
      return { ok: false, message: "You've made several bookings already. Please get in touch if you need another." };
    }
  }

  if (!(await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""), env.TURNSTILE_SECRET_KEY, ip))) {
    return { ok: false, message: "Please complete the quick security check and try again." };
  }

  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
  }

  const type = await loadType(admin, typeKey);
  if (!type) return { ok: false, message: "This type of appointment isn't available." };

  // Re-check the slot on the server: hours, notice, buffers, daily cap and Google busy times.
  const start = new Date(parsed.data.starts_at);
  const { slots, availability } = await availableSlots(admin, type);
  if (!slots.some((s) => s.start.getTime() === start.getTime())) {
    return { ok: false, slotTaken: true, message: "Sorry, that time was just taken. Please pick another." };
  }

  const { data: form } = await admin.from("forms").select("sms_consent_text").eq("key", "inquiry").maybeSingle();
  const { data, error } = await admin.rpc("book_appointment", {
    p: {
      type_key: type.key,
      starts_at: start.toISOString(),
      guest_time_zone: parsed.data.guest_time_zone,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      partner_name: parsed.data.partner_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      event_date: parsed.data.event_date,
      notes: parsed.data.notes,
      sms_consent_text: parsed.data.sms_consent && parsed.data.phone ? form?.sms_consent_text : null,
      ip_hash: ipHash,
      location: locationText(type, availability, parsed.data.phone),
    },
  });
  if (error) {
    if (error.code === "23P01") return { ok: false, slotTaken: true, message: "Sorry, that time was just taken. Please pick another." };
    console.error("[booking] book_appointment failed", error.code, error.message);
    return { ok: false, message: "Sorry, something went wrong. Please try again." };
  }

  const appointmentId = (data as { appointment_id: string }).appointment_id;
  after(() => afterBooked(admin, appointmentId));
  return { ok: true, startsAt: start.toISOString(), manageUrl: manageUrl(appointmentId) };
}
