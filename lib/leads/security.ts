import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** sha256(salt:ip). We keep this for rate limiting and never store the IP itself. */
export function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** First address in x-forwarded-for (set by Vercel), else x-real-ip. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Meta signs webhook bodies: X-Hub-Signature-256: sha256=<hex hmac of the raw body with the app secret>. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.slice("sha256=".length), expected);
}
