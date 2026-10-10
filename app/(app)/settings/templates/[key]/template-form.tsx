"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormMessage, inputClass, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/contacts/schema";
import { MERGE_FIELDS, render, type MergeContext } from "@/lib/messaging/render";

type Template = { key: string; name: string; channel: string; category: string; subject: string | null; body: string };

export function TemplateForm({ template, action, sample }: { template: Template; action: (s: FormState, f: FormData) => Promise<FormState>; sample: MergeContext }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const preview = useMemo(() => ({ subject: render(subject, sample), body: render(body, sample) }), [subject, body, sample]);
  const sms = template.channel === "sms";
  const smsLength = preview.body.length;

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Name" name="name">
        <input id="name" name="name" defaultValue={template.name} className={inputClass} />
      </Field>
      {!sms && (
        <Field label="Subject" name="subject">
          <input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
        </Field>
      )}
      <Field label="Message" name="body">
        <textarea id="body" name="body" rows={sms ? 4 : 14} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} py-2 font-mono text-sm`} />
      </Field>
      <p className="text-xs text-muted">
        Merge fields:{" "}
        {MERGE_FIELDS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setBody((b) => `${b}{{${f}}}`)}
            className="mr-1 mb-1 rounded bg-line/70 px-1.5 py-0.5 font-mono hover:bg-line"
          >
            {`{{${f}}}`}
          </button>
        ))}
      </p>
      <Field label="Type" name="category" hint="Marketing emails get an unsubscribe link and skip anyone who opted out.">
        <select id="category" name="category" defaultValue={template.category} className={inputClass}>
          <option value="transactional">One-to-one (replies, follow-ups, reminders)</option>
          <option value="marketing">Marketing (offers, re-engagement, newsletters)</option>
        </select>
      </Field>

      <div className="rounded-xl border border-line bg-paper p-4 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Preview (sample couple)</p>
        {!sms && <p className="mb-2 font-semibold">{preview.subject}</p>}
        <p className="whitespace-pre-wrap">{preview.body}</p>
        {sms && (
          <p className={`mt-2 text-xs ${smsLength > 160 ? "text-danger" : "text-muted"}`}>
            {smsLength} characters{smsLength > 160 ? " (over 160, so it sends as 2+ texts)" : ""}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton>Save template</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
