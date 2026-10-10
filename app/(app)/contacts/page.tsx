import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SOURCES, sourceLabel } from "@/lib/contacts/fields";
import { formatPhone } from "@/lib/contacts/phone";
import { filtersToQuery, listContacts, PAGE_SIZE, parseFilters, type ContactFilters } from "@/lib/contacts/queries";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/time";
import { deleteView } from "./actions";
import { BulkAddForm } from "./bulk-add-form";
import { SaveViewForm } from "./save-view-form";

export const metadata: Metadata = { title: "Contacts" };

const NOTICES: Record<string, string> = { deleted: "Contact deleted permanently." };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const user = await requireUser();
  const params = await searchParams;
  const filters = parseFilters(params);
  const supabase = await createClient();

  const [{ rows, count, error }, { data: tags }, { data: stages }, { data: views }, { count: duplicateCount }] = await Promise.all([
    listContacts(supabase, filters),
    supabase.from("tags").select("name").order("name"),
    supabase.from("stages").select("key, name, pipelines!inner(is_default)").eq("pipelines.is_default", true).order("position"),
    supabase.from("saved_views").select("id, name, filters, shared, owner_id").order("name"),
    user.role === "owner"
      ? supabase.from("contact_duplicates").select("contact_id", { count: "exact", head: true })
      : Promise.resolve({ count: 0 }),
  ]);

  const stageName = new Map((stages ?? []).map((s) => [s.key as string, s.name as string]));
  const filtered = Boolean(filters.q || filters.tag || filters.source || filters.stage || filters.month);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${count.toLocaleString()} ${filtered ? "matching" : "in total"}`}
        actions={<ButtonLink href="/contacts/new" variant="primary">Add</ButtonLink>}
      />

      {notice && <Notice>{notice}</Notice>}

      {user.role === "owner" && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <ButtonLink href="/contacts/import">Import CSV</ButtonLink>
          {/* A plain GET form: the export is a file download, not a page to navigate to. */}
          <form action="/contacts/export" method="get">
            <button className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 font-medium">Export CSV</button>
          </form>
          {(duplicateCount ?? 0) > 0 && (
            <ButtonLink href="/contacts/duplicates">
              Review duplicates <Pill tone="accent">{duplicateCount}</Pill>
            </ButtonLink>
          )}
        </div>
      )}

      {(views?.length ?? 0) > 0 && (
        <nav aria-label="Saved views" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <Link href="/contacts" className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${!filtered ? "border-ink bg-ink text-paper" : "border-line bg-surface"}`}>
            All
          </Link>
          {views!.map((view) => {
            const query = filtersToQuery(view.filters as Partial<ContactFilters>);
            const active = query === filtersToQuery({ ...filters, page: 1 });
            return (
              <span key={view.id} className={`flex shrink-0 items-center rounded-full border text-sm ${active ? "border-ink bg-ink text-paper" : "border-line bg-surface"}`}>
                <Link href={`/contacts${query}`} className="py-1.5 pl-3 pr-2">
                  {view.name}
                  {view.shared && <span className="sr-only"> (shared)</span>}
                </Link>
                {view.owner_id === user.id && (
                  <form action={deleteView.bind(null, view.id)}>
                    <button aria-label={`Delete view ${view.name}`} className="py-1.5 pr-3 opacity-60 hover:opacity-100">
                      ×
                    </button>
                  </form>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <form method="get" className="mb-4 grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6">
        <input
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Search name, email, phone"
          aria-label="Search"
          className="min-h-11 rounded-lg border border-line bg-paper px-3 sm:col-span-2"
        />
        <select name="tag" defaultValue={filters.tag} aria-label="Tag" className="min-h-11 rounded-lg border border-line bg-paper px-2">
          <option value="">Any tag</option>
          {tags?.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={filters.stage} aria-label="Stage" className="min-h-11 rounded-lg border border-line bg-paper px-2">
          <option value="">Any stage</option>
          {stages?.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source} aria-label="Source" className="min-h-11 rounded-lg border border-line bg-paper px-2">
          <option value="">Any source</option>
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          name="month"
          type="month"
          defaultValue={filters.month}
          aria-label="Event month"
          title="Event month"
          className="min-h-11 rounded-lg border border-line bg-paper px-2"
        />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button className="min-h-11 rounded-lg bg-ink px-4 text-sm font-medium text-paper">Apply</button>
          {filtered && (
            <Link href="/contacts" className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline">
              Clear
            </Link>
          )}
        </div>
      </form>

      {filtered && <SaveViewForm filters={filters} />}
      {filtered && user.role === "owner" && count > 0 && (
        <BulkAddForm filters={filters} count={count} stages={(stages ?? []).map((s) => ({ key: s.key as string, name: s.name as string }))} />
      )}

      {error ? (
        <Notice tone="danger">Couldn&apos;t load contacts. Try again.</Notice>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          {filtered ? "No contacts match these filters." : "No contacts yet. Add one, or import your GoHighLevel export."}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/contacts/${c.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-paper md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 md:w-1/3">
                  <p className="truncate font-medium">
                    {c.display_name}
                    {c.partner_name && <span className="font-normal text-muted"> &amp; {c.partner_name}</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{[c.email, formatPhone(c.phone)].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 md:flex-1">
                  {c.stage_keys.map((k) => (
                    <Pill key={k} tone={k === "lost" ? "danger" : "accent"}>
                      {stageName.get(k) ?? k}
                    </Pill>
                  ))}
                  {c.tag_names.slice(0, 4).map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                  {c.tag_names.length > 4 && <span className="text-xs text-muted">+{c.tag_names.length - 4}</span>}
                </div>
                <div className="flex gap-3 text-xs text-muted md:w-48 md:flex-col md:items-end md:gap-0.5">
                  {c.first_event_date && <span>Event {formatInTimeZone(`${c.first_event_date}T12:00:00Z`, "UTC", { dateStyle: "medium" })}</span>}
                  <span>{sourceLabel(c.source)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
          {filters.page > 1 ? (
            <Link href={`/contacts${filtersToQuery({ ...filters, page: filters.page - 1 })}`} className="min-h-11 px-2 py-3 underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {filters.page} of {pages}
          </span>
          {filters.page < pages ? (
            <Link href={`/contacts${filtersToQuery({ ...filters, page: filters.page + 1 })}`} className="min-h-11 px-2 py-3 underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
