# RHIPO Studio CRM — Product & Build Spec (v1)

> A private, single-business CRM for RHIPO Photography & Cinematography that replaces the parts of GoHighLevel the studio actually uses: capturing leads, following up automatically, booking consultations, tracking each couple through a pipeline, and keeping every message in one place.
>
> Working name: **RHIPO Studio** (rename anytime). Users: the owner plus up to 2 team members. Not a multi-tenant SaaS.

Read with `CLAUDE.md` and `WORKFLOWS.md`.

---

## 1. Scope

### In v1 (the core GoHighLevel loop)
1. **Contacts** — every lead and client in one place.
2. **Pipeline** — a board of opportunities (one per couple/event) moving through stages.
3. **Lead capture** — website inquiry form, Meta Lead Ads, Google Ads lead forms, manual entry, CSV import from GoHighLevel.
4. **Conversations** — one inbox per contact for email + SMS (send and receive), plus internal notes.
5. **Calendar & booking** — a public booking page for consultations, synced with Google Calendar.
6. **Workflows** — trigger → wait → condition → action automations (see `WORKFLOWS.md`).
7. **Templates** — reusable email and SMS templates with merge fields.
8. **Tasks** — to-dos for the owner, created manually or by workflows.
9. **Dashboard** — today's tasks, new leads, conversion by stage, lead source report.

### Later (v2+), only if needed
Payments and invoices (Stripe), contracts with e-signature, proposals, client questionnaire portal, Instagram/Facebook DM inbox, review requests via Google Business Profile, AI reply suggestions, visual drag-and-drop workflow builder, mobile app (the web app is a PWA in v1).

### Explicitly out of scope
Funnel/website builder (the studio site already exists), courses/memberships, agency sub-accounts and rebilling, phone calling and voice AI.

---

## 2. Users and roles

| Role | Can |
| --- | --- |
| Owner | Everything, including settings, integrations, workflows, exports |
| Team member | Contacts, pipeline, inbox, calendar, tasks. No settings, no exports, no workflow editing |

Login: email magic link or Google sign-in (Supabase Auth). Optional 2FA. Every table protected by row-level security.

---

## 3. Pipeline (wedding studio stages)

| # | Stage | Enters when | Leaves when |
| --- | --- | --- | --- |
| 1 | New inquiry | Lead captured from any source | Consult booked, or replied, or 14 days pass |
| 2 | Contacted | A human or workflow message got a reply | Consult booked |
| 3 | Consult scheduled | Booking created | Consult happens / no-show |
| 4 | Consult done | Owner marks done after the call | Proposal sent |
| 5 | Proposal sent | Owner sends pricing/proposal | Booked or lost |
| 6 | Booked | Contract signed + deposit received (manual toggle in v1) | Event date passes |
| 7 | Pre-event | 60 days before the event date (automatic) | Event date |
| 8 | Event done | Day after the event | Gallery/film delivered |
| 9 | Delivered | Owner marks delivered | Review received / closed |
| — | Lost | Owner marks lost (reason required: price, date taken, went with other, no response, other) | — |
| — | Cold | No response after the full follow-up sequence | Re-engages (reply) → back to Contacted |

Stages are editable in settings, but workflows reference stage **keys**, not names.

Opportunity fields: couple names, event type (Hindu, Sikh, Muslim, Jain, fusion, other), event date(s) (multi-day weddings: list of dates with event names like Mehndi, Sangeet, Ceremony, Reception), venue/city, services (photo, video, both, drone, album), estimated value, source, assigned to, status, lost reason, notes.

---

## 4. Contacts

Fields: first/last name, partner name, email, phone (E.164), preferred contact (SMS, email, WhatsApp-later), city/state/country, language, tags, source (Website, Instagram, Meta Ads, Google Ads, Referral, WeddingWire/The Knot, Vendor, Other), referral by, marketing consent (email), **SMS consent with timestamp and source text**, DND flags (email, SMS), created/updated.

