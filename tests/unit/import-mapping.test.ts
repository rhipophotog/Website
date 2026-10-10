import { describe, expect, it } from "vitest";
import {
  applyMapping,
  guessStage,
  looksLikeGoHighLevel,
  normalizeRow,
  parseDate,
  parseDnd,
  parseLostReason,
  parseMoneyCents,
  parseSource,
  parseTags,
  splitFullName,
  suggestMapping,
} from "@/lib/contacts/import-mapping";

const STAGES = [
  "new_inquiry", "contacted", "consult_scheduled", "consult_done", "proposal_sent",
  "booked", "pre_event", "event_done", "delivered", "lost", "cold",
];

const GHL_CONTACT_HEADERS = [
  "Contact Id", "First Name", "Last Name", "Business Name", "Phone", "Email", "Created", "Last Activity", "Tags",
  "Additional Emails", "Additional Phones", "Wedding Date", "Partner Name",
];
const GHL_OPPORTUNITY_HEADERS = [
  "Opportunity Name", "Contact Name", "phone", "email", "pipeline", "stage", "Lead Value", "source", "assigned",
  "Created on", "Updated on", "lost reason ID", "lost reason name", "Followers", "Notes", "tags", "status",
  "Opportunity ID", "Contact ID", "Pipeline Stage ID", "Pipeline ID",
];

describe("GoHighLevel header detection", () => {
  it("maps a contacts export", () => {
    expect(looksLikeGoHighLevel(GHL_CONTACT_HEADERS)).toBe(true);
    expect(suggestMapping(GHL_CONTACT_HEADERS)).toEqual({
      "Contact Id": "ghl_contact_id",
      "First Name": "first_name",
      "Last Name": "last_name",
      Phone: "phone",
      Email: "email",
      Created: "created_at",
      Tags: "tags",
      "Wedding Date": "event_date",
      "Partner Name": "partner_name",
    });
  });

  it("maps an opportunities export", () => {
    const mapping = suggestMapping(GHL_OPPORTUNITY_HEADERS);
    expect(mapping).toMatchObject({
      "Opportunity Name": "opportunity_name",
      "Contact Name": "full_name",
      phone: "phone",
      email: "email",
      stage: "stage",
      "Lead Value": "value",
      source: "source",
      "Created on": "created_at",
      "lost reason name": "lost_reason",
      Notes: "notes",
      tags: "tags",
      status: "status",
      "Opportunity ID": "ghl_opportunity_id",
      "Contact ID": "ghl_contact_id",
    });
    expect(Object.values(mapping).filter((f) => f === "lost_reason")).toHaveLength(1);
  });

  it("ignores unknown columns and uses each field once", () => {
    expect(suggestMapping(["Email", "E-mail", "Favourite colour"])).toEqual({ Email: "email" });
  });
});

