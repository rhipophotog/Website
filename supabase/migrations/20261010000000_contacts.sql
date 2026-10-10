-- Milestone 2: contacts, tags, consents, notes, activity timeline, CSV imports, saved views.
-- Adds tables and columns only; nothing is dropped or renamed.

-- ---------------------------------------------------------------------------
-- contacts: normalised email, GoHighLevel id, link to the import that created it
-- ---------------------------------------------------------------------------

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  source text not null default 'gohighlevel' check (source in ('gohighlevel', 'csv')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'undone')),
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  -- [{ "row": 12, "message": "Invalid phone" }, ...] (capped by the app)
  errors jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts
  add column ghl_contact_id text,
  add column import_id uuid references public.imports (id) on delete set null;

-- Plain (not partial) unique indexes so imports can upsert on them; NULLs never conflict.
create unique index contacts_ghl_contact_id_key on public.contacts (ghl_contact_id);
create index contacts_import_idx on public.contacts (import_id) where import_id is not null;

alter table public.opportunities add column ghl_opportunity_id text;
create unique index opportunities_ghl_opportunity_id_key on public.opportunities (ghl_opportunity_id);

-- Emails are matched exactly for dedupe, so store them trimmed and lower-case.
create or replace function public.normalize_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email = nullif(lower(trim(new.email)), '');
  new.phone = nullif(trim(new.phone), '');
  new.first_name = nullif(trim(new.first_name), '');
  new.last_name = nullif(trim(new.last_name), '');
  new.partner_name = nullif(trim(new.partner_name), '');
  return new;
end;
$$;

create trigger contacts_normalize before insert or update on public.contacts
  for each row execute function public.normalize_contact();

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = trim(name) and length(name) between 1 and 60),
  -- lower-case name; tags match case-insensitively ("VIP" = "vip")
  slug text generated always as (lower(name)) stored unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, tag_id)
);

create index contact_tags_tag_idx on public.contact_tags (tag_id);

-- ---------------------------------------------------------------------------
-- consents (SPEC §4, §12): append-only history; the latest row per channel wins
-- ---------------------------------------------------------------------------

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  granted boolean not null,
  -- the exact consent wording shown to the person
  text text not null check (length(trim(text)) > 0),
  source text not null check (length(trim(source)) > 0),
  at timestamptz not null default now(),
  recorded_by uuid references public.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consents_contact_idx on public.consents (contact_id, channel, at desc);

-- ---------------------------------------------------------------------------
-- messages (SPEC §11). Milestone 2 uses it for internal notes; email and SMS arrive in 5 and 6.
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'note')),
  direction text not null check (direction in ('in', 'out', 'internal')),
  subject text,
  body text not null,
  status text,
  provider_id text,
  author_id uuid references public.users (id) on delete set null default auth.uid(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((channel = 'note') = (direction = 'internal'))
);

create index messages_contact_idx on public.messages (contact_id, created_at desc);

-- ---------------------------------------------------------------------------
-- contact_activity: the timeline. Written only by the triggers below, never by the app,
-- so it can't be forged or edited.
-- ---------------------------------------------------------------------------

