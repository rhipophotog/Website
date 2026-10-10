import { describe, expect, it } from "vitest";
import { computeSlots, isSlotAvailable, type Availability, type SlotInput } from "@/lib/calendar/slots";

const LA = "America/Los_Angeles";
const availability: Availability = {
  time_zone: LA,
  weekly_hours: { "0": [], "1": [["10:00", "12:00"]], "2": [["10:00", "12:00"]], "3": [], "4": [], "5": [], "6": [["10:00", "11:00"]] },
  buffer_minutes: 15,
  min_notice_minutes: 0,
  max_days_ahead: 7,
  max_per_day: 4,
  slot_step_minutes: 30,
};
// Sunday 2027-06-13 09:00 PDT
const now = new Date("2027-06-13T16:00:00Z");
const base: SlotInput = { now, availability, durationMinutes: 30, blockedDates: [], appointments: [], externalBusy: [] };
const times = (input: Partial<SlotInput>) =>
  computeSlots({ ...base, ...input }).map((s) => `${s.dateKey} ${new Intl.DateTimeFormat("en-GB", { timeZone: LA, hour: "2-digit", minute: "2-digit" }).format(s.start)}`);

describe("computeSlots", () => {
  it("offers slots inside weekly hours, in the studio time zone", () => {
    const slots = times({ availability: { ...availability, max_days_ahead: 1 } });
    expect(slots).toEqual(["2027-06-14 10:00", "2027-06-14 10:30", "2027-06-14 11:00", "2027-06-14 11:30"]);
  });

  it("fits the meeting length in the window", () => {
    expect(times({ durationMinutes: 45, availability: { ...availability, max_days_ahead: 1 } })).toEqual(["2027-06-14 10:00", "2027-06-14 10:30", "2027-06-14 11:00"]);
  });

  it("skips blocked dates and days with no hours", () => {
    const slots = times({ blockedDates: ["2027-06-14"] });
    expect(slots.some((s) => s.startsWith("2027-06-14"))).toBe(false);
    expect(slots.some((s) => s.startsWith("2027-06-16"))).toBe(false); // Wednesday: no hours
    expect(slots.filter((s) => s.startsWith("2027-06-19"))).toEqual(["2027-06-19 10:00", "2027-06-19 10:30"]);
  });

  it("respects minimum notice and the booking horizon", () => {
    const slots = times({ availability: { ...availability, min_notice_minutes: 26 * 60 + 30 } }); // until Mon 11:30
    expect(slots.filter((s) => s.startsWith("2027-06-14"))).toEqual(["2027-06-14 11:30"]);
    expect(times({ availability: { ...availability, max_days_ahead: 0 } })).toEqual([]);
  });

  it("keeps a buffer around booked and external busy times", () => {
    const booked = { start: new Date("2027-06-14T17:30:00Z"), end: new Date("2027-06-14T18:00:00Z") }; // 10:30–11:00
    const slots = times({ appointments: [booked], availability: { ...availability, max_days_ahead: 1 } });
    expect(slots).toEqual(["2027-06-14 11:30"]); // 10:00 ends 10:30 (+15 buffer overlap), 11:00 starts within buffer
    const google = { start: new Date("2027-06-14T17:00:00Z"), end: new Date("2027-06-14T19:00:00Z") };
    expect(times({ externalBusy: [google], availability: { ...availability, max_days_ahead: 1 } })).toEqual([]);
  });

  it("stops offering a day once it hits the daily cap (external events don't count)", () => {
    // Tuesday 12:00 and 13:00 local: outside the bookable window, but they still count toward the cap.
    const tuesday = (h: number) => ({ start: new Date(`2027-06-15T${h}:00:00Z`), end: new Date(`2027-06-15T${h}:20:00Z`) });
    const capped = { ...availability, max_per_day: 2 };
    expect(times({ appointments: [tuesday(19), tuesday(20)], availability: capped }).some((s) => s.startsWith("2027-06-15"))).toBe(false);
    expect(times({ externalBusy: [tuesday(19), tuesday(20)], availability: capped }).some((s) => s.startsWith("2027-06-15"))).toBe(true);
  });

  it("ignores the appointment being rescheduled", () => {
    const own = { start: new Date("2027-06-14T17:00:00Z"), end: new Date("2027-06-14T17:30:00Z") };
    const input = { ...base, appointments: [own], availability: { ...availability, max_days_ahead: 1 } };
    expect(isSlotAvailable(input, own.start)).toBe(false);
    expect(isSlotAvailable({ ...input, ignore: own }, own.start)).toBe(true);
  });

  it("keeps wall-clock hours across a DST change", () => {
    const sunday = { ...availability, weekly_hours: { "0": [["10:00", "11:00"]] } as Availability["weekly_hours"], max_days_ahead: 7 };
    const before = new Date("2027-11-01T16:00:00Z");
    const slots = computeSlots({ ...base, now: before, availability: sunday });
    // Sunday 2027-11-07 is the fall-back day: 10:00 PST = 18:00Z
    expect(slots.map((s) => s.start.toISOString())).toEqual(["2027-11-07T18:00:00.000Z", "2027-11-07T18:30:00.000Z"]);
  });

  it("ignores malformed hours instead of crashing", () => {
    expect(times({ availability: { ...availability, weekly_hours: { "1": [["25:00", "10:00"]] } } })).toEqual([]);
  });
});
