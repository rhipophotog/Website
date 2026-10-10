-- Milestone 4: lead capture (website inquiry form, Meta Lead Ads, Google Ads lead forms).
-- Every lead goes through capture_lead(): dedupe → contact → consent → opportunity → submission
-- → lead.created event, in one transaction. Only the server (service role) may call it.
-- Adds tables and functions only; nothing is dropped or renamed.

-- ---------------------------------------------------------------------------
-- forms: hosted forms and the exact SMS consent wording each one shows
-- ---------------------------------------------------------------------------

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_-]*$'),
  name text not null,
  enabled boolean not null default true,
  sms_consent_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.forms (key, name, sms_consent_text) values (
  'inquiry',
  'Wedding inquiry',
  'Yes, RHIPO Photography & Cinematography may text me about my inquiry and booking. Msg & data rates may apply. Reply STOP to opt out, HELP for help.'
);

-- ---------------------------------------------------------------------------
-- form_submissions: every lead as received, from any source
-- ---------------------------------------------------------------------------

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.forms (id) on delete set null,
  source text not null check (source in ('website', 'meta_ads', 'google_ads')),
  -- Meta leadgen id / Google lead id: makes webhook retries harmless
  external_id text unique,
  contact_id uuid references public.contacts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  -- sha256 of the visitor IP (+ salt), only for rate limiting; never the IP itself
  ip_hash text,
  created_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index form_submissions_contact_idx on public.form_submissions (contact_id);
create index form_submissions_rate_idx on public.form_submissions (ip_hash, created_at) where ip_hash is not null;

-- ---------------------------------------------------------------------------
-- domain_events: outbox of things that happened (lead.created, ...).
-- The workflow engine (milestone 8) consumes these; nothing reads them yet.
-- ---------------------------------------------------------------------------

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index domain_events_unprocessed_idx on public.domain_events (occurred_at) where processed_at is null;

create trigger forms_updated_at before update on public.forms
  for each row execute function public.set_updated_at();
create trigger form_submissions_updated_at before update on public.form_submissions
  for each row execute function public.set_updated_at();
create trigger domain_events_updated_at before update on public.domain_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- capture_lead
-- p_lead: { source, form_key?, external_id?, ip_hash?, first_name?, last_name?, partner_name?,
--           email?, phone? (E.164), city?, venue?, event_type?, event_date? (YYYY-MM-DD), services?[],
--           budget?, heard_about?, message?, sms_consent_text?, campaign?, ad?, data? }
-- Returns { contact_id, opportunity_id, submission_id, created_contact, duplicate_delivery }
-- ---------------------------------------------------------------------------

