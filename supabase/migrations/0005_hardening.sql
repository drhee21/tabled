-- Hardening: shared rate-limit counters and scheduled cleanup of expired sessions.
-- Run in the Supabase SQL editor after 0004.

-- Rate limits. Serverless functions share no memory, so the counters live here.
-- `key` is "<rule>:<sha256 of salted client IP>" or "<rule>:global". The raw IP
-- is never stored. One row per key per fixed time window.
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_start_idx on rate_limits (window_start);

alter table rate_limits enable row level security;

-- Count one hit and return the new count for that window. A single upsert, so
-- two simultaneous requests cannot both read the same value.
create function rate_limit_hit(p_key text, p_window_start timestamptz)
returns integer
language sql
set search_path = public
as $$
  insert into rate_limits (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
  do update set count = rate_limits.count + 1
  returning count;
$$;

-- Delete expired sessions. Participants, preferences, candidates,
-- recommendations and votes go with them through their ON DELETE CASCADE keys.
-- Old rate-limit windows are dropped too (two days is longer than any window).
create function cleanup_expired()
returns table (sessions_deleted integer, rate_limits_deleted integer)
language plpgsql
set search_path = public
as $$
declare
  s integer;
  r integer;
begin
  delete from sessions where expires_at <= now();
  get diagnostics s = row_count;
  delete from rate_limits where window_start < now() - interval '2 days';
  get diagnostics r = row_count;
  return query select s, r;
end;
$$;

-- Functions are executable by everyone by default, and the browser holds the
-- anon key. Only the server (service_role) and the scheduler may call these.
revoke all on function rate_limit_hit(text, timestamptz) from public, anon, authenticated;
revoke all on function cleanup_expired() from public, anon, authenticated;
grant execute on function rate_limit_hit(text, timestamptz) to service_role;
grant execute on function cleanup_expired() to service_role;

-- Run the cleanup every 30 minutes with pg_cron (Supabase: Database > Extensions
-- must allow it; this statement enables it if it is not on yet). Expiry does not
-- depend on this job: every request to an expired session is refused at read time.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'tabled-cleanup-expired',
  '*/30 * * * *',
  $$select public.cleanup_expired()$$
);
