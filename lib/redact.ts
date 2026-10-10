/** Mask a phone number for logs: "+14155550123" -> "+1••••••0123". */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length <= 4) return "•".repeat(digits.length);
  const prefix = digits.startsWith("+") ? digits.slice(0, 2) : "";
  const last4 = digits.slice(-4);
  return `${prefix}${"•".repeat(Math.max(digits.length - prefix.length - 4, 0))}${last4}`;
}

/** Mask an email for logs: "priya@example.com" -> "p••••@example.com". */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}${"•".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
