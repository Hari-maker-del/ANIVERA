# ANIVERA — Universal Animal Lifecycle Platform

**Brand Promise:** Every Animal. Every Stage of Life.

ANIVERA brings animal identity, clinical health records, care routines and tasks, lifecycle milestones, and verified species taxonomy into one connected platform supporting non-avian animals across wild mammals, livestock, companion animals, marine mammals, fish, reptiles, amphibians, and invertebrates.

> **Product Boundary:** Avian species (Class `Aves`) belong exclusively to the separate **WINGLY** platform and are strictly excluded from ANIVERA's catalogue, 3D carousels, and workspace registries.

## Brand Design System
- **Primary Orange:** `#FB8122`
- **Primary Text / Charcoal:** `#1D2228`
- **Background / White:** `#FFFFFF`
- **Silver Gray:** `#E1E2E2`

## Project Architecture
- `index.html` — Main public landing page with dual independent continuous 3D carousels, species detail modal, 142-species Animal Explorer, and integrated Lifecycle Workspace.
- `dashboard.html` — Dedicated standalone Lifecycle Operations Workspace & Dashboard.
- `animals-data.js` & `src/data/speciesCatalogue.json` — Validated 142-species non-avian catalogue (71 Left Wildlife Gallery, 71 Right Livestock, Companion, Marine, Fish, Reptiles, Amphibians, and Invertebrates Gallery) with 28 locally bundled species-specific WebP photographs (`public/assets/species/*.webp`).
- `app.js` & `src/js/app.js` — Application controller for the delta-time `requestAnimationFrame` 3D carousels, accessible species modal, explorer filtering, and workspace CRUD.
- `cloud-sync.js` — Dedicated Supabase client (`qbwulpofftxfddlykcxg` / `https://qbwulpofftxfddlykcxg.supabase.co`), authentication lifecycle, and owner-scoped Row-Level Security (RLS) persistence engine.
- `styles.css` & `src/styles/main.css` — Responsive brand stylesheet tested from `1440×900` down to `320×700`.
- `supabase/migrations/20261022000000_anivera_schema.sql` — PostgreSQL schema & Row-Level Security migration for `animal_profiles`, `health_records`, `care_tasks`, `lifecycle_events`, and `workspace_snapshots`.

## Scripts
- `npm run validate` — Validates all 142 non-avian species records, uniqueness constraints, WINGLY avian boundary, and local image assets.
- `npm run build` — Builds the `dist/` production bundle and self-contained preview.
- `npm test` — Runs automated assertions across brand rules, carousels, catalogue, SQL schema, authentication, persistence, and owner-scoped RLS isolation.
