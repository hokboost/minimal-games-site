# Streamer World expansion progress

Base commit: `023d90d708a19ecbbb755c30fd098da99f379bf8`
Started at: `2026-08-16T22:51:18Z`
Last updated: `2026-08-17T01:29:59Z`

## Pre-existing working-tree changes

The first expanded status inspection found only the installed Agent bootstrap files below. They predate Streamer World implementation work and must not be staged or altered accidentally except when the package itself explicitly requires maintaining `PROGRESS.md`.

- `?? .claude/agents/streamer-world-builder.md`
- `?? KICKOFF_PROMPT.md`
- `?? README_STREAMER_WORLD_AGENT.md`
- `?? docs/STREAMER_WORLD_PRODUCT_BLUEPRINT.md`
- `?? docs/STREAMER_WORLD_REPOSITORY_AUDIT.md`
- `?? docs/streamer-expansion/PROGRESS_TEMPLATE.md`
- `?? scripts/count-streamer-expansion-lines.js`
- [x] Recorded all pre-existing dirty paths.

## Baseline

- [x] `npm run test:all` passed before expansion work.
- [x] Baseline test output summarized below.
- [x] Initial meaningful-line report was zero against the recorded base commit.

Baseline notes:

```text
Command: npm run test:all
Exit code: 0

test:syntax: JavaScript syntax check passed (155 files).
test:secrets: Secret/artifact check passed (301 files).
npm test: all security-regression checks passed and all 155 node:test
subtests passed across security unit, game registry/economics, Dou Dizhu
engine/API/UI, Adventure engine/API, task cards, Quest V2, route manifest,
admin records, and application lifecycle suites (0 failures).

No real Bilibili provider send was executed.
```

Initial pre-ADR line report:

```text
Base commit: 023d90d708a19ecbbb755c30fd098da99f379bf8
Credited additions: 0
Meaningful deletions: 0
Credited net growth: 0
Backend + frontend + content: 0
All credited categories: 0
Overall threshold result: FAIL (expected before expansion implementation)
```

## Architecture decisions

- [x] Currency and reward separation ADR: `adrs/0001-currency-and-reward-separation.md`.
- [x] Trusted quest event ADR: `adrs/0002-trusted-quest-events.md`.
- [x] Quest evidence and retention ADR: `adrs/0003-quest-evidence-and-retention.md`.
- [x] Story graph and content-version ADR: `adrs/0004-story-graph-and-content-versioning.md`.
- [x] Live interaction protocol ADR: `adrs/0005-live-interaction-protocol.md`.
- [x] Existing gift-state-machine bridge ADR: `adrs/0006-existing-gift-state-machine-bridge.md`.

## Delivery phases

### Phase 0 — Baseline and architecture

- [x] Complete.
- Migrations: None.
- Tests: `npm run test:all` passed with exit code 0; initial line report confirmed zero credited expansion before ADR creation.
- Credited added lines: 158 after the six ADRs; the required initial pre-ADR report was 0.
- Risks or decisions: The repository audit snapshot is older than the live base and the live tree already includes a prior Quest V2 pilot. Streamer World phase numbering is independent of that earlier quest rollout. Phase 1 must inspect current modules before production edits. All provider sends remain disabled.

### Phase 1 — Creator foundation

