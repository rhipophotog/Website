"use server";

import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import { captureLead } from "@/lib/leads/capture";
import { HONEYPOT_FIELD, inquiryFormObject, inquirySchema, inquiryToLead } from "@/lib/leads/inquiry";
import { clientIp, hashIp } from "@/lib/leads/security";
import { verifyTurnstile } from "@/lib/leads/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";

export type InquiryState = { ok: boolean; message: string; fieldErrors?: Record<string, string> } | null;

const RATE_LIMIT = { max: 5, minutes: 10 };

/** Public: no sign-in. Spam checks run before anything touches the database. */
export async function submitInquiry(_prev: InquiryState, formData: FormData): Promise<InquiryState> {
  // Bots fill the hidden field. Pretend it worked so they don't adapt.
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim()) return { ok: true, message: "Thank you!" };

  const admin = createAdminClient();
  if (!admin) {
    console.error("[inquiry] SUPABASE_SERVICE_ROLE_KEY is not set");
    return { ok: false, message: "Sorry, the form isn't available right now. Please email us instead." };
  }

  const env = serverEnv();
  const ip = clientIp(await headers());
  const ipHash = hashIp(ip, env.LEAD_IP_SALT);

  if (ipHash) {
    const { data: recent } = await admin.rpc("recent_submissions", { p_ip_hash: ipHash, p_minutes: RATE_LIMIT.minutes });
    if (typeof recent === "number" && recent >= RATE_LIMIT.max) {
      return { ok: false, message: "We've received several inquiries from you already. Please try again a little later." };
    }
  }

  const human = await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""), env.TURNSTILE_SECRET_KEY, ip);
  if (!human) return { ok: false, message: "Please complete the quick security check and send again." };

  const parsed = inquirySchema.safeParse(inquiryFormObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
  }

  const { data: form } = await admin.from("forms").select("sms_consent_text, enabled").eq("key", "inquiry").single();
  if (!form?.enabled) return { ok: false, message: "Sorry, we're not taking inquiries through this form right now." };

  try {
    await captureLead(admin, inquiryToLead(parsed.data, form.sms_consent_text, ipHash));
  } catch (error) {
    // No names, emails or phone numbers in logs (CLAUDE.md).
    console.error("[inquiry] capture failed", error instanceof Error ? error.message : error);
    return { ok: false, message: "Sorry, something went wrong sending your inquiry. Please try again." };
  }

  return { ok: true, message: "Thank you!" };
}
