# Reservations and revenue

Status: implementation evidence for issues #12 (reservations) and #15 (pricing and quotes). Every command is local; no hosted CI is used.

## Behavior

- Rates live on `rate_plans` with an optional `rate_plan_calendar` override per stay date. Calendar overrides can also close arrival/departure, set minimum/maximum stay, or stop-sell a night.
- Every price is computed as integer minor units (`bigint` in PostgreSQL, `number` in the API). Floating point is never used for money.
- A quote is bound to one property, room, stay, and party. The API signs the canonical payload (quote id, scope, stay, total, currency, expiry, and full breakdown) with HMAC-SHA256 using a key derived from the access-token secret and a dedicated `quote-signing` context.
- Quotes expire after 15 minutes. Reservations only accept a quote whose signature, scope, stay, party, and expiry all still verify. Changing any stored field invalidates the signature instead of silently re-pricing.
- Taxes and fees are calculated per stay: `percent` uses basis points against the nightly subtotal; `fixed` is charged once per stay or once per night.
- Discount codes are validated for activity, date window, minimum nights, and remaining redemptions. Redemptions are consumed atomically when the reservation is created, so a limited code cannot be over-redeemed under concurrency.
- Maintenance blocks overlapping the requested stay reject quoting with `409 ROOM_UNAVAILABLE`.
- Double booking is prevented in the database by the `reservations_no_overlap` GiST exclusion constraint; the API maps the violation to `409 BOOKING_CONFLICT` and increments the booking-conflict metric.
- Stay changes, room reassignment, and re-pricing require the loaded `version` and return `409 STALE_VERSION` on a lost update. Lifecycle transitions are validated server-side and the reservation row is locked `FOR UPDATE`.
- Check-out moves the room to `cleaning` and creates exactly one rush housekeeping task. Cancelling or marking a no-show releases the room only when no other active reservation or maintenance block exists.
- Every mutation writes append-only audit events; reservation lifecycle changes are also published to the transactional outbox.

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/v1/properties/{propertyId}/quotes` | `reservation:write` |
| `GET` | `/v1/properties/{propertyId}/quotes/{quoteId}` | `reservation:read` |
| `GET` | `/v1/properties/{propertyId}/rate-plans` | `reservation:read` |
| `POST` | `/v1/properties/{propertyId}/rate-plans` | `property:manage` |
| `PATCH` | `/v1/properties/{propertyId}/rate-plans/{planId}` | `property:manage` |
| `PUT` | `/v1/properties/{propertyId}/rate-plans/{planId}/calendar` | `property:manage` |
| `GET` | `/v1/properties/{propertyId}/taxes-fees` | `reservation:read` |
| `POST` | `/v1/properties/{propertyId}/taxes-fees` | `property:manage` |
| `GET` | `/v1/properties/{propertyId}/discounts` | `reservation:read` |
| `POST` | `/v1/properties/{propertyId}/discounts` | `property:manage` |
| `GET` | `/v1/properties/{propertyId}/cancellation-policies` | `reservation:read` |
| `POST` | `/v1/properties/{propertyId}/cancellation-policies` | `property:manage` |
| `GET` | `/v1/properties/{propertyId}/reservations` | `reservation:read` |
| `GET` | `/v1/properties/{propertyId}/reservations/{reservationId}` | `reservation:read` |
| `POST` | `/v1/properties/{propertyId}/reservations` | `reservation:write` |
| `POST` | `/v1/properties/{propertyId}/reservations/{reservationId}/change-stay` | `reservation:write` |
| `POST` | `/v1/properties/{propertyId}/reservations/{reservationId}/reassign` | `reservation:write` |
| `POST` | `/v1/properties/{propertyId}/reservations/{reservationId}/reprice` | `reservation:write` |
| `POST` | `/v1/properties/{propertyId}/reservations/{reservationId}/transitions` | `reservation:check-in` |

Every `POST`/`PATCH`/`PUT` requires a UUID `Idempotency-Key`. Replaying a key returns the original status and body; reusing it with a different payload returns `409 IDEMPOTENCY_MISMATCH`.

## Local verification

```powershell
$env:MIGRATION_DATABASE_URL='postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5433/keyora_test'
npm run reservations:test
```

The suite rebuilds the local `_test` schema and proves the golden pricing case (2 nights, 10% tax, fixed fee, 10% discount, total `302000` in minor units), quote tamper detection, idempotent creation, concurrent double-booking rejection, invalid transitions, check-out room turn idempotency, change-stay/reassign flows, stop-sell and minimum-stay enforcement, and audit coverage.

## Operational rules

- Rotate the quote signing secret by rotating the API access-token secret; outstanding quotes then fail closed and clients re-quote.
- Never widen quote expiry without also reviewing the signature and stay checks; expiry is signed.
- Keep `MIGRATION_DATABASE_URL` credentials local and ephemeral. The API runtime role is `keyora_app` under row-level security.
- Treat `409 BOOKING_CONFLICT` as a normal race outcome and let the client re-quote rather than retrying the same quote.
