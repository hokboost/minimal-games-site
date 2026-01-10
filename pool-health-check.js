// 连接池健康检查和监控
const pool = require('./db');

// 定期检查连接池健康状态
function startPoolHealthCheck() {
    setInterval(async () => {
        try {
            // 检查连接池状态
            console.log('🔍 连接池状态:', {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
            });

            // 检查是否有"idle in transaction"的连接
            const client = await pool.connect();
            try {
                const result = await client.query(`
                    SELECT COUNT(*) as count
                    FROM pg_stat_activity
                    WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
                      AND application_name = 'minimal-games-site'
                `);

                const idleInTxCount = parseInt(result.rows[0].count);
                if (idleInTxCount > 0) {
                    console.error('⚠️ 警告: 发现', idleInTxCount, '个未完成的事务!');

                    // 获取详情
                    const details = await client.query(`
                        SELECT pid, state, NOW() - xact_start AS age, LEFT(query, 100) as query
                        FROM pg_stat_activity
                        WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
                          AND application_name = 'minimal-games-site'
                    `);

                    console.error('未完成事务详情:', details.rows);

                    // 如果超过5分钟，自动杀掉
                    for (const row of details.rows) {
                        const ageMs = row.age ? parseFloat(row.age.replace(/[^\d.]/g, '')) : 0;
                        if (ageMs > 300000) { // 5分钟
                            try {
                                await client.query('SELECT pg_terminate_backend($1)', [row.pid]);
                                console.log('🔪 自动终止超时事务 PID:', row.pid);
                            } catch (err) {
                                console.error('无法终止 PID', row.pid, ':', err.message);
                            }
                        }
                    }
                }
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('❌ 连接池健康检查失败:', error.message);
        }
    }, 60000); // 每分钟检查一次
}

module.exports = { startPoolHealthCheck };
