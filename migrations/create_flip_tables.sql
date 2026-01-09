-- 翻卡牌游戏状态表
CREATE TABLE IF NOT EXISTS flip_states (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    board JSONB NOT NULL DEFAULT '[]',
    flipped JSONB NOT NULL DEFAULT '[]',
    good_count INTEGER NOT NULL DEFAULT 0,
    bad_count INTEGER NOT NULL DEFAULT 0,
    ended BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),

    FOREIGN KEY (username) REFERENCES users(username)
);

CREATE INDEX IF NOT EXISTS idx_flip_states_username ON flip_states(username);

-- 翻卡牌记录表
CREATE TABLE IF NOT EXISTS flip_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    cost INTEGER NOT NULL DEFAULT 0,
    reward INTEGER NOT NULL DEFAULT 0,
    card_index INTEGER,
    card_type VARCHAR(10),
    good_count INTEGER NOT NULL DEFAULT 0,
    bad_count INTEGER NOT NULL DEFAULT 0,
    ended BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),

    FOREIGN KEY (username) REFERENCES users(username)
);

CREATE INDEX IF NOT EXISTS idx_flip_logs_username_created ON flip_logs(username, created_at DESC);
