import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatPhone } from "@/lib/contacts/phone";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Duplicates" };

type Brief = { id: string; display_name: string; email: string | null; phone: string | null };

export default async function DuplicatesPage() {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Only the owner can merge contacts.</Notice>;

  const supabase = await createClient();
  const { data: pairs } = await supabase.from("contact_duplicates").select("contact_id, duplicate_id, matched_on").limit(200);
  const ids = [...new Set((pairs ?? []).flatMap((p) => [p.contact_id, p.duplicate_id]))];
  const { data: contacts } = ids.length
    ? await supabase.from("contact_list").select("id, display_name, email, phone").in("id", ids)
    : { data: [] as Brief[] };
  const byId = new Map(((contacts ?? []) as Brief[]).map((c) => [c.id, c]));

  return (
    <>
      <PageHeader title="Possible duplicates" description="Contacts that share an email address or phone number." />
      {(pairs ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">No duplicates. Nice and tidy.</p>
      ) : (
        <ul className="space-y-3">
          {pairs!.map((p) => {
            const a = byId.get(p.contact_id);
            const b = byId.get(p.duplicate_id);
            if (!a || !b) return null;
            return (
              <li key={`${p.contact_id}-${p.duplicate_id}`} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  {[a, b].map((c) => (
                    <Link key={c.id} href={`/contacts/${c.id}`} className="min-w-0 hover:underline">
                      <p className="truncate font-medium">{c.display_name}</p>
                      <p className="truncate text-sm text-muted">{[c.email, formatPhone(c.phone)].filter(Boolean).join(" · ")}</p>
                    </Link>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Pill>Same {p.matched_on}</Pill>
                  <Link href={`/contacts/merge?a=${a.id}&b=${b.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">
                    Review &amp; merge
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
