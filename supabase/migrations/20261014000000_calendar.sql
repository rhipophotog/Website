-- Milestone 7: calendar and booking (SPEC §7).
-- Availability, appointment types, appointments (no double-booking, enforced here),
-- the Google Calendar connection, and server-only booking functions.
-- Adds tables and functions only; nothing is dropped or renamed.

-- ---------------------------------------------------------------------------
-- availability_settings: one row
-- weekly_hours: { "0": [], "1": [["10:00","18:00"]], ... } (0 = Sunday), in time_zone
-- ---------------------------------------------------------------------------

create table public.availability_settings (
  id boolean primary key default true check (id),
  time_zone text not null default 'America/Los_Angeles',
  weekly_hours jsonb not null default '{
    "0": [], "1": [["10:00","18:00"]], "2": [["10:00","18:00"]], "3": [["10:00","18:00"]],
    "4": [["10:00","18:00"]], "5": [["10:00","18:00"]], "6": [["10:00","14:00"]]
  }'::jsonb check (jsonb_typeof(weekly_hours) = 'object'),
  buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 240),
  min_notice_minutes integer not null default 720 check (min_notice_minutes between 0 and 20160),
  max_days_ahead integer not null default 60 check (max_days_ahead between 1 and 365),
  max_per_day integer not null default 4 check (max_per_day between 1 and 50),
  slot_step_minutes integer not null default 30 check (slot_step_minutes in (10, 15, 20, 30, 60)),
  zoom_link text check (zoom_link is null or zoom_link ~ '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.availability_settings default values;

create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- appointment_types (SPEC §7). key is the public URL: /book/<key>
-- ---------------------------------------------------------------------------

create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9-]*$'),
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  location_kind text not null default 'zoom' check (location_kind in ('zoom', 'phone', 'in_person')),
  location_detail text, -- address for in-person
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.appointment_types (key, name, description, duration_minutes, location_kind, position) values
  ('discovery', 'Discovery call', 'A relaxed 20-minute call to hear about your wedding and answer your questions.', 20, 'zoom', 1),
  ('consult', 'Studio consult', 'A 45-minute deep dive into your events, coverage and collections.', 45, 'zoom', 2),
  ('engagement-planning', 'Engagement shoot planning', 'Plan locations, outfits and timing for your engagement session.', 30, 'zoom', 3);

-- ---------------------------------------------------------------------------
-- appointments. The exclusion constraint makes double-booking impossible, even if two
-- people submit the same slot at the same instant.
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.appointment_types (id),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'completed', 'no_show', 'cancelled')),
  location text,
  notes text,
  guest_time_zone text,
  google_event_id text,
  cancel_reason text,
  ip_hash text,
  booked_by text not null default 'guest' check (booked_by in ('guest', 'studio')),
  created_by uuid references public.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint appointments_no_overlap exclude using gist (during with &&) where (status in ('booked', 'confirmed'))
);

create index appointments_starts_idx on public.appointments (starts_at);
create index appointments_contact_idx on public.appointments (contact_id);
create index appointments_ip_idx on public.appointments (ip_hash, created_at) where ip_hash is not null;

