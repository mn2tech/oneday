-- Phase 1 structured admin editor storage (no renderer usage yet).
alter table public.event_apps
  add column if not exists content_phase1 jsonb;
