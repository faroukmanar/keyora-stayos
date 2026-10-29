# Security incident and secret rotation runbook

## Incident response

1. Declare severity and incident commander; record UTC time, affected tenant(s), release version, request/trace IDs, and what is known without copying secrets or guest content.
2. Contain: revoke affected sessions, disable compromised integration credentials, restrict exports, lower rate limits or block abusive sources at the edge, and isolate affected workers. Preserve database and immutable audit records.
3. Investigate with the privacy-safe queries in the observability runbook. Correlate authentication, permission, export, webhook, and error events by request/trace ID. Do not query or paste plaintext notification content into tickets or chat.
4. Eradicate: patch the root cause, rotate affected secrets, invalidate sessions when signing/encryption material is involved, and run the full release gate in a clean environment.
5. Recover gradually, monitor denial/error/latency and audit signals, validate tenant isolation, then restore normal limits.
6. Notify customers/regulators according to contractual and legal timelines. Produce a blameless post-incident review with corrective owners and dates.

## Rotation rules

- Secrets live only in the deployment secret manager. Never place them in `.env` committed files, source, build artifacts, issue comments, telemetry, screenshots, or client bundles.
- Use independent random values per environment and purpose. Encryption/signing keys must be at least 256 bits; provider tokens follow provider guidance.
- Rotate provider and webhook credentials with an overlap window when the provider supports two active versions. Deploy consumers first, verify, then revoke the old value.
- Rotating `ACCESS_TOKEN_SECRET` immediately invalidates access tokens; also revoke refresh sessions for a suspected authentication compromise.
- Rotating MFA or notification encryption keys requires a versioned key-ring migration. Do not replace a key until all ciphertext has been re-encrypted and verified; retain the previous key only for the bounded rollback window.
- Rotate database and Redis credentials by creating a new restricted credential, deploying it, verifying health/readiness and RLS, then revoking the old credential.
- Rotate metrics, trace, and error-export tokens independently and confirm exporters recover without leaking payloads.

## Compromise-specific actions

| Compromise | Immediate actions |
| --- | --- |
| User/device token | Revoke the session/family; reset password if credentials may be known; require MFA; inspect authentication audit events |
| Access signing secret | Replace secret, restart all replicas, revoke every refresh session, force reauthentication |
| Database credential | Disable old login, issue restricted replacement, inspect audit/database logs, verify RLS and backups |
| Notification webhook/provider | Disable integration, rotate both token and HMAC secret, replay only verified idempotent events |
| Encryption key | Isolate affected service, assess ciphertext exposure, perform versioned re-encryption, revoke old key after verification |

After every rotation, run health/readiness, authentication, tenant-isolation, webhook-forgery, observability, and performance smoke gates before declaring recovery.
