import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { notifyOwner } from "@/lib/messaging/email";
import { getReceivedEmail } from "@/lib/messaging/inbound";
import { htmlToText, parseAddress, stripQuotedReply } from "@/lib/messaging/render";
import { verifySvix } from "@/lib/messaging/svix";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resend webhook (SPEC §6): inbound replies (email.received) are threaded onto the contact,
 * and delivery events update the message status. Every request must carry a valid Svix signature.
 */

const eventSchema = z.object({
  type: z.string(),
  data: z
    .object({
      email_id: z.string().optional(),
      from: z.string().optional(),
      to: z.union([z.array(z.string()), z.string()]).optional(),
      subject: z.string().optional(),
      message_id: z.string().optional(),
      bounce: z.object({ message: z.string().optional() }).passthrough().optional(),
    })
    .passthrough(),
});

const STATUS_FOR: Record<string, "delivered" | "bounced" | "complained" | "failed"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.RESEND_WEBHOOK_SECRET) return new Response("Not configured", { status: 503 });

  const raw = await request.text();
  const valid = verifySvix(
    raw,
    { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    env.RESEND_WEBHOOK_SECRET,
  );
  if (!valid) return new Response("Bad signature", { status: 401 });

  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(raw));
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });

  const status = STATUS_FOR[event.type];
  if (status && event.data.email_id) {
    const { error } = await admin.rpc("record_email_event", {
      p_provider_id: event.data.email_id,
      p_status: status,
      p_error: event.data.bounce?.message ?? null,
    });
    if (error) return new Response("Failed", { status: 500 });
    return Response.json({ ok: true });
  }

  if (event.type === "email.received" && event.data.email_id) {
    if (!env.RESEND_API_KEY) return new Response("Not configured", { status: 503 });
    try {
      const email = await getReceivedEmail(env.RESEND_API_KEY, event.data.email_id);
      const from = parseAddress(email.from ?? event.data.from);
      const text = email.text?.trim() || (email.html ? htmlToText(email.html) : "");
      const headerList = Array.isArray(email.headers)
        ? Object.fromEntries(email.headers.map((h) => [h.name.toLowerCase(), h.value]))
        : Object.fromEntries(Object.entries(email.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      const to = Array.isArray(email.to) ? email.to[0] : email.to;

      const { data, error } = await admin.rpc("record_inbound_email", {
        p: {
          provider_id: event.data.email_id,
          from_address: from.address,
          from_name: from.name,
          to_address: to ?? null,
          subject: email.subject ?? event.data.subject ?? null,
          body: stripQuotedReply(text).slice(0, 20_000),
          rfc_message_id: email.message_id ?? event.data.message_id ?? null,
          in_reply_to: headerList["in-reply-to"] ?? null,
        },
      });
      if (error) throw new Error(error.message);

      const result = data as { duplicate_delivery: boolean; created_contact?: boolean };
      if (!result.duplicate_delivery) {
        await notifyOwner(
          `Reply from ${from.name ?? from.address}: ${email.subject ?? "(no subject)"}`,
          `${stripQuotedReply(text).slice(0, 4000)}\n\n—\nReply from RHIPO Studio so it stays in their thread.`,
          `owner-reply:${event.data.email_id}`,
        );
      }
      return Response.json({ ok: true });
    } catch (error) {
      console.error("[resend webhook] inbound failed", error instanceof Error ? error.message : error);
      return new Response("Failed", { status: 500 });
    }
  }

  return Response.json({ ok: true, ignored: event.type });
}