- [x] Complete.
- Features: Versioned creator profile; normalized task/game/evidence/communication preferences; hard `all_messages` mute; consent history; IANA timezone; independent quiet hours and preferred interaction windows; configurable owner identity; non-monetary relationship XP/levels; immutable deduplicated relationship events; private/pinnable/archivable/hideable shared memories; persistent expiring inbox with read/archive state; owner-scoped JSON export; room-binding request/cancel state reconciled only by the existing safe administrator binding transaction; bilingual creator home/profile pages; default-off Creator Director read view.
- Migrations: `migrations/add_creator_foundation.sql` adds ten bounded creator tables, active-request uniqueness, append-only consent/relationship triggers, immutable memory provenance and inbox content triggers, and no financial/provider table mutation. It is the final tracked migration in `lib/database-migrations.js`.
- Routes: Creator pages at `GET /creator` and `GET /creator/profile`; state/export reads at `GET /api/creator/state` and `GET /api/creator/export`; nine fixed-path idempotent mutations for profile, preferences, quiet hours, preferred windows, room request/cancel, memory state, and inbox read/archive; safe read-only `GET /admin/creator-director`. IDs for writes are carried in bounded JSON bodies so the existing exact-path idempotency middleware protects every declared mutation.
- Tests: 26 Creator Foundation subtests cover validation, default-off/strict flag parsing, semantic relationship dedupe, concurrent stale profile writes, same-source relationship concurrency, transaction rollback at consent/relationship/idempotency failure points, room-binding non-bypass/reconciliation, fixed route policy chains, migration immutability, export privacy, bilingual escaped UI, mobile controls, and read-only administration. `npm run test:all` passed with 181 Node test subtests plus all security-regression assertions. `npm run release:stage` passed and included repositories/services. `git diff --check` passed.
- Credited added lines: 3,141 before this progress update (backend 1,509; frontend 848; tests 612; Phase 0 docs 158; other/tooling 14). Exact current totals are recorded below.
- Risks or decisions: All seven Streamer World feature switches remain off by default and Creator Foundation requires both `STREAMER_WORLD_ENABLED=true` and `CREATOR_PROFILE_ENABLED=true`. The disposable PostgreSQL migration suite was not run because it requires explicit database-create authorization; no production database was touched. Inbox Socket.IO push/replay, live invitations, presence, and Director mutations remain explicitly deferred to Phase 4. No real gift send occurred; no creator module imports the provider, balance logger, gift exchange, or wish inventory code.

### Phase 2 — Quest Engine V2

- [x] Complete.
- Features: Immutable/versioned quest definitions; closed and bounded rule AST; explicit per-event `eq`/`gte`/`lte` filters; occurrence-based repeatability with one-active-cycle uniqueness and cooldown; offer/accept/neutral-decline/postpone/submit/review/expiry-ready assignment lifecycle; parallel/dependency step schema; registered trusted-event ingestion bridged from the existing Adventure, Quiz, and Dou Dizhu settlement hooks; canonical semantic replay and source-collision rejection; bounded text/checklist/normalized-PNG evidence; row-locked per-user evidence quotas; retention tombstones preserving canonical hashes and audits; transactional manual review and automatic settlement using the compatible `quest_auto_reward` ledger operation; non-financial unlock-hook definitions; persistent assignment events and audits; legacy task-card read/import with zero duplicate reward; startup catalog seeding; weekly rotation schedules; creator journal; and administrator draft/review studio. Browser claims never settle a reward and no quest module calls a gift provider.
- Content counts: 60 distinct original bilingual quest definitions across nine safe categories; 10 three-step bilingual chains; 12 bilingual weekly boards with eight curated slots each; 12 persisted weekly rotation schedules. The `quiz-steady-eight` rule requires one server event with `correct >= 8`; multiple lower-scoring rounds cannot be summed into a qualifying round.
- Migrations: `migrations/add_streamer_quest_engine_v2.sql` is the sole new append-only migration after the two already-published pilot migrations. It adds definitions/versions/steps, boards/slots, chains/nodes, schedules, occurrence assignments/step projections, trusted and assignment events, evidence/reviews, reward settlements, audit, and legacy import mapping. Published versions and catalog membership are frozen, lifecycle transitions are one-way, evidence permits only expired content/media redaction, and settlements/events remain append-only or one-way. No historical migration was edited and no production database was touched.
- Routes: Creator journal at `GET /quests` and private JSON at `GET /api/quests/v2/journal`; seven fixed-path, CSRF/rate-limit/idempotency protected creator mutations for claim, accept, decline, postpone, evidence, submit, and legacy import; administrator studio at `GET /admin/quest-studio`; three fixed-path audited/idempotent admin mutations for draft, publish, and review. All are default-off behind `STREAMER_WORLD_ENABLED=true`, `CREATOR_PROFILE_ENABLED=true`, and `QUEST_ENGINE_V2_ENABLED=true`.
- Tests: 23 new focused subtests cover authored content counts/uniqueness, threshold semantics, closed AST and registered events, evidence/PNG bounds, neutral transitions, strict flags, exact-path route policy, migration immutability, retention tombstones, evidence and reward rollback, 7/30/90-day retention mapping, completed-state privacy, quota concurrency, canonical event replay/collision, concurrent stale assignment commands, atomic review settlement, legacy zero-reward compatibility, startup/read-only behavior, current-week scheduling, response-loss key reuse, feature-off registrar behavior, bilingual/mobile/Studio UI, and gift-provider isolation. `npm run test:all` passed (all legacy and expansion suites); `npm run release:stage` passed with the new `content` layer; EJS compilation and `git diff --check` passed.
- Credited added lines: 6,209 cumulative after Phase 2 (backend 3,936; frontend 962; authored content 148; tests 991; docs 158; tooling 2; other 12), with nine meaningful deletions and 6,200 net growth. Backend + frontend + content is 5,046.
- Risks or decisions: The disposable PostgreSQL migration suite was not run because it requires explicit database-create authorization; SQL contracts are covered by focused static/behavior tests, but the new migration still needs an operator-authorized disposable PostgreSQL run before production. The new feature flags remain off by default. Catalog initialization is a readiness-blocking lifecycle component only when all three gates are enabled. Evidence cleanup is a bounded lifecycle job and keeps hashes/review/settlement/audit tombstones. Existing task-card, pilot Quest V2, balance, gift inventory/outbox, worker, and provider-send semantics remain unchanged. No real gift send occurred.