create table public.contact_activity (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  actor_id uuid references public.users (id) on delete set null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_activity_contact_idx on public.contact_activity (contact_id, at desc);

create or replace function public.log_activity(
  p_contact_id uuid, p_kind text, p_data jsonb default '{}'::jsonb, p_opportunity_id uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  -- clock_timestamp(), not now(): entries written in one transaction still sort in order.
  insert into public.contact_activity (contact_id, opportunity_id, kind, data, actor_id, at)
  values (
    p_contact_id, p_opportunity_id, p_kind, p_data,
    (select id from public.users where id = auth.uid()),
    clock_timestamp()
  );
$$;

revoke execute on function public.log_activity(uuid, text, jsonb, uuid) from public, anon, authenticated;

create or replace function public.contacts_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  -- merge_contacts logs one "merged" entry instead of a field-by-field trail.
  if current_setting('rhipo.merging', true) = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.id, 'contact.created',
      jsonb_strip_nulls(jsonb_build_object('source', new.source, 'import_id', new.import_id)));
  elsif tg_op = 'UPDATE' then
    select array_agg(key order by key) into changed
    from jsonb_each(to_jsonb(new)) n
    where key not in ('updated_at', 'created_at', 'import_id')
      and n.value is distinct from (to_jsonb(old) -> key);
    if changed is not null then
      perform public.log_activity(new.id, 'contact.updated', jsonb_build_object('fields', changed));
    end if;
  end if;
  return null;
end;
$$;

create trigger contacts_log_activity after insert or update on public.contacts
  for each row execute function public.contacts_activity();

create or replace function public.contact_tags_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_ public.contact_tags%rowtype;
begin
  if current_setting('rhipo.merging', true) = 'on' then
    return null;
  end if;
  row_ := case when tg_op = 'DELETE' then old else new end;
  -- Skip when the contact itself is being deleted (cascade).
  if not exists (select 1 from public.contacts where id = row_.contact_id) then
    return null;
  end if;
  perform public.log_activity(
    row_.contact_id,
    case when tg_op = 'DELETE' then 'tag.removed' else 'tag.added' end,
    jsonb_build_object('tag', (select name from public.tags where id = row_.tag_id))
  );
  return null;
end;
$$;

create trigger contact_tags_log_activity after insert or delete on public.contact_tags
  for each row execute function public.contact_tags_activity();

create or replace function public.opportunities_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.contact_id, 'opportunity.created',
      jsonb_build_object('stage', new.stage_key), new.id);
  elsif new.stage_key is distinct from old.stage_key then
    perform public.log_activity(new.contact_id, 'stage.changed',
      jsonb_build_object('from', old.stage_key, 'to', new.stage_key), new.id);
  end if;
  return null;
end;
$$;

create trigger opportunities_log_activity after insert or update of stage_key on public.opportunities
  for each row execute function public.opportunities_activity();

create or replace function public.consents_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_activity(new.contact_id, 'consent.recorded',
    jsonb_build_object('channel', new.channel, 'granted', new.granted, 'source', new.source));
  return null;
end;
$$;

create trigger consents_log_activity after insert on public.consents
  for each row execute function public.consents_activity();

-- ---------------------------------------------------------------------------
-- saved_views: named contact filters, personal or shared with the team
-- ---------------------------------------------------------------------------

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  owner_id uuid not null references public.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Views used by the contacts list and the duplicates page. security_invoker so RLS applies.
-- ---------------------------------------------------------------------------

create view public.contact_list with (security_invoker = true) as
select
  c.*,
  coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.email, c.phone, 'Unnamed contact') as display_name,
  coalesce(
    (select array_agg(t.name order by t.name) from public.contact_tags ct join public.tags t on t.id = ct.tag_id
     where ct.contact_id = c.id),
    '{}'
  ) as tag_names,
  coalesce(
    (select array_agg(distinct o.stage_key) from public.opportunities o where o.contact_id = c.id),
    '{}'
  ) as stage_keys,
  coalesce(
    (select array_agg(distinct left(d ->> 'date', 7))
     from public.opportunities o, jsonb_array_elements(o.event_dates) d
     where o.contact_id = c.id and d ->> 'date' ~ '^\d{4}-\d{2}'),
    '{}'
  ) as event_months,
  (select min(d ->> 'date')
   from public.opportunities o, jsonb_array_elements(o.event_dates) d
   where o.contact_id = c.id and d ->> 'date' ~ '^\d{4}-\d{2}-\d{2}') as first_event_date
from public.contacts c;

create view public.contact_duplicates with (security_invoker = true) as
select a.id as contact_id, b.id as duplicate_id,
  case when a.email is not null and a.email = b.email then 'email' else 'phone' end as matched_on
from public.contacts a
join public.contacts b
  on a.id < b.id
 and ((a.email is not null and a.email = b.email) or (a.phone is not null and a.phone = b.phone));

