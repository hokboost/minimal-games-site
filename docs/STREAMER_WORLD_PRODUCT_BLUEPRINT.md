# Streamer World product and implementation blueprint

Blueprint date: 2026-08-17
Target repository: `minimal-games-site (3).zip`
Inspected base commit: `950105d11a3d257af11a5313d531f478f9677449`

## 1. Product thesis

The next version should not feel like a lobby containing unrelated games, a task list, and a gift shop. It should feel like one persistent world where a streamer can build a profile, choose boundaries, receive quests, play alone or with the owner, make story decisions, earn transparent rewards, remember shared moments, and optionally redeem eligible points through the existing Bilibili delivery pipeline.

The product loop is:

```text
identity and consent
  -> personalized invitation or self-selected objective
  -> game, story, creative, community, or reviewed real-world progress
  -> trusted completion event
  -> points and non-monetary progression settle separately
  -> a visible consequence: episode, memory, achievement, collection, mode, or reward unlock
  -> optional gift redemption through the existing durable outbox
  -> owner acknowledgement or co-op follow-up
  -> next route in the user's personal season
```

The strongest existing code is the value and provider boundary. The expansion should preserve it. The largest product gap is the connective tissue between tasks, games, narrative, identity, owner participation, and long-term progression.

## 2. Product boundaries

### 2.1 What this expansion is

- A creator-oriented progression layer for existing and new users.
- A safe quest system with trusted event progress and optional reviewed evidence.
- A genuine branching narrative with persistent decisions.
- A persistent owner–streamer inbox plus live invitation and co-op experiences.
- Ten distinct new games, most of them free, skill-based, narrative, collection-based, or cooperative.
- A richer reward catalog that reuses the current point ledger, inventory, gift exchange, outbox, and provider reconciliation flow.
- A content platform with validators, versioning, localization, uniqueness checks, and auditability.

### 2.2 What this expansion is not

- A replacement for the existing gift delivery state machine.
- A microservice rewrite.
- A second balance column that quietly behaves like money.
- A collection of reskinned slots, wheels, or blind boxes.
- A system that pressures streamers to disclose private information or accept unwanted tasks.
- A chat room that permits arbitrary HTML, arbitrary Socket.IO event names, or unaudited owner actions.
- A one-shot code dump with 50,000 padded lines.

## 3. Roles and permissions

### 3.1 Streamer user

A normal authenticated user who may opt into creator features. The streamer can:

- create a creator profile;
- bind or request verification of a Bilibili room;
- set quiet hours, preferred interaction windows, task categories, content boundaries, and live availability;
- select quests from eligible boards or accept owner invitations;
- play story episodes and games;
- submit bounded evidence when a quest explicitly requires review;
- receive points, XP, affinity, cosmetics, story keys, materials, memories, and achievements;
- redeem eligible points or inventory items through existing server-controlled gift flows;
- decline, postpone, mute, report, archive, or export interactions.

### 3.2 Owner/director

A configurable privileged product role, separate from a hardcoded personal identity. The owner can:

- see only opted-in live availability and product-relevant state;
- send structured messages, quest offers, story letters, clues, polls, celebrations, and game invitations;
- join supported cooperative games;
- trigger preauthored story interventions;
- review evidence;
- grant non-monetary unlocks;
- grant audited gift inventory or a preauthorized reward order without calling the provider directly;
- schedule seasons and events;
- review complete audit history.

### 3.3 Administrator

The existing administrator remains responsible for account security, room binding approval, balance corrections, provider reconciliation, high-value review, feature flags, moderation, and operational controls. Owner and admin permissions may belong to the same account initially, but the code must keep policy capabilities distinct.

### 3.4 Worker/provider

Existing authenticated Bilibili workers remain the only provider execution boundary. Quest, story, inbox, game, and director modules cannot import or call provider send code.

## 4. Relationship tone without coercion

The system may feel personal without turning reward value into emotional leverage.

Each creator profile selects one or more interaction tones:

- `friend` — casual encouragement and shared memories;
- `co_creator` — collaborative challenges and production-oriented goals;
- `mentor` — structured practice, feedback, and mastery;
- `playful_rival` — friendly score challenges with no punishment for declining;
- `story_partner` — stronger fictional narrative framing;
- `quiet_support` — low-frequency asynchronous interaction.

Rules:

- Declining or postponing never reduces relationship XP, existing rewards, gift eligibility, or story access already earned.
- Spending money, receiving gifts, or choosing not to redeem gifts never affects relationship level.
- Offline meetings, private contact details, exact location, sleep deprivation, sexual content, humiliation, substance use, financial spending, and dangerous stunts are prohibited task categories.
- The owner cannot bypass blocked categories with a custom free-text task.
- Every owner action is typed, validated, bounded, rate-limited, and audited.

## 5. Information architecture

### 5.1 Streamer-facing navigation

```text
Home
  ├─ Today — current invitations, daily goals, story continuation, live availability
  ├─ Quest Journal — boards, chains, active objectives, submissions, history
  ├─ Story World — seasons, episodes, memories, routes, endings
  ├─ Play — current games plus ten new games
  ├─ Live Room — invitations, co-op rooms, polls, owner interactions
  ├─ Collections — achievements, materials, cosmetics, clues, memory book
  ├─ Rewards — point catalog, inventory, wishlist, delivery status
  └─ Creator Profile — preferences, boundaries, room, privacy, export
```

### 5.2 Owner-facing navigation

