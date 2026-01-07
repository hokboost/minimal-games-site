const pool = require('./db');

class SessionManager {
    constructor() {
        this.activeSessions = new Map(); // 内存中活跃会话缓存
        this.cleanupInterval = 30 * 60 * 1000; // 30分钟清理一次过期会话
        this.startCleanup();
    }

    // 启动定期清理过期会话
    startCleanup() {
        setInterval(async () => {
            await this.cleanExpiredSessions();
        }, this.cleanupInterval);
    }

    // 创建新会话并踢出其他设备
    async createSingleDeviceSession(username, sessionId, ip, userAgent, notifyCallback = null) {
        try {
            // 特殊处理：hokboost管理员允许多设备登录
            if (username !== 'hokboost') {
                // 1. 先踢出该用户的所有其他会话，并发送通知
                await this.terminateUserOtherSessions(username, sessionId, notifyCallback);
            } else {
                console.log(`管理员 ${username} 登录 - 保持多设备会话`);
            }

            // 2. 记录新的活跃会话
            await pool.query(`
                INSERT INTO active_sessions (
                    username, session_id, ip_address, user_agent, 
                    created_at, last_activity, is_active
                ) VALUES ($1, $2, $3, $4, NOW(), NOW(), true)
                ON CONFLICT (session_id) DO UPDATE SET
                username = $1, ip_address = $3, user_agent = $4,
                last_activity = NOW(), is_active = true
            `, [username, sessionId, ip, userAgent]);

            // 3. 更新内存缓存
            this.activeSessions.set(sessionId, {
                username,
                ip,
                userAgent,
                lastActivity: Date.now(),
                createdAt: Date.now()
            });

            console.log(`用户 ${username} 新设备登录，已踢出其他设备`);
            return true;

        } catch (error) {
            console.error('创建单设备会话失败:', error);
            return false;
        }
    }

    // 踢出用户的其他所有会话
    async terminateUserOtherSessions(username, currentSessionId, notifyCallback = null) {
        try {
            // 1. 从数据库获取用户的所有其他活跃会话
            const otherSessions = await pool.query(`
                SELECT session_id, ip_address, user_agent, created_at 
                FROM active_sessions 
                WHERE username = $1 AND session_id != $2 AND is_active = true
            `, [username, currentSessionId]);

            if (otherSessions.rows.length > 0) {
                // 2. 发送被踢出通知（如果提供了回调函数）
                if (notifyCallback) {
                    const deviceInfo = otherSessions.rows.map(session => ({
                        ip: session.ip_address,
                        userAgent: session.user_agent,
                        loginTime: session.created_at
                    }));

                    notifyCallback(username, {
                        type: 'device_logout',
                        title: '账号安全提醒',
                        message: '您的账号已在新设备登录，其他设备已自动退出',
                        details: {
                            newLogin: true,
                            kickedDevices: deviceInfo.length,
                            timestamp: new Date().toISOString()
                        },
                        level: 'warning'
                    });
                }

                // 3. 标记数据库中的其他会话为非活跃
                await pool.query(`
                    UPDATE active_sessions 
                    SET is_active = false, terminated_at = NOW(), 
                        termination_reason = 'new_device_login'
                    WHERE username = $1 AND session_id != $2 AND is_active = true
                `, [username, currentSessionId]);

                // 4. 从内存缓存中移除其他会话
                for (const session of otherSessions.rows) {
                    this.activeSessions.delete(session.session_id);
                }

                // 5. 删除其他会话的session数据
                const sessionIds = otherSessions.rows.map(row => `'${row.session_id}'`).join(',');
                await pool.query(`DELETE FROM user_sessions WHERE sid IN (${sessionIds})`);
            }

            return otherSessions.rows.length;

        } catch (error) {
            console.error('踢出其他会话失败:', error);
            return 0;
        }
    }

    // 验证会话是否有效
    async validateSession(sessionId) {
        try {
            // 1. 先检查内存缓存
            if (this.activeSessions.has(sessionId)) {
                const session = this.activeSessions.get(sessionId);
                // 更新最后活动时间
                session.lastActivity = Date.now();
                this.activeSessions.set(sessionId, session);
                return true;
            }

            // 2. 检查数据库
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

                // 更新数据库最后活动时间
                await pool.query(`
                    UPDATE active_sessions 
                    SET last_activity = NOW() 
                    WHERE session_id = $1
                `, [sessionId]);

                return true;
            }

            return false;

        } catch (error) {
            console.error('验证会话失败:', error);
            return false;
        }
    }

    // 终止指定会话
    async terminateSession(sessionId, reason = 'manual_logout') {
        try {
            // 1. 更新数据库
            await pool.query(`
                UPDATE active_sessions 
                SET is_active = false, terminated_at = NOW(), termination_reason = $2
                WHERE session_id = $1
            `, [sessionId, reason]);

            // 2. 删除session数据
            await pool.query('DELETE FROM user_sessions WHERE sid = $1', [sessionId]);

            // 3. 从内存缓存移除
            this.activeSessions.delete(sessionId);

            return true;

        } catch (error) {
            console.error('终止会话失败:', error);
            return false;
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

            // 3. 清理对应的session存储
            for (const expiredSession of result.rows) {
                await pool.query(
                    'DELETE FROM user_sessions WHERE sid = $1', 
                    [expiredSession.session_id]
                );
            }

            if (result.rows.length > 0) {
                console.log(`清理了 ${result.rows.length} 个过期会话`);
            }

        } catch (error) {
            console.error('清理过期会话失败:', error);
        }
    }

    // 强制踢出指定用户的所有会话
    async forceLogoutUser(username, reason = 'admin_force_logout') {
        try {
            // 保护hokboost管理员账号不被强制注销
            if (username === 'hokboost') {
                console.log(`⚠️ 拒绝强制注销管理员账号: ${username}`);
                return 0;
            }

            // 1. 获取用户所有活跃会话
            const sessions = await this.getUserActiveSessions(username);

            // 2. 终止所有会话
            for (const session of sessions) {
                await this.terminateSession(session.session_id, reason);
            }

            console.log(`强制注销用户 ${username} 的 ${sessions.length} 个会话`);
            return sessions.length;

        } catch (error) {
            console.error('强制注销用户失败:', error);
            return 0;
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