### Phase 3 — Story engine and Season One

- [x] Complete.
- Features: Separate immutable `/story` campaign engine preserving all legacy `/adventure` behavior; closed/bounded condition and effect ASTs; pure deterministic transitions; version-bound runs and content snapshots; owner-bound locks and revision CAS; canonical command replay/collision rejection; persistent flags, four relationship axes, per-character relationships, clues, inventory, routes, messages, checkpoints, shared memories, first clears, safe unlock intents, event/audit history, and relationship XP; value-free replay; choice-only reversible preview; atomic checkpoint recovery; server-clock timed waits; puzzle/gate/game/achievement/owner/message/memory/checkpoint/conclusion nodes; hidden-state public projections; communication-mute and quiet-hour-safe owner interventions; same-transaction registered Quest V2 events for first choice/episode identities; startup hash-verified catalog seed; read-only administrator audit; bilingual responsive creator UI with preview/confirm/back and disconnect recovery. Story code never awards balance, creates gift inventory, or calls a gift provider.
- Story counts: One complete 12-episode Season One; 274 reachable compiled nodes across all 15 ADR node kinds; 60 choice nodes with 120 persistent options and distinct authored branches; 1,032 unique localized prose entries (516 bilingual beats); 12 recurring characters, each speaking in multiple episodes; five independently reachable conclusions; 12 shared memories; 12 persistent story letters plus six consent-aware owner notes; eight owner-intervention nodes. A bounded deterministic engine test completes all 12 episodes and the season within 500 transitions.
- Migrations: `migrations/add_story_world_season_one.sql` is the sole append-only Phase 3 migration. It adds immutable campaigns/content snapshots, version-bound run snapshots, immutable semantic command events, normalized state projections, first clears, memories, safe unlock intents, and audit history. Catalog lifecycle is one-way and published content/timestamps are frozen; event/memory/first-clear/audit records are append-only. Projection rows are atomically reconciled on checkpoint recovery. No historical migration was edited and no production database was touched.
- Routes: Creator page `GET /story` and private state `GET /api/story/state`; fixed mutations `POST /api/story/runs/start`, `POST /api/story/actions/commit`, and `POST /api/story/runs/recover` use login, authorization, bounded rate limits, CSRF, and exact-path idempotency. `POST /api/story/actions/preview` is CSRF/rate protected but deliberately non-idempotent and performs no write. `GET /admin/story-audit` is read-only. Everything is default-off behind `STREAMER_WORLD_ENABLED=true`, `CREATOR_PROFILE_ENABLED=true`, and `STORY_WORLD_ENABLED=true`.
- Tests: 42 focused Story World subtests cover whole-graph counts/reachability/uniqueness, all node kinds, handwritten-content safeguards, character recurrence, closed ASTs, hidden projections and puzzle answers, all five endings, full-season completion, server-clock wait, CAS/concurrency, semantic replay/collision, transaction rollback at idempotency/first-clear/relationship/Quest boundaries, first-clear dedupe, preview immutability, checkpoint projection reconcile and monotonic records, old content-version resumption, catalog collision failure, strict inputs/feature flags/route policy, quiet/mute consent, fixed-path feature-off behavior, browser preview-confirm/back and completed replay UX, mobile/bilingual safety, and provider isolation. `npm run test:all` passed with all legacy and expansion suites; `npm run release:stage`, focused EJS compilation, and `git diff --check` passed.
- Credited added lines: 8,160 cumulative after Phase 3 (backend 5,210; frontend 1,025; authored content 419; tests 1,334; docs 158; tooling 2; other 12), with nine meaningful deletions and 8,151 net growth. Backend + frontend + content is 6,654.
- Risks or decisions: The disposable PostgreSQL migration suite was not run because it requires explicit database-create authorization; the new SQL is covered by static and repository/service behavior contracts but still needs an operator-authorized disposable PostgreSQL execution before production. Season One intentionally stores unavailable game/achievement/reward-catalog integrations as non-monetary unlock intents only. Owner notes are persisted without live push, deferred during quiet hours, and suppressed by `all_messages`/`owner_notes` blocks; live delivery belongs to Phase 4. Replay and checkpoint recovery cannot duplicate Quest progress, relationship XP, first-clear state, memories, or unlock intents. All feature gates remain off by default. No real gift send occurred.

