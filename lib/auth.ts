import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "team";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  timeZone: string;
};

/**
 * The signed-in studio member, or null. Verifies the session with Supabase
 * (never trusts the cookie alone) and loads the profile row under RLS.
 * Cached per request so layouts and pages can both call it.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, role, time_zone")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as Role,
    timeZone: profile.time_zone,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function isOwner(user: Pick<CurrentUser, "role"> | null): boolean {
  return user?.role === "owner";
}
