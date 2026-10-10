import { describe, expect, it } from "vitest";
import { contactTimeZone, formatInTimeZone, isValidTimeZone, localTimeOfDay, STUDIO_TIME_ZONE } from "@/lib/time";

describe("time zones", () => {
  it("falls back to the studio time zone when a contact has none or an invalid one", () => {
    expect(contactTimeZone(null)).toBe(STUDIO_TIME_ZONE);
    expect(contactTimeZone("Mars/Olympus")).toBe(STUDIO_TIME_ZONE);
    expect(contactTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("validates IANA names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("nope")).toBe(false);
  });

  it("reads local wall-clock time from a UTC instant", () => {
    const instant = new Date("2026-07-01T03:30:00Z"); // 8:30 PM PDT the evening before
    expect(localTimeOfDay(instant, "America/Los_Angeles")).toEqual({ hour: 20, minute: 30 });
    expect(localTimeOfDay(instant, "Asia/Kolkata")).toEqual({ hour: 9, minute: 0 });
  });

  it("handles daylight saving changes", () => {
    expect(localTimeOfDay(new Date("2026-01-15T17:00:00Z"), "America/Los_Angeles").hour).toBe(9); // PST
    expect(localTimeOfDay(new Date("2026-07-15T16:00:00Z"), "America/Los_Angeles").hour).toBe(9); // PDT
  });

  it("formats for display in a given zone", () => {
    expect(formatInTimeZone("2026-10-10T02:00:00Z", "America/Los_Angeles", { dateStyle: "medium" })).toBe("Oct 9, 2026");
  });
});
