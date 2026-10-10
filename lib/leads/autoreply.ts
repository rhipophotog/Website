import { APP_NAME } from "@/lib/brand";
import { emailContact, notifyOwner } from "@/lib/messaging/email";
import { buildMergeContext } from "@/lib/messaging/render";
import type { AdminClient } from "@/lib/supabase/admin";
import type { CaptureResult } from "./capture";

/**
 * WORKFLOWS W1 step 1: email the inquiry auto-reply within a minute of a lead arriving,
 * and tell the owner. Milestone 8 moves this into the workflow engine.
 * Runs after the response is sent (next/server `after`), so a slow provider never delays the form.
 */
export async function afterLeadCaptured(admin: AdminClient, result: CaptureResult, sourceLabel: string): Promise<void> {
  if (result.duplicate_delivery) return;

  const [{ data: settings }, { data: contact }, { data: opportunity }, { data: template }] = await Promise.all([
    admin.from("studio_settings").select("*").single(),
    admin.from("contacts").select("id, first_name, last_name, partner_name, email, dnd_email, email_marketing_consent, stop_automations").eq("id", result.contact_id).single(),
    admin.from("opportunities").select("event_dates, venue, city").eq("id", result.opportunity_id).maybeSingle(),
    admin.from("templates").select("subject, body, category").eq("key", "inquiry_autoreply").maybeSingle(),
  ]);
  if (!contact) return;

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Someone";
  await notifyOwner(
    `New inquiry: ${name} (${sourceLabel})`,
    `${name} just sent an inquiry via ${sourceLabel}.\n\nOpen it in ${APP_NAME} to see the details.`,
    `owner-lead:${result.submission_id}`,
  );

  const allowed = settings?.autoreply_enabled && !settings.automations_paused && !contact.stop_automations;
  if (!allowed || !template?.subject) return;

  const outcome = await emailContact(admin, {
    contact,
    subject: template.subject,
    body: template.body,
    category: template.category,
    templateKey: "inquiry_autoreply",
    context: buildMergeContext({ contact, opportunity, settings: settings ?? {} }),
    idempotencyKey: `autoreply:${result.submission_id}`,
  });
  if (outcome.status === "failed") console.error("[autoreply] failed", outcome.error);
}
