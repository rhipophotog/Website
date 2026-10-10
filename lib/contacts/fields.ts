/** Shared contact vocabulary (SPEC §3, §4). Keys match the database check constraints. */

export const SOURCES = [
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "meta_ads", label: "Meta Ads" },
  { key: "google_ads", label: "Google Ads" },
  { key: "referral", label: "Referral" },
  { key: "weddingwire_knot", label: "WeddingWire / The Knot" },
  { key: "vendor", label: "Vendor" },
  { key: "other", label: "Other" },
] as const;
export type SourceKey = (typeof SOURCES)[number]["key"];
export const SOURCE_KEYS = SOURCES.map((s) => s.key) as [SourceKey, ...SourceKey[]];
export const sourceLabel = (key: string | null | undefined) => SOURCES.find((s) => s.key === key)?.label ?? "—";

export const EVENT_TYPES = [
  { key: "hindu", label: "Hindu" },
  { key: "sikh", label: "Sikh" },
  { key: "muslim", label: "Muslim" },
  { key: "jain", label: "Jain" },
  { key: "fusion", label: "Fusion" },
  { key: "other", label: "Other" },
] as const;
export type EventTypeKey = (typeof EVENT_TYPES)[number]["key"];
export const EVENT_TYPE_KEYS = EVENT_TYPES.map((s) => s.key) as [EventTypeKey, ...EventTypeKey[]];

export const PREFERRED_CONTACT = [
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp (later)" },
] as const;

export const LOST_REASONS = [
  { key: "price", label: "Price" },
  { key: "date_taken", label: "Date taken" },
  { key: "went_with_other", label: "Went with another studio" },
  { key: "no_response", label: "No response" },
  { key: "other", label: "Other" },
] as const;
export type LostReasonKey = (typeof LOST_REASONS)[number]["key"];

export const CONSENT_SOURCES = [
  { key: "verbal", label: "Told us in person / on a call" },
  { key: "texted_first", label: "They texted us first" },
  { key: "website_form", label: "Website form checkbox" },
  { key: "written", label: "Written / email" },
  { key: "other", label: "Other" },
] as const;

/** Fields the merge screen lets you pick between. Must match merge_contacts() in SQL. */
export const MERGEABLE_FIELDS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "partner_name", label: "Partner" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "preferred_contact", label: "Preferred contact" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "language", label: "Language" },
  { key: "time_zone", label: "Time zone" },
  { key: "source", label: "Source" },
  { key: "referral_by", label: "Referred by" },
] as const;
export type MergeableField = (typeof MERGEABLE_FIELDS)[number]["key"];

export function displayName(c: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || c.email || c.phone || "Unnamed contact";
}
