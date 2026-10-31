# Guest CRM, privacy, and retention

Status: implementation evidence for issue #13. Every command is local; no hosted CI is used.

## Behavior

- Guest profiles are property-scoped and searched with a tenant-filtered trigram index. Search matches display name; roles with sensitive-data access also match email.
- Phone numbers are encrypted at rest with AES-256-GCM. The encryption key is derived from the API access-token secret plus a `guest` context; the key never exists in the database or repository. A separate HMAC of the normalized phone supports exact duplicate detection without revealing the number.
- Email and phone are masked (`a***@example.com`, `***5678`) for roles without `guest:sensitive`. Housekeeping can read a guest's name and stay summary for room readiness, but never sees contact details or internal notes.
- Internal notes (`preference`, `internal`, `alert`) are visible only to roles with `guest:sensitive`. Deleting a note is a soft delete; the row remains for audit until the guest is anonymized.
- Duplicate detection returns candidates by exact email, exact normalized phone hash, or display-name similarity of at least `0.45`. It is read-only and never merges automatically.
- Merging requires an explicit `confirm: true`, locks both guest rows `FOR UPDATE`, moves reservations and notes to the target, merges preferences with the target taking precedence, records a `guest_merges` snapshot, and anonymizes the source. A merge cannot be undone.
- Updates require the loaded `version`; stale writes return `409 STALE_VERSION`.
- Anonymization clears name, email, phone and hash, preferences, language, VIP and consent flags; soft-deletes notes; scrubs merge snapshots; and preserves reservations so financial history stays intact. It is idempotent, so a repeat erasure request still scrubs any residual merge snapshots.
- Export returns a bounded JSON or CSV extract (5 000 guests) and is audited without including guest PII in the audit metadata.
- Retention is a bounded owner-only operation: guests created before the cutoff with no stay at or after the cutoff and no active reservation are anonymized, up to 500 per run. `dryRun` reports the candidate count without changes.

## Roles

| Capability | Owner | Manager | Front desk | Housekeeping |
| --- | --- | --- | --- | --- |
| Read profile (masked for housekeeping) | yes | yes | yes | yes |
| See email/phone and internal notes | yes | yes | yes | no |
| Create/update profiles and notes | yes | yes | yes | no |
| Merge guests | yes | yes | yes | no |
| Export and anonymize | yes | yes | no | no |
| Run retention | yes | no | no | no |

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/v1/properties/{propertyId}/guests` | `guest:read` |
| `GET` | `/v1/properties/{propertyId}/guests/duplicates` | `guest:read` |
| `GET` | `/v1/properties/{propertyId}/guests/export?format=json\|csv` | `guest:export` |
| `GET` | `/v1/properties/{propertyId}/guests/{guestId}` | `guest:read` |
| `GET` | `/v1/properties/{propertyId}/guests/{guestId}/stays` | `guest:read` |
| `POST` | `/v1/properties/{propertyId}/guests` | `guest:write` |
| `PATCH` | `/v1/properties/{propertyId}/guests/{guestId}` | `guest:write` |
| `POST` | `/v1/properties/{propertyId}/guests/{guestId}/notes` | `guest:write` |
| `DELETE` | `/v1/properties/{propertyId}/guests/{guestId}/notes/{noteId}` | `guest:write` |
| `POST` | `/v1/properties/{propertyId}/guests/{guestId}/merge` | `guest:write` + `guest:sensitive` |
| `POST` | `/v1/properties/{propertyId}/guests/{guestId}/anonymize` | `guest:export` |
| `POST` | `/v1/properties/{propertyId}/guests/retention/run` | `property:manage` |

Every mutation requires a UUID `Idempotency-Key`. Replaying a key returns the original response; reusing it with a different body returns `409 IDEMPOTENCY_MISMATCH`.

## Local verification

```powershell
$env:MIGRATION_DATABASE_URL='postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5433/keyora_test'
npm run guests:test
```

The suite rebuilds the local `_test` schema and proves encrypted contact storage, role masking, masked search, non-destructive duplicate detection, note visibility, optimistic updates, confirmed merge with reservation and note movement, CSV export permissions, idempotent anonymization, retention dry-run and execution, merge-snapshot scrubbing, and PII-free audit metadata.

## Operational rules

- Rotating the API access-token secret also rotates guest phone encryption, making stored phone numbers undecryptable. Treat phone encryption and quote signing as coupled to the same secret rotation runbook; re-encrypt before rotating if phone history must remain readable.
- Run retention in `dryRun` first and review the candidate count. Retention never deletes reservations or audit events.
- Export files are sensitive. Deliver them over an authenticated channel, never email, and delete them after use.
- Do not add guest email, phone, note bodies, or export contents to logs, traces, metrics, or audit metadata.
