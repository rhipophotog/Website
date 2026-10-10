import type { EmailProvider, OutboundEmail } from "../types";

/**
 * Resend over plain HTTPS (no SDK). Only reachable through emailProviderFor("production").
 * The idempotency key makes a retried send a no-op on Resend's side for 24h.
 */
export function resendProvider(apiKey: string, defaultFrom: string, fetchImpl: typeof fetch = fetch): EmailProvider {
  return {
    mode: "live",
    async send(message: OutboundEmail) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify({
          from: message.from ?? defaultFrom,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          reply_to: message.replyTo ? [message.replyTo] : undefined,
          headers: message.headers,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok || !data.id) {
        throw new Error(`Resend ${res.status}: ${data.name ?? ""} ${data.message ?? ""}`.trim());
      }
      return { status: "sent", providerId: data.id };
    },
  };
}

/** Fetch an inbound email's content (webhooks only carry metadata). */
export async function fetchReceivedEmail(apiKey: string, emailId: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend receiving ${res.status}`);
  return (await res.json()) as {
    id: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    text?: string | null;
    html?: string | null;
    message_id?: string;
    headers?: Record<string, string> | { name: string; value: string }[];
  };
}
