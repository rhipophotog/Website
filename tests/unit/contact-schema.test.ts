import { describe, expect, it } from "vitest";
import { filtersToQuery, parseFilters, searchTerm } from "@/lib/contacts/queries";
import { consentSchema, contactFieldsSchema, contactFlagsSchema, quickAddExtrasSchema } from "@/lib/contacts/schema";

describe("contactFieldsSchema", () => {
  it("normalises email and phone, blanks become null", () => {
    const r = contactFieldsSchema.parse({ first_name: " Priya ", email: " PRIYA@Example.com ", phone: "(415) 555-0123", city: "", source: "" });
    expect(r).toMatchObject({ first_name: "Priya", email: "priya@example.com", phone: "+14155550123", city: null, source: null });
  });

  it("explains a bad phone or email", () => {
    const r = contactFieldsSchema.safeParse({ first_name: "P", phone: "123", email: "nope" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["phone", "email"]));
  });

  it("needs at least a name, email or phone", () => {
    expect(contactFieldsSchema.safeParse({ city: "Fresno" }).success).toBe(false);
  });

  it("rejects unknown sources", () => {
    expect(contactFieldsSchema.safeParse({ first_name: "P", source: "tiktok" }).success).toBe(false);
  });
});

describe("quick add extras and consent", () => {
  it("parses tags and the opportunity checkbox", () => {
    expect(quickAddExtrasSchema.parse({ tags: "VIP, vip, 2027", create_opportunity: "on", event_date: "2027-06-14" })).toMatchObject({
      tags: ["VIP", "2027"],
      create_opportunity: true,
      event_date: "2027-06-14",
    });
  });

  it("requires the exact consent wording", () => {
    expect(consentSchema.safeParse({ channel: "sms", granted: "yes", source: "verbal", text: "" }).success).toBe(false);
    expect(consentSchema.parse({ channel: "sms", granted: "no", source: "verbal", text: "Reply STOP to opt out" }).granted).toBe(false);
  });
});

describe("contact filters", () => {
  it("falls back to defaults on junk input", () => {
    expect(parseFilters({ page: "-3", source: "tiktok", stage: "DROP TABLE", month: "June", q: ["priya", "x"] })).toEqual({
      q: "priya",
      tag: "",
      source: "",
      stage: "",
      month: "",
      page: 1,
    });
  });

  it("strips characters that would break the PostgREST filter", () => {
    expect(searchTerm('priya),email.eq."x"*%')).toBe("priya email.eq. x");
  });

  it("serialises only set filters", () => {
    expect(filtersToQuery({ q: "priya", tag: "", page: 1 })).toBe("?q=priya");
    expect(filtersToQuery({ stage: "booked", page: 3 })).toBe("?stage=booked&page=3");
  });
});

describe("unticked checkboxes (not sent by the browser at all)", () => {
  it("count as false on edit and quick add", () => {
    expect(contactFlagsSchema.parse({})).toEqual({ email_marketing_consent: false, dnd_email: false, dnd_sms: false, stop_automations: false });
    expect(contactFlagsSchema.parse({ dnd_sms: "on" }).dnd_sms).toBe(true);
    expect(quickAddExtrasSchema.parse({}).create_opportunity).toBe(false);
  });
});
