# ADR 0006: Bridge all provider rewards through the existing gift state machine

- Status: Accepted
- Date: 2026-08-16
- Phase: 0

## Context

The repository's gift delivery path already provides server-owned prices and mappings, balance and exposure checks, `gift_exchanges`, `wish_inventory`, durable outbox work, worker leases, provider locks, receipts, uncertain-state reconciliation, room-change serialization, and conservative refund rules. This is the strongest safety boundary in the application.

Quest, story, season, achievement, catalog, and owner-director features will create new reasons to award or redeem provider-backed gifts. Calling a sender from any of those services would bypass the existing irreversible-send boundary and risk double sends, invalid refunds, or delivery to a changed room.

## Decision

No Streamer World domain, route, story effect, quest reward, game engine, or director command may import or invoke Bilibili provider send code.

All provider-backed rewards enter one of two existing-compatible paths:

- an audited inventory grant that becomes a `wish_inventory`-compatible owned item and is later scheduled by the user or approved workflow; or
- a server-authorized reward order that reserves or deducts value and creates or reuses a `gift_exchanges` record plus the established delivery outbox command.

A dedicated gift-redemption bridge translates a versioned internal catalog item into an allowlisted existing gift type. It validates server-side price, provider mapping, catalog version, unlock, room binding, stock, cooldown, per-user and global exposure, source provenance, and high-value approval. Provider gift IDs and credentials never enter browser responses.

Order creation, inventory reservation or point settlement, source metadata, gift exchange creation, and idempotency finalization share the existing transaction boundary appropriate to the source. Stable bridge keys prevent the same quest, story conclusion, achievement, season tier, or owner grant from creating multiple provider orders.

After worker execution begins, timeouts and missing responses remain uncertain. The bridge cannot auto-resend, silently refund, create a replacement exchange, or reinterpret uncertainty as failure. Only the existing receipt and reconciliation mechanisms may resolve that state. Room changes and account deactivation continue to serialize against unresolved work under current rules.

Real external sends remain disabled during implementation and tests. Mocks and fault injection must cover pre-send failure, started work, lost responses, uncertain results, receipt confirmation, stale leases, partial delivery, room changes, and deactivation.

## Consequences

- New reward tables are orchestration and presentation layers, not a second provider queue.
- Existing provider state remains authoritative and is projected into catalog order history.
- Source labels and correlation IDs must survive through inventory, exchange, outbox, delivery events, and reconciliation.
- High-risk bridge changes require regression tests against existing gift invariants and kill switches.
- Operational reconciliation remains available even if Streamer World feature flags are disabled.

## Rejected alternatives

- A quest-specific or story-specific gift worker was rejected because it duplicates irreversible delivery logic.
- Immediate sends from the director console were rejected because operator intent is not provider confirmation.
- Automatic refund or retry after timeout was rejected because the provider may already have executed the gift.
