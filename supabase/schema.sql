-- Run this once in the Supabase SQL editor.
create table if not exists public.booths (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Older setups had a separate version column; the change counter now lives in state.version.
alter table public.booths drop column if exists version;

-- Easy-to-read counts per booth, computed by Postgres from `state` on every
-- write so they can never drift out of sync. They reset when staff reset a queue.
alter table public.booths
  add column if not exists waiting_guests integer generated always as
    (jsonb_array_length(jsonb_path_query_array(state, '$.tickets[*] ? (@.status == "waiting")'))) stored,
  add column if not exists done_guests integer generated always as ((state->>'servedCount')::int) stored,
  add column if not exists no_show_guests integer generated always as ((state->>'skippedCount')::int) stored,
  add column if not exists total_guests integer generated always as ((state->>'nextNumber')::int - 1) stored;

-- Anyone may read queue state (it holds only ticket numbers and times, no
-- personal data). Only the server, using the service role key, can write.
alter table public.booths enable row level security;
drop policy if exists "Queue state is public" on public.booths;
create policy "Queue state is public" on public.booths for select using (true);

-- Newer Supabase projects don't grant table access to the API roles
-- automatically, so grant it explicitly.
grant select on public.booths to anon, authenticated;
grant select, insert, update, delete on public.booths to service_role;

-- Push row changes to browsers over Supabase Realtime.
do $$ begin
  alter publication supabase_realtime add table public.booths;
exception when duplicate_object then null;
end $$;

-- Event info for the AI assistant (places, programme, FAQ), edited by staff in
-- the Staff Portal's "Event info" tab. One row holds the whole event as JSON.
-- Until a row is saved, the app uses the sample event in src/lib/event/defaults.ts.
create table if not exists public.event_info (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Only the server (service role key) reads and writes it; visitors get it
-- through the app's own API.
alter table public.event_info enable row level security;
grant select, insert, update, delete on public.event_info to service_role;
