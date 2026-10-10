"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import type { ContactFilters } from "@/lib/contacts/queries";
import type { FormState } from "@/lib/contacts/schema";
import { saveView } from "./actions";

export function SaveViewForm({ filters }: { filters: ContactFilters }) {
  const [state, action] = useActionState<FormState, FormData>(saveView, null);
  return (
    <details className="mb-4 text-sm">
      <summary className="cursor-pointer text-muted">Save these filters as a view</summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        {(["q", "tag", "source", "stage", "month"] as const).map((key) => (
          <input key={key} type="hidden" name={key} value={filters[key]} />
        ))}
        <input name="name" required maxLength={60} placeholder="View name, e.g. 2027 weddings" aria-label="View name" className="min-h-11 flex-1 rounded-lg border border-line bg-paper px-3" />
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="shared" /> Share with team
        </label>
        <SubmitButton variant="secondary">Save view</SubmitButton>
        <FormMessage state={state} />
      </form>
    </details>
  );
}
