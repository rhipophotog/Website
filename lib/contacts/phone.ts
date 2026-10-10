import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const DEFAULT_PHONE_COUNTRY: CountryCode = "US";

/**
 * Normalise any human-entered phone number to E.164 ("+14155550123").
 * Numbers without a country code are read as US numbers; "+91 98765 43210" stays Indian.
 * Returns null when it isn't a real, dialable number.
 */
export function toE164(input: string | null | undefined, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // "0091..." and "011 91..." international prefixes → "+91..."
  const cleaned = trimmed.replace(/^(00|011)\s*(?=[1-9])/, "+");
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** "+14155550123" → "(415) 555-0123"; international numbers keep their country code. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === DEFAULT_PHONE_COUNTRY ? parsed.formatNational() : parsed.formatInternational();
}
