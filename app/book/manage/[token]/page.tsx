import type { Metadata } from "next";
import { availableSlots, verifyManageToken, type AppointmentType } from "@/lib/calendar/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelBooking, rescheduleBooking } from "./actions";
import { ManageBooking } from "./manage-booking";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ManagePage({ params }: PageProps<"/book/manage/[token]">) {
  const { token } = await params;
  const id = verifyManageToken(token);
  const admin = createAdminClient();
  const invalid = <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600">This link isn&apos;t valid. Reply to your confirmation email and we&apos;ll help.</p>;
  if (!id || !admin) return invalid;

  const { data: appt } = await admin
    .from("appointments")
    .select("id, starts_at, ends_at, status, guest_time_zone, location, type:appointment_types(*)")
    .eq("id", id)
    .maybeSingle();
  if (!appt) return invalid;
  const type = appt.type as unknown as AppointmentType;
  const changeable = ["booked", "confirmed"].includes(appt.status) && new Date(appt.starts_at) > new Date();
  const { slots } = changeable ? await availableSlots(admin, type, { ignore: { start: new Date(appt.starts_at), end: new Date(appt.ends_at) } }) : { slots: [] };

  return (
    <ManageBooking
      typeName={type.name}
      startsAt={appt.starts_at}
      status={appt.status}
      location={appt.location}
      changeable={changeable}
      slots={slots.map((s) => s.start.toISOString())}
      cancel={cancelBooking.bind(null, token)}
      reschedule={rescheduleBooking.bind(null, token)}
    />
  );
}
