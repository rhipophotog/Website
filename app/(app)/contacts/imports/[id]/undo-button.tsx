"use client";

import { useState, useTransition } from "react";
import { undoImport } from "../../import/actions";

export function UndoImportButton({ importId, count }: { importId: string; count: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete ${count} imported contacts? This can't be undone.`)) return;
          setError(null);
          start(async () => {
            try {
              await undoImport(importId);
            } catch {
              setError("Couldn't undo the import.");
            }
          });
        }}
        className="min-h-11 rounded-lg bg-danger px-4 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Undoing…" : `Delete ${count} imported contacts`}
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
