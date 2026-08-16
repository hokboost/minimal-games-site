# Minimal Games streamer-expansion repository audit

Audit date: 2026-08-17
Uploaded artifact: `minimal-games-site (3).zip`
Inspected commit: `950105d11a3d257af11a5313d531f478f9677449`
Commit subject: `test: prevent templated adventure content`

## Executive assessment

The repository is already a serious value-bearing application, not a toy collection of static games. Its strongest work is in transaction safety, idempotency, PostgreSQL constraints, Bilibili provider-state handling, and security regression tests. Its weakest area relative to the requested product is not technical settlement. The missing layer is a coherent long-term experience connecting streamer identity, quests, story consequences, owner participation, game progression, point earnings, and gift redemption.

The expansion should therefore reuse the existing financial and provider boundaries while building new creator, quest, narrative, live-interaction, and content systems beside them. Replacing the gift pipeline or adding rewards directly from browser claims would discard the safest part of the current architecture.

## Inspection performed

The audit covered:

- repository structure and Git state;
- `package.json`, application startup, route registration, lifecycle jobs, and route-policy metadata;
- all current game descriptors and major game-domain modules;
- task-card routes, migrations, templates, client code, and tests;
- adventure content, engine, persistence, routes, client code, and tests;
- gift shop, wish inventory, delivery outbox, worker routes, room binding, and provider-state protections;
- Socket.IO authentication, user socket tracking, notifications, danmaku, and PostgreSQL cross-instance events;
- profile, home, admin, game-catalog, and gift-shop UI;
- tracked migrations and table creation;
- architecture, economics, i18n, and audit-remediation documentation;
- the full current `npm run test:all` suite.

## Baseline verification

`npm run test:all` passed in the inspected tree. The command covered:

- JavaScript syntax checks;
- secret/artifact scanning;
- broad security regression assertions;
- core security units;
- game registry and economics;
- Dou Dizhu engine, API, and UI;
- adventure engine and API;
- task cards;
- route manifest;
- admin record providers;
- application lifecycle.

The expansion agent must treat this as a no-regression baseline.

## Repository size and concentration

The following counts exclude `.git`, `node_modules`, `build`, private artifacts, `__pycache__`, and `package-lock.json`.

| Area | Files | Lines | Nonblank lines |
| --- | ---: | ---: | ---: |
| Browser assets | 29 | 15,811 | 13,956 |
| Tests and security scripts | 51 | 14,386 | 12,967 |
| Routes | 9 | 12,089 | 11,388 |
| Root and other runtime files | 28 | 9,668 | 8,949 |
| EJS views | 31 | 7,042 | 6,196 |
| Game domain | 20 | 6,293 | 6,009 |
| Migrations | 31 | 5,913 | 4,735 |
| Bilibili workers | 6 | 3,870 | 3,383 |
| Data | 3 | 3,077 | 3,064 |
| Infrastructure libraries | 30 | 2,803 | 2,536 |
| Documentation | 10 | 695 | 555 |
| **Total** | **217** | **81,647** | **73,738** |

Largest files include:

| File | Lines |
| --- | ---: |
| `routes/games.js` | 3,197 |
| `public/redesign-games.css` | 3,120 |
| `server.js` | 2,989 |
| `routes/admin.js` | 2,926 |
| `migrations/000_base_schema.sql` | 2,888 |
| `data/questions.js` | 2,887 |
| `routes/gifts.js` | 2,674 |
| `public/redesign-account.css` | 2,214 |
| `tests/security-unit.test.js` | 1,805 |
| `windows-gift-listener.js` | 1,742 |
| `migrations/harden_money_and_workers.sql` | 1,705 |

### Consequence for the expansion

Adding another 50,000 lines directly to `server.js`, `routes/games.js`, `routes/admin.js`, or `routes/gifts.js` would make the site substantially harder to audit and change. New subsystems need their own domain, repository, service, route, view, client-controller, content, and test boundaries. Existing giant files should receive only thin registration or compatibility wiring.

## Runtime architecture

The architecture guide correctly describes the application as a modular monolith:

```text
server.js
  -> composition root, middleware, authentication, Socket.IO, compatibility helpers

app/application-lifecycle.js
  -> ordered start, reverse stop, recurring non-overlapping jobs

routes/*.js
  -> validation, middleware order, transaction orchestration

domain/games/*
  -> immutable configuration, pure engines, economics, public projections

lib/*
  -> idempotency, integer money, rate limits, audit, event bus, concurrency

PostgreSQL
  -> source of truth for value and persistent state

workers/bilibili/* plus local Python/Windows entry points
  -> provider-side execution boundary
```

