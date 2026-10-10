/** Routes that work without signing in. Everything else requires a studio member. */
const PUBLIC_PREFIXES = [
  "/login",
  "/auth/",
  "/book", // public booking pages and manage links (milestone 7)
  "/f/", // hosted inquiry forms (milestone 4)
  "/api/webhooks/", // provider webhooks verify their own signatures
  "/u/", // signed unsubscribe links
];

const PUBLIC_FILES = ["/manifest.webmanifest", "/icon.png", "/apple-icon.png", "/favicon.ico", "/robots.txt", "/embed.js"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_FILES.includes(pathname)) return true;
  if (pathname.startsWith("/brand/")) return true;
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Only allow redirects back into this app after login. Rejects absolute URLs,
 * protocol-relative URLs ("//evil.com") and backslash tricks.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

export type NavItem = { href: string; label: string; icon: "dashboard" | "inbox" | "pipeline" | "contacts" | "calendar" | "workflows" | "settings" };

/** Bottom tabs on phones, sidebar on desktop (SPEC §14.1). */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/contacts", label: "Contacts", icon: "contacts" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
];

export const WORKFLOWS_NAV: NavItem = { href: "/workflows", label: "Workflows", icon: "workflows" };
export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: "settings" };

export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
