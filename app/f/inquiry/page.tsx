import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { STUDIO_NAME } from "@/lib/brand";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { InquiryForm } from "./inquiry-form";

export const metadata: Metadata = {
  title: "Wedding inquiry",
  description: "Tell us about your wedding. RHIPO Photography & Cinematography",
  robots: { index: true, follow: true },
};

export default async function InquiryPage({ searchParams }: PageProps<"/f/inquiry">) {
  const { embed } = await searchParams;
  const embedded = embed === "1";

  const admin = createAdminClient();
  const { data: form } = admin
    ? await admin.from("forms").select("sms_consent_text, enabled").eq("key", "inquiry").maybeSingle()
    : { data: null };

  return (
    <main className={embedded ? "bg-transparent p-1" : "min-h-dvh px-5 py-10"}>
      <div className="mx-auto w-full max-w-xl">
        {!embedded && (
          <header className="mb-8 text-center">
            <Logo size={48} className="mx-auto mb-4" />
            <h1 className="text-3xl font-extrabold tracking-tight">Tell us about your wedding</h1>
            <p className="mt-2 text-muted">{STUDIO_NAME}. We usually reply within a few hours.</p>
          </header>
        )}
        {form?.enabled ? (
          <InquiryForm consentText={form.sms_consent_text} siteKey={publicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} embedded={embedded} />
        ) : (
          <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">
            This form isn&apos;t available right now. Please reach out on Instagram or by email.
          </p>
        )}
      </div>
    </main>
  );
}
