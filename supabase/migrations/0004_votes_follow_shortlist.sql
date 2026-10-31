-- Step 5: a vote must be for a place on the session's shortlist.
-- Before this, votes referenced candidates, so a place that was found but not
-- shortlisted could be voted for. Pointing at recommendations makes the
-- database itself reject it. Safe to run once: no vote rows exist yet.

alter table votes
  drop constraint if exists votes_session_id_place_id_fkey;

alter table votes
  add constraint votes_shortlist_fkey
  foreign key (session_id, place_id)
  references recommendations (session_id, place_id)
  on delete cascade;
