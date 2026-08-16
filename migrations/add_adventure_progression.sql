CREATE TABLE IF NOT EXISTS adventure_runs (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    revision INTEGER NOT NULL DEFAULT 0,
    state JSONB NOT NULL,
    reward_eligible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    abandoned_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    CONSTRAINT adventure_runs_chapter_check
        CHECK (chapter_id ~ '^[a-z][a-z0-9-]{2,48}$'),
    CONSTRAINT adventure_runs_version_check
        CHECK (length(rules_version) BETWEEN 3 AND 80),
    CONSTRAINT adventure_runs_status_check
        CHECK (status IN ('active', 'completed', 'abandoned', 'expired')),
    CONSTRAINT adventure_runs_revision_check
        CHECK (revision >= 0),
    CONSTRAINT adventure_runs_state_check
        CHECK (
            jsonb_typeof(state) = 'object'
            AND octet_length(state::text) <= 262144
            AND state ? 'revision'
            AND state ? 'phase'
            AND state ? 'rulesVersion'
            AND (state->>'revision') ~ '^[0-9]+$'
            AND (state->>'revision')::INTEGER = revision
            AND state->>'rulesVersion' = rules_version
            AND (status <> 'active' OR state->>'phase' = 'active')
            AND (status <> 'completed' OR state->>'phase' = 'completed')
        ),
    CONSTRAINT adventure_runs_terminal_time_check
        CHECK (
            (status = 'completed' AND completed_at IS NOT NULL)
            OR (status = 'abandoned' AND abandoned_at IS NOT NULL)
            OR (status IN ('active', 'expired'))
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS adventure_runs_one_active_per_user
    ON adventure_runs (username)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS adventure_runs_user_recent
    ON adventure_runs (username, created_at DESC);

CREATE INDEX IF NOT EXISTS adventure_runs_expiry
    ON adventure_runs (expires_at)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS adventure_completions (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL UNIQUE REFERENCES adventure_runs(id) ON DELETE RESTRICT,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    reward INTEGER NOT NULL,
    insight INTEGER NOT NULL,
    mistakes INTEGER NOT NULL,
    rewinds INTEGER NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT adventure_completions_once_per_content
        UNIQUE (username, chapter_id, rules_version),
    CONSTRAINT adventure_completions_values_check
        CHECK (reward BETWEEN 0 AND 10000 AND insight >= 0 AND mistakes >= 0 AND rewinds >= 0)
);

CREATE INDEX IF NOT EXISTS adventure_completions_leaderboard
    ON adventure_completions (chapter_id, insight DESC, mistakes ASC, completed_at ASC);

CREATE TABLE IF NOT EXISTS adventure_events (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES adventure_runs(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    stage_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT adventure_events_revision_check CHECK (revision >= 1),
    CONSTRAINT adventure_events_text_check CHECK (
        length(stage_id) BETWEEN 2 AND 80
        AND length(action_type) BETWEEN 2 AND 32
        AND length(outcome) BETWEEN 2 AND 32
    ),
    CONSTRAINT adventure_events_revision_unique UNIQUE (run_id, revision)
);

CREATE INDEX IF NOT EXISTS adventure_events_run_history
    ON adventure_events (run_id, revision DESC);
