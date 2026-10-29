# PostgreSQL tenancy and migrations

The relational model is migration-controlled under `apps/api/migrations`. Every operational row carries `organization_id` and `property_id`; composite foreign keys prevent a room, guest, reservation, task, payment, or user assignment from referencing an object in another tenant. PostgreSQL row-level security is a second boundary, driven by transaction-local `app.organization_id` and `app.property_id` settings after authentication.

Money is stored as non-negative integer minor units with an explicit ISO currency. Reservation dates are constrained and an exclusion constraint prevents overlapping active stays for one room, including concurrent transactions. Audit rows are append-only. Synthetic seeds use reserved UUIDs, `.invalid` email addresses, and a deliberately unusable password-hash marker.

## Local lifecycle

1. Start Docker Desktop, then run `npm run db:up`.
2. Wait for `docker compose ps` to report PostgreSQL healthy.
3. Run `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run db:test` to rebuild the disposable `keyora_test` database schema, prove forward/rollback behavior, constraints, double-booking prevention, and cross-tenant RLS denial, then leave the latest migration applied.
5. Run `npm run db:down` when finished.

The migration and seed tools refuse non-local hosts and database names not ending in `_test`. Production migrations must use the separately documented release approval path and injected owner credentials. Application traffic uses a non-owner login granted membership in the `keyora_app` NOLOGIN role; it must never connect as a superuser or table owner because owners bypass RLS by default.
