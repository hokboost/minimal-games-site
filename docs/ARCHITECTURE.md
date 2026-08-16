# Architecture and extension guide

This repository is a modular monolith. PostgreSQL remains the source of truth
for balances, ledgers, idempotency, game state, gift/PK state machines, and
audits. The refactor deliberately does not split those transaction boundaries
across services.

## Runtime boundaries

```text
server.js                         composition root and compatibility entrypoint
app/application-lifecycle.js      startup, recurring jobs, reverse-order stop
routes/manifest.js                mutation-route metadata and policy validation
domain/games/
  configuration.js               immutable private game parameters
  registry.js                    definition lookup and startup economics gate
  catalog.js                     catalog/page/action metadata
  economics.js                   pure RTP and strategy solvers
  random.js                      integer-weight draws and unbiased rounding
  blindbox.js                    gift-value-backed runtime adapter
  records.js                     profile/history/admin read adapters and DTOs
  presentation.js                compatibility export of provider-owned view metadata
  doudizhu/                      pure cards, combinations, state machine and bounded AI
routes/*.js                       HTTP validation and transaction orchestration
lib/*.js                          infrastructure and cross-cutting controls
workers/bilibili/                 provider-side execution boundary
```

Dependencies point inward: routes may use game-domain modules, while game
domain modules do not import Express, the database pool, templates, or worker
code. `server.js` selects dependencies once and passes them into route
registrars. New code must not use a runtime service locator.

## RTP policy

Redeemable chance games use this closed policy interval:

```text
target minimum: 98.0%
planning target: 98.5%
hard maximum:    99.0%
```

The exact values live in `domain/games/economics.js`. Static configuration is
validated while the game registry loads, so an invalid deployment fails before
the HTTP server becomes ready.

- Weighted games check exact integer-weight expected value.
- Wish checks the exact truncated-geometric expectation including pity.
- Flip separately checks the profit-maximizing policy and all 64 stop/continue
  policies. Maximizing expected profit is not the same as maximizing RTP.
- Stone separately solves the profit-maximizing policy and the maximum-ratio
  policy with policy iteration and Dinkelbach iteration.
- Duel checks every accepted prize/power combination. Combinations for which
  integer pricing cannot satisfy the interval are rejected.
- Quiz is classified as a daily-capped skill reward, not misrepresented as a
  fixed-probability RTP game.
- Dou Dizhu is a free competitive-skill game. It uses match scoring only and is
  deliberately outside the redeemable-value RTP policy.
- Star Map Adventure is a progression-reward game rather than an RTP game. Its
  content is immutable and versioned, each user/chapter/version receives at
  most one first-clear reward, and the completion row, balance ledger entry,
  public response, and run transition share one transaction.

Do not add a second copy of costs, probabilities, multipliers, or gift weights
to a route, browser script, EJS template, preview script, or test. Browser code
receives only a sanitized public projection. Only deliberately disclosed display
rates enter that projection; raw `successRate`/`weightUnits` and provider gift
identifiers stay server-side.

## Adding a game

1. Add the immutable private parameters to `configuration.js`.
2. Add pure economics/engine code with injected randomness. The preferred
   engine shape is `(config, input, state, rng) -> { cost, payout, outcome,
   nextState, audit }`.
3. Add one descriptor to `catalog.js`, including per-action `method`, `path`,
   and `policies`, plus `assetKind`, `economicsKind`, and (when applicable)
   `recordView`. `actionPaths` is a derived compatibility projection; do not
   maintain a second list manually.
4. Extend the registry economics gate. Test both the intended player strategy
   and adversarial strategies for stateful games.
5. Add a cohesive route/service/repository adapter. Keep SQL and transaction
   ownership outside the registry; the registry is metadata, not a god object.
6. If the game has history, add a standard record provider and view metadata.
   The catalog, profile cards, record endpoint, and route-policy manifest then
   discover it through the descriptor instead of adding another switch. The
   provider emits localized cell DTOs for both profile and admin renderers; do
   not add per-game formatting branches to browser JavaScript or EJS.
7. Render public configuration from the server. Client JavaScript should own
   interaction and animation only, never authoritative pricing or settlement.
8. Add registry/economics, transaction, idempotency, UI projection, and
   failure-injection tests. Run the commands in the verification section below.

`routes/manifest.js` is currently policy metadata. It derives the central
idempotent-write and admin-failure-audit lists and validates duplicate routes,
unknown policies, and missing CSRF/worker authentication at startup. Route
handlers remain explicit Express registrations so middleware order is visible.

