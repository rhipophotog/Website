import type { NavItem } from "@/lib/routes";

const PATHS: Record<NavItem["icon"], string> = {
  dashboard: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z",
  inbox: "M4 4h16v12h-5l-3 3-3-3H4z",
  pipeline: "M4 5h4v14H4zm6 0h4v9h-4zm6 0h4v5h-4z",
  contacts: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-3.3 3.6-6 8-6s8 2.7 8 6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
};

export function NavIcon({ name, className = "size-5" }: { name: NavItem["icon"]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
