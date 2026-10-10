"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClass, SubmitButton } from "@/components/form";
import { EVENT_TYPES, PREFERRED_CONTACT, SOURCES } from "@/lib/contacts/fields";
import type { FormState } from "@/lib/contacts/schema";

export type ContactFormValues = Partial<{
  first_name: string | null;
  last_name: string | null;
  partner_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_contact: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  language: string | null;
  time_zone: string | null;
  source: string | null;
  referral_by: string | null;
  email_marketing_consent: boolean;
  dnd_email: boolean;
  dnd_sms: boolean;
  stop_automations: boolean;
}>;

type Props = {
  mode: "create" | "edit";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values?: ContactFormValues;
};

export function ContactForm({ mode, action, values = {} }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const err = state?.fieldErrors ?? {};
  const text = (name: keyof ContactFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} name={name} error={err[name]}>
      <input
        id={name}
        name={name}
        defaultValue={(values[name] as string | null | undefined) ?? ""}
        aria-invalid={Boolean(err[name])}
        className={inputClass}
        {...props}
      />
    </Field>
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-5" noValidate>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-muted">Who</legend>
        {text("first_name", "First name", { autoComplete: "off" })}
        {text("last_name", "Last name", { autoComplete: "off" })}
        {text("partner_name", "Partner's name")}
        {text("email", "Email", { type: "email", inputMode: "email" })}
        <Field label="Phone" name="phone" error={err.phone} hint="US numbers as-is; others with +country code, e.g. +91 98765 43210">
          <input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={values.phone ?? ""} aria-invalid={Boolean(err.phone)} className={inputClass} />
        </Field>
        <Field label="Preferred contact" name="preferred_contact">
          <select id="preferred_contact" name="preferred_contact" defaultValue={values.preferred_contact ?? ""} className={inputClass}>
            <option value="">—</option>
            {PREFERRED_CONTACT.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-muted">Where they came from</legend>
        <Field label="Source" name="source" error={err.source}>
          <select id="source" name="source" defaultValue={values.source ?? ""} className={inputClass}>
            <option value="">—</option>
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {text("referral_by", "Referred by")}
      </fieldset>

      {mode === "create" && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-muted">Tags &amp; wedding</legend>
          <Field label="Tags" name="tags" hint="Comma-separated, e.g. VIP, Sangeet only">
            <input id="tags" name="tags" className={inputClass} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" name="create_opportunity" defaultChecked /> Add to pipeline as a new inquiry
          </label>
          <Field label="Wedding date" name="event_date" error={err.event_date}>
            <input id="event_date" name="event_date" type="date" className={inputClass} />
          </Field>
          <Field label="Wedding type" name="event_type">
            <select id="event_type" name="event_type" defaultValue="" className={inputClass}>
              <option value="">—</option>
              {EVENT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Venue / city" name="venue">
            <input id="venue" name="venue" className={inputClass} />
          </Field>
        </fieldset>
      )}

      <details className="rounded-lg border border-line p-3" open={mode === "edit"}>
        <summary className="cursor-pointer text-sm font-semibold text-muted">More details</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {text("city", "City")}
          {text("state", "State")}
          {text("country", "Country")}
          {text("language", "Language")}
          {text("time_zone", "Time zone", { placeholder: "America/Los_Angeles" })}
        </div>
      </details>

      {mode === "edit" && (
        <fieldset className="space-y-2 rounded-lg border border-line p-3 text-sm">
          <legend className="px-1 font-semibold text-muted">Messaging switches</legend>
          {(
            [
              ["email_marketing_consent", "Agreed to marketing emails"],
              ["dnd_email", "Do not email"],
              ["dnd_sms", "Do not text"],
              ["stop_automations", "Stop all automations for this contact"],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name={name} defaultChecked={Boolean(values[name])} className="size-5" /> {label}
            </label>
          ))}
          <p className="text-xs text-muted">SMS consent is recorded separately on the contact page, with its source and wording.</p>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{mode === "create" ? "Add contact" : "Save changes"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
