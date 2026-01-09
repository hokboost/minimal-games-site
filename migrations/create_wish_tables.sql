-- 创建祈愿结果表
CREATE TABLE IF NOT EXISTS wish_results (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    cost INTEGER NOT NULL DEFAULT 500,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    reward VARCHAR(100),
    reward_value INTEGER,
    balance_before INTEGER,
    balance_after INTEGER,
    wishes_count INTEGER DEFAULT 1, -- 当前是第几次祈愿
    is_guaranteed BOOLEAN DEFAULT FALSE, -- 是否是保底出货
    game_details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (username) REFERENCES users(username)
);

-- 创建祈愿进度表（跟踪每个用户的祈愿进度）
CREATE TABLE IF NOT EXISTS wish_progress (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    total_wishes INTEGER DEFAULT 0, -- 总祈愿次数
    consecutive_fails INTEGER DEFAULT 0, -- 连续失败次数
    last_success_at TIMESTAMP,
    total_spent INTEGER DEFAULT 0,
    total_rewards_value INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (username) REFERENCES users(username)
);

-- 创建祈愿记录汇总表（按次记录：单次或十连）
CREATE TABLE IF NOT EXISTS wish_sessions (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    batch_count INTEGER NOT NULL DEFAULT 1, -- 本次祈愿次数（1或10）
    total_cost INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    total_reward_value INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (username) REFERENCES users(username)
);

-- 创建索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_wish_results_username_created ON wish_results(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wish_results_success ON wish_results(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wish_progress_username ON wish_progress(username);
CREATE INDEX IF NOT EXISTS idx_wish_progress_consecutive_fails ON wish_progress(consecutive_fails DESC);
CREATE INDEX IF NOT EXISTS idx_wish_sessions_username_created ON wish_sessions(username, created_at DESC);

-- 插入默认配置
INSERT INTO wish_progress (username, total_wishes, consecutive_fails, total_spent, total_rewards_value)
SELECT username, 0, 0, 0, 0 
FROM users 
WHERE username NOT IN (SELECT username FROM wish_progress)
ON CONFLICT (username) DO NOTHING;
