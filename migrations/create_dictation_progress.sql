CREATE TABLE IF NOT EXISTS dictation_progress (
    username VARCHAR(100) PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dictation_progress_updated_at ON dictation_progress(updated_at);
