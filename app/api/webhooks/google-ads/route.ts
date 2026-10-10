import { after } from "next/server";
import { serverEnv } from "@/lib/env";
import { googleLeadSchema, googleLeadToAdLead } from "@/lib/leads/ad-leads";
import { afterLeadCaptured } from "@/lib/leads/autoreply";
import { captureLead } from "@/lib/leads/capture";
import { safeEqual } from "@/lib/leads/security";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Google Ads lead form webhook (SPEC §5.3). Google sends the lead as JSON with the shared
 * "key" you set in Google Ads (google_key); we reject anything without it.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.GOOGLE_ADS_WEBHOOK_KEY) return new Response("Not configured", { status: 503 });

  let payload: ReturnType<typeof googleLeadSchema.parse>;
  try {
    payload = googleLeadSchema.parse(await request.json());
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  if (!payload.google_key || !safeEqual(payload.google_key, env.GOOGLE_ADS_WEBHOOK_KEY)) {
    return new Response("Bad key", { status: 401 });
  }

  const lead = googleLeadToAdLead(payload);
  if (!lead.email && !lead.phone) return Response.json({ ok: true, skipped: "no email or phone" });

  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });
  try {
    const result = await captureLead(admin, lead);
    after(() => afterLeadCaptured(admin, result, "Google Ads lead form"));
  } catch (error) {
    console.error("[google webhook] lead failed", error instanceof Error ? error.message : error);
    return new Response("Failed", { status: 500 });
  }
  return Response.json({ ok: true });
}
