import { createHmac } from "node:crypto";
import { APP_NAME, STUDIO_NAME } from "@/lib/brand";
import { appUrl, serverEnv } from "@/lib/env";
import { emailContact, notifyOwner } from "@/lib/messaging/email";
import { buildMergeContext } from "@/lib/messaging/render";
import { withStudioDefaults } from "@/lib/messaging/studio";
import { safeEqual } from "@/lib/leads/security";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { encrypt } from "./crypto";
import { googleCalendar, type GoogleCreds, type StoredConnection } from "./google";
import { buildIcs } from "./ics";
import { derivedSecret, signId, verifySignedId } from "./signing";
import { computeSlots, type Availability, type Busy, type Slot } from "./slots";
import { addDays, dateKeyIn, formatSlot, zonedTimeToUtc } from "./time";

/**
 * Booking on the server (service role). Everything Google-related is best effort:
 * a Google outage never blocks a booking, it's logged and the booking still stands.
 */

export type AppointmentType = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  location_kind: "zoom" | "phone" | "in_person";
  location_detail: string | null;
  active: boolean;
};

export type AvailabilityRow = Availability & { zoom_link: string | null };

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

function material(): string {
  const env = serverEnv();
  return env.UNSUBSCRIBE_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? env.LEAD_IP_SALT;
}

export function manageToken(appointmentId: string): string {
  return signId("appointment", appointmentId, derivedSecret("appointment", material()));
}

export function verifyManageToken(token: string): string | null {
  return verifySignedId("appointment", token, derivedSecret("appointment", material()));
}

export function manageUrl(appointmentId: string): string {
  return `${appUrl()}/book/manage/${manageToken(appointmentId)}`;
}

function tokenKey(): string {
  const env = serverEnv();
  return env.TOKEN_ENCRYPTION_KEY ?? derivedSecret("google-tokens", env.SUPABASE_SERVICE_ROLE_KEY ?? env.LEAD_IP_SALT);
}

export function googleCreds(): GoogleCreds | null {
  const env = serverEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${appUrl()}/api/google/callback` };
}

export function encryptToken(value: string): string {
  return encrypt(value, tokenKey());
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

/** OAuth "state": who started the connection and until when, HMAC-signed so it can't be forged or reused later. */
export function oauthState(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, exp: now + 10 * 60_000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", derivedSecret("google-oauth", material())).update(payload).digest("base64url")}`;
}

export function verifyOauthState(state: string, userId: string, now = Date.now()): boolean {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", derivedSecret("google-oauth", material())).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: string; exp?: number };
    return data.u === userId && typeof data.exp === "number" && data.exp >= now;
  } catch {
    return false;
  }
}

/** Service-role client for calendar work started by a signed-in member (manual bookings, cancellations). */
export function calendarAdmin() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");
  return admin;
}

export async function googleClient(admin: AdminClient) {
  const creds = googleCreds();
  if (!creds) return null;
  const { data: conn } = await admin
    .from("google_calendar_connection")
    .select("calendar_id, refresh_token_enc, access_token_enc, access_token_expires_at")
    .maybeSingle();
  if (!conn) return null;
  return googleCalendar(conn as StoredConnection, {
    creds,
    secret: tokenKey(),
    onRefresh: async (access_token_enc, expiresAt) => {
      await admin.from("google_calendar_connection").update({ access_token_enc, access_token_expires_at: expiresAt.toISOString() }).eq("id", true);
    },
  });
}