```text
Creator Director
  ├─ Overview — opted-in presence, pending reviews, scheduled events
  ├─ Streamers — profile-safe summaries and interaction history
  ├─ Invitations — quests, games, story letters, polls, celebrations
  ├─ Live Sessions — active rooms and reconnect state
  ├─ Story Interventions — preauthored moments and eligibility
  ├─ Quest Studio — definitions, boards, chains, schedules, budgets
  ├─ Content Health — graph validation, uniqueness, localization, reachability
  ├─ Rewards — inventory grants, approvals, exposure, reconciliation
  └─ Audit — immutable action and failure records
```

## 6. Economy model

### 6.1 Redeemable points

Existing `users.balance` remains the sole directly redeemable point balance. Every addition or deduction uses the current integer-money and `BalanceLogger` transaction pattern. New modules must use source-specific transaction reasons and stable idempotency keys.

Suggested source labels:

- `quest_v2_completion`
- `quest_chain_completion`
- `story_first_clear`
- `story_route_conclusion`
- `game_mastery_reward`
- `season_track_reward`
- `owner_reward_grant`
- `achievement_reward`
- `reward_catalog_redemption`

### 6.2 Non-redeemable progression

Store these separately:

- account XP;
- relationship XP;
- season reputation;
- story keys;
- crafting materials;
- cosmetics;
- clues;
- achievement progress;
- collection items;
- memory entries.

They must never be converted to points by a browser-provided rate. Any server-side conversion event requires an explicit catalog definition, budget, idempotency key, and audit record.

### 6.3 Reward budget hierarchy

A reward decision must satisfy all applicable budgets:

```text
system global daily cap
  -> feature daily cap
  -> season cap
  -> definition/version cap
  -> per-user daily cap
  -> per-assignment unique settlement
```

High-value rewards may enter `pending_approval` rather than settling immediately. Approval and settlement occur in one transaction or through a durable command with unique settlement guarantees.

## 7. Creator profile and consent foundation

### 7.1 Proposed tables

#### `creator_profiles`

- `user_id` primary key and foreign key to users;
- `display_name` bounded;
- `bio` bounded plain text;
- `pronouns` optional bounded text;
- `timezone` IANA identifier;
- `interaction_tones` constrained array or normalized join table;
- `difficulty_preference` constrained vocabulary;
- `story_tone_preference` constrained vocabulary;
- `live_interaction_opt_in` boolean;
- `profile_visibility` constrained vocabulary;
- `version` positive integer;
- created/updated timestamps.

#### `creator_preferences`

Normalize category preferences rather than storing an unrestricted JSON blob:

- `user_id`;
- `preference_type` such as quest category, game, evidence, communication;
- `preference_key` from a server registry;
- `preference_value` constrained to allow, neutral, avoid, block;
- source and timestamps;
- unique key on user/type/key.

#### `creator_quiet_hours`

- user;
- weekday or recurring schedule;
- local start/end minute;
- timezone snapshot;
- enabled flag;
- check preventing zero-length or invalid windows.

#### `creator_room_binding_requests`

- requested room ID;
- previous room ID;
- status: requested, verifying, approved, rejected, cancelled, blocked;
- verification adapter result;
- reviewer and audit fields;
- constraints preventing approval while unresolved provider work violates current room-change rules.

#### `creator_consent_events`

Append-only history of changes to sensitive preferences. Store old/new normalized values, actor, source, correlation ID, and timestamp. Do not store secrets or arbitrary provider payloads.

### 7.2 Server enforcement

Consent is not only UI decoration. Quest eligibility, owner invitation services, live presence, evidence requirements, and story interventions must query the current server-owned preference projection.

## 8. Relationship and memory system

### 8.1 Event model

Use append-only `relationship_events`:

- event ID;
- streamer user ID;
- owner actor ID or system source;
- event type;
- XP delta bounded by policy;
- associated quest, story run, game session, message, or achievement;
- stable dedupe key;
- public summary localization key and parameters;
- private audit metadata;
- occurred and recorded timestamps.

A reconciled `relationship_profiles` projection stores total XP, level, current milestone, version, and last event timestamp. Projection changes occur transactionally or through an idempotent projector.

### 8.2 Memory book

A memory is not free-form surveillance. It is a product event the streamer can see:

- first co-op clear;
- a chosen story route;
- a completed creative quest;
- a saved celebration;
- an unlocked ending;
- a favorite clue or crafted item;
- an owner letter the streamer chose to pin.

`shared_memories` should include localized title/body, source type and ID, visibility, pin/archive state, content version, and immutable creation provenance. Users may hide a memory from their default view without deleting required audit evidence.

## 9. Persistent inbox

### 9.1 Message types

- system notice;
- owner note;
- quest invitation;
- story letter;
- game invitation;
- co-op result;
- achievement celebration;
- reward/delivery status;
- evidence review note;
- event reminder;
- moderation notice.

### 9.2 Data rules

Messages use predefined templates plus bounded plain-text fields. No arbitrary HTML. Store:

- message ID;
- sender type and actor ID;
- recipient user ID;
- message type;
- template key and version;
- bounded localized parameters;
- action target and expiry;
- sent/read/archived timestamps;
- dedupe key;
- audit correlation ID.

Socket delivery is only a fast path. REST pagination remains authoritative for reconnect and multi-device consistency.

## 10. Quest Engine V2

### 10.1 Definition model

A quest definition is immutable after publication. Editing creates a new version.

Suggested hierarchy:

```text
quest_definition
  -> quest_version
      -> quest_step_definition
      -> eligibility rule tree
      -> completion rule tree
      -> reward policy
      -> localization records
      -> safety classification
```

