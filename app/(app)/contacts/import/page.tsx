import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/time";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import contacts" };

export default async function ImportPage() {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Only the owner can import contacts.</Notice>;

  const supabase = await createClient();
  const [{ data: stages }, { data: imports }] = await Promise.all([
    supabase.from("stages").select("key, name, pipelines!inner(is_default)").eq("pipelines.is_default", true).order("position"),
    supabase.from("imports").select("id, filename, status, created_count, updated_count, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <>
      <PageHeader title="Import contacts" description="Bring contacts over from GoHighLevel, or any CSV file." />
      <ImportWizard stages={(stages ?? []).map((s) => ({ key: s.key as string, name: s.name as string }))} />

      {(imports?.length ?? 0) > 0 && (
        <section className="mt-10 max-w-4xl">
          <h2 className="mb-2 font-semibold">Past imports</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {imports!.map((imp) => (
              <li key={imp.id}>
                <Link href={`/contacts/imports/${imp.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-paper">
                  <span className="truncate">{imp.filename}</span>
                  <span className="flex shrink-0 items-center gap-2 text-muted">
                    {imp.created_count} new · {imp.updated_count} updated · {formatInTimeZone(imp.created_at, user.timeZone, { dateStyle: "medium" })}
                    {imp.status !== "completed" && <Pill tone="danger">{imp.status}</Pill>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
