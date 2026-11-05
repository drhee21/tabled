<div align="center">
  <img src="app/icon.svg" width="100" alt="Description">
</div>
<br>
<p align="center">
  <i align="center">Tabled: AI-powered restaurant picker for the indecisive friend groups out there</i>
</p>

### What is this?
Tabled collects responses from a group of people who don't know what they want to eat, then uses a LLM to narrow a list of real restaurant options.

### How do I use it?
The host generates a unique link to share with the group. Accessing the link allows members of the group to vote on their preferences.

### Where can I find this?
https://tabled-one.vercel.app/

### Why...?
I built this because me and my friends suck at deciding where to eat.

## Deployment

### Database
- [ ] Run every file in `supabase/migrations/` in order (0001 to 0005) in the Supabase SQL editor.
- [ ] 0005 turns on `pg_cron`. If it errors, enable it first under Database > Extensions.
- [ ] Confirm the cleanup job exists: `select jobname, schedule from cron.job;` shows `tabled-cleanup-expired`.
- [ ] Row-level security is on for every table (Table Editor shows "RLS enabled"), and there are no policies.
- [ ] Do not grant `anon` or `authenticated` access to any table or function.

### Vercel environment variables
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC_`).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design; without them live updates are off).
- [ ] `GOOGLE_PLACES_API_KEY`, `LLM_API_KEY`, `LLM_MODEL`.
- [ ] `RATE_LIMIT_SALT`: a long random string (`openssl rand -hex 32`). The app refuses to start rate limiting without it in production.
- [ ] Optional: `RATE_SESSIONS_PER_HOUR` (5), `RATE_SEARCHES_PER_HOUR` (10), `RATE_SEARCHES_PER_DAY` (100).

### Required APIs
- [ ] Anthropic Claude
- [ ] Google Cloud (recommended restricting the key to the Places API (New) only)