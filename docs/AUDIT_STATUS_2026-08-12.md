# Code Audit Status - 2026-08-12

This document tracks the audit against
`minimal-games-site_完整代码审计与AI修复手册.md`. It records verified scope; it
does not claim that the repository is mathematically bug-free.

## Completed and verified

### Secrets and repository hygiene

- Removed tracked environment files, Cookie helpers, fixed test accounts,
  emergency database scripts, old schema setup scripts, dumps, and answer-bank
  backups from the current tree (P0-01, P0-02, P3-03, P3-05, P3-06, P3-11).
- Added a repository secret scanner, safer `.gitignore`, complete configuration
  example, production configuration validation, and guarded security scripts.
- Vendored and checksum-pinned the PK worker scripts that were previously
  external to the repository (P2-03).

### Money, ledger, and idempotency

- Money is parsed as bounded safe integers; PostgreSQL enforces non-negative
  integer balances. All application balance changes use the transaction-owned
  ledger service (P1-01, P1-34, P2-45).
- Immutable pre-cutover fractional ledger rows are preserved exactly. The
  database rejects every new fractional ledger row, while clean databases fully
  validate the integer constraint.
- Balance changes, ledger rows, business state, and HTTP idempotency snapshots
  commit together. Lost/ambiguous commits become durable `indeterminate`
  records and are not executed again (P0-03, P1-02 through P1-07).
- Added append-only ledger/admin/worker evidence, balance-chain triggers,
  per-user baselines, and `balance_audit_current` reconciliation checks.
- Paid routes use PostgreSQL-backed rate limits plus global/per-user concurrency
  limits, and fail closed when required middleware is absent (P0-04, P2-11,
  P2-13).

### Authentication and administration

- Unified CSRF handling, removed state-changing GET logout, normalized login
  input, equalized unknown-user password timing, and removed attacker-driven
  account lockout (P1-12 through P1-15, P1-21 through P1-24).
- Session revocation is checked transactionally for protected writes; Socket.IO
  sessions are revalidated and cross-instance events use PostgreSQL.
- Administrator IP restrictions and optional HMAC bypass logic were removed.
  High-risk writes require recent password verification and optional TOTP, and
  success/failure is audited (P1-28, P1-31, P1-32).
- Account removal is now deactivation: financial/security evidence is retained,
  sessions are revoked, and unstarted external work is safely released
  (P1-29). Password resets use short-lived hashed one-time tokens (P1-30).

### Gift and PK external effects

- Worker signatures bind method, path, body, nonce, timestamp, and worker ID;
  nonces are durable and replay protected (P0-05).
- Gift delivery uses claim tokens, leases, generations, explicit pre-send and
  uncertain states, provider confirmation, durable events, and an outbox.
  Started/ambiguous sends are never automatically refunded (P1-39 through
  P1-42).
- PK spending reserves funds before the send, records a durable local intent,
  requires an explicit send-start transition, and settles/reconciles by stable
  authorization/report IDs (P0-06, P1-43, P1-44, P1-46).
- PK controls use monotonic generations and recover expired runner leases.
  Child startup must be explicitly confirmed; failed runner lease renewal stops
  the local process.
- Only one Windows worker instance can hold the database lease. Gift and PK
  sends also share a cross-process provider lock, so accidentally starting two
  listeners cannot duplicate a claim or send concurrently (P1-45, P2-01).
- Authorization revocation, room changes, and account deactivation atomically
  cancel/refund only work proven not to have started, stop PK, and preserve
  uncertain work for reconciliation.

### Games, frontend, privacy, and operations

- Quiz sessions store immutable question snapshots, issue all 15 tokens,
  require all answers, settle once, resume active games, and use correct daily
  leaderboard boundaries (P2-35). The artificial half-second answer delay was
  removed.
- Wish, slot, scratch, blindbox, stone, flip, duel, spin, and dictation money
  paths are transactionally locked and idempotent. Existing reward/probability
  tables were not intentionally changed. Stone replacement follows the agreed
  dominant-color slot advance behavior.
