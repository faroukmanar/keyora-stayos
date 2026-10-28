# KEYORA StayOS

KEYORA StayOS is an Expo / React Native hospitality operations app for independent hotels, riads, serviced apartments, and premium hostels. The current build is a portfolio-ready, interactive product slice with role entry, room inventory, bookings, guest CRM, housekeeping workflows, and deterministic pricing and availability rules.

## Run locally

```bash
npm install
npm run check
npm run web
```

Native development uses `npm run ios` or `npm run android`. The project targets Expo SDK 58, React Native 0.88, React 19, and TypeScript strict mode.

## Quality gates

- `npm run lint` — Expo ESLint rules
- `npm run typecheck` — strict TypeScript validation
- `npm test` — deterministic domain tests
- `npm run check` — all gates in sequence
- `npx expo export --platform web` — production web bundle smoke test

## Product surface

- Role-aware demo entry for owner, manager, front desk, and housekeeping staff
- Live operations dashboard with occupancy, revenue, arrivals, and room-turn signals
- Booking timeline and deep-linked reservation summaries
- Searchable, filterable room inventory with nine original room photographs
- Guest profiles with stay history and VIP state
- Housekeeping board with blocked/rush/ready states and inventory synchronization
- Room status updates reflected across the application state

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries, data flow, production integration seams, and release considerations.

## Demo data

The checked-in demo uses a fixed operating date (`2026-10-28`) so screenshots, tests, and portfolio review remain deterministic. The data and Zustand store are intentionally isolated behind `src/data` and `src/features/operations/store`; a production API adapter can replace them without changing screen components or domain calculations.

## Visual assets

All hospitality images are original generated assets. Runtime references use optimized WebP files (roughly 175–345 KB each); lossless PNG masters remain beside them for portfolio and future editing.
