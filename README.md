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

## Important prototype limitations

This is a frontend prototype, not a production-ready clinical or multi-user system. Records are stored in browser `localStorage` on the current device and browser only. There is no authentication, cloud database, server-side authorization, synchronization, encrypted record store, audit trail, or backup service. Do not enter sensitive personal information or rely on it for real clinical workflows. Exported JSON files are unencrypted.

Before production use, implement and test:
- Authentication and role-based authorization
- A server-side database and validated API
- Organization membership and scoped data access
- Audit logs for edits, care events, and custody transfers
- Secure file storage, backup/restore, retention, and privacy controls
- Automated tests and accessibility review
- Veterinary and wildlife workflow review appropriate to each deployment

## Brand system

- White: `#FFFFFF`
- Orange: `#FB8122`
- Charcoal: `#1D2228`
- Silver gray: `#E1E2E2`

## Domain

`faunex.com` is a preferred domain idea only. Availability and registration have not been verified.
