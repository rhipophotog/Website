import { z } from "zod";
import type { LostReasonKey, SourceKey } from "./fields";
import { toE164 } from "./phone";

/**
 * CSV import: which app field each CSV column feeds, GoHighLevel header auto-detection,
 * and turning one mapped row into a clean contact (+ optional opportunity).
 * Pure functions only, so the browser preview and the server import agree exactly.
 */

export const IMPORT_FIELDS = [
  { key: "ghl_contact_id", label: "GoHighLevel contact ID", group: "Contact" },
  { key: "full_name", label: "Full name", group: "Contact" },
  { key: "first_name", label: "First name", group: "Contact" },
  { key: "last_name", label: "Last name", group: "Contact" },
  { key: "partner_name", label: "Partner name", group: "Contact" },
  { key: "email", label: "Email", group: "Contact" },
  { key: "phone", label: "Phone", group: "Contact" },
  { key: "city", label: "City", group: "Contact" },
  { key: "state", label: "State", group: "Contact" },
  { key: "country", label: "Country", group: "Contact" },
  { key: "language", label: "Language", group: "Contact" },
  { key: "source", label: "Source", group: "Contact" },
  { key: "referral_by", label: "Referred by", group: "Contact" },
  { key: "tags", label: "Tags (comma-separated)", group: "Contact" },
  { key: "dnd", label: "DND (do not disturb)", group: "Contact" },
  { key: "dnd_sms", label: "DND: SMS", group: "Contact" },
  { key: "dnd_email", label: "DND: email", group: "Contact" },
  { key: "created_at", label: "Date created", group: "Contact" },
  { key: "notes", label: "Notes (saved as an internal note)", group: "Contact" },
  { key: "ghl_opportunity_id", label: "GoHighLevel opportunity ID", group: "Opportunity" },
  { key: "opportunity_name", label: "Opportunity / couple name", group: "Opportunity" },
  { key: "stage", label: "Pipeline stage", group: "Opportunity" },
  { key: "status", label: "Opportunity status (open/won/lost)", group: "Opportunity" },
  { key: "lost_reason", label: "Lost reason", group: "Opportunity" },
  { key: "event_date", label: "Wedding / event date", group: "Opportunity" },
  { key: "venue", label: "Venue", group: "Opportunity" },
  { key: "value", label: "Opportunity value ($)", group: "Opportunity" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export const IMPORT_FIELD_KEYS = IMPORT_FIELDS.map((f) => f.key) as [ImportField, ...ImportField[]];

/** column header → field it feeds (absent = ignored) */
export type ColumnMapping = Record<string, ImportField>;
/** a CSV row after mapping: field → raw text */
export type MappedRow = Partial<Record<ImportField, string>>;
/** raw stage text from the CSV → our stage key, or "" to skip creating an opportunity */
export type StageMapping = Record<string, string>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** GoHighLevel contact + opportunity export headers (and common variants), normalised. */
const HEADER_ALIASES: Record<string, ImportField> = {
  contactid: "ghl_contact_id",
  name: "full_name",
  fullname: "full_name",
  contactname: "full_name",
  firstname: "first_name",
  lastname: "last_name",
  partnername: "partner_name",
  partner: "partner_name",
  fiancename: "partner_name",
  fianceename: "partner_name",
  spousename: "partner_name",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  mobilephone: "phone",
  cell: "phone",
  city: "city",
  state: "state",
  province: "state",
  country: "country",
  language: "language",
  source: "source",
  leadsource: "source",
  contactsource: "source",
  referredby: "referral_by",
  referral: "referral_by",
  tags: "tags",
  tag: "tags",
  dnd: "dnd",
  donotdisturb: "dnd",
  dndsms: "dnd_sms",
  smsdnd: "dnd_sms",
  dndemail: "dnd_email",
  emaildnd: "dnd_email",
  created: "created_at",
  createdon: "created_at",
  datecreated: "created_at",
  dateadded: "created_at",
  createdat: "created_at",
  notes: "notes",
  note: "notes",
  opportunityid: "ghl_opportunity_id",
  opportunityname: "opportunity_name",
  stage: "stage",
  pipelinestage: "stage",
  stagename: "stage",
  status: "status",
  opportunitystatus: "status",
  lostreason: "lost_reason",
  lostreasonname: "lost_reason",
  eventdate: "event_date",
  weddingdate: "event_date",
  dateofwedding: "event_date",
  venue: "venue",
  weddingvenue: "venue",
  eventvenue: "venue",
  leadvalue: "value",
  opportunityvalue: "value",
  monetaryvalue: "value",
  value: "value",
};

/** Suggest a mapping for the given headers. Each field is used at most once (first column wins). */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ImportField>();
  for (const header of headers) {
    const field = HEADER_ALIASES[norm(header)];
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    }
  }
  return mapping;
}