-- ---------------------------------------------------------------------------
-- merge_contacts: folds `p_duplicate` into `p_primary` in one transaction.
-- p_take lists fields whose value should come from the duplicate.
-- SECURITY DEFINER because it must move rows users can't edit directly (consent evidence,
-- the activity timeline, other people's notes); the owner check below is the gate.
-- ---------------------------------------------------------------------------

create or replace function public.merge_contacts(p_primary uuid, p_duplicate uuid, p_take text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'first_name', 'last_name', 'partner_name', 'email', 'phone', 'preferred_contact', 'city', 'state',
    'country', 'language', 'time_zone', 'source', 'referral_by', 'assigned_to', 'ghl_contact_id'
  ];
  dup public.contacts%rowtype;
  field text;
begin
  if p_primary = p_duplicate then
    raise exception 'merge_same_contact' using errcode = 'P0001';
  end if;
  if not public.is_owner() then
    raise exception 'only_owner_can_merge' using errcode = '42501';
  end if;

  select * into dup from public.contacts where id = p_duplicate for update;
  if not found or not exists (select 1 from public.contacts where id = p_primary) then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;

  perform set_config('rhipo.merging', 'on', true);

  -- Free unique values on the duplicate before copying them over.
  if dup.ghl_contact_id is not null then
    update public.contacts set ghl_contact_id = null where id = p_duplicate;
  end if;

  foreach field in array coalesce(p_take, '{}') loop
    if not field = any (allowed) then
      raise exception 'merge_field_not_allowed: %', field using errcode = '22023';
    end if;
    execute format('update public.contacts set %I = $1.%I where id = $2', field, field) using dup, p_primary;
  end loop;

  -- Fill anything still blank on the primary from the duplicate.
  update public.contacts p set
    first_name = coalesce(p.first_name, dup.first_name),
    last_name = coalesce(p.last_name, dup.last_name),
    partner_name = coalesce(p.partner_name, dup.partner_name),
    email = coalesce(p.email, dup.email),
    phone = coalesce(p.phone, dup.phone),
    city = coalesce(p.city, dup.city),
    state = coalesce(p.state, dup.state),
    country = coalesce(p.country, dup.country),
    language = coalesce(p.language, dup.language),
    time_zone = coalesce(p.time_zone, dup.time_zone),
    source = coalesce(p.source, dup.source),
    referral_by = coalesce(p.referral_by, dup.referral_by),
    ghl_contact_id = coalesce(p.ghl_contact_id, dup.ghl_contact_id),
    -- Safety flags: if either record says stop, keep stopping.
    dnd_email = p.dnd_email or dup.dnd_email,
    dnd_sms = p.dnd_sms or dup.dnd_sms,
    stop_automations = p.stop_automations or dup.stop_automations,
    created_at = least(p.created_at, dup.created_at)
  where p.id = p_primary;

  insert into public.contact_tags (contact_id, tag_id)
  select p_primary, tag_id from public.contact_tags where contact_id = p_duplicate
  on conflict (contact_id, tag_id) do nothing;

  update public.opportunities set contact_id = p_primary where contact_id = p_duplicate;
  update public.consents set contact_id = p_primary where contact_id = p_duplicate;
  update public.messages set contact_id = p_primary where contact_id = p_duplicate;
  update public.contact_activity set contact_id = p_primary where contact_id = p_duplicate;

  delete from public.contacts where id = p_duplicate;
  perform set_config('rhipo.merging', 'off', true);

  perform public.log_activity(p_primary, 'contact.merged', jsonb_strip_nulls(jsonb_build_object(
    'merged_name', nullif(trim(concat_ws(' ', dup.first_name, dup.last_name)), ''),
    'merged_email', dup.email
  )));
end;
$$;

