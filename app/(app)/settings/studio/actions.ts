"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "@/lib/contacts/schema";
import { createClient } from "@/lib/supabase/server";

const url = z
  .string()
  .trim()
  .max(500)
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/\S+$/.test(v), "Links must start with https://");

const schema = z.object({
  owner_name: z.string().trim().min(1, "Add the name you sign emails with.").max(80),
  booking_link: url,
  portfolio_link: url,
  review_link: url,
  autoreply_enabled: z.string().optional().transform((v) => v === "on"),
  automations_paused: z.string().optional().transform((v) => v === "on"),
});

export async function saveStudioSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (user?.role !== "owner") return { ok: false, message: "Only the owner can change settings." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("studio_settings").update(parsed.data).eq("id", true);
  if (error) return { ok: false, message: "Couldn't save." };
  await supabase.from("audit_log").insert({
    action: "settings.updated",
    entity: "studio_settings",
    data: { autoreply_enabled: parsed.data.autoreply_enabled, automations_paused: parsed.data.automations_paused },
  });
  revalidatePath("/settings/studio");
  return { ok: true, message: "Saved." };
}
