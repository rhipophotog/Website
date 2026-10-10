"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string; verifying?: boolean; codeError?: string }
  | { kind: "error"; message: string };

export function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const router = useRouter();

  const callbackUrl = () => {
    const url = new URL("/auth/callback", window.location.origin);
    if (next !== "/") url.searchParams.set("next", next);
    return url.toString();
  };

  async function sendMagicLink(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) return;
    setStatus({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
    });
    if (error?.status === 429) {
      setStatus({ kind: "error", message: "Too many attempts. Wait a minute and try again." });
      return;
    }
    // Same message whether or not the email is invited, so the form doesn't reveal who is on the team.
    setStatus({ kind: "sent", email });
  }

  /**
   * The 6-digit code from the same email. Works when an email scanner has already used up the
   * link, and keeps you inside the installed phone app (links open in the browser instead).
   */
  async function verifyCode(formData: FormData) {
    if (status.kind !== "sent") return;
    const token = String(formData.get("code") ?? "").replace(/\D/g, "");
    if (token.length < 6) return;
    setStatus({ ...status, verifying: true, codeError: undefined });
    const { error } = await createClient().auth.verifyOtp({ email: status.email, token, type: "email" });
    if (error) {
      setStatus({ ...status, verifying: false, codeError: "That code is wrong or has expired. Check the newest email." });
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setStatus({ kind: "error", message: "Google sign-in isn't available right now." });
  }

  if (status.kind === "sent") {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-center font-medium">Check your email</p>
        <p className="mt-1 text-center text-sm text-muted">
          If <span className="text-ink">{status.email}</span> is on the studio team, a sign-in email is on its way.
          Tap the link, or enter the code from the email here.
        </p>
        <form action={verifyCode} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Code</span>
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              placeholder="123456"
              className="w-full rounded-lg border border-line bg-paper px-3 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={status.verifying}
            className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {status.verifying ? "Checking…" : "Sign in with code"}
          </button>
          {status.codeError && (
            <p role="alert" className="text-sm text-danger">
              {status.codeError}
            </p>
          )}
        </form>
        <p className="mt-4 text-center text-xs text-muted">Only the newest email works. Each new request cancels the previous one.</p>
        <button className="mt-3 w-full text-sm text-accent underline" onClick={() => setStatus({ kind: "idle" })}>
          Use a different email or send again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={sendMagicLink} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@rhipophotography.com"
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={status.kind === "sending"}
          className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>

      {status.kind === "error" && (
        <p role="alert" className="text-sm text-danger">
          {status.message}
        </p>
      )}

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 font-medium"
          >
            Continue with Google
          </button>
        </>
      )}
    </div>
  );
}
