"use client";

import { useState } from "react";

export function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="min-h-9 px-2 text-xs font-medium text-accent"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <pre className="overflow-x-auto rounded-lg bg-paper p-3 text-xs">{value}</pre>
      ) : (
        <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-paper p-3 text-xs">{value}</code>
      )}
    </div>
  );
}
