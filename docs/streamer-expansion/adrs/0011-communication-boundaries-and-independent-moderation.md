# ADR 0011: Authoritative Communication Boundaries and Independent Moderation

Status: accepted for the P1 privacy remediation.

## Decision

All owner-to-creator communication and cooperative game entry points use
`evaluateCommunicationBoundary`. The policy consumes one transactionally consistent snapshot of
the creator account, global live opt-in, typed preferences, quiet hours, preferred interaction
windows, room mute, unresolved reports, and the requested message or game category. Callers may not
reimplement a subset of these rules.

Hard boundaries (inactive or locked account, global opt-out, `all_messages`, item/game block,
room mute, or an unresolved pair report) reject durable and realtime interaction. Quiet hours and
being outside a preferred live window keep durable inbox/item delivery but suppress realtime fanout,
presence, invitations, and cooperative actions. Declining or blocking never subtracts relationship
XP and never changes reward eligibility.

Quiet and preferred windows are interpreted in the creator profile's IANA timezone. An overnight
window matches its starting weekday before midnight and the previous weekday after midnight. The
same rule is evaluated through `Intl.DateTimeFormat`, including Toronto and Shanghai DST behavior.
If no enabled preferred windows exist realtime is allowed by default; if enabled windows exist but
all are async-only, realtime is unavailable. Disabled rows have no effect.

## Privacy and moderation

`profile_visibility=owner` exposes sensitive profile fields only to the creator and the exact
configured owner. Other administrators receive a database-redacted projection. Every sensitive
read is recorded in append-only `creator_sensitive_read_audit`; account authorization is rechecked
under a row lock in the same transaction as the read and audit.

Reports against the configured owner for harassment, privacy, or unsafe-task reasons immediately
freeze the room and cooperative runs. The owner may see only the frozen/report status, never report
evidence, and cannot resolve the report. Resolution requires a different active, unlocked
administrator and is enforced in both application code and a database trigger. Resolution alone
does not restore interaction: the creator must explicitly reconsent afterward.

## Concurrency and delivery

Multi-account participant, moderator, Reward, and Quest authority locks use the ascending
`users.id` order and `FOR NO KEY UPDATE` mode defined by ADR 0007. This prevents both cross-module
inversions and audit-FK cycles without weakening account-state revocation. Boundary-changing writes
and owner actions still serialize because every user row is locked before any room, run, assignment,
or appeal: an action either commits before withdrawal and is followed by the same-transaction freeze,
or waits and observes the new denial. Realtime recipients are
reloaded from PostgreSQL at fanout time, including on another application instance. Quiet delivery
is never dropped because its item, inbox entry, event, command response, and audit commit before
fanout is considered.

## Migration and rollback

`add_streamer_security_communication_privacy.sql` is forward-only. It adds the append-only sensitive
read audit and independent-moderator constraints without rewriting historical migrations. Startup
and `/ready` fail closed when Live Interaction is enabled but this migration or relation is absent.
Application rollback disables Live Interaction and cooperative games while retaining immutable
audits and report evidence; database rollback is a forward fix.

## Verification

The default suite covers UTC/Toronto/Shanghai windows, DST folds, overnight previous-weekday logic,
async-only and disabled-only windows, per-room decisions, account revocation races, owner redaction,
missing-owner configuration, independent moderation, explicit reconsent, and reward-neutral
declines. `npm run test:live-privacy:postgres` runs the transaction, trigger, rollback, lock-race, and
durable-quiet assertions against disposable PostgreSQL. `npm run test:live-privacy:browser` uses
isolated owner and creator Chromium contexts to prove UI opt-in/open/send, Socket delivery, REST
catch-up, quiet realtime suppression with durable reload, and immediate hard-boundary revocation.
