import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/** Magic-link and Google sign-in land here with a PKCE code to exchange for a session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
