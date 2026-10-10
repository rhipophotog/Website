import type { AdminClient } from "@/lib/supabase/admin";

export type CaptureResult = {
  contact_id: string;
  opportunity_id: string;
  submission_id: string;
  created_contact: boolean;
  duplicate_delivery: boolean;
};

/** Every lead, from every source, goes through the capture_lead() database function. */
export async function captureLead(admin: AdminClient, lead: Record<string, unknown>): Promise<CaptureResult> {
  const { data, error } = await admin.rpc("capture_lead", { p_lead: lead });
  if (error) throw new Error(`capture_lead failed: ${error.code ?? ""} ${error.message}`);
  return data as CaptureResult;
}
