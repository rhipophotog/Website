"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { defaultPipelineId } from "@/lib/contacts/queries";
import type { FormState } from "@/lib/contacts/schema";
import { createClient } from "@/lib/supabase/server";

async function ownerClient() {
  const user = await getCurrentUser();
  if (user?.role !== "owner") throw new Error("Only the owner can change stages.");
  return createClient();
}

const nameSchema = z.string().trim().min(1, "Stage names can't be empty.").max(40);

/** Rename stages. Keys never change, so workflows keep working. */
export async function renameStages(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await ownerClient();
  const pipelineId = await defaultPipelineId(supabase);
  const { data: stages } = await supabase.from("stages").select("id, key, name").eq("pipeline_id", pipelineId);
  for (const stage of stages ?? []) {
    const parsed = nameSchema.safeParse(formData.get(`name_${stage.key}`));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    if (parsed.data !== stage.name) {
      const { error } = await supabase.from("stages").update({ name: parsed.data }).eq("id", stage.id);
      if (error) return { ok: false, message: "Couldn't save stage names." };
    }
  }
  revalidatePath("/settings/pipeline");
  revalidatePath("/pipeline");
  return { ok: true, message: "Saved." };
}

/** Swap a main-flow stage with its neighbour. Lost and Cold stay at the end. */
export async function moveStage(key: string, direction: "up" | "down"): Promise<void> {
  const supabase = await ownerClient();
  const pipelineId = await defaultPipelineId(supabase);
  const { data } = await supabase.from("stages").select("id, key, position, kind").eq("pipeline_id", pipelineId).eq("kind", "open").order("position");
  const list = data ?? [];
  const i = list.findIndex((s) => s.key === key);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  await supabase.from("stages").update({ position: list[j].position }).eq("id", list[i].id);
  await supabase.from("stages").update({ position: list[i].position }).eq("id", list[j].id);
  revalidatePath("/settings/pipeline");
  revalidatePath("/pipeline");
}
