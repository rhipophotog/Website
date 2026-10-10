/**
 * Template rendering. Bodies are plain text with {{merge_fields}}; HTML is generated from the
 * text (escaped, paragraphs, links), so a template can never inject markup.
 */

export const MERGE_FIELDS = [
  "first_name",
  "partner_name",
  "event_date",
  "venue",
  "booking_link",
  "portfolio_link",
  "review_link",
  "owner_name",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type MergeContext = Partial<Record<MergeField, string | null>>;

/** What a field reads as when we don't know it yet, so sentences still make sense. */
const FALLBACKS: Record<MergeField, string> = {
  first_name: "there",
  partner_name: "your partner",
  event_date: "your wedding",
  venue: "your venue",
  booking_link: "(just reply to this email to set up a call)",
  portfolio_link: "(reply and we'll send our latest galleries)",
  review_link: "(just reply to this email)",
  owner_name: "The RHIPO team",
};

export function render(template: string, ctx: MergeContext): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => {
    if (!(MERGE_FIELDS as readonly string[]).includes(key)) return match;
    const value = ctx[key as MergeField]?.trim();
    return value || FALLBACKS[key as MergeField];
  });
}

/** Merge fields used in a template that aren't in the list (typos like {{firstname}}). */
export function unknownFields(template: string): string[] {
  return [...template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((m) => m[1])
    .filter((k) => !(MERGE_FIELDS as readonly string[]).includes(k));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Plain text → simple, safe HTML email body. */
export function textToHtml(text: string, footerHtml = ""): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => `<a href="${url}" style="color:#1570EF">${url}</a>`)
        .replace(/\n/g, "<br>"),
    )
    .map((p) => `<p style="margin:0 0 16px">${p}</p>`)
    .join("");
  return `<div style="font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#101828;max-width:600px">${paragraphs}${footerHtml}</div>`;
}

/** "Wed, Jun 14, 2027" style date for an ISO calendar date. */
export function formatEventDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function buildMergeContext(input: {
  contact: { first_name?: string | null; partner_name?: string | null };
  opportunity?: { event_dates?: { date: string }[] | null; venue?: string | null; city?: string | null } | null;
  settings: { owner_name?: string | null; booking_link?: string | null; portfolio_link?: string | null; review_link?: string | null };
}): MergeContext {
  const firstDate = [...(input.opportunity?.event_dates ?? [])].map((d) => d.date).sort()[0];
  return {
    first_name: input.contact.first_name,
    partner_name: input.contact.partner_name,
    event_date: formatEventDate(firstDate),
    venue: input.opportunity?.venue ?? input.opportunity?.city ?? null,
    booking_link: input.settings.booking_link,
    portfolio_link: input.settings.portfolio_link,
    review_link: input.settings.review_link,
    owner_name: input.settings.owner_name,
  };
}

/** Strip the quoted history from a reply ("On … wrote:" and ">" lines) for display. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim()) || /^From: .+/.test(line.trim())) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim() || text.trim();
}

/** Very small HTML → text for inbound emails that have no text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Priya Sharma <priya@x.com>" → { name, address } */
export function parseAddress(value: string | null | undefined): { name: string | null; address: string | null } {
  if (!value) return { name: null, address: null };
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, address: m[2].trim().toLowerCase() };
  return { name: null, address: value.trim().toLowerCase() || null };
}