### Phase 4 — Live interaction platform

- [x] Complete.
- Features: The Creator Director now opens consent-bound owner/creator relay rooms and sends only 24 allowlisted bilingual templates across nudge, clue, celebration, story letter, quest invitation, poll, game invitation, and pre-authored story intervention types. Creator controls cover availability, mute, accept/decline/vote, leave, report, and explicit post-moderation reconsent; declines, mute, leave, and reports never reduce relationship XP. Quiet hours and preferred windows suppress presence/realtime fanout while keeping the bounded persistent inbox readable. Quest/game invitations expose only server-resolved internal action paths and never auto-claim or submit. The Director preserves all Phase 1 relationship, Bilibili room/request, milestone, and pagination fields; non-owner administrators receive only the existing safe Phase 1 summary.
- Protocol version: `1`. Every durable event has a UUID event ID, per-room monotonic sequence, state revision, bounded allowlisted type/payload, and a complete envelope capped at 6,000 bytes beneath the existing PostgreSQL bus limit. Socket commands revalidate the exact active session before service access, apply a 30-command/10-second bound, and support member-scoped subscribe/catch-up, monotonic ack, dedupe, reconnect replay, and cross-instance delivery through the existing `PostgresEventBus`. The browser treats the REST snapshot high-water sequence as authoritative and performs single-flight gap recovery without duplicate rendering.
- Migrations: `migrations/add_live_interaction_platform.sql` adds rooms, members, immutable structured items, ordered events, semantic command responses, one-way moderation reports, and append-only audit history. Reported pairs remain blocked through moderation until the reporting creator explicitly reconsents. Published migration history was not edited, and no financial, gift inventory, outbox, provider receipt, or balance tables are referenced.
- Routes/events: Creator UI `GET /live-room`; state/replay reads `GET /api/live/state` and `GET /api/live/events`; fixed mutations for accept, decline, poll vote, presence, mute, leave, report, reconsent, and ack. Exact configured-owner-only Director mutations open rooms, send structured interactions, and moderate reports. Events cover room open, all eight structured item types, item responses/expiry, availability/mute/leave, report resolution, and reconsent. All mutations commit event, command response, audit, and business state together before optional Socket.IO/PG-bus fanout.
- Tests: 30 focused Phase 4 subtests cover strict flags; template uniqueness and real references; protocol/payload limits; state machines; SQL immutability and moderation lifecycle; semantic replay/collision; exact owner enforcement; privacy; quiet/mute presence; safe action paths; version-bound story targets; rollback and post-commit fanout failure; Promise concurrency and lock ordering; ack/catch-up/left-history contracts; expiry first-response/replay consistency; report→moderate→reconsent recovery; envelope limits; revoked Socket.IO sessions; flood bounds; cross-instance delivery; browser replay ordering; fixed route policy; feature-off behavior; Phase 1 Director compatibility; and provider isolation. The suite is included in `npm test`. `npm run test:all`, `npm run release:stage`, focused EJS compilation, and `git diff --check` all passed.
- Credited added lines: 12,905 cumulative (backend 7,806; frontend 1,527; authored content 550; tests 2,850; docs 158; tooling 2; other 12), with nine meaningful deletions and 12,896 net growth. Backend + frontend + content is 9,883. Exact current totals are recorded below.
- Risks or decisions: All live behavior remains default-off behind `STREAMER_WORLD_ENABLED=true`, `CREATOR_PROFILE_ENABLED=true`, and `LIVE_INTERACTIONS_ENABLED=true`; Quest and Story references additionally require their own feature gates. Durable REST state/catch-up is authoritative, so bus delivery failure cannot lose an interaction. Expired invitations transition once to a durable terminal event and return a replayable HTTP 200 state response. Live production modules import neither `BalanceLogger` nor any gift/provider sender. The disposable PostgreSQL migration suite was not run because it requires explicit database-create authorization; the migration still needs an operator-authorized disposable PostgreSQL execution before production. No production database or real gift send was touched.

