"use server";

import { serverEnv } from "@/lib/env";
import { unsubscribeSecret, verifyUnsubscribeToken } from "@/lib/messaging/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function unsubscribe(token: string): Promise<{ ok: boolean }> {
  const contactId = verifyUnsubscribeToken(token, unsubscribeSecret(serverEnv()));
  const admin = createAdminClient();
  if (!contactId || !admin) return { ok: false };
  const { error } = await admin.rpc("unsubscribe_contact", {
    p_contact_id: contactId,
    p_text: "Clicked 'Unsubscribe' in a RHIPO marketing email",
  });
  return { ok: !error };
}
