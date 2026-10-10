import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvWithHeader } from "@/lib/contacts/csv";
import { applyMapping, suggestMapping } from "@/lib/contacts/import-mapping";
import { IMPORT_BATCH_SIZE, rowsSchema, stageMappingSchema } from "@/lib/contacts/import-schemas";

/** What the browser sends to the import server actions must pass the server's checks. */

const GHL_CONTACTS_EXPORT = `"Contact Id","First Name","Last Name","Phone","Email","Business Name","Created","Last Activity","Tags"
"abc123","Priya","Sharma","+14155550123","priya@example.com",,"2026-09-04T08:49:19-07:00","Sep 04 2026 09:39 AM","status: scheduled call"
"def456","Dev",,"+447710173736",,,"2026-08-27T14:48:35-07:00","Aug 27 2026 02:48 PM",""`;

function batchFrom(text: string) {
  const { headers, rows } = parseCsvWithHeader(text);
  const mapping = suggestMapping(headers);
  return rows.map((r) => applyMapping(r, mapping));
}

describe("import action input checks", () => {
  it("accept rows that only have some fields (GoHighLevel contacts export)", () => {
    const batch = batchFrom(GHL_CONTACTS_EXPORT);
    expect(batch[1]).toEqual({ ghl_contact_id: "def456", first_name: "Dev", phone: "+447710173736", created_at: "2026-08-27T14:48:35-07:00" });
    expect(rowsSchema.safeParse(batch).success).toBe(true);
  });

  it("accept the sample opportunities export", () => {
    const text = readFileSync(path.join(import.meta.dirname, "../e2e/fixtures/ghl-opportunities-sample.csv"), "utf8");
    expect(rowsSchema.safeParse(batchFrom(text)).success).toBe(true);
  });

  it("accept a full batch and reject anything bigger", () => {
    const row = { email: "a@b.co" };
    expect(rowsSchema.safeParse(Array(IMPORT_BATCH_SIZE).fill(row)).success).toBe(true);
    expect(rowsSchema.safeParse(Array(IMPORT_BATCH_SIZE + 1).fill(row)).success).toBe(false);
  });

  it("reject fields that aren't importable", () => {
    expect(rowsSchema.safeParse([{ role: "owner" }]).success).toBe(false);
    expect(rowsSchema.safeParse([{ email: 42 }]).success).toBe(false);
  });

  it("only accept stage keys in the stage mapping", () => {
    expect(stageMappingSchema.safeParse({ "New Lead": "new_inquiry", Vendor: "" }).success).toBe(true);
    expect(stageMappingSchema.safeParse({ "New Lead": "DROP TABLE" }).success).toBe(false);
  });
});
