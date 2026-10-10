"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef } from "react";
import { Field, inputClass, SubmitButton } from "@/components/form";
import { EVENT_TYPES } from "@/lib/contacts/fields";
import { BUDGETS, HEARD_ABOUT, HONEYPOT_FIELD, SERVICE_CHOICES } from "@/lib/leads/inquiry";
import { submitInquiry, type InquiryState } from "./actions";

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string) => void };
  }
}

export function InquiryForm({ consentText, siteKey, embedded }: { consentText: string; siteKey: string; embedded: boolean }) {
  const [state, action] = useActionState<InquiryState, FormData>(submitInquiry, null);
  const rootRef = useRef<HTMLDivElement>(null);
  const err = state?.fieldErrors ?? {};

  // A Turnstile token works once; get a fresh one after a failed attempt.
  useEffect(() => {
    if (state && !state.ok) window.turnstile?.reset();
    if (state) rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  // When embedded, tell the parent page how tall we are (see public/embed.js).
  useEffect(() => {
    if (!embedded || !rootRef.current || window.parent === window) return;
    const el = rootRef.current;
    const post = () => window.parent.postMessage({ type: "rhipo-form-height", height: el.scrollHeight + 16 }, "*");
    const observer = new ResizeObserver(post);
    observer.observe(el);
    post();
    return () => observer.disconnect();
  }, [embedded]);

  if (state?.ok) {
    return (
      <div ref={rootRef} role="status" className="rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="text-2xl font-extrabold">Thank you!</p>
        <p className="mt-2 text-muted">
          We&apos;ve got your inquiry and will be in touch very soon. Congratulations on your wedding!
        </p>
      </div>
    );
  }

  const text = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} name={name} error={err[name]}>
      <input id={name} name={name} aria-invalid={Boolean(err[name])} className={inputClass} {...props} />
    </Field>
  );

  return (
    <div ref={rootRef}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <form action={action} className="space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {state && !state.ok && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {text("first_name", "Your first name *", { required: true, autoComplete: "given-name" })}
          {text("last_name", "Last name", { autoComplete: "family-name" })}
          {text("partner_name", "Partner's name")}
          {text("email", "Email *", { type: "email", required: true, autoComplete: "email", inputMode: "email" })}
          {text("phone", "Phone", { type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "(555) 555-1234" })}
          {text("event_date", "Wedding date", { type: "date" })}
          {text("venue", "Venue or city")}
          <Field label="Wedding type" name="event_type">
            <select id="event_type" name="event_type" defaultValue="" className={inputClass}>
              <option value="">Choose…</option>
              {EVENT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">What are you looking for?</legend>
          <div className="flex flex-wrap gap-x-5">
            {SERVICE_CHOICES.map((s) => (
              <label key={s.key} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="services" value={s.key} className="size-5" /> {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Budget" name="budget">
            <select id="budget" name="budget" defaultValue="" className={inputClass}>
              <option value="">Choose…</option>
              {BUDGETS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="How did you hear about us?" name="heard_about">
            <select id="heard_about" name="heard_about" defaultValue="" className={inputClass}>
              <option value="">Choose…</option>
              {HEARD_ABOUT.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tell us about your celebration" name="message" error={err.message}>
          <textarea id="message" name="message" rows={4} maxLength={3000} placeholder="Events, guest count, what matters most to you…" className={`${inputClass} py-2`} />
        </Field>

        {/* Honeypot: hidden from people and screen readers, irresistible to bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Company website
            <input name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <label className="flex gap-3 rounded-lg bg-paper p-3 text-sm">
          <input type="checkbox" name="sms_consent" className="mt-0.5 size-5 shrink-0" />
          <span>{consentText}</span>
        </label>

        <div className="cf-turnstile" data-sitekey={siteKey} data-theme="auto" data-size="flexible" />

        <SubmitButton pendingText="Sending…">Send inquiry</SubmitButton>
        <p className="text-xs text-muted">We&apos;ll only use your details to reply to your inquiry.</p>
      </form>
    </div>
  );
}
