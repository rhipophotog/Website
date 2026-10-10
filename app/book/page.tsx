import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Book a call", robots: { index: true } };
export const dynamic = "force-dynamic";

export default async function BookIndexPage() {
  const admin = createAdminClient();
  const { data: types } = admin
    ? await admin.from("appointment_types").select("key, name, description, duration_minutes, location_kind").eq("active", true).order("position")
    : { data: [] };

  return (
    <>
      <h1 className="mb-6 text-center text-3xl font-extrabold tracking-tight">Book a time with us</h1>
      {(types ?? []).length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600">Online booking isn&apos;t available right now.</p>
      ) : (
        <ul className="space-y-3">
          {types!.map((t) => (
            <li key={t.key}>
              <Link href={`/book/${t.key}`} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-card hover:border-primary-600">
                <span className="flex items-center gap-2 text-lg font-semibold">
                  <CalendarDays size={20} strokeWidth={1.75} className="text-primary-600" aria-hidden /> {t.name}
                </span>
                {t.description && <span className="mt-1 block text-gray-600">{t.description}</span>}
                <span className="mt-3 flex gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock size={16} strokeWidth={1.75} aria-hidden /> {t.duration_minutes} min
                  </span>
                  <span className="flex items-center gap-1 capitalize">
                    <MapPin size={16} strokeWidth={1.75} aria-hidden /> {t.location_kind.replace("_", " ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
