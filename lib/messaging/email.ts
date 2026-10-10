import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl, serverEnv } from "@/lib/env";
import { redactEmail } from "@/lib/redact";
import { render, textToHtml, type MergeContext } from "./render";
import { sendEmail } from "./send";
import { unsubscribeSecret, unsubscribeToken } from "./unsubscribe";

/**
 * The one way the app emails a contact. Checks do-not-email and marketing opt-outs,
 * renders merge fields, adds the unsubscribe footer to marketing email, threads replies,
 * sends (or records, outside production), and writes the message to the contact's thread.
 */

export type ContactForEmail = {
  id: string;
  email: string | null;
  dnd_email: boolean;
  email_marketing_consent: boolean;
};

export type EmailRequest = {
  contact: ContactForEmail;
  subject: string;
  body: string;
  context: MergeContext;
  category?: "transactional" | "marketing";
  templateKey?: string | null;
  /** Stable key for retries (e.g. "autoreply:<submission>", later "run:<id>:<step>"). */
  idempotencyKey?: string;
  inReplyTo?: string | null;
  /** The signed-in sender; null for automatic emails. */
  authorId?: string | null;
  attachments?: { filename: string; content: string; contentType?: string }[];
  /** Plain text appended after the rendered template (e.g. booking details). */
  appendText?: string;
};

export type EmailOutcome =
  | { status: "sent" | "test"; messageId: string }
  | { status: "skipped"; reason: "no_email" | "dnd_email" | "marketing_opt_out" | "duplicate" }
  | { status: "failed"; error: string };

// Any Supabase client: the signed-in user's (RLS) or the service role for automatic emails.
type Db = SupabaseClient;

export async function emailContact(db: Db, req: EmailRequest): Promise<EmailOutcome> {
  const { contact } = req;
  const category = req.category ?? "transactional";
  if (!contact.email) return { status: "skipped", reason: "no_email" };
  if (contact.dnd_email) return { status: "skipped", reason: "dnd_email" };
  if (category === "marketing" && !contact.email_marketing_consent) return { status: "skipped", reason: "marketing_opt_out" };

  const env = serverEnv();
  const idempotencyKey = req.idempotencyKey ?? `manual:${randomUUID()}`;

  if (req.idempotencyKey) {
    const { data: existing } = await db.from("messages").select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) return { status: "skipped", reason: "duplicate" };
  }

  const subject = render(req.subject, req.context).slice(0, 300);
  const text = render(req.body, req.context) + (req.appendText ? `\n\n${req.appendText.trim()}` : "");
  const headers: Record<string, string> = {};
  let footerText = "";
  let footerHtml = "";
  if (category === "marketing") {
    const url = `${appUrl(env)}/u/${unsubscribeToken(contact.id, unsubscribeSecret(env))}`;
    footerText = `\n\n—\nDon't want these emails? Unsubscribe: ${url}`;
    footerHtml = `<p style="margin:24px 0 0;font-size:12px;color:#6b645a">Don't want these emails? <a href="${url}" style="color:#6b645a">Unsubscribe</a></p>`;
    headers["List-Unsubscribe"] = `<${url}>`;
  }
  if (req.inReplyTo) {
    headers["In-Reply-To"] = req.inReplyTo;
    headers["References"] = req.inReplyTo;
  }

  let result;
  try {
    result = await sendEmail({
      to: contact.email,
      subject,
      text: text + footerText,
      html: textToHtml(text, footerHtml),
      replyTo: env.EMAIL_REPLY_TO ?? env.OWNER_NOTIFY_EMAIL,
      headers: Object.keys(headers).length ? headers : undefined,
      attachments: req.attachments,
      idempotencyKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] send to ${redactEmail(contact.email)} failed: ${message}`);
    await db.from("messages").insert({
      contact_id: contact.id,
      channel: "email",
      direction: "out",
      subject,
      body: text,
      status: "failed",
      error: message.slice(0, 500),
      to_address: contact.email,
      template_key: req.templateKey ?? null,
      idempotency_key: `${idempotencyKey}:failed:${randomUUID()}`,
      author_id: req.authorId ?? null,
    });
    return { status: "failed", error: message };
  }

  if (result.status === "skipped") return { status: "skipped", reason: "duplicate" };

  const { data: row, error } = await db
    .from("messages")
    .insert({
      contact_id: contact.id,
      channel: "email",
      direction: "out",
      subject,
      body: text,
      status: result.status === "recorded" ? "test" : "sent",
      provider_id: result.providerId,
      from_address: env.EMAIL_FROM ?? null,
      to_address: contact.email,
      in_reply_to: req.inReplyTo ?? null,
      template_key: req.templateKey ?? null,
      idempotency_key: idempotencyKey,
      author_id: req.authorId ?? null,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !row) {
    // Sent, but not recorded: say so loudly rather than pretend.
    console.error(`[email] sent ${result.providerId} but couldn't record it: ${error?.message}`);
    return { status: "failed", error: "Sent, but couldn't save it to the thread." };
  }
  return { status: result.status === "recorded" ? "test" : "sent", messageId: row.id as string };
}

/** Plain notification to the studio owner (new reply, new lead). Not tied to a contact. */
export async function notifyOwner(subject: string, text: string, idempotencyKey: string) {
  const env = serverEnv();
  if (!env.OWNER_NOTIFY_EMAIL) return;
  try {
    await sendEmail({ to: env.OWNER_NOTIFY_EMAIL, subject, text, html: textToHtml(text), idempotencyKey });
  } catch (error) {
    console.error("[email] owner notification failed", error instanceof Error ? error.message : error);
  }
}
