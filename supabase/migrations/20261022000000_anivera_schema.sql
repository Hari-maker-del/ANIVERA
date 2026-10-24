-- =============================================================================
-- ANIVERA — Universal Animal Lifecycle Platform
-- Supabase PostgreSQL Schema & Row-Level Security Migration
-- Target Project ID: qbwulpofftxfddlykcxg
-- Target URL: https://qbwulpofftxfddlykcxg.supabase.co
-- Product Boundary: Non-Avian Animal Kingdom Only (Birds belong to WINGLY)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.anivera_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2. Table: animal_profiles
CREATE TABLE IF NOT EXISTS public.animal_profiles (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  species TEXT NOT NULL CHECK (char_length(trim(species)) > 0),
  scientific_name TEXT,
  species_catalogue_id TEXT,
  category TEXT NOT NULL CHECK (
    category IN (
      'Wild Mammals & Wildlife',
      'Livestock & Farm Animals',
      'Companion Animals',
      'Marine Mammals',
      'Fish',
      'Reptiles',
      'Amphibians',
      'Invertebrates'
    )
  ),
  stage TEXT NOT NULL DEFAULT 'Adult',
  tag_id TEXT NOT NULL CHECK (char_length(trim(tag_id)) > 0),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_animal_profiles_owner_id ON public.animal_profiles(owner_id);
CREATE INDEX IF NOT EXISTS idx_animal_profiles_category ON public.animal_profiles(category);

DROP TRIGGER IF EXISTS trg_animal_profiles_updated_at ON public.animal_profiles;
CREATE TRIGGER trg_animal_profiles_updated_at
BEFORE UPDATE ON public.animal_profiles
FOR EACH ROW EXECUTE FUNCTION public.anivera_set_updated_at();

-- 3. Table: health_records
CREATE TABLE IF NOT EXISTS public.health_records (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id TEXT NOT NULL REFERENCES public.animal_profiles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  record_date DATE NOT NULL,
  clinician TEXT NOT NULL,
  treatment TEXT DEFAULT '',
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_records_owner_id ON public.health_records(owner_id);
CREATE INDEX IF NOT EXISTS idx_health_records_animal_id ON public.health_records(animal_id);

DROP TRIGGER IF EXISTS trg_health_records_updated_at ON public.health_records;
CREATE TRIGGER trg_health_records_updated_at
BEFORE UPDATE ON public.health_records
FOR EACH ROW EXECUTE FUNCTION public.anivera_set_updated_at();

-- 4. Table: care_tasks
CREATE TABLE IF NOT EXISTS public.care_tasks (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id TEXT NOT NULL REFERENCES public.animal_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  frequency TEXT NOT NULL DEFAULT 'Daily',
  due_date DATE NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Standard' CHECK (priority IN ('High', 'Standard', 'Routine')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_tasks_owner_id ON public.care_tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_care_tasks_animal_id ON public.care_tasks(animal_id);

DROP TRIGGER IF EXISTS trg_care_tasks_updated_at ON public.care_tasks;
CREATE TRIGGER trg_care_tasks_updated_at
BEFORE UPDATE ON public.care_tasks
FOR EACH ROW EXECUTE FUNCTION public.anivera_set_updated_at();

-- 5. Table: lifecycle_events
CREATE TABLE IF NOT EXISTS public.lifecycle_events (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id TEXT NOT NULL REFERENCES public.animal_profiles(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_owner_id ON public.lifecycle_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_animal_id ON public.lifecycle_events(animal_id);

DROP TRIGGER IF EXISTS trg_lifecycle_events_updated_at ON public.lifecycle_events;
CREATE TRIGGER trg_lifecycle_events_updated_at
BEFORE UPDATE ON public.lifecycle_events
FOR EACH ROW EXECUTE FUNCTION public.anivera_set_updated_at();

-- 6. Table: workspace_snapshots
CREATE TABLE IF NOT EXISTS public.workspace_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_label TEXT NOT NULL DEFAULT 'Manual Snapshot',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_owner_id ON public.workspace_snapshots(owner_id);

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES — STRICT OWNER-SCOPED ISOLATION
-- =============================================================================

ALTER TABLE public.animal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_snapshots ENABLE ROW LEVEL SECURITY;

-- animal_profiles policies
DROP POLICY IF EXISTS "animal_profiles_select_own" ON public.animal_profiles;
CREATE POLICY "animal_profiles_select_own" ON public.animal_profiles
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "animal_profiles_insert_own" ON public.animal_profiles;
CREATE POLICY "animal_profiles_insert_own" ON public.animal_profiles
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "animal_profiles_update_own" ON public.animal_profiles;
CREATE POLICY "animal_profiles_update_own" ON public.animal_profiles
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "animal_profiles_delete_own" ON public.animal_profiles;
CREATE POLICY "animal_profiles_delete_own" ON public.animal_profiles
  FOR DELETE USING (auth.uid() = owner_id);

-- health_records policies
DROP POLICY IF EXISTS "health_records_select_own" ON public.health_records;
CREATE POLICY "health_records_select_own" ON public.health_records
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "health_records_insert_own" ON public.health_records;
CREATE POLICY "health_records_insert_own" ON public.health_records
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "health_records_update_own" ON public.health_records;
CREATE POLICY "health_records_update_own" ON public.health_records
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "health_records_delete_own" ON public.health_records;
CREATE POLICY "health_records_delete_own" ON public.health_records
  FOR DELETE USING (auth.uid() = owner_id);

-- care_tasks policies
DROP POLICY IF EXISTS "care_tasks_select_own" ON public.care_tasks;
CREATE POLICY "care_tasks_select_own" ON public.care_tasks
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "care_tasks_insert_own" ON public.care_tasks;
CREATE POLICY "care_tasks_insert_own" ON public.care_tasks
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "care_tasks_update_own" ON public.care_tasks;
CREATE POLICY "care_tasks_update_own" ON public.care_tasks
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "care_tasks_delete_own" ON public.care_tasks;
CREATE POLICY "care_tasks_delete_own" ON public.care_tasks
  FOR DELETE USING (auth.uid() = owner_id);

-- lifecycle_events policies
DROP POLICY IF EXISTS "lifecycle_events_select_own" ON public.lifecycle_events;
CREATE POLICY "lifecycle_events_select_own" ON public.lifecycle_events
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "lifecycle_events_insert_own" ON public.lifecycle_events;
CREATE POLICY "lifecycle_events_insert_own" ON public.lifecycle_events
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "lifecycle_events_update_own" ON public.lifecycle_events;
CREATE POLICY "lifecycle_events_update_own" ON public.lifecycle_events
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "lifecycle_events_delete_own" ON public.lifecycle_events;
CREATE POLICY "lifecycle_events_delete_own" ON public.lifecycle_events
  FOR DELETE USING (auth.uid() = owner_id);

-- workspace_snapshots policies
DROP POLICY IF EXISTS "workspace_snapshots_select_own" ON public.workspace_snapshots;
CREATE POLICY "workspace_snapshots_select_own" ON public.workspace_snapshots
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "workspace_snapshots_insert_own" ON public.workspace_snapshots;
CREATE POLICY "workspace_snapshots_insert_own" ON public.workspace_snapshots
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "workspace_snapshots_delete_own" ON public.workspace_snapshots;
CREATE POLICY "workspace_snapshots_delete_own" ON public.workspace_snapshots
  FOR DELETE USING (auth.uid() = owner_id);
