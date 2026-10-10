import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Inbox" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs-reply", label: "Needs reply" },
  { key: "unread", label: "Unread" },
] as const;

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const user = await requireUser();
  const { filter: raw } = await searchParams;
  const filter = FILTERS.find((f) => f.key === raw)?.key ?? "all";
  const supabase = await createClient();

  let query = supabase.from("inbox_threads").select("*").order("last_at", { ascending: false }).limit(200);
  if (filter === "needs-reply") query = query.eq("needs_reply", true);
  if (filter === "unread") query = query.gt("unread", 0);
  const { data: threads, error } = await query;

  return (
    <>
      <PageHeader title="Inbox" description="Every email (and soon SMS) conversation, latest first." />
      <nav aria-label="Filter" className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/inbox" : `/inbox?filter=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm ${filter === f.key ? "border-ink bg-ink text-paper" : "border-line bg-surface"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <Notice tone="danger">Couldn&apos;t load the inbox. If you just updated the app, run the Milestone 5 database update.</Notice>
      ) : (threads ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          {filter === "all" ? "No conversations yet. Emails you send from a contact page, and their replies, show up here." : "Nothing here. You're all caught up."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {threads!.map((t) => (
            <li key={t.contact_id}>
              <Link href={`/contacts/${t.contact_id}#conversation`} className="flex gap-3 px-4 py-3 hover:bg-paper">
                <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${t.unread > 0 ? "bg-accent" : "bg-transparent"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`truncate ${t.unread > 0 ? "font-semibold" : "font-medium"}`}>
                      {t.contact_name}
                      {t.unread > 0 && <span className="ml-2 text-xs text-accent">{t.unread} new</span>}
                    </p>
                    <span className="shrink-0 text-xs text-muted">{formatInTimeZone(t.last_at, user.timeZone, { dateStyle: "medium" })}</span>
                  </div>
                  <p className="truncate text-sm text-muted">
                    {t.last_direction === "out" ? "You: " : ""}
                    {t.last_subject ? `${t.last_subject} · ` : ""}
                    {t.last_preview}
                  </p>
                  {t.needs_reply && <p className="mt-1 text-xs font-medium text-danger">Needs reply</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
