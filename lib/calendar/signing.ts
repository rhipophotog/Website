import { createHash, createHmac } from "node:crypto";
import { safeEqual } from "@/lib/leads/security";

/** Signed, purpose-bound links ("<id>.<hmac>"), e.g. a guest's manage-booking link. */

export function signId(purpose: string, id: string, secret: string): string {
  return `${id}.${createHmac("sha256", secret).update(`${purpose}:${id}`).digest("base64url")}`;
}

export function verifySignedId(purpose: string, token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return safeEqual(signId(purpose, id, secret), token) ? id : null;
}

/** A per-purpose secret derived from the server's key material when no dedicated one is set. */
export function derivedSecret(purpose: string, material: string): string {
  return createHash("sha256").update(`${purpose}:${material}`).digest("hex");
}
