# Inventory, media, and maintenance

Status: implementation evidence for issue #11. Every command is local; no hosted CI is used.

## Behavior

- Property-scoped room types, rooms, amenities, policies, and maintenance blocks are managed through `/v1/properties/{propertyId}/...`.
- Every mutation requires a UUID `Idempotency-Key`; replayed keys return the original response and a changed body is rejected with `IDEMPOTENCY_MISMATCH`.
- Room updates and archives are optimistic: clients send the loaded `version`, and a stale write returns `409 STALE_VERSION`.
- Bulk status and ordering changes are owner/manager/front-desk operations. Housekeeping can read inventory but cannot write it.
- Archiving is soft. History and reservations remain intact; archived rooms disappear from default lists.
- Maintenance blocks are additive and never delete rooms. Only one active block can exist per room, and releasing the last block returns the room to `available` without overriding a manual maintenance state.
- Media registration accepts JPEG, PNG, WebP, and AVIF only, enforces a 10 MiB limit, requires a SHA-256 checksum, requires exif/metadata stripping, and returns a short-lived HMAC-signed URL. Object bytes never enter the API process or repository. A deployment replaces the local signed-descriptor endpoint with a private object-storage redirect.
- All inventory mutations write append-only audit events. Domain events are stored in the transactional outbox for realtime clients.

## Local verification

```powershell
$env:MIGRATION_DATABASE_URL='postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5433/keyora_test'
npx tsx apps/api/test/inventory.integration.ts
```

The suite rebuilds the local `_test` schema and proves create/edit/archive, idempotent replay, stale-version rejection, reorder and bulk permissions, media type/signature controls, maintenance blocking/release, and cross-tenant denial.

## Operational rules

- Use the private upload path to strip metadata and malware-scan before calling media registration. A scanner failure must never publish an object.
- Treat signed media URLs as bearer capabilities: do not log them, and keep expiry short.
- Reorder with a complete ordered list; the server assigns dense sort positions in one transaction.
- Bulk changes are bounded to 200 rooms per request.