Core fields:

- stable slug;
- version;
- lifecycle: draft, validated, scheduled, active, retired;
- category and tags;
- difficulty and estimated effort;
- required consent categories;
- schedule and cooldown;
- eligibility expression from a bounded declarative language;
- step graph;
- completion expression;
- reward policy ID;
- manual review policy;
- decline/postpone behavior;
- story, achievement, game, or collection unlock hooks.

### 10.2 Assignment state machine

```text
offered
  -> accepted -> active -> submitted -> under_review -> completed
       |           |          |               |
       |           |          +-> returned ---+
       |           +-> expired
       |           +-> cancelled
       +-> declined
       +-> expired
```

Every transition writes an immutable quest event. Terminal reward settlement has a unique key on assignment and reward policy version.

### 10.3 Trusted event envelope

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventType": "game.session.completed",
  "source": "server_game_engine",
  "actorUserId": 123,
  "subjectUserId": 123,
  "occurredAt": "ISO-8601",
  "recordedAt": "ISO-8601",
  "dedupeKey": "bounded-stable-key",
  "correlationId": "uuid",
  "payload": {
    "gameId": "constellation-repair",
    "sessionId": "uuid",
    "difficulty": "normal",
    "score": 870
  }
}
```

Only registered schemas are accepted. Payload keys and bounds are validated server-side. Browser messages may request an action, but the server emits the trusted result event after validating or executing it.

### 10.4 Rule language

Provide a non-executable rule AST:

- `all`;
- `any`;
- `not`;
- `event_count`;
- `distinct_days`;
- `streak`;
- `threshold_sum`;
- `ordered_sequence`;
- `within_window`;
- `has_achievement`;
- `story_flag`;
- `relationship_level`;
- `owns_collection_item`;
- `admin_confirmation`;
- `evidence_approved`.

Reject unknown operations, excessive depth, excessive children, unbounded windows, and client-authored rule trees.

### 10.5 Evidence model

Supported evidence:

- normalized PNG screenshot;
- short text response;
- structured checklist;
- owner/admin confirmation;
- verified product event.

Reuse the repository's existing PNG validation and normalization approach. Store hash, dimensions, media type, byte count, immutable review history, and retention deadline. Do not expose local filesystem paths. Do not accept SVG or arbitrary document uploads.

### 10.6 Quest content allocation

Minimum 180 templates:

| Category | Minimum | Examples |
| --- | ---: | --- |
| Site exploration | 16 | discover a profile control, read delivery status, pin a memory |
| Game mastery | 36 | clear maps, improve deterministic score, co-op role mastery |
| Story | 24 | pursue routes, find clues, replay without value reward |
| Creativity | 24 | title a fictional broadcast, write a short safe story beat, design a collection card |
| Streaming practice | 20 | microphone check, scene-planning checklist, safe rehearsal |
| Co-op | 20 | complete asymmetric puzzle, exchange clues, joint crafting |
| Community | 12 | opt-in poll, supportive product interaction, no off-platform harassment |
| Collection/crafting | 16 | discover recipes, complete sets, restore artifacts |
| Safe wellbeing | 12 | optional stretch reminder, volume check, break planning; always skippable |

Thirty chains should contain three to eight genuinely dependent quests. Twelve weekly board configurations rotate categories without assigning blocked content. Twenty event templates support owner-triggered or seasonal moments.

## 11. Branching story world

### 11.1 World premise

Working title: **The Starlight Relay / 星光联络站**.

The owner is represented by a configurable station role such as “Keeper,” “Director,” or “Station Master.” Streamers are “Signal Bearers” who reconnect fragmented broadcast worlds. The fiction supports messages, cooperative games, mysteries, crafting, memories, and live interventions without pretending that the website knows private facts about a user.

The story has four relationship axes, all non-monetary:

- trust;
- curiosity;
- courage;
- harmony.

Choices also set explicit flags, create clues, alter character relationships, unlock scenes, and determine routes. No route depends on gift spending.

### 11.2 Node types

- `narrative`;
- `dialogue`;
- `choice`;
- `puzzle`;
- `quest_gate`;
- `game_launch`;
- `inventory_gate`;
- `relationship_gate`;
- `achievement_gate`;
- `owner_intervention`;
- `timed_wait`;
- `message_delivery`;
- `memory_unlock`;
- `checkpoint`;
- `route_conclusion`;
- `season_ending`.

### 11.3 Persistent state

```text
campaign version
current season/episode/node
committed choice IDs
flags and bounded counters
character relationship projections
clues and story inventory
memory unlocks
route memberships
checkpoint and revision
first-clear settlements
replay mode
```

The client receives only the current public projection. Conditions, hidden effects, correct answers, future node text, and secret routes remain server-side.

### 11.4 Season outline

#### Season One — First Light / 初灯

Purpose: creator onboarding, consent, first owner contact, first co-op experience, and route identity.

1. `The Quiet Frequency / 静默频段` — discover the station and choose interaction tone.
2. `A Name in the Static / 杂音里的名字` — create the public creator identity.
3. `The Locked Window / 上锁的窗口` — learn boundaries and quiet hours through fiction.
4. `Two Ends of a Wire / 线路两端` — first asynchronous owner puzzle.
5. `Map of Small Lights / 微光地图` — unlock exploration quests.
6. `The Missing Chime / 消失的提示音` — Signal Duet tutorial.
7. `Letter Without a Stamp / 没有邮戳的信` — first story letter and reply style.
8. `A Door That Waits / 会等待的门` — demonstrate that declining does not punish progress.
9. `Constellation in Pieces / 破碎星图` — first full co-op map.
10. `The Broadcast Garden / 播放花园` — collection and crafting introduction.
11. `Before the First Bell / 第一声铃响之前` — route-specific preparation.
12. `Relay One / 一号中继` — three major conclusions based on trust, curiosity, courage, and choices.

#### Season Two — Echo Archive / 回声档案

Purpose: persistent mysteries, evidence linking, memory book, and deeper character routes.

1. `Archive Door 7 / 七号档案门`
2. `A Recording That Remembers / 会记忆的录音`
3. `The Contradiction Board / 矛盾墙`
4. `Three Versions of Rain / 三种雨声`
5. `Borrowed Signature / 借来的署名`
6. `The Absent Witness / 缺席的见证者`
7. `Rooms Behind Rooms / 房间之后的房间`
8. `A Memory You May Refuse / 可以拒绝的记忆`
9. `Keeper's Redacted Letter / 守望者的删节信`
10. `The False Finale / 假终章`
11. `Echo Trial / 回声审判`
12. `Archive Open / 档案开启`

