# Trusted reward source matrix

All rows enter `reward_grant_intents` in the transaction that accepts the trusted source fact. The dispatcher creates only an internal reward order and entitlement. It never calls the Bilibili/provider sender.

| Source | Accepted trusted fact | Production producer | Catalog item | Source identity | Transaction boundary | Verification |
|---|---|---|---|---|---|---|
| Quest | `quest.chain.completed` | `QuestV2Service.emitChainCompletedAchievement` | `quiet-orbit-frame` | hash of immutable Quest chain event identity | assignment/chain event + intent | `tests/achievement-producers-p1.test.js`, disposable PostgreSQL reward suite |
| Story | `story.season.completed` | `StoryWorldService.persistValue` | `dream-compass-key` | hash of immutable Story season event identity | story transition/event + intent | `tests/full-content-expansion.test.js`, disposable PostgreSQL reward suite |
| Game | `game.run.completed` for `studio-crafting` | `StreamerGameService.recordCompletionAchievements` | `starlight-studio-badge` | hash of immutable game completion identity | run completion/event + intent | `tests/achievement-producers-p1.test.js`, disposable PostgreSQL reward suite |
| Achievement | first unlock of `constellation-first-repair` | `AchievementService.recordTrustedEvent` | `paper-star-frame` | hash of trusted event identity plus achievement slug | achievement unlock/collection + intent | `tests/reward-security-p1.test.js`, disposable PostgreSQL visibility suite |
| Season/archive | first accepted `story.season.completed` archive | `AchievementService.recordTrustedEvent` | `memory-book-cover` | hash of immutable Story season event identity | season archive + intent | `tests/full-content-expansion.test.js`, disposable PostgreSQL reward suite |

## Dispatcher invariants

- `(source_type, source_event_id)` is unique and immutable.
- The semantic hash binds recipient, catalog slug, and bounded payload to that identity.
- Leases are bounded, recoverable, and claimed with `SKIP LOCKED`.
- Settlement uses the existing catalog eligibility, order, budget, audit, and entitlement boundaries in one transaction.
- Replays return the existing source order; semantic collisions fail closed.
- Terminal failures are retained as immutable dead letters for administrator inspection.
- No dispatcher path imports or invokes gift delivery/provider code.
