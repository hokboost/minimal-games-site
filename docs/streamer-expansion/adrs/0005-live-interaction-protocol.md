# ADR 0005: Extend authenticated Socket.IO with a persistent replay protocol

- Status: Accepted
- Date: 2026-08-16
- Phase: 0

## Context

The application already authenticates Socket.IO connections with live PostgreSQL sessions, maintains per-user rooms, revalidates sessions, and fans events across instances through a PostgreSQL event bus. It does not yet support durable owner–streamer invitations, acknowledgements, ordered replay, co-op revisions, or REST catch-up. One-shot socket notifications are insufficient for progress, reward, story, moderation, and invitation state.

## Decision

Streamer World extends the existing authenticated Socket.IO boundary. It does not add a second public real-time server.

Persistent messages use a versioned allowlisted envelope with interaction ID, server-assigned event ID, monotonically increasing per-interaction sequence, registered event type, actor, subject user, server timestamp, bounded payload, correlation ID, and state revision where relevant. Client mutations use a separate command ID and expected revision.

The server authenticates and authorizes every command, checks current consent and membership, validates its exact payload schema, applies rate and flood limits, and deduplicates by command ID. A state-affecting event is committed before fan-out. Duplicate commands replay the durable result without applying the transition twice. Reusing an ID with different canonical input fails closed.

Clients acknowledge the highest contiguous persisted sequence they have applied. Acknowledgements are monotonic and idempotent. On connect or reconnect, clients request events after their last acknowledged sequence. REST endpoints provide the authoritative paginated state and missed-event feed when Socket.IO delivery is unavailable or a gap is detected.

Cross-instance delivery reuses the PostgreSQL event bus. Socket delivery is an optimization and never the source of truth. Revoked or inactive sessions are disconnected using the existing revalidation mechanism.

Presence is consent-aware and minimally scoped. Quiet hours, mute state, availability, and interaction opt-in are enforced on the server. Ephemeral heartbeat, cursor, and hover messages may be transient, but they cannot affect quests, story, rewards, moderation, or durable co-op state.

Client event names are fixed by the protocol registry. Payload size, array size, text length, frequency, and revision drift are bounded. Errors expose neither private state nor server internals.

## Consequences

- Interaction tables need per-room sequence uniqueness, command dedupe, acknowledgement state, membership, and retention indexes.
- Co-op engines must separate private member projections from shared public state.
- Tests must cover reconnect gaps, duplicate commands, duplicate acknowledgements, out-of-order delivery, stale revisions, cross-instance fan-out, flood control, revoked sessions, leave/cancel flows, and REST fallback.
- Director actions remain typed service calls with consent checks and success/failure audit.

## Rejected alternatives

- Fire-and-forget socket events were rejected because disconnects would lose product state.
- A separate unauthenticated WebSocket stack was rejected because it would duplicate and weaken session controls.
- Treating the event bus as durable storage was rejected because fan-out does not replace an authoritative event log.