#### Season Three — Twin Stage / 双轨舞台

Purpose: collaborative creation, asynchronous play, rival/co-creator routes, and public-versus-private choices.

1. `Two Scripts / 两份脚本`
2. `The Empty Rehearsal / 空场彩排`
3. `Signal and Counter-Signal / 信号与反信号`
4. `The Prop Room / 道具间`
5. `A Scene Written Twice / 写了两遍的场景`
6. `Friendly Static / 友好的杂音`
7. `One Spotlight, Two Shadows / 一束光，两道影`
8. `The Audience of Paper Stars / 纸星观众`
9. `Improvised Bridge / 即兴桥梁`
10. `The Unsent Applause / 没送出的掌声`
11. `Dress Rehearsal at Midnight / 午夜联排`
12. `Twin Broadcast / 双轨直播`

#### Season Four — Storm Boundary / 风暴边界

Purpose: pressure, safe refusal, moderation, resilience, and preserving trust under conflict.

1. `Pressure Drop / 气压骤降`
2. `The Urgent Invitation / 紧急邀请`
3. `No Is a Complete Signal / “不”也是完整信号`
4. `Flooded Channel / 漫水频道`
5. `The Rumor Engine / 谣言机器`
6. `Mute for Ten Minutes / 静音十分钟`
7. `A Task That Should Not Exist / 不该存在的任务`
8. `Repair Without Blame / 不追责的修复`
9. `The Long Reconnect / 漫长重连`
10. `Boundary Beacon / 边界信标`
11. `Storm Vote / 风暴投票`
12. `Still on the Air / 仍在播出`

#### Season Five — After the Long Night / 长夜之后

Purpose: convergence, route consequences, endings, lasting collections, and future seasonal play.

1. `All Relays Answer / 所有中继回应`
2. `The Map Beneath the Map / 地图之下`
3. `Names We Kept / 留下的名字`
4. `The Last Unopened Letter / 最后一封未拆信`
5. `Craft of Dawn / 黎明工艺`
6. `The Choice to Stay Offline / 选择暂时离线`
7. `Twelve Returning Signals / 十二道归返信号`
8. `Keeper at the Other Console / 另一端控制台的守望者`
9. `Route of Clear Glass / 透明玻璃之路`
10. `Route of Wild Stars / 野星之路`
11. `Route of the Shared Stage / 共演舞台之路`
12. `A Light That Is Yours / 属于你的光`

### 11.5 Ending families

At least 25 distinct conclusions should be distributed across:

- independent explorer;
- trusted station partner;
- co-creator;
- archive keeper;
- constellation restorer;
- quiet supporter;
- playful rival;
- mystery solver;
- community guide;
- crafting master;
- multiple hybrid endings;
- boundary-preserving endings where the user remains connected on their own terms.

A “less intimate” route is not a failure state.

### 11.6 Content quotas

Minimum authored content:

- 60 episodes;
- 720 graph nodes;
- 1,200 bilingual dialogue/narrative beats;
- 600 choices with persistent consequences;
- 12 recurring characters;
- 25 route conclusions/endings;
- 50 memory entries;
- 30 owner-intervention nodes;
- 120 clues/items/letters/collection records;
- 60 episode summaries and 60 completion reflections.

Content tests must compare normalized text to prevent episode-number templating, near-duplicate dialogue, repeated choice labels, and identical branch summaries.

## 12. Live owner–streamer interaction

### 12.1 Transport model

Extend current authenticated Socket.IO. Do not create a separate public socket server.

Persistent interaction events use:

```json
{
  "protocolVersion": 1,
  "interactionId": "uuid",
  "eventId": "uuid",
  "sequence": 42,
  "type": "invitation.quest.created",
  "actor": { "type": "owner", "id": 1 },
  "subjectUserId": 123,
  "expectedRevision": 7,
  "occurredAt": "ISO-8601",
  "payload": {},
  "correlationId": "uuid"
}
```

Requirements:

- server-assigned sequence numbers;
- acknowledgement IDs;
- dedupe on event ID and command ID;
- REST catch-up after last acknowledged sequence;
- replay after reconnect;
- PostgreSQL event-bus fan-out across instances;
- bounded schemas and event registry;
- session revalidation and forced disconnect on revocation;
- flood limits;
- no arbitrary client event names.

### 12.2 Interaction session state