-- Status changes: timeline entry + workflow event (WORKFLOWS §1.2 appointment.* triggers).
create or replace function public.appointments_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  select key into v_type from public.appointment_types where id = new.type_id;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.contact_id, 'appointment.booked',
      jsonb_build_object('type', v_type, 'starts_at', new.starts_at, 'appointment_id', new.id), new.opportunity_id);
    insert into public.domain_events (type, payload) values ('appointment.booked', jsonb_build_object(
      'appointment_id', new.id, 'contact_id', new.contact_id, 'opportunity_id', new.opportunity_id,
      'type', v_type, 'starts_at', new.starts_at));
  elsif new.status is distinct from old.status then
    perform public.log_activity(new.contact_id, 'appointment.' || new.status,
      jsonb_build_object('type', v_type, 'starts_at', new.starts_at, 'appointment_id', new.id), new.opportunity_id);
    insert into public.domain_events (type, payload) values (
      'appointment.' || case new.status when 'no_show' then 'no_show' else new.status end,
      jsonb_build_object('appointment_id', new.id, 'contact_id', new.contact_id, 'opportunity_id', new.opportunity_id,
                         'type', v_type, 'starts_at', new.starts_at));
  elsif new.starts_at is distinct from old.starts_at then
    perform public.log_activity(new.contact_id, 'appointment.rescheduled',
      jsonb_build_object('type', v_type, 'from', old.starts_at, 'starts_at', new.starts_at, 'appointment_id', new.id), new.opportunity_id);
    insert into public.domain_events (type, payload) values ('appointment.rescheduled', jsonb_build_object(
      'appointment_id', new.id, 'contact_id', new.contact_id, 'type', v_type, 'from', old.starts_at, 'starts_at', new.starts_at));
  end if;
  return null;
end;
$$;

create trigger appointments_log_events after insert or update on public.appointments
  for each row execute function public.appointments_events();

-- ---------------------------------------------------------------------------
-- Google Calendar connection (one row). Tokens are encrypted by the app (AES-256-GCM)
-- before they get here, and signed-in users can't even select the token columns.
-- ---------------------------------------------------------------------------

