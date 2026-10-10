"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClass, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/contacts/schema";
import { bookForContact } from "../actions";

export function ManualBookingForm({
  contactId,
  types,
  today,
  hasEmail,
}: {
  contactId: string;
  types: { key: string; name: string; duration_minutes: number }[];
  today: string;
  hasEmail: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(bookForContact, null);
  return (
    <form action={action} className="max-w-lg space-y-4 rounded-xl border border-line bg-surface p-5 shadow-card">
      <input type="hidden" name="contact_id" value={contactId} />
      <Field label="Type" name="type_key">
        <select id="type_key" name="type_key" className={inputClass}>
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name} ({t.duration_minutes} min)
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" name="date">
          <input id="date" name="date" type="date" min={today} defaultValue={today} required className={inputClass} />
        </Field>
        <Field label="Time" name="time">
          <input id="time" name="time" type="time" step={900} required className={inputClass} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="send_confirmation" defaultChecked={hasEmail} disabled={!hasEmail} className="size-5" />
        {hasEmail ? "Email them a confirmation with a calendar invite" : "No email on file, so no confirmation will be sent"}
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Booking…">Book</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
