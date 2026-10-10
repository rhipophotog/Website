import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/leads/security";

/** Signed, non-expiring unsubscribe tokens: "<contactId>.<hmac>". */

export function unsubscribeToken(contactId: string, secret: string): string {
  return `${contactId}.${createHmac("sha256", secret).update(`unsubscribe:${contactId}`).digest("base64url")}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const [contactId, sig] = token.split(".");
  if (!contactId || !sig || !/^[0-9a-f-]{36}$/.test(contactId)) return null;
  return safeEqual(unsubscribeToken(contactId, secret), `${contactId}.${sig}`) ? contactId : null;
}

/** The secret, or one derived from the service role key so links still verify without extra setup. */
export function unsubscribeSecret(env: { UNSUBSCRIBE_SECRET?: string; SUPABASE_SERVICE_ROLE_KEY?: string; LEAD_IP_SALT: string }): string {
  if (env.UNSUBSCRIBE_SECRET) return env.UNSUBSCRIBE_SECRET;
  return createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY ?? env.LEAD_IP_SALT).update("rhipo-unsubscribe").digest("hex");
}
