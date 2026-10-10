"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClass, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/contacts/schema";
import { saveAppointmentType, saveAvailability } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type AvailabilityForm = {
  time_zone: string;
  weekly_hours: Record<string, [string, string][]>;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  max_per_day: number;
  slot_step_minutes: number;
  zoom_link: string | null;
};

export function AvailabilityEditor({ settings }: { settings: AvailabilityForm }) {
  const [state, action] = useActionState<FormState, FormData>(saveAvailability, null);
  const err = state?.fieldErrors ?? {};
  const num = (name: keyof AvailabilityForm | "min_notice_hours", label: string, value: number, hint?: string) => (
    <Field label={label} name={name} error={err[name]} hint={hint}>
      <input id={name} name={name} type="number" inputMode="numeric" defaultValue={value} className={inputClass} />
    </Field>
  );
  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Weekly hours</legend>
        {DAYS.map((day, d) => {
          const range = settings.weekly_hours[String(d)]?.[0];
          return (
            <div key={day} className="grid grid-cols-[7.5rem_1fr_1fr] items-center gap-2 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name={`day_${d}_open`} defaultChecked={Boolean(range)} className="size-5" />
                {day.slice(0, 3)}
              </label>
              <input aria-label={`${day} start`} name={`day_${d}_start`} type="time" defaultValue={range?.[0] ?? "10:00"} className={inputClass} />
              <input aria-label={`${day} end`} name={`day_${d}_end`} type="time" defaultValue={range?.[1] ?? "18:00"} className={inputClass} />
            </div>
          );
        })}
      </fieldset>
      <Field label="Time zone" name="time_zone" error={err.time_zone} hint="Your hours are in this zone. Guests see times in their own.">
        <input id="time_zone" name="time_zone" defaultValue={settings.time_zone} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        {num("buffer_minutes", "Buffer (minutes)", settings.buffer_minutes, "Gap kept around every booking")}
        {num("min_notice_hours", "Minimum notice (hours)", Math.round(settings.min_notice_minutes / 60))}
        {num("max_days_ahead", "Book up to (days ahead)", settings.max_days_ahead)}
        {num("max_per_day", "Max bookings per day", settings.max_per_day)}
      </div>
      <Field label="Start times every" name="slot_step_minutes">
        <select id="slot_step_minutes" name="slot_step_minutes" defaultValue={settings.slot_step_minutes} className={inputClass}>
          {[10, 15, 20, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </Field>
      <Field label="Zoom link" name="zoom_link" error={err.zoom_link} hint="Your personal meeting room. Sent with Zoom bookings.">
        <input id="zoom_link" name="zoom_link" type="url" placeholder="https://zoom.us/j/…" defaultValue={settings.zoom_link ?? ""} className={inputClass} />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…">Save availability</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export type TypeForm = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  location_kind: "zoom" | "phone" | "in_person";
  location_detail: string | null;
  active: boolean;
};

export function AppointmentTypeEditor({ type, bookUrl }: { type: TypeForm | null; bookUrl?: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveAppointmentType.bind(null, type?.id ?? null), null);
  return (
    <form action={action} className="space-y-3">
      {type ? (
        bookUrl && <p className="break-all text-xs text-muted">{bookUrl}</p>
      ) : (
        <Field label="Link name" name="key" hint="Becomes /book/<link name>, e.g. family-session">
          <input id="key" name="key" required className={inputClass} />
        </Field>
      )}
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Name" name={`name-${type?.id ?? "new"}`}>
          <input id={`name-${type?.id ?? "new"}`} name="name" defaultValue={type?.name} required className={inputClass} />
        </Field>
        <Field label="Minutes" name={`dur-${type?.id ?? "new"}`}>
          <input id={`dur-${type?.id ?? "new"}`} name="duration_minutes" type="number" defaultValue={type?.duration_minutes ?? 30} className={inputClass} />
        </Field>
      </div>
      <Field label="Description" name={`desc-${type?.id ?? "new"}`}>
        <textarea id={`desc-${type?.id ?? "new"}`} name="description" rows={2} defaultValue={type?.description ?? ""} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Where" name={`loc-${type?.id ?? "new"}`}>
          <select id={`loc-${type?.id ?? "new"}`} name="location_kind" defaultValue={type?.location_kind ?? "zoom"} className={inputClass}>
            <option value="zoom">Zoom</option>
            <option value="phone">Phone (you call them)</option>
            <option value="in_person">In person</option>
          </select>
        </Field>
        <Field label="Address (in person)" name={`addr-${type?.id ?? "new"}`}>
          <input id={`addr-${type?.id ?? "new"}`} name="location_detail" defaultValue={type?.location_detail ?? ""} className={inputClass} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="active" defaultChecked={type?.active ?? true} className="size-5" /> Bookable
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…">{type ? "Save" : "Add type"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
