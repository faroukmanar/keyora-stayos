# Local release gate

Status: implementation evidence for issue #25. Every check runs locally; there is no hosted CI.

## One command

```sh
npm run release:gate
```

| Stage | What it proves |
| --- | --- |
| postgres (disposable) | `docker compose -p keyora-gate` starts Postgres 17 on tmpfs (port `KEYORA_GATE_PG_PORT`, default 55434); it is removed afterwards unless `--keep-db` |
| lint, typecheck | ESLint (Expo config) and `tsc --noEmit` across app, API, and contracts |
| contract validate | OpenAPI v1 is valid and `packages/contracts/src/generated.ts` matches it |
| unit (jest), api unit | Domain rules, HTTP client, housekeeping actions, formatting, API app tests |
| license policy | No GPL/SSPL/BUSL-only dependencies in the lockfile |
| integration × 11 | database, auth, security, notifications, inventory, reservations, guests, housekeeping, realtime, bootstrap, contract — each rebuilds the `_test` schema from migrations and the synthetic seed |
| api smoke | Real server process starts, probes pass, shuts down gracefully |
| web production export + playwright | `expo export -p web` is served and driven against a real API: sign-in at four widths, no tokens in storage, booking → check-in → check-out → room turn, live housekeeping updates, role masking |
| native (opt-in `--native`) | Maestro flows in `.maestro/` |

Flags: `--skip-web`, `--native`, `--keep-db`. Ports: `KEYORA_GATE_PG_PORT`, `KEYORA_GATE_API_PORT` (4188), `KEYORA_GATE_WEB_PORT` (19188).

## Evidence

Each run writes `.release-evidence/<sha12>-<timestamp>/` (git-ignored): one log per stage and `summary.json` with the commit, a dirty-tree flag, scope (web/native), Node version, platform, and per-stage status and duration. `.release-evidence/latest.json` points at the newest run.

```sh
npm run release:verify                      # HEAD must have a passing, clean-tree, web-inclusive run < 24h old
node scripts/verify-release-evidence.cjs <sha> --require-native --max-age-hours=12
npm run hooks:install                       # pre-push hook: tag pushes require evidence; branch pushes are untouched
```

## Native flows (Maestro)

Prerequisites: [Maestro CLI](https://maestro.mobile.dev), a booted Android emulator or iOS simulator, and a development or preview build of the app whose `EXPO_PUBLIC_API_URL` reaches the gate API (Android emulator: `http://10.0.2.2:<port>`).

```sh
MAESTRO_PASSWORD='Local-Test-Only!2026' npm run native:e2e
npm run release:gate -- --native            # same flows, with junit output saved as evidence
```

| Flow | Covers |
| --- | --- |
| `01-sign-in` | Native sign-in, session restore after relaunch (SecureStore refresh token), sign-out |
| `02-book-check-in-check-out` | Provisions a synthetic rate plan if missing, books a new guest from a signed quote, checks in and out |
| `03-room-turn` | Housekeeping starts the checkout's rush turn, completes the checklist, requests inspection |

## Fixtures

- Only synthetic data: the seed refuses non-localhost or non-`_test` databases, staff accounts use `@demo.keyora.test`, guests use `example.test`/`example.invalid` addresses.
- Integration suites reset the schema (`migrate down --all` then `up`) before running; browser tests create uniquely named rooms, plans, and guests, and the gate database lives on tmpfs and is destroyed at the end.

## Release checklist

1. Clean checkout of the commit to release (`git status` empty).
2. `npm run release:gate` (add `--native` for mobile releases) passes.
3. `npm run release:verify` (or `--require-native`) passes for that commit.
4. Tag and push the tag; with the hook installed, the push is refused without evidence.
5. Attach `summary.json` from the evidence folder to the release notes.
