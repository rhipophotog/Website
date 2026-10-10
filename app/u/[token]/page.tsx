import type { Metadata } from "next";
import { serverEnv } from "@/lib/env";
import { unsubscribeSecret, verifyUnsubscribeToken } from "@/lib/messaging/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** Public. Shows a confirm button (mail scanners follow links, so a GET must not unsubscribe). */
export default async function UnsubscribePage({ params }: PageProps<"/u/[token]">) {
  const { token } = await params;
  const valid = Boolean(createAdminClient() && verifyUnsubscribeToken(token, unsubscribeSecret(serverEnv())));
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="text-2xl font-extrabold">Email preferences</h1>
        {valid ? (
          <UnsubscribeButton token={token} />
        ) : (
          <p className="mt-3 text-muted">This link isn&apos;t valid. Reply to any of our emails and we&apos;ll take you off the list.</p>
        )}
      </div>
    </main>
  );
}
