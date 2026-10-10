"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** SPEC §2: the owner plus up to 2 team members. */
const MAX_TEAM_SIZE = 3;

export type InviteState = { ok: boolean; message: string } | null;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(["team", "owner"]).default("team"),
});

/** Owner-only. RLS enforces it too; this check gives a clear message. */
export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const user = await getCurrentUser();
  if (user?.role !== "owner") return { ok: false, message: "Only the owner can invite people." };

  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") ?? undefined });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid invite." };

  const supabase = await createClient();
  const [members, pending] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("invites").select("id", { count: "exact", head: true }).is("accepted_at", null),
  ]);
  if ((members.count ?? 0) + (pending.count ?? 0) >= MAX_TEAM_SIZE) {
    return { ok: false, message: `The studio is limited to ${MAX_TEAM_SIZE} people (the owner plus 2 team members).` };
  }

  const { error } = await supabase.from("invites").insert({ ...parsed.data, invited_by: user.id });
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "That email already has an invite." : "Couldn't save the invite.",
    };
  }
  await supabase.from("audit_log").insert({ action: "invite.created", entity: "invites", data: { role: parsed.data.role } });

  revalidatePath("/settings");
  return {
    ok: true,
    message: `Invited ${parsed.data.email}. They can now sign in with that email on the login page.`,
  };
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (user?.role !== "owner") return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await createClient();
  await supabase.from("invites").delete().eq("id", id.data).is("accepted_at", null);
  revalidatePath("/settings");
}
