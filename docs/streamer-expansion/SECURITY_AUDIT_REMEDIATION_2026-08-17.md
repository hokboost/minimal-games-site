# Streamer World production-safety remediation

Pre-remediation audit target: `66d515810ad380739a88033fb5a2d0481f67b7e6`
Comparison base: `023d90d708a19ecbbb755c30fd098da99f379bf8`
Remediation date: 2026-08-17

This is the repository-side completion record for the 26 findings in
`streamer-world-security-audit-pack.zip`. It distinguishes tests executed against disposable
infrastructure from the separately controlled production migration. The production ledger was
successfully advanced and verified at 33 applied migrations with zero failures. No database
credential is stored in the repository or this report, and no real Bilibili/provider send was
performed.

## 1. Threat model and trust boundaries

The protected subjects are creator profile/evidence/report data, live-room history, hidden game
and Story state, Quest progress, points, reward budget/inventory, administrator authority,
provider delivery state, and the release artifact. Untrusted inputs include browsers, stale Socket
connections, external event producers, concurrent requests, guessed UUIDs, client clocks, content
drafts, historical database rows, and unpacked release archives.

Authoritative boundaries are PostgreSQL row locks and constraints, current authenticated sessions,
current creator consent/preferences, version-bound content registries, `BalanceLogger`, the
existing backpack/outbox/provider-receipt state machine, and the tracked migration ledger. Browser
claims never establish score, progress, recipient, visibility, timestamp, reward amount, or
completion. Quiet hours may suppress realtime delivery but never erase the durable record. A
possibly sent provider operation remains `uncertain`; remediation code neither retries nor refunds
it automatically.

## 2. Findings, reproductions, changes, and results

All migration changes below are new forward-only files. Existing applied migration bytes were not
rewritten.