This is the right macro-architecture for the next stage. The site does not need a microservice rewrite. It needs additional internal modules and narrower orchestration files.

## Current route and database scale

A static scan found 144 Express routes:

| Registration file | Route count |
| --- | ---: |
| `routes/games.js` | 38 |
| `routes/admin.js` | 36 |
| `routes/gifts.js` | 21 |
| `server.js` | 17 |
| `routes/tasks.js` | 9 |
| `routes/wish.js` | 8 |
| `routes/adventure.js` | 6 |
| `routes/doudizhu.js` | 5 |
| `routes/analytics.js` | 4 |

Tracked migrations create or recreate 62 named tables across historical and current schema paths. Important existing clusters include:

- users, sessions, login, IP, security, and password reset;
- balance logs, audit baselines, financial cutovers, and idempotency;
- result/state tables for existing games;
- wish progress, results, sessions, and inventory;
- gift exchanges, delivery events, delivery outbox, archive, worker heartbeats, and worker leases;
- PK commands, runner state, reports, and spend authorizations;
- adventure runs, completions, and events;
- Dou Dizhu games;
- task templates, card assignments, and event assignments;
- UX analytics.

The requested systems should add forward-only migrations. They should not overload one generic JSON table for every new behavior.

## Current game catalog

`domain/games/catalog.js` exposes twelve games:

| ID | Type | Value model | Current role |
| --- | --- | --- | --- |
| `quiz` | skill | points, daily cap | timed knowledge round |
| `dictation` | skill | admin-granted allowance | reviewed Chinese dictation |
| `slot` | chance | points | paid weighted reels |
| `scratch` | chance | points | paid scratch card |
| `wish` | chance | gift-value inventory | seven pity-backed gift pools |
| `blindbox` | chance | gift-value inventory | weighted gift boxes |
| `stone` | strategy | points | stateful optimal stopping |
| `flip` | strategy | points | stateful card stopping |
| `duel` | challenge | points | dynamic price/probability |
| `spin` | free | no settlement | random offline challenge |
| `doudizhu` | strategy | match score only | full persistent game against two bots |
| `adventure` | progression | first-clear points | 50-chapter puzzle campaign |

### What is missing

The catalog is broad but weighted toward solo paid/chance or solo puzzle experiences. There is no owner–streamer co-op game, no asynchronous collaborative game, no persistent crafting/collection game, no mystery board, no deterministic daily roguelite, and no live session with reconnect/replay.

The expansion should add skill, co-op, narrative, collection, and deterministic progression games. It should not add ten more slot-like wrappers.

## Current task-card implementation

The task feature is concentrated in:

- `routes/tasks.js`;
- `migrations/add_task_cards_account_locks_and_earnings.sql`;
- `views/tasks.ejs`;
- `public/js/task-cards.js`;
- task sections on `views/index.ejs`;
- admin controls in `views/admin.ejs` and `public/js/admin.js`;
- `tests/task-cards.test.js`.

### Current state model

Task cards use:

```text
offered -> claimed -> pending_approval -> approved
                    |                    -> returned to claimed
                    -> abandoned
                    -> expired
```

A user can have only one card in `claimed` or `pending_approval`. A claimed card has a seven-day deadline. The user can use one “almost” extension of three days. Admin approval posts points through `BalanceLogger` in the same transaction as the terminal task state and idempotency result.

Event tasks are manually created for one user with title, description, reward, and deadline. They have a smaller active/pending/approved/expired state machine.

### Seeded content

Only five task templates are seeded. They are highly personalized song tasks, including four performance/learning tasks and one offline duet. Rewards range from 2,000 to 30,000 points.

### Strengths

- constrained statuses;
- one-active-card partial index;
- explicit expiry timestamps;
- admin review;
- transactionally coupled point rewards;
- route middleware and idempotency tests;
- localized UI.

### Gaps

- rollout is limited by `TASK_CARDS_ENABLED_USERS`, defaulting to one account;
- no creator profile or task preferences;
- no task category consent or blocked categories;
- no evidence table or bounded upload pipeline;
- completion is self-declared before manual review;
- no trusted game/story/live event progress;
- no multi-step, AND/OR, threshold, sequence, or chain rules;
- no recurring schedules, cooldowns, streaks, daily boards, or seasons;
- no user task history or appeal trail in the product UI;
- no reusable admin template authoring;
- no automatic personalization;
- no owner follow-up message tied to the task;
- no achievement, collection, story, or game unlock reward;
- no explicit reward budgets beyond the generic integer bounds.

