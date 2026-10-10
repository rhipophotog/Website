"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { FormMessage, inputClass, SubmitButton } from "@/components/form";
import { useBrowserTimeZone } from "@/lib/calendar/use-time-zone";
import type { ManageState } from "./actions";

type Props = {
  typeName: string;
  startsAt: string;
  status: string;
  location: string | null;
  changeable: boolean;
  slots: string[];
  cancel: (state: ManageState, formData: FormData) => Promise<ManageState>;
  reschedule: (startsAt: string) => Promise<ManageState>;
};

export function ManageBooking({ typeName, startsAt, status, location, changeable, slots, cancel, reschedule }: Props) {
  const tz = useBrowserTimeZone("America/Los_Angeles");
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">("view");
  const [cancelState, cancelAction] = useActionState<ManageState, FormData>(cancel, null);
  const [moveState, setMoveState] = useState<ManageState>(null);
  const [pending, start] = useTransition();

  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(new Date(iso));
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const k = fmt(s, { weekday: "short", month: "short", day: "numeric" });
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, tz]);

  if (cancelState?.ok || moveState?.ok) {
    return (
      <section role="status" className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-card">
        <p className="text-lg font-semibold">{(cancelState?.ok ? cancelState : moveState)!.message}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Your {typeName}</h1>
        <p className="mt-1 text-gray-600">
          {fmt(startsAt, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
          {status === "cancelled" && " · Cancelled"}
        </p>
        {location && status !== "cancelled" && <p className="mt-1 text-sm text-gray-600">{location}</p>}
      </div>

      {!changeable ? (
        <p className="text-sm text-gray-600">This booking can no longer be changed online. Reply to your confirmation email if you need help.</p>
      ) : mode === "view" ? (
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setMode("reschedule")} className="min-h-11 rounded-lg bg-primary-600 px-4 font-medium text-white">
            Reschedule
          </button>
          <button onClick={() => setMode("cancel")} className="min-h-11 rounded-lg border border-gray-200 px-4 font-medium">
            Cancel booking
          </button>
        </div>
      ) : mode === "cancel" ? (
        <form action={cancelAction} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="reason">
            Mind telling us why? (optional)
          </label>
          <textarea id="reason" name="reason" rows={2} maxLength={500} className={`${inputClass} py-2`} />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton variant="danger" pendingText="Cancelling…">
              Cancel my booking
            </SubmitButton>
            <button type="button" onClick={() => setMode("view")} className="min-h-11 px-2 text-sm text-gray-600 underline">
              Keep it
            </button>
          </div>
          <FormMessage state={cancelState} />
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Pick a new time ({tz.replace(/_/g, " ")}):</p>
          {byDay.size === 0 && <p className="text-sm text-gray-600">No other times are open right now.</p>}
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {[...byDay.entries()].map(([dayLabel, list]) => (
              <div key={dayLabel}>
                <p className="mb-1 text-sm font-semibold">{dayLabel}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {list.map((s) => (
                    <button
                      key={s}
                      disabled={pending}
                      onClick={() => start(async () => setMoveState(await reschedule(s)))}
                      className="min-h-11 rounded-lg border border-primary-600 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                    >
                      {fmt(s, { hour: "numeric", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <FormMessage state={moveState} />
          <button onClick={() => setMode("view")} className="min-h-11 text-sm text-gray-600 underline">
            Back
          </button>
        </div>
      )}
    </section>
  );
}