| # | Reproduction and root cause | Remediation and principal files | Migration | Result |
|---|---|---|---|---|
| 1 | Role-restricted Live events reached a shared Socket room. Mixed-audience tests demonstrated cross-role delivery. | Durable `audience`, role/user rooms, per-delivery DB revalidation, and cross-instance filtering in the Live repository, delivery service, gateway, and `server.js`. | `add_streamer_security_live_acl.sql` | Owner/creator/system isolation, `both` exactly once, and two-instance delivery pass. |
| 2 | Catch-up/state/ack ignored recipients and former membership. A 240-event mixed page reproduced leakage/cursor gaps. | Viewer-role filters, visible high-water marks, active membership checks, conservative historical backfill, and owner-only Director history filtering. | `add_streamer_security_live_acl.sql` | REST, Socket, pagination, former-member and Director paths pass. |
| 3 | Cooperative consent was checked only at start. Concurrent revoke/action tests allowed stale progress. | One consent coordinator rechecks room, membership, opt-in, reports, mute, game preference, account and role on start/state/action/resume/trusted event/socket; revoke atomically abandons the run. | `add_streamer_security_communication_privacy.sql` | Leave/report/mute/opt-out/block/deactivation and action-vs-revoke tests pass. |
| 4 | Missing production flags were synthesized as enabled. | Removed production defaults; exact lowercase booleans, module dependency/readiness probes, owner/reward prerequisites, and documented kill switches. | None | Missing/false disable; malformed or enabled-with-missing-schema fails closed. |
| 5 | Live Quest invitation selected nonexistent `definition.category` (PostgreSQL `42703`). | Query now uses immutable version-owned category; real service and admin route execute it. | None | Fresh and historical PostgreSQL tests pass. |
| 6 | Quest evaluated 366 days of history, including pre-acceptance/cross-occurrence events. | Inclusive acceptance/due windows, exclusive terminal bound, +5-minute future cap, per-assignment event-consumption ledger, and versioned reuse opt-in. | `add_streamer_security_quest_windows.sql` | Boundary, replay, semantic collision, concurrent final event and ledger rollback tests pass. |
| 7 | A guessed future/expired board/version bypassed the schedule. | Claim locks current active schedule, board, slot and version through assignment insertion and checks category/cooldown/prerequisites. | None | Current succeeds; future/expired/retired/blocked/cooldown/concurrent cases pass. |
| 8 | Preferred windows mishandled overnight periods and were not consistently enforced. | Central creator communication policy handles previous weekday, IANA timezone and DST and is used by Live, games, rewards, presence and Socket delivery. | `add_streamer_security_communication_privacy.sql` | Toronto/UTC/Shanghai and hard/async-only boundary tests pass. |
| 9 | Quiet-time reward notifications were dropped. | Reward grant always writes durable inbox; policy controls only post-commit realtime fanout. | `add_streamer_reward_security_outbox.sql` | Reload/read/archive survives quiet delivery with zero realtime fanout. |
| 10 | `postpone_until` did not affect due time and assignments never expired. | True due extension, bounded postpone policy, terminal `expired`, immutable audit/events, and idempotent lifecycle worker. | `add_streamer_security_quest_lifecycle.sql` | Double-worker expiry, recurrence and restart tests pass. |
| 11 | Completed prerequisites left dependent Quest steps locked. | Published DAG validation plus same-transaction dependent-step activation for automatic/manual/hybrid paths. | `add_streamer_security_quest_lifecycle.sql` | Missing/cyclic dependencies fail publication; completion races pass. |
| 12 | Review policy was read but not enforced; `rejected` became `returned`. | Honest terminal rejection and `none`/owner/admin/independent reviewer authorization, with UI/API/audit agreement. | `add_streamer_security_quest_lifecycle.sql` | Ownerless admin, configured owner and sensitive independent moderation pass. |
| 13 | The seeded twelve weeks eventually ended. | Creator-timezone rolling materializer with stable week identity, advisory lock and bounded 12-week horizon. | `add_streamer_security_quest_lifecycle.sql` | Week 13, restart, duplicate and timezone tests pass. |
| 14 | Per-game preferences were stored but ignored after invitation. | Preference checks on invite/accept/start/every cooperative operation; a new block abandons active runs neutrally. | `add_streamer_security_communication_privacy.sql` | Full lifecycle and browser report/leave/reconsent paths pass. |
| 15 | Achievement-gated items were unreachable and hidden IDs were enumerable through wishlist/detail. | One reward visibility policy covers list/detail/wishlist/redeem/grant, queries immutable achievement/Story/season facts, and returns generic 404. | `add_streamer_reward_security_outbox.sql` | Hidden enumeration and unlock-vs-redemption serialization pass. |
| 16 | Trusted reward grant had no production producers; several achievements were unreachable. | Immutable source-side grant intents, leased dispatcher/dead letter, five trusted sources, closed 60-row producer matrix, missing Quest/game/Bingo/resume events. | `add_streamer_reward_security_outbox.sql`, `add_streamer_achievement_producers.sql` | Replay/crash/collision/rollback produce one order/budget/inventory and no provider send. |
| 17 | Story intervention validation used Season One only. | Five-season, content-hash/version-bound published registry validates the current authored owner node. | None | All five immutable versions and stale/wrong-node rejection pass. |
| 18 | Every admin could read fields documented as owner-only. | Database redaction, exact configured-owner check, account/authorization revalidation, and read audit in the same transaction. | `add_streamer_security_communication_privacy.sql` | Creator/owner/ordinary/deactivated/missing-owner and revoke race pass. |
| 19 | The reported configured owner could review their own report. | Independent active moderator, immediate freeze, owner evidence redaction, resolution, then explicit creator re-consent. | `add_streamer_security_communication_privacy.sql` | PostgreSQL and three-isolated-context Chromium paths pass. |
| 20 | Room lists reused the selected room's mute/report boundary. | Boundary is loaded and projected per room. | None | Two-room divergent mute/report tests pass. |
| 21 | Checkpoint recovery merged abandoned-branch unlocks/memories/completions. | Exact snapshot restore; explicit branch-local/account-meta/irreversible-entitlement provenance registry and economic allowlist. | `add_streamer_story_progression_scopes.sql` | Mutually exclusive branch farming, rollback, race, replay and reward/Quest denial pass. |
| 22 | Dream Maze daily identity used UTC and allowed timezone-change double play. | Server-only IANA calendar key and immutable UTC window, including 23/25-hour DST days; all starts lock creator then reject overlapping historical windows. | `add_streamer_game_daily_calendar.sql` | Toronto/Shanghai/UTC, timezone change and concurrent start pass. |
| 23 | `MAX(sequence)+1` assumed callers already locked reward order. | Repository itself locks the parent order before allocating sequence. | None | Twenty direct concurrent appends, rollback reuse, missing parent and transition race pass. |
| 24 | Locked hidden achievements still returned semantic slugs. | Locked projection is only `{hidden:true,locked:true}`; full identity appears after trusted unlock. | None | Domain/API/DOM transport privacy tests pass. |
| 25 | Quest eligibility runtime supplied relationship only; negated missing facts could become eligible. | Bounded closed fact collector loads referenced achievements, current non-replay Story flags, collection holdings and relationship under authoritative locks; draft/publish revalidate. | None | Positive/negative/NOT/mixed/conflict/budget/client-forgery and real PostgreSQL tests pass. |
| 26 | Development ZIP lacked verifiable provenance and portable extraction/SBOM controls. | Node 20 release builder, Git-index-only allowlist, strict credential/path/collision policy, normalized safe tar preflight, deterministic archive, manifest/SHA, 33-migration ledger, npm+Python CycloneDX inventory, clean unpack/install/migrate/boot/SIGTERM verifier. | None | Formal release requires a clean Git tree; exact post-commit archive SHA is recorded in `build/artifacts/RELEASE-ARCHIVE.json`. |

