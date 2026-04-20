-- RSVP join toggle controlled by event host.
-- Run once in Supabase SQL editor.

alter table public.event_apps
  add column if not exists rsvp_join_enabled boolean default true;