describe("value parsers", () => {
  it.each([
    ["Facebook Lead Ad", "meta_ads"],
    ["IG", "instagram"],
    ["Google Ads", "google_ads"],
    ["The Knot", "weddingwire_knot"],
    ["Referral from Anika", "referral"],
    ["Website form", "website"],
    ["Planner (Shaadi Co)", "vendor"],
    ["Billboard", "other"],
    ["meta_ads", "meta_ads"],
  ])("source %s → %s", (raw, key) => expect(parseSource(raw)).toBe(key));

  it("reads GoHighLevel DND columns", () => {
    expect(parseDnd({ dnd: "true" })).toEqual({ dnd_sms: true, dnd_email: true });
    expect(parseDnd({ dnd: "SMS, Calls" })).toEqual({ dnd_sms: true, dnd_email: false });
    expect(parseDnd({ dnd: "false", dnd_email: "yes" })).toEqual({ dnd_sms: false, dnd_email: true });
    expect(parseDnd({})).toEqual({ dnd_sms: false, dnd_email: false });
  });

  it.each([
    ["2027-06-14", "2027-06-14"],
    ["2027-06-14T18:00:00Z", "2027-06-14"],
    ["6/14/2027", "2027-06-14"],
    ["06-14-27", "2027-06-14"],
    ["June 14, 2027", "2027-06-14"],
    ["2/30/2027", null],
    ["someday", null],
  ])("date %s → %s", (raw, expected) => expect(parseDate(raw)).toBe(expected));

  it("parses money, tags, names and lost reasons", () => {
    expect(parseMoneyCents("$4,500.50")).toBe(450050);
    expect(parseMoneyCents("n/a")).toBeNull();
    expect(parseTags("VIP, sangeet only;vip | ")).toEqual(["VIP", "sangeet only"]);
    expect(splitFullName("Priya Anand Sharma")).toEqual({ first: "Priya Anand", last: "Sharma" });
    expect(splitFullName("Priya & Rohan")).toEqual({ first: "Priya & Rohan", last: null });
    expect(parseLostReason("Over budget")).toBe("price");
    expect(parseLostReason("Date already booked")).toBe("date_taken");
    expect(parseLostReason("Ghosted")).toBe("no_response");
  });

  it("guesses stages from GoHighLevel stage names", () => {
    expect(guessStage("New Lead", STAGES)).toBe("new_inquiry");
    expect(guessStage("Consultation Scheduled", STAGES)).toBe("consult_scheduled");
    expect(guessStage("Proposal Sent", STAGES)).toBe("proposal_sent");
    expect(guessStage("Booked - Retainer Paid", STAGES)).toBe("booked");
    expect(guessStage("Closed Lost", STAGES)).toBe("lost");
    expect(guessStage("Nurture", STAGES)).toBe("cold");
    expect(guessStage("consult_done", STAGES)).toBe("consult_done");
    expect(guessStage("Something odd", STAGES)).toBe("new_inquiry");
  });
});

describe("normalizeRow", () => {
  it("cleans a typical GoHighLevel row", () => {
    const mapping = suggestMapping(GHL_OPPORTUNITY_HEADERS);
    const raw = applyMapping(
      {
        "Opportunity Name": "Priya & Rohan",
        "Contact Name": "Priya Sharma",
        phone: "(415) 555-0123",
        email: " Priya@Example.com ",
        stage: "Booked",
        "Lead Value": "$12,000",
        source: "Instagram",
        status: "won",
        "Opportunity ID": "opp_1",
        "Contact ID": "c_1",
        tags: "VIP, 2027",
        Notes: "Loves candid shots",
      },
      mapping,
    );
    const result = normalizeRow(raw, { Booked: "booked" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.contact).toMatchObject({
      first_name: "Priya",
      last_name: "Sharma",
      email: "priya@example.com",
      phone: "+14155550123",
      source: "instagram",
      ghl_contact_id: "c_1",
      dnd_sms: false,
    });
    expect(result.row.tags).toEqual(["VIP", "2027"]);
    expect(result.row.note).toBe("Loves candid shots");
    expect(result.row.opportunity).toMatchObject({
      ghl_opportunity_id: "opp_1",
      couple_names: "Priya & Rohan",
      stage_key: "booked",
      status: "won",
      value_cents: 1_200_000,
      lost_reason: null,
    });
  });

  it("keeps the contact but drops a bad phone or email, with a warning", () => {
    const result = normalizeRow({ first_name: "Anika", phone: "12", email: "anika@" });
    expect(result.ok && result.row.contact).toMatchObject({ first_name: "Anika", phone: null, email: null });
    expect(result.ok && result.row.warnings).toHaveLength(2);
  });

  it("skips rows with nothing to identify the person", () => {
    expect(normalizeRow({ city: "Fresno", tags: "x" })).toEqual({ ok: false, error: "No name, email or phone" });
  });

  it("marks lost opportunities with a reason, and can skip the pipeline", () => {
    const lost = normalizeRow({ email: "a@b.co", stage: "Closed Lost", lost_reason: "Went with another photographer" }, { "Closed Lost": "lost" });
    expect(lost.ok && lost.row.opportunity).toMatchObject({ stage_key: "lost", status: "lost", lost_reason: "went_with_other" });

    const skipped = normalizeRow({ email: "a@b.co", stage: "Vendor list" }, { "Vendor list": "" });
    expect(skipped.ok && skipped.row.opportunity).toBeNull();
  });
});
