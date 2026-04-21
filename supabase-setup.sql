-- OneDay: event_apps table
create table if not exists event_apps (
  id                 text        primary key,
  payment_intent_id  text        unique not null,
  title              text,
  html               text,
  prompt             text,
  theme_preset       text        default 'default',
  content_phase1     jsonb,
  plan               text,
  email              text,
  event_date         text,
  view_count         integer     default 0,
  is_live            boolean     default true,
  generation_status  text        default 'pending',
  creator_device_id  text,
  admin_token_hash   text,
  guest_list_hidden  boolean     default false,
  rsvp_join_enabled  boolean     default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- RPC to increment view count atomically
create or replace function increment_view_count(app_id text)
returns void
language plpgsql
as $$
begin
  update event_apps
  set view_count = view_count + 1
  where id = app_id;
end;
$$;

-- Row Level Security (optional but recommended)
alter table event_apps enable row level security;

-- Allow public reads for published apps
create policy "Public can read live apps"
  on event_apps for select
  using (is_live = true);

-- Service role can do everything (used by API routes with service key)
-- No extra policy needed when using service_role key on the server side

-- Shared event photos (S3 keys + metadata; files live in AWS S3)
create table if not exists event_photos (
  id               uuid        primary key default gen_random_uuid(),
  event_id         text        not null references event_apps (id) on delete cascade,
  section_index    integer     not null default 0,
  s3_key           text        not null,
  content_type     text,
  byte_size        integer,
  owner_device_id  text,
  created_at       timestamptz default now()
);

create index if not exists idx_event_photos_event_section
  on event_photos (event_id, section_index);

alter table event_photos enable row level security;
-- Inserts/reads happen only via Next.js API using the service role key (bypasses RLS).

-- Shared guest messages (all visitors see the same wall when NEXT uses cloud injection)
create table if not exists event_messages (
  id                uuid        primary key default gen_random_uuid(),
  event_id          text        not null references event_apps (id) on delete cascade,
  author_name       text        not null default 'Guest',
  body              text        not null,
  owner_device_id   text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_event_messages_event_created
  on event_messages (event_id, created_at);

alter table event_messages enable row level security;

-- Poll: one row per voter per event (choice index 0 .. MAX-1). Counts derived in the API.
create table if not exists event_poll_votes (
  event_id  text        not null references event_apps (id) on delete cascade,
  voter_id  text        not null,
  choice    smallint    not null check (choice >= 0 and choice < 12),
  created_at timestamptz default now(),
  primary key (event_id, voter_id)
);

create index if not exists idx_event_poll_votes_event on event_poll_votes (event_id);

alter table event_poll_votes enable row level security;

-- Shared RSVPs (name + adults + kids per row; all guests see the same list)
create table if not exists event_rsvps (
  id                uuid        primary key default gen_random_uuid(),
  event_id          text        not null references event_apps (id) on delete cascade,
  guest_name        text        not null default 'Guest',
  adults            integer     not null default 1 check (adults >= 1 and adults <= 100),
  kids              integer     not null default 0 check (kids >= 0 and kids <= 100),
  owner_device_id   text,
  created_at        timestamptz default now()
);

create index if not exists idx_event_rsvps_event_created
  on event_rsvps (event_id, created_at);

alter table event_rsvps enable row level security;
