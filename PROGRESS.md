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

### Follow-up: sign-in fixes (2026-10-10)
- **Sign in with a code.** The email now includes a 6-digit code (`supabase/templates/magic_link.html`), and the login page accepts it.
  - This works when an email scanner has already used up the link.
  - It keeps you inside the installed phone app; links open in the browser instead.
  - **Hosted Supabase:** templates can only be edited once custom SMTP is set up. Until then the email has only a link, so the code field is folded away under "Email has a 6-digit code instead?". After SMTP is set up (milestone 5, or sooner), paste the template into Authentication → Emails, under both **Magic Link** and **Confirm signup**.
- **Clear message for bad links.** A used or expired link that Supabase sends back to any page now goes to `/login`, which explains what happened, instead of silently redirecting.
- Tests: Vitest 64/64, Playwright 20 passed, 4 skipped (signed-in tests, Supabase not available in the sandbox).

## Milestone 2 — Contacts + CSV import/export ✅ (2026-10-10)

### What was built
- **Contacts list** (`/contacts`):
  - Search by name, partner, email or phone.
  - Filters for tag, stage, source and event month.
  - **Saved views**, personal or shared with the team.
  - Cards on a phone, wider rows on desktop.
  - Pages of 50.
- **Quick add** (`/contacts/new`):
  - Phone numbers are converted to international format (E.164) with `libphonenumber-js`.
  - Tags, plus an optional "add to pipeline as a new inquiry" with wedding date, type and venue.
  - **Dedupe:** if the email or phone already exists, blanks on that record are filled in and the tags and opportunity are added to it instead of creating a duplicate.
- **Contact page** (`/contacts/[id]`):
  - Details, tags (add and remove), opportunities, edit form and messaging switches (marketing email, do-not-email, do-not-text, stop automations).
  - **Recording SMS consent or opt-out** with channel, method and the exact wording. Consent history can only be added to.
  - Internal notes.
  - The **activity timeline**: added, imported, edited fields, tags, pipeline moves, consent, merges.