create table public.google_calendar_connection (
  id boolean primary key default true check (id),
  account_email text,
  calendar_id text not null default 'primary',
  refresh_token_enc text not null,
  access_token_enc text,
  access_token_expires_at timestamptz,
  connected_by uuid references public.users (id) on delete set null default auth.uid(),
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- book_appointment (server only): the public booking page and manual bookings.
-- p: { type_key, starts_at, guest_time_zone?, first_name, last_name?, partner_name?, email, phone?,
--      event_date?, notes?, sms_consent_text?, ip_hash?, location?, booked_by? ('guest'|'studio'), contact_id? }
-- ---------------------------------------------------------------------------

create or replace function public.book_appointment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.appointment_types%rowtype;
  v_start timestamptz := (p ->> 'starts_at')::timestamptz;
  v_email text := nullif(lower(trim(p ->> 'email')), '');
  v_phone text := nullif(trim(p ->> 'phone'), '');
  v_contact public.contacts%rowtype;
  v_created boolean := false;
  v_opportunity uuid;
  v_stage text;
  v_pipeline uuid;
  v_appointment uuid;
  v_event_date text := nullif(p ->> 'event_date', '');
begin
  select * into v_type from public.appointment_types where key = p ->> 'type_key' and active;
  if not found then
    raise exception 'unknown_appointment_type' using errcode = '22023';
  end if;
  if v_event_date is not null and v_event_date !~ '^\d{4}-\d{2}-\d{2}$' then
    v_event_date := null;
  end if;

  if p ? 'contact_id' then
    select * into v_contact from public.contacts where id = (p ->> 'contact_id')::uuid for update;
  else
    if v_email is null and v_phone is null then
      raise exception 'booking_needs_email_or_phone' using errcode = '22023';
    end if;
    if v_email is not null then perform pg_advisory_xact_lock(hashtext('email:' || v_email)); end if;
    if v_phone is not null then perform pg_advisory_xact_lock(hashtext('phone:' || v_phone)); end if;
    select * into v_contact from public.contacts
     where (v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone)
     order by (email = v_email) desc nulls last, created_at
     limit 1
     for update;
  end if;

  if v_contact.id is not null then
    update public.contacts set
      first_name = coalesce(first_name, nullif(trim(p ->> 'first_name'), '')),
      last_name = coalesce(last_name, nullif(trim(p ->> 'last_name'), '')),
      partner_name = coalesce(partner_name, nullif(trim(p ->> 'partner_name'), '')),
      email = coalesce(email, v_email),
      phone = coalesce(phone, v_phone),
      time_zone = coalesce(time_zone, nullif(p ->> 'guest_time_zone', ''))
    where id = v_contact.id
    returning * into v_contact;
  else
    insert into public.contacts (first_name, last_name, partner_name, email, phone, source, time_zone)
    values (nullif(trim(p ->> 'first_name'), ''), nullif(trim(p ->> 'last_name'), ''), nullif(trim(p ->> 'partner_name'), ''),
            v_email, v_phone, 'website', nullif(p ->> 'guest_time_zone', ''))
    returning * into v_contact;
    v_created := true;
  end if;

  if nullif(p ->> 'sms_consent_text', '') is not null and v_phone is not null and v_contact.phone = v_phone then
    insert into public.consents (contact_id, channel, granted, text, source, recorded_by)
    values (v_contact.id, 'sms', true, p ->> 'sms_consent_text', 'booking_form', null);
  end if;

  -- Their active card, or a new one.
  select o.id, o.stage_key into v_opportunity, v_stage
    from public.opportunities o
    join public.stages s on s.pipeline_id = o.pipeline_id and s.key = o.stage_key
   where o.contact_id = v_contact.id and s.kind = 'open' and o.stage_key <> 'delivered'
   order by o.created_at desc
   limit 1;
  if v_opportunity is null then
    select id into v_pipeline from public.pipelines where is_default;
    insert into public.opportunities (contact_id, pipeline_id, stage_key, couple_names, event_dates, source)
    values (v_contact.id, v_pipeline, 'consult_scheduled',
            nullif(concat_ws(' & ', v_contact.first_name, v_contact.partner_name), ''),
            case when v_event_date is not null then jsonb_build_array(jsonb_build_object('name', 'Wedding', 'date', v_event_date)) else '[]'::jsonb end,
            coalesce(v_contact.source, 'website'))
    returning id into v_opportunity;
  else
    -- WORKFLOWS W3 step 1: booking moves early-stage cards to Consult scheduled.
    if v_stage in ('new_inquiry', 'contacted') then
      update public.opportunities set stage_key = 'consult_scheduled' where id = v_opportunity;
    end if;
    if v_event_date is not null then
      update public.opportunities set event_dates = jsonb_build_array(jsonb_build_object('name', 'Wedding', 'date', v_event_date))
       where id = v_opportunity and event_dates = '[]'::jsonb;
    end if;
  end if;

  -- The exclusion constraint rejects an overlapping slot with SQLSTATE 23P01.
  insert into public.appointments (type_id, contact_id, opportunity_id, starts_at, ends_at, location, notes,
                                   guest_time_zone, ip_hash, booked_by, created_by)
  values (v_type.id, v_contact.id, v_opportunity, v_start, v_start + make_interval(mins => v_type.duration_minutes),
          nullif(p ->> 'location', ''), nullif(trim(p ->> 'notes'), ''), nullif(p ->> 'guest_time_zone', ''),
          nullif(p ->> 'ip_hash', ''), coalesce(p ->> 'booked_by', 'guest'),
          case when p ? 'created_by' then (p ->> 'created_by')::uuid end)
  returning id into v_appointment;

  if v_created then
    insert into public.domain_events (type, payload) values ('lead.created', jsonb_build_object(
      'contact_id', v_contact.id, 'opportunity_id', v_opportunity, 'source', 'booking', 'new_contact', true));
  end if;

  return jsonb_build_object('appointment_id', v_appointment, 'contact_id', v_contact.id,
                            'opportunity_id', v_opportunity, 'created_contact', v_created);
end;
$$;

revoke execute on function public.book_appointment(jsonb) from public, anon, authenticated;
grant execute on function public.book_appointment(jsonb) to service_role;

-- Guests manage their own booking with a signed link; the server calls these.
create or replace function public.guest_cancel_appointment(p_id uuid, p_reason text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.appointments set status = 'cancelled', cancel_reason = nullif(trim(p_reason), '')
    where id = p_id and status in ('booked', 'confirmed') and starts_at > now()
    returning id
  )
  select exists (select 1 from updated);
$$;

create or replace function public.guest_reschedule_appointment(p_id uuid, p_starts_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minutes integer;
begin
  select t.duration_minutes into v_minutes
    from public.appointments a join public.appointment_types t on t.id = a.type_id
   where a.id = p_id and a.status in ('booked', 'confirmed') and a.starts_at > now();
  if v_minutes is null then
    return false;
  end if;
  update public.appointments set starts_at = p_starts_at, ends_at = p_starts_at + make_interval(mins => v_minutes)
  where id = p_id;
  return true;
end;
$$;

-- Busy ranges for the public slot picker: times only, never who.
create or replace function public.busy_ranges(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.starts_at, a.ends_at from public.appointments a
  where a.status in ('booked', 'confirmed') and a.during && tstzrange(p_from, p_to, '[)');
$$;

-- Rate limit for the public booking page.
create or replace function public.recent_bookings(p_ip_hash text, p_minutes integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.appointments
  where ip_hash = p_ip_hash and created_at > now() - make_interval(mins => p_minutes);
$$;

revoke execute on function public.guest_cancel_appointment(uuid, text), public.guest_reschedule_appointment(uuid, timestamptz),
  public.busy_ranges(timestamptz, timestamptz), public.recent_bookings(text, integer) from public, anon, authenticated;
grant execute on function public.guest_cancel_appointment(uuid, text), public.guest_reschedule_appointment(uuid, timestamptz),
  public.busy_ranges(timestamptz, timestamptz), public.recent_bookings(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- updated_at, RLS
-- ---------------------------------------------------------------------------

create trigger availability_settings_updated_at before update on public.availability_settings
  for each row execute function public.set_updated_at();
create trigger blocked_dates_updated_at before update on public.blocked_dates
  for each row execute function public.set_updated_at();
create trigger appointment_types_updated_at before update on public.appointment_types
  for each row execute function public.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger google_calendar_connection_updated_at before update on public.google_calendar_connection
  for each row execute function public.set_updated_at();

alter table public.availability_settings enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.appointment_types enable row level security;
alter table public.appointments enable row level security;
alter table public.google_calendar_connection enable row level security;

revoke all on public.availability_settings, public.blocked_dates, public.appointment_types, public.appointments,
  public.google_calendar_connection from anon;
grant select, update on public.availability_settings to authenticated;
grant select, insert, update, delete on public.blocked_dates, public.appointment_types, public.appointments to authenticated;
-- Tokens never leave the server: signed-in users may see who's connected, not the tokens.
revoke all on public.google_calendar_connection from authenticated;
grant select (id, account_email, calendar_id, connected_at) on public.google_calendar_connection to authenticated;
grant delete on public.google_calendar_connection to authenticated;

create policy "members read availability" on public.availability_settings
  for select to authenticated using (public.is_member());
create policy "owner edits availability" on public.availability_settings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "members read blocked dates" on public.blocked_dates
  for select to authenticated using (public.is_member());
create policy "owner manages blocked dates" on public.blocked_dates
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "members read appointment types" on public.appointment_types
  for select to authenticated using (public.is_member());
create policy "owner manages appointment types" on public.appointment_types
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "members read appointments" on public.appointments
  for select to authenticated using (public.is_member());
create policy "members add appointments" on public.appointments
  for insert to authenticated with check (public.is_member() and booked_by = 'studio');
create policy "members update appointments" on public.appointments
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "owner deletes appointments" on public.appointments
  for delete to authenticated using (public.is_owner());

create policy "members see the calendar connection" on public.google_calendar_connection
  for select to authenticated using (public.is_member());
create policy "owner disconnects the calendar" on public.google_calendar_connection
  for delete to authenticated using (public.is_owner());
