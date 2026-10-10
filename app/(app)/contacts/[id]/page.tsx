import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, Notice, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CONSENT_SOURCES, EVENT_TYPES, LOST_REASONS, sourceLabel } from "@/lib/contacts/fields";
import { formatPhone } from "@/lib/contacts/phone";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/time";
import { addNote, addTags, deleteContact, recordConsent, removeTag } from "../actions";
import { ConsentForm, DeleteContactForm, NoteForm } from "./forms";

export const metadata: Metadata = { title: "Contact" };

const NOTICES: Record<string, string> = {
  existing: "They were already in your contacts, so we added the new details to this record instead of creating a duplicate.",
  merged: "Contacts merged.",
  partial: "Contact saved, but tags or the pipeline entry couldn't be added. Try again below.",
};

type Activity = { id: string; kind: string; data: Record<string, unknown>; at: string; actor: { full_name: string | null; email: string } | null };
type Note = { id: string; body: string; created_at: string; author: { full_name: string | null; email: string } | null };

export default async function ContactPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { notice } = await searchParams;
  const supabase = await createClient();

  const { data: contact } = await supabase.from("contact_list").select("*").eq("id", id).maybeSingle();
  if (!contact) notFound();

  const [{ data: tagLinks }, { data: opportunities }, { data: consents }, { data: activity }, { data: notes }, { data: stages }] = await Promise.all([
    supabase.from("contact_tags").select("tag_id, tags(name)").eq("contact_id", id),
    supabase.from("opportunities").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("consents").select("channel, granted, source, text, at").eq("contact_id", id).order("at", { ascending: false }),
    supabase.from("contact_activity").select("id, kind, data, at, actor:users(full_name, email)").eq("contact_id", id).order("at", { ascending: false }).limit(100),
    supabase.from("messages").select("id, body, created_at, author:users(full_name, email)").eq("contact_id", id).eq("channel", "note").order("created_at", { ascending: false }).limit(100),
    supabase.from("stages").select("key, name"),
  ]);

  const stageName = new Map((stages ?? []).map((s) => [s.key as string, s.name as string]));
  const latestConsent = (channel: string) => consents?.find((c) => c.channel === channel);
  const sms = latestConsent("sms");
  const tz = user.timeZone;
  const when = (iso: string) => formatInTimeZone(iso, tz, { dateStyle: "medium", timeStyle: "short" });

  const timeline = [
    ...((activity ?? []) as unknown as Activity[]).map((a) => ({ kind: "activity" as const, at: a.at, item: a })),
    ...((notes ?? []) as unknown as Note[]).map((n) => ({ kind: "note" as const, at: n.created_at, item: n })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHeader
        title={contact.display_name}
        description={contact.partner_name ? `& ${contact.partner_name}` : undefined}
        actions={<ButtonLink href={`/contacts/${id}/edit`}>Edit</ButtonLink>}
      />

      {typeof notice === "string" && NOTICES[notice] && <Notice>{NOTICES[notice]}</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              {contact.email && (
                <Row label="Email">
                  <a href={`mailto:${contact.email}`} className="break-all text-accent underline">{contact.email}</a>
                </Row>
              )}
              {contact.phone && (
                <Row label="Phone">
                  <a href={`tel:${contact.phone}`} className="text-accent underline">{formatPhone(contact.phone)}</a>
                </Row>
              )}
              <Row label="Source">{sourceLabel(contact.source)}{contact.referral_by && ` (via ${contact.referral_by})`}</Row>
              {(contact.city || contact.state || contact.country) && (
                <Row label="Location">{[contact.city, contact.state, contact.country].filter(Boolean).join(", ")}</Row>
              )}
              {contact.preferred_contact && <Row label="Prefers">{contact.preferred_contact.toUpperCase()}</Row>}
              <Row label="Added">{formatInTimeZone(contact.created_at, tz, { dateStyle: "medium" })}</Row>
            </dl>
          </Card>

          <Card title="Tags">
            <div className="mb-3 flex flex-wrap gap-2">
              {(tagLinks ?? []).length === 0 && <p className="text-sm text-muted">No tags yet.</p>}
              {(tagLinks ?? []).map((link) => {
                const tag = link.tags as unknown as { name: string } | null;
                return (
                  <form key={link.tag_id} action={removeTag.bind(null, id, link.tag_id)}>
                    <button className="inline-flex min-h-8 items-center gap-1 rounded-full bg-line/70 px-3 text-xs font-medium" aria-label={`Remove tag ${tag?.name}`}>
                      {tag?.name} <span aria-hidden>×</span>
                    </button>
                  </form>
                );
              })}
            </div>
            <form action={addTags.bind(null, id)} className="flex gap-2">
              <input name="tags" required placeholder="Add tags, comma-separated" aria-label="Add tags" className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3" />
              <button className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium">Add</button>
            </form>
          </Card>

          <Card title="Messaging">
            <ul className="mb-4 space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span>SMS consent</span>
                {sms ? (
                  <Pill tone={sms.granted ? "accent" : "danger"}>
                    {sms.granted ? "Yes" : "Opted out"} · {CONSENT_SOURCES.find((s) => s.key === sms.source)?.label ?? sms.source}
                  </Pill>
                ) : (
                  <Pill tone="danger">Not recorded, no texts</Pill>
                )}
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Marketing email</span>
                <Pill tone={contact.email_marketing_consent ? "accent" : "neutral"}>{contact.email_marketing_consent ? "Yes" : "No"}</Pill>
              </li>
              {contact.dnd_sms && <li><Pill tone="danger">Do not text</Pill></li>}
              {contact.dnd_email && <li><Pill tone="danger">Do not email</Pill></li>}
              {contact.stop_automations && <li><Pill tone="danger">Automations stopped</Pill></li>}
            </ul>
            {sms && (
              <p className="mb-3 text-xs text-muted">
                Recorded {when(sms.at)}: &ldquo;{sms.text}&rdquo;
              </p>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium text-accent">Record consent or opt-out</summary>
              <div className="mt-3">
                <ConsentForm action={recordConsent.bind(null, id)} />
              </div>
            </details>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Weddings / opportunities" actions={<Link href={`/pipeline/new?contact=${id}`} className="text-sm font-medium text-accent underline">+ Add to pipeline</Link>}>
            {(opportunities ?? []).length === 0 ? (
              <p className="text-sm text-muted">Not in the pipeline.</p>
            ) : (
              <ul className="divide-y divide-line">
                {opportunities!.map((o) => {
                  const dates = (o.event_dates as { name: string; date: string }[]) ?? [];
                  return (
                    <li key={o.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/pipeline/${o.id}`} className="font-medium underline">{o.couple_names ?? contact.display_name}</Link>
                        <Pill tone={o.stage_key === "lost" ? "danger" : "accent"}>{stageName.get(o.stage_key) ?? o.stage_key}</Pill>
                        {o.status === "lost" && o.lost_reason && <Pill tone="danger">{LOST_REASONS.find((r) => r.key === o.lost_reason)?.label}</Pill>}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {[
                          EVENT_TYPES.find((t) => t.key === o.event_type)?.label,
                          dates.map((d) => `${d.name} ${formatInTimeZone(`${d.date}T12:00:00Z`, "UTC", { dateStyle: "medium" })}`).join(", "),
                          o.venue,
                          o.value_cents != null && `$${(o.value_cents / 100).toLocaleString()}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No event details yet"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Timeline">
            <div className="mb-5">
              <NoteForm action={addNote.bind(null, id)} />
            </div>
            <ol className="space-y-4">
              {timeline.map((entry) =>
                entry.kind === "note" ? (
                  <li key={`n-${entry.item.id}`} className="rounded-lg border-l-4 border-accent bg-accent/5 p-3">
                    <p className="whitespace-pre-wrap text-sm">{entry.item.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      Note by {who(entry.item.author)} · {when(entry.at)}
                    </p>
                  </li>
                ) : (
                  <li key={`a-${entry.item.id}`} className="flex gap-3 text-sm">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-line" />
                    <div>
                      <p>{describe(entry.item, stageName)}</p>
                      <p className="text-xs text-muted">
                        {entry.item.actor ? `${who(entry.item.actor)} · ` : ""}
                        {when(entry.at)}
                      </p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </Card>

          {user.role === "owner" && (
            <Card title="Delete contact" className="border-danger/30">
              <DeleteContactForm action={deleteContact.bind(null, id)} name={contact.display_name} />
            </Card>
          )}
        </div>
      </div>

      <p className="mt-6 text-sm">
        <Link href="/contacts" className="text-muted underline">
          ← All contacts
        </Link>
      </p>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function who(person: { full_name: string | null; email: string } | null) {
  return person?.full_name ?? person?.email ?? "Someone";
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "first name", last_name: "last name", partner_name: "partner", email: "email", phone: "phone",
  preferred_contact: "preferred contact", city: "city", state: "state", country: "country", language: "language",
  time_zone: "time zone", source: "source", referral_by: "referral", email_marketing_consent: "marketing email consent",
  dnd_email: "do-not-email", dnd_sms: "do-not-text", stop_automations: "automations switch", assigned_to: "assignee",
  ghl_contact_id: "GoHighLevel id",
};

function describe(a: Activity, stageName: Map<string, string>): string {
  const d = a.data;
  const stage = (key: unknown) => stageName.get(String(key)) ?? String(key);
  switch (a.kind) {
    case "contact.created":
      return d.import_id ? "Imported from CSV" : `Added${d.source ? ` (${sourceLabel(String(d.source))})` : ""}`;
    case "contact.updated":
      return `Updated ${((d.fields as string[]) ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ")}`;
    case "contact.merged":
      return `Merged in a duplicate${d.merged_name || d.merged_email ? ` (${[d.merged_name, d.merged_email].filter(Boolean).join(", ")})` : ""}`;
    case "tag.added":
      return `Tagged "${d.tag}"`;
    case "tag.removed":
      return `Removed tag "${d.tag}"`;
    case "opportunity.created":
      return `Added to pipeline: ${stage(d.stage)}`;
    case "stage.changed":
      return `Moved from ${stage(d.from)} to ${stage(d.to)}`;
    case "consent.recorded":
      return `${d.channel === "sms" ? "SMS" : "Email"} ${d.granted ? "consent recorded" : "opt-out recorded"}`;
    default:
      return a.kind;
  }
}