The existing task tables should be preserved for historical records. Quest Engine V2 should add a compatibility view/import rather than rewriting old terminal rows.

## Current adventure implementation

The adventure feature uses a sound separation:

- `domain/games/adventure/content.js` for versioned content and compilation;
- `domain/games/adventure/handcrafted-expeditions.js` for chapters 9–50;
- `domain/games/adventure/engine.js` for pure transitions and public projection;
- `routes/adventure.js` for persistence and one-time settlement;
- `adventure_runs`, `adventure_completions`, and `adventure_events` for state;
- tests for engine behavior, hidden answers, route security, replay safety, and UI CSP.

### Measured content shape

The campaign has:

- 50 chapters;
- 607 stages;
- 101 narrative stages;
- 62 quiz stages;
- 53 cipher stages;
- 52 memory stages;
- 50 choice stages;
- 48 resource-choice stages;
- 53 boss stages;
- 47 each of multi-select, ordering, matching, and path stages;
- 196 total choices.

The current narrative stage text totals roughly 4,314 characters, averaging about 43 characters per narrative stage.

Choice effects across the entire campaign are limited to:

- `insight` on every choice;
- `energy` on 70 choices;
- an inventory item on 8 choices.

Forty-seven choices require energy. No content choice sets a persistent flag. No later stage checks a prior flag or inventory item. Choices therefore alter resources but do not create meaningful long-term routes.

### Structural limitation

Chapters 9–50 are authored as unique specifications, but the compiler maps each into the same twelve-stage shape:

```text
arrival narrative
quiz
multi-select
ordering
matching
cipher
memory
path
choice
resource choice
boss
final narrative
```

The existing campaign is a good puzzle progression system. It is not yet a branching relationship-driven narrative. It should remain available while a separate graph-based story engine is built.

## Current gift and Bilibili flow

This is the most safety-critical and most reusable area.

### Direct gift shop

`routes/gifts.js` uses a strict allowlist for direct redemption:

- `heartbox`;
- `fanlight`;
- `tiedu_one`.

The server calculates cost from `gift-codes.json`. It rejects client price mismatches, locks the user and global exposure boundary, checks room binding, uses idempotency, debits through the ledger, and creates durable work.

### Wish and blind-box rewards

Wish and blind-box successes create `wish_inventory` rows. A stored inventory item can be enqueued for delivery. Delivery remains separate from the random game transaction.

### Provider safety

The repository has explicit states for claimed, sending, uncertain, completed, failed-before-send, and reconciliation. It uses:

- worker authentication and leases;
- provider locks;
- claim tokens and generations;
- durable delivery events and outbox;
- provider receipts;
- no automatic refund or resend after an ambiguous provider boundary;
- room-change and deactivation transitions that refund only work proven not to have started;
- daily user and global exposure limits;
- external-send kill switches defaulting to false.

### Required expansion rule

Quest, story, season, achievement, and owner-grant rewards must bridge into this system. They must not introduce a second gift queue or call a Python sender from a quest route.

## Current Bilibili room identity

`users` stores `bilibili_room_id` and binding time. Room IDs are unique when active. Current binding is an administrator action. Room changes serialize against gift and PK work and preserve unresolved external effects.

The new creator profile can expose binding requests and verification status. It must not let a browser claim ownership of an arbitrary room and immediately receive gifts.

## Current real-time system

`server.js` authenticates Socket.IO using the PostgreSQL session store and active-session records. It associates socket IDs with a verified username. It emits:

- recent global danmaku;
- new global danmaku;
- per-user notifications;
- per-user security alerts;
- forced disconnect events.

A PostgreSQL event bus carries these events between application instances. Connected sockets are periodically revalidated.

### Gaps for owner interaction

- no creator presence consent or quiet-hour model;
- no typed owner–streamer interaction rooms;
- no persistent event log for normal interaction;
- no sequence/ack/replay protocol;
- no invitation/accept/decline state;
- no co-op state revisions;
- no reconnect catch-up beyond recent global danmaku;
- no owner director console;
- no streamer mute or availability controls;
- no durable inbox.

The expansion should extend the authenticated boundary and PostgreSQL bus rather than adding a second unauthenticated WebSocket server.

## Current profile and home experience

The profile page primarily displays:

- username;
- authorization state;
- balance;
- lifetime net earnings;
- registry-driven game statistics and record tables;
- gift backpack;
- account settings.

The home page embeds task cards, event tasks, a gift-backpack preview, account access, game access, and gift-shop access.

