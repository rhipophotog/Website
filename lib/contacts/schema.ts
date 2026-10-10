import { z } from "zod";
import { EVENT_TYPE_KEYS, SOURCE_KEYS } from "./fields";
import { parseTags } from "./import-mapping";
import { toE164 } from "./phone";

/** Form input → clean contact fields. Shared by quick-add and edit. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null);

// .optional(): an unticked checkbox isn't sent at all, and in Zod 4 a missing key fails
// unless the field itself is optional (z.undefined() inside a union isn't enough).
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.null()])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const contactFieldsSchema = z
  .object({
    first_name: optionalText(100),
    last_name: optionalText(100),
    partner_name: optionalText(100),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address."),
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
          ctx.addIssue({ code: "custom", message: "Enter a valid phone number (add +country code if it isn't a US number)." });
          return z.NEVER;
        }
        return e164;
      }),
    preferred_contact: z
      .enum(["sms", "email", "whatsapp", ""])
      .optional()
      .nullable()
      .transform((v) => v || null),
    city: optionalText(100),
    state: optionalText(100),
    country: optionalText(100),
    language: optionalText(50),
    time_zone: optionalText(60),
    source: z
      .enum([...SOURCE_KEYS, ""])
      .optional()
      .nullable()
      .transform((v) => v || null),
    referral_by: optionalText(200),
  })
  .refine((c) => c.first_name || c.last_name || c.email || c.phone, {
    message: "Add at least a name, email or phone.",
    path: ["first_name"],
  });

export type ContactFields = z.infer<typeof contactFieldsSchema>;

export const contactFlagsSchema = z.object({
  email_marketing_consent: checkbox,
  dnd_email: checkbox,
  dnd_sms: checkbox,
  stop_automations: checkbox,
});

export const quickAddExtrasSchema = z.object({
  tags: z
    .string()
    .optional()
    .nullable()
    .transform((v) => parseTags(v ?? "")),
  create_opportunity: checkbox,
  event_date: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a valid event date."),
  event_type: z
    .enum([...EVENT_TYPE_KEYS, ""])
    .optional()
    .nullable()
    .transform((v) => v || null),
  venue: optionalText(200),
});

export const consentSchema = z.object({
  channel: z.enum(["sms", "email"]),
  granted: z.enum(["yes", "no"]).transform((v) => v === "yes"),
  source: z.string().trim().min(1, "Say how consent was given.").max(100),
  text: z.string().trim().min(5, "Paste the exact wording they agreed to.").max(2000),
});

export const noteSchema = z.object({ body: z.string().trim().min(1, "Write something first.").max(5000) });

export type FormState = { ok: boolean; message: string; fieldErrors?: Record<string, string> } | null;

export function formDataObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
