import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/time";
import { revokeInvite } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  if (user.role !== "owner") {
    return (
      <>
        <PageHeader title="Settings" />
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          Settings are owner-only. Ask the studio owner if something needs changing.
        </p>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role").order("created_at"),
    supabase.from("invites").select("id, email, role, created_at").is("accepted_at", null).order("created_at"),
  ]);

  return (
    <>
      <PageHeader title="Settings" description="Team, integrations and automations." />

      <nav className="mb-4 max-w-2xl">
        <Link href="/settings/pipeline" className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-5 py-3">
          <span className="font-medium">Pipeline stages</span>
          <span className="text-sm text-muted">Rename and reorder →</span>
        </Link>
        <Link href="/settings/studio" className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-5 py-3">
          <span className="font-medium">Studio &amp; email</span>
          <span className="text-sm text-muted">Your details, auto-reply, templates →</span>
        </Link>
        <Link href="/settings/leads" className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-5 py-3">
          <span className="font-medium">Lead capture</span>
          <span className="text-sm text-muted">Inquiry form, embed, ad webhooks →</span>
        </Link>
        <Link href="/settings/calendar" className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-5 py-3">
          <span className="font-medium">Calendar</span>
          <span className="text-sm text-muted">Hours, booking links, Google →</span>
        </Link>
      </nav>

      <section className="max-w-2xl rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Team</h2>
        <p className="mt-1 text-sm text-muted">The owner plus up to 2 team members. Sign-in is invite-only.</p>

        <ul className="mt-4 divide-y divide-line">
          {members?.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3 text-sm">
              <span className="truncate">
                {m.full_name ?? m.email}
                {m.full_name && <span className="ml-2 text-muted">{m.email}</span>}
              </span>
              <span className="rounded-full bg-line/70 px-2 py-0.5 text-xs capitalize">{m.role}</span>
            </li>
          ))}
          {invites?.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="truncate text-muted">
                {inv.email} · invited {formatInTimeZone(inv.created_at, user.timeZone, { dateStyle: "medium" })}
              </span>
              <form action={revokeInvite}>
                <input type="hidden" name="id" value={inv.id} />
                <button className="min-h-11 px-2 text-xs text-danger underline">Revoke</button>
              </form>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-line pt-4">
          <InviteForm />
        </div>
      </section>
    </>
  );
}
