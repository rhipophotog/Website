"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { parseCsvWithHeader } from "@/lib/contacts/csv";
import {
  applyMapping,
  guessStage,
  IMPORT_FIELDS,
  looksLikeGoHighLevel,
  suggestMapping,
  type ColumnMapping,
  type ImportField,
  type MappedRow,
  type StageMapping,
} from "@/lib/contacts/import-mapping";
import type { RowIssue } from "@/lib/contacts/import-server";
import { finishImport, previewBatch, runImportBatch, startImport, type PreviewRow } from "./actions";

const BATCH = 250;
const MAX_ROWS = 50_000;
const MAX_BYTES = 25 * 1024 * 1024;

type Parsed = { filename: string; headers: string[]; rows: Record<string, string>[]; ghl: boolean };
type Preview = { created: number; existing: number; inFile: number; errors: RowIssue[]; warnings: RowIssue[] };
type Done = { importId: string; created: number; updated: number; skipped: number; errors: RowIssue[]; warnings: RowIssue[] };

type Step = "upload" | "map" | "preview" | "importing" | "done";

export function ImportWizard({ stages }: { stages: { key: string; name: string }[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [stageMapping, setStageMapping] = useState<StageMapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const stageKeys = useMemo(() => stages.map((s) => s.key), [stages]);
  const stageColumn = Object.entries(mapping).find(([, f]) => f === "stage")?.[0];
  const rawStages = useMemo(() => {
    if (!parsed || !stageColumn) return [];
    const counts = new Map<string, number>();
    for (const r of parsed.rows) {
      const v = r[stageColumn]?.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [parsed, stageColumn]);

  const duplicateTargets = useMemo(() => {
    const seen = new Map<ImportField, number>();
    for (const f of Object.values(mapping)) seen.set(f, (seen.get(f) ?? 0) + 1);
    return [...seen.entries()].filter(([, n]) => n > 1).map(([f]) => f);
  }, [mapping]);

  const mappedRows = (): MappedRow[] => parsed!.rows.map((r) => applyMapping(r, mapping));
  const batches = <T,>(items: T[]) => Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) => items.slice(i * BATCH, (i + 1) * BATCH));

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 25 MB. Split it into smaller files.");
    const text = await file.text();
    const result = parseCsvWithHeader(text);
    if (result.headers.length === 0 || result.rows.length === 0) return setError("That file has no rows. Is it a CSV export?");
    if (result.rows.length > MAX_ROWS) return setError(`That file has ${result.rows.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()}.`);
    const suggested = suggestMapping(result.headers);
    setParsed({ filename: file.name, ...result, ghl: looksLikeGoHighLevel(result.headers) });
    setMapping(suggested);
    const stageCol = Object.entries(suggested).find(([, f]) => f === "stage")?.[0];
    if (stageCol) {
      const guesses: StageMapping = {};
      for (const r of result.rows) {
        const v = r[stageCol]?.trim();
        if (v && !(v in guesses)) guesses[v] = guessStage(v, stageKeys);
      }
      setStageMapping(guesses);
    }
    setStep("map");
  }

  function setColumn(header: string, field: string) {
    setMapping((m) => {
      const next = { ...m };
      if (field) next[header] = field as ImportField;
      else delete next[header];
      return next;
    });
    if (field === "stage" && parsed) {
      setStageMapping((current) => {
        const next = { ...current };
        for (const r of parsed.rows) {
          const v = r[header]?.trim();
          if (v && !(v in next)) next[v] = guessStage(v, stageKeys);
        }
        return next;
      });
    }
  }

  async function runPreview() {
    setError(null);
    setStep("preview");
    setPreview(null);
    setProgress(0);
    try {
      const rows = mappedRows();
      const result: Preview = { created: 0, existing: 0, inFile: 0, errors: [], warnings: [] };
      const seen = new Set<string>();
      const parts = batches(rows);
      for (let i = 0; i < parts.length; i++) {
        const res: PreviewRow[] = await previewBatch({ rows: parts[i], stageMapping, startRow: 2 + i * BATCH });
        for (const r of res) {
          for (const w of r.warnings) result.warnings.push({ row: r.row, message: w });
          if (r.status === "error") result.errors.push({ row: r.row, message: r.message ?? "Invalid row" });
          else if (r.keys.some((k) => seen.has(k))) result.inFile++;
          else if (r.status === "existing") result.existing++;
          else result.created++;
          r.keys.forEach((k) => seen.add(k));
        }
        setProgress((i + 1) / parts.length);
      }
      setPreview(result);
    } catch {
      setError("Couldn't check the file. Try again.");
      setStep("map");
    }
  }

  async function runImport() {
    if (!parsed) return;
    setError(null);
    setStep("importing");
    setProgress(0);
    const rows = mappedRows();
    let importId = "";
    const totals: Done = { importId: "", created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };
    try {
      importId = await startImport({ filename: parsed.filename, totalRows: rows.length, mapping: { columns: mapping, stages: stageMapping }, ghl: parsed.ghl });
      totals.importId = importId;
      const parts = batches(rows);
      for (let i = 0; i < parts.length; i++) {
        const res = await runImportBatch({ importId, rows: parts[i], stageMapping, startRow: 2 + i * BATCH });
        totals.created += res.created;
        totals.updated += res.updated + res.mergedInFile;
        totals.skipped += res.skipped;
        totals.errors.push(...res.errors);
        totals.warnings.push(...res.warnings);
        setProgress((i + 1) / parts.length);
      }
      await finishImport({ ...totals, errors: [...totals.errors, ...totals.warnings].sort((a, b) => a.row - b.row) });
      setDone(totals);
      setStep("done");
    } catch {
      if (importId) await finishImport({ ...totals, errors: totals.errors, failed: true }).catch(() => {});
      setError(
        `The import stopped partway (${totals.created} contacts created so far). ${importId ? "Open the import record to review or undo it." : ""}`,
      );
      setDone(totals);
      setStep("done");
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <ol className="flex gap-2 text-xs font-medium text-muted" aria-label="Steps">
        {(["Upload", "Match columns", "Check", "Import"] as const).map((label, i) => {
          const active = ["upload", "map", "preview", "importing"].indexOf(step === "done" ? "importing" : step) >= i;
          return (
            <li key={label} className={`flex-1 border-t-4 pt-1 ${active ? "border-accent text-ink" : "border-line"}`}>
              {label}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {step === "upload" && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Choose a CSV file</h2>
          <p className="mt-1 text-sm text-muted">
            In GoHighLevel: Contacts → select all → Export. Opportunity exports (Opportunities → Export) work too and bring
            pipeline stages with them.
          </p>
          <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper p-6 text-center hover:border-accent">
            <span className="font-medium">Tap to choose a .csv file</span>
            <span className="mt-1 text-xs text-muted">Nothing is saved until the last step</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </section>
      )}

      {step === "map" && parsed && (
        <section className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-4 text-sm">
            <p>
              <strong>{parsed.filename}</strong>: {parsed.rows.length.toLocaleString()} rows, {parsed.headers.length} columns.
              {parsed.ghl && " Looks like a GoHighLevel export, so the columns were matched automatically."}
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="hidden grid-cols-[1fr_1fr_1fr] gap-3 border-b border-line px-4 py-2 text-xs font-semibold text-muted sm:grid">
              <span>CSV column</span>
              <span>Example</span>
              <span>Import as</span>
            </div>
            {parsed.headers.map((header) => {
              const sample = parsed.rows.find((r) => r[header])?.[header] ?? "";
              const field = mapping[header] ?? "";
              return (
                <div key={header} className="grid gap-1 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1fr_1fr_1fr] sm:items-center sm:gap-3">
                  <span className="font-medium">{header || <em className="text-muted">(blank header)</em>}</span>
                  <span className="truncate text-sm text-muted">{sample || "—"}</span>
                  <select
                    aria-label={`Import ${header} as`}
                    value={field}
                    onChange={(e) => setColumn(header, e.target.value)}
                    className={`min-h-11 rounded-lg border bg-paper px-2 ${duplicateTargets.includes(field as ImportField) ? "border-danger" : "border-line"}`}
                  >
                    <option value="">Don&apos;t import</option>
                    {(["Contact", "Opportunity"] as const).map((group) => (
                      <optgroup key={group} label={group}>
                        {IMPORT_FIELDS.filter((f) => f.group === group).map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {rawStages.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 font-semibold">Match pipeline stages</h2>
              {rawStages.map(([raw, count]) => (
                <div key={raw} className="grid gap-1 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-2 sm:items-center">
                  <span>
                    {raw} <span className="text-xs text-muted">({count})</span>
                  </span>
                  <select
                    aria-label={`Stage for ${raw}`}
                    value={stageMapping[raw] ?? "new_inquiry"}
                    onChange={(e) => setStageMapping((m) => ({ ...m, [raw]: e.target.value }))}
                    className="min-h-11 rounded-lg border border-line bg-paper px-2"
                  >
                    {stages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                    <option value="">Don&apos;t add to pipeline</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          {duplicateTargets.length > 0 && (
            <p role="alert" className="text-sm text-danger">
              Each field can only come from one column: {duplicateTargets.map((f) => IMPORT_FIELDS.find((x) => x.key === f)?.label).join(", ")}.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={runPreview}
              disabled={duplicateTargets.length > 0 || Object.keys(mapping).length === 0}
              className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink disabled:opacity-50"
            >
              Check {parsed.rows.length.toLocaleString()} rows
            </button>
            <button onClick={() => setStep("upload")} className="min-h-11 px-3 text-sm text-muted underline">
              Choose another file
            </button>
          </div>
        </section>
      )}

      {step === "preview" && (
        <section className="space-y-4">
          {!preview ? (
            <ProgressBar value={progress} label="Checking rows…" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="New contacts" value={preview.created} />
                <Stat label="Already in contacts (blanks filled, tags added)" value={preview.existing} />
                <Stat label="Repeated in this file (combined)" value={preview.inFile} />
                <Stat label="Will be skipped" value={preview.errors.length} tone={preview.errors.length ? "danger" : undefined} />
              </div>
              <p className="text-sm text-muted">
                Existing contacts are never overwritten. Imported contacts get <strong>no SMS consent</strong>; texts only
                go to people who opt in again or text you first.
              </p>
              <IssueList title="Skipped rows" issues={preview.errors} />
              <IssueList title="Warnings (row still imported)" issues={preview.warnings} />
              <div className="flex flex-wrap gap-3">
                <button onClick={runImport} disabled={preview.created + preview.existing + preview.inFile === 0} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink disabled:opacity-50">
                  Import now
                </button>
                <button onClick={() => setStep("map")} className="min-h-11 px-3 text-sm text-muted underline">
                  Back to columns
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === "importing" && <ProgressBar value={progress} label="Importing… keep this page open." />}

      {step === "done" && done && (
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Created" value={done.created} />
            <Stat label="Updated" value={done.updated} />
            <Stat label="Skipped" value={done.skipped} tone={done.skipped ? "danger" : undefined} />
          </div>
          <IssueList title="Skipped rows" issues={done.errors} />
          <div className="flex flex-wrap gap-3">
            <Link href="/contacts" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-accent-ink">
              View contacts
            </Link>
            {done.importId && (
              <Link href={`/contacts/imports/${done.importId}`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium">
                Import record (review or undo)
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className={`text-2xl font-semibold ${tone === "danger" ? "text-danger" : ""}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="mb-2 text-sm">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function IssueList({ title, issues }: { title: string; issues: RowIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <details className="rounded-xl border border-line bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        {title} ({issues.length.toLocaleString()})
      </summary>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {issues.slice(0, 200).map((issue, i) => (
          <li key={i}>
            <span className="text-muted">Row {issue.row}:</span> {issue.message}
          </li>
        ))}
        {issues.length > 200 && <li className="text-muted">…and {issues.length - 200} more</li>}
      </ul>
    </details>
  );
}
