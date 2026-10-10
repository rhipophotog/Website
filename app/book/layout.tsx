import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { STUDIO_NAME } from "@/lib/brand";

export default function BookLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex flex-col items-center text-center">
          <Logo size={44} />
          <p className="mt-3 text-sm font-medium text-gray-600">{STUDIO_NAME}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
