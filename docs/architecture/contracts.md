# Shared contract boundary

`packages/contracts/openapi/v1.json` is the source of truth for every HTTP route exposed to native and web clients. `packages/contracts/src/generated.ts` contains the checked-in transport types generated from that versioned source. `packages/contracts/src/schemas.ts` adds strict runtime validation at trust boundaries. None of these files imports React, React Native, Expo, a database driver, or a server framework.

## Ownership boundaries

- **Domain:** business invariants and state transitions; no transport or UI dependency.
- **Contracts:** wire shapes, operation names, safe errors, and runtime validation; no framework dependency.
- **API:** authenticates actors, enforces organization/property scope, calls domain/application services, and maps results to contracts.
- **Client repositories:** use generated transport types, validate untrusted responses with the shared schemas, scope cache keys by organization and property, and expose domain-oriented methods.
- **Native and web UI:** consume repositories only. UI code must not build SQL, parse tokens, or depend on database models.

## Versioning and compatibility

The public base path carries a major version (`/v1`). Within a major version, additions must be backward compatible: optional request fields, new response fields, new enum values only when clients safely handle unknown values, or new operations. Removing or renaming a field, changing its meaning/type, tightening accepted input, or changing authorization semantics requires a new major version.

Deprecated operations remain supported for at least two released mobile versions and 180 days after a replacement ships, whichever is longer. Deprecations are announced through documentation and response headers (`Deprecation`, `Sunset`, and `Link`). The server must keep accepting the oldest supported mobile contract during staged app-store rollout. Emergency security removal requires an incident record and a forced-upgrade path.

## Local verification

Run `npm run contract:validate` to verify the contract shape, operation identifiers, mutation idempotency requirements, and generated-type traceability. `npm test -- --runTestsByPath packages/contracts/__tests__/schemas.test.ts` verifies strict runtime parsing and key invariants with synthetic data.
