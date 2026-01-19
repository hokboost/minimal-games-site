-- 添加updated_at字段到gift_exchanges表
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'gift_exchanges'
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE gift_exchanges ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        UPDATE gift_exchanges SET updated_at = created_at WHERE updated_at IS NULL;
        RAISE NOTICE '✅ 已添加updated_at字段到gift_exchanges表';
    ELSE
        RAISE NOTICE '⚠️ updated_at字段已存在';
    END IF;
END $$;
