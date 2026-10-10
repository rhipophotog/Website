import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client: bypasses RLS. Only for server code that has no signed-in user
 * (the public inquiry form, lead webhooks), and only to call narrow database functions
 * like capture_lead. ESLint restricts where this may be imported.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("createAdminClient() must not run in the browser");
  const env = serverEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
