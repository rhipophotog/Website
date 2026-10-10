# CLAUDE.md — RHIPO Studio CRM

A private CRM for RHIPO Photography & Cinematography that replaces the parts of GoHighLevel the studio uses: leads, pipeline, inbox (email + SMS), booking calendar, and automations. **Read `SPEC.md` and `WORKFLOWS.md` first; they are the source of truth.** Look and logo: `BRAND.md` (logo files in `brand/`). The product name isn't final: always use `APP_NAME` from `lib/brand.ts`.

## How to work
- Build one milestone from `SPEC.md` §14 at a time. Show the plan before coding. Don't start the next milestone until tests pass.
- After each milestone, append to `PROGRESS.md`: what was built, how to try it, open questions.
- Ask before adding a dependency not in `SPEC.md` §10, or before any change to the data model that drops or renames columns.

## Non-negotiables
- **Never send a real email or SMS from tests or local dev.** Provider adapters must have a `test` mode that records messages instead of sending. Real sending only when `APP_ENV=production`.
- Every outbound SMS goes through the consent + quiet-hours + DND checks in one function (`lib/messaging/canSend.ts`). No direct provider calls elsewhere.
- Workflow steps must be idempotent (key `run_id:step_id`); retries must never double-send.
- Row-level security on every table. Secrets only in env vars. Never log message bodies with full phone numbers in production logs.
- Store SMS consent with timestamp, source, and the exact consent text shown.

## Conventions
- TypeScript strict. Zod for all external input (webhooks, forms, CSV import, workflow definitions).
- Tailwind; mobile-first (the owner uses it from a phone at events).
- Server actions / route handlers for writes; webhooks verify signatures (Twilio, Meta, email provider) or a shared secret.
- Times stored in UTC; display in the user's time zone; workflow quiet hours use the **contact's** time zone (fallback: studio time zone America/Los_Angeles).

## Commands
- `npm run dev` · `npm run build` · `npm run test` (Vitest) · `npm run test:e2e` (Playwright) · `npm run lint`
- `npx inngest-cli dev` (or the Trigger.dev dev CLI) to run workflows locally.
