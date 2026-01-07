-- 添加 balance 字段到 users 表
-- 如果字段不存在则添加，默认值为 100
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'balance'
    ) THEN
        ALTER TABLE users ADD COLUMN balance NUMERIC(10,2) DEFAULT 100.00;
        UPDATE users SET balance = 100.00 WHERE balance IS NULL;
        
        RAISE NOTICE 'Balance field added successfully with default value 100.00';
    ELSE
        RAISE NOTICE 'Balance field already exists';
    END IF;
END
$$;