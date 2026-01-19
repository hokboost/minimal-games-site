-- 创建礼物兑换记录表
CREATE TABLE IF NOT EXISTS gift_exchanges (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    gift_type VARCHAR(50) NOT NULL,
    gift_name VARCHAR(100) NOT NULL,
    cost INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    bilibili_room_id VARCHAR(50),
    bilibili_uid VARCHAR(50),
    delivery_status VARCHAR(20) DEFAULT 'pending'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_gift_exchanges_username ON gift_exchanges(username);
CREATE INDEX IF NOT EXISTS idx_gift_exchanges_created_at ON gift_exchanges(created_at);
CREATE INDEX IF NOT EXISTS idx_gift_exchanges_status ON gift_exchanges(status);