revoke execute on function public.merge_contacts(uuid, uuid, text[]) from public, anon;
grant execute on function public.merge_contacts(uuid, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- find_contacts_for_import: existing contacts matching any of the given keys.
-- An RPC (POST body) rather than a long `in.(...)` URL filter. Runs as the caller (RLS).
-- ---------------------------------------------------------------------------

create or replace function public.find_contacts_for_import(p_emails text[], p_phones text[], p_ghl_ids text[])
returns table (
  id uuid, email text, phone text, ghl_contact_id text,
  first_name text, last_name text, partner_name text, city text, state text, country text,
  language text, source text, referral_by text, has_opportunity boolean
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.email, c.phone, c.ghl_contact_id,
    c.first_name, c.last_name, c.partner_name, c.city, c.state, c.country,
    c.language, c.source, c.referral_by,
    exists (select 1 from public.opportunities o where o.contact_id = c.id)
  from public.contacts c
  where c.email = any (p_emails) or c.phone = any (p_phones) or c.ghl_contact_id = any (p_ghl_ids);
$$;

revoke execute on function public.find_contacts_for_import(text[], text[], text[]) from public, anon;
grant execute on function public.find_contacts_for_import(text[], text[], text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger imports_updated_at before update on public.imports
  for each row execute function public.set_updated_at();
create trigger tags_updated_at before update on public.tags
  for each row execute function public.set_updated_at();
create trigger contact_tags_updated_at before update on public.contact_tags
  for each row execute function public.set_updated_at();
create trigger consents_updated_at before update on public.consents
  for each row execute function public.set_updated_at();
create trigger messages_updated_at before update on public.messages
  for each row execute function public.set_updated_at();
create trigger contact_activity_updated_at before update on public.contact_activity
  for each row execute function public.set_updated_at();
create trigger saved_views_updated_at before update on public.saved_views
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.imports enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.consents enable row level security;
alter table public.messages enable row level security;
alter table public.contact_activity enable row level security;
alter table public.saved_views enable row level security;

revoke all on
  public.imports, public.tags, public.contact_tags, public.consents, public.messages,
  public.contact_activity, public.saved_views, public.contact_list, public.contact_duplicates
from anon;

grant select, insert, update, delete on
  public.imports, public.tags, public.contact_tags, public.consents, public.messages, public.saved_views
to authenticated;
grant select on public.contact_activity, public.contact_list, public.contact_duplicates to authenticated;

-- imports: owner only (bulk changes and undo)
create policy "owner manages imports" on public.imports
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- tags: members read, create and attach; owner deletes tags entirely
create policy "members read tags" on public.tags
  for select to authenticated using (public.is_member());
create policy "members add tags" on public.tags
  for insert to authenticated with check (public.is_member());
create policy "owner edits tags" on public.tags
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes tags" on public.tags
  for delete to authenticated using (public.is_owner());

create policy "members read contact tags" on public.contact_tags
  for select to authenticated using (public.is_member());
create policy "members tag contacts" on public.contact_tags
  for insert to authenticated with check (public.is_member());
create policy "members untag contacts" on public.contact_tags
  for delete to authenticated using (public.is_member());

-- consents: append-only evidence. Members record; nobody edits or deletes (except by deleting the contact).
create policy "members read consents" on public.consents
  for select to authenticated using (public.is_member());
create policy "members record consents" on public.consents
  for insert to authenticated with check (public.is_member() and recorded_by = auth.uid());
revoke update, delete on public.consents from authenticated;

-- messages: members read and write notes; authors edit their own notes; owner deletes
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_member());
create policy "members add notes" on public.messages
  for insert to authenticated
  with check (public.is_member() and channel = 'note' and author_id = auth.uid());
create policy "authors edit own notes" on public.messages
  for update to authenticated
  using (channel = 'note' and author_id = auth.uid())
  with check (channel = 'note' and author_id = auth.uid());
create policy "owner deletes messages" on public.messages
  for delete to authenticated using (public.is_owner());

-- contact_activity: read-only for members (written by triggers)
create policy "members read activity" on public.contact_activity
  for select to authenticated using (public.is_member());

-- saved_views: yours, plus ones shared with the team
create policy "read own or shared views" on public.saved_views
  for select to authenticated using (public.is_member() and (owner_id = auth.uid() or shared));
create policy "create own views" on public.saved_views
  for insert to authenticated with check (public.is_member() and owner_id = auth.uid());
create policy "edit own views" on public.saved_views
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own views" on public.saved_views
  for delete to authenticated using (owner_id = auth.uid());
