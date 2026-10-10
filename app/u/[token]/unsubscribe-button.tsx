"use client";

import { useState, useTransition } from "react";
import { unsubscribe } from "./actions";

export function UnsubscribeButton({ token }: { token: string }) {
  const [done, setDone] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  if (done) return <p className="mt-3 text-muted">You&apos;re unsubscribed from RHIPO marketing emails. We&apos;ll still reply if you write to us.</p>;
  return (
    <>
      <p className="mt-3 text-muted">Stop receiving marketing emails from RHIPO Photography &amp; Cinematography?</p>
      <button
        disabled={pending}
        onClick={() => start(async () => setDone((await unsubscribe(token)).ok))}
        className="mt-5 min-h-11 w-full rounded-lg bg-ink px-4 font-medium text-paper disabled:opacity-60"
      >
        {pending ? "One moment…" : "Unsubscribe"}
      </button>
      {done === false && <p role="alert" className="mt-3 text-sm text-danger">Something went wrong. Please reply to any of our emails instead.</p>}
    </>
  );
}
