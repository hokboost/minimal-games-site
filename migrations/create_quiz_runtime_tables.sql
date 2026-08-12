CREATE TABLE IF NOT EXISTS quiz_sessions (
    id TEXT PRIMARY KEY,
    username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'settled', 'expired', 'replaced')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ,
    expected_question_count INTEGER NOT NULL DEFAULT 15,
    question_bank_version CHAR(64),
    question_snapshot JSONB
);

ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS expected_question_count INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS question_bank_version CHAR(64),
    ADD COLUMN IF NOT EXISTS question_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_status_expires
    ON quiz_sessions (username, status, expires_at DESC);

DROP INDEX IF EXISTS idx_quiz_sessions_user_status;

CREATE TABLE IF NOT EXISTS quiz_question_tokens (
    token TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    question_index INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at TIMESTAMPTZ,
    UNIQUE (session_id, question_id)
);

ALTER TABLE quiz_question_tokens
    ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS question_index INTEGER;

WITH ranked AS (
    SELECT token,
           ROW_NUMBER() OVER (
               PARTITION BY session_id ORDER BY created_at, token
           ) - 1 AS derived_index
    FROM quiz_question_tokens
    WHERE question_index IS NULL
)
UPDATE quiz_question_tokens AS issued
SET question_index = ranked.derived_index
FROM ranked
WHERE issued.token = ranked.token;

ALTER TABLE quiz_question_tokens
    ALTER COLUMN question_index SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_tokens_session_question_index
    ON quiz_question_tokens (session_id, question_index);

CREATE INDEX IF NOT EXISTS idx_quiz_tokens_session_consumed
    ON quiz_question_tokens (session_id, consumed_at, created_at);

DROP INDEX IF EXISTS idx_quiz_tokens_session;