Features: search, filters (tag, stage, source, event month), saved views, merge duplicates (match on email or phone), CSV import with column mapping (**import a GoHighLevel export**), CSV export (owner only), activity timeline (messages, stage changes, bookings, notes, tasks).

---

## 5. Lead capture

1. **Website inquiry form** — hosted form page + embeddable snippet for rhipophotography.com. Fields: names, email, phone, event date, venue/city, wedding type, services, budget range, how did you hear, message, SMS consent checkbox with the exact consent text stored. Spam protection: honeypot + Cloudflare Turnstile.
2. **Meta Lead Ads** — webhook from Meta (leadgen) → fetch lead details → create contact + opportunity with source "Meta Ads" and the campaign/ad name.
3. **Google Ads lead form** — webhook URL with a shared key → same as above with source "Google Ads".
4. **Email parsing (optional)** — forward WeddingWire/The Knot inquiry emails to a parse address; extract name/email/date where possible, else create a task to review.
5. **Manual** — quick-add from the dashboard.

Every new lead: dedupe by email/phone (if existing, add a new opportunity or note instead of a new contact), then fire the `lead.created` trigger.

---

## 6. Conversations (inbox)

- One thread per contact mixing email and SMS, newest at the bottom, with internal notes in a different color.
- Send email (from `hello@rhipophotography.com` or similar via the email provider), send SMS (from the studio's Twilio number).
- Inbound: email replies via inbound parse webhook; SMS via Twilio webhook. Match to contact by email/phone; unknown senders create a new contact in "New inquiry".
- Unread counts, "needs reply" filter, assign to user.
- Templates picker with merge fields (`{{first_name}}`, `{{partner_name}}`, `{{event_date}}`, `{{venue}}`, `{{booking_link}}`, `{{owner_name}}`).
- Any inbound reply **pauses** that contact's follow-up workflows (see `WORKFLOWS.md` rule R1).

---

## 7. Calendar and booking

- Owner's availability rules (weekday hours, buffers, minimum notice, max per day), time zone aware.
- Appointment types: Discovery call (20 min, phone/Zoom), Studio consult (45 min), Engagement shoot planning (30 min).
- Public booking page per type: `book.<domain>/discovery` — picks a slot, asks name/email/phone/event date, sends confirmation with calendar invite (ICS) and Zoom link (v1: a fixed personal Zoom link in settings).
- Two-way Google Calendar sync: busy times block slots; bookings create Google Calendar events.
- Reschedule/cancel links in every confirmation.
- Appointment statuses: booked, confirmed, completed, no-show, cancelled. These fire workflow triggers.

---

## 8. Workflows (automation engine)

See `WORKFLOWS.md` for the engine design and the 10 starter workflows.

---

## 9. Tasks and dashboard

- Tasks: title, contact/opportunity link, due date, assignee, done. Created manually or by workflow action `create_task`.
- Dashboard: today's tasks; new leads this week; "needs reply" count; upcoming consults; upcoming events (next 30 days); pipeline value by stage; leads by source (last 30/90 days); inquiry → booked conversion rate; average first-response time.

---

## 10. Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js (App Router) + TypeScript + Tailwind | PWA so it installs on phone |
| DB + auth + storage | Supabase (Postgres, Auth, RLS, Storage) | |
| Background jobs / delays | Inngest or Trigger.dev (pick one; Inngest preferred for step-based "sleep" and retries) | Runs workflow steps, waits, scheduled reminders |
| Email send/receive | Resend or Postmark (inbound parse webhook) | Domain authentication (SPF, DKIM, DMARC) required |
| SMS | Twilio Programmable Messaging | US business texting requires **A2P 10DLC registration** before sending |
| Calendar | Google Calendar API (OAuth) | |
| Lead ads | Meta Graph API leadgen webhooks; Google Ads lead form webhook | |
| Spam | Cloudflare Turnstile | |
| Hosting | Vercel | |
| Errors/logs | Sentry (free tier) | |

Secrets only in environment variables. Never in the repo.

---

## 11. Data model (Postgres, first pass)

`users` · `contacts` · `tags`, `contact_tags` · `pipelines`, `stages` · `opportunities` (contact_id, stage_key, event_dates jsonb, value, source, status…) · `messages` (contact_id, channel email|sms|note, direction in|out, body, status, provider_id, sent_at) · `templates` · `appointment_types`, `availability_rules`, `appointments` · `forms`, `form_submissions` · `tasks` · `workflows` (key, name, enabled, trigger, definition jsonb, version) · `workflow_runs` (workflow_id, contact_id, opportunity_id, status running|waiting|paused|done|failed, current_step, next_run_at, context jsonb) · `workflow_events` (run_id, step, result, error, at) · `consents` (contact_id, channel, granted, text, source, at) · `audit_log`.

Every table: `id uuid`, `created_at`, `updated_at`. RLS on all.

---

## 12. Compliance and safety (must-haves)

- **SMS:** send only to contacts with recorded SMS consent (or who texted first). Honor STOP/UNSUBSCRIBE/START/HELP automatically (Twilio Advanced Opt-Out or own handling) and set DND. Quiet hours: no automated SMS 8:30 PM–9 AM in the **contact's** time zone; delay to the next allowed time. Complete A2P 10DLC brand + campaign registration before go-live.
- **Email:** authenticated domain, unsubscribe link on marketing emails, honor unsubscribes immediately. One-to-one replies don't need an unsubscribe link.
- **Privacy:** contact export owner-only; delete contact on request (hard delete + messages).
- **Safety stops:** a global "pause all automations" switch; per-contact "stop automations"; workflow re-entry limits so no one gets the same message twice.

---

## 13. Migration from GoHighLevel

1. Export contacts (and opportunities if available) from GoHighLevel as CSV.
2. Import with column mapping; map GHL tags and pipeline stages to the new stage keys.
3. Recreate email/SMS templates (copy text over).
4. Port the phone number to Twilio **or** register a new Twilio number (porting keeps the number clients know; plan 1–3 weeks).
5. Run both systems in parallel for 2 weeks: new leads in the new app, existing threads finished in GHL. Then cancel GHL.

---

## 14. Build plan (milestones)

Each milestone ends with passing tests and a `PROGRESS.md` entry.

1. **Scaffold** — Next.js + Supabase + auth + RLS + layout (sidebar on desktop, bottom tabs on phone: Dashboard, Inbox, Pipeline, Contacts, Calendar).
2. **Contacts + CSV import/export** — including GoHighLevel CSV mapping, dedupe, tags, timeline.
3. **Pipeline board** — stages, drag-and-drop, opportunity detail drawer, lost reasons.
4. **Lead capture** — inquiry form + embed snippet + Turnstile; Google Ads and Meta webhooks; `lead.created` event.
5. **Email** — send via provider, templates with merge fields, inbound replies threaded.
6. **SMS** — Twilio send/receive, consent checks, STOP handling, quiet hours. (Start A2P 10DLC registration at milestone 1; approval can take time.)
7. **Calendar + booking** — availability, booking pages, Google Calendar sync, ICS, reminders hook.
8. **Workflow engine** — triggers, waits, conditions, actions, runs, logs, pause/resume; ship starter workflows from `WORKFLOWS.md` as editable templates (JSON definitions + settings form, no visual builder yet).
9. **Tasks + dashboard + reports.**
10. **Hardening** — Sentry, backups, audit log, rate limits, Playwright tests of the full lead → booked journey, then migrate from GHL.

## 15. Definition of done (v1)

A test lead submitted on the website gets an email and SMS within 60 seconds, appears in "New inquiry", receives the follow-up sequence until they book, gets booking confirmations and reminders, moves stages automatically, and every message (in and out) is visible in one thread. Replying to any automated message stops the follow-ups. No SMS is sent without consent or during quiet hours.
