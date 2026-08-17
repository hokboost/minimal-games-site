# Security decision: Quest event windows and occurrence consumption

- Status: Accepted
- Date: 2026-08-17
- Scope: Quest Engine V2 trusted progress

## Decision

Every automatic assignment evaluates its own authoritative time window. An
event is eligible only when its `occurred_at` is on or after `accepted_at`, on
or before `due_at` when a due time exists, strictly before either terminal
`completed_at`/`resolved_at` boundary, and not later than the database clock.
The evaluator never uses a creator-global rolling history as assignment input.

Trusted producers use the server clock. A producer timestamp may be at most
five minutes ahead of the receiving application instance to tolerate bounded
multi-instance clock skew. Anything further ahead is rejected before the
event is inserted. An accepted slightly-ahead event remains durable but is not
eligible until PostgreSQL's `clock_timestamp()` reaches it.

Each eligible event type referenced by an assignment rule is written to the
append-only `quest_v2_assignment_event_consumptions` ledger. The default
immutable version policy is `allow_event_reuse = false`, which prevents the
same trusted event from satisfying a later occurrence of the same quest
version. A future immutable quest version may explicitly opt in; this setting
is frozen with all other published version fields. One event may still satisfy
different quest versions when each version independently declares a matching
rule.

The forward migration conservatively assigns historical events to the earliest
matching occurrence window. It never changes trusted events, assignments,
settlements, balance entries, or historical migrations.

## Transaction and concurrency consequences

Creator row locking serializes trusted ingestion for one subject. Assignment
rows are then locked in stable order. Consumption, step projection, reward
settlement, `BalanceLogger` posting, terminal assignment event, audit details,
trusted-event result, and the caller's idempotent response remain in the same
transaction. A ledger or response-finalization failure rolls all of them back.
An exact source replay returns the stored result; a semantic collision fails
closed.

Weekly-board claims lock the active schedule, board, slot, and version through
assignment creation. Only `lifecycle = 'active'` schedules whose current window
contains the database clock are eligible. Future, expired, scheduled-but-not-
active, retired, or creator-blocked candidates return the same unavailable
response.