The Dou Dizhu implementation is the reference shape for a persistent free
strategy game: `domain/games/doudizhu/` has no Express or database dependency,
`routes/doudizhu.js` owns projection and compare-and-swap persistence, and the
browser submits only a game ID, expected revision, action type, bid, or owned
card IDs. Private hands and random state never enter the public projection.

The Adventure implementation follows the same boundary with content separated
from mechanics: `domain/games/adventure/content.js` defines versioned chapters,
`engine.js` owns pure state transitions and projection, and
`routes/adventure.js` owns authenticated persistence. Quiz answers, cipher
codes, choice effects, rewards, hearts, and progress submitted by a browser are
never trusted. A run uses an owner-bound revision compare-and-swap; the partial
unique index permits one active run per user, while completion uniqueness makes
first-clear settlement replay-safe.

The campaign contains 50 contiguous, independently handcrafted chapters.
Chapters 9–50 live in `handcrafted-expeditions.js`; every entry explicitly owns
its premise, character, evidence trail, puzzle data, dilemma, boss, and finale.
`content.js` compiles that authored data into the engine's stable stage schema,
but does not synthesize plots or answers from chapter numbers. Stable chapter
and stage IDs preserve existing progress while validation rejects duplicate
summaries, openings, finales, or incomplete chapter structures. The browser
paginates all 607 stages into five acts, while the server independently enforces
every prerequisite.

## Transaction rules

For any value-bearing action, preserve this boundary:

```text
BEGIN -> account/state lock -> idempotency -> debit -> outcome/state update
      -> credit/inventory -> domain log -> durable response -> COMMIT
```

Do not move a debit, credit, game record, inventory row, or completed
idempotency response outside that transaction. Provider delivery is different:
the transaction creates a durable outbox/task, and a worker later advances its
explicit state machine. A timeout after provider execution starts remains
`uncertain`; it is never silently resent or refunded.

The next safe extraction is a small paid-round transaction service plus one
repository per game. Stateful Wish, Flip, and Stone should share transaction
scaffolding, not be forced into a universal state engine. Gift and PK flows
should be extracted only after behavior-contract and crash-boundary tests cover
their current state machines.

## Configuration versioning

New persistent game work should store an immutable `configVersion` or config
hash on every round. Long-running Wish, Flip, and Stone state must pin the
snapshot selected when the round starts so a deployment cannot mix old state
with new costs or rewards. A future `game_rounds` financial-envelope table can
standardize game ID, variant, config version, stake, payout, asset type,
outcome, idempotency key, and result trace while retaining the existing domain
tables through `round_id`.

This is intentionally documented as the next schema migration rather than
being emulated with an in-memory version: persistent state needs a real database
contract and a backwards-compatible migration.

## Lifecycle and shutdown

Long-running resources and recurring work belong to
`ApplicationLifecycle`. Components start in registration order and stop in
reverse order; recurring jobs do not overlap, and shutdown waits for an
in-flight run. Module imports must not create timers or begin external work.

Startup order is configuration, pool/schema check, event/resource startup,
HTTP listen/jobs, then readiness. A failed start rolls back already-started
resources. Stop is idempotent and must release timers, sockets/event buses,
HTTP, and the pool.

Request-scoped retries and bounded worker subprocess timeouts are not recurring
application jobs and should remain local to their request/task.

## Migration plan

The current refactor intentionally follows small compatibility-preserving
steps:

1. Central game configuration and exact economics gates.
2. Catalog, public projections, profile/history adapters, and route metadata.
3. Explicit lifecycle ownership for hidden timers and shutdown.
4. Behavior-contract tests replacing brittle source-location assertions.
5. Extract one game at a time into engine/service/repository modules.
6. Add versioned round envelopes/read models, then consider a durable broker,
   object storage, and Redis/Valkey for non-financial ephemeral state.

Financial PostgreSQL records remain authoritative throughout. Scaling work must
not weaken integer-money checks, append-only logs, idempotency, worker leases,
or external-delivery uncertainty semantics.

## Verification

```bash
npm run test:all
npm run release:stage
ALLOW_DATABASE_CREATE_TEST=true npm run test:migrations
npm run test:resilience
npm run test:e2e
npm run test:load
```

The database, browser, load, and provider-boundary suites need their documented
external services and must also run in CI or a deployment-like environment.
