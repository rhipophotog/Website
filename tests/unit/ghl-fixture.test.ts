import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvWithHeader } from "@/lib/contacts/csv";
import { applyMapping, guessStage, normalizeRow, suggestMapping } from "@/lib/contacts/import-mapping";
import { planBatch } from "@/lib/contacts/import-plan";

const STAGES = ["new_inquiry", "contacted", "consult_scheduled", "consult_done", "proposal_sent", "booked", "pre_event", "event_done", "delivered", "lost", "cold"];

describe("sample GoHighLevel opportunities export, end to end (without the database)", () => {
  const text = readFileSync(path.join(import.meta.dirname, "../e2e/fixtures/ghl-opportunities-sample.csv"), "utf8");
  const { headers, rows } = parseCsvWithHeader(text);
  const mapping = suggestMapping(headers);
  const stageMapping = Object.fromEntries([...new Set(rows.map((r) => r.stage))].map((s) => [s, guessStage(s, STAGES)]));
  const normalized = rows.map((r, i) => ({ line: i + 2, result: normalizeRow(applyMapping(r, mapping), stageMapping) }));

  it("maps the stages", () => {
    expect(stageMapping).toEqual({ "New Lead": "new_inquiry", Booked: "booked", "Closed Lost": "lost" });
  });

  it("skips the empty row and warns about the bad phone", () => {
    const skipped = normalized.filter((n) => !n.result.ok).map((n) => n.line);
    expect(skipped).toEqual([6]);
    const meera = normalized[2].result;
    expect(meera.ok && meera.row.warnings).toEqual(['Phone "555" isn\'t a valid number and was left out']);
  });

  it("combines Priya's two rows into one contact with two opportunities", () => {
    const valid = normalized.flatMap((n) => (n.result.ok ? [{ index: n.line, row: n.result.row }] : []));
    let i = 0;
    const plan = planBatch(valid, [], () => `id-${++i}`);
    expect(plan.contacts).toHaveLength(3);
    const priya = plan.contacts.find((c) => c.insert?.email === "priya.e2e@example.com")!;
    expect(priya.tags).toEqual(["VIP", "2027", "sangeet"]);
    expect(priya.opportunities.map((o) => o.ghl_opportunity_id)).toEqual(["opp_e2e_1", "opp_e2e_4"]);
    expect(priya.notes).toEqual(["Loves candid shots, 3-day wedding"]);

    const anika = plan.contacts.find((c) => c.insert?.email === "anika.e2e@example.com")!;
    expect(anika.insert).toMatchObject({ phone: "+919876543210", source: "meta_ads", ghl_contact_id: "c_e2e_2" });
    expect(anika.opportunities[0]).toMatchObject({ stage_key: "booked", status: "won", value_cents: 1_850_000 });

    const meera = plan.contacts.find((c) => c.insert?.email === "meera.e2e@example.com")!;
    expect(meera.opportunities[0]).toMatchObject({ stage_key: "lost", status: "lost", lost_reason: "price" });
  });
});
