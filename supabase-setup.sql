-- OneDay: event_apps table
create table if not exists event_apps (
  id                 text        primary key,
  payment_intent_id  text        unique not null,
  title              text,
  html               text,
  prompt             text,
  plan               text,
  email              text,
  event_date         text,
  view_count         integer     default 0,
  is_live            boolean     default true,
  generation_status  text        default 'pending',
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
  id            uuid        primary key default gen_random_uuid(),
  event_id      text        not null references event_apps (id) on delete cascade,
  section_index integer     not null default 0,
  s3_key        text        not null,
  content_type  text,
  byte_size     integer,
  created_at    timestamptz default now()
);

create index if not exists idx_event_photos_event_section
  on event_photos (event_id, section_index);

alter table event_photos enable row level security;
-- Inserts/reads happen only via Next.js API using the service role key (bypasses RLS).
