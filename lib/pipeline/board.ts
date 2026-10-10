/** Pure helpers for the pipeline board: grouping cards into stage columns and totals. */

export type Stage = { key: string; name: string; position: number; kind: "open" | "lost" | "cold"; is_won: boolean };

export type Card = {
  id: string;
  contact_id: string;
  stage_key: string;
  status: "open" | "won" | "lost";
  couple_names: string | null;
  contact_name: string;
  partner_name: string | null;
  event_type: string | null;
  first_event_date: string | null;
  venue: string | null;
  city: string | null;
  value_cents: number | null;
  source: string | null;
  assigned_name: string | null;
  stage_changed_at: string;
};

export type Column = { stage: Stage; cards: Card[]; count: number; totalCents: number };

/** Upcoming weddings first; undated cards after, newest movers first. */
export function compareCards(a: Card, b: Card): number {
  if (a.first_event_date && b.first_event_date) return a.first_event_date.localeCompare(b.first_event_date);
  if (a.first_event_date) return -1;
  if (b.first_event_date) return 1;
  return b.stage_changed_at.localeCompare(a.stage_changed_at);
}

export function buildColumns(stages: Stage[], cards: Card[]): Column[] {
  const byStage = new Map<string, Card[]>(stages.map((s) => [s.key, []]));
  for (const card of cards) byStage.get(card.stage_key)?.push(card);
  return [...stages]
    .sort((a, b) => a.position - b.position)
    .map((stage) => {
      const list = (byStage.get(stage.key) ?? []).sort(compareCards);
      return { stage, cards: list, count: list.length, totalCents: list.reduce((sum, c) => sum + (c.value_cents ?? 0), 0) };
    });
}

/** Optimistic move: the card in its new column, as the server will return it. */
export function moveCard(cards: Card[], id: string, stage: Stage, now = new Date()): Card[] {
  return cards.map((c) =>
    c.id === id
      ? {
          ...c,
          stage_key: stage.key,
          status: stage.kind === "lost" ? "lost" : stage.is_won ? "won" : "open",
          stage_changed_at: now.toISOString(),
        }
      : c,
  );
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/** "3d", "5w", "4mo" since the card last moved. */
export function timeInStage(since: string, now = new Date()): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000));
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}
