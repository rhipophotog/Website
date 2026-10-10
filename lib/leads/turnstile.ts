/** Cloudflare Turnstile server-side check (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | null | undefined,
  secret: string,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
