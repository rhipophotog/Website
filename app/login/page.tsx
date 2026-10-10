import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one, then tap the link in the newest email only, or type in its code.",
  not_member: "This account isn't on the studio team. Ask the owner for an invite.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  const user = await getCurrentUser();
  if (user) redirect(next);

  // Signed in with Supabase but no studio profile (removed from the team): end that session.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const orphanSession = Boolean(data?.claims?.sub);

  const errorKey = orphanSession ? "not_member" : typeof params.error === "string" ? params.error : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-ink font-serif text-2xl font-bold text-accent">
            R
          </div>
          <h1 className="text-xl font-semibold">RHIPO Studio</h1>
          <p className="mt-1 text-sm text-muted">Sign in to the studio CRM</p>
        </div>

        {errorKey && ERRORS[errorKey] && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {ERRORS[errorKey]}
          </p>
        )}

        {orphanSession ? (
          <form action="/auth/signout" method="post">
            <button className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium">
              Sign out
            </button>
          </form>
        ) : (
          <LoginForm next={next} googleEnabled={publicEnv().NEXT_PUBLIC_GOOGLE_AUTH_ENABLED} />
        )}
      </div>
    </main>
  );
}
