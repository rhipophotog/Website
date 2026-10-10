import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 md:p-5 ${className}`}>
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
  const styles = { neutral: "bg-line/70 text-ink", accent: "bg-accent/15 text-accent", danger: "bg-danger/10 text-danger" }[tone];
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
