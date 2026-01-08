-- 添加quantity字段到gift_exchanges表
-- 如果字段已存在则跳过，避免重复执行错误

DO $$
BEGIN
    -- 检查字段是否存在，如果不存在则添加
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'gift_exchanges' 
        AND column_name = 'quantity'
    ) THEN
        ALTER TABLE gift_exchanges ADD COLUMN quantity INTEGER DEFAULT 1;
        COMMENT ON COLUMN gift_exchanges.quantity IS '礼物数量，默认为1';
        
        -- 更新现有记录的quantity字段为1
        UPDATE gift_exchanges SET quantity = 1 WHERE quantity IS NULL;
        
        RAISE NOTICE '✅ 已添加quantity字段到gift_exchanges表';
    ELSE
        RAISE NOTICE '⚠️ quantity字段已存在，跳过添加';
    END IF;
END
$$;