```text
created -> invited -> accepted -> active -> completed
             |          |          |
             +-> declined          +-> paused -> active
             +-> expired           +-> abandoned
                                   +-> cancelled
```

State-affecting events are persisted before fan-out. Ephemeral cursor, hover, or heartbeat signals may remain transient and must not affect reward or progress.

### 12.3 Director actions

Typed commands:

- send nudge;
- send clue;
- send celebration;
- create poll;
- offer quest;
- invite to game;
- join co-op room;
- trigger eligible story intervention;
- send story letter;
- review evidence;
- return evidence with note;
- grant cosmetic/story key/material;
- create audited inventory grant;
- schedule event;
- cancel own pending invitation.

Every command has authorization, consent checks, rate limits, dedupe, an audit event, and a visible streamer explanation.

## 13. Ten new games

### 13.1 Constellation Repair / 星图协修

**Core mechanic:** route energy through a grid of rotatable nodes. Owner and streamer see different subsets of constraints. It supports simultaneous and turn-based modes.

**Interaction value:** requires communication but offers pings and structured clues for users who do not want voice chat.

**Content:** at least 30 maps across tutorial, normal, advanced, and route-specific sets.

**Server authority:** board seed, hidden constraints, legal rotations, score, completion, and reward are server-owned. State uses revision CAS.

**Hooks:** co-op quest progress, trust/harmony story axes, constellation collection pieces.

### 13.2 Signal Duet / 信号双奏

**Core mechanic:** reproduce visual or generated-tone rhythm patterns. Two players alternate or synchronize lanes.

**Copyright rule:** use generated tones and original patterns only.

**Content:** at least 40 authored patterns plus deterministic procedural daily variations.

**Accessibility:** visual pulse mode, reduced-motion mode, keyboard and touch input, adjustable latency calibration.

**Hooks:** streaming-practice quests, duet achievements, story relay repair.

### 13.3 Mystery Board / 谜案拼图

**Core mechanic:** collect evidence cards, link claims, identify contradictions, and choose investigative conclusions.

**Content:** at least 20 substantial cases with multiple plausible theories and consequences.

**Security:** secret evidence and correct links never enter the initial client payload.

**Hooks:** story clues, archive season, owner hint interventions.

### 13.4 Story Weaver / 故事接龙工坊

**Core mechanic:** asynchronous collaborative writing under safe structured constraints. Players select or write bounded short segments, then vote on branches.

**Moderation:** input length limits, escaping, report flow, optional template-only mode, no public discovery by default.

**Content:** at least 30 prompt packs with tone, required motifs, banned content classes, and multiple endings.

**Hooks:** creativity quests, memory-book excerpts, cosmetic manuscript pages.

### 13.5 Studio Crafting / 星光工坊

**Core mechanic:** combine materials earned from quests, story, and games into cosmetics, set pieces, letters, badges, and story artifacts.

**Economy:** materials are non-redeemable. Recipes are server-owned. No client-supplied ingredient counts or outputs.

**Content:** at least 80 recipes in 12 collections, including alternate recipe paths.

**Hooks:** collection achievements, story gates, profile decoration.

### 13.6 Meteor Defense / 流星守望

**Core mechanic:** deterministic lane/tower defense where the owner may place support beacons and the streamer controls primary defenses.

**Content:** at least 25 maps with deterministic seeds and challenge modifiers.

**Fairness:** no paid random power. Runs can be replayed from action logs.

**Hooks:** courage story axis, mastery quests, seasonal scoreboards with privacy controls.

### 13.7 Dream Maze / 梦境迷航

**Core mechanic:** daily deterministic roguelite maze with resources, clues, route choices, and a fixed seed per user/day/season.

**Content:** handcrafted room library plus validated generation rules. At least 100 room definitions and 30 event definitions.

**Security:** hidden map and outcomes remain server-side. Client receives only visible adjacent information.

**Hooks:** story flags, clues, daily streak quests without punitive loss.

### 13.8 Broadcast Bingo / 直播宾果

**Core mechanic:** opt-in bingo cards populated by admin-confirmed or server-observed safe broadcast events.

**Privacy:** no scraping or inference of sensitive content. Events must come from an approved adapter or manual confirmation.

**Content:** at least 20 card themes and 120 safe event definitions.

**Hooks:** event quests, audience participation, owner celebrations.

### 13.9 Echo Memory / 回声默契

**Core mechanic:** asymmetric memory game. One player sees a sequence or map briefly; the other receives transformed clues.

**Content:** at least 50 challenge sets with difficulty-specific transformations.

**Accessibility:** no color-only distinctions, adjustable exposure duration, reduced animation.

**Hooks:** harmony/trust, co-op achievements, memory-book unlocks.

### 13.10 Keeper Prediction / 守望者猜心局

**Core mechanic:** owner and streamer predict each other's choices from bounded fictional preference prompts, then reveal and discuss matches.

**Privacy:** prompts concern fictional worlds, game tactics, creative choices, or site preferences. Do not ask about exact location, finances, relationships, health, or private off-platform behavior.

**Content:** at least 200 bilingual prompt cards organized by safe topic and tone.

**Hooks:** playful-rival or story-partner routes, relationship memories, weekly co-op quest.

### 13.11 Common game contract

Every game includes:

- immutable descriptor in the central registry;
- pure engine with injected time/randomness;
- server-authoritative commands and public projections;
- persistence and resumability when stateful;
- owner-bound revision or row lock;
- tutorial and at least three meaningful difficulty modes;
- mobile and keyboard controls;
- accessible labels and reduced-motion behavior;
- reconnect/replay strategy;
- history/profile display;
- trusted quest events;
- achievement and story hooks;
- unit, API, concurrency, hidden-state, UI, and failure tests.

