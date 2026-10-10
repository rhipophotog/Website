-- Milestone 3: pipeline board.
-- Status follows the stage automatically, stage keys are fixed, and a view feeds the board.
-- Adds columns, triggers and a view only; nothing is dropped or renamed.

-- ---------------------------------------------------------------------------
-- stages: which stages count as "won" (booked onwards). Keys never change (SPEC §3).
-- ---------------------------------------------------------------------------

alter table public.stages add column is_won boolean not null default false;

update public.stages set is_won = true
where key in ('booked', 'pre_event', 'event_done', 'delivered')
  and pipeline_id = (select id from public.pipelines where key = 'weddings');

create or replace function public.guard_stage_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key is distinct from old.key then
    raise exception 'stage_keys_are_fixed' using errcode = '42501',
      hint = 'Workflows reference stage keys. Rename the stage instead.';
  end if;
  if new.kind is distinct from old.kind or new.pipeline_id is distinct from old.pipeline_id then
    raise exception 'stage_kind_is_fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger stages_guard_key before update on public.stages
  for each row execute function public.guard_stage_key();

-- Stages in use can't be deleted (opportunities reference them); the app never deletes stages.
revoke delete on public.stages from authenticated;

-- ---------------------------------------------------------------------------
-- opportunities: status derived from the stage; when it last moved
-- ---------------------------------------------------------------------------

alter table public.opportunities add column stage_changed_at timestamptz not null default now();

create or replace function public.sync_opportunity_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stage public.stages%rowtype;
begin
  select * into stage from public.stages where pipeline_id = new.pipeline_id and key = new.stage_key;
  if found then
    new.status := case
      when stage.kind = 'lost' then 'lost'
      when stage.is_won then 'won'
      else 'open'
    end;
  end if;
  -- Leaving Lost clears the reason; arriving needs one (enforced by the table's check constraint).
  if new.status <> 'lost' then
    new.lost_reason := null;
  end if;
  if tg_op = 'INSERT' or new.stage_key is distinct from old.stage_key then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger opportunities_sync_stage before insert or update on public.opportunities
  for each row execute function public.sync_opportunity_stage();

-- Bring existing rows (e.g. imported from GoHighLevel) in line with the rule.
update public.opportunities o set status = case
    when s.kind = 'lost' then 'lost'
    when s.is_won then 'won'
    else 'open'
  end
from public.stages s
where s.pipeline_id = o.pipeline_id and s.key = o.stage_key
  and o.status is distinct from (case when s.kind = 'lost' then 'lost' when s.is_won then 'won' else 'open' end)
  and (s.kind <> 'lost' or o.lost_reason is not null);

update public.opportunities set stage_changed_at = updated_at;

-- ---------------------------------------------------------------------------
-- pipeline_cards: what the board shows. security_invoker so RLS applies.
-- ---------------------------------------------------------------------------

create view public.pipeline_cards with (security_invoker = true) as
select
  o.id,
  o.contact_id,
  o.pipeline_id,
  o.stage_key,
  o.status,
  o.lost_reason,
  o.couple_names,
  o.event_type,
  o.event_dates,
  o.venue,
  o.city,
  o.services,
  o.value_cents,
  o.source,
  o.assigned_to,
  o.stage_changed_at,
  o.created_at,
  o.updated_at,
  coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.email, c.phone, 'Unnamed contact') as contact_name,
  c.partner_name,
  c.email,
  c.phone,
  (select min(d ->> 'date') from jsonb_array_elements(o.event_dates) d
   where d ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$') as first_event_date,
  (select left(min(d ->> 'date'), 7) from jsonb_array_elements(o.event_dates) d
   where d ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$') as first_event_month,
  u.full_name as assigned_name,
  u.email as assigned_email
from public.opportunities o
join public.contacts c on c.id = o.contact_id
left join public.users u on u.id = o.assigned_to;

revoke all on public.pipeline_cards from anon;
grant select on public.pipeline_cards to authenticated;

-- Event dates must be [{ "name": text, "date": "YYYY-MM-DD" }, ...]
alter table public.opportunities add constraint opportunities_event_dates_shape check (
  jsonb_typeof(event_dates) = 'array' and not jsonb_path_exists(
    event_dates,
    '$[*] ? (@.type() != "object" || !exists(@.date) || @.date.type() != "string" || !(@.date like_regex "^\\d{4}-\\d{2}-\\d{2}$"))'
  )
);
