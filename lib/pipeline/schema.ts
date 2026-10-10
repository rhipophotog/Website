import { z } from "zod";
import { EVENT_TYPE_KEYS, LOST_REASONS, SOURCE_KEYS } from "@/lib/contacts/fields";

export const SERVICES = [
  { key: "photo", label: "Photo" },
  { key: "video", label: "Video" },
  { key: "drone", label: "Drone" },
  { key: "album", label: "Album" },
] as const;

const LOST_REASON_KEYS = LOST_REASONS.map((r) => r.key) as [string, ...string[]];
const stageKey = z.string().regex(/^[a-z][a-z0-9_]*$/).max(40);

const eventDate = z.object({
  name: z.string().trim().max(60).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for each event day."),
});

/** Event days arrive as a JSON string from the form's hidden input. Blank rows are dropped. */
const eventDates = z
  .string()
  .default("[]")
  .transform((raw, ctx) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((d) => d && (d.name?.trim() || d.date)) : [];
    } catch {
      ctx.addIssue({ code: "custom", message: "Couldn't read the event dates." });
      return z.NEVER;
    }
  })
  .pipe(z.array(eventDate).max(10, "Up to 10 event days."))
  .transform((days) =>
    days.map((d, i) => ({ name: d.name || (days.length === 1 ? "Wedding" : `Day ${i + 1}`), date: d.date })).sort((a, b) => a.date.localeCompare(b.date)),
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const opportunityFormSchema = z
  .object({
    stage_key: stageKey,
    lost_reason: z.enum([...LOST_REASON_KEYS, ""]).optional().nullable().transform((v) => v || null),
    couple_names: optionalText(200),
    event_type: z.enum([...EVENT_TYPE_KEYS, ""]).optional().nullable().transform((v) => v || null),
    event_dates: eventDates,
    venue: optionalText(200),
    city: optionalText(100),
    services: z.array(z.enum(["photo", "video", "drone", "album"])).default([]),
    value: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v) return null;
        const n = Number(v.replace(/[$,\s]/g, ""));
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
          ctx.addIssue({ code: "custom", message: "Enter an amount like 12000." });
          return z.NEVER;
        }
        return Math.round(n * 100);
      }),
    source: z.enum([...SOURCE_KEYS, ""]).optional().nullable().transform((v) => v || null),
    assigned_to: z.union([z.uuid(), z.literal("")]).optional().nullable().transform((v) => v || null),
    notes: optionalText(5000),
  })
  .refine((o) => o.stage_key !== "lost" || o.lost_reason, { message: "Pick why it was lost.", path: ["lost_reason"] })
  .transform(({ value, ...rest }) => ({ ...rest, value_cents: value }));

export type OpportunityInput = z.infer<typeof opportunityFormSchema>;

export const moveSchema = z
  .object({
    id: z.uuid(),
    stage_key: stageKey,
    lost_reason: z.enum(LOST_REASON_KEYS).optional().nullable(),
  })
  .refine((m) => m.stage_key !== "lost" || m.lost_reason, { message: "Pick why it was lost.", path: ["lost_reason"] });

/** FormData → plain object, keeping repeated checkbox values (services) as arrays. */
export function opportunityFormObject(formData: FormData) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key === "services") out.services = [...((out.services as string[] | undefined) ?? []), value];
    else out[key] = value;
  }
  return out;
}