/** True when the header row looks like a GoHighLevel export. */
export function looksLikeGoHighLevel(headers: string[]): boolean {
  const n = new Set(headers.map(norm));
  return n.has("contactid") || (n.has("opportunityname") && n.has("pipelinestage"));
}

export function applyMapping(row: Record<string, string>, mapping: ColumnMapping): MappedRow {
  const out: MappedRow = {};
  for (const [header, field] of Object.entries(mapping)) {
    const value = row[header]?.trim();
    if (value) out[field] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

const SOURCE_ALIASES: [RegExp, SourceKey][] = [
  [/wedding\s*wire|the\s*knot|\bknot\b/i, "weddingwire_knot"],
  [/insta|\big\b/i, "instagram"],
  [/facebook|\bfb\b|\bmeta\b/i, "meta_ads"],
  [/google|adwords|\bppc\b/i, "google_ads"],
  [/refer|word of mouth|friend/i, "referral"],
  [/vendor|planner|venue|coordinator|decor/i, "vendor"],
  [/web|site|form|contact us|organic|seo/i, "website"],
];

export function parseSource(value: string | undefined): SourceKey | null {
  if (!value?.trim()) return null;
  if (/^(website|instagram|meta_ads|google_ads|referral|weddingwire_knot|vendor|other)$/.test(value)) {
    return value as SourceKey;
  }
  return SOURCE_ALIASES.find(([re]) => re.test(value))?.[1] ?? "other";
}

const TRUTHY = /^(true|yes|y|1|x|on|dnd|all|enabled)$/i;

/** GoHighLevel's DND column is "true"/"false" or a list of channels ("SMS, Email"). */
export function parseDnd(row: MappedRow): { dnd_sms: boolean; dnd_email: boolean } {
  let sms = TRUTHY.test(row.dnd_sms ?? "");
  let email = TRUTHY.test(row.dnd_email ?? "");
  const all = row.dnd?.trim() ?? "";
  if (all) {
    if (TRUTHY.test(all)) {
      sms = true;
      email = true;
    } else {
      if (/sms|text|call|phone/i.test(all)) sms = true;
      if (/email/i.test(all)) email = true;
    }
  }
  return { dnd_sms: sms, dnd_email: email };
}

export function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(/[,;|]/)) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

/** "$4,500.00" → 450000 (cents). */
export function parseMoneyCents(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Calendar date as YYYY-MM-DD. Accepts ISO dates/timestamps, US-style 6/14/2027 and
 * written dates ("June 14, 2027"). Ambiguous numeric dates are read month-first (US).
 */
export function parseDate(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
  const us = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return validDate(year, +us[1], +us[2]);
  }
  const parsed = Date.parse(v);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  return validDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // e.g. Feb 30
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A timestamp for created_at, or null. */
export function parseTimestamp(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    const date = parseDate(value);
    return date ? `${date}T00:00:00.000Z` : null;
  }
  return new Date(parsed).toISOString();
}

export function parseLostReason(value: string | undefined): LostReasonKey {
  const v = value?.toLowerCase() ?? "";
  if (/price|budget|expens|cost|afford/.test(v)) return "price";
  if (/date|booked|unavailable|taken/.test(v)) return "date_taken";
  if (/other (studio|photographer|vendor)|went with|competitor|chose/.test(v)) return "went_with_other";
  if (/no (response|reply)|ghost|unresponsive|never heard/.test(v)) return "no_response";
  return "other";
}

export function parseStatus(value: string | undefined): "open" | "won" | "lost" | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (/^(won|booked|closed won)$/.test(v)) return "won";
  if (/^(lost|abandoned|closed lost|dead)$/.test(v)) return "lost";
  if (/^(open|active|new)$/.test(v)) return "open";
  return null;
}

/** "Priya Sharma" → ["Priya", "Sharma"]; "Priya & Rohan" style names keep everything as first name. */
export function splitFullName(full: string): { first: string | null; last: string | null } {
  const name = full.trim().replace(/\s+/g, " ");
  if (!name) return { first: null, last: null };
  if (/[&+]| and /i.test(name)) return { first: name, last: null };
  const parts = name.split(" ");
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? null };
}

// ---------------------------------------------------------------------------
// Stage guessing
// ---------------------------------------------------------------------------

