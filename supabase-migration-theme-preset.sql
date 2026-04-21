-- Add saved theme preset for event pages (admin picker on /edit/[id]).
alter table public.event_apps
  add column if not exists theme_preset text default 'default';

-- Normalize null/blank values so render logic stays simple.
update public.event_apps
set theme_preset = 'default'
where theme_preset is null or btrim(theme_preset) = '';
