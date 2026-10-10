import { z } from "zod";
import { toE164 } from "@/lib/contacts/phone";

/** Guest details on the public booking page. */
export const bookingSchema = z
  .object({
    starts_at: z.iso.datetime({ offset: true }),
    guest_time_zone: z.string().max(60).optional().nullable().transform((v) => v || null),
    first_name: z.string().trim().min(1, "Please add your first name.").max(100),
    last_name: z.string().trim().max(100).optional().nullable().transform((v) => v || null),
    partner_name: z.string().trim().max(100).optional().nullable().transform((v) => v || null),
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
          ctx.addIssue({ code: "custom", message: "Please enter a valid phone number." });
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
    notes: z.string().trim().max(2000).optional().nullable().transform((v) => v || null),
    sms_consent: z.union([z.literal("on"), z.literal(""), z.null()]).optional().transform((v) => v === "on"),
  })
  .refine((v) => !v.sms_consent || v.phone, { message: "Add a phone number so we can text you.", path: ["phone"] });

export type BookingInput = z.infer<typeof bookingSchema>;
