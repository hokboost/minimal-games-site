# ADR 0004: Use immutable validated story graphs with version-bound runs

- Status: Accepted
- Date: 2026-08-16
- Phase: 0

## Context

The existing Adventure campaign is a valuable linear puzzle progression system and must remain compatible. Streamer World needs a separate narrative engine with persistent flags, relationships, clues, inventories, owner interventions, meaningful branches, replay, and multiple endings. Editing live content in place could strand active runs, change the meaning of past choices, duplicate first-clear rewards, or expose future conditions to clients.

## Decision

The new `/story` system uses immutable compiled content versions. Campaigns contain seasons, episodes, scenes, and stable graph-node IDs. Publishing creates a new content version; a published version is never mutated. Every story run binds to its campaign and content version for its lifetime. New runs use the currently active compatible version, while old runs remain resumable on their bound version or follow an explicit tested migration map.

Content is declarative data. Conditions, effects, node types, puzzles, quest hooks, game hooks, memories, and rewards reference allowlisted registries. Content cannot include executable functions, `eval`, dynamic code, SQL, arbitrary HTML, or client-defined effects.

Compilation and startup validation reject duplicate IDs, missing Chinese or English content, broken references, unreachable mandatory nodes, accidental dead ends, unbudgeted cycles, impossible conditions, unknown effects, excessive state, invalid reward policies, and repeated or mechanically templated prose.

Committed actions use owner-bound compare-and-swap revisions or database row locks. The event log records immutable choices and effects; bounded projections store the current node, flags, counters, relationships, clues, inventory, memories, routes, checkpoint, and revision. A preview never writes effects. A committed choice applies its registered effects and event record atomically.

The public projection includes only information available at the current node. It excludes condition trees, hidden effects, correct answers, future-node content, secret route membership, unrevealed clues, and server reward metadata.

First-clear and route rewards have unique settlement keys bound to user, campaign/content version, episode or conclusion, and reward policy. Replay mode may expose previously seen content but cannot duplicate value rewards. The existing `/adventure` completion identity remains separate; bridges can unlock content but cannot settle the same reward twice.

## Consequences

- Content fixes after publication require a new version and, when necessary, an explicit migration or retirement decision.
- Tests need deterministic clocks/randomness, whole-graph reachability, bounded-loop checks, hidden-state snapshots, concurrent action CAS, checkpoint recovery, and replay settlement coverage.
- Authored content IDs become durable database and analytics references.
- Old story versions require an archival and operational retention policy.

## Rejected alternatives

- Extending the current twelve-stage Adventure compiler into a universal story engine was rejected because it would endanger legacy behavior and preserve its structural limits.
- Mutable JSON content loaded into active runs was rejected because historical choices would not be reproducible.
- Sending the full graph to the browser was rejected because it leaks conditions, answers, and future routes.
