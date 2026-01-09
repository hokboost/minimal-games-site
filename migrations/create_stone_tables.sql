-- 合石头游戏状态表
CREATE TABLE IF NOT EXISTS stone_states (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    slots JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),

    FOREIGN KEY (username) REFERENCES users(username)
);

CREATE INDEX IF NOT EXISTS idx_stone_states_username ON stone_states(username);

-- 合石头操作记录表
CREATE TABLE IF NOT EXISTS stone_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    cost INTEGER NOT NULL DEFAULT 0,
    reward INTEGER NOT NULL DEFAULT 0,
    slot_index INTEGER,
    before_slots JSONB NOT NULL DEFAULT '[]',
    after_slots JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),

    FOREIGN KEY (username) REFERENCES users(username)
);

CREATE INDEX IF NOT EXISTS idx_stone_logs_username_created ON stone_logs(username, created_at DESC);
