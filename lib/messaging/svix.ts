import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/leads/security";

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw body>",
 * keyed with the base64 part of the "whsec_..." secret. The header may hold several "v1,<sig>".
 */
export function verifySvix(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
  toleranceSeconds = 5 * 60,
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSeconds) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest("base64");
  return headers.signature
    .split(" ")
    .map((part) => part.split(","))
    .some(([version, sig]) => version === "v1" && Boolean(sig) && safeEqual(sig, expected));
}
