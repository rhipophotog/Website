-- Local development only (`npx supabase db reset`). Sign in at /login with either email;
-- the magic link arrives in Mailpit at http://127.0.0.1:54324.
insert into public.invites (email, role) values
  ('owner@rhipo.test', 'owner'),
  ('team@rhipo.test', 'team')
on conflict do nothing;
