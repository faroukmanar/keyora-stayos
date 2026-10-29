# Authentication and authorization

KEYORA issues five-minute HS256 access tokens and opaque 256-bit refresh tokens. Refresh tokens are stored only as SHA-256 hashes in PostgreSQL, rotate on every use, and belong to a session family. Reusing an already-rotated token revokes the entire family. Every authenticated request verifies the access signature, issuer/audience/expiry, active database session, user status, and password version; logout, password reset, MFA changes, and device revocation therefore force access denial immediately.

Native clients receive tokens in the response. `src/services/auth/secure-session.ts` stores only the refresh token in Expo SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; it explicitly refuses browser storage. Web clients never receive tokens in JSON and use `HttpOnly`, `SameSite=Strict`, `Secure` `__Host-` cookies outside local/test profiles. Neither client stores passwords, access tokens, guest data, or provider credentials in AsyncStorage/localStorage.

Passwords use Argon2id (64 MiB, three iterations, one lane). Five failed attempts lock an account for fifteen minutes. Login errors are deliberately generic. Password-reset responses are always 202 to resist enumeration; reset tokens are random, hashed in the database, single-use, valid for thirty minutes, and revoke every session when consumed. Production startup requires HTTPS reset/provider URLs and an email provider token from the secret manager. Reset tokens are sent directly to the provider and are never logged or stored in plaintext.

Optional TOTP MFA uses 160-bit secrets, accepts a one-window clock drift, and encrypts secrets with AES-256-GCM. Production requires a separate 32-byte encryption key. Enabling/disabling MFA increments `password_version`, invalidating existing access tokens.

## Role matrix

- Owner: all property, staff, room, reservation, guest, housekeeping, payment, refund, export, and audit permissions.
- Manager: operational permissions except organization/property ownership changes.
- Front desk: room operations, reservations/check-in, guest service, payment read, and housekeeping read.
- Housekeeping: room read and housekeeping read/write only.

UI guards are convenience only. API handlers must call the permission matrix in `apps/api/src/auth/permissions.ts`; database RLS remains a separate tenant boundary.

## Local synthetic accounts

After `npm run db:migrate` and `npm run db:seed`, run `npm run db:seed-users`. The command creates owner, manager, front-desk, and housekeeping accounts under reserved `.test` email addresses, generates a high-entropy password when `KEYORA_MOCK_PASSWORD` is unset, prints it once, and persists only its Argon2id hash. The tool refuses remote databases and names not ending in `_test`. Never reuse these accounts or passwords in staging/production.

## Verification

`npm run auth:test` rebuilds the disposable schema and verifies the permission matrix, native token response, web cookie flags/no-token JSON, session listing, refresh rotation, family revocation on reuse, lockout, password reset and global revocation, TOTP MFA, secure logout, and synthetic-only fixtures. `npm run db:test` also proves both auth and core migrations roll forward and back.
