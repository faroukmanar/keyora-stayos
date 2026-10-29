# Shared API client and repositories

`src/services/http/HttpClient` is the only client transport. It accepts origin-relative paths, sends correlation IDs, keeps native access tokens in memory, reads/writes only the native refresh token through SecureStore, and relies on HttpOnly cookies on web. Four concurrent 401 responses share one refresh promise. A failed refresh clears the local session.

GET requests may retry bounded network/502/503/504 failures. Unsafe requests are never blindly retried. Commands receive a cryptographically random idempotency UUID before their first attempt; if a 401 requires a deliberate post-refresh replay, the same key is preserved. Safe API errors and all success bodies are validated with shared contract schemas. Invalid bodies become `INVALID_API_RESPONSE` rather than flowing into UI state.

Repositories expose domain-oriented room and reservation methods. TanStack query keys always begin with organization and property IDs. The demo adapter is reachable only through an explicit `EXPO_PUBLIC_DATA_SOURCE=demo`/factory option and throws in production builds; `api` is the default.

Run `npm test -- --runTestsByPath src/services/http/__tests__/http-client.test.ts` to verify response validation, single-flight refresh, mutation retry rules/idempotency, and tenant-scoped cache keys.