There is no streamer identity page, relationship timeline, quest journal, season progress, achievement showcase, collection room, story route map, owner inbox, or live availability control.

## Current admin experience

The admin area can:

- authorize users;
- credit or set balances;
- manage passwords and sessions;
- lock/deactivate accounts;
- bind and unbind rooms;
- review dictation;
- assign task-card offers and event tasks;
- approve or return task submissions;
- inspect records and provider reconciliation state.

This is an operational console. It is not yet a product-facing owner director console. The expansion should keep high-risk administration separate from playful interaction controls while using the same authorization and audit standards.

## Internationalization and frontend constraints

The site supports Chinese and English through EJS locals, `i18n.js`, a language cookie, and browser helpers. CSP is intentionally restrictive. User-controlled content must remain escaped or enter the DOM with `textContent`.

New content and UI must:

- provide natural Chinese and English;
- avoid inline scripts and unsafe HTML sinks;
- remain mobile responsive;
- support keyboard interaction;
- preserve no-inline-style CSP assumptions where current tests enforce them;
- avoid a framework rewrite.

## Economic and security invariants to preserve

The current architecture and tests establish these non-negotiable rules:

1. Integer money only for new value records.
2. Balance, ledger, business state, and idempotency response commit together.
3. Paid actions use rate limits and capacity guards.
4. Chance-game economics are startup-gated to the closed 98%–99% policy interval where applicable.
5. Browser input is never authoritative for cost, reward, result, hidden state, or provider confirmation.
6. Started or ambiguous external delivery is not auto-refunded or retried.
7. Admin writes have CSRF, authorization, idempotency where applicable, and success/failure audit.
8. Worker writes have credential binding, replay protection, and leases.
9. Socket sessions are authenticated and revalidated.
10. New persistent game state needs immutable configuration/content versioning.
11. Secrets and ignored artifacts remain outside release output.
12. Long-running jobs belong to `ApplicationLifecycle`.

## Recommended reuse map

| Desired capability | Reuse | Add |
| --- | --- | --- |
| Quest points | `BalanceLogger`, idempotency, account locks | unique quest settlement and budget policy |
| Gift redemption | `gift_exchanges`, `wish_inventory`, outbox, workers | reward-catalog bridge and source metadata |
| Story progress | adventure pure-engine and CAS patterns | graph engine, flags, relationships, endings |
| New games | game registry, descriptors, pure engines, record providers | ten distinct game domains and UIs |
| Live interaction | authenticated Socket.IO, user map, PostgreSQL event bus | rooms, persistent events, replay, director console |
| Evidence | dictation PNG normalizer and upload constraints | quest evidence model and review lifecycle |
| Admin writes | current admin guards and audit | typed owner-director services and routes |
| Background jobs | `ApplicationLifecycle` | quest schedules, expiry, event evaluation, retention |
| Localization | EJS/i18n conventions | bilingual content schema and validators |
| Feature rollout | current environment validation patterns | subsystem flags and staged allowlists |

## Highest risks in the expansion

### Reward duplication

Quest event ingestion, manual review, story completion, and live co-op events can all race. Every value reward needs a unique settlement key and one transaction.

### Hidden-state leakage

Branch conditions, future story nodes, co-op private clues, seeded maze state, and game answers must never enter the public projection.

### Real-time replay bugs

Reconnects and duplicate Socket.IO messages can repeat actions. Every state-changing command needs event IDs, expected revisions, and idempotent handling.

### Content padding

A 50,000-line target can incentivize repetitive JSON and thin game clones. The agent package therefore imposes category minimums, uniqueness tests, production thresholds, and net-growth requirements.

### Consent erosion

Personalized tasks and owner interaction can become coercive when tied to gift value. Declining must be consequence-free, sensitive categories must be blocked, and relationship progression must be independent of spending or compliance.

### Provider boundary regression

A seemingly convenient “send gift now” button can bypass outbox guarantees. Every gift source must use the existing durable path.

### Giant-file growth

The current route and server files are already large. New work needs modular boundaries and explicit dependency injection.

## Final recommendation

Build the expansion in this order:

1. creator profile, consent, relationship events, memory, and inbox;
2. trusted event envelope and Quest Engine V2;
3. graph story engine with one complete season;
4. persistent owner–streamer live protocol and director console;
5. five new games;
6. five more new games;
7. reward catalog and existing-gift bridge;
8. remaining story, quest, level, achievement, and season content;
9. full security, migration, accessibility, load, provider-uncertainty, and line-contract verification.

This sequence creates the interaction foundation before flooding the repository with content. It also produces usable checkpoints while preserving the current site's value-bearing safety.