## 14. Achievements, collections, and seasons

### 14.1 Achievement families

At least 60 achievements across:

- onboarding and consent literacy;
- existing game mastery;
- each new game;
- co-op;
- story routes;
- quest chains;
- crafting collections;
- memory book;
- healthy interaction controls;
- seasonal participation;
- hidden discoveries.

Achievement definitions are immutable by version. Progress consumes trusted events. Hidden achievements expose only safe completion information before unlock.

### 14.2 Seasonal track

A season track may grant:

- cosmetics;
- profile frames;
- story keys;
- materials;
- memory pages;
- bounded point rewards;
- catalog visibility.

No already-earned content disappears when the season ends. The season becomes read-only and remains visible in an archive.

## 15. Reward catalog and Bilibili gift bridge

### 15.1 Existing boundary to preserve

The repository already has server-priced gift types, `gift_exchanges`, `wish_inventory`, worker leases, delivery events, provider receipts, uncertainty handling, room-change serialization, and reconciliation. All new value-bearing flows terminate at those same boundaries.

### 15.2 New catalog layer

Suggested tables:

- `reward_catalog_items`;
- `reward_catalog_versions`;
- `reward_catalog_visibility_rules`;
- `reward_catalog_budgets`;
- `reward_wishlists`;
- `reward_orders`;
- `reward_order_events`;
- `reward_inventory_grants`.

A catalog item can represent:

- a direct point redemption mapping to an approved existing gift type;
- a story/achievement-unlocked gift;
- a stored inventory reward;
- a cosmetic or non-provider reward;
- a high-value item requiring approval.

The browser receives display name, art key, price, stock state, cooldown, unlock explanation, and catalog version. It does not receive private provider credentials or mutable provider mapping details.

### 15.3 Order flow

```text
catalog selection
  -> server validates version, price, unlock, balance, room, limits, stock, consent
  -> transaction creates order and point hold/deduction or inventory reservation
  -> approved provider item creates/reuses gift exchange and outbox command
  -> worker claims and executes under existing lease/receipt rules
  -> delivery events project order status
  -> uncertain remains uncertain until reconciliation
```

No story or quest service calls the worker sender directly.

## 16. Proposed module boundaries

```text
domain/creators/
  profile.js
  preferences.js
  consent.js
  relationship.js
  memory.js
  inbox.js

domain/quests/
  definition.js
  rule-ast.js
  evaluator.js
  assignment.js
  transitions.js
  rewards.js
  evidence.js
  scheduler.js
  legacy-bridge.js

domain/story/
  schema.js
  validator.js
  engine.js
  conditions.js
  effects.js
  projection.js
  replay.js
  content-registry.js

domain/live-interactions/
  protocol.js
  session.js
  invitations.js
  presence.js
  projection.js

domain/achievements/
  definitions.js
  evaluator.js
  projection.js

domain/rewards/
  catalog.js
  eligibility.js
  budgets.js
  order.js
  gift-bridge.js

repositories/
  creator-profile-repository.js
  quest-repository.js
  story-repository.js
  interaction-repository.js
  achievement-repository.js
  reward-catalog-repository.js

services/
  creator-profile-service.js
  quest-command-service.js
  quest-event-ingestion-service.js
  story-command-service.js
  live-interaction-service.js
  director-service.js
  achievement-projector.js
  reward-order-service.js

routes/
  creators.js
  quest-v2.js
  story-world.js
  live-interactions.js
  creator-rewards.js
  admin-creator-director.js

content/streamer-world/
  quests/
  story/
  games/
  achievements/
  seasons/
```

Keep route modules thin. Do not add thousands of lines to `server.js`, `routes/games.js`, `routes/admin.js`, or `routes/gifts.js`.

## 17. Proposed database clusters

### 17.1 Creator cluster

- `creator_profiles`
- `creator_preferences`
- `creator_quiet_hours`
- `creator_room_binding_requests`
- `creator_consent_events`
- `relationship_events`
- `relationship_profiles`
- `shared_memories`
- `creator_inbox_messages`

### 17.2 Quest cluster

- `quest_definitions`
- `quest_versions`
- `quest_step_definitions`
- `quest_boards`
- `quest_board_slots`
- `quest_chains`
- `quest_chain_nodes`
- `quest_assignments`
- `quest_assignment_steps`
- `quest_events`
- `quest_evidence`
- `quest_evidence_reviews`
- `quest_reward_settlements`
- `quest_schedules`

### 17.3 Story cluster

- `story_campaigns`
- `story_content_versions`
- `story_runs`
- `story_run_events`
- `story_run_variables`
- `story_run_inventory`
- `story_run_relationships`
- `story_checkpoints`
- `story_completions`
- `story_reward_settlements`
- `story_memory_unlocks`

### 17.4 Live interaction cluster

- `interaction_sessions`
- `interaction_members`
- `interaction_events`
- `interaction_acknowledgements`
- `interaction_invitations`
- `creator_presence_preferences`
- `director_action_audit`

### 17.5 Progression and rewards cluster

- `achievement_definitions`
- `achievement_progress`
- `achievement_unlocks`
- `collection_definitions`
- `collection_items`
- `user_collection_items`
- `season_definitions`
- `season_progress`
- `reward_catalog_items`
- `reward_catalog_versions`
- `reward_catalog_budgets`
- `reward_wishlists`
- `reward_orders`
- `reward_order_events`
- `reward_inventory_grants`

