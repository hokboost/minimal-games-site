# Audit remediation status — 2026-08-13

This repository was remediated against `minimal-games-site-security-audit-2026-08-13.md`.

## Implemented in code

- Production Web startup only verifies migration names/checksums. DDL remains in the one-shot migrator command; role guidance is in `DATABASE_ROLES.md`.
- Worker authentication uses a stable ID and an independent API/HMAC pair per worker from `WORKER_CREDENTIALS_JSON`.
- Every local sender endpoint requires a per-process capability token. Gift IDs, item count, total count, queue depth, and retained request status are bounded.
- Gift settlement requires a provider transaction ID. PK success without one or more provider transaction IDs remains `uncertain`.
- External gifts and PK have disabled-by-default kill switches. Gift redemption has per-user and global daily spend limits.
- Redeemable chance-game economics now use a 98%–99% policy interval with a 98.5% planning target. Startup/tests reject values outside the interval; Flip and Stone also gate the maximum RTP across player strategies. Quiz is classified separately as a daily-capped skill reward and remains capped at five points per day.
- Game configuration, catalog metadata, exact economics, public projections, profile/history adapters, and mutation-route policy metadata now have central registries under `domain/games/` and `routes/manifest.js`.
- Long-running cleanup and recovery work is owned by an explicit application lifecycle with ordered startup, reverse shutdown, failure rollback, non-overlapping jobs, and in-flight draining.
- New-user balance defaults to zero and the signup award is an explicit, source-labelled ledger posting.
- Administrator login and step-up use the account password; TOTP is no longer a required production setting. High-risk writes require a password verification within ten minutes. Sessions retain absolute 24-hour user / 8-hour administrator lifetimes and can be force-revoked.
- Account login throttling is global by canonicalized username rather than IP-plus-username.
- Language redirects are same-origin only; language cookies have explicit SameSite/Secure behavior.
- Proxy trust is an explicit address allowlist. Public health responses are generic; detailed readiness requires a token.
- PNG normalization runs in a bounded worker-thread queue. Admin user/game queries are limited to a 50-user keyset page.
- Idempotency validation occurs before reservation and per-account pending/daily quotas are enforced. Expired rate limits are deleted and terminal outbox rows are archived.
- Secrets are split by purpose, production dependencies are exactly pinned, release staging is allowlist-based, and the scanner sees ignored local artifacts.
- Plaintext `.env`, Cookie, and listener logs were moved out of the repository to `%LOCALAPPDATA%/MinimalGames/audit-quarantine-2026-08-13`.

## Operator actions still required before value-bearing production use

Code cannot revoke credentials or rewrite remote history. Keep both external-send switches false until all of the following are complete:

1. Rotate database, session, purpose-specific, worker, administrator, and Bilibili credentials from a clean device; revoke all sessions and worker leases.
2. Reconcile every existing `processing`/`uncertain` gift and PK record against authoritative Bilibili history. Do not auto-refund or resend.
3. Rewrite reachable Git history and remove old tags, releases, CI caches, archives, support uploads, and stale clones containing secrets.
4. Create separate migrator, runtime, and audit database roles; prove the runtime role cannot alter schema objects or disable triggers.
5. Configure exact trusted ingress addresses, strong individual administrator passwords, individual worker credentials, spend limits, and the readiness token.
6. Establish an independent provider reconciliation feed and immutable external audit-root export. A sender-provided transaction ID is necessary but is not by itself independent reconciliation.
7. Run PostgreSQL migration/privilege, browser DAST, load, crash-boundary, backup-restore, and provider-sandbox tests in the deployment environment.

The larger architectural recommendations—double-entry promo/redeemable asset separation, Redis/Valkey for ephemeral state, durable broker/outbox consumers, object storage, immutable audit storage, WebAuthn, stronger canonical/confusable-resistant account identifiers, and commit-reveal game randomness—remain staged improvements rather than claims made by this patch.