### Phase 5 — New games batch one

- [x] Complete.
- Games: Five server-authoritative skill games are complete: Constellation Repair (asymmetric route repair with finite blockers and solo fallback), Signal Duet (server-clock visual rhythm windows and solo fallback), Mystery Board (authored evidence/contradiction graphs), Story Weaver (closed bilingual passage-card construction with asynchronous co-op turns), and Studio Crafting (material conservation, craft-then-place lifecycle, durable collection, and six persistent room slots). Every game has its own pure engine/configuration module, three difficulty contracts, revision-CAS persistence, immutable version snapshot, terminal scoring, reconnect projection, keyboard/touch UI, and bounded hidden-state projection. Creators can durably abandon an unfinished occurrence before starting another. Co-op game state remains in dedicated game tables; Phase 4 carries only bounded `interaction.game_state_changed` metadata, including a start event that lets the invited owner discover the run without receiving a UUID out of band.
- Level/content counts: 100 original bilingual challenges, exactly 20 per game. Constellation has 20 deterministic blocked grids; Signal has 20 strictly increasing visual patterns; Mystery has 20 individually authored four-evidence cases with varied suspect positions, valid/false links, and contradictions; Weaver has 20 story openings plus ten closed bilingual connective passage cards; Crafting has 20 recipes/collectibles. Nested recipes, evidence, patterns, and packs are recursively frozen.
- Migrations: `migrations/add_streamer_games_batch_one.sql` is the sole append-only Phase 5 migration. It explicitly and fail-closed upgrades the Phase 4 event-type CHECK, then adds immutable content snapshots, owner/creator runs, one-active-run uniqueness, persistent semantic start/action responses, ordered events, safe hook intents, collection/room projections, and audit history. Version retirement is one-way; commands/events/audits/collection provenance are immutable; hook intent content is frozen with a one-way processing lifecycle. No historical migration was edited.
- Routes: Five pages plus private state APIs and ten fixed start/action mutations. Every mutation is protected in manifest/runtime by capacity, login, current authorization, bounded basic/action rates, CSRF, and exact-path idempotency. The entire catalog, routes, startup seed, and lobby visibility remain default-off behind `STREAMER_WORLD_ENABLED=true`, `CREATOR_PROFILE_ENABLED=true`, and `STREAMER_NEW_GAMES_ENABLED=true`. Co-op additionally requires the configured active owner, creator live-interaction consent, and an active Phase 4 relay room.
- Tests: 34 focused Phase 5 subtests cover content uniqueness/deep freezing; all five pure engines; three difficulties; blocker/path and authoritative timing rules; mystery hidden solutions; story handoffs; crafting conservation/lifecycle; strict flags; registry/manifest parity; exact migration upgrade; trusted Quest event validation; semantic replay/collision; concurrent starts/actions; durable abandon/restart; deterministic users-before-run locks; participant deactivation rollback; idempotency-finalization and Quest-hook rollback; exactly-once hook/collection settlement; old-version snapshots/hash drift; malformed UUID API behavior; feature-off 404; owner history discovery; response-loss-safe start relay; bounded hidden live metadata; provider isolation; and real VM/DOM behavior for touch clicks, keyboard rhythm input, countdown, rule-disabled controls after success/network failure, terminal controls, and empty-page live-event authoritative refresh. `npm run test:all`, `npm run release:stage`, EJS compilation, syntax/secrets scans, and `git diff --check` passed.
- Credited added lines: 15,831 cumulative before this progress update (backend 9,263; frontend 1,859; authored content 830; tests 3,707; docs 158; tooling 2; other 12), with ten meaningful deletions and 15,821 net growth. Backend + frontend + content is 11,952.
- Risks or decisions: The disposable PostgreSQL migration suite was not run because it requires explicit database-create authorization; the migration is statically and behaviorally covered but still needs an operator-authorized disposable PostgreSQL run before deployment. Durable REST game state is authoritative; Socket.IO/PG-bus fanout failure cannot lose a move. Story and achievement integration remains as non-monetary immutable hook intents until those consumers exist; Quest V2 receives one registered server-trusted completion event in the game transaction. The game modules import no balance logger, gift inventory/outbox, provider receipt, or sender. No production database or real gift send was touched.