- Dictation answers/audio/images are no longer public static data; sessions,
  prompt tokens, progress, and review transitions have database constraints
  and concurrency checks (P0-08, P2-26 through P2-33).
- Removed dynamic HTML sinks and inline style/script dependencies; CSP is
  restrictive. Logs redact secrets and hash identifiers (P1-26, P1-27,
  P2-21 through P2-25).
- UX ingestion validates same-origin session tokens, separates tabs, minimizes
  identifiers by default, supports explicit detailed-preference consent, batches
  writes, and has retention cleanup (P2-14 through P2-20).
- Added strict TLS configuration, trusted proxy parsing, readiness/schema checks,
  graceful shutdown, tracked migrations, Node 20, `npm ci`, CI checks, and a
  deployment/worker/reconciliation runbook (P0-07, P1-08 through P1-11,
  P2-04, P3-01, P3-02, P3-04, P3-10).

## Still open or requiring external action

### Must be handled outside this commit

- **Rotate every formerly exposed secret and Bilibili Cookie.** Deleting files
  does not invalidate values in old Git commits, backups, screenshots, Render,
  or local machines (remaining part of P0-01/P0-02).
- Decide separately whether to rewrite Git history. That requires coordination
  and a force push, so it was intentionally not done in this audit.
- Configure `ADMIN_TOTP_SECRET` in production. The code supports TOTP, but an
  unset production secret means step-up is password-only. Dual approval or a
  hardware-key flow is not yet implemented.
- Bilibili does not provide a confirmed universal idempotency/provider
  transaction ID for every send path. Missing confirmation is conservatively
  held as `uncertain`; it still requires administrator/provider reconciliation
  (remaining risk in P0-06, P1-42, P2-38).
- Windows Cookie storage is atomic and excluded from Git, but it still uses a
  local file. Moving it to Windows Credential Manager/another secret store and
  auditing Windows ACLs remains open (P2-02).

### Next audit session

- Run real multi-instance HTTP fault injection: kill before commit, after commit,
  during response loss, during worker lease takeover, and during provider
  timeout. The current suite covers database and service invariants but not all
  process-kill timings from the final acceptance section.
- Add browser E2E coverage for every game on desktop/mobile and repeat paid
  actions under double-click, reload, back/forward navigation, and offline
  recovery.
- Run sustained load tests against a production-like multi-instance deployment,
  including PostgreSQL pool pressure, Socket.IO fan-out, rate-limit contention,
  worker takeover, and P99 latency.
- Add SBOM/gitleaks/TruffleHog and online dependency scanning to hosted CI. Local
  `npm audit` and the repository scanner pass, but historical-secret scanning
  and continuous CVE monitoring remain operational work (P3-12).
- Review product-rule items that should not be changed by an auditor without an
  explicit decision: verifiable-fairness claims (P2-34), flip auto-cashout/bad
  card reward semantics (P2-40), and any future probability/reward changes.
- Remove or rewrite stale historical feature/i18n reports, especially
  `docs/WISH_FEATURE_SUMMARY.md`, which does not describe the current
  implementation. It must not be used as the live probability specification.

## Verification performed for this checkpoint

- `npm run test:all`
- `ALLOW_DATABASE_CREATE_TEST=true npm run test:migrations`
- `npm ls --all`
- `npm audit` (including production-only audit)
- `git diff --check`
- Fresh database migration plus upgrades from two historical schema shapes
- Ledger trigger, state-machine, worker lease/takeover, idempotency, HMAC,
  concurrency, random-boundary, and worker-spool regression tests

## Production database checkpoint

- All 10 tracked migrations were applied. The final hardening migration records
  two attempts because its first transaction safely rejected legacy fractional
  evidence and rolled back before the compatibility rule was added.
- All 29 current account baselines reconcile in `balance_audit_current`; there
  are no invalid user balances or duplicate active room bindings.
- The 95 immutable legacy fractional ledger rows remain exact and the database
  constraint rejects new fractional rows. Existing gift work is terminal and
  there are no unresolved PK spend authorizations.
- After every deployment, run exactly one updated Windows worker and verify its
  active `worker_role_leases` and recent `worker_heartbeats` rows.
