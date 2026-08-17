# ADR 0009: Reward visibility and source-side grant intents

- Status: accepted
- Date: 2026-08-17

## Context

Reward catalog identity is sensitive when visibility depends on a story unlock, achievement, season, configured owner, or lifecycle state. Previously the catalog, wishlist, redemption, and owner-grant paths applied different checks. Trusted Quest, Story, game, achievement, and season events also had no production bridge into the reward state machine.

Quiet hours are a delivery boundary, not a data-retention request. Dropping the durable reward message during quiet time made the grant undiscoverable after reload.

## Decision

1. `evaluateRewardAccess` is the single visibility and eligibility policy. Hidden, unauthorized, out-of-window, and retired catalog identities return the same `REWARD_ITEM_NOT_FOUND` 404. Capacity, cooldown, and pending-order failures are exposed only after visibility succeeds.
2. Actual immutable Story and achievement unlock records are queried. No client claim or guessed version ID creates visibility.
3. Every permitted owner grant writes a durable inbox record in the source transaction. Quiet hours and time outside a preferred interaction window suppress only the post-commit realtime notification. Global opt-out, communication/item blocks, room mute, unresolved reports, and unavailable accounts reject the grant before storage.
4. Approved source events append immutable `reward_grant_intents` in their own transaction. A leased dispatcher settles an intent through the existing reward order, budget, entitlement, and inventory boundaries. Source identity and payload are hash-bound; a semantic collision aborts the source transaction.
5. Intent dispatch never invokes a provider sender. Provider-backed rewards stop at the existing available-entitlement boundary and still require the creator's explicit claim before entering the existing backpack/outbox workflow.
6. Completed and dead-letter intents are immutable. Every claim, recovery, retry, completion, and terminal failure has append-only history.
7. Reward-order event allocation locks the parent `reward_orders` row before reading `MAX(sequence)+1`. The repository owns this invariant instead of relying on an undocumented caller lock. A missing parent fails before allocation with `REWARD_ORDER_NOT_FOUND`.

## Transaction and retry semantics

The source event and intent insertion use the same PostgreSQL client. Therefore a source rollback removes the intent, while a committed source is recoverable even if the application exits before dispatch.

The dispatcher claims with `FOR UPDATE SKIP LOCKED` and a bounded lease. Order creation, budget reservation, entitlement creation, intent completion, and audit occur in one settlement transaction. A crash before commit leaves no partial settlement; an expired lease is reclaimed. A retry that finds the unique source order returns the same order and completes the intent. Repeated failures become visible dead letters.

The parent-order lock also serializes event append with order state transitions. Concurrent event writers receive one gap-free order-local sequence. A rolled-back append consumes no durable sequence, so the next committed append safely reuses it. This relies on the existing parent row and requires no schema migration.

## Operations and rollback

`STREAMER_REWARD_CATALOG_ENABLED=false` is the immediate kill switch. It closes reward routes and stops the dispatcher without deleting intents or changing existing orders, balances, backpack items, gift exchanges, or delivery jobs. Re-enable only after schema readiness confirms the catalog, budgets, and intent tables. Configured-owner grants additionally remain unavailable unless the exact owner account is active, unlocked, authorized, and an administrator.

The migration is forward-only. Operational rollback disables the flag and deploys the prior application. The append-only tables remain for later reconciliation; they must not be truncated, rewritten, or backfilled into provider sends.

## Consequences

Reward visibility no longer acts as an ID oracle. Quiet grants survive reload. Source integrations are durable and exactly-once at the order/budget/entitlement boundary, while external delivery remains governed by the pre-existing gift workflow.
