import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { MERGEABLE_FIELDS, sourceLabel } from "@/lib/contacts/fields";
import { formatPhone } from "@/lib/contacts/phone";
import { createClient } from "@/lib/supabase/server";
import { MergeForm, type MergeSide } from "./merge-form";

export const metadata: Metadata = { title: "Merge contacts" };

export default async function MergePage({ searchParams }: PageProps<"/contacts/merge">) {
  const user = await requireUser();
  if (user.role !== "owner") return <Notice>Only the owner can merge contacts.</Notice>;

  const params = await searchParams;
  const ids = z.object({ a: z.uuid(), b: z.uuid() }).safeParse(params);
  if (!ids.success || ids.data.a === ids.data.b) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("contact_list").select("*").in("id", [ids.data.a, ids.data.b]);
  const a = data?.find((c) => c.id === ids.data.a);
  const b = data?.find((c) => c.id === ids.data.b);
  if (!a || !b) notFound();

  const side = (c: Record<string, unknown>): MergeSide => ({
    id: String(c.id),
    name: String(c.display_name),
    created_at: String(c.created_at),
    tags: (c.tag_names as string[]) ?? [],
    stages: (c.stage_keys as string[]) ?? [],
    values: Object.fromEntries(
      MERGEABLE_FIELDS.map(({ key }) => {
        const raw = c[key] as string | null;
        const shown = key === "phone" ? formatPhone(raw) : key === "source" && raw ? sourceLabel(raw) : raw;
        return [key, { raw, shown: shown || "" }];
      }),
    ),
  });

  // The older record survives by default (it usually carries the history).
  const [older, newer] = String(a.created_at) <= String(b.created_at) ? [a, b] : [b, a];

  return (
    <>
      <PageHeader
        title="Merge contacts"
        description="Pick the value to keep for each field. Tags, notes, opportunities, consent records and history from both are kept."
      />
      <MergeForm primary={side(older)} other={side(newer)} />
    </>
  );
}
