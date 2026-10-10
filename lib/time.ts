/**
 * Time helpers. Everything is stored in UTC; we only convert at the edges (CLAUDE.md).
 * Uses Intl directly so there is no date library dependency.
 */

export const STUDIO_TIME_ZONE = "America/Los_Angeles";

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The time zone to use for a contact: theirs if known and valid, otherwise the studio's.
 * Workflow quiet hours are evaluated in this zone.
 */
export function contactTimeZone(tz: string | null | undefined, studioTz = STUDIO_TIME_ZONE): string {
  return isValidTimeZone(tz) ? tz : studioTz;
}

export function formatInTimeZone(
  date: Date | string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(d);
}

/** Wall-clock hour and minute of `date` in `timeZone` (0-23, 0-59). */
export function localTimeOfDay(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute") };
}
