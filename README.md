# KEYORA StayOS

KEYORA StayOS is an Expo / React Native hospitality operations app for independent hotels, riads, serviced apartments, and premium hostels. The current build is a portfolio-ready, interactive product slice with role entry, room inventory, bookings, guest CRM, housekeeping workflows, and deterministic pricing and availability rules.

## Run locally

```bash
npm install
npm run check
npm run web
npm run api:smoke
```

Native development uses `npm run ios` or `npm run android`. The project targets Expo SDK 58, React Native 0.88, React 19, and TypeScript strict mode.

## Quality gates

- `npm run lint` — Expo ESLint rules
- `npm run typecheck` — strict TypeScript validation
- `npm test` — deterministic domain tests
- `npm run check` — all gates in sequence
- `npm run api:smoke` — disposable API startup, probes, and graceful-shutdown smoke test
- `npx expo export --platform web` — production web bundle smoke test

## Product surface

- Authenticated, role-aware workspaces for owner, manager, front desk, and housekeeping staff (native + web)
- Live dashboard: occupancy, arrivals, departures, in-house stays, open room turns
- Stay calendar and reservation detail with check-in, no-show, cancel, and check-out
- Direct booking from a server-signed quote, for existing or new guests
- Room inventory with live status, bulk updates (web), and maintenance blocks
- Guest profiles with role-based contact masking
- Housekeeping board with checklists, inspections, blockers, escalation, and realtime updates

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries, data flow, production integration seams, and release considerations.

## Local data

The apps have no built-in demo data. Run the API against the local database (`npm run db:up`, `npm run db:migrate`, `npm run db:seed`, `KEYORA_MOCK_PASSWORD=... npm run db:seed-users`) to get a synthetic property with staff accounts for each role. Seeds refuse to run against non-local databases.

## Visual assets

All hospitality images are original generated assets. Runtime references use optimized WebP files (roughly 175–345 KB each); lossless PNG masters remain beside them for portfolio and future editing.