async function googleBusy(admin: AdminClient, from: Date, to: Date): Promise<Busy[]> {
  try {
    const google = await googleClient(admin);
    return google ? await google.busy(from, to) : [];
  } catch (error) {
    console.error("[calendar] Google free/busy failed", error instanceof Error ? error.message : error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export async function loadType(admin: AdminClient, key: string): Promise<AppointmentType | null> {
  const { data } = await admin.from("appointment_types").select("*").eq("key", key).eq("active", true).maybeSingle();
  return (data as AppointmentType | null) ?? null;
}

export async function loadAvailability(admin: AdminClient): Promise<AvailabilityRow> {
  const { data, error } = await admin.from("availability_settings").select("*").single();
  if (error || !data) throw new Error("Availability isn't set up (run the calendar migration).");
  return data as AvailabilityRow;
}

/** Bookable slots for a type, including Google busy times. */
export async function availableSlots(
  admin: AdminClient,
  type: AppointmentType,
  opts: { now?: Date; ignore?: Busy | null } = {},
): Promise<{ slots: Slot[]; availability: AvailabilityRow }> {
  const now = opts.now ?? new Date();
  const availability = await loadAvailability(admin);
  const from = zonedTimeToUtc(dateKeyIn(now, availability.time_zone), "00:00", availability.time_zone);
  const to = zonedTimeToUtc(addDays(dateKeyIn(now, availability.time_zone), availability.max_days_ahead + 1), "00:00", availability.time_zone);

  const [{ data: blocked }, { data: busy }, external] = await Promise.all([
    admin.from("blocked_dates").select("date").gte("date", dateKeyIn(now, availability.time_zone)),
    admin.rpc("busy_ranges", { p_from: from.toISOString(), p_to: to.toISOString() }),
    googleBusy(admin, from, to),
  ]);

  const appointments = ((busy ?? []) as { starts_at: string; ends_at: string }[]).map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));
  // Our own bookings are already on Google too; drop Google blocks that exactly match one.
  const ownKeys = new Set(appointments.map((a) => `${a.start.getTime()}-${a.end.getTime()}`));
  const externalBusy = external.filter((e) => !ownKeys.has(`${e.start.getTime()}-${e.end.getTime()}`));

  const slots = computeSlots({
    now,
    availability,
    durationMinutes: type.duration_minutes,
    blockedDates: (blocked ?? []).map((b) => b.date as string),
    appointments,
    externalBusy,
    ignore: opts.ignore ?? null,
  });
  return { slots, availability };
}

// ---------------------------------------------------------------------------
// After booking / rescheduling / cancelling
// ---------------------------------------------------------------------------

type AppointmentDetails = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  location: string | null;
  notes: string | null;
  guest_time_zone: string | null;
  google_event_id: string | null;
  contact: { id: string; first_name: string | null; last_name: string | null; partner_name: string | null; email: string | null; phone: string | null; dnd_email: boolean; email_marketing_consent: boolean; time_zone: string | null };
  type: AppointmentType;
  opportunity_id: string | null;
};

async function loadAppointment(admin: AdminClient, id: string): Promise<AppointmentDetails | null> {
  const { data } = await admin
    .from("appointments")
    .select(
      "id, starts_at, ends_at, status, location, notes, guest_time_zone, google_event_id, opportunity_id, contact:contacts(id, first_name, last_name, partner_name, email, phone, dnd_email, email_marketing_consent, time_zone), type:appointment_types(*)",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as AppointmentDetails | null) ?? null;
}

export function locationText(type: AppointmentType, availability: { zoom_link: string | null }, phone: string | null): string {
  if (type.location_kind === "phone") return phone ? `Phone call: we'll call you at ${phone}` : "Phone call";
  if (type.location_kind === "in_person") return type.location_detail ?? "In person";
  return availability.zoom_link ? `Zoom: ${availability.zoom_link}` : "Zoom (link to follow by email)";
}

