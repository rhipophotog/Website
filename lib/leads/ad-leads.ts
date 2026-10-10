import { z } from "zod";
import { toE164 } from "@/lib/contacts/phone";
import { parseDate, splitFullName } from "@/lib/contacts/import-mapping";

/** Turning Meta Lead Ads and Google Ads lead form payloads into capture_lead() input. */

export type AdLead = {
  source: "meta_ads" | "google_ads";
  external_id: string;
  first_name: string | null;
  last_name: string | null;
  partner_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  venue: string | null;
  event_date: string | null;
  event_date_text: string | null;
  message: string | null;
  campaign: string | null;
  ad: string | null;
  data: Record<string, unknown>;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Question name (Meta field name or Google column id) → what it is. Custom questions are matched loosely. */
function classify(name: string): keyof AdLead | null {
  const n = norm(name);
  if (n === "fullname" || n === "name") return "first_name";
  if (n === "firstname") return "first_name";
  if (n === "lastname") return "last_name";
  if (n === "email" || n === "workemail") return "email";
  if (n === "phonenumber" || n === "phone" || n === "workphone" || n === "mobilephone") return "phone";
  if (n === "city") return "city";
  if (/partner|fianc|spouse/.test(n)) return "partner_name";
  if (/wedding.*date|event.*date|^date|whenisyour/.test(n)) return "event_date";
  if (/venue|location|where/.test(n)) return "venue";
  if (/message|comment|tellus|details|anythingelse/.test(n)) return "message";
  return null;
}

function fromAnswers(answers: { name: string; value: string }[]) {
  const out: Partial<AdLead> = {};
  let fullName: string | null = null;
  for (const { name, value } of answers) {
    const v = value.trim();
    if (!v) continue;
    const n = norm(name);
    if (n === "fullname" || n === "name") {
      fullName = v;
      continue;
    }
    const field = classify(name);
    if (!field || out[field]) continue;
    if (field === "event_date") {
      out.event_date_text = v;
      out.event_date = parseDate(v);
    } else if (field === "phone") {
      out.phone = toE164(v);
    } else if (field === "email") {
      out.email = z.email().safeParse(v.toLowerCase()).success ? v.toLowerCase() : null;
    } else {
      (out as Record<string, string>)[field] = v.slice(0, 2000);
    }
  }
  if (fullName && !out.first_name && !out.last_name) {
    const split = splitFullName(fullName);
    out.first_name = split.first;
    out.last_name = split.last;
  }
  return out;
}

function complete(partial: Partial<AdLead>, base: Pick<AdLead, "source" | "external_id" | "campaign" | "ad" | "data">): AdLead {
  return {
    first_name: null,
    last_name: null,
    partner_name: null,
    email: null,
    phone: null,
    city: null,
    venue: null,
    event_date: null,
    event_date_text: null,
    message: null,
    ...partial,
    ...base,
  };
}

// ---------------------------------------------------------------------------
// Meta (Graph API lead: { id, field_data: [{ name, values: [] }], campaign_name, ad_name, form_id })
// ---------------------------------------------------------------------------

export const metaWebhookSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z.object({ leadgen_id: z.union([z.string(), z.number()]).transform(String) }).passthrough(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export function leadgenIds(payload: z.infer<typeof metaWebhookSchema>): string[] {
  return payload.entry.flatMap((e) => e.changes.filter((c) => c.field === "leadgen").map((c) => c.value.leadgen_id));
}

export const metaLeadSchema = z.object({
  id: z.string(),
  field_data: z.array(z.object({ name: z.string(), values: z.array(z.string()).default([]) })).default([]),
  campaign_name: z.string().optional(),
  ad_name: z.string().optional(),
  form_id: z.string().optional(),
  created_time: z.string().optional(),
});

export function metaLeadToAdLead(lead: z.infer<typeof metaLeadSchema>): AdLead {
  const answers = lead.field_data.map((f) => ({ name: f.name, value: f.values.join(", ") }));
  return complete(fromAnswers(answers), {
    source: "meta_ads",
    external_id: `meta:${lead.id}`,
    campaign: lead.campaign_name ?? null,
    ad: lead.ad_name ?? null,
    data: { provider: "meta", form_id: lead.form_id, created_time: lead.created_time, answers },
  });
}

// ---------------------------------------------------------------------------
// Google Ads lead form webhook
// { lead_id, google_key, user_column_data: [{ column_id, column_name?, string_value }], campaign_id, form_id, is_test }
// ---------------------------------------------------------------------------

export const googleLeadSchema = z.object({
  lead_id: z.string().min(1).max(200),
  google_key: z.string().optional(),
  user_column_data: z
    .array(z.object({ column_id: z.string().optional(), column_name: z.string().optional(), string_value: z.string().default("") }))
    .default([]),
  campaign_id: z.union([z.string(), z.number()]).transform(String).optional(),
  adgroup_id: z.union([z.string(), z.number()]).transform(String).optional(),
  creative_id: z.union([z.string(), z.number()]).transform(String).optional(),
  form_id: z.union([z.string(), z.number()]).transform(String).optional(),
  is_test: z.boolean().optional(),
});

export function googleLeadToAdLead(lead: z.infer<typeof googleLeadSchema>): AdLead {
  const answers = lead.user_column_data.map((c) => ({ name: c.column_name || c.column_id || "", value: c.string_value }));
  return complete(fromAnswers(answers), {
    source: "google_ads",
    external_id: `google:${lead.lead_id}`,
    campaign: lead.campaign_id ? `Campaign ${lead.campaign_id}` : null,
    ad: lead.is_test ? "TEST lead" : lead.creative_id ? `Ad ${lead.creative_id}` : null,
    data: { provider: "google", form_id: lead.form_id, campaign_id: lead.campaign_id, is_test: lead.is_test ?? false, answers },
  });
}
