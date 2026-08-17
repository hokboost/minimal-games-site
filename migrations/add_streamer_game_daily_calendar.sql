BEGIN;

ALTER TABLE streamer_game_runs
    ADD COLUMN daily_timezone VARCHAR(100),
    ADD COLUMN daily_window_start TIMESTAMPTZ,
    ADD COLUMN daily_window_end TIMESTAMPTZ;

UPDATE streamer_game_runs
SET daily_timezone='UTC',
    daily_window_start=daily_key::timestamp AT TIME ZONE 'UTC',
    daily_window_end=(daily_key + 1)::timestamp AT TIME ZONE 'UTC'
WHERE game_id='dream-maze' AND daily_key IS NOT NULL;

ALTER TABLE streamer_game_runs
    ADD CONSTRAINT streamer_game_runs_daily_calendar_scope CHECK (
        (game_id='dream-maze'
            AND daily_key IS NOT NULL
            AND daily_timezone IS NOT NULL
            AND daily_window_start IS NOT NULL
            AND daily_window_end IS NOT NULL
            AND daily_timezone ~ '^[A-Za-z0-9_+./-]{1,100}$'
            AND daily_window_end > daily_window_start
            AND daily_window_end - daily_window_start BETWEEN INTERVAL '20 hours' AND INTERVAL '28 hours')
        OR
        (game_id<>'dream-maze'
            AND daily_timezone IS NULL
            AND daily_window_start IS NULL
            AND daily_window_end IS NULL)
    );

CREATE INDEX streamer_game_runs_daily_maze_window_idx
    ON streamer_game_runs(creator_user_id,daily_window_start,daily_window_end,id)
    WHERE game_id='dream-maze';

COMMIT;
