-- Run once if you already created event_poll_votes with choice in (0,1) only.
-- Extends poll to up to 12 options (matches lib/pollLimits.js).

alter table event_poll_votes drop constraint if exists event_poll_votes_choice_check;
alter table event_poll_votes add constraint event_poll_votes_choice_range check (choice >= 0 and choice < 12);
