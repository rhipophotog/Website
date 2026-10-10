import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/contacts/csv";
import { createClient } from "@/lib/supabase/server";

/** CSV of every contact. Owner only (SPEC §2, §12); each export is written to the audit log. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.role !== "owner") return new Response("Only the owner can export contacts", { status: 403 });

  const supabase = await createClient();
  const columns = [
    "id", "first_name", "last_name", "partner_name", "email", "phone", "preferred_contact", "city", "state",
    "country", "language", "time_zone", "source", "referral_by", "tag_names", "stage_keys", "first_event_date",
    "email_marketing_consent", "dnd_email", "dnd_sms", "stop_automations", "ghl_contact_id", "created_at", "updated_at",
  ] as const;

  const rows: string[][] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("contact_list")
      .select(columns.join(","))
      .order("created_at")
      .range(from, from + pageSize - 1);
    if (error) return new Response("Export failed", { status: 500 });
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      rows.push(columns.map((c) => (Array.isArray(row[c]) ? (row[c] as string[]).join(", ") : String(row[c] ?? ""))));
    }
    if (!data || data.length < pageSize) break;
  }

  await supabase.from("audit_log").insert({ action: "contacts.exported", entity: "contacts", data: { rows: rows.length } });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${toCsv([[...columns], ...rows])}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rhipo-contacts-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
