-- RSVP guest-list visibility toggle controlled by event host.
-- Run once in Supabase SQL editor.

alter table public.event_apps
  add column if not exists guest_list_hidden boolean default false;