const STAGE_GUESSES: [RegExp, string][] = [
  [/lost|abandon|\bdead\b|declin/i, "lost"],
  [/cold|nurture|unresponsive|no response/i, "cold"],
  [/deliver|complete|gallery sent|closed won/i, "delivered"],
  [/event done|\bshot\b|post.?production|editing/i, "event_done"],
  [/pre.?event|upcoming|planning/i, "pre_event"],
  [/booked|\bwon\b|signed|retainer|deposit|contract/i, "booked"],
  [/proposal|quote|pricing|estimate|invoice sent/i, "proposal_sent"],
  [/consult.*(done|complete|held)|\bmet\b|call done/i, "consult_done"],
  [/consult|\bcall\b|meeting|appointment|scheduled/i, "consult_scheduled"],
  [/contacted|replied|responded|engaged|follow/i, "contacted"],
  [/\bnew\b|inquir|enquir|\blead\b|\bform\b/i, "new_inquiry"],
];

export function guessStage(raw: string, stageKeys: readonly string[]): string {
  const v = raw.trim();
  const direct = stageKeys.find((k) => k === norm(v) || k === v.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  if (direct) return direct;
  const guess = STAGE_GUESSES.find(([re]) => re.test(v))?.[1];
  return guess && stageKeys.includes(guess) ? guess : "new_inquiry";
}

// ---------------------------------------------------------------------------
// Row normalisation
// ---------------------------------------------------------------------------

const emailSchema = z.email();

export type NormalizedContact = {
  ghl_contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  partner_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  language: string | null;
  source: SourceKey | null;
  referral_by: string | null;
  dnd_sms: boolean;
  dnd_email: boolean;
  created_at: string | null;
};

export type NormalizedOpportunity = {
  ghl_opportunity_id: string | null;
  couple_names: string | null;
  stage_key: string;
  status: "open" | "won" | "lost";
  lost_reason: LostReasonKey | null;
  event_dates: { name: string; date: string }[];
  venue: string | null;
  value_cents: number | null;
};

export type NormalizedRow = {
  contact: NormalizedContact;
  tags: string[];
  note: string | null;
  opportunity: NormalizedOpportunity | null;
  warnings: string[];
};

export type NormalizeResult = { ok: true; row: NormalizedRow } | { ok: false; error: string };

const text = (v: string | undefined, max = 200) => (v?.trim() ? v.trim().slice(0, max) : null);

export function normalizeRow(row: MappedRow, stageMapping: StageMapping = {}): NormalizeResult {
  const warnings: string[] = [];

  let first = text(row.first_name, 100);
  let last = text(row.last_name, 100);
  if (!first && !last && row.full_name) {
    const split = splitFullName(row.full_name);
    first = split.first;
    last = split.last;
  }

  let email: string | null = null;
  if (row.email) {
    const candidate = row.email.trim().toLowerCase();
    if (emailSchema.safeParse(candidate).success) email = candidate;
    else warnings.push(`Email "${row.email}" isn't valid and was left out`);
  }

  let phone: string | null = null;
  if (row.phone) {
    phone = toE164(row.phone);
    if (!phone) warnings.push(`Phone "${row.phone}" isn't a valid number and was left out`);
  }

  if (!first && !last && !email && !phone) {
    return { ok: false, error: "No name, email or phone" };
  }

  const dnd = parseDnd(row);

  let opportunity: NormalizedOpportunity | null = null;
  const hasOpportunityData = Boolean(
    row.stage || row.ghl_opportunity_id || row.opportunity_name || row.event_date || row.venue || row.value,
  );
  if (hasOpportunityData) {
    const stageKey = row.stage ? (stageMapping[row.stage.trim()] ?? "new_inquiry") : "new_inquiry";
    if (stageKey) {
      let status = parseStatus(row.status) ?? (stageKey === "lost" ? "lost" : "open");
      if (stageKey === "lost") status = "lost";
      const eventDate = parseDate(row.event_date);
      if (row.event_date && !eventDate) warnings.push(`Event date "${row.event_date}" wasn't understood and was left out`);
      opportunity = {
        ghl_opportunity_id: text(row.ghl_opportunity_id, 100),
        couple_names: text(row.opportunity_name),
        stage_key: stageKey,
        status,
        lost_reason: status === "lost" ? parseLostReason(row.lost_reason) : null,
        event_dates: eventDate ? [{ name: "Wedding", date: eventDate }] : [],
        venue: text(row.venue),
        value_cents: parseMoneyCents(row.value),
      };
    }
  }

  return {
    ok: true,
    row: {
      contact: {
        ghl_contact_id: text(row.ghl_contact_id, 100),
        first_name: first,
        last_name: last,
        partner_name: text(row.partner_name, 100),
        email,
        phone,
        city: text(row.city, 100),
        state: text(row.state, 100),
        country: text(row.country, 100),
        language: text(row.language, 50),
        source: parseSource(row.source),
        referral_by: text(row.referral_by),
        dnd_sms: dnd.dnd_sms,
        dnd_email: dnd.dnd_email,
        created_at: parseTimestamp(row.created_at),
      },
      tags: parseTags(row.tags),
      note: text(row.notes, 5000),
      opportunity,
      warnings,
    },
  };
}
