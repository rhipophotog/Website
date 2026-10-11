import { decrypt, encrypt } from "./crypto";
import type { Busy } from "./slots";

/**
 * Google Calendar over its REST API (no SDK): OAuth, free/busy and events.
 * Scopes: create/update our events, and read free/busy (not event details).
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export type GoogleCreds = { clientId: string; clientSecret: string; redirectUri: string };

export function authUrl(creds: GoogleCreds, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; scope?: string };

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenResponse> {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(`Google token ${res.status}: ${data.error ?? ""} ${data.error_description ?? ""}`.trim());
  return data;
}

export async function exchangeCode(creds: GoogleCreds, code: string, fetchImpl: typeof fetch = fetch) {
  const t = await tokenRequest(
    { code, client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: creds.redirectUri, grant_type: "authorization_code" },
    fetchImpl,
  );
  if (!t.refresh_token) throw new Error("Google didn't return a refresh token. Remove the app's access in your Google account and connect again.");
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), email: emailFromIdToken(t.id_token) };
}

/** Revoke our access at Google (used on disconnect). Best effort: a token that's already invalid is fine. */
export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  });
}

/** The id_token comes straight from Google's token endpoint over TLS, so reading its payload is enough here. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export type StoredConnection = {
  calendar_id: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
};

/**
 * A small client bound to the stored connection. Refreshes the access token when needed
 * and reports new tokens through `onRefresh` so the caller can persist them.
 */
export function googleCalendar(
  conn: StoredConnection,
  opts: { creds: GoogleCreds; secret: string; onRefresh?: (accessTokenEnc: string, expiresAt: Date) => Promise<void>; fetchImpl?: typeof fetch },
) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let accessToken = conn.access_token_enc ? decrypt(conn.access_token_enc, opts.secret) : null;
  let expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : new Date(0);

  async function token(): Promise<string> {
    if (accessToken && expiresAt.getTime() > Date.now() + 30_000) return accessToken;
    const t = await tokenRequest(
      {
        client_id: opts.creds.clientId,
        client_secret: opts.creds.clientSecret,
        refresh_token: decrypt(conn.refresh_token_enc, opts.secret),
        grant_type: "refresh_token",
      },
      fetchImpl,
    );
    accessToken = t.access_token;
    expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000);
    await opts.onRefresh?.(encrypt(accessToken, opts.secret), expiresAt);
    return accessToken;
  }

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204 || res.status === 410) return undefined as T; // deleted / already gone
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${data.error?.message ?? ""}`.trim());
    return data;
  }

  const calendar = encodeURIComponent(conn.calendar_id);
  return {
    async busy(from: Date, to: Date): Promise<Busy[]> {
      const data = await api<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>("/freeBusy", {
        method: "POST",
        body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: conn.calendar_id }] }),
      });
      return (data.calendars?.[conn.calendar_id]?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
    },
    async createEvent(e: { summary: string; description: string; start: Date; end: Date; location?: string | null }) {
      const data = await api<{ id: string }>(`/calendars/${calendar}/events`, {
        method: "POST",
        body: JSON.stringify({
          summary: e.summary,
          description: e.description,
          location: e.location ?? undefined,
          start: { dateTime: e.start.toISOString() },
          end: { dateTime: e.end.toISOString() },
          // No attendees: the guest gets our own confirmation + .ics, not a second invite from Google.
          reminders: { useDefault: true },
        }),
      });
      return data.id;
    },
    async moveEvent(id: string, start: Date, end: Date) {
      await api(`/calendars/${calendar}/events/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }),
      });
    },
    async deleteEvent(id: string) {
      await api(`/calendars/${calendar}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}