create or replace function public.capture_lead(p_lead jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := p_lead ->> 'source';
  v_email text := nullif(lower(trim(p_lead ->> 'email')), '');
  v_phone text := nullif(trim(p_lead ->> 'phone'), '');
  v_external text := nullif(p_lead ->> 'external_id', '');
  v_form public.forms%rowtype;
  v_contact public.contacts%rowtype;
  v_created boolean := false;
  v_opportunity uuid;
  v_submission uuid;
  v_pipeline uuid;
  v_event_date text := nullif(p_lead ->> 'event_date', '');
  v_existing jsonb;
  -- Where the person came from (e.g. "Instagram" picked on the website form); defaults to the channel.
  v_contact_source text := case
    when p_lead ->> 'contact_source' in ('website', 'instagram', 'meta_ads', 'google_ads', 'referral', 'weddingwire_knot', 'vendor', 'other')
      then p_lead ->> 'contact_source'
    else p_lead ->> 'source'
  end;
begin
  if v_source not in ('website', 'meta_ads', 'google_ads') then
    raise exception 'capture_lead_bad_source' using errcode = '22023';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'capture_lead_needs_email_or_phone' using errcode = '22023';
  end if;
  if v_event_date is not null and v_event_date !~ '^\d{4}-\d{2}-\d{2}$' then
    v_event_date := null;
  end if;

  -- Webhook retry: same lead delivered again → return what we did the first time.
  if v_external is not null then
    select jsonb_build_object('contact_id', contact_id, 'opportunity_id', opportunity_id, 'submission_id', id,
                              'created_contact', created_contact, 'duplicate_delivery', true)
      into v_existing
      from public.form_submissions where external_id = v_external;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- Serialise leads for the same person so two simultaneous submissions can't create two contacts.
  perform pg_advisory_xact_lock(hashtext(coalesce(v_email, '') || '|' || coalesce(v_phone, '')));
  if v_email is not null then perform pg_advisory_xact_lock(hashtext('email:' || v_email)); end if;
  if v_phone is not null then perform pg_advisory_xact_lock(hashtext('phone:' || v_phone)); end if;

  if p_lead ? 'form_key' then
    select * into v_form from public.forms where key = p_lead ->> 'form_key';
  end if;

  -- Dedupe (SPEC §5): email first, then phone.
  select * into v_contact from public.contacts
   where (v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone)
   order by (email = v_email) desc nulls last, created_at
   limit 1
   for update;

  if found then
    update public.contacts set
      first_name = coalesce(first_name, nullif(trim(p_lead ->> 'first_name'), '')),
      last_name = coalesce(last_name, nullif(trim(p_lead ->> 'last_name'), '')),
      partner_name = coalesce(partner_name, nullif(trim(p_lead ->> 'partner_name'), '')),
      email = coalesce(email, v_email),
      phone = coalesce(phone, v_phone),
      city = coalesce(city, nullif(trim(p_lead ->> 'city'), '')),
      source = coalesce(source, v_contact_source)
    where id = v_contact.id
    returning * into v_contact;
  else
    insert into public.contacts (first_name, last_name, partner_name, email, phone, city, source, referral_by)
    values (
      nullif(trim(p_lead ->> 'first_name'), ''),
      nullif(trim(p_lead ->> 'last_name'), ''),
      nullif(trim(p_lead ->> 'partner_name'), ''),
      v_email, v_phone,
      nullif(trim(p_lead ->> 'city'), ''),
      v_contact_source,
      nullif(trim(p_lead ->> 'referral_by'), '')
    )
    returning * into v_contact;
    v_created := true;
  end if;

  -- SMS consent, with the exact wording shown (SPEC §4, §12).
  -- Consent covers the number they typed, so only record it when that's the contact's number.
  if nullif(p_lead ->> 'sms_consent_text', '') is not null and v_phone is not null and v_contact.phone = v_phone then
    insert into public.consents (contact_id, channel, granted, text, source, recorded_by)
    values (v_contact.id, 'sms', true, p_lead ->> 'sms_consent_text',
            case v_source when 'website' then 'website_form' else v_source || '_form' end, null);
  end if;

  -- A new card unless they already have an active one (anything not lost/cold/delivered).
  select o.id into v_opportunity
    from public.opportunities o
    join public.stages s on s.pipeline_id = o.pipeline_id and s.key = o.stage_key
   where o.contact_id = v_contact.id and s.kind = 'open' and o.stage_key <> 'delivered'
   order by o.created_at desc
   limit 1;

  if v_opportunity is null then
    select id into v_pipeline from public.pipelines where is_default;
    insert into public.opportunities (contact_id, pipeline_id, stage_key, couple_names, event_type, event_dates,
                                      venue, city, services, source)
    values (
      v_contact.id, v_pipeline, 'new_inquiry',
      nullif(concat_ws(' & ', nullif(trim(p_lead ->> 'first_name'), ''), nullif(trim(p_lead ->> 'partner_name'), '')), ''),
      case when p_lead ->> 'event_type' in ('hindu', 'sikh', 'muslim', 'jain', 'fusion', 'other') then p_lead ->> 'event_type' end,
      case when v_event_date is not null then jsonb_build_array(jsonb_build_object('name', 'Wedding', 'date', v_event_date)) else '[]'::jsonb end,
      nullif(trim(p_lead ->> 'venue'), ''),
      nullif(trim(p_lead ->> 'city'), ''),
      coalesce(
        (select array_agg(s) from jsonb_array_elements_text(coalesce(p_lead -> 'services', '[]'::jsonb)) s
          where s in ('photo', 'video', 'drone', 'album')),
        '{}'
      ),
      v_contact_source
    )
    returning id into v_opportunity;
  end if;

  insert into public.form_submissions (form_id, source, external_id, contact_id, opportunity_id, data, ip_hash, created_contact)
  values (v_form.id, v_source, v_external, v_contact.id, v_opportunity,
          coalesce(p_lead -> 'data', p_lead - 'ip_hash'), nullif(p_lead ->> 'ip_hash', ''), v_created)
  returning id into v_submission;

  -- Put what they wrote where the studio will see it.
  insert into public.messages (contact_id, channel, direction, body, author_id)
  values (v_contact.id, 'note', 'internal',
    concat_ws(E'\n',
      'New inquiry via ' || case v_source when 'website' then 'website form' when 'meta_ads' then 'Meta lead ad' else 'Google Ads lead form' end
        || coalesce(' (' || nullif(concat_ws(' / ', p_lead ->> 'campaign', p_lead ->> 'ad'), '') || ')', ''),
      'Wedding date: ' || coalesce(v_event_date, nullif(p_lead ->> 'event_date_text', '')),
      'Venue / city: ' || nullif(concat_ws(', ', nullif(p_lead ->> 'venue', ''), nullif(p_lead ->> 'city', '')), ''),
      'Budget: ' || nullif(p_lead ->> 'budget', ''),
      'Heard about us: ' || nullif(p_lead ->> 'heard_about', ''),
      nullif(E'\n' || coalesce(p_lead ->> 'message', ''), E'\n')
    ),
    null);

  perform public.log_activity(v_contact.id, 'lead.captured',
    jsonb_strip_nulls(jsonb_build_object('source', v_source, 'form', v_form.key, 'campaign', p_lead ->> 'campaign', 'ad', p_lead ->> 'ad')),
    v_opportunity);

  insert into public.domain_events (type, payload) values ('lead.created', jsonb_build_object(
    'contact_id', v_contact.id, 'opportunity_id', v_opportunity, 'submission_id', v_submission,
    'source', v_source, 'new_contact', v_created));

  return jsonb_build_object('contact_id', v_contact.id, 'opportunity_id', v_opportunity, 'submission_id', v_submission,
                            'created_contact', v_created, 'duplicate_delivery', false);
end;
$$;

revoke execute on function public.capture_lead(jsonb) from public, anon, authenticated;
grant execute on function public.capture_lead(jsonb) to service_role;

-- Rate limit helper for the public form (server only).
create or replace function public.recent_submissions(p_ip_hash text, p_minutes integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.form_submissions
  where ip_hash = p_ip_hash and created_at > now() - make_interval(mins => p_minutes);
$$;

revoke execute on function public.recent_submissions(text, integer) from public, anon, authenticated;
grant execute on function public.recent_submissions(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security: the public never touches these tables directly.
-- ---------------------------------------------------------------------------

alter table public.forms enable row level security;
alter table public.form_submissions enable row level security;
alter table public.domain_events enable row level security;

revoke all on public.forms, public.form_submissions, public.domain_events from anon;
grant select on public.forms, public.form_submissions to authenticated;
grant update on public.forms to authenticated;

create policy "members read forms" on public.forms
  for select to authenticated using (public.is_member());
create policy "owner edits forms" on public.forms
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "members read submissions" on public.form_submissions
  for select to authenticated using (public.is_member());

-- domain_events: no policies → only the service role (workflow engine) can read or write.
revoke all on public.domain_events from authenticated;
