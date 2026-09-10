BEGIN;
CREATE TABLE doorbell_attempts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    remaining INTEGER NOT NULL CHECK (remaining BETWEEN 0 AND 100000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO doorbell_attempts(user_id,remaining)
SELECT id, CASE WHEN EXISTS(SELECT 1 FROM doorbell_runs WHERE user_id=users.id AND status IN ('playing','revealed')) THEN 0 ELSE 1 END
FROM users WHERE id=147 ON CONFLICT DO NOTHING;
CREATE TABLE doorbell_attempt_logs (
    command_id UUID PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    request_hash CHAR(64) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount <> 0),
    remaining_before INTEGER NOT NULL CHECK (remaining_before BETWEEN 0 AND 100000),
    remaining_after INTEGER NOT NULL CHECK (remaining_after BETWEEN 0 AND 100000),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 200),
    run_id UUID REFERENCES doorbell_runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (remaining_after = remaining_before + amount)
);
CREATE INDEX doorbell_attempt_history ON doorbell_attempt_logs(target_user_id,created_at DESC);
COMMIT;
