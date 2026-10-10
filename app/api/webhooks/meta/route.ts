import { serverEnv } from "@/lib/env";
import { leadgenIds, metaLeadSchema, metaLeadToAdLead, metaWebhookSchema } from "@/lib/leads/ad-leads";
import { captureLead } from "@/lib/leads/capture";
import { safeEqual, verifyMetaSignature } from "@/lib/leads/security";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Meta Lead Ads webhook (SPEC §5.2).
 * GET: Meta's subscription check (hub.verify_token). POST: signed leadgen notifications;
 * we fetch each lead from the Graph API and capture it. Retries are harmless (dedupe on leadgen id).
 */

export async function GET(request: Request) {
  const env = serverEnv();
  const url = new URL(request.url);
  if (!env.META_VERIFY_TOKEN) return new Response("Not configured", { status: 503 });
  const token = url.searchParams.get("hub.verify_token") ?? "";
  if (url.searchParams.get("hub.mode") === "subscribe" && safeEqual(token, env.META_VERIFY_TOKEN)) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.META_APP_SECRET || !env.META_PAGE_ACCESS_TOKEN) return new Response("Not configured", { status: 503 });

  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET)) {
    return new Response("Bad signature", { status: 401 });
  }

  let ids: string[];
  try {
    ids = leadgenIds(metaWebhookSchema.parse(JSON.parse(raw)));
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  if (ids.length === 0) return Response.json({ ok: true, leads: 0 });

  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });

  let failed = 0;
  for (const id of ids) {
    try {
      const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${encodeURIComponent(id)}`);
      url.searchParams.set("fields", "id,field_data,campaign_name,ad_name,form_id,created_time");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.META_PAGE_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Graph API ${res.status}`);
      const lead = metaLeadToAdLead(metaLeadSchema.parse(await res.json()));
      if (!lead.email && !lead.phone) throw new Error("lead has no email or phone");
      await captureLead(admin, lead);
    } catch (error) {
      failed++;
      console.error("[meta webhook] lead failed", id, error instanceof Error ? error.message : error);
    }
  }
  // A 5xx makes Meta retry later; already-captured leads are skipped on retry.
  return failed ? new Response("Some leads failed", { status: 502 }) : Response.json({ ok: true, leads: ids.length });
}
