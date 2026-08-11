const pool = require('./db');

class SessionManager {
    constructor() {
        this.activeSessions = new Map(); // 内存中活跃会话缓存
        this.cleanupInterval = 30 * 60 * 1000; // 30分钟清理一次过期会话
        this.startCleanup();
    }

    // 启动定期清理过期会话
    startCleanup() {
        const interval = setInterval(async () => {
            await this.cleanExpiredSessions();
        }, this.cleanupInterval);
        interval.unref?.();
    }

    // 创建新会话并踢出其他设备
    async createSingleDeviceSession(
        username,
        sessionId,
        ip,
        userAgent,
        notifyCallback = null,
        expectedPasswordHash = null
    ) {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`session:${username}`]);

            const userResult = await client.query(
                `SELECT id, username, authorized, is_admin, password_hash
                 FROM users
                 WHERE username = $1
                 FOR UPDATE`,
                [username]
            );
            if (userResult.rows.length === 0) {
                throw new Error('Cannot create a session for a missing user');
            }
            const currentUser = userResult.rows[0];
            if (expectedPasswordHash && currentUser.password_hash !== expectedPasswordHash) {
                await client.query('ROLLBACK');
                return { success: false, reason: 'credentials_changed' };
            }

            const allowsMultipleSessions = currentUser.is_admin === true;
            let otherSessions = [];
            if (!allowsMultipleSessions) {
                const otherResult = await client.query(`
                    SELECT session_id, ip_address, user_agent, created_at
                    FROM active_sessions
                    WHERE username = $1 AND session_id != $2 AND is_active = true
                    FOR UPDATE
                `, [username, sessionId]);
                otherSessions = otherResult.rows;

                if (otherSessions.length > 0) {
                    await client.query(`
                        UPDATE active_sessions
                        SET is_active = false, terminated_at = NOW(),
                            termination_reason = 'new_device_login'
                        WHERE username = $1 AND session_id != $2 AND is_active = true
                    `, [username, sessionId]);
                    await client.query(
                        'DELETE FROM user_sessions WHERE sid = ANY($1::text[])',
                        [otherSessions.map((session) => session.session_id)]
                    );
                }
            }

            await client.query(`
                INSERT INTO active_sessions (
                    username, session_id, ip_address, user_agent, 
                    created_at, last_activity, is_active
                ) VALUES ($1, $2, $3, $4, NOW(), NOW(), true)
                ON CONFLICT (session_id) DO UPDATE SET
                username = $1, ip_address = $3, user_agent = $4,
                created_at = NOW(), last_activity = NOW(), is_active = true,
                terminated_at = NULL, termination_reason = NULL
            `, [username, sessionId, ip, userAgent]);
            await client.query('COMMIT');

            for (const session of otherSessions) {
                this.activeSessions.delete(session.session_id);
            }
            this.activeSessions.set(sessionId, {
                username,
                ip,
                userAgent,
                lastActivity: Date.now(),
                createdAt: Date.now()
            });

            if (otherSessions.length > 0 && notifyCallback) {
                notifyCallback(username, {
                    type: 'device_logout',
                    title: '账号安全提醒',
                    message: '您的账号已在新设备登录，其他设备已自动退出',
                    details: {
                        newLogin: true,
                        kickedDevices: otherSessions.length,
                        timestamp: new Date().toISOString()
                    },
                    level: 'warning'
                }, sessionId);
            }
            return {
                success: true,
                terminatedSessionIds: otherSessions.map((session) => session.session_id),
                user: {
                    id: currentUser.id,
                    username: currentUser.username,
                    authorized: currentUser.authorized === true,
                    is_admin: currentUser.is_admin === true
                }
            };

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('创建单设备会话失败:', error);
            return { success: false, reason: 'session_error' };
        } finally {
            client?.release();
        }
    }

    // 踢出用户的其他所有会话
    async terminateUserOtherSessions(username, currentSessionId, notifyCallback = null) {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`session:${username}`]);
            const otherSessions = await client.query(`
                SELECT session_id, ip_address, user_agent, created_at 
                FROM active_sessions 
                WHERE username = $1 AND session_id != $2 AND is_active = true
                FOR UPDATE
            `, [username, currentSessionId]);

            if (otherSessions.rows.length > 0) {
                await client.query(`
                    UPDATE active_sessions 
                    SET is_active = false, terminated_at = NOW(), 
                        termination_reason = 'new_device_login'
                    WHERE username = $1 AND session_id != $2 AND is_active = true
                `, [username, currentSessionId]);
                await client.query(
                    'DELETE FROM user_sessions WHERE sid = ANY($1::text[])',
                    [otherSessions.rows.map((session) => session.session_id)]
                );
            }
            await client.query('COMMIT');

            for (const session of otherSessions.rows) {
                this.activeSessions.delete(session.session_id);
            }
            if (otherSessions.rows.length > 0 && notifyCallback) {
                notifyCallback(username, {
                    type: 'device_logout',
                    title: '账号安全提醒',
                    message: '您的账号已在新设备登录，其他设备已自动退出',
                    details: {
                        newLogin: true,
                        kickedDevices: otherSessions.rows.length,
                        timestamp: new Date().toISOString()
                    },
                    level: 'warning'
                }, currentSessionId);
            }

            return otherSessions.rows.length;

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('踢出其他会话失败:', error);
            return 0;
        } finally {
            client?.release();
        }
    }

    // 验证会话是否有效
    async validateSession(sessionId) {
        try {
            const result = await pool.query(`
                SELECT username, ip_address, user_agent, created_at 
                FROM active_sessions 
                WHERE session_id = $1 AND is_active = true
            `, [sessionId]);

            if (result.rows.length > 0) {
                const session = result.rows[0];
                // 添加到内存缓存
                this.activeSessions.set(sessionId, {
                    username: session.username,
                    ip: session.ip_address,
                    userAgent: session.user_agent,
                    lastActivity: Date.now(),
                    createdAt: new Date(session.created_at).getTime()
                });

                await pool.query(`
                    UPDATE active_sessions 
                    SET last_activity = NOW() 
                    WHERE session_id = $1
                `, [sessionId]);

                return true;
            }

            this.activeSessions.delete(sessionId);
            return false;

        } catch (error) {
            console.error('验证会话失败:', error);
            return false;
        }
    }

    // 终止指定会话
    async terminateSession(sessionId, reason = 'manual_logout') {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(`
                UPDATE active_sessions 
                SET is_active = false, terminated_at = NOW(), termination_reason = $2
                WHERE session_id = $1
            `, [sessionId, reason]);

            await client.query('DELETE FROM user_sessions WHERE sid = $1', [sessionId]);
            await client.query('COMMIT');

            this.activeSessions.delete(sessionId);

            return true;

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('终止会话失败:', error);
            return false;
        } finally {
            client?.release();
        }
    }

    // 获取用户当前活跃会话
    async getUserActiveSessions(username) {
        try {
            const result = await pool.query(`
                SELECT session_id, ip_address, user_agent, created_at, last_activity
                FROM active_sessions 
                WHERE username = $1 AND is_active = true
                ORDER BY last_activity DESC
            `, [username]);

            return result.rows;

        } catch (error) {
            console.error('获取用户会话失败:', error);
            return [];
        }
    }

    // 获取会话统计信息
    async getSessionStats() {
        try {
            const stats = await pool.query(`
                SELECT 
                    COUNT(CASE WHEN is_active = true THEN 1 END) as active_sessions,
                    COUNT(CASE WHEN is_active = false THEN 1 END) as terminated_sessions,
                    COUNT(DISTINCT username) as unique_users,
                    COUNT(DISTINCT ip_address) as unique_ips
                FROM active_sessions 
                WHERE created_at > NOW() - INTERVAL '24 hours'
            `);

            const memoryStats = {
                cached_sessions: this.activeSessions.size,
                memory_usage: JSON.stringify([...this.activeSessions]).length
            };

            return {
                ...stats.rows[0],
                ...memoryStats
            };

        } catch (error) {
            console.error('获取会话统计失败:', error);
            return null;
        }
    }

    // 清理过期会话
    async cleanExpiredSessions() {
        try {
            // 1. 清理数据库中的过期会话 (超过24小时未活动)
            const result = await pool.query(`
                UPDATE active_sessions 
                SET is_active = false, terminated_at = NOW(), 
                    termination_reason = 'expired'
                WHERE is_active = true 
                AND last_activity < NOW() - INTERVAL '24 hours'
                RETURNING session_id
            `);

            // 2. 清理内存缓存中的过期会话
            const now = Date.now();
            const expiredThreshold = 24 * 60 * 60 * 1000; // 24小时

            for (const [sessionId, session] of this.activeSessions) {
                if (now - session.lastActivity > expiredThreshold) {
                    this.activeSessions.delete(sessionId);
                }
            }

            // 3. 批量清理对应的session存储
            const expiredSessionIds = result.rows.map((session) => session.session_id);
            if (expiredSessionIds.length > 0) {
                await pool.query(
                    'DELETE FROM user_sessions WHERE sid = ANY($1::text[])',
                    [expiredSessionIds]
                );
            }

            if (result.rows.length > 0) {
                console.log(`清理了 ${result.rows.length} 个过期会话`);
            }

            await pool.query(`
                DELETE FROM active_sessions
                WHERE id IN (
                    SELECT id
                    FROM active_sessions
                    WHERE is_active = false
                      AND terminated_at < NOW() - INTERVAL '30 days'
                    ORDER BY terminated_at
                    LIMIT 5000
                )
            `);

        } catch (error) {
            console.error('清理过期会话失败:', error);
        }
    }

    // 强制踢出指定用户的所有会话
    async forceLogoutUser(username, reason = 'admin_force_logout') {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`session:${username}`]);
            const userResult = await client.query(
                'SELECT is_admin FROM users WHERE username = $1 FOR UPDATE',
                [username]
            );
            if (userResult.rows[0]?.is_admin === true) {
                await client.query('ROLLBACK');
                console.log(`拒绝强制注销管理员账号: ${username}`);
                return 0;
            }

            const result = await client.query(`
                SELECT session_id
                FROM active_sessions
                WHERE username = $1 AND is_active = true
                FOR UPDATE
            `, [username]);
            const sessionIds = result.rows.map((session) => session.session_id);
            await client.query(`
                UPDATE active_sessions
                SET is_active = false, terminated_at = NOW(), termination_reason = $2
                WHERE username = $1 AND is_active = true
            `, [username, reason]);
            if (sessionIds.length > 0) {
                await client.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [sessionIds]);
            }
            await client.query('COMMIT');

            for (const sessionId of sessionIds) this.activeSessions.delete(sessionId);

            console.log(`强制注销用户 ${username} 的 ${sessionIds.length} 个会话`);
            return sessionIds.length;

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('强制注销用户失败:', error);
            return 0;
        } finally {
            client?.release();
        }
    }

    // 检查IP是否有多个活跃会话
    async checkIPMultipleSessions(ip) {
        try {
            const result = await pool.query(`
                SELECT COUNT(DISTINCT username) as user_count,
                       COUNT(*) as session_count,
                       array_agg(DISTINCT username) as usernames
                FROM active_sessions 
                WHERE ip_address = $1 AND is_active = true
            `, [ip]);

            return result.rows[0];

        } catch (error) {
            console.error('检查IP多会话失败:', error);
            return null;
        }
    }
}

module.exports = new SessionManager();
