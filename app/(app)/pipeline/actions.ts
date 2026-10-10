"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { defaultPipelineId } from "@/lib/contacts/queries";
import type { FormState } from "@/lib/contacts/schema";
import { zodFieldErrors } from "@/lib/contacts/schema";
import { moveSchema, opportunityFormObject, opportunityFormSchema } from "@/lib/pipeline/schema";
import { createClient } from "@/lib/supabase/server";

async function member() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { user, supabase: await createClient() };
}

export type MoveResult = { ok: true } | { ok: false; error: string };

/** Move a card. Status (open/won/lost) follows the stage in the database. */
export async function moveOpportunity(input: { id: string; stage_key: string; lost_reason?: string | null }): Promise<MoveResult> {
  const { supabase } = await member();
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid move." };

  const { data, error } = await supabase
    .from("opportunities")
    .update({ stage_key: parsed.data.stage_key, lost_reason: parsed.data.lost_reason ?? null })
    .eq("id", parsed.data.id)
    .select("id, contact_id");
  if (error || !data?.length) return { ok: false, error: "Couldn't move it. Refresh and try again." };

  revalidatePath("/pipeline");
  revalidatePath(`/contacts/${data[0].contact_id}`);
  return { ok: true };
}

export async function createOpportunity(contactId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await member();
  const id = z.uuid().parse(contactId);
  const parsed = opportunityFormSchema.safeParse(opportunityFormObject(formData));
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };

  const { data, error } = await supabase
    .from("opportunities")
    .insert({ ...parsed.data, contact_id: id, pipeline_id: await defaultPipelineId(supabase) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Couldn't add it to the pipeline." };

  revalidatePath("/pipeline");
  revalidatePath(`/contacts/${id}`);
  redirect(`/pipeline/${data.id}?notice=created`);
}

export async function updateOpportunity(opportunityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await member();
  const id = z.uuid().parse(opportunityId);
  const parsed = opportunityFormSchema.safeParse(opportunityFormObject(formData));
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };

  const { data, error } = await supabase.from("opportunities").update(parsed.data).eq("id", id).select("contact_id");
  if (error || !data?.length) return { ok: false, message: "Couldn't save changes." };

  revalidatePath("/pipeline");
  revalidatePath(`/contacts/${data[0].contact_id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteOpportunity(opportunityId: string): Promise<void> {
  const { supabase, user } = await member();
  if (user.role !== "owner") return;
  const id = z.uuid().parse(opportunityId);
  const { data } = await supabase.from("opportunities").delete().eq("id", id).select("contact_id");
  revalidatePath("/pipeline");
  if (data?.[0]) redirect(`/contacts/${data[0].contact_id}`);
  redirect("/pipeline");
}
