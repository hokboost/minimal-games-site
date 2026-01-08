-- 为 slot_results 表添加详细字段
ALTER TABLE slot_results 
ADD COLUMN IF NOT EXISTS bet_amount INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS payout_amount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_before INTEGER,
ADD COLUMN IF NOT EXISTS balance_after INTEGER,
ADD COLUMN IF NOT EXISTS multiplier DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS game_details JSONB;

-- 为 scratch_results 表添加详细字段
ALTER TABLE scratch_results 
ADD COLUMN IF NOT EXISTS tier_cost INTEGER,
ADD COLUMN IF NOT EXISTS tier_config JSONB,
ADD COLUMN IF NOT EXISTS balance_before INTEGER,
ADD COLUMN IF NOT EXISTS balance_after INTEGER,
ADD COLUMN IF NOT EXISTS matches_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS game_details JSONB;

-- 创建游戏记录查询索引
CREATE INDEX IF NOT EXISTS idx_slot_results_username_created ON slot_results(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scratch_results_username_created ON scratch_results(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_username_created ON submissions(username, submitted_at DESC);