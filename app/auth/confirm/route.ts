import { NextResponse } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

const otpType = z.enum(["magiclink", "email", "invite", "signup", "recovery", "email_change"]);

/** Token-hash links (used by custom Supabase email templates), verified server-side. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = otpType.safeParse(url.searchParams.get("type"));
  const next = safeNextPath(url.searchParams.get("next"));

  if (tokenHash && type.success) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type.data });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
