-- ANIVERA authenticated workspace snapshots.
-- Apply this migration to the linked Supabase project before enabling cloud sync.
create table if not exists public.workspace_snapshots (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"animals":[],"events":[],"tasks":[],"health":[]}'::jsonb
    check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.workspace_snapshots enable row level security;

drop policy if exists "Users can read their own ANIVERA workspace" on public.workspace_snapshots;
create policy "Users can read their own ANIVERA workspace"
  on public.workspace_snapshots for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Users can create their own ANIVERA workspace" on public.workspace_snapshots;
create policy "Users can create their own ANIVERA workspace"
  on public.workspace_snapshots for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Users can update their own ANIVERA workspace" on public.workspace_snapshots;
create policy "Users can update their own ANIVERA workspace"
  on public.workspace_snapshots for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users can delete their own ANIVERA workspace" on public.workspace_snapshots;
create policy "Users can delete their own ANIVERA workspace"
  on public.workspace_snapshots for delete
  to authenticated
  using (auth.uid() = owner_id);

grant select, insert, update, delete on public.workspace_snapshots to authenticated;
