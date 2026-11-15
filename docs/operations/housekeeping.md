# Housekeeping and room readiness

Status: implementation evidence for issue #14. Every command is local; no hosted CI is used.

Covers: assignments, priorities and due windows, checklists, inspections, blockers, maintenance escalation, reopen flows, and actor attribution.

## State machine

| From | Allowed targets | Guard |
| --- | --- | --- |
| `ready` | `in-progress` | — |
| `in-progress` | `inspection`, `done`, `blocked` | `inspection`/`done` need every required checklist item; `done` is refused while `inspectionRequired` or after a failed inspection; `blocked` needs a 3–500 char reason |
| `blocked` | `in-progress` | clears the blocker |
| `inspection` | via `POST …/inspections` only | `passed` → `done`, `failed` → `in-progress` |
| `done` | `in-progress` (reopen) | room returns to `cleaning` |

- Checkout creates exactly one rush room-turn task per reservation (unique index `housekeeping_one_turn_per_reservation`) with inspection required.
- Room readiness changes only through tasks: `done`/passed inspection sets the room `available` unless a guest is checked in or a maintenance block is active. A manual `PATCH …/rooms` to `available` returns `409 ROOM_NOT_READY` while any task for the room is open.
- Escalation opens a maintenance block linked to the task, sets the room to `maintenance`, and blocks the task.
- Every write emits a domain event with `actorId` and `at`; task reads expose `lastChange { type, actorId, actorName, at }` and the SSE stream forwards `actorId`.

## Roles

| Permission | owner | manager | front-desk | housekeeping |
| --- | --- | --- | --- | --- |
| `housekeeping:read` | ✓ | ✓ | ✓ | ✓ |
| `housekeeping:write` (create, assign, checklist, transitions, escalate) | ✓ | ✓ | — | ✓ |
| `housekeeping:inspect` | ✓ | ✓ | — | — |

## Local verification

```sh
KEYORA_PG_PORT=55433 docker compose up -d --wait postgres   # omit KEYORA_PG_PORT if 5432 is free
export MIGRATION_DATABASE_URL=postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:55433/keyora_test
npm run housekeeping:test   # full state machine, RBAC, checkout idempotency, contract parsing
npm run realtime:test       # SSE auth, CORS, attribution, resume, revocation
npm run bootstrap:test      # production composition mounts every route group
npx jest src/features/housekeeping
```

Browser end-to-end (production web build against the local API):

```sh
DATABASE_MODE=required DATABASE_URL=$MIGRATION_DATABASE_URL CORS_ORIGINS=http://localhost:19137 npm run api:start &
npm run web:export:e2e && npx expo serve dist-e2e --port 19137 &
WEB_E2E_BASE_URL=http://localhost:19137 npm run web:e2e
```

Use `localhost` (not `127.0.0.1`) for both origins so the `SameSite=Strict` session cookies are sent.
