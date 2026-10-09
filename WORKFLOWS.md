# RHIPO Studio CRM — Workflow Engine + Starter Workflows

> The automation part of `SPEC.md`. Same idea as GoHighLevel workflows: **Trigger → (Wait) → (If/Else) → Action**, run per contact/opportunity.

## 1. Engine design

### 1.1 Concepts
- **Trigger** — an event that starts a run for one contact (and usually one opportunity).
- **Step** — one of: `action`, `wait`, `condition`, `goto`, `end`.
- **Run** — one contact going through one workflow. Stored in `workflow_runs` with status `running | waiting | paused | done | failed`, current step, `next_run_at`, and a `context` JSON.
- **Event log** — every step result written to `workflow_events` so the owner can see "what happened to this lead and why".

### 1.2 Triggers (v1)
| Key | Fires when |
| --- | --- |
| `lead.created` | New contact/opportunity from any source (payload: source) |
| `form.submitted` | Any form submission (payload: form key) |
| `message.received` | Inbound email or SMS |
| `stage.changed` | Opportunity moves stage (payload: from, to) |
| `appointment.booked` / `.cancelled` / `.rescheduled` / `.completed` / `.no_show` | Booking status changes |
| `tag.added` | Tag added to a contact |
| `date.relative` | N days before/after a date field (event date, delivered date). Checked by a daily scheduler at 9 AM studio time |
| `manual` | Owner clicks "Add to workflow" on a contact |

### 1.3 Actions (v1)
`send_email(template)` · `send_sms(template)` · `notify_owner(channel, text)` (email/SMS/push to owner) · `move_stage(stage_key)` · `add_tag` / `remove_tag` · `create_task(title, due_in)` · `update_field(field, value)` · `start_workflow(key)` / `stop_workflow(key)` · `webhook(url, payload)`.

### 1.4 Waits and conditions
- `wait` — fixed duration (`2h`, `1d`), until a time of day (`next 10:00 contact-local`), or until an event with a timeout (`until message.received or 2d`).
- `condition` — checks on contact/opportunity fields, tags, stage, "has replied since run start", "has upcoming appointment", consent flags. Branches `yes` / `no`.

### 1.5 Global rules (enforced by the engine, not per workflow)
- **R1 — Stop on reply.** When `message.received` arrives from a contact, all their runs marked `stop_on_reply: true` end (status `done`, reason `replied`), and the owner is notified.
- **R2 — Stop on booking.** `appointment.booked` ends any run marked `stop_on_booking: true`.
- **R3 — Consent.** `send_sms` skips (and logs) if no SMS consent or SMS DND; `send_email` skips marketing emails if unsubscribed.
- **R4 — Quiet hours.** SMS outside 9:00 AM–8:30 PM contact-local time is delayed to the next 9:00 AM. Emails are allowed anytime, but follow-up emails default to 9–11 AM local.
- **R5 — No duplicates.** A contact can't have two active runs of the same workflow; re-entry is allowed only if the workflow sets `allow_reentry`.
- **R6 — Kill switches.** Global "pause all automations"; per-contact "stop automations"; per-workflow enable toggle. Paused runs resume from the same step.
- **R7 — Idempotent steps.** Each step has an idempotency key (`run_id:step_index`) so retries never double-send.
- **R8 — Business-day option.** Waits can be marked `business_days: true`.

### 1.6 Definition format (JSON, stored in `workflows.definition`)
```json
{
  "key": "new_inquiry",
  "trigger": { "type": "lead.created" },
  "stop_on_reply": true,
  "stop_on_booking": true,
  "steps": [
    { "id": "s1", "type": "action", "action": "send_email", "template": "inquiry_autoreply" },
    { "id": "s2", "type": "action", "action": "send_sms", "template": "inquiry_sms" },
    { "id": "s3", "type": "action", "action": "notify_owner", "channel": "sms", "text": "New inquiry: {{first_name}} · {{event_date}} · {{source}}" },
    { "id": "s4", "type": "wait", "duration": "1d" },
    { "id": "s5", "type": "action", "action": "send_sms", "template": "followup_day1" }
  ]
}
```
v1 edits definitions through a settings form (change template, delays, toggle steps). A visual builder is v2.

### 1.7 Runner
- Built on Inngest (or Trigger.dev): one function per run step, `step.sleep` for waits, `step.waitForEvent` for "until reply/booking", automatic retries with backoff.
- Daily cron at 9 AM studio time evaluates `date.relative` triggers.
- Every action writes to `messages`/`tasks`/`opportunities` and to `workflow_events`.
- Contact page shows "Active automations" with a stop button for each.

### 1.8 Tests
- Unit: each action, consent and quiet-hours rules, idempotency.
- Integration: simulate a full lead journey with a fake clock (lead → day-1 follow-up → reply stops sequence).
- Never send real SMS/email in tests: provider adapters have a `test` mode.

---

## 2. Starter workflows for a wedding studio

Merge fields: `{{first_name}}`, `{{partner_name}}`, `{{event_date}}`, `{{venue}}`, `{{booking_link}}`, `{{owner_name}}`, `{{portfolio_link}}`, `{{review_link}}`. Message text is a starting draft; the owner edits templates in the app.