The final cross-review also closed integration defects not explicit in the original 26 rows.
Director summaries exclude creator/system-only history; configured-owner sensitive reads are one
locked/audited transaction; locked accounts are rejected again inside authoritative writes.
Multi-account authority locks now use one global user-ID order and the weakest sufficient PostgreSQL
row lock, with dynamic profile/relationship facts read in a fresh statement after the user barrier.
Quest evidence retention follows users-to-assignments-to-evidence order. Finally, a pre-business
capacity rejection can no longer poison a new idempotency key as indeterminate: only that precisely
marked rejection deletes its own still-pending key and returns a bounded retryable 503, while
completed/pending/indeterminate replay and all business 5xx retain their original safety semantics.

## 3. Migration, backfill, and rollback plan

The complete tracked ledger contains 33 migrations. Security migrations are applied after the nine
original Streamer World migrations in this order:

1. `add_streamer_security_quest_windows.sql`
2. `add_streamer_security_live_acl.sql`
3. `add_streamer_security_quest_lifecycle.sql`
4. `add_streamer_reward_security_outbox.sql`
5. `add_streamer_achievement_producers.sql`
6. `add_streamer_security_communication_privacy.sql`
7. `add_streamer_story_progression_scopes.sql`
8. `add_streamer_game_daily_calendar.sql`

Backfills are conservative: unknown Live audiences become system-only; historical Quest event
consumption cannot be reused across occurrences; old Story unlocks become non-economic legacy
provenance; existing daily rows use UTC windows. Immutable triggers prevent later policy drift.
Fresh-schema and two historical-upgrade shapes execute in disposable PostgreSQL. Database rollback
is forward-fix only; application rollback disables exact feature flags and preserves immutable
history.

## 4. Activation and kill switches

All product flags default off. Enable only exact lowercase `true` after migrations and readiness
checks. `STREAMER_WORLD_ENABLED=false` closes the entire expansion; each child module also has its
own switch. Live additionally requires one exact active, authorized, unlocked owner. Rewards require
the complete active catalog and budgets. `EXTERNAL_GIFTS_ENABLED=false` and
`PK_EXTERNAL_SEND_ENABLED=false` remain independent external-value kill switches. Full operator
steps are in `docs/STREAMER_WORLD_OPERATIONS.md`.

## 5. Achievement producer matrix

The generated, CI-checked 60-row matrix is
`docs/streamer-expansion/ACHIEVEMENT_PRODUCER_MATRIX.md`. Every published definition maps to a
closed trusted event, concrete service method, immutable source identity and integration test.

## 6. Reward source matrix

`docs/streamer-expansion/REWARD_SOURCE_MATRIX.md` documents Quest, Story, game, achievement and
season/archive intents. Settlement is idempotent and transactional. Provider-backed output stops at
stored `wish_inventory`; it never creates a delivery request or calls a provider.

