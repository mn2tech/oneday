-- Host access: creator device id (optional) + hashed admin token for email manage links.
-- Run once in Supabase SQL editor after pulling the matching API changes.

alter table public.event_apps
  add column if not exists creator_device_id text;

alter table public.event_apps
  add column if not exists admin_token_hash text;

alter table public.event_apps
  add column if not exists guest_list_hidden boolean default false;

alter table public.event_apps
  add column if not exists rsvp_join_enabled boolean default true;
