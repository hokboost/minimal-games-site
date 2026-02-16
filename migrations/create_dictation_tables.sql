CREATE TABLE IF NOT EXISTS dictation_submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(100),
    word_id TEXT NOT NULL,
    word TEXT,
    pronunciation TEXT,
    definition TEXT,
    user_input TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_dictation_submissions_username ON dictation_submissions(username);
CREATE INDEX IF NOT EXISTS idx_dictation_submissions_created_at ON dictation_submissions(created_at);
