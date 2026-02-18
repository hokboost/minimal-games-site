CREATE TABLE IF NOT EXISTS blindbox_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    tier_key VARCHAR(50) NOT NULL,
    tier_name VARCHAR(100) NOT NULL,
    box_count INTEGER NOT NULL,
    total_cost INTEGER NOT NULL,
    total_reward_value INTEGER NOT NULL,
    rewards JSONB NOT NULL,
    batch_id VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blindbox_logs_username_created
    ON blindbox_logs(username, created_at DESC);
