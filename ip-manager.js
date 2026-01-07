const pool = require('./db');

class IPManager {
    constructor() {
        this.riskCache = new Map(); // IP风险缓存
        this.locationCache = new Map(); // IP地理位置缓存
        this.cleanupInterval = 60 * 60 * 1000; // 1小时清理一次缓存
        this.startCleanup();
    }

    // 启动定期清理缓存
    startCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [ip, data] of this.riskCache) {
                if (now - data.timestamp > this.cleanupInterval) {
                    this.riskCache.delete(ip);
                }
            }
            for (const [ip, data] of this.locationCache) {
                if (now - data.timestamp > this.cleanupInterval * 24) { // 地理位置缓存24小时
                    this.locationCache.delete(ip);
                }
            }
        }, this.cleanupInterval);
    }

    // 记录IP活动
    async recordIPActivity(ip, username, userAgent, action = 'access') {
        try {
            await pool.query(`
                INSERT INTO ip_activities (ip_address, username, user_agent, action, created_at)
                VALUES ($1, $2, $3, $4, NOW())
            `, [ip, username, userAgent, action]);
        } catch (error) {
            console.error('记录IP活动失败:', error);
        }
    }

    // 获取IP风险评分
    async getIPRiskScore(ip, username = null) {
        // 管理员hokboost永远安全 - 特殊保护
        if (username === 'hokboost') {
            return { 
                score: 0, 
                reasons: ['管理员账号 - 永久白名单保护'], 
                level: 'SAFE' 
            };
        }

        // 先检查缓存
        if (this.riskCache.has(ip)) {
            const cached = this.riskCache.get(ip);
            if (Date.now() - cached.timestamp < 10 * 60 * 1000) { // 10分钟缓存
                return cached.score;
            }
        }

        let riskScore = 0;
        let reasons = [];

        try {
            // 检查IP是否在黑名单
            const blacklistCheck = await pool.query(
                'SELECT reason FROM ip_blacklist WHERE ip_address = $1 AND is_active = true',
                [ip]
            );
            if (blacklistCheck.rows.length > 0) {
                riskScore = 100; // 最高风险
                reasons.push(`黑名单IP: ${blacklistCheck.rows[0].reason}`);
                this.cacheRiskScore(ip, riskScore, reasons);
                return { score: riskScore, reasons, level: 'CRITICAL' };
            }

            // 检查IP是否在白名单
            const whitelistCheck = await pool.query(
                'SELECT * FROM ip_whitelist WHERE ip_address = $1 AND is_active = true',
                [ip]
            );
            if (whitelistCheck.rows.length > 0) {
                riskScore = 0; // 无风险
                reasons.push('可信IP白名单');
                this.cacheRiskScore(ip, riskScore, reasons);
                return { score: riskScore, reasons, level: 'SAFE' };
            }

            // 计算短期活动频率 (过去1小时)
            const recentActivity = await pool.query(`
                SELECT COUNT(*) as count, COUNT(DISTINCT username) as unique_users
                FROM ip_activities 
                WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '1 hour'
            `, [ip]);

            const hourlyCount = parseInt(recentActivity.rows[0].count);
            const uniqueUsers = parseInt(recentActivity.rows[0].unique_users);

            if (hourlyCount > 100) {
                riskScore += 30;
                reasons.push(`异常高频访问: ${hourlyCount}次/小时`);
            } else if (hourlyCount > 50) {
                riskScore += 15;
                reasons.push(`高频访问: ${hourlyCount}次/小时`);
            }

            if (uniqueUsers > 5) {
                riskScore += 25;
                reasons.push(`多账号登录: ${uniqueUsers}个账号/小时`);
            }

            // 计算失败登录尝试 (过去30分钟)
            const failedAttempts = await pool.query(`
                SELECT COUNT(*) as count
                FROM ip_activities 
                WHERE ip_address = $1 
                AND action = 'login_failed' 
                AND created_at > NOW() - INTERVAL '30 minutes'
            `, [ip]);

            const failCount = parseInt(failedAttempts.rows[0].count);
            if (failCount > 10) {
                riskScore += 40;
                reasons.push(`异常登录失败: ${failCount}次`);
            } else if (failCount > 5) {
                riskScore += 20;
                reasons.push(`多次登录失败: ${failCount}次`);
            }

            // 检查地理位置异常 (如果有用户名)
            if (username) {
                const locationRisk = await this.checkLocationRisk(ip, username);
                riskScore += locationRisk.score;
                if (locationRisk.reason) {
                    reasons.push(locationRisk.reason);
                }
            }

            // 计算风险等级
            let level;
            if (riskScore >= 80) level = 'CRITICAL';
            else if (riskScore >= 60) level = 'HIGH';
            else if (riskScore >= 40) level = 'MEDIUM';
            else if (riskScore >= 20) level = 'LOW';
            else level = 'SAFE';

            const result = { score: riskScore, reasons, level };
            this.cacheRiskScore(ip, riskScore, reasons);
            return result;

        } catch (error) {
            console.error('IP风险评估失败:', error);
            return { score: 50, reasons: ['系统评估异常'], level: 'MEDIUM' };
        }
    }

    // 检查地理位置风险
    async checkLocationRisk(ip, username) {
        try {
            // 获取用户历史登录地理位置
            const userLocations = await pool.query(`
                SELECT DISTINCT location_country, location_city
                FROM ip_activities 
                WHERE username = $1 
                AND location_country IS NOT NULL 
                AND created_at > NOW() - INTERVAL '30 days'
            `, [username]);

            if (userLocations.rows.length === 0) {
                return { score: 0, reason: null };
            }

            // 获取当前IP地理位置 (简化版，实际需要调用地理位置API)
            const currentLocation = await this.getIPLocation(ip);
            if (!currentLocation) {
                return { score: 0, reason: null };
            }

            // 检查是否是新的国家/地区
            const knownCountries = userLocations.rows.map(row => row.location_country);
            if (!knownCountries.includes(currentLocation.country)) {
                return { score: 30, reason: `异地登录: ${currentLocation.country}` };
            }

            return { score: 0, reason: null };

        } catch (error) {
            console.error('地理位置风险检查失败:', error);
            return { score: 0, reason: null };
        }
    }

    // 获取IP地理位置 (简化版)
    async getIPLocation(ip) {
        if (this.locationCache.has(ip)) {
            const cached = this.locationCache.get(ip);
            if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) { // 24小时缓存
                return cached.location;
            }
        }

        // 这里应该调用真实的地理位置API，暂时返回模拟数据
        const location = {
            country: '中国',
            city: '北京',
            region: '北京市'
        };

        this.locationCache.set(ip, {
            location,
            timestamp: Date.now()
        });

        return location;
    }

    // 缓存风险评分
    cacheRiskScore(ip, score, reasons) {
        this.riskCache.set(ip, {
            score,
            reasons,
            timestamp: Date.now()
        });
    }

    // 添加IP到黑名单
    async addToBlacklist(ip, reason, adminUser) {
        try {
            await pool.query(`
                INSERT INTO ip_blacklist (ip_address, reason, added_by, created_at, is_active)
                VALUES ($1, $2, $3, NOW(), true)
                ON CONFLICT (ip_address) DO UPDATE SET
                reason = $2, added_by = $3, updated_at = NOW(), is_active = true
            `, [ip, reason, adminUser]);
            
            // 清除缓存
            this.riskCache.delete(ip);
            return true;
        } catch (error) {
            console.error('添加IP黑名单失败:', error);
            return false;
        }
    }

    // 添加IP到白名单
    async addToWhitelist(ip, reason, adminUser) {
        try {
            await pool.query(`
                INSERT INTO ip_whitelist (ip_address, reason, added_by, created_at, is_active)
                VALUES ($1, $2, $3, NOW(), true)
                ON CONFLICT (ip_address) DO UPDATE SET
                reason = $2, added_by = $3, updated_at = NOW(), is_active = true
            `, [ip, reason, adminUser]);
            
            // 清除缓存
            this.riskCache.delete(ip);
            return true;
        } catch (error) {
            console.error('添加IP白名单失败:', error);
            return false;
        }
    }

    // 移除IP黑名单
    async removeFromBlacklist(ip) {
        try {
            await pool.query(
                'UPDATE ip_blacklist SET is_active = false WHERE ip_address = $1',
                [ip]
            );
            this.riskCache.delete(ip);
            return true;
        } catch (error) {
            console.error('移除IP黑名单失败:', error);
            return false;
        }
    }

    // 获取IP统计信息
    async getIPStats(ip) {
        try {
            const stats = await pool.query(`
                SELECT 
                    COUNT(*) as total_requests,
                    COUNT(DISTINCT username) as unique_users,
                    COUNT(CASE WHEN action = 'login_success' THEN 1 END) as successful_logins,
                    COUNT(CASE WHEN action = 'login_failed' THEN 1 END) as failed_logins,
                    MIN(created_at) as first_seen,
                    MAX(created_at) as last_seen
                FROM ip_activities 
                WHERE ip_address = $1
            `, [ip]);

            return stats.rows[0];
        } catch (error) {
            console.error('获取IP统计失败:', error);
            return null;
        }
    }

    // 检查是否需要验证码
    shouldRequireCaptcha(riskData) {
        return riskData.score >= 40;
    }

    // 检查是否需要阻断
    shouldBlock(riskData) {
        return riskData.score >= 80;
    }

    // 检查是否需要额外验证
    shouldRequireExtraAuth(riskData) {
        return riskData.score >= 60;
    }
}

module.exports = new IPManager();