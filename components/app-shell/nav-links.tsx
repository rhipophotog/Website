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
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                active ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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
                active ? "text-primary-600" : "text-gray-600"
              }`}
            >
              <NavIcon name={item.icon} size={22} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
