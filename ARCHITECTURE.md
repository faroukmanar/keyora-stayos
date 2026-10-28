# Architecture

## Shape

KEYORA uses a feature-first React Native architecture with a small, framework-independent domain core.

```text
src/
  app/                 Expo Router route composition only
  domain/              Models and pure business rules
  data/                Deterministic demo fixtures and asset mapping
  features/
    auth/              Session and role entry
    operations/        Shared operational state and dashboard
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
Demo fixtures / future API adapter
              ↓
      Operations store
        ↙           ↘
 domain selectors   feature screens
        ↘           ↙
      shared UI components
```

Zustand holds the local operational projection: rooms, reservations, and housekeeping tasks. Mutations are narrowly named (`setRoomStatus`, `setTaskStatus`) and update immutable collections. TanStack Query is already mounted at the application boundary for production server state; the next integration replaces fixture initialization with query-backed repositories while retaining Zustand only for transient UI/session state.

## Production integration seams

1. Add an authenticated HTTP client under `src/services/http` with access-token refresh and request correlation IDs.
2. Implement room, reservation, guest, and housekeeping repositories that validate responses with Zod.
3. Hydrate TanStack Query per property and use optimistic mutations with rollback for status changes.
4. Persist the authenticated session in Expo SecureStore and enforce roles from server-issued claims.
5. Subscribe to reservation and room-turn events through WebSocket or SSE, invalidating scoped query keys.
6. Add Sentry/OpenTelemetry, privacy-safe analytics, remote configuration, and EAS release channels.

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
