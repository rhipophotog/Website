import { describe, expect, it } from "vitest";
import { buildColumns, formatMoney, moveCard, timeInStage, type Card, type Stage } from "@/lib/pipeline/board";
import { moveSchema, opportunityFormObject, opportunityFormSchema } from "@/lib/pipeline/schema";

const stages: Stage[] = [
  { key: "new_inquiry", name: "New inquiry", position: 1, kind: "open", is_won: false },
  { key: "booked", name: "Booked", position: 6, kind: "open", is_won: true },
  { key: "lost", name: "Lost", position: 10, kind: "lost", is_won: false },
];

const card = (over: Partial<Card>): Card => ({
  id: "c1",
  contact_id: "p1",
  stage_key: "new_inquiry",
  status: "open",
  couple_names: null,
  contact_name: "Priya",
  partner_name: null,
  event_type: null,
  first_event_date: null,
  venue: null,
  city: null,
  value_cents: null,
  source: null,
  assigned_name: null,
  stage_changed_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("buildColumns", () => {
  it("groups by stage in stage order, with counts and totals", () => {
    const cols = buildColumns([...stages].reverse(), [
      card({ id: "a", value_cents: 1_000_000 }),
      card({ id: "b", value_cents: 500_000 }),
      card({ id: "c", stage_key: "booked", value_cents: 2_000_000 }),
      card({ id: "x", stage_key: "unknown_stage" }),
    ]);
    expect(cols.map((c) => [c.stage.key, c.count, c.totalCents])).toEqual([
      ["new_inquiry", 2, 1_500_000],
      ["booked", 1, 2_000_000],
      ["lost", 0, 0],
    ]);
  });

  it("sorts soonest wedding first, undated cards after (most recently moved first)", () => {
    const [col] = buildColumns(stages, [
      card({ id: "undated-old", stage_changed_at: "2026-01-01T00:00:00Z" }),
      card({ id: "late", first_event_date: "2027-09-01" }),
      card({ id: "undated-new", stage_changed_at: "2026-10-05T00:00:00Z" }),
      card({ id: "soon", first_event_date: "2027-03-01" }),
    ]);
    expect(col.cards.map((c) => c.id)).toEqual(["soon", "late", "undated-new", "undated-old"]);
  });
});

describe("moveCard (optimistic update)", () => {
  it("mirrors the database rule: status follows the stage", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    expect(moveCard([card({})], "c1", stages[1], now)[0]).toMatchObject({ stage_key: "booked", status: "won", stage_changed_at: now.toISOString() });
    expect(moveCard([card({})], "c1", stages[2], now)[0]).toMatchObject({ stage_key: "lost", status: "lost" });
    expect(moveCard([card({ id: "other" })], "c1", stages[1], now)[0].stage_key).toBe("new_inquiry");
  });
});

describe("formatting", () => {
  it("shows money and time in stage", () => {
    expect(formatMoney(1_250_000)).toBe("$12,500");
    const now = new Date("2026-10-10T00:00:00Z");
    expect(timeInStage("2026-10-07T00:00:00Z", now)).toBe("3d");
    expect(timeInStage("2026-09-01T00:00:00Z", now)).toBe("5w");
    expect(timeInStage("2026-05-01T00:00:00Z", now)).toBe("5mo");
  });
});

describe("opportunityFormSchema", () => {
  const form = (entries: [string, string][]) => {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return opportunityFormSchema.safeParse(opportunityFormObject(fd));
  };

  it("parses a multi-day wedding with services and value", () => {
    const r = form([
      ["stage_key", "booked"],
      ["couple_names", " Priya & Rohan "],
      ["event_type", "hindu"],
      ["event_dates", JSON.stringify([{ name: "Reception", date: "2027-05-16" }, { name: "", date: "2027-05-14" }, { name: "", date: "" }])],
      ["services", "photo"],
      ["services", "video"],
      ["value", "$18,500"],
      ["lost_reason", "price"],
    ]);
    expect(r.success && r.data).toMatchObject({
      stage_key: "booked",
      couple_names: "Priya & Rohan",
      services: ["photo", "video"],
      value_cents: 1_850_000,
      lost_reason: "price",
      event_dates: [
        { name: "Day 2", date: "2027-05-14" },
        { name: "Reception", date: "2027-05-16" },
      ],
    });
  });

  it("names a single day 'Wedding'", () => {
    const r = form([["stage_key", "new_inquiry"], ["event_dates", JSON.stringify([{ name: "", date: "2027-06-14" }])]]);
    expect(r.success && r.data.event_dates).toEqual([{ name: "Wedding", date: "2027-06-14" }]);
  });

  it("requires a reason for Lost, and dates on named days", () => {
    expect(form([["stage_key", "lost"]]).error?.issues[0].path).toEqual(["lost_reason"]);
    expect(form([["stage_key", "new_inquiry"], ["event_dates", JSON.stringify([{ name: "Sangeet", date: "" }])]]).success).toBe(false);
    expect(form([["stage_key", "new_inquiry"], ["value", "lots"]]).success).toBe(false);
    expect(form([["stage_key", "new_inquiry"], ["services", "catering"]]).success).toBe(false);
  });
});

describe("moveSchema", () => {
  it("needs a lost reason only for Lost", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(moveSchema.safeParse({ id, stage_key: "booked" }).success).toBe(true);
    expect(moveSchema.safeParse({ id, stage_key: "lost" }).success).toBe(false);
    expect(moveSchema.safeParse({ id, stage_key: "lost", lost_reason: "price" }).success).toBe(true);
    expect(moveSchema.safeParse({ id: "nope", stage_key: "booked" }).success).toBe(false);
  });
});
