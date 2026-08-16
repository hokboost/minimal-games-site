# ADR 0002: Accept quest progress only through registered trusted events

- Status: Accepted
- Date: 2026-08-16
- Phase: 0

## Context

Quest Engine V2 must consume progress from games, stories, co-op sessions, site activity, reviewed evidence, and administrator-confirmed live events. These sources have different trust levels. A generic endpoint that accepts a claimed event name and result from the browser would allow forged scores, repeated completions, hidden-state injection, and duplicate rewards.

The current repository already has strong server-authoritative game settlement and idempotency patterns. Quest progress should attach to those trusted transaction boundaries instead of rebuilding trust from client payloads.

## Decision

All quest progress enters through a versioned, allowlisted event envelope containing:

- schema version and registered event type;
- server-assigned event ID;
- trusted source identity;
- actor and subject identities;
- occurred and recorded timestamps;
- bounded stable dedupe key;
- correlation ID;
- payload validated against the exact event schema.

The trusted source registry distinguishes server game engines, story settlement, live-interaction services, scheduled system jobs, evidence approval, and authenticated administrator confirmation. Each source may emit only its registered event types and payload shape.

Browser commands are requests, not events. A route or socket handler first authenticates the session, validates ownership and revision, executes the server-owned action, and then emits the trusted result event. Self-report and text-response quests always enter review and become progress only through an approval event.

Event ingestion is idempotent by both event ID and source-specific dedupe key. Reusing a dedupe identity with different canonical payload bytes fails closed and is audited. Event persistence, quest-step projection, assignment transition, reward settlement, and the idempotency response share one transaction where a value-bearing completion occurs.

The quest rule language is a bounded declarative AST. It supports registered operations such as counts, distinct days, streaks, thresholds, sequences, time windows, achievements, story flags, collection ownership, administrator confirmation, and approved evidence. It forbids executable expressions, unknown operators, excessive depth, excessive fan-out, and unbounded windows.

## Consequences

- Existing game integrations must emit from their authoritative settlement path before transactional idempotency finalization.
- Event schemas and source permissions become versioned application contracts with unit and integration tests.
- Duplicate, concurrent, reordered, stale-revision, and payload-conflict tests are mandatory.
- Ephemeral presence, cursor, heartbeat, and cosmetic socket events cannot advance quests.
- Historical events remain immutable; evaluator changes use explicit definition versions or controlled reprojection.

## Rejected alternatives

- A public `POST /quest-events` accepting arbitrary event names was rejected as forgeable.
- Trusting signed browser payloads was rejected because a valid session does not prove the claimed game outcome.
- Polling result tables without event identities was rejected because replay and transaction ordering would be ambiguous.
