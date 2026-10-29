# Production security baseline

Status: engineering sign-off for issue #21. This is a release gate, not a claim that software can be invulnerable. Every production release must rerun the evidence commands below and resolve or explicitly accept new findings.

## Trust boundaries and threat model

| Threat | Primary controls | Detection and response |
| --- | --- | --- |
| Tenant breakout through IDs, tokens, or SQL | Organization and property claims in signed access tokens; route-level property comparison; PostgreSQL row-level security using transaction-local tenant context; restricted non-owner runtime login | Immutable permission/export audit events; cross-tenant integration tests; alert on repeated denials |
| Account takeover | Argon2id password hashes, generic login/reset responses, lockout, MFA, five-minute access tokens, hashed rotating refresh tokens, reuse-family revocation, session inventory/revocation | Authentication audit events; auth rate limit; revoke all sessions and rotate signing secrets during incident |
| Booking or API abuse | Distributed Redis-backed global and authentication rate limits, one-megabyte body limit, strict Zod schemas, idempotency keys, database conflict constraints | Rate-limit metrics/logs, booking-conflict metrics, request correlation |
| Forged provider webhook | HMAC verification over canonical payload with constant-time comparison; no browser cookie authentication | Reject before mutation; callback failure/error-rate alert; rotate provider secret |
| Unauthorized data export | Explicit `guest:export` permission, tenant scope, immutable export audit category, no secrets or guest content in telemetry | Review export audit trail and revoke actor sessions |
| Lost or stolen mobile device | Native refresh tokens must be stored only in OS SecureStore; access tokens remain in memory; device-named sessions can be remotely revoked; password/MFA changes revoke existing sessions | User/admin session revocation; refresh-token reuse detection |
| Browser token theft and CSRF | Web tokens are never returned to JavaScript; `HttpOnly`, `Secure`, `SameSite=Strict`, `__Host-` cookies; explicit allowed-Origin and Fetch Metadata gate on cookie-authenticated mutations; strict CORS | `CSRF_REJECTED` errors are correlated and observable |
| Injection, XSS, and log forging | JSON responses, strict schemas, parameterized SQL, Helmet security headers/CSP, request IDs accepted only as UUIDs, query/body/credential log redaction | Privacy-safe error reporting; dependency and security tests |
| Denial of service | Edge/load-balancer limits plus shared Redis rate limits, bounded bodies, bounded telemetry queues, database pool/timeouts, graceful shutdown | Latency/error/dropped-telemetry alerts and load tests |

## Enforced runtime controls

- Production startup fails unless PostgreSQL uses TLS with a non-owner account, CORS origins are explicit HTTPS URLs, `TRUST_PROXY=true`, and the rate-limit store is `rediss://`.
- API traffic is capped globally per normalized client IP. Authentication and password recovery have a tighter shared bucket. Redis makes limits consistent across replicas; store errors fail closed.
- Cookie-authenticated state changes require an allowlisted `Origin`; cross-site Fetch Metadata is rejected. Native bearer requests do not depend on browser-origin headers.
- Helmet enables CSP, HSTS, MIME sniffing prevention, framing protection, and cross-origin resource policy. API responses are `no-store`.
- Inputs are strict and bounded. Unknown fields fail validation, SQL is parameterized, output is serialized JSON, and request bodies are capped at 1 MiB before application parsing.
- Browser credentials remain in host-only HTTP-only cookies. Native clients must use `expo-secure-store`; localStorage, sessionStorage, AsyncStorage, logs, analytics, crash reports, and source-controlled files are prohibited for credentials.

## File upload policy

The current API has no upload endpoint and therefore accepts no files. A future upload feature must not be enabled until it provides all of the following: deny-by-default extension and MIME allowlists; size/count limits at edge and application; random server-side object names; private quarantine storage; signature-based type detection; malware scanning; archive depth/ratio limits; image re-encoding; no executable serving; separate download origin with attachment disposition; tenant-scoped authorization; retention/deletion; and audit events. A scanner timeout or failure must quarantine the object, never publish it.

## Dependency and license review

Local release commands:

```powershell
npm ci
npm audit --omit=dev
npm run security:licenses
npm outdated
```

The 2026-10-29 final refreshed lockfile review found no critical advisory and reported 13 low/3 high inherited Expo/Jest toolchain findings, including a nested Zod advisory under Expo CLI. The API imports the patched direct Zod 4.6.7 and does not load Expo CLI. Expo CLI is build tooling and is not included in the shipped native bundle or API process. npm's proposed automatic fix is an unsafe major downgrade to Expo 51, so the accepted short-term treatment is process isolation plus upgrade monitoring; any server-container image must install only its server dependency closure. All semver-compatible updates were applied and tested. Major upgrades (ESLint 10, Pino 10, and TypeScript 7) remain explicit migrations rather than unreviewed release changes. Reassess on each lockfile change and remove the exception as soon as Expo publishes a compatible patched tree.

Forbidden copyleft/server-side licenses are checked from the lockfile by `npm run security:licenses`. Packages without license metadata are reported for manual review. This command does not replace legal review.

## Release evidence checklist

- [x] Tenant RLS forward/rollback/reapply integration suite
- [x] RBAC, MFA, lockout, session rotation/reuse, reset, and logout integration suite
- [x] Web cookie isolation and CSRF/origin rejection
- [x] CORS allowlist, CSP/security headers, request-ID sanitation, and body limit
- [x] Global/auth rate limits and production Redis/TLS fail-closed configuration
- [x] Forged notification callback rejection and encrypted notification content
- [x] Immutable, privacy-safe audit and observability integration suite
- [x] API load gate at 1,000 requests/concurrency 50 with p95 below 100 ms
- [x] Dependency advisory and license review documented
- [x] Secret rotation and incident response runbooks documented

Sign-off owner: release engineering. Evidence must refer to the release commit; a checked box is invalid after an untested security-relevant change.

