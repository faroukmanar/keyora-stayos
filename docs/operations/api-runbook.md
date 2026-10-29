# API local runbook

## Configuration ownership

Local, test, staging, and production use explicit `KEYORA_PROFILE` values. The platform owner controls staging/production environment variables in the deployment secret manager; developers may use an ignored `.env.local`. Public Expo values use `EXPO_PUBLIC_*` and are never secrets. Database credentials, signing material, provider secrets, and session keys are server-side variables only and must never be committed or included in client builds.

The process validates configuration before listening. Staging and production require database TLS. Production rejects HTTP browser origins and local/example database configuration. CORS is an explicit allowlist; `*` is invalid.

## Start and verify

1. Copy `.env.example` to ignored `.env.local` and adjust only local values.
2. Export the variables in the active shell or inject them with the deployment platform.
3. Run `npm run api:dev` for watched development or `npm run api:start` for a single process.
4. Run `npm run api:smoke` for a disposable-process health, readiness, request-ID, startup, and graceful-shutdown check.
5. Run `npm run check` before committing.

Health is exposed at `/v1/health`; readiness is exposed at `/v1/ready`. Load balancers may route traffic only while readiness returns 200. Logs redact authorization, cookies, passwords, and refresh-token fields. Client errors use a stable safe envelope and internal failures do not expose stack traces.

## Shutdown

Send `SIGTERM` (deployment) or `SIGINT` (local). The server stops accepting connections, drains Fastify requests, and exits. A ten-second guard terminates a hung shutdown with a failure status so the orchestrator can alert rather than silently stall.
