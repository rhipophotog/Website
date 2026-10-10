// Invite the studio owner. Run once per environment, before the owner's first sign-in:
//   npm run owner:invite -- you@rhipophotography.com
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local or the shell).
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: npm run owner:invite -- you@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { error } = await supabase.from("invites").upsert({ email, role: "owner" }, { onConflict: "email" });
if (error) {
  console.error(`Couldn't create the invite: ${error.message}`);
  process.exit(1);
}
console.log(`Owner invite ready for ${email}. Sign in with that email on /login.`);
