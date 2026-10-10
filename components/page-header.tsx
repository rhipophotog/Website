import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ComingSoon({ milestone, children }: { milestone: number; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-sm text-muted">
      <p className="font-medium text-ink">Coming in milestone {milestone}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
