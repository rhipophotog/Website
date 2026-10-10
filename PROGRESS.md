# Progress

## Milestone 1 — Scaffold ✅ (2026-10-10)

### What was built
- **App**: Next.js 16 (App Router) with strict TypeScript, Tailwind v4 and ESLint. It installs as a phone app (PWA): manifest, placeholder "R" icons at `/pwa-icon/192|512` and an Apple touch icon.
- **Layout**: mobile-first shell. Phones get bottom tabs (Dashboard, Inbox, Pipeline, Contacts, Calendar) plus a top bar with a Settings shortcut for the owner. From `md` up there's a sidebar instead. Each section is a placeholder that says which milestone fills it in. The Pipeline page already lists the 11 stages from the database.
- **Auth** (Supabase): email magic link, plus Google sign-in, which is hidden until `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`. `proxy.ts` refreshes the session and sends signed-out visitors to `/login?next=…`. Pages check the user again with `requireUser()`. Redirects after login are restricted to paths inside the app. TOTP 2FA is enabled in `supabase/config.toml`; the enrollment screen is still to come.
- **Invite-only sign-up**: a database trigger on `auth.users` rejects any email without an open invite and gives new users the role from their invite. The owner invites team members on **Settings**, which is limited to the owner plus 2 team members. The first owner is invited with `npm run owner:invite -- you@…`.
- **Database** (`supabase/migrations/20261009000000_scaffold.sql`): `users`, `invites`, `pipelines`, `stages`, `contacts`, `opportunities`, `audit_log`, with RLS on every table:
  - Anonymous visitors get no access at all.
  - Members read and write contacts and opportunities.
  - Only the owner can delete contacts and opportunities, manage stages, pipelines and invites, read the audit log, or change roles.
  - The audit log can only be added to; nobody can edit or delete entries.
  - The studio can't be left without an owner.
  - Updating a row updates its `updated_at` automatically.
  - The default **Weddings** pipeline comes with the 11 stage keys from SPEC §3.
- **Safety foundations**:
  - `lib/env.ts` validates the environment with Zod. `APP_ENV` defaults to `development`.
  - The provider adapters only record messages in a test outbox unless `APP_ENV=production`. In production they currently throw, because no live provider exists yet. Test-mode records are idempotent per key, so a retry doesn't record a message twice.
  - `lib/messaging/canSend.ts` is the single SMS checkpoint. It **denies every send** until milestone 6 fills in the consent, quiet-hours and DND checks.
  - ESLint blocks importing the provider adapters (or Twilio, Resend or Postmark SDKs) anywhere outside `lib/messaging`.
  - `lib/redact.ts` masks phone numbers and emails for logs.
- **Times**: `lib/time.ts` uses Intl only. Values are stored in UTC and shown in the user's time zone. A contact's time zone falls back to America/Los_Angeles.

### How to try it
```bash
npm install
npx supabase start          # Docker required
npx supabase db reset       # applies the migration + seeds invites for owner@rhipo.test / team@rhipo.test
npm run env:local           # writes .env.local from `supabase status`
npm run dev                 # http://localhost:3000 → sign in as owner@rhipo.test
                            # the magic link arrives in Mailpit: http://127.0.0.1:54324
```

Tests:
- `npm run test`: unit tests, plus the database/RLS tests against `TEST_DATABASE_URL`.
  - The database tests create a throwaway database for each run and apply every migration.
  - If the target isn't Supabase, they first add a small copy of Supabase's `auth` schema (`tests/db/supabase-auth-shim.sql`), so any Postgres 15+ works.
- `npm run test:e2e`: Playwright, at phone and desktop sizes.
  - The signed-in tests run only when local Supabase is up. They sign in through a real magic link read from Mailpit.
- `npm run lint`: ESLint, route type generation and `tsc`.

Results in the build sandbox: **lint ✅, build ✅, Vitest 64/64 ✅, Playwright 18 passed, 4 skipped**.
- The 4 skipped are the signed-in navigation tests (2 tests × phone and desktop).
- They were skipped because the sandbox couldn't download Supabase's Docker images (Docker Hub rate limit, registry CDN blocked).
- The RLS tests ran against a plain Postgres 16 with the auth shim instead.
- **Run `npm run test:e2e` once on a machine with Supabase running to cover the signed-in flow.**

### Going to production
1. Create a Supabase project, then run `npx supabase link` and `npx supabase db push`.
2. In Supabase Auth settings:
   - Set the Site URL to the app's domain.
   - Add `<domain>/auth/callback` to the redirect URLs.
   - Turn on custom SMTP so sign-in emails come from the studio's domain.
3. Set the env vars from `.env.example` in Vercel, with `APP_ENV=production` only there.
4. Run `npm run owner:invite -- <owner email>`, which needs `SUPABASE_SERVICE_ROLE_KEY`.

### Open questions
- **A2P 10DLC**: start the Twilio brand and campaign registration now (SPEC §14.6). Approval can take weeks.
- **Repo**: the CRM lives in `rhipophotog/Website`. Keep it there or move it to its own repo?
- **Background jobs**: Inngest (the spec's preference) will be used in milestone 8 unless you say otherwise.
- **Changes from the plan**:
  - Sign-up is invite-only. The planned "first sign-up becomes owner" was dropped because someone else could claim owner on a fresh deploy.
  - `invites` is a new table not listed in SPEC §11.
- **Inquiry embed**: `X-Frame-Options: DENY` is set on every page. Milestone 4 will relax it for `/f/*` so the inquiry form can be embedded on rhipophotography.com.
- **Placeholder icon**: the "R" monogram should be replaced with the real logo.
