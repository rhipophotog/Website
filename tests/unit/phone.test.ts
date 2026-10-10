import { describe, expect, it } from "vitest";
import { formatPhone, toE164 } from "@/lib/contacts/phone";

describe("toE164", () => {
  it.each([
    ["(415) 555-0123", "+14155550123"],
    ["415.555.0123", "+14155550123"],
    ["1-415-555-0123", "+14155550123"],
    ["+1 415 555 0123", "+14155550123"],
    ["+91 98765 43210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["011 44 20 7946 0958", "+442079460958"],
    ["+1 (604) 555-0199", "+16045550199"],
  ])("%s → %s", (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each(["", "  ", "12345", "not a phone", "+1 555"])("rejects %j", (input) => {
    expect(toE164(input)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("shows US numbers nationally and others internationally", () => {
    expect(formatPhone("+14155550123")).toBe("(415) 555-0123");
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone(null)).toBe("");
  });
});
