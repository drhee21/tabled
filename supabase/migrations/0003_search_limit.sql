-- Step 3: cap searches per session, and record dietary uncertainty per candidate.

-- At most 3 searches per session. The count is claimed together with the
-- collecting -> searching change, so two simultaneous searches cannot both pass.
alter table sessions
  add column search_count smallint not null default 0
  check (search_count between 0 and 3);

-- True when the group has dietary needs that the place's data cannot confirm.
-- Such places are kept, not dropped. See SPEC.md, Candidate selection.
alter table candidates
  add column dietary_unknown boolean not null default false;