### W1 — New inquiry: instant response (`lead.created`)
Goal: reply within 1 minute, the biggest driver of bookings.
1. Email **inquiry_autoreply** — thank them, congratulate, one line on RHIPO, link to book a 20-min discovery call, portfolio link.
2. SMS **inquiry_sms** (if consent): "Hi {{first_name}}, this is {{owner_name}} from RHIPO. Congratulations! Got your inquiry for {{event_date}}. Grab a quick call here: {{booking_link}}"
3. Notify owner (SMS/push) with name, date, source.
4. Move stage → New inquiry; tag `source:<source>`.
5. Start **W2**.

### W2 — Follow-up until they book (`stop_on_reply`, `stop_on_booking`)
1. Wait 1 day → SMS **followup_day1**: "Hi {{first_name}}, just checking you saw my note. Happy to answer anything about {{event_date}}."
2. Wait 2 days → Email **followup_day3**: 2–3 favorite galleries/films matching their wedding type, booking link.
3. Wait 4 days → SMS **followup_day7**: "Is {{event_date}} still the plan? Dates fill quickly. Want me to hold a call slot for you?"
4. Wait 7 days → Email **followup_day14** ("Should I close your file?" breakup email).
5. Wait 3 days → if still no reply/booking: move stage → Cold, tag `cold`.

### W3 — Consultation booked (`appointment.booked`)
1. Move stage → Consult scheduled.
2. Email **consult_confirm** with ICS + Zoom link + "what to have ready" (dates, venues, guest count, must-have moments).
3. Wait until 24h before → SMS **consult_reminder_24h**.
4. Wait until 1h before → SMS **consult_reminder_1h** with the Zoom link.
5. Create task for owner 30 min before: "Review {{first_name}}'s inquiry".

### W4 — No-show (`appointment.no_show`)
1. Wait 15 min → SMS **noshow**: "Sorry we missed you! Reschedule here: {{booking_link}}"
2. Wait 1 day, if no new booking → email **noshow_followup**.
3. If still nothing after 3 days → back into W2 at step 3.

### W5 — After the consult (`appointment.completed`)
1. Move stage → Consult done.
2. Create task: "Send proposal to {{first_name}}" due in 2h.
3. When owner moves stage → Proposal sent: start **W6**.

### W6 — Proposal follow-up (`stage.changed` to proposal_sent; `stop_on_reply`)
1. Wait 2 days → email **proposal_check_in** ("Any questions on the collections?").
2. Wait 3 days → SMS **proposal_nudge**.
3. Wait 5 days → task for owner: "Call {{first_name}} about proposal".
4. Wait 7 days, if not booked → email **proposal_last** and task: "Mark won/lost".

### W7 — Booked: welcome (`stage.changed` to booked)
1. Email **welcome_booked** — thank you, what happens next, planning questionnaire link.
2. Tag `client`; stop W2/W6 if running.
3. Notify owner; create task "Send contract copy + add to production calendar".

### W8 — Pre-event milestones (`date.relative` on event date)
| When | Action |
| --- | --- |
| 90 days before | Email: timeline questionnaire (family photo list, key moments, schedule per event day) |
| 60 days before | Move stage → Pre-event; task "Schedule planning call" |
| 30 days before | Email: confirm venues, coordinator contact, final schedule |
| 7 days before | SMS: "One week to go! Final timeline locked?" + task "Shot list + team call sheet" |
| 1 day before | SMS: "See you tomorrow!" + team arrival time |

For multi-day weddings, the anchor is the **first** event date; the timeline email lists all event days.

### W9 — After the event (`date.relative` on the last event date)
1. Day after → move stage → Event done; email **thank_you** ("It was an honor…", sneak-peek timeline).
2. 3 days after → task "Post sneak peek + send to couple".
3. When owner marks Delivered → wait 3 days → email **review_request** with `{{review_link}}`; wait 7 days, if no review tag → SMS gentle reminder.
4. 30 days after delivery → email **referral_ask** (friends getting married, vendor shout-out).

### W10 — Anniversary and re-engagement (`date.relative`)
1. 1 year after the event date → email **anniversary** (a favorite photo + anniversary session offer).
2. Cold leads: 90 days after moving to Cold → one email **cold_reengage** ("Still planning? Here's what's new").

### Internal-only workflow
- **Daily digest** (cron 8 AM): email/SMS to owner with new leads, today's consults, overdue tasks, unread messages.

---

## 3. Templates to create (v1)

inquiry_autoreply, inquiry_sms, followup_day1, followup_day3, followup_day7, followup_day14, consult_confirm, consult_reminder_24h, consult_reminder_1h, noshow, noshow_followup, proposal_check_in, proposal_nudge, proposal_last, welcome_booked, timeline_90, details_30, week_to_go_sms, day_before_sms, thank_you, review_request, review_reminder_sms, referral_ask, anniversary, cold_reengage, owner_digest.

Write them in the studio's voice: warm, personal, short. SMS ≤ 160 characters where possible, always identifies "RHIPO" in the first message, and the first SMS to a new contact includes "Reply STOP to opt out".
