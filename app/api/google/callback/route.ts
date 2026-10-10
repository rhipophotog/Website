import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exchangeCode } from "@/lib/calendar/google";
import { encryptToken, googleCreds, verifyOauthState } from "@/lib/calendar/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Google sends the owner back here. Tokens are encrypted and stored with the service role only. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (result: string) => NextResponse.redirect(new URL(`/settings/calendar?google=${result}`, request.url));

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (user.role !== "owner") return back("forbidden");
  if (url.searchParams.get("error")) return back("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const creds = googleCreds();
  const admin = createAdminClient();
  if (!code || !creds || !admin || !verifyOauthState(state, user.id)) return back("failed");

  try {
    const tokens = await exchangeCode(creds, code);
    const { error } = await admin.from("google_calendar_connection").upsert({
      id: true,
      account_email: tokens.email,
      calendar_id: "primary",
      refresh_token_enc: encryptToken(tokens.refreshToken),
      access_token_enc: encryptToken(tokens.accessToken),
      access_token_expires_at: tokens.expiresAt.toISOString(),
      connected_by: user.id,
      connected_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await admin.from("audit_log").insert({ action: "google_calendar.connected", entity: "google_calendar_connection", actor_id: user.id, data: { account: tokens.email } });
  } catch (error) {
    console.error("[google] connect failed", error instanceof Error ? error.message : error);
    return back("failed");
  }
  return back("connected");
}
