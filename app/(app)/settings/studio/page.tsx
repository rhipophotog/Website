import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { appUrl, serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { StudioSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Studio & email" };

export default async function StudioSettingsPage() {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Settings are owner-only.</Notice>;
  const env = serverEnv();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("studio_settings").select("*").maybeSingle();

  const live = env.APP_ENV === "production" && Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  const rows: [string, boolean, string][] = [
    ["Sending mode", live, live ? "Live: emails really send" : `Test mode (APP_ENV=${env.APP_ENV}${env.RESEND_API_KEY ? "" : ", no RESEND_API_KEY"}): emails are saved, not sent`],
    ["From address", Boolean(env.EMAIL_FROM), env.EMAIL_FROM ?? "Set EMAIL_FROM"],
    ["Replies go to", Boolean(env.EMAIL_REPLY_TO ?? env.OWNER_NOTIFY_EMAIL), env.EMAIL_REPLY_TO ?? env.OWNER_NOTIFY_EMAIL ?? "Set EMAIL_REPLY_TO"],
    ["Copies of replies & new-lead alerts", Boolean(env.OWNER_NOTIFY_EMAIL), env.OWNER_NOTIFY_EMAIL ?? "Set OWNER_NOTIFY_EMAIL"],
    ["Delivery + reply webhook", Boolean(env.RESEND_WEBHOOK_SECRET), `${appUrl(env)}/api/webhooks/resend`],
  ];

  return (
    <>
      <PageHeader title="Studio & email" description="Your details for templates, the automatic reply, and email setup." />
      <div className="max-w-2xl space-y-4">
        {settings ? (
          <Card title="Studio details">
            <StudioSettingsForm settings={settings} />
          </Card>
        ) : (
          <Notice tone="danger">Run the Milestone 5 database update in Supabase first.</Notice>
        )}
        <Card title="Email setup">
          <ul className="divide-y divide-line text-sm">
            {rows.map(([label, ok, detail]) => (
              <li key={label} className="flex items-start justify-between gap-3 py-2">
                <span>
                  {label}
                  <span className="block break-all text-xs text-muted">{detail}</span>
                </span>
                <Pill tone={ok ? "accent" : "danger"}>{ok ? "Ready" : "Not set"}</Pill>
              </li>
            ))}
          </ul>
        </Card>
        <p className="flex gap-4 text-sm">
          <Link href="/settings/templates" className="text-accent underline">
            Edit templates →
          </Link>
          <Link href="/settings" className="text-muted underline">
            ← Settings
          </Link>
        </p>
      </div>
    </>
  );
}
