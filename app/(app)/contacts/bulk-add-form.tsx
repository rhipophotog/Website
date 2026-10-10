"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import type { ContactFilters } from "@/lib/contacts/queries";
import type { FormState } from "@/lib/contacts/schema";
import { bulkAddToPipeline } from "./actions";

export function BulkAddForm({ filters, count, stages }: { filters: ContactFilters; count: number; stages: { key: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(bulkAddToPipeline, null);
  return (
    <details className="mb-4 text-sm">
      <summary className="cursor-pointer text-muted">Add these {count.toLocaleString()} contacts to the pipeline</summary>
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm(`Add up to ${count} contacts to the pipeline? People already in it are skipped.`)) e.preventDefault();
        }}
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        {(["q", "tag", "source", "stage", "month"] as const).map((key) => (
          <input key={key} type="hidden" name={key} value={filters[key]} />
        ))}
        <select name="stage_key" defaultValue="new_inquiry" aria-label="Stage" className="min-h-11 rounded-lg border border-line bg-paper px-2">
          {stages
            .filter((s) => s.key !== "lost")
            .map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
        </select>
        <SubmitButton variant="secondary" pendingText="Adding…">
          Add to pipeline
        </SubmitButton>
        <FormMessage state={state} />
      </form>
    </details>
  );
}
