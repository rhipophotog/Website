import { describe, expect, it } from "vitest";
import { addDays, dateKeyIn, formatSlot, tzOffsetMinutes, weekdayOf, zonedTimeToUtc } from "@/lib/calendar/time";

const LA = "America/Los_Angeles";

describe("zonedTimeToUtc", () => {
  it("converts winter and summer wall times", () => {
    expect(zonedTimeToUtc("2027-01-15", "10:00", LA).toISOString()).toBe("2027-01-15T18:00:00.000Z"); // PST −8
    expect(zonedTimeToUtc("2027-06-14", "10:00", LA).toISOString()).toBe("2027-06-14T17:00:00.000Z"); // PDT −7
    expect(zonedTimeToUtc("2027-06-14", "10:00", "Asia/Kolkata").toISOString()).toBe("2027-06-14T04:30:00.000Z");
    expect(zonedTimeToUtc("2027-06-14", "23:30", LA).toISOString()).toBe("2027-06-15T06:30:00.000Z");
  });

  it("handles the spring-forward gap and the fall-back overlap", () => {
    // 2027-03-14: 02:00 → 03:00 in LA. 02:30 doesn't exist; we land an hour later.
    expect(zonedTimeToUtc("2027-03-14", "02:30", LA).toISOString()).toBe("2027-03-14T10:30:00.000Z");
    expect(zonedTimeToUtc("2027-03-14", "10:00", LA).toISOString()).toBe("2027-03-14T17:00:00.000Z");
    // 2027-11-07: 01:30 happens twice; first occurrence is PDT.
    expect(zonedTimeToUtc("2027-11-07", "01:30", LA).toISOString()).toBe("2027-11-07T08:30:00.000Z");
    expect(zonedTimeToUtc("2027-11-07", "10:00", LA).toISOString()).toBe("2027-11-07T18:00:00.000Z");
  });

  it("round-trips through dateKeyIn", () => {
    for (const day of ["2027-01-01", "2027-03-14", "2027-07-04", "2027-11-07", "2027-12-31"]) {
      for (const t of ["00:00", "09:15", "12:00", "17:45", "23:59"]) {
        const instant = zonedTimeToUtc(day, t, LA);
        expect(dateKeyIn(instant, LA), `${day} ${t}`).toBe(day);
        expect(formatSlot(instant, LA).replace(/ /g, " ")).toBe(
          new Intl.DateTimeFormat("en-US", { timeZone: LA, hour: "numeric", minute: "2-digit" }).format(instant),
        );
      }
    }
  });
});

describe("date helpers", () => {
  it("weekday, adding days across month/year ends, offsets", () => {
    expect(weekdayOf("2027-06-14")).toBe(1); // Monday
    expect(addDays("2027-12-30", 3)).toBe("2028-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(tzOffsetMinutes(new Date("2027-01-15T12:00:00Z"), LA)).toBe(-480);
    expect(tzOffsetMinutes(new Date("2027-06-15T12:00:00Z"), LA)).toBe(-420);
    expect(dateKeyIn(new Date("2027-06-15T05:00:00Z"), LA)).toBe("2027-06-14");
  });
});
