import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { serverEnv, TURNSTILE_TEST_SECRET_KEY } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/time";
import { CopyField } from "./copy-field";

export const metadata: Metadata = { title: "Lead capture" };

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2 text-sm">
      <span>{children}</span>
      <Pill tone={ok ? "accent" : "danger"}>{ok ? "Ready" : "Not set up"}</Pill>
    </li>
  );
}

export default async function LeadSettingsPage() {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Settings are owner-only.</Notice>;

  const env = serverEnv();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const supabase = await createClient();
  const { data: recent } = await supabase
    .from("form_submissions")
    .select("id, source, created_at, contact_id, contacts(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(10);

  const formUrl = `${origin}/f/inquiry`;
  const snippet = `<div id="rhipo-inquiry"></div>\n<script src="${origin}/embed.js" async></script>`;
  const turnstileLive = env.TURNSTILE_SECRET_KEY !== TURNSTILE_TEST_SECRET_KEY;

  return (
    <>
      <PageHeader title="Lead capture" description="Where new inquiries come from." />
      <div className="max-w-3xl space-y-4">
        <Card title="Website inquiry form">
          <div className="space-y-4">
            <CopyField label="Form link (Instagram bio, email signature, QR code…)" value={formUrl} />
            <p className="text-sm">
              <Link href="/f/inquiry" target="_blank" className="text-accent underline">
                Open the form ↗
              </Link>
            </p>
            <CopyField label="Embed on a website (paste where the form should appear)" value={snippet} multiline />
          </div>
        </Card>

        <Card title="Setup status">
          <ul className="divide-y divide-line">
            <Status ok={Boolean(env.SUPABASE_SERVICE_ROLE_KEY)}>
              Form can save leads <span className="block text-xs text-muted">Needs SUPABASE_SERVICE_ROLE_KEY in Vercel</span>
            </Status>
            <Status ok={turnstileLive}>
              Spam protection (Cloudflare Turnstile)
              <span className="block text-xs text-muted">
                {turnstileLive ? "Live keys" : "Using test keys: honeypot and rate limits still apply"}
              </span>
            </Status>
            <Status ok={Boolean(env.META_APP_SECRET && env.META_VERIFY_TOKEN && env.META_PAGE_ACCESS_TOKEN)}>
              Meta Lead Ads <span className="block text-xs text-muted">Webhook: {origin}/api/webhooks/meta</span>
            </Status>
            <Status ok={Boolean(env.GOOGLE_ADS_WEBHOOK_KEY)}>
              Google Ads lead forms <span className="block text-xs text-muted">Webhook: {origin}/api/webhooks/google-ads</span>
            </Status>
          </ul>
        </Card>

        <Card title="Latest leads">
          {(recent ?? []).length === 0 ? (
            <p className="text-sm text-muted">None yet. Send a test inquiry through the form.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {recent!.map((s) => {
                const c = s.contacts as unknown as { first_name: string | null; last_name: string | null } | null;
                return (
                  <li key={s.id} className="flex justify-between gap-3 py-2">
                    <Link href={`/contacts/${s.contact_id}`} className="underline">
                      {[c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Contact"}
                    </Link>
                    <span className="text-muted">
                      {s.source === "website" ? "Website form" : s.source === "meta_ads" ? "Meta" : "Google"} ·{" "}
                      {formatInTimeZone(s.created_at, user.timeZone, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <p className="text-sm">
          <Link href="/settings" className="text-muted underline">
            ← Settings
          </Link>
        </p>
      </div>
    </>
  );
}