Avoid creating all tables in one migration. Use forward-only phase migrations and test both fresh setup and historical upgrade paths.

## 18. API surface

Names may adapt to repository conventions, but the capability boundary should remain.

### 18.1 Creator API

- `GET /api/creator/profile`
- `PUT /api/creator/profile`
- `GET /api/creator/preferences`
- `PUT /api/creator/preferences`
- `POST /api/creator/room-binding-requests`
- `GET /api/creator/memories`
- `PATCH /api/creator/memories/:id`
- `GET /api/creator/inbox`
- `POST /api/creator/inbox/:id/read`
- `POST /api/creator/inbox/:id/archive`
- `GET /api/creator/export`

### 18.2 Quest API

- `GET /api/quests/v2/boards`
- `GET /api/quests/v2/assignments`
- `POST /api/quests/v2/assignments/:id/accept`
- `POST /api/quests/v2/assignments/:id/decline`
- `POST /api/quests/v2/assignments/:id/postpone`
- `POST /api/quests/v2/assignments/:id/submit`
- `POST /api/quests/v2/assignments/:id/evidence`
- `GET /api/quests/v2/history`

### 18.3 Story API

- `GET /api/story/campaigns`
- `POST /api/story/runs`
- `GET /api/story/runs/:id`
- `POST /api/story/runs/:id/actions`
- `POST /api/story/runs/:id/replay`
- `GET /api/story/memories`
- `GET /api/story/endings`

### 18.4 Live API

- `GET /api/live/interactions`
- `POST /api/live/availability`
- `POST /api/live/invitations/:id/accept`
- `POST /api/live/invitations/:id/decline`
- `POST /api/live/interactions/:id/leave`
- `GET /api/live/interactions/:id/events?afterSequence=`

### 18.5 Reward API

- `GET /api/creator-rewards/catalog`
- `POST /api/creator-rewards/orders`
- `GET /api/creator-rewards/orders`
- `GET /api/creator-rewards/orders/:id`
- `PUT /api/creator-rewards/wishlist`

### 18.6 Director API

All routes require the appropriate typed privilege, CSRF, rate limits, idempotency where needed, and success/failure audit.

- `GET /api/admin/creator-director/overview`
- `GET /api/admin/creator-director/streamers/:userId`
- `POST /api/admin/creator-director/invitations`
- `POST /api/admin/creator-director/story-interventions`
- `POST /api/admin/creator-director/evidence/:id/review`
- `POST /api/admin/creator-director/unlock-grants`
- `POST /api/admin/creator-director/reward-grants`
- `POST /api/admin/creator-director/events`

## 19. Content architecture

### 19.1 Content is data, not executable code

Use validated JS/JSON content modules or another repository-consistent static format. Content may reference registered conditions, effects, games, quests, and localization keys. It may not contain executable functions, SQL, HTML, or arbitrary expressions.

### 19.2 Stable identifiers

Identifiers should be human-readable and immutable:

```text
story.s1.e03.scene.boundary-window.choice.wait
quest.streaming.mic-check.v1
achievement.coop.constellation-first-clear.v1
game.mystery.case.archive-07
memory.s1.first-declined-invitation-respected
```

### 19.3 Validator suite

Validate:

- schema and bounds;
- unique IDs and versions;
- localization completeness;
- graph references and reachability;
- cycle visit budgets;
- condition and effect registry membership;
- reward policy existence and limits;
- duplicate and near-duplicate prose;
- repeated choice labels;
- repeated openings/finales/summaries;
- content count minimums;
- forbidden unsafe task categories;
- game level validity;
- recipe reachability;
- clue/case consistency.

## 20. Frontend standards

- Keep EJS and vanilla browser JavaScript unless a deliberate repository-wide framework decision is made.
- Use page-specific controllers rather than expanding one global script.
- No unsafe `innerHTML` for user or content text.
- All new strings have natural Chinese and English versions.
- Every interactive control works with keyboard.
- Focus is restored after modal/route transitions.
- Do not encode meaning only by color.
- Respect reduced motion.
- Mobile target includes narrow iPhone widths and touch input.
- Use optimistic UI only where server reconciliation is clear; value and story decisions remain server-confirmed.
- Reconnect banners distinguish offline, reconnecting, replaying, and current states.
- Every reward change explains source, amount, timestamp, and resulting balance or inventory state.

## 21. Security and abuse controls

### 21.1 General

- Revalidate live sessions for HTTP and Socket.IO.
- Preserve CSRF and middleware order.
- Use integer money only.
- Use idempotency on replay-sensitive writes.
- Bind state by owner and revision.
- Paginate all histories.
- Bound text, arrays, JSON depth, upload size, and event rate.
- Sanitize logs and never expose stack traces, SQL, provider payloads, hidden story conditions, or secret game state.

### 21.2 Owner action abuse

- Capability-specific privileges.
- Per-owner and per-streamer rate limits.
- Consent and blocked-category checks.
- Structured templates for sensitive actions.
- Complete success/failure audit.
- Streamer report and mute flow.
- No invisible relationship penalties.

### 21.3 Reward abuse

- Unique settlement keys.
- Trusted event source registry.
- Server-owned scoring.
- Per-definition and global budgets.
- Manual review for high-value or subjective evidence.
- Concurrent completion tests.
- Lost-response replay tests.
- Provider uncertainty remains unresolved until reconciliation.

## 22. Test architecture

### 22.1 Unit tests

