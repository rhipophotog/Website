-- Milestone 1: scaffold.
-- Base tables, roles, row-level security and the wedding pipeline stages (SPEC §2, §3, §4, §11).
-- Later milestones add the remaining §11 tables in their own migrations.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users: one profile row per auth user, carries the app role
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'team' check (role in ('owner', 'team')),
  time_zone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_key on public.users (lower(email));

-- Role checks used by every policy. SECURITY DEFINER so they can read public.users
-- without recursing through its own RLS policies.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users where id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'owner');
$$;

-- ---------------------------------------------------------------------------
-- invites: sign-up is invite-only. The owner invites team members; the first owner
-- is invited with `npm run owner:invite -- you@example.com` (service role).
-- ---------------------------------------------------------------------------

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  role text not null default 'team' check (role in ('owner', 'team')),
  invited_by uuid references public.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Runs inside the auth.users insert, so raising here rejects the sign-up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites%rowtype;
begin
  select * into invite
  from public.invites
  where email = lower(new.email) and accepted_at is null
  for update;

  if not found then
    raise exception 'signup_not_invited' using errcode = 'P0001';
  end if;

  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    invite.role
  );

  update public.invites set accepted_at = now() where id = invite.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Team members may edit their own name and time zone, but only the owner changes roles,
-- and the studio can never be left without an owner.
create or replace function public.guard_user_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() is null for the service role and migrations, which may change anything.
  if auth.uid() is not null then
    if new.role is distinct from old.role and not public.is_owner() then
      raise exception 'only_owner_can_change_roles' using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'email_is_managed_by_auth' using errcode = '42501';
    end if;
  end if;
  if old.role = 'owner' and new.role <> 'owner'
     and not exists (select 1 from public.users where role = 'owner' and id <> old.id) then
    raise exception 'studio_needs_an_owner' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger users_guard_role
  before update on public.users
  for each row execute function public.guard_user_role();

-- ---------------------------------------------------------------------------
-- pipelines + stages. Workflows reference stage keys, never names (SPEC §3).
-- ---------------------------------------------------------------------------

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index pipelines_one_default on public.pipelines (is_default) where is_default;

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  position integer not null,
  -- open: part of the main flow; lost/cold: side stages outside the numbered flow
  kind text not null default 'open' check (kind in ('open', 'lost', 'cold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, key)
);

-- ---------------------------------------------------------------------------
-- contacts (SPEC §4). Tags, consents and merge come in milestone 2.
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  partner_name text,
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  preferred_contact text check (preferred_contact in ('sms', 'email', 'whatsapp')),
  city text,
  state text,
  country text,
  language text,
  time_zone text,
  source text check (source in (
    'website', 'instagram', 'meta_ads', 'google_ads', 'referral',
    'weddingwire_knot', 'vendor', 'other'
  )),
  referral_by text,
  email_marketing_consent boolean not null default false,
  dnd_email boolean not null default false,
  dnd_sms boolean not null default false,
  stop_automations boolean not null default false,
  assigned_to uuid references public.users (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe lookups (SPEC §5): not unique, duplicates are merged in the app.
create index contacts_email_idx on public.contacts (lower(email));
create index contacts_phone_idx on public.contacts (phone);

-- ---------------------------------------------------------------------------
-- opportunities: one per couple/event (SPEC §3)
-- ---------------------------------------------------------------------------

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  pipeline_id uuid not null,
  stage_key text not null,
  couple_names text,
  event_type text check (event_type in ('hindu', 'sikh', 'muslim', 'jain', 'fusion', 'other')),
  -- [{ "name": "Sangeet", "date": "2027-05-14" }, ...]; first date anchors pre-event workflows
  event_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(event_dates) = 'array'),
  venue text,
  city text,
  services text[] not null default '{}'
    check (services <@ array['photo', 'video', 'drone', 'album']::text[]),
  value_cents bigint check (value_cents is null or value_cents >= 0),
  source text check (source in (
    'website', 'instagram', 'meta_ads', 'google_ads', 'referral',
    'weddingwire_knot', 'vendor', 'other'
  )),
  assigned_to uuid references public.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  lost_reason text check (lost_reason in ('price', 'date_taken', 'went_with_other', 'no_response', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pipeline_id, stage_key) references public.stages (pipeline_id, key) on update cascade,
  -- SPEC §3: marking lost requires a reason
  check (status <> 'lost' or lost_reason is not null)
);

create index opportunities_contact_idx on public.opportunities (contact_id);
create index opportunities_stage_idx on public.opportunities (pipeline_id, stage_key);

-- ---------------------------------------------------------------------------
-- audit_log: append-only (SPEC §11, §14.10)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users (id) on delete set null default auth.uid(),
  action text not null,
  entity text not null,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger invites_updated_at before update on public.invites
  for each row execute function public.set_updated_at();
create trigger pipelines_updated_at before update on public.pipelines
  for each row execute function public.set_updated_at();
create trigger stages_updated_at before update on public.stages
  for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger opportunities_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security. Nothing is readable without a signed-in studio member;
-- the anon role gets no table access at all.
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.invites enable row level security;
alter table public.pipelines enable row level security;
alter table public.stages enable row level security;
alter table public.contacts enable row level security;
alter table public.opportunities enable row level security;
alter table public.audit_log enable row level security;

revoke all on
  public.users, public.invites, public.pipelines, public.stages,
  public.contacts, public.opportunities, public.audit_log
from anon;

grant select, insert, update, delete on
  public.users, public.invites, public.pipelines, public.stages,
  public.contacts, public.opportunities, public.audit_log
to authenticated;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.is_member(), public.is_owner() from public, anon;
grant execute on function public.is_member(), public.is_owner() to authenticated;

-- users
create policy "members read team" on public.users
  for select to authenticated using (public.is_member());
create policy "edit own profile or owner edits anyone" on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_owner())
  with check (id = auth.uid() or public.is_owner());
