-- 诊断当前数据库锁状态
-- 请在PostgreSQL中运行此脚本

-- 1. 查看所有阻塞的查询
SELECT
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_query,
    blocking_activity.query AS blocking_query,
    blocked_activity.application_name AS blocked_app,
    blocking_activity.application_name AS blocking_app,
    NOW() - blocking_activity.query_start AS blocking_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- 2. 查看所有长时间运行的事务
SELECT
    pid,
    usename,
    application_name,
    state,
    query,
    NOW() - xact_start AS transaction_duration,
    NOW() - query_start AS query_duration,
    wait_event_type,
    wait_event
FROM pg_stat_activity
WHERE state != 'idle'
  AND xact_start IS NOT NULL
  AND NOW() - xact_start > interval '30 seconds'
ORDER BY xact_start;

-- 3. 查看users表上的所有锁
SELECT
    l.pid,
    l.mode,
    l.granted,
    a.usename,
    a.application_name,
    a.state,
    a.query,
    NOW() - a.query_start AS duration
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
JOIN pg_class c ON l.relation = c.oid
WHERE c.relname = 'users'
ORDER BY a.query_start;

-- 4. 查看所有未完成的事务
SELECT
    pid,
    usename,
    application_name,
    state,
    backend_start,
    xact_start,
    NOW() - backend_start AS connection_age,
    NOW() - xact_start AS transaction_age
FROM pg_stat_activity
WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
ORDER BY xact_start NULLS LAST;
