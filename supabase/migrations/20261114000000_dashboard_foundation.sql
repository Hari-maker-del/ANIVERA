-- ANIVERA dashboard foundation
-- Additive schema extension. Preserves the existing core tables and workspace_snapshots shape.
-- Requires the core migration (animal_profiles with TEXT id and UUID owner_id) to be applied first.

create extension if not exists pgcrypto;

create unique index if not exists animal_profiles_id_owner_uidx
  on public.animal_profiles (id, owner_id);

create table if not exists public.animal_identifiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null,
  identifier_type text not null check (identifier_type in
    ('microchip','rfid','ear_tag','tattoo','brand','ring','qr','passport','research_id','biometric','other')),
  identifier_value text not null check (char_length(trim(identifier_value)) > 0),
  issuer text,
  issued_at date,
  valid_to date,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive','lost','replaced')),
  created_at timestamptz not null default now(),
  unique (owner_id, identifier_type, identifier_value),
  foreign key (animal_id, owner_id)
    references public.animal_profiles(id, owner_id) on delete cascade,
  check (valid_to is null or issued_at is null or valid_to >= issued_at)
);

create table if not exists public.animal_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  group_type text not null default 'other'
    check (group_type in ('herd','flock','colony','litter','cohort','pack','school','other')),
  species_label text,
  purpose text,
  active_from date,
  active_to date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (active_to is null or active_from is null or active_to >= active_from)
);

create table if not exists public.animal_group_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null,
  animal_id uuid not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  notes text not null default '',
  foreign key (group_id, owner_id)
    references public.animal_groups(id, owner_id) on delete cascade,
  foreign key (animal_id, owner_id)
    references public.animal_profiles(id, owner_id) on delete cascade,
  check (left_at is null or left_at >= joined_at)
);

create unique index if not exists animal_group_members_active_uidx
  on public.animal_group_members(group_id, animal_id)
  where left_at is null;

create table if not exists public.animal_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_location_id uuid,
  name text not null check (char_length(trim(name)) > 0),
  location_type text not null default 'other'
    check (location_type in ('farm','sanctuary','clinic','enclosure','pasture','aquarium','habitat','field_site','transport','other')),
  capacity integer check (capacity is null or capacity >= 0),
  biosecurity_level text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (parent_location_id, owner_id)
    references public.animal_locations(id, owner_id) on delete set null (parent_location_id)
);

create table if not exists public.animal_location_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null,
  from_location_id uuid,
  to_location_id uuid,
  moved_at timestamptz not null default now(),
  moved_by uuid references auth.users(id) on delete set null,
  reason text,
  transport_method text,
  notes text not null default '',
  foreign key (animal_id, owner_id)
    references public.animal_profiles(id, owner_id) on delete cascade,
  foreign key (from_location_id, owner_id)
    references public.animal_locations(id, owner_id) on delete restrict,
  foreign key (to_location_id, owner_id)
    references public.animal_locations(id, owner_id) on delete restrict,
  check (from_location_id is distinct from to_location_id)
);

create table if not exists public.animal_timeline_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null,
  event_type text not null,
  event_at timestamptz not null,
  title text not null check (char_length(trim(title)) > 0),
  summary text not null default '',
  source_table text,
  source_record_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (animal_id, owner_id)
    references public.animal_profiles(id, owner_id) on delete cascade
);

create table if not exists public.animal_custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (char_length(trim(label)) > 0),
  value_type text not null check (value_type in ('text','number','boolean','date','single_select','multi_select','json')),
  species_category text,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, field_key),
  unique (id, owner_id)
);

create table if not exists public.animal_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null,
  field_definition_id uuid not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique (animal_id, field_definition_id),
  foreign key (animal_id, owner_id)
    references public.animal_profiles(id, owner_id) on delete cascade,
  foreign key (field_definition_id, owner_id)
    references public.animal_custom_field_definitions(id, owner_id) on delete cascade
);

create index if not exists animal_identifiers_animal_idx
  on public.animal_identifiers(owner_id, animal_id);
create index if not exists animal_groups_owner_idx
  on public.animal_groups(owner_id, created_at desc);
create index if not exists animal_group_members_animal_idx
  on public.animal_group_members(owner_id, animal_id);
create index if not exists animal_locations_owner_idx
  on public.animal_locations(owner_id, name);
create index if not exists animal_location_history_animal_idx
  on public.animal_location_history(owner_id, animal_id, moved_at desc);
create index if not exists animal_timeline_events_animal_idx
  on public.animal_timeline_events(owner_id, animal_id, event_at desc);
create index if not exists animal_custom_field_values_animal_idx
  on public.animal_custom_field_values(owner_id, animal_id);

create or replace function public.anivera_dashboard_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_animal_groups_updated_at on public.animal_groups;
create trigger trg_animal_groups_updated_at
before update on public.animal_groups
for each row execute function public.anivera_dashboard_set_updated_at();

drop trigger if exists trg_animal_locations_updated_at on public.animal_locations;
create trigger trg_animal_locations_updated_at
before update on public.animal_locations
for each row execute function public.anivera_dashboard_set_updated_at();

drop trigger if exists trg_animal_custom_field_values_updated_at on public.animal_custom_field_values;
create trigger trg_animal_custom_field_values_updated_at
before update on public.animal_custom_field_values
for each row execute function public.anivera_dashboard_set_updated_at();

alter table public.animal_identifiers enable row level security;
alter table public.animal_groups enable row level security;
alter table public.animal_group_members enable row level security;
alter table public.animal_locations enable row level security;
alter table public.animal_location_history enable row level security;
alter table public.animal_timeline_events enable row level security;
alter table public.animal_custom_field_definitions enable row level security;
alter table public.animal_custom_field_values enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'animal_identifiers',
    'animal_groups',
    'animal_group_members',
    'animal_locations',
    'animal_location_history',
    'animal_timeline_events',
    'animal_custom_field_definitions',
    'animal_custom_field_values'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end;
$$;

grant select, insert, update, delete on
  public.animal_identifiers,
  public.animal_groups,
  public.animal_group_members,
  public.animal_locations,
  public.animal_location_history,
  public.animal_timeline_events,
  public.animal_custom_field_definitions,
  public.animal_custom_field_values
to authenticated;
