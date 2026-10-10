"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { MERGEABLE_FIELDS } from "@/lib/contacts/fields";
import type { FormState } from "@/lib/contacts/schema";
import { mergeContacts } from "../actions";

export type MergeSide = {
  id: string;
  name: string;
  created_at: string;
  tags: string[];
  stages: string[];
  values: Record<string, { raw: string | null; shown: string }>;
};

export function MergeForm({ primary, other }: { primary: MergeSide; other: MergeSide }) {
  const [state, action] = useActionState<FormState, FormData>(mergeContacts, null);
  const [keep, setKeep] = useState<"primary" | "other">("primary");

  // Only fields where both have a value and they differ need a decision; blanks are filled automatically.
  const conflicts = MERGEABLE_FIELDS.filter(({ key }) => {
    const x = primary.values[key]?.raw;
    const y = other.values[key]?.raw;
    return x && y && x !== y;
  });

  return (
    <form action={action} className="max-w-3xl space-y-5">
      <input type="hidden" name="primary" value={primary.id} />
      <input type="hidden" name="other" value={other.id} />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-muted">Which record stays?</legend>
        {([["primary", primary], ["other", other]] as const).map(([which, side]) => (
          <label key={which} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${keep === which ? "border-accent bg-accent/5" : "border-line bg-surface"}`}>
            <input type="radio" name="keep" value={side.id} checked={keep === which} onChange={() => setKeep(which)} className="mt-1 size-5" />
            <span className="min-w-0">
              <span className="block font-medium">{side.name}</span>
              <span className="block text-xs text-muted">Added {new Date(side.created_at).toLocaleDateString()}</span>
              {side.tags.length > 0 && <span className="mt-1 block truncate text-xs text-muted">Tags: {side.tags.join(", ")}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      {conflicts.length > 0 ? (
        <fieldset className="overflow-hidden rounded-xl border border-line bg-surface">
          <legend className="sr-only">Choose values</legend>
          <div className="grid grid-cols-[7rem_1fr_1fr] gap-2 border-b border-line px-4 py-2 text-xs font-semibold text-muted">
            <span>Field</span>
            <span>{primary.name}</span>
            <span>{other.name}</span>
          </div>
          {conflicts.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 border-b border-line px-4 py-2 text-sm last:border-0">
              <span className="text-muted">{label}</span>
              {(["primary", "other"] as const).map((which) => (
                <label key={which} className="flex min-h-11 min-w-0 items-center gap-2">
                  <input type="radio" name={`field_${key}`} value={which} defaultChecked={which === "primary"} className="size-5 shrink-0" />
                  <span className="truncate">{(which === "primary" ? primary : other).values[key]?.shown}</span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted">No conflicting fields. Anything blank on the kept record is filled from the other.</p>
      )}

      <p className="text-sm text-muted">
        If either record says do-not-text, do-not-email or stop automations, the merged contact keeps that.
      </p>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Merging…">Merge contacts</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
