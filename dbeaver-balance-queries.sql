-- DBeaver SQL查询命令 - 余额日志查看

-- 1. 查看所有余额日志（最新50条）
SELECT 
    id,
    username,
    operation_type,
    amount,
    balance_before,
    balance_after,
    description,
    created_at,
    ip_address
FROM balance_logs 
ORDER BY created_at DESC 
LIMIT 50;

-- 2. 查看特定用户的余额记录
SELECT 
    id,
    operation_type,
    amount,
    balance_before,
    balance_after,
    description,
    created_at
FROM balance_logs 
WHERE username = 'hokboost'  -- 替换为你想查的用户名
ORDER BY created_at DESC;

-- 3. 按操作类型统计
SELECT 
    operation_type,
    COUNT(*) as 操作次数,
    SUM(amount) as 总金额变动,
    AVG(amount) as 平均变动
FROM balance_logs 
GROUP BY operation_type 
ORDER BY COUNT(*) DESC;

-- 4. 查看今日余额变动
SELECT 
    username,
    operation_type,
    amount,
    balance_before,
    balance_after,
    description,
    created_at
FROM balance_logs 
WHERE DATE(created_at) = CURRENT_DATE 
ORDER BY created_at DESC;

-- 5. 查看余额异常变动（大额变动）
SELECT 
    username,
    operation_type,
    amount,
    balance_before,
    balance_after,
    description,
    created_at
FROM balance_logs 
WHERE ABS(amount) > 100  -- 变动超过100电币
ORDER BY created_at DESC;

-- 6. 用户余额流水明细（带累计）
SELECT 
    username,
    operation_type,
    amount,
    balance_before,
    balance_after,
    (balance_after - balance_before) as 实际变动,
    description,
    created_at
FROM balance_logs 
WHERE username = 'hokboost'  -- 替换为你想查的用户名
ORDER BY created_at ASC;

-- 7. 查看游戏数据详情（JSON字段）
SELECT 
    username,
    operation_type,
    amount,
    description,
    game_data,
    created_at
FROM balance_logs 
WHERE game_data IS NOT NULL
ORDER BY created_at DESC 
LIMIT 20;

-- 8. 每日余额变动统计
SELECT 
    DATE(created_at) as 日期,
    COUNT(*) as 操作次数,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as 收入,
    SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as 支出,
    SUM(amount) as 净变动
FROM balance_logs 
GROUP BY DATE(created_at)
ORDER BY 日期 DESC;

-- 9. 查看特定时间段的记录
SELECT 
    username,
    operation_type,
    amount,
    balance_before,
    balance_after,
    description,
    created_at
FROM balance_logs 
WHERE created_at >= '2026-01-07 00:00:00'  -- 替换为你想查的开始时间
  AND created_at <= '2026-01-07 23:59:59'  -- 替换为你想查的结束时间
ORDER BY created_at DESC;

-- 10. 检查余额一致性（查找可能的数据问题）
SELECT 
    bl.*,
    u.balance as 当前用户余额
FROM balance_logs bl
JOIN users u ON bl.username = u.username
WHERE bl.id = (
    SELECT MAX(id) 
    FROM balance_logs bl2 
    WHERE bl2.username = bl.username
)
AND bl.balance_after != u.balance;  -- 找出最后记录与用户当前余额不一致的情况