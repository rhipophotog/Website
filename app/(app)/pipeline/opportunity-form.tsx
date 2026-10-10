"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, inputClass, SubmitButton } from "@/components/form";
import { EVENT_TYPES, LOST_REASONS, SOURCES } from "@/lib/contacts/fields";
import type { FormState } from "@/lib/contacts/schema";
import type { Stage } from "@/lib/pipeline/board";
import { SERVICES } from "@/lib/pipeline/schema";

export type OpportunityValues = {
  stage_key: string;
  lost_reason: string | null;
  couple_names: string | null;
  event_type: string | null;
  event_dates: { name: string; date: string }[];
  venue: string | null;
  city: string | null;
  services: string[];
  value_cents: number | null;
  source: string | null;
  assigned_to: string | null;
  notes: string | null;
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values: OpportunityValues;
  stages: Stage[];
  team: { id: string; name: string }[];
  submitLabel: string;
};

const DAY_SUGGESTIONS = ["Haldi", "Mehndi", "Sangeet", "Ceremony", "Reception", "Engagement", "Nikah", "Walima", "Anand Karaj"];

export function OpportunityForm({ action, values, stages, team, submitLabel }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const [stage, setStage] = useState(values.stage_key);
  const [days, setDays] = useState(values.event_dates.length ? values.event_dates : [{ name: "", date: "" }]);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <input type="hidden" name="event_dates" value={JSON.stringify(days)} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-muted">Stage</legend>
        <Field label="Stage" name="stage_key" error={err.stage_key}>
          <select id="stage_key" name="stage_key" value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {stages.find((s) => s.key === stage)?.kind === "lost" && (
          <Field label="Why was it lost?" name="lost_reason" error={err.lost_reason}>
            <select id="lost_reason" name="lost_reason" defaultValue={values.lost_reason ?? ""} aria-invalid={Boolean(err.lost_reason)} className={inputClass}>
              <option value="">Pick a reason</option>
              {LOST_REASONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-muted">The wedding</legend>
        <Field label="Couple names" name="couple_names" hint="e.g. Priya & Rohan">
          <input id="couple_names" name="couple_names" defaultValue={values.couple_names ?? ""} className={inputClass} />
        </Field>
        <Field label="Wedding type" name="event_type">
          <select id="event_type" name="event_type" defaultValue={values.event_type ?? ""} className={inputClass}>
            <option value="">—</option>
            {EVENT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Venue" name="venue">
          <input id="venue" name="venue" defaultValue={values.venue ?? ""} className={inputClass} />
        </Field>
        <Field label="City" name="city">
          <input id="city" name="city" defaultValue={values.city ?? ""} className={inputClass} />
        </Field>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-muted">Event days</legend>
        <datalist id="day-names">
          {DAY_SUGGESTIONS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        {days.map((day, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Event ${i + 1} name`}
              list="day-names"
              placeholder={i === 0 ? "Ceremony" : "Reception"}
              value={day.name}
              onChange={(e) => setDays((d) => d.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              className={`${inputClass} flex-1`}
            />
            <input
              aria-label={`Event ${i + 1} date`}
              type="date"
              value={day.date}
              onChange={(e) => setDays((d) => d.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
              className={`${inputClass} w-44`}
            />
            <button
              type="button"
              aria-label={`Remove event ${i + 1}`}
              onClick={() => setDays((d) => (d.length > 1 ? d.filter((_, j) => j !== i) : [{ name: "", date: "" }]))}
              className="min-h-11 px-2 text-muted"
            >
              ×
            </button>
          </div>
        ))}
        {err.event_dates && <p role="alert" className="text-xs text-danger">{err.event_dates}</p>}
        {days.length < 10 && (
          <button type="button" onClick={() => setDays((d) => [...d, { name: "", date: "" }])} className="min-h-11 text-sm text-accent underline">
            + Add another day
          </button>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-muted">Deal</legend>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Services</span>
          <div className="flex flex-wrap gap-3">
            {SERVICES.map((s) => (
              <label key={s.key} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="services" value={s.key} defaultChecked={values.services.includes(s.key)} className="size-5" />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <Field label="Estimated value ($)" name="value" error={err.value}>
          <input
            id="value"
            name="value"
            inputMode="decimal"
            defaultValue={values.value_cents != null ? String(values.value_cents / 100) : ""}
            aria-invalid={Boolean(err.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Source" name="source">
          <select id="source" name="source" defaultValue={values.source ?? ""} className={inputClass}>
            <option value="">—</option>
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assigned to" name="assigned_to">
          <select id="assigned_to" name="assigned_to" defaultValue={values.assigned_to ?? ""} className={inputClass}>
            <option value="">Nobody</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <Field label="Notes" name="notes">
        <textarea id="notes" name="notes" rows={4} defaultValue={values.notes ?? ""} className={`${inputClass} py-2`} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
