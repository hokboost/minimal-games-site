-- 添加idempotency_key字段到gift_exchanges表
-- 并创建唯一索引以确保幂等性

DO $$
BEGIN
    -- 检查字段是否存在
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'gift_exchanges' 
        AND column_name = 'idempotency_key'
    ) THEN
        ALTER TABLE gift_exchanges ADD COLUMN idempotency_key VARCHAR(100);
        COMMENT ON COLUMN gift_exchanges.idempotency_key IS '幂等性键，用于防止重复请求';
        
        RAISE NOTICE '✅ 已添加idempotency_key字段';
    ELSE
        RAISE NOTICE '⚠️ idempotency_key字段已存在';
    END IF;

    -- 创建唯一索引 (username + idempotency_key)
    -- 注意：我们使用 partial index 防止 null 值冲突 (虽然 idempotency_key 应该即使在旧数据也是 null)
    -- 但是为了业务逻辑，只有当 idempotency_key 不为空时才需要唯一性
    -- 不过通常 idempotency_key 是前端生成的。对于旧数据是 NULL，Postgres 的 UNIQUE 对多个 NULL 是允许的。
    -- 所以直接创建 UNIQUE INDEX 即可。
    
    -- 先检查索引是否存在
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_gift_exchanges_idempotency'
    ) THEN
        CREATE UNIQUE INDEX idx_gift_exchanges_idempotency ON gift_exchanges(username, idempotency_key);
        RAISE NOTICE '✅ 已创建唯一索引 idx_gift_exchanges_idempotency';
    ELSE
        RAISE NOTICE '⚠️ 索引 idx_gift_exchanges_idempotency 已存在';
    END IF;
END
$$;
