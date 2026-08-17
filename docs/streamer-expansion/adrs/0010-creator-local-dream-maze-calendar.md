# ADR 0010: Creator-local Dream Maze Calendar

Status: accepted for the P2 security remediation.

## Decision

Dream Maze derives its daily identity exclusively from the server clock and the creator profile's
IANA timezone. The game start transaction first locks the creator's `users` row, reads the joined
profile timezone, and resolves one immutable tuple: local calendar key, canonical timezone,
absolute window start, and absolute window end. Browser start commands cannot contain a date,
timezone, or window boundary.

The resolver uses calendar midnights rather than adding 24 hours. A Toronto spring-forward day is
therefore 23 hours and a fall-back day is 25 hours; UTC and Shanghai remain 24 hours. The selected
timezone and both absolute boundaries are persisted beside `daily_key`, while the existing v1 game
state and content-version binding remain unchanged.

Before inserting a run, the same user-lock transaction searches all historical Dream Maze runs,
regardless of terminal status, for an intersecting absolute window. Any overlap returns
`GAME_DAILY_ALREADY_PLAYED`. This closes the timezone-change double-reward path where two different
local date keys describe overlapping real time. The pre-existing unique creator/date index remains
as a second guard for identical local keys.

## Migration and compatibility

`add_streamer_game_daily_calendar.sql` is forward-only. Existing Dream Maze rows are interpreted as
the historical UTC behavior and backfilled with timezone `UTC` and UTC midnight boundaries. New
columns are constrained to be complete only for Dream Maze and the absolute duration is bounded to
cover ordinary and daylight-saving calendar days. Non-maze rows retain null daily calendar fields.

Application rollback is compatible because older code ignores the added columns. Schema rollback
is intentionally not automated; retaining the immutable window history is necessary to prevent a
later timezone change from reopening a previously consumed day.

## Verification

The default suite covers the pure IANA resolver, UTC and Shanghai keys, Toronto 23/25-hour DST days,
client-field rejection, timezone-change overlap, transaction rollback, and serialized duplicate
starts. `npm run test:game-daily-calendar:postgres` creates disposable fresh and upgrade databases,
runs two concurrent starts for one creator, checks persisted boundaries, and verifies legacy UTC
backfill without contacting a gift provider.
