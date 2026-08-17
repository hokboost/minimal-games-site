# Quest lifecycle, review, and weekly rotation

- Status: Accepted
- Date: 2026-08-17
- Scope: Quest Engine V2 lifecycle and catalog scheduling

## Assignment deadline and postponement

`due_at` is the authoritative deadline. The bounded expiry worker locks at
most one hundred due assignments with `FOR UPDATE SKIP LOCKED`, then moves
`offered`, `accepted`, `active`, or `returned` assignments to the terminal
`expired` state. The terminal timestamp, immutable assignment event, audit
entry, and assignment revision are committed together. Expiry never creates a
reward settlement or a balance ledger entry. Because it is terminal, an
expired repeatable assignment no longer blocks a later occurrence; the normal
cooldown still starts from its resolution time.

The lifecycle vocabulary is intentionally explicit:

| State | Meaning | Normal exits |
| --- | --- | --- |
| `offered` | Available to this creator, not yet accepted | `accepted`, `declined`, `expired`, `cancelled` |
| `accepted` | Transactional bridge while steps initialize | `active`, `cancelled`, `expired` |
| `active` | At least one step may progress | `submitted`, `completed`, `declined`, `expired`, `cancelled` |
| `submitted` | Transactional bridge after a creator submits a review batch | `under_review`, `returned` |
| `under_review` | Timely evidence is awaiting an authorized reviewer | `active`, `completed`, `returned`, `rejected` |
| `returned` | Creator may revise and resubmit before the deadline | `submitted`, `declined`, `expired`, `cancelled` |
| `completed` | Terminal verified success; at most one settlement | none |
| `declined` | Terminal creator choice with no reward or penalty | none |
| `rejected` | Terminal failed review with no reward | none |
| `cancelled` | Terminal administrative/system cancellation | none |
| `expired` | Terminal deadline transition with no reward | none |

A timely `submitted` or `under_review` assignment is protected from the expiry
worker so an administrator cannot make a creator lose a reward merely by
reviewing late. If review returns the work, the assignment becomes `returned`
and the original (possibly postponed) deadline applies again. Evidence cannot
be submitted after that deadline, and the expiry worker will archive it.

Postponement changes `due_at`; it is not a display-only reminder. Each command
adds a whole number of hours to the current deadline, records
`postponed_hours` and `last_postponed_at`, and writes an immutable event and
audit entry containing both old and new deadlines. The immutable version's
`postpone_policy.maxHours` is a cumulative cap. A stale revision, expired
deadline, ineligible state, or over-cap request fails without changing data.

## Step dependencies and verification plans

Step keys form a bounded directed acyclic graph. Publishing rejects duplicate
keys, missing dependencies, cycles, empty required plans, and verification
plans that runtime cannot execute:

- `automatic` requires only trusted-event steps and `review_policy = none`;
- `manual` requires only reviewed evidence steps and an `owner` or `admin`
  policy;
- `hybrid` requires at least one trusted step, at least one reviewed step, and
  an `owner` or `admin` policy.

The service validates before publish and a PostgreSQL publish trigger is the
backstop for direct lifecycle updates. The forward migration also runs the
same assertion over every already scheduled or active catalog version and
fails closed if historical publication bypassed these rules. Immutable,
unofferable `legacy_import` snapshots are the sole documented exception. On
acceptance, root steps become `active` and dependent steps remain `locked`.
Completing or approving a step unlocks every now-satisfied dependent in the
same transaction. Partial review returns the assignment to `active`;
settlement occurs only after every required step is `completed`.

## Honest review outcomes and authority

Review reads the immutable version policy and an authoritative active admin
row inside the transaction. `owner` may be reviewed only by the configured
creator-director owner and fails closed if that setting is absent. `admin`
requires an active, unlocked administrator other than that owner when an owner
is configured; in a Quest-only deployment without an owner, any authoritative
administrator remains eligible. `none` cannot enter human review. Manual or
hybrid quests containing sensitive evidence require `admin` policy and always
exclude a configured owner.

`approved` completes the submitted step batch. It completes and rewards the
assignment only if all required steps are complete. `returned` is a reversible
request for new evidence and supports resubmission. `rejected` is an honest,
terminal, no-reward state; it is never represented as `returned`. Concurrent
reviewers serialize on the assignment row, so at most one decision and one
settlement can win.

## Rolling weekly boards

Weekly availability is materialized from each creator's explicit IANA
timezone. A stable identity `(timezone, rotation_week_start)` represents the
local Monday that begins a week. Start and end instants are derived in
PostgreSQL with `AT TIME ZONE`, so daylight-saving weeks can be 167 or 169
hours while still beginning and ending at local midnight.

Startup and the hourly maintenance job retain the current week plus a bounded
twelve-week future horizon. A per-timezone transaction advisory lock and the
unique week identity make concurrent workers and restarts idempotent. Past
rows become `finished` or `cancelled`; they remain available for audit. The
original fixed `phase-2-week-*` rows are likewise retained but cancelled once
the rolling scheduler owns that timezone. Board selection is deterministic
from the local week and the 2026-08-17 rotation epoch, so a restart cannot
change the current board.
