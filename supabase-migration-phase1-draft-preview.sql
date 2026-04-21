-- Phase 1.5: draft-first structured editing preview before publish.
alter table public.event_apps
  add column if not exists content_phase1_draft jsonb;
