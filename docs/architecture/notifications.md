# Multi-tenant notifications

Notifications are an encrypted PostgreSQL outbox, not fire-and-forget HTTP calls. Every template, preference, delivery, and callback row carries `organization_id` and `property_id`, composite tenant foreign keys, and row-level security. The worker discovers only tenant IDs through a narrow security-definer function, then sets tenant scope and claims due rows with `FOR UPDATE SKIP LOCKED`; multiple workers can run safely for high volume.

## Events and rules

- Reservation confirmations and changes are transactional and cannot be suppressed by an optional-reminder unsubscribe.
- Arrival reminders respect the recipient's reminder preference and unsubscribe timestamp.
- Task assignments respect channel and quiet-hour preferences.
- Urgent blockers may bypass quiet hours only when `urgent_bypass` is enabled.
- Missing destinations or disabled channels create a `suppressed` history row instead of silently disappearing.

The reusable property template seed installs version 1 for email and push in English, French, and Arabic. New wording is inserted as a new version; the prior active version must be deactivated in the same transaction. Preview uses the exact renderer but never calls a provider. Variables are allowlisted by each template and HTML-escaped; email subjects strip CR/LF to prevent header injection.

## Privacy and secrets

Destinations and fully rendered content are serialized and encrypted with AES-256-GCM before entering the outbox. Delivery-history APIs omit ciphertext and provider credentials. Production requires a separate 32-byte encryption key, HTTPS provider URL, provider token, and webhook HMAC secret from the secret manager. Local/test defaults to `FakeNotificationProvider`, which records messages in memory and cannot make an external request.

## Callbacks and replay defense

The provider canonicalizes its JSON body by recursively sorting object keys, then sends `x-keyora-signature: t=<unix-seconds>,v1=<hex HMAC-SHA256>` over `<timestamp>.<canonical-json>`. The API rejects malformed signatures, constant-time compares the digest, and rejects timestamps outside five minutes. `(provider, provider_event_id)` is unique, so a valid replay is acknowledged without applying the state transition twice. Callback payloads are not retained; only their SHA-256 digest and delivery status are stored.

## Operation

Run the API and `npm run notifications:worker` as separate processes. Failed sends retry with bounded minute backoff and become terminal after five attempts. Run `npm run notifications:test` against disposable PostgreSQL to verify migrations, localized preview/no-send, escaping, encrypted-content boundaries, preferences, quiet hours, unsubscribe behavior, urgent bypass, event idempotency, redacted history, signed callbacks, and callback replay handling.
