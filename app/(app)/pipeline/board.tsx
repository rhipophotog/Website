"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { LOST_REASONS, sourceLabel } from "@/lib/contacts/fields";
import { buildColumns, formatMoney, moveCard, timeInStage, type Card, type Stage } from "@/lib/pipeline/board";
import { moveOpportunity } from "./actions";

type PendingLost = { card: Card; stage: Stage };

export function Board({ stages, cards }: { stages: Stage[]; cards: Card[] }) {
  const [optimisticCards, applyMove] = useOptimistic(cards, (state: Card[], move: { id: string; stage: Stage }) =>
    moveCard(state, move.id, move.stage),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<PendingLost | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [showSide, setShowSide] = useState(false);

  const columns = buildColumns(stages, optimisticCards);
  const main = columns.filter((c) => c.stage.kind === "open");
  const side = columns.filter((c) => c.stage.kind !== "open");
  const stageByKey = new Map(stages.map((s) => [s.key, s]));

  function requestMove(card: Card, stageKey: string) {
    const stage = stageByKey.get(stageKey);
    if (!stage || stage.key === card.stage_key) return;
    if (stage.kind === "lost") {
      setPendingLost({ card, stage });
      return;
    }
    commit(card, stage, null);
  }

  function commit(card: Card, stage: Stage, lostReason: string | null) {
    setError(null);
    startTransition(async () => {
      applyMove({ id: card.id, stage });
      const result = await moveOpportunity({ id: card.id, stage_key: stage.key, lost_reason: lostReason });
      if (!result.ok) setError(result.error);
    });
  }

  const renderColumn = (col: (typeof columns)[number]) => (
    <section
      key={col.stage.key}
      aria-label={col.stage.name}
      data-stage={col.stage.key}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        setDropTarget(col.stage.key);
      }}
      onDragLeave={() => setDropTarget((t) => (t === col.stage.key ? null : t))}
      onDrop={(e) => {
        e.preventDefault();
        const card = optimisticCards.find((c) => c.id === e.dataTransfer.getData("text/plain"));
        setDropTarget(null);
        setDragging(null);
        if (card) requestMove(card, col.stage.key);
      }}
      className={`flex max-h-[calc(100dvh-14rem)] w-[85vw] max-w-72 shrink-0 snap-start flex-col rounded-xl border bg-surface sm:w-72 ${
        dropTarget === col.stage.key ? "border-accent ring-2 ring-accent/30" : "border-line"
      }`}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-sm font-semibold">
          {col.stage.kind === "open" && <span className="mr-1.5 text-muted">{col.stage.position}</span>}
          {col.stage.name} <span className="font-normal text-muted">({col.count})</span>
        </h2>
        {col.totalCents > 0 && <span className="text-xs text-muted">{formatMoney(col.totalCents)}</span>}
      </header>
      <ul className="flex-1 space-y-2 overflow-y-auto p-2">
        {col.cards.length === 0 && <li className="py-6 text-center text-xs text-muted">Empty</li>}
        {col.cards.map((card) => (
          <li
            key={card.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", card.id);
              e.dataTransfer.effectAllowed = "move";
              setDragging(card.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            className={`rounded-lg border border-line bg-paper p-3 text-sm shadow-sm md:cursor-grab ${dragging === card.id ? "opacity-50" : ""}`}
          >
            <Link href={`/pipeline/${card.id}`} className="block font-medium hover:underline">
              {card.couple_names ?? [card.contact_name, card.partner_name].filter(Boolean).join(" & ")}
            </Link>
            <p className="mt-1 text-xs text-muted">
              {[
                card.first_event_date && new Date(`${card.first_event_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
                card.venue ?? card.city,
                card.value_cents != null && formatMoney(card.value_cents),
              ]
                .filter(Boolean)
                .join(" · ") || "No event details yet"}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-muted">
                {[card.source && sourceLabel(card.source), card.assigned_name, `${timeInStage(card.stage_changed_at)} here`].filter(Boolean).join(" · ")}
              </span>
              <select
                aria-label={`Move ${card.couple_names ?? card.contact_name} to`}
                value=""
                onChange={(e) => requestMove(card, e.target.value)}
                className="min-h-9 max-w-28 shrink-0 rounded-md border border-line bg-surface px-1 text-xs"
              >
                <option value="">Move to…</option>
                {stages
                  .filter((s) => s.key !== card.stage_key)
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        {main.map(renderColumn)}
        {showSide ? (
          side.map(renderColumn)
        ) : (
          <button
            onClick={() => setShowSide(true)}
            className="flex w-28 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-surface p-3 text-sm text-muted"
          >
            {side.map((c) => (
              <span key={c.stage.key}>
                {c.stage.name} ({c.count})
              </span>
            ))}
            <span className="text-xs underline">Show</span>
          </button>
        )}
      </div>

      {pendingLost && (
        <LostDialog
          name={pendingLost.card.couple_names ?? pendingLost.card.contact_name}
          onCancel={() => setPendingLost(null)}
          onConfirm={(reason) => {
            commit(pendingLost.card, pendingLost.stage, reason);
            setPendingLost(null);
          }}
        />
      )}
    </>
  );
}

function LostDialog({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState<string>("");
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lost-title" className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="lost-title" className="font-semibold">
          Why was {name} lost?
        </h2>
        <fieldset className="mt-3 space-y-1">
          <legend className="sr-only">Lost reason</legend>
          {LOST_REASONS.map((r) => (
            <label key={r.key} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="lost_reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="size-5" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="min-h-11 px-4 text-sm text-muted">
            Cancel
          </button>
          <button disabled={!reason} onClick={() => onConfirm(reason)} className="min-h-11 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50">
            Mark lost
          </button>
        </div>
      </div>
    </div>
  );
}
