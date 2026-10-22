-- ANIVERA initial database schema
-- Safe to apply only to the dedicated ANIVERA Supabase project.
-- Every record is owned by its creator until organization membership is implemented.
create extension if not exists pgcrypto;

create table if not exists public.animal_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  species text not null check (char_length(trim(species)) between 1 and 100),
  animal_group text not null check (animal_group in ('companion','livestock','wildlife','exotic','rescue','other')),
  breed text,
  sex text check (sex is null or sex in ('female','male','unknown')),
  date_of_birth date,
  identification_code text,
  location_label text,
  lifecycle_status text not null default 'in_care'
    check (lifecycle_status in ('in_care','under_treatment','rehabilitating','released','transferred','deceased')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null references public.animal_profiles(id) on delete cascade,
  record_type text not null check (record_type in ('visit','vaccination','treatment','medication','observation','test','other')),
  occurred_at timestamptz not null default now(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  details text,
  provider_name text,
  follow_up_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid references public.animal_profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  details text,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null references public.animal_profiles(id) on delete cascade,
  event_type text not null check (event_type in ('intake','transfer','release','rehabilitation','adoption','status_change','other')),
  occurred_at timestamptz not null default now(),
  summary text not null check (char_length(trim(summary)) between 1 and 200),
  details text,
  created_at timestamptz not null default now()
);

create index if not exists animal_profiles_owner_updated_idx on public.animal_profiles(owner_id, updated_at desc);
create index if not exists health_records_owner_animal_date_idx on public.health_records(owner_id, animal_id, occurred_at desc);
create index if not exists care_tasks_owner_due_idx on public.care_tasks(owner_id, due_at) where completed_at is null;
create index if not exists lifecycle_events_owner_animal_date_idx on public.lifecycle_events(owner_id, animal_id, occurred_at desc);

-- RLS is mandatory on every exposed table. Policies bind each row to auth.uid().
alter table public.animal_profiles enable row level security;
alter table public.health_records enable row level security;
alter table public.care_tasks enable row level security;
alter table public.lifecycle_events enable row level security;

drop policy if exists "Owners can read their animal profiles" on public.animal_profiles;
create policy "Owners can read their animal profiles" on public.animal_profiles
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owners can create their animal profiles" on public.animal_profiles;
create policy "Owners can create their animal profiles" on public.animal_profiles
for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can update their animal profiles" on public.animal_profiles;
create policy "Owners can update their animal profiles" on public.animal_profiles
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can delete their animal profiles" on public.animal_profiles;
create policy "Owners can delete their animal profiles" on public.animal_profiles
for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can read their health records" on public.health_records;
create policy "Owners can read their health records" on public.health_records
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owners can create their health records" on public.health_records;
create policy "Owners can create their health records" on public.health_records
for insert to authenticated with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.animal_profiles a where a.id = animal_id and a.owner_id = (select auth.uid())
  )
);
drop policy if exists "Owners can update their health records" on public.health_records;
create policy "Owners can update their health records" on public.health_records
for update to authenticated using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.animal_profiles a where a.id = animal_id and a.owner_id = (select auth.uid())
  )
);
drop policy if exists "Owners can delete their health records" on public.health_records;
create policy "Owners can delete their health records" on public.health_records
for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can read their care tasks" on public.care_tasks;
create policy "Owners can read their care tasks" on public.care_tasks
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owners can create their care tasks" on public.care_tasks;
create policy "Owners can create their care tasks" on public.care_tasks
for insert to authenticated with check (
  (select auth.uid()) = owner_id and (animal_id is null or exists (
    select 1 from public.animal_profiles a where a.id = animal_id and a.owner_id = (select auth.uid())
  ))
);
drop policy if exists "Owners can update their care tasks" on public.care_tasks;
create policy "Owners can update their care tasks" on public.care_tasks
for update to authenticated using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id and (animal_id is null or exists (
    select 1 from public.animal_profiles a where a.id = animal_id and a.owner_id = (select auth.uid())
  ))
);
drop policy if exists "Owners can delete their care tasks" on public.care_tasks;
create policy "Owners can delete their care tasks" on public.care_tasks
for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can read their lifecycle events" on public.lifecycle_events;
create policy "Owners can read their lifecycle events" on public.lifecycle_events
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owners can create their lifecycle events" on public.lifecycle_events;
create policy "Owners can create their lifecycle events" on public.lifecycle_events
for insert to authenticated with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.animal_profiles a where a.id = animal_id and a.owner_id = (select auth.uid())
  )
);
drop policy if exists "Owners can update their lifecycle events" on public.lifecycle_events;
create policy "Owners can update their lifecycle events" on public.lifecycle_events
for update to authenticated using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.animal_profiles a where a.id = animal_id and a.owner_id = (select auth.uid())
  )
);
drop policy if exists "Owners can delete their lifecycle events" on public.lifecycle_events;
create policy "Owners can delete their lifecycle events" on public.lifecycle_events
for delete to authenticated using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.animal_profiles to authenticated;
grant select, insert, update, delete on public.health_records to authenticated;
grant select, insert, update, delete on public.care_tasks to authenticated;
grant select, insert, update, delete on public.lifecycle_events to authenticated;
revoke all on public.animal_profiles, public.health_records, public.care_tasks, public.lifecycle_events from anon;
