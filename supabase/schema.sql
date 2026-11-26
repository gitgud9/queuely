-- Run this once in the Supabase SQL editor.
create table if not exists public.booths (
  id text primary key,
  state jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

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
