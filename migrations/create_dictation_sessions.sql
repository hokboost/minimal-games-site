CREATE TABLE IF NOT EXISTS dictation_sessions (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) REFERENCES users(username) ON DELETE CASCADE,
    set_id INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    result VARCHAR(20) NOT NULL DEFAULT 'in_progress'
);

CREATE INDEX IF NOT EXISTS idx_dictation_sessions_username ON dictation_sessions(username);
CREATE INDEX IF NOT EXISTS idx_dictation_sessions_started_at ON dictation_sessions(started_at);