- **Duplicates and merge** (owner): `/contacts/duplicates` lists contacts that share an email or phone. `/contacts/merge` lets you pick the surviving record and the value for each conflicting field.
  - Tags, notes (anyone's), opportunities, consent records and history are all moved across in one database transaction.
  - Do-not-text, do-not-email and stop-automations are kept if either record had them.
- **CSV import** (owner, `/contacts/import`): upload, match columns, check, import.
  - GoHighLevel contact and opportunity exports are recognised and their columns matched automatically. Pipeline stages are guessed and can be changed.
  - Rows are sent to the server in batches of 250 and every batch is re-checked there.
  - Existing contacts are **never overwritten**; blanks are filled in and tags added.
  - Re-importing the same file doesn't duplicate opportunities that carry a GoHighLevel id.
  - Imported contacts get **no SMS consent**.
  - Each import gets a record at `/contacts/imports/[id]` listing skipped rows, with **Undo**, which deletes only the contacts that import created.
- **CSV export** (owner, `/contacts/export`): written to the audit log, and protected against spreadsheet formula injection.
- **Permanent delete** (owner): you type DELETE to confirm. It removes notes, opportunities, consent and history. The audit entry keeps the id but no name or email.
- **Database** (`20261010000000_contacts.sql`):
  - New tables: `tags`, `contact_tags`, `consents`, `messages` (notes only for now), `contact_activity` (written only by triggers), `imports`, `saved_views`.
  - Views: `contact_list` and `contact_duplicates`, which follow the same access rules as the tables they read.
  - Functions: `merge_contacts` (owner only) and `find_contacts_for_import`.
  - New columns `contacts.ghl_contact_id`, `contacts.import_id` and `opportunities.ghl_opportunity_id`. Nothing was dropped or renamed.

### How to try it
- **Hosted Supabase:** open SQL Editor and run `supabase/migrations/20261010000000_contacts.sql`, the same way as the first migration.
- **Sample file:** `tests/e2e/fixtures/ghl-opportunities-sample.csv` is a fake GoHighLevel export to practise the import with. Undo it afterwards from the import record.

Results in the sandbox: **lint ✅, build ✅, Vitest 144/144 ✅** (unit tests, plus 39 database and access-rule tests on Postgres 16 with the auth shim), **Playwright 26 passed, 8 skipped**.
- The 8 skipped are the signed-in journeys: quick add with dedupe, notes, and a GoHighLevel import. They need local Supabase.
- The import code that writes to Supabase was **not** run against a real Supabase API here. Its matching rules are unit-tested, and its SQL (upserts, the lookup function, triggers) is tested directly in Postgres.

### Open questions
- New tables not listed in SPEC §11: `saved_views` (you approved it), plus `imports` and `contact_activity`.
- Merging and imports are owner-only. Team members can add, edit, tag and note contacts.
- Undoing an import also deletes any contact that was later merged into a contact the import created.

### Fix: CSV import "Couldn't check the file" (2026-10-10)
- **Cause:** the import actions checked each row with `z.record(z.enum(...))`. In Zod 4 that requires *every* field to be present, so every real CSV was rejected at the check step. Nothing was written.
- **Fix:** switched to `z.partialRecord`. The checks moved to `lib/contacts/import-schemas.ts`, and a new `tests/unit/import-schemas.test.ts` feeds real GoHighLevel-shaped rows through the server's checks.
- The check step now shows a readable reason when it fails, such as "the database update wasn't run", instead of a generic error.

## Milestone 3 — Pipeline board ✅ (2026-10-10)

### What was built
- **Board** (`/pipeline`):
  - One column per stage, showing count and total value. Cards show the couple, first event date, venue, value, source, assignee and time in stage.
  - Soonest weddings come first.
  - **Lost and Cold** sit in a collapsed column ("Show").
  - Filters for event month, source and assignee ("Me" included).
  - Columns snap-scroll sideways on a phone.
- **Moving cards:**
  - **On desktop:** drag and drop, using the browser's built-in dragging. No new dependency; `@dnd-kit` wasn't approved yet.
  - **On every device:** a "Move to…" picker on each card.
  - Moves show immediately and roll back with a message if the server refuses.
  - **Lost asks for a reason** in a dialog.
- **Opportunity page** (`/pipeline/[id]`):
  - Edit stage (with lost reason), couple names, wedding type, venue and city.
  - **Multiple named event days** (Haldi, Mehndi, Sangeet, Ceremony, Reception… suggested), sorted by date.
  - Services (photo, video, drone, album), value, source, assignee and notes.
  - The owner can remove an opportunity, which keeps the contact.
- **Add to pipeline** from a contact page (`/pipeline/new?contact=…`).
- **Bulk add** (owner): on Contacts, filter (e.g. tag "status: scheduled call"), then "Add these N contacts to the pipeline" at a chosen stage. People already in the pipeline are skipped, so running it twice is safe.
- **Stage settings** (owner, `/settings/pipeline`): rename any stage, and reorder the 9 main stages. Keys are shown and can't change.
- **Database** (`20261011000000_pipeline.sql`):
  - New columns `stages.is_won` and `opportunities.stage_changed_at`.
  - **Status follows the stage automatically:** Booked through Delivered count as won, Lost as lost, everything else as open. Leaving Lost clears the reason.
  - Stage keys and kinds can't be changed.
  - Stages can't be deleted from the app.
  - Event dates must be `[{name, date: YYYY-MM-DD}]`.
  - New `pipeline_cards` view, which follows the same access rules as the underlying tables.
  - Existing opportunities are brought in line with the status rule.

### How to try it
- **Hosted Supabase:** run `supabase/migrations/20261011000000_pipeline.sql` in the SQL Editor.
- Then on Contacts, filter tag **status: scheduled call**, and use **Add these 18 contacts to the pipeline** at **Consult scheduled**.

Results in the sandbox: **lint ✅, build ✅, Vitest 167/167 ✅** (including 10 new database tests on the stage rules, checked by breaking the rules on purpose and confirming the tests fail), **Playwright 30 passed, 10 skipped** (the signed-in journeys, which need local Supabase).

### Open questions
- Is browser-native dragging good enough on desktop, or should we add `@dnd-kit`?
- The board shows up to 1,000 cards; filter by month beyond that.
