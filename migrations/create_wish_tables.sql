-- 创建祈愿结果表
CREATE TABLE IF NOT EXISTS wish_results (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    gift_type VARCHAR(50) DEFAULT 'deepsea_singer',
    cost INTEGER NOT NULL DEFAULT 500,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    reward VARCHAR(100),
    reward_value INTEGER,
    balance_before INTEGER,
    balance_after INTEGER,
    wishes_count INTEGER DEFAULT 1, -- 当前是第几次祈愿
    is_guaranteed BOOLEAN DEFAULT FALSE, -- 是否是保底出货
    game_details JSONB,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    
    FOREIGN KEY (username) REFERENCES users(username)
);

-- 创建祈愿进度表（跟踪每个用户的祈愿进度）
CREATE TABLE IF NOT EXISTS wish_progress (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    gift_type VARCHAR(50) NOT NULL DEFAULT 'deepsea_singer',
    total_wishes INTEGER DEFAULT 0, -- 总祈愿次数
    consecutive_fails INTEGER DEFAULT 0, -- 连续失败次数
    last_success_at TIMESTAMP,
    total_spent INTEGER DEFAULT 0,
    total_rewards_value INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    
    FOREIGN KEY (username) REFERENCES users(username)
);

-- 创建祈愿记录汇总表（按次记录：单次或十连）
CREATE TABLE IF NOT EXISTS wish_sessions (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    gift_type VARCHAR(50) NOT NULL DEFAULT 'deepsea_singer',
    gift_name VARCHAR(100) NOT NULL DEFAULT '深海歌姬',
    batch_count INTEGER NOT NULL DEFAULT 1, -- 本次祈愿次数（1或10）
    total_cost INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    total_reward_value INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    
    FOREIGN KEY (username) REFERENCES users(username)
);

-- 创建祈愿奖励背包表
CREATE TABLE IF NOT EXISTS wish_inventory (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    gift_type VARCHAR(50) NOT NULL,
    gift_name VARCHAR(100) NOT NULL,
    bilibili_gift_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'stored', -- stored/queued/sent/failed/expired
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
    sent_at TIMESTAMP,
    gift_exchange_id INTEGER,
    
    FOREIGN KEY (username) REFERENCES users(username)
);

ALTER TABLE wish_results ADD COLUMN IF NOT EXISTS gift_type VARCHAR(50) DEFAULT 'deepsea_singer';
ALTER TABLE wish_progress ADD COLUMN IF NOT EXISTS gift_type VARCHAR(50) NOT NULL DEFAULT 'deepsea_singer';
ALTER TABLE wish_sessions ADD COLUMN IF NOT EXISTS gift_type VARCHAR(50) NOT NULL DEFAULT 'deepsea_singer';
ALTER TABLE wish_sessions ADD COLUMN IF NOT EXISTS gift_name VARCHAR(100) NOT NULL DEFAULT '深海歌姬';

ALTER TABLE wish_progress DROP CONSTRAINT IF EXISTS wish_progress_username_key;
ALTER TABLE wish_progress ADD CONSTRAINT wish_progress_user_gift_unique UNIQUE (username, gift_type);

-- 创建索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_wish_results_username_created ON wish_results(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wish_results_success ON wish_results(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wish_progress_username ON wish_progress(username);
CREATE INDEX IF NOT EXISTS idx_wish_progress_user_gift ON wish_progress(username, gift_type);
CREATE INDEX IF NOT EXISTS idx_wish_progress_consecutive_fails ON wish_progress(consecutive_fails DESC);
CREATE INDEX IF NOT EXISTS idx_wish_sessions_username_created ON wish_sessions(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wish_sessions_user_gift ON wish_sessions(username, gift_type);
CREATE INDEX IF NOT EXISTS idx_wish_inventory_username_created ON wish_inventory(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wish_inventory_status ON wish_inventory(status, expires_at);

-- 插入默认配置
INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
SELECT username, 'deepsea_singer', 0, 0, 0, 0 
FROM users 
WHERE username NOT IN (SELECT username FROM wish_progress WHERE gift_type = 'deepsea_singer')
ON CONFLICT (username, gift_type) DO NOTHING;