create policy "owner removes users" on public.users
  for delete to authenticated using (public.is_owner() and id <> auth.uid());

-- invites: owner only
create policy "owner manages invites" on public.invites
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- pipelines + stages: everyone reads, owner edits (settings)
create policy "members read pipelines" on public.pipelines
  for select to authenticated using (public.is_member());
create policy "owner manages pipelines" on public.pipelines
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "members read stages" on public.stages
  for select to authenticated using (public.is_member());
create policy "owner manages stages" on public.stages
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- contacts + opportunities: members work on them, only the owner hard-deletes (SPEC §12)
create policy "members read contacts" on public.contacts
  for select to authenticated using (public.is_member());
create policy "members add contacts" on public.contacts
  for insert to authenticated with check (public.is_member());
create policy "members edit contacts" on public.contacts
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "owner deletes contacts" on public.contacts
  for delete to authenticated using (public.is_owner());

create policy "members read opportunities" on public.opportunities
  for select to authenticated using (public.is_member());
create policy "members add opportunities" on public.opportunities
  for insert to authenticated with check (public.is_member());
create policy "members edit opportunities" on public.opportunities
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "owner deletes opportunities" on public.opportunities
  for delete to authenticated using (public.is_owner());

-- audit_log: members append as themselves, owner reads, nobody edits
create policy "members append audit entries" on public.audit_log
  for insert to authenticated with check (public.is_member() and actor_id = auth.uid());
create policy "owner reads audit log" on public.audit_log
  for select to authenticated using (public.is_owner());
revoke update, delete on public.audit_log from authenticated;

-- ---------------------------------------------------------------------------
-- Default wedding pipeline (SPEC §3)
-- ---------------------------------------------------------------------------

with p as (
  insert into public.pipelines (key, name, is_default)
  values ('weddings', 'Weddings', true)
  returning id
)
insert into public.stages (pipeline_id, key, name, position, kind)
select p.id, s.key, s.name, s.position, s.kind
from p, (values
  ('new_inquiry',       'New inquiry',       1,  'open'),
  ('contacted',         'Contacted',         2,  'open'),
  ('consult_scheduled', 'Consult scheduled', 3,  'open'),
  ('consult_done',      'Consult done',      4,  'open'),
  ('proposal_sent',     'Proposal sent',     5,  'open'),
  ('booked',            'Booked',            6,  'open'),
  ('pre_event',         'Pre-event',         7,  'open'),
  ('event_done',        'Event done',        8,  'open'),
  ('delivered',         'Delivered',         9,  'open'),
  ('lost',              'Lost',              10, 'lost'),
  ('cold',              'Cold',              11, 'cold')
) as s (key, name, position, kind);
