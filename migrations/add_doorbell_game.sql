BEGIN;

CREATE TABLE doorbell_runs (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    song_ids JSONB NOT NULL CHECK (jsonb_typeof(song_ids) = 'array' AND jsonb_array_length(song_ids) = 8),
    status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','revealed','failed','won','cashed_out')),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed BETWEEN 0 AND 8),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    original_door INTEGER CHECK (original_door BETWEEN 1 AND 8),
    hint_door INTEGER CHECK (hint_door BETWEEN 1 AND 8),
    hint JSONB,
    results JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(results) = 'array'),
    settled_amount BIGINT NOT NULL DEFAULT 0 CHECK (settled_amount BETWEEN 0 AND 30000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    CHECK ((status IN ('playing','revealed') AND settled_at IS NULL AND settled_amount = 0)
        OR (status IN ('failed','won','cashed_out') AND settled_at IS NOT NULL)),
    CHECK ((status = 'won' AND completed = 8) OR (status <> 'won' AND completed < 8)),
    CHECK (status <> 'revealed' OR completed > 0),
    CHECK ((hint_door IS NULL AND hint IS NULL) OR (hint_door IS NOT NULL AND hint IS NOT NULL))
);
CREATE UNIQUE INDEX doorbell_one_active_run ON doorbell_runs(user_id) WHERE status IN ('playing','revealed');
CREATE INDEX doorbell_user_history ON doorbell_runs(user_id, created_at DESC);

-- Response receipts and the balance ledger commit in the same business transaction.
CREATE TABLE doorbell_commands (
    user_id INTEGER NOT NULL REFERENCES users(id),
    command_id UUID NOT NULL,
    request_hash CHAR(64) NOT NULL,
    run_id UUID NOT NULL REFERENCES doorbell_runs(id),
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, command_id)
);

COMMIT;
