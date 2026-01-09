-- 决斗挑战记录表
CREATE TABLE IF NOT EXISTS duel_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    gift_type VARCHAR(50) NOT NULL,
    reward INTEGER NOT NULL DEFAULT 0,
    power INTEGER NOT NULL,
    cost INTEGER NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),

    FOREIGN KEY (username) REFERENCES users(username)
);

CREATE INDEX IF NOT EXISTS idx_duel_logs_username_created ON duel_logs(username, created_at DESC);
