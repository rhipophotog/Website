"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FormMessage, inputClass, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/contacts/schema";
import { render, type MergeContext } from "@/lib/messaging/render";
import { markConversationRead } from "../actions";

export type ThreadMessage = {
  id: string;
  channel: "email" | "sms" | "note";
  direction: "in" | "out" | "internal";
  subject: string | null;
  body: string;
  status: string | null;
  error: string | null;
  rfc_message_id: string | null;
  created_at: string;
  author: string | null;
};

export type EmailTemplate = { key: string; name: string; subject: string; body: string; category: string };

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const STATUS: Record<string, { label: string; tone: string }> = {
  test: { label: "Test (not sent)", tone: "bg-line text-muted" },
  sent: { label: "Sent", tone: "bg-accent/15 text-accent" },
  delivered: { label: "Delivered", tone: "bg-accent/15 text-accent" },
  bounced: { label: "Bounced", tone: "bg-danger/10 text-danger" },
  complained: { label: "Marked as spam", tone: "bg-danger/10 text-danger" },
  failed: { label: "Failed", tone: "bg-danger/10 text-danger" },
};

export function Conversation(props: {
  contactId: string;
  messages: ThreadMessage[];
  templates: EmailTemplate[];
  context: MergeContext;
  emailBlocked: string | null;
  sendEmail: Action;
  addNote: Action;
  timeZone: string;
}) {
  const { contactId, messages } = props;
  const [tab, setTab] = useState<"email" | "note">(props.emailBlocked ? "note" : "email");
  const endRef = useRef<HTMLDivElement>(null);
  const hasUnread = messages.some((m) => m.direction === "in");

  useEffect(() => {
    if (hasUnread) void markConversationRead(contactId);
  }, [contactId, hasUnread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: props.timeZone }).format(new Date(iso));

  return (
    <div>
      <ol className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && <li className="py-6 text-center text-sm text-muted">No messages yet.</li>}
        {messages.map((m) =>
          m.channel === "note" ? (
            <li key={m.id} className="rounded-lg border-l-4 border-accent bg-accent/5 p-3">
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              <p className="mt-1 text-xs text-muted">
                Note{m.author ? ` by ${m.author}` : ""} · {fmt(m.created_at)}
              </p>
            </li>
          ) : (
            <li key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-2xl p-3 text-sm ${m.direction === "out" ? "bg-ink text-paper" : "border border-line bg-paper"}`}>
                {m.subject && <p className="mb-1 font-semibold">{m.subject}</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${m.direction === "out" ? "text-paper/70" : "text-muted"}`}>
                  <span>
                    {m.channel === "email" ? "Email" : "SMS"} · {m.direction === "out" ? (m.author ?? "Automatic") : "Received"} · {fmt(m.created_at)}
                  </span>
                  {m.direction === "out" && m.status && STATUS[m.status] && (
                    <span className={`rounded-full px-2 py-0.5 ${STATUS[m.status].tone}`} title={m.error ?? undefined}>
                      {STATUS[m.status].label}
                    </span>
                  )}
                </p>
              </div>
            </li>
          ),
        )}
        <div ref={endRef} />
      </ol>

      <div className="mt-4 border-t border-line pt-4">
        <div role="tablist" className="mb-3 flex gap-2">
          {(["email", "note"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-9 rounded-full px-4 text-sm font-medium ${tab === t ? "bg-ink text-paper" : "bg-line/60"}`}
            >
              {t === "email" ? "Email" : "Internal note"}
            </button>
          ))}
        </div>
        {tab === "email" ? (
          props.emailBlocked ? (
            <p className="text-sm text-muted">{props.emailBlocked}</p>
          ) : (
            <EmailComposer {...props} replyTo={[...messages].reverse().find((m) => m.direction === "in" && m.channel === "email") ?? null} />
          )
        ) : (
          <NoteComposer action={props.addNote} />
        )}
      </div>
    </div>
  );
}

function EmailComposer({ templates, context, sendEmail, replyTo }: { templates: EmailTemplate[]; context: MergeContext; sendEmail: Action; replyTo: ThreadMessage | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [templateKey, setTemplateKey] = useState("");
  const [subject, setSubject] = useState(replyTo?.subject ? (/^re:/i.test(replyTo.subject) ? replyTo.subject : `Re: ${replyTo.subject}`) : "");
  const [body, setBody] = useState("");
  const [state, action] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await sendEmail(prev, fd);
    if (result?.ok) {
      setBody("");
      setTemplateKey("");
    }
    return result;
  }, null);
  const preview = useMemo(() => ({ subject: render(subject, context), body: render(body, context) }), [subject, body, context]);
  const usesFields = /\{\{/.test(subject + body);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="template_key" value={templateKey} />
      <input type="hidden" name="in_reply_to" value={replyTo?.rfc_message_id ?? ""} />
      <select
        aria-label="Template"
        value={templateKey}
        onChange={(e) => {
          const t = templates.find((x) => x.key === e.target.value);
          setTemplateKey(e.target.value);
          if (t) {
            setSubject(t.subject);
            setBody(t.body);
          }
        }}
        className={inputClass}
      >
        <option value="">Start from a template…</option>
        {templates.map((t) => (
          <option key={t.key} value={t.key}>
            {t.name}
            {t.category === "marketing" ? " (marketing)" : ""}
          </option>
        ))}
      </select>
      <input name="subject" aria-label="Subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} required />
      <textarea name="body" aria-label="Message" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your email…" className={`${inputClass} py-2`} required />
      {usesFields && (
        <details className="rounded-lg bg-paper p-3 text-sm" open>
          <summary className="cursor-pointer text-muted">Preview with their details</summary>
          <p className="mt-2 font-semibold">{preview.subject}</p>
          <p className="mt-1 whitespace-pre-wrap">{preview.body}</p>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Sending…">Send email</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function NoteComposer({ action: addNote }: { action: Action }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await addNote(prev, fd);
    if (result?.ok) ref.current?.reset();
    return result;
  }, null);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <textarea name="body" required rows={3} maxLength={5000} placeholder="Internal note: only the studio team sees this" aria-label="Note" className={`${inputClass} py-2`} />
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary">Add note</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
