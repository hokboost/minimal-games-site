# ADR 0007: Durable Live Audiences and Continuous Co-op Consent

Status: accepted for the P0 security remediation.

## Decision

Every `live_interaction_events` row has one immutable audience: `creator`, `owner`, `both`, or
`system`. Runtime producers must set it explicitly. There is no database default after the
forward migration, so a new producer cannot silently become participant-visible.

The historical backfill uses an explicit event-type allowlist. Types whose original participant
audience is proven are mapped to `both`; report and re-consent lifecycle events are mapped to
`creator`. Anything else is mapped to `system`. In particular, the migration never uses a blanket
`both` fallback.

REST state, catch-up, acknowledgement high-water marks, local Socket delivery, and PostgreSQL-bus
delivery all evaluate the persisted audience. Restricted fanout uses an authenticated
interaction/role/user subscription identity. A bus payload carries only the durable event ID and a
realtime suppression boundary; every process reloads the event and current authorization from
PostgreSQL before emitting it. Physical sequence gaps caused by hidden events are valid. Pagination
filters before `LIMIT`, advances by the last visible sequence, and reports the viewer's visible
high-water mark, so hidden tails cannot create an infinite loop.

Active membership, account state, global opt-in, unresolved report state, room mute,
`all_messages`, and per-game preferences are rechecked at every cooperative start, action, active
state/resume read, trusted Bingo event, game Socket subscription, and game-event fanout. General
live events remain available when only one game is blocked; that game's state events do not.

Consent withdrawal is a transaction boundary, not a best-effort notification. The profile and
preference write paths, leave/mute/report commands, permanent account lock, and account
deactivation abandon affected active co-op runs in the same transaction. Each abandonment uses
run revision CAS and appends one immutable `game.run.abandoned` event plus an audit row with a
closed reason code. Missing consent infrastructure fails co-op operations closed.

## Concurrency and lock order

All participating write paths acquire locks in this order:

1. the creator `users` row, then the configured owner row;
2. the live room and membership rows;
3. affected game runs in stable run-ID order.

This order serializes an owner action against creator opt-out or preference replacement. If the
withdrawal transaction owns the user lock first, the waiting action observes the new boundary and
cannot append a normal game action. If the action owns it first, that action commits before the
withdrawal begins; the withdrawal then abandons the resulting active run. Deadlocks are retried by
neither path and therefore surface rather than being hidden.

## Terminal-read contract

The first active state read that discovers withdrawn consent atomically abandons the run and
returns `GAME_COOP_CONSENT_REVOKED`. Later state reads by an otherwise active historical
participant may view the role-projected terminal state, including `consentRevokedReason` and its
timestamp. They do not re-append events or audits. Locked or deactivated accounts remain denied.
Actions and trusted events can never advance a consent-abandoned run.

## Migration and rollback

`add_streamer_security_live_acl.sql` is forward-only and follows the existing live/game
migrations. It temporarily disables the existing append-only event trigger only for the bounded
audience backfill, restores it before commit, removes the audience default, tightens left-member
immutability, and adds the co-op revocation reason columns and indexes.

Application rollback is safe after the migration because old readers ignore added columns. Schema
rollback is intentionally not automated: removing audiences would recreate the confidentiality
defect. If deployment must be rolled back, disable Live Interactions and Streamer Games with their
feature switches while retaining the migrated schema and immutable evidence.

## Verification

The default suite covers explicit audiences, unknown/system denial, role isolation, more than 200
mixed events, precise Socket rooms, stale recipient checks, all consent reasons, and CAS-deduplicated
abandonment. `npm run test:live-security:postgres` additionally creates a disposable PostgreSQL
database, replays a historical upgrade, verifies REST/state/ack pagination, starts two application
processes with authenticated sockets, and executes withdrawal plus owner-action concurrency tests.
