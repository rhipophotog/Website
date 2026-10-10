import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/time";
import { UndoImportButton } from "./undo-button";

export const metadata: Metadata = { title: "Import" };

export default async function ImportRecordPage({ params }: PageProps<"/contacts/imports/[id]">) {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Only the owner can see imports.</Notice>;
  const { id } = await params;
  const supabase = await createClient();
  const { data: imp } = await supabase.from("imports").select("*").eq("id", id).maybeSingle();
  if (!imp) notFound();
  const { count: stillThere } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("import_id", id);
  const issues = (imp.errors as { row: number; message: string }[]) ?? [];

  return (
    <>
      <PageHeader title={imp.filename} description={`Imported ${formatInTimeZone(imp.created_at, user.timeZone)}`} />
      <div className="max-w-3xl space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Pill tone={imp.status === "completed" ? "accent" : "danger"}>{imp.status}</Pill>
            <span>{imp.total_rows} rows</span>
            <span>{imp.created_count} created</span>
            <span>{imp.updated_count} updated</span>
            <span>{imp.skipped_count} skipped</span>
            <Link href={`/contacts`} className="ml-auto text-accent underline">
              View contacts
            </Link>
          </div>
        </Card>

        {issues.length > 0 && (
          <Card title={`Issues (${issues.length})`}>
            <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {issues.map((issue, i) => (
                <li key={i}>
                  <span className="text-muted">Row {issue.row}:</span> {issue.message}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {imp.status !== "undone" && (stillThere ?? 0) > 0 && (
          <Card title="Undo this import" className="border-danger/30">
            <p className="mb-3 text-sm text-muted">
              Permanently deletes the {stillThere} contacts this import created, including any notes or pipeline entries
              added to them since. Contacts that already existed and were only updated are left alone.
            </p>
            <UndoImportButton importId={imp.id} count={stillThere ?? 0} />
          </Card>
        )}
      </div>
    </>
  );
}
