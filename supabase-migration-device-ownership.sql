-- Add device ownership columns (browser-generated hex id per device).
-- Run once in Supabase SQL editor after pulling the matching API changes.

alter table public.event_photos
  add column if not exists owner_device_id text;

alter table public.event_messages
  add column if not exists owner_device_id text;

alter table public.event_rsvps
  add column if not exists owner_device_id text;
