-- 紧急：杀掉阻塞的会话
-- ⚠️ 请先运行 diagnose_locks.sql 确认阻塞的PID，然后替换下面的 <BLOCKING_PID>

-- 步骤1：查看要杀掉的会话信息（确认）
SELECT pid, usename, application_name, state, query, NOW() - xact_start AS age
FROM pg_stat_activity
WHERE pid = <BLOCKING_PID>;

-- 步骤2：终止会话（替换<BLOCKING_PID>为实际PID）
-- SELECT pg_terminate_backend(<BLOCKING_PID>);

-- 步骤3：如果terminate不起作用，使用强制取消
-- SELECT pg_cancel_backend(<BLOCKING_PID>);

-- 一次性杀掉所有长时间运行的事务（超过5分钟）
-- ⚠️ 谨慎使用！
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
  AND NOW() - xact_start > interval '5 minutes';

-- 杀掉所有阻塞users表的会话
SELECT pg_terminate_backend(l.pid)
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
JOIN pg_class c ON l.relation = c.oid
WHERE c.relname = 'users'
  AND NOT l.granted
  AND a.state = 'idle in transaction'
  AND NOW() - a.xact_start > interval '1 minute';
