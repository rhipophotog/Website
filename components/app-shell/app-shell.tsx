import Link from "next/link";
import type { ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth";
import { PRIMARY_NAV, SETTINGS_NAV } from "@/lib/routes";
import { NavIcon } from "./nav-icon";
import { BottomTabs, SidebarLinks } from "./nav-links";

/**
 * Mobile-first shell: bottom tabs + compact top bar on phones, sidebar from `md` up.
 * The owner uses this at events, so tap targets stay at least 44px tall.
 */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const sidebarItems = user.role === "owner" ? [...PRIMARY_NAV, SETTINGS_NAV] : PRIMARY_NAV;
  const name = user.fullName ?? user.email;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:flex-col md:border-r md:border-line md:bg-surface md:px-3 md:py-5">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-ink font-serif font-bold text-accent">R</span>
          <span className="font-semibold">RHIPO Studio</span>
        </Link>
        <nav aria-label="Main" className="flex-1">
          <SidebarLinks items={sidebarItems} />
        </nav>
        <div className="border-t border-line px-3 pt-4">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs capitalize text-muted">{user.role}</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="text-xs text-muted underline hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-paper/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-ink font-serif text-sm font-bold text-accent">R</span>
            <span className="font-semibold">RHIPO</span>
          </Link>
          {user.role === "owner" && (
            <Link href={SETTINGS_NAV.href} aria-label="Settings" className="flex size-11 items-center justify-center text-muted">
              <NavIcon name="settings" />
            </Link>
          )}
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>

        <nav
          aria-label="Tabs"
          className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <BottomTabs items={PRIMARY_NAV} />
        </nav>
      </div>
    </div>
  );
}
