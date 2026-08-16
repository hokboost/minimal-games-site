# ADR 0001: Separate redeemable currency from progression rewards

- Status: Accepted
- Date: 2026-08-16
- Phase: 0

## Context

The application already treats `users.balance` as value-bearing. Existing game, task, and gift flows protect that balance with integer arithmetic, row locking, `BalanceLogger`, idempotency, exposure limits, and transactionally coupled business state. Streamer World also needs XP, relationship progress, season reputation, story keys, crafting materials, cosmetics, clues, achievements, collection items, and memories. Those assets support progression but must not silently become a second redeemable currency.

Combining both classes of reward would blur the product's value boundary. It would also make browser-visible progression fields potential inputs to gift redemption and complicate financial reconciliation.

## Decision

`users.balance` remains the only directly redeemable point balance.

Every point credit or debit must:

- use safe integers and the repository's configured monetary bounds;
- run through `BalanceLogger` inside the same database transaction as the unique business settlement;
- carry a stable, source-specific reason and correlation identifier;
- have an idempotency or uniqueness boundary that prevents duplicate settlement;
- satisfy all applicable global, feature, season, definition, and per-user budgets.

Non-redeemable progression is stored in separate domain tables and projections. It must have explicit asset types, immutable source events, bounded deltas, stable dedupe keys, and server-owned award policies. Relationship XP cannot decrease when a streamer declines, postpones, mutes, or opts out. Spending, gift redemption, and gift receipt are excluded from relationship-level formulas.

There is no generic browser-controlled conversion rate. A future conversion from a progression asset to points is allowed only as a versioned server catalog action with an explicit budget, unique settlement, audit trail, and `BalanceLogger` transaction.

Reward APIs and user interfaces must label the asset class and explain the source, amount, time, and resulting state. Code should use distinct value objects and service methods so points cannot be confused with XP or materials.

## Consequences

- Quest, story, game, achievement, season, and owner-grant services may award both kinds of assets, but must settle them through separate repositories and policies.
- Non-monetary projection repair cannot change `users.balance`.
- Point settlement tests must cover duplicate delivery, concurrent completion, rollback on ledger failure, and lost-response replay.
- New asset types require registry and migration changes rather than arbitrary JSON keys.
- Product copy must never imply that relationship progress or consent choices have cash or gift value.

## Rejected alternatives

- A single universal wallet was rejected because it weakens the existing financial boundary.
- Storing all progression in creator-profile JSON was rejected because it lacks typed constraints, queryable provenance, and safe concurrency.
- Crediting points directly from client-reported completion was rejected because the browser is not authoritative.
