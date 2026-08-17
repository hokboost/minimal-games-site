# Story checkpoint recovery and progression scopes

## Decision

Checkpoint recovery restores the complete run-state snapshot. Flags, axes,
relationships, clues, inventory, routes, visits, waits, committed choices,
completed episodes, run-local memories, run-local messages, and run-local
unlocks all return to their checkpoint values. Recovery never merges values
from the abandoned branch.

Durable memories and inbox messages remain account history in their normalized
tables. They are presentation records, not authorization facts, and must never
by themselves make a Quest, points grant, reward order, inventory grant, or
provider delivery eligible.

An unlock effect is branch-local by default. It becomes an account entitlement
only when all of the following are true:

1. the immutable published-content progression registry contains the exact
   content hash, node, unlock type, unlock key, and milestone binding;
2. the same transaction inserted the matching first-clear record, or a future
   explicitly registered season-completion milestone exists;
3. the persisted unlock records its scope, provenance, registry binding hash,
   and economic-eligibility decision.

The published bindings are also seeded into the immutable
`story_progression_bindings` table. An entitlement row must reference the exact
binding and match its content version, unlock identity, milestone, scope, and
economic decision; a merely non-null or invented hash is rejected.

Reward-catalog visibility additionally requires `economic_eligible = TRUE`.
The economic registry is a reviewed explicit allowlist. Replay runs, ordinary
branch effects, recovered branches, legacy rows, memories, and inbox messages
cannot satisfy it.

## Migration policy

The change is forward-only. Historical unlock rows cannot be assigned a safe
branch lineage after the fact, so they are conservatively marked
`branch_local`, `legacy_unverified`, and non-economic. Published provenance is
immutable after insertion. No historical migration is edited.

## Transaction boundary

The story event, run revision, normalized projection, first-clear row, unlock
provenance, Quest/achievement hooks, audit row, reward intent, and idempotent
response remain in the existing database transaction. A failure at any point
rolls all of them back. Recovery never calls a provider boundary.
