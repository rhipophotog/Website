import Link from "next/link";
import { stageColor } from "@/lib/brand";
import type { ComponentProps, ReactNode } from "react";

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-card md:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "danger" }) {
  const styles = { neutral: "bg-gray-50 text-gray-900 ring-1 ring-gray-200", accent: "bg-primary-50 text-primary-700", danger: "bg-error-600/10 text-error-600" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

export function ButtonLink({ variant = "secondary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }) {
  const styles = variant === "primary" ? "bg-accent text-accent-ink" : "border border-line bg-surface text-ink";
  return <Link {...props} className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium ${styles} ${className}`} />;
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <p
      role="status"
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-line bg-surface"}`}
    >
      {children}
    </p>
  );
}

/** Stage chip: coloured dot + name (BRAND.md stage colours; never colour alone). */
export function StageChip({ stageKey, name }: { stageKey: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-900 ring-1 ring-gray-200">
      <span aria-hidden className="size-2 rounded-full" style={{ background: stageColor(stageKey) }} />
      {name}
    </span>
  );
}
