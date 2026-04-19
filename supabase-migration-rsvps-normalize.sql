-- Normalize public.event_rsvps to canonical OneDay schema used in supabase-setup.sql.
-- Safe to run once after legacy compatibility period.

begin;

create extension if not exists pgcrypto;

-- Ensure event_id only references event_apps (legacy DBs sometimes point to public.events).
alter table public.event_rsvps
  drop constraint if exists event_rsvps_event_id_fkey;

do $$
begin
  if exists (
    select 1
    from public.event_rsvps r
    left join public.event_apps a on a.id = r.event_id
    where a.id is null
  ) then
    raise exception 'event_rsvps contains row(s) whose event_id is not in event_apps; fix or delete them before normalization.';
  end if;
end $$;

alter table public.event_rsvps
  add constraint event_rsvps_event_id_fkey
  foreign key (event_id) references public.event_apps(id) on delete cascade;

-- Drop legacy parent user dependency.
alter table public.event_rsvps
  drop constraint if exists event_rsvps_parent_id_fkey;

-- Canonical columns.
alter table public.event_rsvps add column if not exists guest_name text;
alter table public.event_rsvps add column if not exists adults integer;
alter table public.event_rsvps add column if not exists kids integer;

-- Backfill guest_name from legacy notes where needed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_rsvps'
      and column_name = 'notes'
  ) then
    update public.event_rsvps
    set guest_name = coalesce(nullif(trim(guest_name), ''), nullif(trim(notes), ''), 'Guest');
  else
    update public.event_rsvps
    set guest_name = coalesce(nullif(trim(guest_name), ''), 'Guest');
  end if;
end $$;

-- Backfill adults/kids from legacy attendees_count where possible.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_rsvps'
      and column_name = 'attendees_count'
  ) then
    update public.event_rsvps
    set adults = coalesce(adults, greatest(1, attendees_count), 1);

    update public.event_rsvps
    set kids = coalesce(kids, greatest(0, attendees_count - coalesce(adults, 1)), 0);
  else
    update public.event_rsvps
    set adults = coalesce(adults, 1),
        kids = coalesce(kids, 0);
  end if;
end $$;

-- Ensure created_at is timestamptz (legacy was timestamp without time zone).
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_rsvps'
      and column_name = 'created_at'
  ) then
    alter table public.event_rsvps
      add column created_at timestamptz default now();
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_rsvps'
      and column_name = 'created_at'
      and data_type = 'timestamp without time zone'
  ) then
    alter table public.event_rsvps
      alter column created_at type timestamptz
      using timezone('utc', created_at);
  end if;
end $$;

-- Convert id to uuid if it is currently text.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_rsvps'
      and column_name = 'id'
      and data_type = 'text'
  ) then
    alter table public.event_rsvps add column if not exists id_uuid uuid;

    update public.event_rsvps
    set id_uuid =
      case
        when id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then id::uuid
        else gen_random_uuid()
      end
    where id_uuid is null;

    alter table public.event_rsvps drop constraint if exists event_rsvps_pkey;
    alter table public.event_rsvps drop column id;
    alter table public.event_rsvps rename column id_uuid to id;
    alter table public.event_rsvps alter column id set not null;
    alter table public.event_rsvps alter column id set default gen_random_uuid();
    alter table public.event_rsvps add constraint event_rsvps_pkey primary key (id);
  end if;
end $$;

-- Final canonical constraints/defaults.
alter table public.event_rsvps
  alter column event_id set not null,
  alter column guest_name set not null,
  alter column guest_name set default 'Guest',
  alter column adults set not null,
  alter column adults set default 1,
  alter column kids set not null,
  alter column kids set default 0,
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_rsvps_adults_check'
      and conrelid = 'public.event_rsvps'::regclass
  ) then
    alter table public.event_rsvps
      add constraint event_rsvps_adults_check check (adults >= 1 and adults <= 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_rsvps_kids_check'
      and conrelid = 'public.event_rsvps'::regclass
  ) then
    alter table public.event_rsvps
      add constraint event_rsvps_kids_check check (kids >= 0 and kids <= 100);
  end if;
end $$;

-- Remove legacy columns.
alter table public.event_rsvps drop column if exists parent_id;
alter table public.event_rsvps drop column if exists attendees_count;
alter table public.event_rsvps drop column if exists notes;
alter table public.event_rsvps drop column if exists children;

create index if not exists idx_event_rsvps_event_created
  on public.event_rsvps (event_id, created_at);

alter table public.event_rsvps enable row level security;

commit;
