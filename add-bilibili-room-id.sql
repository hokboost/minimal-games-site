-- 为users表添加bilibili_room_id字段用于绑定B站直播间
ALTER TABLE users ADD COLUMN IF NOT EXISTS bilibili_room_id VARCHAR(20);

-- 为特定用户设置房间号示例
-- UPDATE users SET bilibili_room_id = '3929738' WHERE username = '尧顺宇';

-- 添加索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_bilibili_room_id ON users(bilibili_room_id);