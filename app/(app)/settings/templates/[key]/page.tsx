import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { buildMergeContext } from "@/lib/messaging/render";
import { withStudioDefaults } from "@/lib/messaging/studio";
import { createClient } from "@/lib/supabase/server";
import { saveTemplate } from "../actions";
import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Edit template" };

export default async function TemplatePage({ params }: PageProps<"/settings/templates/[key]">) {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Settings are owner-only.</Notice>;
  const { key } = await params;
  const supabase = await createClient();
  const [{ data: template }, { data: settings }] = await Promise.all([
    supabase.from("templates").select("key, name, channel, category, subject, body").eq("key", key).maybeSingle(),
    supabase.from("studio_settings").select("*").maybeSingle(),
  ]);
  if (!template) notFound();

  const sample = buildMergeContext({
    contact: { first_name: "Priya", partner_name: "Rohan" },
    opportunity: { event_dates: [{ date: "2027-06-14" }], venue: "Oak Hall, Fresno" },
    settings: withStudioDefaults(settings),
  });

  return (
    <>
      <PageHeader title={template.name} description={`${template.channel === "sms" ? "SMS" : "Email"} template · key: ${template.key}`} />
      <div className="max-w-2xl">
        <TemplateForm template={template} action={saveTemplate.bind(null, template.key)} sample={sample} />
        <p className="mt-6 text-sm">
          <Link href="/settings/templates" className="text-muted underline">
            ← All templates
          </Link>
        </p>
      </div>
    </>
  );
}
