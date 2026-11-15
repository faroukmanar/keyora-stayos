# Architecture

## Shape

KEYORA uses a feature-first React Native architecture with a small, framework-independent domain core.

```text
src/
  app/                 Expo Router route composition only
  domain/              Pure business rules over the shared contract types
  services/            HTTP client and API repositories (packages/contracts schemas)
  features/
    auth/              Session and role entry
    operations/        Live-data hooks (TanStack Query) and dashboard
    reservations/      Booking timeline and reservation detail
    rooms/             Inventory cards, filtering, and room detail
    guests/            Guest relationship workspace
    housekeeping/      Service queue and room-turn actions
  shared/              Reusable accessible UI, navigation, providers
  theme/               Semantic design tokens
```

Routes import feature screens; feature screens do not own routing configuration. Pure rules such as date overlap, inventory availability, pricing, and occupancy live in `src/domain/operations.ts` and have no React dependency.

## State and data flow

```text
Versioned API (/v1, OpenAPI + zod schemas in packages/contracts)
              ↓
   HttpClient → repositories (src/services)
              ↓
   TanStack Query hooks, keyed by organization + property
        ↙                     ↘
 domain rules            feature screens
        ↘                     ↙
      shared UI components
```

All screens read and write through `src/features/operations/hooks/use-live-data.ts` (and the housekeeping hooks). There is no in-app demo data source; synthetic data lives only in the local database seed. Mutations invalidate the tenant's query namespace; the API stays authoritative for state machines, availability, and pricing (signed quotes). Zustand holds only the authenticated actor.

Realtime: web subscribes to the tenant SSE stream (`/v1/properties/{id}/events`) and invalidates the property namespace; native polls every 15 s while a screen is mounted. Contract drift is caught by `npm run contract:test`, which parses every client-used endpoint with the shared schemas.
6. Add Sentry/OpenTelemetry, privacy-safe analytics, remote configuration, and EAS release channels.

The versioned client-independent contract and its ownership rules are documented in [docs/architecture/contracts.md](./docs/architecture/contracts.md). The OpenAPI source lives at `packages/contracts/openapi/v1.json`; shared runtime schemas and generated transport types live beside it under `packages/contracts/src`.

## Reliability rules

- Checkout boundaries are exclusive, preventing false overlap for same-day turns.
- Cancelled reservations do not block inventory.
- Invalid or zero-night stays fail before price calculation.
- Room readiness is synchronized when a housekeeping task completes.
- UI colors, spacing, typography, and touch targets come from shared tokens/components.
- Screens use descriptive accessibility labels and the bottom navigation is limited to five destinations.

## Testing strategy

The current suite covers the highest-risk pure business rules. Production expansion should add repository contract tests, store mutation tests, React Native Testing Library coverage, and Maestro or Detox journeys for sign-in, room updates, check-in, and room turnover.

## Security and privacy

No secrets or real guest data are committed. Production guest data should be minimized at the API, encrypted in transit and at rest, excluded from logs, and protected by property-scoped authorization. Sensitive tokens belong in SecureStore; public build-time configuration may use `EXPO_PUBLIC_*`, but secrets must remain server-side.
