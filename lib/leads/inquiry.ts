import { z } from "zod";
import { EVENT_TYPE_KEYS } from "@/lib/contacts/fields";
import { toE164 } from "@/lib/contacts/phone";

/** The public wedding inquiry form (SPEC §5.1). */

export const BUDGETS = ["Under $5k", "$5k–10k", "$10k–20k", "$20k+", "Not sure yet"] as const;
export const HEARD_ABOUT = ["Instagram", "Google", "Facebook", "A friend or family", "A vendor or planner", "WeddingWire / The Knot", "Other"] as const;
export const SERVICE_CHOICES = [
  { key: "photo", label: "Photography" },
  { key: "video", label: "Cinematography" },
  { key: "drone", label: "Drone" },
  { key: "album", label: "Album" },
] as const;

/** Map "how did you hear" to a contact source. */
export function sourceFromHeardAbout(heard: string | null): "website" | "instagram" | "referral" | "vendor" | "weddingwire_knot" {
  switch (heard) {
    case "Instagram":
      return "instagram";
    case "A friend or family":
      return "referral";
    case "A vendor or planner":
      return "vendor";
    case "WeddingWire / The Knot":
      return "weddingwire_knot";
    default:
      return "website";
  }
}

const text = (max: number, required?: string) => {
  const base = z.string().trim().max(max);
  return required ? base.min(1, required) : base.optional().nullable().transform((v) => v || null);
};

export const inquirySchema = z
  .object({
    first_name: z.string().trim().min(1, "Please add your first name.").max(100),
    last_name: text(100),
    partner_name: text(100),
    email: z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email.")),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v) return null;
        const e164 = toE164(v);
        if (!e164) {
          ctx.addIssue({ code: "custom", message: "Please enter a valid phone number (with +country code if outside the US)." });
          return z.NEVER;
        }
        return e164;
      }),
    event_date: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Please pick a date."),
    venue: text(200),
    event_type: z.enum([...EVENT_TYPE_KEYS, ""]).optional().nullable().transform((v) => v || null),
    services: z.array(z.enum(["photo", "video", "drone", "album"])).default([]),
    budget: z.enum([...BUDGETS, ""]).optional().nullable().transform((v) => v || null),
    heard_about: z.enum([...HEARD_ABOUT, ""]).optional().nullable().transform((v) => v || null),
    message: text(3000),
    sms_consent: z
      .union([z.literal("on"), z.literal("yes"), z.literal(""), z.null()])
      .optional() // an unticked checkbox isn't sent at all
      .transform((v) => v === "on" || v === "yes"),
  })
  .refine((v) => !v.sms_consent || v.phone, { message: "Add a phone number so we can text you.", path: ["phone"] });

export type Inquiry = z.infer<typeof inquirySchema>;

/** Honeypot: a field humans never see. Anything in it means a bot. */
export const HONEYPOT_FIELD = "company_website";

/** FormData → object, keeping repeated `services` values as an array. */
export function inquiryFormObject(formData: FormData) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key === "services") out.services = [...((out.services as string[] | undefined) ?? []), value];
    else out[key] = value;
  }
  return out;
}

/** Shape the lead for capture_lead(). The consent text is the exact wording the form showed. */
export function inquiryToLead(inquiry: Inquiry, consentText: string, ipHash: string | null) {
  return {
    source: "website" as const,
    form_key: "inquiry",
    ip_hash: ipHash,
    first_name: inquiry.first_name,
    last_name: inquiry.last_name,
    partner_name: inquiry.partner_name,
    email: inquiry.email,
    phone: inquiry.phone,
    event_date: inquiry.event_date,
    venue: inquiry.venue,
    event_type: inquiry.event_type,
    services: inquiry.services,
    budget: inquiry.budget,
    heard_about: inquiry.heard_about,
    message: inquiry.message,
    sms_consent_text: inquiry.sms_consent && inquiry.phone ? consentText : null,
    contact_source: sourceFromHeardAbout(inquiry.heard_about),
  };
}
