/**
 * Calendar date/time helpers in an IANA time zone, using Intl only (no date library).
 * A "date key" is a local calendar date "YYYY-MM-DD"; a "time" is "HH:MM" (24h).
 */

const pad = (n: number) => String(n).padStart(2, "0");

function parts(date: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. -420 for PDT). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The UTC instant of wall-clock `time` on `dateKey` in `timeZone`.
 * During a fall-back overlap (01:30 happens twice) it returns the first occurrence;
 * in a spring-forward gap (02:30 doesn't exist) it returns the instant one hour later.
 */
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, min);
  const first = naive - tzOffsetMinutes(new Date(naive), timeZone) * 60000;
  const second = naive - tzOffsetMinutes(new Date(first), timeZone) * 60000;
  const matches = (t: number) => {
    const p = parts(new Date(t), timeZone);
    return p.y === y && p.m === m && p.d === d && p.h === h && p.min === min;
  };
  const exact = [first, second, first - 3_600_000, second - 3_600_000].filter(matches).sort((a, b) => a - b);
  return new Date(exact[0] ?? Math.max(first, second));
}

/** Local calendar date of `date` in `timeZone`. */
export function dateKeyIn(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** 0 = Sunday … 6 = Saturday, for a date key (time-zone independent). */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) || t === "24:00";
}

/** "Wednesday, June 14 · 10:00 AM PDT" in the given zone. */
export function formatSlot(date: Date, timeZone: string, opts: { withDate?: boolean; withZone?: boolean } = {}): string {
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: opts.withZone ? "short" : undefined }).format(date);
  if (!opts.withDate) return time;
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(date);
  return `${day} · ${time}`;
}
