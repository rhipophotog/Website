"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type NavItem } from "@/lib/routes";
import { NavIcon } from "./nav-icon";

/** Desktop sidebar links. */
export function SidebarLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-ink text-paper" : "text-muted hover:bg-line/60 hover:text-ink"
              }`}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Phone bottom tab bar. */
export function BottomTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="grid grid-cols-5">
      {items.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <NavIcon name={item.icon} className="size-6" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
