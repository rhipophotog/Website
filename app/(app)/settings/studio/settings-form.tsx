"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClass, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/contacts/schema";
import { saveStudioSettings } from "./actions";

type Settings = {
  owner_name: string;
  booking_link: string | null;
  portfolio_link: string | null;
  review_link: string | null;
  autoreply_enabled: boolean;
  automations_paused: boolean;
};

export function StudioSettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState<FormState, FormData>(saveStudioSettings, null);
  const err = state?.fieldErrors ?? {};
  const link = (name: "booking_link" | "portfolio_link" | "review_link", label: string, hint: string) => (
    <Field label={label} name={name} error={err[name]} hint={hint}>
      <input id={name} name={name} type="url" defaultValue={settings[name] ?? ""} placeholder="https://" aria-invalid={Boolean(err[name])} className={inputClass} />
    </Field>
  );
  return (
    <form action={action} className="space-y-4">
      <Field label="Your name (signs emails as {{owner_name}})" name="owner_name" error={err.owner_name}>
        <input id="owner_name" name="owner_name" defaultValue={settings.owner_name} className={inputClass} />
      </Field>
      {link("booking_link", "Booking link ({{booking_link}})", "Where couples book a call. Leave blank to use your own booking page (/book/discovery).")}
      {link("portfolio_link", "Portfolio link ({{portfolio_link}})", "Instagram, Pixieset or your gallery page")}
      {link("review_link", "Review link ({{review_link}})", "Your Google review link")}
      <fieldset className="space-y-2 rounded-lg border border-line p-3 text-sm">
        <legend className="px-1 font-semibold text-muted">Automatic messages</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="autoreply_enabled" defaultChecked={settings.autoreply_enabled} className="size-5" />
          Email new inquiries the instant reply (template &ldquo;New inquiry: instant reply&rdquo;)
        </label>
        <label className="flex min-h-11 items-center gap-3 text-danger">
          <input type="checkbox" name="automations_paused" defaultChecked={settings.automations_paused} className="size-5" />
          Pause ALL automatic messages (emergency stop)
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <SubmitButton>Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
