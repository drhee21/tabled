-- Tabled: initial schema. Mirrors the data model in SPEC.md.
-- All access goes through server route handlers using the service-role key.
-- RLS is enabled with no policies, so the anon/authenticated roles can read nothing.

create table sessions (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  host_token_hash text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null check (radius_m between 100 and 10000),
  meal_time timestamptz not null,
  status text not null default 'collecting'
    check (status in ('collecting', 'searching', 'voting', 'closed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index sessions_expires_at_idx on sessions (expires_at);

create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  token_hash text not null unique,
  joined_at timestamptz not null default now()
);

create index participants_session_id_idx on participants (session_id);

create table preferences (
  participant_id uuid primary key references participants (id) on delete cascade,
  dietary text[] not null default '{}',
  budget_min smallint check (budget_min between 0 and 4),
  budget_max smallint check (budget_max between 0 and 4),
  cuisines_want text[] not null default '{}',
  cuisines_avoid text[] not null default '{}',
  note text check (char_length(note) <= 280),
  submitted_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);

create table candidates (
  session_id uuid not null references sessions (id) on delete cascade,
  place_id text not null,
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  price_level smallint,
  cuisine_tags text[] not null default '{}',
  rating real,
  open_now boolean,
  raw jsonb,
  primary key (session_id, place_id)
);

create table recommendations (
  session_id uuid not null,
  place_id text not null,
  rank smallint not null check (rank between 1 and 5),
  reason text check (char_length(reason) <= 140),
  primary key (session_id, place_id),
  unique (session_id, rank),
  foreign key (session_id, place_id)
    references candidates (session_id, place_id) on delete cascade
);

create table votes (
  session_id uuid not null,
  participant_id uuid not null references participants (id) on delete cascade,
  place_id text not null,
  unique (session_id, participant_id),
  foreign key (session_id, place_id)
    references candidates (session_id, place_id) on delete cascade
);

alter table sessions enable row level security;
alter table participants enable row level security;
alter table preferences enable row level security;
alter table candidates enable row level security;
alter table recommendations enable row level security;
alter table votes enable row level security;