### Phase 6 — New games batch two

- [ ] Complete.
- Games:
- Level/content counts:
- Migrations:
- Routes:
- Tests:
- Credited added lines:
- Risks or decisions:

### Phase 7 — Rewards and gift bridge

- [ ] Complete.
- Features:
- Migrations:
- Routes:
- Provider-state tests:
- Credited added lines:
- Risks or decisions:

### Phase 8 — Full content expansion

- [ ] Complete.
- Story seasons/episodes/nodes/dialogue/choices/endings:
- Quest templates/chains/boards/events:
- Achievements and collections:
- Game levels/scenarios:
- Uniqueness validation:
- Credited added lines:
- Risks or decisions:

### Phase 9 — Hardening and release readiness

- [ ] Complete.
- Accessibility:
- Performance/load:
- Migrations:
- Security/failure injection:
- Feature-flag rollback:
- Documentation:
- Final line report:
- Remaining external operator actions:

## Current line report

The initial zero report above was captured before Phase 0 ADR creation. The latest report after Phase 5 is:

```text
Streamer World meaningful-line report
Base commit: 023d90d708a19ecbbb755c30fd098da99f379bf8

Credited additions by category:
  backend   +9,263 / -8
  frontend  +1,859 / -0
  content   +830 / -0
  tests     +3,707 / -0
  docs      +158 / -0
  tooling   +2 / -1
  other     +12 / -1

Credited additions: 15,831
Meaningful deletions: 10
Credited net growth: 15,821
Backend + frontend + content: 11,952

Acceptance gates:
  [FAIL] total meaningful additions: 15,831 / 50,000
  [FAIL] net growth: 15,821 / 40,000
  [FAIL] backend additions: 9,263 / 12,000
  [FAIL] frontend additions: 1,859 / 8,000
  [FAIL] authored-content additions: 830 / 16,000
  [FAIL] test additions: 3,707 / 10,000
  [FAIL] backend + frontend + content: 11,952 / 36,000

Overall: FAIL
```

The overall threshold failure remains expected after Phase 5; the second game batch, reward, hardening, frontend, test, and full-content phases supply the remaining volume.

## Current acceptance status

- [ ] 50,000 credited meaningful additions.
- [ ] 40,000 credited net growth.
- [ ] 12,000 backend additions.
- [ ] 8,000 frontend additions.
- [ ] 16,000 authored-content additions.
- [ ] 10,000 test additions.
- [ ] 36,000 backend + frontend + content additions.
- [ ] 10 distinct new games complete.
- [ ] 5 story seasons complete.
- [ ] 180 quest templates complete.
- [ ] 30 quest chains complete.
- [ ] 60 achievements complete.
- [x] Old tests pass at the Phase 0 baseline.
- [x] Real Bilibili sends remain disabled.
- [ ] Final report written.
