"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isValidTime } from "@/lib/calendar/time";
import type { FormState } from "@/lib/contacts/schema";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/calendar";

async function owner() {
  const user = await getCurrentUser();
  return user?.role === "owner" ? user : null;
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const availabilitySchema = z.object({
  time_zone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone."),
  buffer_minutes: int(0, 240),
  min_notice_hours: int(0, 336),
  max_days_ahead: int(1, 365),
  max_per_day: int(1, 50),
  slot_step_minutes: z.coerce.number().pipe(z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)])),
  zoom_link: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\/\S+$/.test(v), "The Zoom link must start with https://"),
});

export async function saveAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await owner())) return { ok: false, message: "Only the owner can change settings." };
  const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const weekly: Record<string, [string, string][]> = {};
  for (let d = 0; d < 7; d++) {
    if (formData.get(`day_${d}_open`) !== "on") {
      weekly[d] = [];
      continue;
    }
    const start = String(formData.get(`day_${d}_start`) ?? "");
    const end = String(formData.get(`day_${d}_end`) ?? "");
    if (!isValidTime(start) || !isValidTime(end) || end <= start) {
      return { ok: false, message: "Each open day needs a start time before its end time." };
    }
    weekly[d] = [[start, end]];
  }
  const { min_notice_hours, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("availability_settings")
    .update({ ...rest, min_notice_minutes: min_notice_hours * 60, weekly_hours: weekly })
    .eq("id", true);
  if (error) return { ok: false, message: "Couldn't save." };
  revalidatePath(PATH);
  return { ok: true, message: "Saved." };
}

export async function addBlockedDate(formData: FormData): Promise<void> {
  if (!(await owner())) return;
  const parsed = z
    .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(200).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("blocked_dates").upsert({ date: parsed.data.date, note: parsed.data.note || null }, { onConflict: "date" });
  revalidatePath(PATH);
}

export async function removeBlockedDate(id: string): Promise<void> {
  if (!(await owner())) return;
  const supabase = await createClient();
  await supabase.from("blocked_dates").delete().eq("id", z.uuid().parse(id));
  revalidatePath(PATH);
}

const typeSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80),
  description: z.string().trim().max(500).transform((v) => v || null),
  duration_minutes: int(5, 480),
  location_kind: z.enum(["zoom", "phone", "in_person"]),
  location_detail: z.string().trim().max(300).transform((v) => v || null),
  active: z.string().optional().transform((v) => v === "on"),
});

export async function saveAppointmentType(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await owner())) return { ok: false, message: "Only the owner can change settings." };
  const parsed = typeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the fields." };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("appointment_types").update(parsed.data).eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: "Couldn't save." };
  } else {
    const key = z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9-]{1,40}$/, "The link name can use letters, numbers and dashes.")
      .refine((k) => k !== "manage", "That link name is reserved.")
      .safeParse(formData.get("key"));
    if (!key.success) return { ok: false, message: key.error.issues[0]?.message ?? "Check the link name." };
    const { count } = await supabase.from("appointment_types").select("id", { count: "exact", head: true });
    const { error } = await supabase.from("appointment_types").insert({ ...parsed.data, key: key.data, position: count ?? 0 });
    if (error) return { ok: false, message: error.code === "23505" ? "That link name is taken." : "Couldn't add it." };
  }
  revalidatePath(PATH);
  return { ok: true, message: "Saved." };
}

export async function disconnectGoogle(): Promise<void> {
  const user = await owner();
  if (!user) return;
  const supabase = await createClient();
  await supabase.from("google_calendar_connection").delete().eq("id", true);
  await supabase.from("audit_log").insert({ action: "google_calendar.disconnected", entity: "google_calendar_connection" });
  revalidatePath(PATH);
}
