CREATE TABLE IF NOT EXISTS doudizhu_games (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    phase TEXT NOT NULL,
    state JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    rules_version TEXT NOT NULL,
    human_role TEXT,
    outcome TEXT,
    score_delta INTEGER,
    base_score INTEGER NOT NULL DEFAULT 1,
    multiplier INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,

    CONSTRAINT doudizhu_games_status_check
        CHECK (status IN ('active', 'finished', 'abandoned')),
    CONSTRAINT doudizhu_games_phase_check
        CHECK (phase IN ('bidding', 'playing', 'finished')),
    CONSTRAINT doudizhu_games_state_check
        CHECK (
            jsonb_typeof(state) = 'object'
            AND octet_length(state::text) <= 524288
        ),
    CONSTRAINT doudizhu_games_state_metadata_check
        CHECK (
            (state ->> 'phase') IS NOT DISTINCT FROM phase
            AND (state ->> 'revision') IS NOT DISTINCT FROM revision::text
            AND (state ->> 'rulesVersion') IS NOT DISTINCT FROM rules_version
        ),
    CONSTRAINT doudizhu_games_revision_check
        CHECK (revision >= 0 AND revision < 2147483647),
    CONSTRAINT doudizhu_games_rules_version_check
        CHECK (char_length(BTRIM(rules_version)) BETWEEN 1 AND 64),
    CONSTRAINT doudizhu_games_human_role_check
        CHECK (human_role IS NULL OR human_role IN ('landlord', 'farmer')),
    CONSTRAINT doudizhu_games_outcome_check
        CHECK (outcome IS NULL OR outcome IN ('win', 'loss')),
    CONSTRAINT doudizhu_games_score_check
        CHECK (base_score > 0 AND multiplier > 0),
    CONSTRAINT doudizhu_games_timestamps_check
        CHECK (updated_at >= created_at AND (finished_at IS NULL OR finished_at >= created_at)),
    CONSTRAINT doudizhu_games_status_phase_check
        CHECK (
            (status = 'active' AND phase IN ('bidding', 'playing'))
            OR (status = 'finished' AND phase = 'finished')
            OR (status = 'abandoned' AND phase IN ('bidding', 'playing'))
        ),
    CONSTRAINT doudizhu_games_terminal_state_check
        CHECK (
            (status = 'active'
                AND outcome IS NULL
                AND score_delta IS NULL
                AND finished_at IS NULL)
            OR (status = 'abandoned'
                AND outcome IS NULL
                AND score_delta IS NULL
                AND finished_at IS NOT NULL)
            OR (status = 'finished'
                AND human_role IS NOT NULL
                AND outcome IS NOT NULL
                AND score_delta IS NOT NULL
                AND finished_at IS NOT NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doudizhu_games_one_active_per_user
    ON doudizhu_games (username)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_doudizhu_games_user_history
    ON doudizhu_games (username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doudizhu_games_recent_finished
    ON doudizhu_games (finished_at DESC)
    WHERE status = 'finished';
