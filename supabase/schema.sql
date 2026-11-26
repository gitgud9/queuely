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
