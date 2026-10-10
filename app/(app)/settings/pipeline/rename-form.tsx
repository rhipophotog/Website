"use client";

import { useActionState } from "react";
import { FormMessage, inputClass, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/contacts/schema";
import { moveStage, renameStages } from "./actions";

type Stage = { key: string; name: string; kind: string };

export function StagesForm({ stages }: { stages: Stage[] }) {
  const [state, action] = useActionState<FormState, FormData>(renameStages, null);
  const main = stages.filter((s) => s.kind === "open");
  return (
    <form action={action} className="space-y-3">
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {stages.map((s) => {
          const i = main.findIndex((m) => m.key === s.key);
          return (
            <li key={s.key} className="flex items-center gap-2 px-3 py-2">
              <input name={`name_${s.key}`} defaultValue={s.name} aria-label={`Name for ${s.key}`} className={`${inputClass} flex-1`} />
              <code className="hidden w-36 truncate text-xs text-muted sm:block">{s.key}</code>
              {s.kind === "open" ? (
                <span className="flex">
                  <button type="button" disabled={i === 0} onClick={() => moveStage(s.key, "up")} aria-label={`Move ${s.name} up`} className="min-h-11 min-w-11 disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" disabled={i === main.length - 1} onClick={() => moveStage(s.key, "down")} aria-label={`Move ${s.name} down`} className="min-h-11 min-w-11 disabled:opacity-30">
                    ↓
                  </button>
                </span>
              ) : (
                <span className="min-w-22 text-center text-xs text-muted">side stage</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <SubmitButton>Save names</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
