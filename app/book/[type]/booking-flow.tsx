"use client";

import Script from "next/script";
import { ChevronLeft, Clock, MapPin } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Field, inputClass, SubmitButton } from "@/components/form";
import { useBrowserTimeZone } from "@/lib/calendar/use-time-zone";
import { HONEYPOT_FIELD } from "@/lib/leads/inquiry";
import type { BookingState } from "./actions";

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string) => void };
  }
}

type Props = {
  type: { key: string; name: string; description: string | null; duration: number; location: string };
  slots: string[];
  studioTimeZone: string;
  consentText: string | null;
  siteKey: string;
  action: (state: BookingState, formData: FormData) => Promise<BookingState>;
};

const dayKey = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function BookingFlow({ type, slots, studioTimeZone, consentText, siteKey, action }: Props) {
  // Show times in the visitor's own time zone.
  const tz = useBrowserTimeZone(studioTimeZone);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [state, formAction] = useActionState<BookingState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    if (result && !result.ok && result.slotTaken) setSlot(null);
    return result;
  }, null);
  const err = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // A Turnstile token works once; get a fresh one after a failed attempt.
  useEffect(() => {
    if (state && !state.ok) window.turnstile?.reset();
  }, [state]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const k = dayKey(s, tz);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [slots, tz]);
  const days = [...byDay.keys()];
  const activeDay = day && byDay.has(day) ? day : (days[0] ?? null);

  const fmtDay = (k: string, style: "short" | "long") =>
    new Intl.DateTimeFormat("en-US", style === "short" ? { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" } : { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${k}T12:00:00Z`),
    );
  const fmtTime = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  const tzLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "long" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? tz;

  if (state?.ok) {
    return (
      <section role="status" className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-card">
        <h1 className="text-2xl font-extrabold">You&apos;re booked!</h1>
        <p className="mt-2 text-gray-600">
          {type.name} on{" "}
          <strong className="text-gray-900">
            {fmtDay(dayKey(state.startsAt, tz), "long")} at {fmtTime(state.startsAt)}
          </strong>{" "}
          ({tzLabel}).
        </p>
        <p className="mt-2 text-gray-600">A confirmation with a calendar invite is on its way to your inbox.</p>
        <a href={state.manageUrl} className="mt-5 inline-block text-sm text-primary-600 underline">
          Need to reschedule or cancel?
        </a>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        <h1 className="text-2xl font-extrabold tracking-tight">{type.name}</h1>
        {type.description && <p className="mt-1 text-gray-600">{type.description}</p>}
        <p className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1">
            <Clock size={16} strokeWidth={1.75} aria-hidden /> {type.duration} min
          </span>
          <span className="flex items-center gap-1 capitalize">
            <MapPin size={16} strokeWidth={1.75} aria-hidden /> {type.location.replace("_", " ")}
          </span>
        </p>
      </section>

      {state && !state.ok && (
        <p role="alert" className="rounded-lg border border-error-600/30 bg-error-600/10 px-3 py-2 text-sm text-error-600">
          {state.message}
        </p>
      )}

      {!slot ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
          <h2 className="font-semibold">Pick a day</h2>
          {days.length === 0 ? (
            <p className="mt-3 text-gray-600">No times are open right now. Please check back soon, or send us an inquiry.</p>
          ) : (
            <>
              <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Days">
                {days.map((k) => (
                  <button
                    key={k}
                    role="option"
                    aria-selected={k === activeDay}
                    onClick={() => setDay(k)}
                    className={`min-h-14 shrink-0 snap-start rounded-lg border px-3 text-sm font-medium ${
                      k === activeDay ? "border-primary-600 bg-primary-50 text-primary-700" : "border-gray-200 bg-white"
                    }`}
                  >
                    {fmtDay(k, "short")}
                  </button>
                ))}
              </div>
              {activeDay && (
                <>
                  <h2 className="mt-4 font-semibold">{fmtDay(activeDay, "long")}</h2>
                  <p className="text-xs text-gray-600">Times in {tzLabel}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {byDay.get(activeDay)!.map((s) => (
                      <button key={s} onClick={() => setSlot(s)} className="min-h-11 rounded-lg border border-primary-600 bg-white text-sm font-medium text-primary-700 hover:bg-primary-50">
                        {fmtTime(s)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <button onClick={() => setSlot(null)} className="mb-3 flex min-h-11 items-center gap-1 text-sm text-primary-600">
            <ChevronLeft size={16} aria-hidden /> Change time
          </button>
          <p className="mb-4 font-semibold">
            {fmtDay(dayKey(slot, tz), "long")} at {fmtTime(slot)} <span className="font-normal text-gray-600">({tzLabel})</span>
          </p>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="starts_at" value={slot} />
            <input type="hidden" name="guest_time_zone" value={tz} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name *" name="first_name" error={err.first_name}>
                <input id="first_name" name="first_name" required autoComplete="given-name" className={inputClass} />
              </Field>
              <Field label="Last name" name="last_name">
                <input id="last_name" name="last_name" autoComplete="family-name" className={inputClass} />
              </Field>
              <Field label="Email *" name="email" error={err.email}>
                <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className={inputClass} />
              </Field>
              <Field label="Phone" name="phone" error={err.phone}>
                <input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" className={inputClass} />
              </Field>
              <Field label="Partner's name" name="partner_name">
                <input id="partner_name" name="partner_name" className={inputClass} />
              </Field>
              <Field label="Wedding date" name="event_date" error={err.event_date}>
                <input id="event_date" name="event_date" type="date" className={inputClass} />
              </Field>
            </div>
            <Field label="Anything we should know?" name="notes">
              <textarea id="notes" name="notes" rows={3} maxLength={2000} className={`${inputClass} py-2`} />
            </Field>
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <input name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
            </div>
            {consentText && (
              <label className="flex gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                <input type="checkbox" name="sms_consent" className="mt-0.5 size-5 shrink-0" />
                <span>{consentText}</span>
              </label>
            )}
            <div className="cf-turnstile" data-sitekey={siteKey} data-size="flexible" />
            <SubmitButton pendingText="Booking…">Confirm booking</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
