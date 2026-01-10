// 紧急修复脚本：清理数据库锁和重置连接池
const { Pool } = require('pg');

async function emergencyFix() {
    console.log('🚨 开始紧急修复...');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        statement_timeout: 15000,
        query_timeout: 15000
    });

    try {
        // 1. 查看当前阻塞情况
        console.log('\n1️⃣ 检查阻塞的查询...');
        const blockingQuery = `
            SELECT
                blocked_locks.pid AS blocked_pid,
                blocking_locks.pid AS blocking_pid,
                blocked_activity.usename AS blocked_user,
                blocking_activity.usename AS blocking_user,
                NOW() - blocking_activity.query_start AS blocking_duration,
                blocking_activity.state AS blocking_state,
                blocking_activity.query AS blocking_query
            FROM pg_catalog.pg_locks blocked_locks
            JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
            JOIN pg_catalog.pg_locks blocking_locks
                ON blocking_locks.locktype = blocked_locks.locktype
                AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
                AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
                AND blocking_locks.pid != blocked_locks.pid
            JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
            WHERE NOT blocked_locks.granted
            LIMIT 10;
        `;

        const blockingResult = await pool.query(blockingQuery);
        if (blockingResult.rows.length > 0) {
            console.log('⚠️ 发现阻塞:', blockingResult.rows);
        } else {
            console.log('✅ 未发现阻塞');
        }

        // 2. 查看长时间运行的事务
        console.log('\n2️⃣ 检查长时间运行的事务...');
        const longTxQuery = `
            SELECT
                pid,
                usename,
                application_name,
                state,
                NOW() - xact_start AS transaction_age,
                LEFT(query, 100) as query_preview
            FROM pg_stat_activity
            WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
              AND xact_start IS NOT NULL
            ORDER BY xact_start;
        `;

        const longTxResult = await pool.query(longTxQuery);
        if (longTxResult.rows.length > 0) {
            console.log('⚠️ 发现未完成事务:', longTxResult.rows);

            // 3. 杀掉这些会话
            console.log('\n3️⃣ 终止阻塞的会话...');
            for (const row of longTxResult.rows) {
                try {
                    await pool.query('SELECT pg_terminate_backend($1)', [row.pid]);
                    console.log(`✅ 已终止 PID ${row.pid} (${row.state})`);
                } catch (err) {
                    console.log(`❌ 无法终止 PID ${row.pid}:`, err.message);
                }
            }
        } else {
            console.log('✅ 未发现长时间运行的事务');
        }

        // 4. 检查users表的锁
        console.log('\n4️⃣ 检查users表的锁...');
        const usersLocksQuery = `
            SELECT
                l.pid,
                l.mode,
                l.granted,
                a.state,
                a.usename,
                NOW() - a.query_start AS duration
            FROM pg_locks l
            JOIN pg_stat_activity a ON l.pid = a.pid
            JOIN pg_class c ON l.relation = c.oid
            WHERE c.relname = 'users'
            ORDER BY l.granted, a.query_start;
        `;

        const usersLocksResult = await pool.query(usersLocksQuery);
        console.log(`users表锁数量: ${usersLocksResult.rows.length}`);
        if (usersLocksResult.rows.length > 0) {
            console.log('users表锁详情:', usersLocksResult.rows);
        }

        console.log('\n✅ 紧急修复完成！');
        console.log('📝 建议：');
        console.log('1. 重启应用服务器');
        console.log('2. 修复 routes/wish.js:256 的事务泄漏bug');
        console.log('3. 监控连接池状态');

    } catch (error) {
        console.error('❌ 紧急修复失败:', error);
    } finally {
        await pool.end();
    }
}

emergencyFix();
