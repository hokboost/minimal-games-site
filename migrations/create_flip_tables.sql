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
