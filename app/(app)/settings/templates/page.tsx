import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Settings are owner-only.</Notice>;
  const supabase = await createClient();
  const { data: templates } = await supabase.from("templates").select("key, name, channel, category, subject, body").order("channel").order("name");

  const groups = [
    { channel: "email", title: "Email" },
    { channel: "sms", title: "SMS (sent from milestone 6)" },
  ];
  return (
    <>
      <PageHeader title="Templates" description="Reusable messages with merge fields like {{first_name}}." />
      <div className="max-w-3xl space-y-6">
        {groups.map((g) => (
          <section key={g.channel}>
            <h2 className="mb-2 font-semibold">{g.title}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {(templates ?? [])
                .filter((t) => t.channel === g.channel)
                .map((t) => (
                  <li key={t.key}>
                    <Link href={`/settings/templates/${t.key}`} className="block px-4 py-3 hover:bg-paper">
                      <span className="flex items-center gap-2 font-medium">
                        {t.name} {t.category === "marketing" && <Pill>marketing</Pill>}
                      </span>
                      <span className="block truncate text-sm text-muted">{t.subject ?? t.body}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <p className="text-sm">
          <Link href="/settings/studio" className="text-muted underline">
            ← Studio &amp; email
          </Link>
        </p>
      </div>
    </>
  );
}
