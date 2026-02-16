CREATE TABLE IF NOT EXISTS dictation_allowances (
    username VARCHAR(100) PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dictation_allowances_updated_at ON dictation_allowances(updated_at);
