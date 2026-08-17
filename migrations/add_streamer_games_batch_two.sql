BEGIN;

ALTER TABLE streamer_game_runs ADD COLUMN daily_key DATE;
ALTER TABLE streamer_game_runs ADD CONSTRAINT streamer_game_runs_daily_key_scope CHECK (
    (game_id='dream-maze' AND daily_key IS NOT NULL)
    OR (game_id<>'dream-maze' AND daily_key IS NULL)
);
CREATE UNIQUE INDEX streamer_game_runs_daily_maze_idx
    ON streamer_game_runs(creator_user_id,game_id,daily_key)
    WHERE game_id='dream-maze' AND daily_key IS NOT NULL;

CREATE TABLE streamer_game_trusted_events (
    id BIGSERIAL PRIMARY KEY,
    creator_user_id BIGINT NOT NULL REFERENCES users(id),
    source_type VARCHAR(32) NOT NULL CHECK (source_type IN('admin_confirmed_live','server_observed_live','reviewed_evidence')),
    source_event_id VARCHAR(160) NOT NULL CHECK (source_event_id ~ '^[A-Za-z0-9:_.-]{8,160}$'),
    event_key VARCHAR(80) NOT NULL CHECK (event_key ~ '^[a-z][a-z0-9_.-]{2,79}$'),
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::TEXT)<=2048),
    run_id UUID REFERENCES streamer_game_runs(id),
    response_body JSONB NOT NULL CHECK (jsonb_typeof(response_body)='object' AND octet_length(response_body::TEXT)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_type,source_event_id)
);

CREATE TRIGGER streamer_game_trusted_events_append_only
    BEFORE UPDATE OR DELETE ON streamer_game_trusted_events
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();

COMMIT;
