import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { APP_NAME, STUDIO_NAME } from "@/lib/brand";

/** Public pages: home (shown at / when signed out), privacy policy, terms. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <Logo size={32} /> {APP_NAME}
          </Link>
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium">
            Studio sign-in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
          <span>
            © {new Date().getFullYear()} {STUDIO_NAME}
          </span>
          <Link href="/privacy" className="underline">
            Privacy policy
          </Link>
          <Link href="/terms" className="underline">
            Terms of service
          </Link>
          <Link href="/book" className="underline">
            Book a call
          </Link>
        </div>
      </footer>
    </div>
  );
}
