"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const inputClass =
  "w-full min-h-11 rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-accent aria-[invalid=true]:border-danger";

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block" htmlFor={name}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-accent text-accent-ink",
    secondary: "border border-line bg-surface text-ink",
    danger: "bg-danger text-white",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`min-h-11 rounded-lg px-4 font-medium disabled:opacity-60 ${styles}`}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
      {state.message}
    </p>
  );
}
