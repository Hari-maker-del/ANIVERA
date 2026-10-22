# ANIVERA

**Every Animal. Every Stage of Life.**

ANIVERA is an animal lifecycle workspace for companion animals, livestock, wildlife, exotic animals, and rescued or rehabilitating animals. Bird-focused lifecycle management is handled separately by WINGLY.

## Current build

The repository contains a responsive, interactive frontend prototype:

- Overview dashboard with animal, care-task, health-entry, and in-care counts
- Animal profile creation, editing, search, filtering, and detail view
- Health timeline entries for visits, vaccinations, treatment, medication, and observations
- Care reminders with due dates and completion tracking
- Lifecycle activity timeline
- Export of local demo data as JSON and reset of sample data
- Responsive layout for desktop and mobile
- No build step or third-party runtime dependencies

## Run locally

1. Clone or download this repository.
2. Open `index.html` in a modern browser, or serve the directory with a static web server.
3. Use the dashboard to add sample animal profiles, health entries, and care reminders.

## Current limitations and verification status

This is an early-stage frontend prototype, not a production-ready clinical or multi-user system.

- The public landing page includes two rotating animal galleries and an animal-detail dialog. Catalogue records currently contain core identity fields; the page supplies category-level illustrative descriptions and image fallbacks, so not every species has a verified species-specific photograph or complete care profile.
- The dashboard supports local demo animal profiles, health entries, care reminders, search/filtering, JSON export, and reset. Its normal data store is browser `localStorage`, scoped to that browser/device.
- `cloud-sync.js` contains optional Supabase email authentication and whole-workspace snapshot sync. The migration at `supabase/migrations/20261022000000_workspace_snapshots.sql` defines the required owner-scoped table and RLS policies, but the migration must be applied to the intended Supabase project and live sign-in/read/write/isolation tests must pass before cloud sync can be considered verified.
- The repository does not currently provide a `package.json`, automated npm test/build scripts, a CI workflow, or a complete set of normalized lifecycle tables. Do not treat previously reported automated test results as reproducible from this repository unless those scripts and workflows are added and run.
- Exported JSON files are unencrypted. Do not enter sensitive personal information or rely on this prototype for real clinical workflows.

Before production use, implement and test:
- Apply and verify the Supabase migration and cross-user RLS isolation
- Separate normalized animal, health, task, and lifecycle records if those workflows are required
- Organization membership, roles, audit logs, and custody-transfer history
- Secure file storage, backup/restore, retention, and privacy controls
- Reproducible automated tests, build/CI, and accessibility review
- Veterinary and wildlife workflow review appropriate to each deployment

## Brand system

- White: `#FFFFFF`
- Orange: `#FB8122`
- Charcoal: `#1D2228`
- Silver gray: `#E1E2E2`

## Domain

`faunex.com` is a preferred domain idea only. Availability and registration have not been verified.
