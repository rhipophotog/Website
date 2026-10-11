/**
 * Brand constants (BRAND.md). The product name isn't final: use APP_NAME everywhere,
 * never a hard-coded string, so a rename is a one-line change.
 */
export const APP_NAME = "RHIPO Studio";
export const STUDIO_NAME = "RHIPO Photography & Cinematography";
/** Public contact for the privacy policy and terms. */
export const STUDIO_CONTACT_EMAIL = "rhipo.photog@gmail.com";

export const BRAND_COLORS = {
  primary600: "#1570EF",
  primary700: "#175CD3",
  primary50: "#EFF8FF",
  accentYellow: "#FDB022",
  accentGreen: "#32D583",
  gray900: "#101828",
  gray600: "#475467",
  gray200: "#E4E7EC",
  gray50: "#F9FAFB",
} as const;

/** Pipeline stage colours (BRAND.md §2): column header dots and chips. Always shown next to the stage name. */
export const STAGE_COLORS: Record<string, string> = {
  new_inquiry: "#1570EF",
  contacted: "#7A5AF8",
  consult_scheduled: "#06AED4",
  consult_done: "#0BA5EC",
  proposal_sent: "#F79009",
  booked: "#12B76A",
  pre_event: "#16B364",
  event_done: "#2E90FA",
  delivered: "#667085",
  lost: "#D92D20",
  cold: "#98A2B3",
};

export const stageColor = (key: string) => STAGE_COLORS[key] ?? "#98A2B3";