function details(a: AppointmentDetails, tz: string, extra: string[] = []): string {
  const start = new Date(a.starts_at);
  return [
    `${a.type.name}: ${formatSlot(start, tz, { withDate: true, withZone: true })} (${a.type.duration_minutes} min)`,
    a.location ? `Where: ${a.location}` : null,
    ...extra,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Calendar apps only apply an update with a higher SEQUENCE; seconds since epoch always increase. */
const nextSequence = () => Math.floor(Date.now() / 1000) % 2_147_483_647;

function invite(a: AppointmentDetails, method: "REQUEST" | "CANCEL", sequence = nextSequence()) {
  const env = serverEnv();
  const contactName = [a.contact.first_name, a.contact.last_name].filter(Boolean).join(" ");
  return {
    filename: "invite.ics",
    contentType: `text/calendar; charset=utf-8; method=${method}`,
    content: buildIcs({
      uid: `${a.id}@rhipo-studio`,
      start: new Date(a.starts_at),
      end: new Date(a.ends_at),
      summary: `${a.type.name} with ${STUDIO_NAME.split(" ")[0]}${contactName ? ` · ${contactName}` : ""}`,
      description: `${a.location ?? ""}\n\nManage your booking: ${manageUrl(a.id)}`.trim(),
      location: a.location,
      url: manageUrl(a.id),
      organizerName: STUDIO_NAME,
      organizerEmail: env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] ?? env.EMAIL_FROM ?? null,
      method,
      sequence,
    }),
  };
}

/** Booking made: Google event, confirmation email with invite, owner alert. Safe to call once per booking. */
export async function afterBooked(admin: AdminClient, appointmentId: string, opts: { sendConfirmation?: boolean } = {}) {
  const a = await loadAppointment(admin, appointmentId);
  if (!a) return;
  const availability = await loadAvailability(admin);
  const tz = a.guest_time_zone ?? a.contact.time_zone ?? availability.time_zone;
  const name = [a.contact.first_name, a.contact.last_name].filter(Boolean).join(" ") || a.contact.email || "Someone";

  try {
    const google = await googleClient(admin);
    if (google && !a.google_event_id) {
      const eventId = await google.createEvent({
        summary: `${a.type.name}: ${name}`,
        description: [
          `${APP_NAME}: ${appUrl()}/contacts/${a.contact.id}`,
          a.contact.email,
          a.contact.phone,
          a.notes ? `\nTheir note: ${a.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        start: new Date(a.starts_at),
        end: new Date(a.ends_at),
        location: a.location,
      });
      await admin.from("appointments").update({ google_event_id: eventId }).eq("id", a.id);
    }
  } catch (error) {
    console.error("[calendar] Google event create failed", error instanceof Error ? error.message : error);
  }

  if (opts.sendConfirmation !== false) {
    const [{ data: template }, { data: settings }, { data: opportunity }] = await Promise.all([
      admin.from("templates").select("subject, body").eq("key", "consult_confirm").maybeSingle(),
      admin.from("studio_settings").select("*").maybeSingle(),
      a.opportunity_id ? admin.from("opportunities").select("event_dates, venue, city").eq("id", a.opportunity_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const outcome = await emailContact(admin, {
      contact: a.contact,
      subject: template?.subject ?? `You're booked: ${a.type.name}`,
      body: template?.body ?? "Hi {{first_name}},\n\nYou're all set. See you soon!\n\n{{owner_name}}",
      context: buildMergeContext({ contact: a.contact, opportunity, settings: withStudioDefaults(settings) }),
      templateKey: "consult_confirm",
      appendText: details(a, tz, [`Need to reschedule or cancel? ${manageUrl(a.id)}`]),
      attachments: [invite(a, "REQUEST", 0)],
      idempotencyKey: `booking-confirm:${a.id}`,
    });
    if (outcome.status === "failed") console.error("[calendar] confirmation email failed", outcome.error);
  }

  await notifyOwner(
    `New booking: ${a.type.name} with ${name}`,
    `${name} booked a ${a.type.name}.\n\n${details(a, availability.time_zone)}\n\nOpen in ${APP_NAME}: ${appUrl()}/contacts/${a.contact.id}`,
    `owner-booking:${a.id}`,
  );
}

export async function afterRescheduled(admin: AdminClient, appointmentId: string) {
  const a = await loadAppointment(admin, appointmentId);
  if (!a) return;
  const availability = await loadAvailability(admin);
  const tz = a.guest_time_zone ?? a.contact.time_zone ?? availability.time_zone;
  try {
    const google = await googleClient(admin);
    if (google && a.google_event_id) await google.moveEvent(a.google_event_id, new Date(a.starts_at), new Date(a.ends_at));
  } catch (error) {
    console.error("[calendar] Google event move failed", error instanceof Error ? error.message : error);
  }
  await emailContact(admin, {
    contact: a.contact,
    subject: `Updated: your ${a.type.name}`,
    body: "Hi {{first_name}},\n\nYour booking has been moved. Here are the new details:",
    context: buildMergeContext({ contact: a.contact, settings: {} }),
    appendText: details(a, tz, [`Need to change it again? ${manageUrl(a.id)}`]),
    attachments: [invite(a, "REQUEST")],
    idempotencyKey: `booking-moved:${a.id}:${a.starts_at}`,
  });
  await notifyOwner(`Rescheduled: ${a.type.name}`, details(a, availability.time_zone), `owner-moved:${a.id}:${a.starts_at}`);
}

export async function afterCancelled(admin: AdminClient, appointmentId: string, opts: { notifyGuest: boolean }) {
  const a = await loadAppointment(admin, appointmentId);
  if (!a) return;
  const availability = await loadAvailability(admin);
  const tz = a.guest_time_zone ?? a.contact.time_zone ?? availability.time_zone;
  try {
    const google = await googleClient(admin);
    if (google && a.google_event_id) await google.deleteEvent(a.google_event_id);
  } catch (error) {
    console.error("[calendar] Google event delete failed", error instanceof Error ? error.message : error);
  }
  if (opts.notifyGuest) {
    await emailContact(admin, {
      contact: a.contact,
      subject: `Cancelled: your ${a.type.name}`,
      body: "Hi {{first_name}},\n\nYour booking has been cancelled. If you'd like to pick a new time, you can do that here: {{booking_link}}",
      context: buildMergeContext({ contact: a.contact, settings: withStudioDefaults(null) }),
      appendText: details(a, tz),
      attachments: [invite(a, "CANCEL")],
      idempotencyKey: `booking-cancelled:${a.id}`,
    });
  }
  await notifyOwner(`Cancelled: ${a.type.name}`, details(a, availability.time_zone), `owner-cancelled:${a.id}`);
}
