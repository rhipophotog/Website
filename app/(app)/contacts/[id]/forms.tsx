"use client";

import { useActionState, useRef } from "react";
import { Field, FormMessage, inputClass, SubmitButton } from "@/components/form";
import { CONSENT_SOURCES } from "@/lib/contacts/fields";
import type { FormState } from "@/lib/contacts/schema";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function NoteForm({ action }: { action: Action }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    if (result?.ok) ref.current?.reset();
    return result;
  }, null);
  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <textarea name="body" required rows={3} maxLength={5000} placeholder="Internal note: only the studio team sees this" aria-label="Note" className={`${inputClass} py-2`} />
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary">Add note</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ConsentForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Channel" name="channel">
          <select id="channel" name="channel" defaultValue="sms" className={inputClass}>
            <option value="sms">SMS</option>
            <option value="email">Marketing email</option>
          </select>
        </Field>
        <Field label="Decision" name="granted">
          <select id="granted" name="granted" defaultValue="yes" className={inputClass}>
            <option value="yes">Agreed (opt-in)</option>
            <option value="no">Declined / opted out</option>
          </select>
        </Field>
        <Field label="How" name="source" error={err.source}>
          <select id="source" name="source" defaultValue="verbal" className={inputClass}>
            {CONSENT_SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Exact wording they agreed to" name="text" error={err.text} hint="Required by SMS rules. Write what you asked, word for word.">
        <textarea
          id="text"
          name="text"
          rows={2}
          defaultValue="Is it OK if we text you about your wedding inquiry and booking? Reply STOP anytime to opt out."
          className={`${inputClass} py-2`}
        />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary">Record</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteContactForm({ action, name }: { action: Action; name: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted">
        Permanently deletes {name} with all their notes, opportunities and consent records. Use this when someone asks
        you to delete their data. It can&apos;t be undone.
      </p>
      <Field label='Type "DELETE" to confirm' name="confirm">
        <input id="confirm" name="confirm" autoComplete="off" className={inputClass} />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton variant="danger" pendingText="Deleting…">
          Delete permanently
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
