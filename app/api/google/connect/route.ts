import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { authUrl } from "@/lib/calendar/google";
import { googleCreds, oauthState } from "@/lib/calendar/server";

/** Owner only: start connecting Google Calendar. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (user.role !== "owner") return new Response("Only the owner can connect Google Calendar", { status: 403 });
  const creds = googleCreds();
  if (!creds) return NextResponse.redirect(new URL("/settings/calendar?google=not_configured", request.url));
  return NextResponse.redirect(authUrl(creds, oauthState(user.id)));
}
