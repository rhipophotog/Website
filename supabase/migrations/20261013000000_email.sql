-- Milestone 5: email. Templates, studio settings, outbound/inbound email on messages,
-- delivery status from the provider, unsubscribes.
-- Adds tables, columns and functions only; nothing is dropped or renamed.

-- ---------------------------------------------------------------------------
-- studio_settings: one row. Merge-field values and the safety switches (WORKFLOWS R6).
-- ---------------------------------------------------------------------------

create table public.studio_settings (
  id boolean primary key default true check (id), -- a single row
  owner_name text not null default 'Hitesh',
  studio_name text not null default 'RHIPO Photography & Cinematography',
  booking_link text,
  portfolio_link text,
  review_link text,
  autoreply_enabled boolean not null default true,
  automations_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.studio_settings default values;

-- ---------------------------------------------------------------------------
-- templates (SPEC §6, WORKFLOWS §3). Bodies are plain text with {{merge_fields}}.
-- ---------------------------------------------------------------------------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  channel text not null check (channel in ('email', 'sms')),
  -- marketing emails get an unsubscribe link and respect marketing opt-outs (SPEC §12)
  category text not null default 'transactional' check (category in ('transactional', 'marketing')),
  subject text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel = 'sms' or subject is not null)
);

insert into public.templates (key, name, channel, category, subject, body) values
('inquiry_autoreply', 'New inquiry: instant reply', 'email', 'transactional',
 'Congratulations, {{first_name}}! Your RHIPO inquiry',
 'Hi {{first_name}},

Congratulations on your engagement, and thank you for reaching out about {{event_date}}! We''re so glad you found us.

At RHIPO we photograph and film South Asian and fusion weddings with a warm, candid, story-first approach, from the haldi to the last dance.

The easiest next step is a quick 20-minute discovery call, so we can hear about your plans and answer your questions:
{{booking_link}}

In the meantime, here''s some of our recent work: {{portfolio_link}}

Talk soon,
{{owner_name}}
RHIPO Photography & Cinematography'),
('followup_day3', 'Follow-up: day 3 (galleries)', 'email', 'transactional',
 'A few weddings we think you''ll love',
 'Hi {{first_name}},

I wanted to share a few of our favourite recent celebrations. I think they''ll give you a feel for how we''d tell your story:
{{portfolio_link}}

If you''d like to talk through your plans for {{event_date}}, grab any time that suits you here:
{{booking_link}}

Warmly,
{{owner_name}}'),
('followup_day14', 'Follow-up: day 14 (close the file?)', 'email', 'transactional',
 'Should I close your file, {{first_name}}?',
 'Hi {{first_name}},

I haven''t heard back, so I''m guessing you''ve either found your team or wedding planning has taken over (completely understandable!).

If you''re still looking for photography or films for {{event_date}}, just reply to this email and I''ll pick things right back up. Otherwise I''ll close your file and won''t keep filling your inbox.

Wishing you a beautiful celebration either way,
{{owner_name}}'),
('consult_confirm', 'Consultation confirmed', 'email', 'transactional',
 'You''re booked! Your RHIPO consultation',
 'Hi {{first_name}},

You''re all set for your consultation. We can''t wait to hear about your wedding!

To make the most of our time, it helps to have:
- Your event dates and venues (even if they''re not final)
- Rough guest count
- The moments that matter most to you

Need to change the time? Use the link in your calendar invite.

See you soon,
{{owner_name}}'),
('noshow_followup', 'No-show: follow-up', 'email', 'transactional',
 'Sorry we missed you, {{first_name}}',
 'Hi {{first_name}},

Looks like we missed each other for our call. No worries at all, life gets busy, especially during wedding planning!

Pick a new time that works for you here:
{{booking_link}}

{{owner_name}}'),
('proposal_check_in', 'Proposal: check-in', 'email', 'transactional',
 'Any questions on the collections?',
 'Hi {{first_name}},

Just checking in on the proposal I sent over. Do you have any questions about the collections, or would it help to adjust anything for your events?

Happy to jump on a quick call too: {{booking_link}}

{{owner_name}}'),
('proposal_last', 'Proposal: last note', 'email', 'transactional',
 'Holding {{event_date}} for you',
 'Hi {{first_name}},

I''ve been holding {{event_date}} for you, but dates in wedding season go quickly. If you''d like to lock it in, just reply and I''ll send the contract and retainer details.

If you''ve decided to go another way, no hard feelings at all. I''d just love to know so I can release the date.

{{owner_name}}'),
('welcome_booked', 'Booked: welcome', 'email', 'transactional',
 'Welcome to the RHIPO family, {{first_name}}!',
 'Hi {{first_name}} and {{partner_name}},

We''re officially booked for {{event_date}}! Thank you for trusting us with your celebration. We''re honoured.

What happens next:
1. You''ll receive a copy of your signed contract for your records.
2. About 90 days out, we''ll send a short planning questionnaire (family photo list, key moments, schedule for each event day).
3. Closer to the date we''ll set up a planning call to walk through the timeline together.

Any questions at all, just reply here.

With love,
{{owner_name}}'),
('timeline_90', 'Pre-event: 90 days (questionnaire)', 'email', 'transactional',
 '90 days to go! Let''s plan your coverage',
 'Hi {{first_name}},

Only 90 days until {{event_date}}! It''s time to start shaping your photo and film plan.

Please send us, whenever you can:
- The schedule for each event day
- Your family photo list (who should be in the formal portraits)
- Any must-have moments or traditions we should know about

{{owner_name}}'),
('details_30', 'Pre-event: 30 days (confirm details)', 'email', 'transactional',
 'One month to go: confirming details',
 'Hi {{first_name}},

One month to go! Could you confirm:
- Final venues and addresses for each event
- Your coordinator or planner''s name and number
- The final schedule

Thank you!
{{owner_name}}'),
('thank_you', 'After the event: thank you', 'email', 'transactional',
 'It was an honour, {{first_name}}',
 'Hi {{first_name}} and {{partner_name}},

It was an honour to be part of your wedding. Thank you for letting us into such a special few days.

Your sneak peeks are on their way soon, with the full gallery and film to follow. We''ll keep you posted on timing.

{{owner_name}}'),
('review_request', 'Delivered: review request', 'email', 'transactional',
 'Would you share a few words?',
 'Hi {{first_name}},

We hope you''re loving your photos and film! If you enjoyed working with us, a short review would mean the world to a small studio like ours:
{{review_link}}

Thank you so much,
{{owner_name}}'),
('referral_ask', 'Delivered: referral ask', 'email', 'marketing',
 'Know someone getting married?',
 'Hi {{first_name}},

If you have friends or family getting married, we''d be so grateful if you passed our name along. And if there were vendors you loved working with, tell us! We love giving shout-outs.

{{owner_name}}'),
('anniversary', 'Anniversary', 'email', 'marketing',
 'Happy anniversary, {{first_name}} and {{partner_name}}!',
 'Hi {{first_name}} and {{partner_name}},

Happy first anniversary! It feels like yesterday we were with you on your wedding day.

If you''d like to celebrate with an anniversary session, just reply and we''ll set something up.

{{owner_name}}'),
('cold_reengage', 'Cold lead: re-engage', 'email', 'marketing',
 'Still planning, {{first_name}}?',
 'Hi {{first_name}},

It''s been a little while! If you''re still planning your wedding, we''d love to reconnect. Here''s some of our newest work:
{{portfolio_link}}

Grab a time to chat whenever you''re ready: {{booking_link}}

{{owner_name}}'),
('inquiry_sms', 'New inquiry: first SMS', 'sms', 'transactional', null,
 'Hi {{first_name}}, this is {{owner_name}} from RHIPO. Congrats! Got your inquiry for {{event_date}}. Grab a quick call: {{booking_link}} Reply STOP to opt out'),
('followup_day1', 'Follow-up: day 1 SMS', 'sms', 'transactional', null,
 'Hi {{first_name}}, just checking you saw my note. Happy to answer anything about {{event_date}}. – {{owner_name}}, RHIPO'),
('followup_day7', 'Follow-up: day 7 SMS', 'sms', 'transactional', null,
 'Is {{event_date}} still the plan? Dates fill quickly. Want me to hold a call slot for you? – {{owner_name}}, RHIPO'),
('consult_reminder_24h', 'Consult reminder: 24h SMS', 'sms', 'transactional', null,
 'Hi {{first_name}}, a reminder of our RHIPO call tomorrow. Looking forward to it! – {{owner_name}}'),
('consult_reminder_1h', 'Consult reminder: 1h SMS', 'sms', 'transactional', null,
 'See you in an hour, {{first_name}}! Join here: {{booking_link}} – {{owner_name}}, RHIPO'),
('noshow', 'No-show SMS', 'sms', 'transactional', null,
 'Sorry we missed you, {{first_name}}! Reschedule here: {{booking_link}} – RHIPO'),
('proposal_nudge', 'Proposal nudge SMS', 'sms', 'transactional', null,
 'Hi {{first_name}}, any questions on the RHIPO proposal? Happy to chat. – {{owner_name}}'),
('week_to_go_sms', 'One week to go SMS', 'sms', 'transactional', null,
 'One week to go, {{first_name}}! Is your final timeline locked? – {{owner_name}}, RHIPO'),
('day_before_sms', 'Day before SMS', 'sms', 'transactional', null,
 'See you tomorrow, {{first_name}}! We''re so excited. – {{owner_name}}, RHIPO'),
('review_reminder_sms', 'Review reminder SMS', 'sms', 'transactional', null,
 'Hi {{first_name}}, if you have a moment, a quick review would mean a lot: {{review_link}} – RHIPO');

-- ---------------------------------------------------------------------------
-- messages: email fields, delivery status, read tracking, idempotency
-- ---------------------------------------------------------------------------

alter table public.messages
  add column from_address text,
  add column to_address text,
  -- RFC 5322 Message-ID / In-Reply-To, for threading replies in mail clients
  add column rfc_message_id text,
  add column in_reply_to text,
  add column template_key text,
  add column idempotency_key text,
  add column error text,
  add column read_at timestamptz;

create unique index messages_idempotency_key on public.messages (idempotency_key);
create unique index messages_provider_id on public.messages (channel, provider_id);
create index messages_unread_idx on public.messages (contact_id) where direction = 'in' and read_at is null;

-- status vocabulary
alter table public.messages add constraint messages_status_check check (
  status is null or status in ('test', 'queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'received')
);

-- Members send email as themselves (the server action calls the provider first, then records).
create policy "members record sent email" on public.messages
  for insert to authenticated
  with check (public.is_member() and channel = 'email' and direction = 'out' and author_id = auth.uid());

-- Opening a conversation marks inbound messages read; nothing else may change on them.
create or replace function public.mark_conversation_read(p_contact_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages set read_at = now()
  where contact_id = p_contact_id and direction = 'in' and read_at is null and public.is_member();
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- record_inbound_email (server only): thread a reply, or start a new contact (SPEC §6)
-- p: { provider_id, from_address, from_name?, to_address, subject, body, rfc_message_id?, in_reply_to? }
-- ---------------------------------------------------------------------------

create or replace function public.record_inbound_email(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text := nullif(lower(trim(p ->> 'from_address')), '');
  v_contact uuid;
  v_created boolean := false;
  v_message uuid;
  v_existing uuid;
  v_name text := nullif(trim(p ->> 'from_name'), '');
  v_pipeline uuid;
begin
  if v_from is null then
    raise exception 'inbound_needs_sender' using errcode = '22023';
  end if;

  select id into v_existing from public.messages where channel = 'email' and provider_id = p ->> 'provider_id';
  if v_existing is not null then
    return jsonb_build_object('message_id', v_existing, 'duplicate_delivery', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('email:' || v_from));
  select id into v_contact from public.contacts where email = v_from order by created_at limit 1;

  if v_contact is null then
    insert into public.contacts (first_name, last_name, email, source)
    values (
      split_part(coalesce(v_name, ''), ' ', 1),
      nullif(regexp_replace(coalesce(v_name, ''), '^\S+\s*', ''), ''),
      v_from, 'other'
    )
    returning id into v_contact;
    v_created := true;
    select id into v_pipeline from public.pipelines where is_default;
    insert into public.opportunities (contact_id, pipeline_id, stage_key, source)
    values (v_contact, v_pipeline, 'new_inquiry', 'other');
  end if;

  insert into public.messages (contact_id, channel, direction, subject, body, status, provider_id,
                               from_address, to_address, rfc_message_id, in_reply_to, author_id, sent_at)
  values (v_contact, 'email', 'in', nullif(p ->> 'subject', ''), coalesce(p ->> 'body', ''), 'received',
          p ->> 'provider_id', v_from, p ->> 'to_address', p ->> 'rfc_message_id', p ->> 'in_reply_to', null, now())
  returning id into v_message;

  -- WORKFLOWS R1: the workflow engine (milestone 8) stops follow-ups on this event.
  insert into public.domain_events (type, payload) values ('message.received', jsonb_build_object(
    'contact_id', v_contact, 'message_id', v_message, 'channel', 'email', 'new_contact', v_created));

  return jsonb_build_object('message_id', v_message, 'contact_id', v_contact, 'created_contact', v_created, 'duplicate_delivery', false);
end;
$$;

revoke execute on function public.record_inbound_email(jsonb) from public, anon, authenticated;
grant execute on function public.record_inbound_email(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- record_email_event (server only): delivered / bounced / complained from the provider.
-- Bounces and complaints switch on do-not-email so we stop mailing that address (SPEC §12).
-- ---------------------------------------------------------------------------

create or replace function public.record_email_event(p_provider_id text, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
  v_rank constant text[] := array['test', 'queued', 'sent', 'delivered', 'bounced', 'complained', 'failed'];
begin
  if not p_status = any (v_rank) then
    raise exception 'unknown_email_status' using errcode = '22023';
  end if;
  update public.messages
     set status = case
           -- events can arrive out of order; never go back from delivered/bounced to sent
           when array_position(v_rank, p_status) > coalesce(array_position(v_rank, status), 0) then p_status
           else status
         end,
         error = coalesce(p_error, error)
   where channel = 'email' and direction = 'out' and provider_id = p_provider_id
  returning contact_id into v_contact;

  if v_contact is not null and p_status in ('bounced', 'complained') then
    update public.contacts set dnd_email = true where id = v_contact and not dnd_email;
  end if;
end;
$$;

revoke execute on function public.record_email_event(text, text, text) from public, anon, authenticated;
grant execute on function public.record_email_event(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- unsubscribe_contact (server only, from the signed link in marketing emails)
-- ---------------------------------------------------------------------------

create or replace function public.unsubscribe_contact(p_contact_id uuid, p_text text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.contacts set email_marketing_consent = false where id = p_contact_id;
  if not found then
    return false;
  end if;
  insert into public.consents (contact_id, channel, granted, text, source, recorded_by)
  values (p_contact_id, 'email', false, p_text, 'unsubscribe_link', null);
  return true;
end;
$$;

revoke execute on function public.unsubscribe_contact(uuid, text) from public, anon, authenticated;
grant execute on function public.unsubscribe_contact(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Inbox view: one row per contact with messages, latest first, with unread counts.
-- ---------------------------------------------------------------------------

create view public.inbox_threads with (security_invoker = true) as
select
  c.id as contact_id,
  coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.email, c.phone, 'Unnamed contact') as contact_name,
  last.channel as last_channel,
  last.direction as last_direction,
  last.subject as last_subject,
  left(last.body, 160) as last_preview,
  last.created_at as last_at,
  (select count(*) from public.messages u where u.contact_id = c.id and u.direction = 'in' and u.read_at is null)::integer as unread,
  -- "needs reply": the latest email/SMS is from them
  (last.direction = 'in') as needs_reply
from public.contacts c
join lateral (
  select m.channel, m.direction, m.subject, m.body, m.created_at
  from public.messages m
  where m.contact_id = c.id and m.channel in ('email', 'sms')
  order by m.created_at desc
  limit 1
) last on true;

revoke all on public.inbox_threads from anon;
grant select on public.inbox_threads to authenticated;

-- ---------------------------------------------------------------------------
-- RLS + triggers for the new tables
-- ---------------------------------------------------------------------------

create trigger studio_settings_updated_at before update on public.studio_settings
  for each row execute function public.set_updated_at();
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.studio_settings enable row level security;
alter table public.templates enable row level security;

revoke all on public.studio_settings, public.templates from anon;
grant select, update on public.studio_settings to authenticated;
grant select, insert, update, delete on public.templates to authenticated;

create policy "members read settings" on public.studio_settings
  for select to authenticated using (public.is_member());
create policy "owner edits settings" on public.studio_settings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "members read templates" on public.templates
  for select to authenticated using (public.is_member());
create policy "owner manages templates" on public.templates
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