- quest AST validation and evaluation;
- quest transition table;
- story conditions, effects, graph traversal, checkpoints, replay;
- game engines;
- relationship projection;
- achievement evaluator;
- reward eligibility and budgets;
- content validators.

### 22.2 Database and API tests

- fresh and historical migrations;
- constrained statuses;
- unique active assignment/session indexes;
- append-only audit/event protections;
- auth, ownership, admin capability, CSRF, rate limits;
- idempotency and replay;
- concurrent point settlement;
- hidden-state projection;
- evidence validation;
- room-change/provider work serialization;
- deactivation and retention behavior.

### 22.3 Socket tests

- authenticated connection;
- revoked session disconnect;
- invitation accept/decline;
- monotonic sequence;
- duplicate command and duplicate acknowledgement;
- reconnect catch-up;
- cross-instance PostgreSQL fan-out;
- stale revision rejection;
- flood control;
- leave and cancellation;
- no progress from ephemeral events.

### 22.4 Browser tests

- creator onboarding;
- consent and blocked category enforcement;
- quest journal and evidence flow;
- one complete story route plus replay;
- each new game tutorial and resume;
- co-op reconnect;
- director invitation and streamer decline;
- reward order and uncertain delivery display;
- keyboard-only flow;
- narrow mobile viewport;
- localization switching;
- XSS payload rendering.

### 22.5 Load and resilience

- quest event ingestion bursts;
- weekly board generation;
- story reads and action commits;
- presence fan-out;
- 100+ concurrent co-op rooms in test configuration;
- database outage and recovery;
- event-bus interruption;
- worker stale lease and provider timeout;
- application lifecycle clean shutdown.

## 23. Delivery plan and target line allocation

The 50,000-line requirement is a floor. Target approximately 56,000–60,000 credited meaningful additions to leave room for exclusions and later refactors.

| Area | Target meaningful additions |
| --- | ---: |
| Backend domain, repositories, services, routes, migrations | 14,000–16,000 |
| Frontend EJS, browser JS, CSS | 9,000–10,000 |
| Authored story, quest, game, achievement, season content | 18,000–20,000 |
| Automated tests and fixtures | 12,000–14,000 |
| Tooling and bounded documentation credit | 2,000–3,000 |

Do not meet these numbers by reformatting old files, splitting expressions, duplicating records, or generating numeric variants.

### Phase 0 — Baseline and ADRs

Deliver:

- base commit and dirty-path record;
- full baseline tests;
- progress ledger;
- architecture decision records;
- line counter initial zero;
- no user-facing feature.

### Phase 1 — Creator foundation

Deliver:

- profiles, preferences, consent, quiet hours;
- relationship events and memory book;
- persistent inbox;
- creator home/profile UI;
- admin safe read view;
- disabled-by-default feature flags;
- tests.

### Phase 2 — Quest Engine V2

Deliver:

- versioned definitions and rule AST;
- assignments, steps, events, evidence, review, settlement;
- boards, schedules, chains;
- admin quest studio;
- streamer journal;
- legacy task-card read/import bridge;
- first 60 quests and 10 chains;
- tests.

### Phase 3 — Story engine and Season One

Deliver:

- engine, persistence, validators, projection, UI;
- Season One complete with actual branches;
- owner intervention hooks;
- first-clear reward bridge;
- tests.

### Phase 4 — Live platform

Deliver:

- persistent protocol and REST catch-up;
- presence with consent;
- director console;
- invitations, messages, polls, co-op room primitives;
- audit and tests.

### Phase 5 — Games one through five

Deliver complete implementations of Constellation Repair, Signal Duet, Mystery Board, Story Weaver, and Studio Crafting.

### Phase 6 — Games six through ten

Deliver complete implementations of Meteor Defense, Dream Maze, Broadcast Bingo, Echo Memory, and Keeper Prediction.

### Phase 7 — Reward catalog bridge

Deliver:

- versioned catalog and visibility;
- wishlist and goals;
- budgets and high-value review;
- inventory grants and point orders;
- existing gift exchange/outbox integration;
- delivery history and reconciliation UI;
- tests for every provider state.

### Phase 8 — Full content

Complete:

- all five seasons;
- 180 quests;
- 30 chains;
- 12 weekly boards;
- 20 event templates;
- 60 achievements;
- all game content minima;
- 50 memories;
- 25 endings;
- uniqueness and reachability gates.

### Phase 9 — Hardening

Complete:

- accessibility;
- performance and query plans;
- load and failure tests;
- historical migrations;
- privacy/retention;
- feature-flag rollback;
- full regression;
- line contract;
- final report.

## 24. Definition of done

The expansion is complete only when:

- a new streamer can opt in, define boundaries, and see a personalized but safe home;
- quests progress from trusted game/story/live events and reviewed evidence;
- points settle exactly once and are explainable;
- non-monetary progression never contaminates the redeemable balance;
- five seasons contain real persistent branching and multiple conclusions;
- ten new games are distinct, complete, resumable, accessible, and connected to progression;
- the owner can interact through typed invitations, story moments, co-op sessions, reviews, and celebrations;
- reconnect and REST catch-up preserve interaction state;
- reward orders reuse the existing gift delivery state machine;
- provider uncertainty cannot silently resend or refund;
- all old tests and all new tests pass;
- real provider sends remain disabled during development;
- the meaningful-line verifier passes every threshold;
- no unrelated dirty path is modified;
- `docs/streamer-expansion/FINAL_REPORT.md` accurately lists architecture, content counts, database changes, route changes, test commands, line counts, remaining operator steps, and known limitations.
