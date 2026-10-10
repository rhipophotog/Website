"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "@/lib/contacts/schema";
import { unknownFields } from "@/lib/messaging/render";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1, "The message can't be empty.").max(20_000),
  category: z.enum(["transactional", "marketing"]),
});

export async function saveTemplate(key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (user?.role !== "owner") return { ok: false, message: "Only the owner can edit templates." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the template." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("templates").select("channel").eq("key", key).single();
  if (!existing) return { ok: false, message: "Template not found." };
  if (existing.channel === "email" && !parsed.data.subject) return { ok: false, message: "Emails need a subject." };

  const unknown = unknownFields(`${parsed.data.subject ?? ""} ${parsed.data.body}`);
  if (unknown.length) return { ok: false, message: `Unknown merge field: {{${unknown[0]}}}. Use one from the list.` };

  const { error } = await supabase
    .from("templates")
    .update({ ...parsed.data, subject: existing.channel === "email" ? parsed.data.subject : null })
    .eq("key", key);
  if (error) return { ok: false, message: "Couldn't save." };
  revalidatePath("/settings/templates");
  return { ok: true, message: "Saved." };
}
