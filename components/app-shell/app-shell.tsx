import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import type { CurrentUser } from "@/lib/auth";
import { PRIMARY_NAV, SETTINGS_NAV, WORKFLOWS_NAV } from "@/lib/routes";
import { NavIcon } from "./nav-icon";
import { BottomTabs, SidebarLinks } from "./nav-links";

/**
 * Mobile-first shell (BRAND.md §4): white 240px sidebar with the logo on desktop,
 * bottom tab bar on phones. Tap targets stay at least 44px tall.
 */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const sidebarItems = user.role === "owner" ? [...PRIMARY_NAV, WORKFLOWS_NAV, SETTINGS_NAV] : PRIMARY_NAV;
  const name = user.fullName ?? user.email;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-gray-200 md:bg-white md:px-3 md:py-5">
        <Link href="/" className="mb-6 px-3">
          <Logo variant="full" size={32} />
        </Link>
        <nav aria-label="Main" className="flex-1">
          <SidebarLinks items={sidebarItems} />
        </nav>
        <div className="border-t border-gray-200 px-3 pt-4">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs capitalize text-gray-600">{user.role}</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="text-xs text-gray-600 underline hover:text-gray-900">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Link href="/">
            <Logo variant="full" size={28} />
          </Link>
          {user.role === "owner" && (
            <Link href={SETTINGS_NAV.href} aria-label="Settings" className="flex size-11 items-center justify-center text-gray-600">
              <NavIcon name="settings" />
            </Link>
          )}
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>

        <nav
          aria-label="Tabs"
          className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <BottomTabs items={PRIMARY_NAV} />
        </nav>
      </div>
    </div>
  );
}
