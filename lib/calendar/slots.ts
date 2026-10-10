import { addDays, dateKeyIn, isValidTime, weekdayOf, zonedTimeToUtc } from "./time";

/** Bookable slots (SPEC §7): weekly hours, blocked dates, buffers, notice, horizon, daily cap, busy times. */

export type WeeklyHours = Record<string, [string, string][]>;

export type Availability = {
  time_zone: string;
  weekly_hours: WeeklyHours;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  max_per_day: number;
  slot_step_minutes: number;
};

export type Busy = { start: Date; end: Date };

export type SlotInput = {
  now: Date;
  availability: Availability;
  durationMinutes: number;
  blockedDates: string[];
  /** Appointments already booked (count toward the daily cap). */
  appointments: Busy[];
  /** Other busy time, e.g. Google Calendar events (don't count toward the cap). */
  externalBusy: Busy[];
  /** Ignore this appointment when rescheduling it. */
  ignore?: Busy | null;
};

export type Slot = { start: Date; end: Date; dateKey: string };

const MIN = 60_000;

export function computeSlots(input: SlotInput): Slot[] {
  const { now, availability: a, durationMinutes } = input;
  const tz = a.time_zone;
  const blocked = new Set(input.blockedDates);
  const sameAs = (x: Busy) => input.ignore && x.start.getTime() === input.ignore.start.getTime() && x.end.getTime() === input.ignore.end.getTime();
  const appointments = input.appointments.filter((x) => !sameAs(x));
  const buffer = a.buffer_minutes * MIN;
  // Buffers apply around every busy block, so meetings never sit back to back.
  const busy = [...appointments, ...input.externalBusy].map((b) => ({ start: b.start.getTime() - buffer, end: b.end.getTime() + buffer }));
  const earliest = now.getTime() + a.min_notice_minutes * MIN;

  const perDay = new Map<string, number>();
  for (const appt of appointments) {
    const key = dateKeyIn(appt.start, tz);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const slots: Slot[] = [];
  const today = dateKeyIn(now, tz);
  for (let i = 0; i <= a.max_days_ahead; i++) {
    const dateKey = addDays(today, i);
    if (blocked.has(dateKey)) continue;
    if ((perDay.get(dateKey) ?? 0) >= a.max_per_day) continue;
    const windows = a.weekly_hours[String(weekdayOf(dateKey))] ?? [];
    for (const [from, to] of windows) {
      if (!isValidTime(from) || !isValidTime(to)) continue;
      const windowStart = zonedTimeToUtc(dateKey, from, tz).getTime();
      const windowEnd = to === "24:00" ? zonedTimeToUtc(addDays(dateKey, 1), "00:00", tz).getTime() : zonedTimeToUtc(dateKey, to, tz).getTime();
      for (let t = windowStart; t + durationMinutes * MIN <= windowEnd; t += a.slot_step_minutes * MIN) {
        if (t < earliest) continue;
        const end = t + durationMinutes * MIN;
        if (busy.some((b) => t < b.end && end > b.start)) continue;
        slots.push({ start: new Date(t), end: new Date(end), dateKey });
      }
    }
  }
  return slots;
}

/** Is `start` one of the offered slots? (Server re-check before booking.) */
export function isSlotAvailable(input: SlotInput, start: Date): boolean {
  return computeSlots(input).some((s) => s.start.getTime() === start.getTime());
}