## 7. PostgreSQL evidence

Node 20 disposable PostgreSQL 16 tests execute the full 33-migration fresh path and two historical
upgrade paths. They additionally exercise Live ACL/multi-instance races, Quest windows/lifecycle,
reward ordering/outbox, Story progression scopes, Dream Maze calendars, authority-lock and
statement-snapshot races, retention lock order, capacity admission, rollback, response loss and
restart. These suites use disposable local credentials. Separately, the controlled production
migration completed with 33 applied migrations and zero failures; its credentials were neither
printed nor persisted.

## 8. Browser evidence

Playwright Chromium uses isolated creator, owner and moderator contexts. It covers login/consent,
open/send, role-scoped Socket plus REST recovery, quiet durable/no-realtime delivery, report freeze,
owner evidence denial, independent resolution, explicit re-consent, cooperative start, leave and
run abandonment. The existing site E2E remains in the same required `test:e2e` chain.

## 9. Two-instance Socket evidence

Two real Node processes share PostgreSQL and the event bus. Owner-, creator-, both- and system-only
events retain ACL across instances; stale membership/session/consent cannot subscribe or receive;
delivery is deduplicated and catch-up cursors remain bounded.

## 10. Load and resilience evidence

The final five-second bounded load run produced 2,049 responses: 2,002 HTTP 200 and 47 controlled
pre-business HTTP 503 capacity responses carrying `Retry-After: 2`. Those rejections are explicitly
retryable, create no game/idempotency side effect, and are distinct from indeterminate business
failures. The run recorded p95 15 ms, p99 23 ms, an eight-connection application maximum, ten
cross-instance rate-limit responses, and two-instance Socket fanout. Resilience suites cover
response loss, semantic collision, CAS,
transaction rollback, lease recovery, dead letters, account/consent revocation, graceful lifecycle
shutdown and zero provider calls.

## 11. Dependencies and SBOM

CI runs `npm audit`, `npm audit --omit=dev`, `npm ls --all`, Python `pip-audit`, unit/Python tests and
compile checks. Python direct dependencies are pinned and a hash-locked transitive
`workers/bilibili/requirements.lock` is packaged. The release CycloneDX 1.5 SBOM contains complete
production npm and Python component inventories and dependency graphs with integrity metadata.

## 12. Release artifact

Formal staging requires Node 20+ and `RELEASE_REQUIRE_CLEAN=true`. The archive is deterministic for
the commit timestamp and includes `RELEASE-METADATA.json`, `FILE-MANIFEST.json`, `SHA256SUMS`, the
33-entry migration ledger and `SBOM.cdx.json`. `release:verify` preflights tar headers before
extraction, rehashes the tree and ledger, installs production-only npm dependencies in a clean
unpack, migrates a fresh disposable database, boots with every Streamer World/provider flag off,
checks `/ready`, and requires graceful SIGTERM. The exact final archive hash is necessarily emitted
after the source commit and is reported alongside the pushed commit rather than embedded into that
same commit.

## 13. Remaining unknowns and accepted risks

- These results are code/release-candidate evidence, not a production penetration test or proof of
  the hosting provider's backup/restore procedure.
- The production ledger is at 33 applied migrations with zero failures. Backup/restore validation,
  exact owner configuration, readiness review and deliberately phased feature activation remain
  operator actions. Keep all new feature flags false until those steps are completed.
- Director intentionally supports one configured owner. Sensitive reports require an independent
  active moderator.
- Story economic eligibility is explicit and fail-closed; an authored/catalog mapping must be
  published before a new Story unlock can reveal a reward.
- Bingo accepts only an owner-confirmed allowlisted adapter. A new provider requires a separate
  trusted server adapter.
- Provider-backed rewards remain stored until the creator invokes the existing backpack flow.
  Existing `uncertain` deliveries still require manual receipt reconciliation.
- Source review cannot guarantee that no undiscovered vulnerability exists. Monitor audit failures,
  event-bus lag, dead letters, idempotency indeterminate records, database lock waits, reward budgets
  and provider reconciliation after a deliberately small pilot.
