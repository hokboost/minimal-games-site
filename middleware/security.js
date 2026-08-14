const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { getClientIp } = require('../lib/client-ip');
const PostgresRateLimitStore = require('../lib/postgres-rate-limit-store');
const pool = require('../db');

// 存储用户行为数据
const userBehavior = new Map();
let ipBlacklist = new Set();
const suspiciousPatterns = new Map();
let blacklistLoadedAt = 0;
let blacklistRefreshPromise = null;
const BLACKLIST_REFRESH_MS = 5000;
const MAX_BEHAVIOR_ENTRIES = 10000;

// 获取真实IP地址
function getRealIP(req) {
    return req.clientIP || getClientIp(req) || '';
}

const ipRateLimitKey = (req) => rateLimit.ipKeyGenerator(getRealIP(req) || 'unknown');

// 生成设备指纹
function generateFingerprint(req) {
    const realIP = getRealIP(req);
    const components = [
        req.headers['user-agent'] || '',
        req.headers['accept-language'] || '',
        req.headers['accept-encoding'] || '',
        req.headers['accept'] || '',
        realIP
    ];
    return crypto.createHash('md5').update(components.join('|')).digest('hex');
}

async function refreshBlacklist(force = false) {
    if (!force && blacklistLoadedAt && Date.now() - blacklistLoadedAt < BLACKLIST_REFRESH_MS) return;
    if (blacklistRefreshPromise) return blacklistRefreshPromise;
    blacklistRefreshPromise = pool.query(`
        SELECT ip_address::text AS ip_address
        FROM ip_blacklist
        WHERE is_active = true
    `).then((result) => {
        ipBlacklist = new Set(result.rows.map((row) => row.ip_address));
        blacklistLoadedAt = Date.now();
    }).finally(() => {
        blacklistRefreshPromise = null;
    });
    return blacklistRefreshPromise;
}

// The database is authoritative. The short cache only avoids a query per request.
async function checkBlacklist(req, res, next) {
    const ip = getRealIP(req);
    try {
        await refreshBlacklist();
        if (ipBlacklist.has(ip)) {
            return res.status(403).json({
                success: false,
                message: '访问被拒绝',
                code: 'BLACKLISTED'
            });
        }
        return next();
    } catch (error) {
        console.error('IP黑名单检查失败:', error);
        return res.status(503).json({ success: false, message: '访问控制服务暂不可用' });
    }
}

// 设备指纹验证
function deviceFingerprint(req, res, next) {
    const fingerprint = generateFingerprint(req);
    req.fingerprint = fingerprint;
    const realIP = getRealIP(req);

    // 检查指纹变化频率（放宽标准）
    const fpHistory = suspiciousPatterns.get(realIP) || { fingerprints: new Set(), lastChange: 0 };
    fpHistory.fingerprints.add(fingerprint);
    if (fpHistory.fingerprints.size > 20) fpHistory.fingerprints.clear();

    fpHistory.lastChange = Date.now();
    if (!suspiciousPatterns.has(realIP) && suspiciousPatterns.size >= MAX_BEHAVIOR_ENTRIES) {
        suspiciousPatterns.delete(suspiciousPatterns.keys().next().value);
    }
    suspiciousPatterns.set(realIP, fpHistory);

    next();
}

// 行为分析中间件
function behaviorAnalysis(req, res, next) {
    const ip = getRealIP(req);
    const now = Date.now();

    // 获取或创建用户行为记录
    let behavior = userBehavior.get(ip) || {
        requests: [],
        firstSeen: now,
        totalRequests: 0,
        suspicionScore: 0,
        lastRequestTime: 0,
        patterns: {
            avgInterval: 0,
            minInterval: Infinity,
            consistency: 0
        }
    };

    const previousRequestTime = behavior.lastRequestTime || 0;

    // 记录请求时间
    behavior.requests.push(now);
    behavior.totalRequests++;

    // 只保留最近100次请求
    if (behavior.requests.length > 100) {
        behavior.requests.shift();
    }

    // 分析请求模式
    if (behavior.requests.length > 5) {
        const intervals = [];
        for (let i = 1; i < behavior.requests.length; i++) {
            intervals.push(behavior.requests[i] - behavior.requests[i - 1]);
        }

        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        const minInterval = Math.min(...intervals);
        const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);

        // 更新模式数据
        behavior.patterns.avgInterval = avgInterval;
        behavior.patterns.minInterval = minInterval;
        behavior.patterns.consistency = stdDev / avgInterval; // 越小越一致

        // 计算可疑分数（放宽标准）
        let suspicionScore = 0;

        // 请求间隔太一致（可能是定时脚本）- 放宽条件
        if (behavior.patterns.consistency < 0.05 && behavior.requests.length > 50) {
            suspicionScore += 20; // 降低评分
        }

        // 请求间隔太短 - 放宽条件
        if (minInterval < 50) { // 小于50ms（更严格）
            suspicionScore += 30; // 降低评分
        }

        // 平均间隔太短 - 放宽条件
        if (avgInterval < 500 && behavior.requests.length >= 100) { // 平均小于0.5秒且100次
            suspicionScore += 15; // 降低评分
        }

        // 请求量异常 - 大幅放宽
        if (behavior.totalRequests > 5000 && (now - behavior.firstSeen) < 3600000) { // 1小时内超过5000次
            suspicionScore += 25; // 降低评分
        }

        behavior.suspicionScore = suspicionScore;

    }

    behavior.lastRequestTime = now;
    if (!userBehavior.has(ip) && userBehavior.size >= MAX_BEHAVIOR_ENTRIES) {
        userBehavior.delete(userBehavior.keys().next().value);
    }
    userBehavior.set(ip, behavior);

    // 传递行为数据供后续使用
    req.userBehavior = behavior;
    req.previousBehaviorRequestTime = previousRequestTime;

    next();
}

// 基础速率限制（大幅放宽）
const basicRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 100, // 从30增加到100次
    message: '请求过于频繁，请稍后再试',
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'security:basic'),
    passOnStoreError: false,
    keyGenerator: ipRateLimitKey,
    handler: (req, res) => {
        // 记录过度请求的IP
        const ip = getRealIP(req);
        const behavior = userBehavior.get(ip) || {};
        behavior.suspicionScore = (behavior.suspicionScore || 0) + 5; // 降低惩罚
        userBehavior.set(ip, behavior);

        res.status(429).json({
            success: false,
            message: '请求过于频繁，请稍后再试',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

// 严格速率限制（用于API）- 放宽
const strictRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 500, // 从100增加到500次
    skipSuccessfulRequests: false,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'security:strict'),
    passOnStoreError: false,
    keyGenerator: ipRateLimitKey
});

// 针对已登录用户的细粒度限流（以用户为key，fallback为指纹/IP）
const userActionRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 40, // 高价值操作默认每分钟40次
    keyGenerator: (req) => req.session?.user?.username
        ? `user:${req.session.user.username}`
        : req.fingerprint
            ? `fingerprint:${req.fingerprint}`
            : `ip:${ipRateLimitKey(req)}`,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: '操作过于频繁，请稍后再试'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'security:user-action'),
    passOnStoreError: false
});

const readHeavyRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => req.session?.user?.username
        ? `user:${req.session.user.username}`
        : ipRateLimitKey(req),
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: '查询过于频繁，请稍后再试'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'security:read-heavy'),
    passOnStoreError: false
});

// 管理员接口限流（账号/IP 维度更严格）
const adminRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 15,
    keyGenerator: (req) => req.session?.user?.username
        ? `user:${req.session.user.username}`
        : `ip:${ipRateLimitKey(req)}`,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: '管理员操作过于频繁，请稍后再试'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'security:admin'),
    passOnStoreError: false
});

const adminStrictLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 12,
    keyGenerator: (req) => req.session?.user?.username
        ? `user:${req.session.user.username}`
        : `ip:${ipRateLimitKey(req)}`,
    handler: (req, res) => res.status(429).json({
        success: false,
        message: '管理员操作过于频繁，请稍后再试'
    }),
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'security:admin-strict'),
    passOnStoreError: false
});

// 动态速率限制（基于用户行为）- 放宽
function dynamicRateLimit(req, res, next) {
    const behavior = req.userBehavior || {};

    // 根据可疑分数调整限制 - 提高阈值
    if (behavior.suspicionScore > 80) { // 从50提高到80
        // 高度可疑用户，强制冷却
        const lastRequest = req.previousBehaviorRequestTime || 0;
        const cooldown = 5000; // 从10秒降低到5秒

        if (Date.now() - lastRequest < cooldown) {
            return res.status(429).json({
                success: false,
                message: '请求过快，请等待',
                cooldownRemaining: cooldown - (Date.now() - lastRequest)
            });
        }
    }

    next();
}

// 清理过期数据（定期执行）
function cleanupOldData() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    // 清理用户行为数据
    for (const [ip, behavior] of userBehavior.entries()) {
        if (now - behavior.lastRequestTime > maxAge) {
            userBehavior.delete(ip);
        }
        // 重置过高的可疑分数
        if (behavior.suspicionScore > 60) {
            behavior.suspicionScore = Math.max(0, behavior.suspicionScore - 10);
        }
    }

    // 清理可疑模式数据
    for (const [ip, pattern] of suspiciousPatterns.entries()) {
        if (now - pattern.lastChange > maxAge) {
            suspiciousPatterns.delete(ip);
        }
    }

}

let securityCleanupInterval = null;

// 由应用生命周期显式启停，避免仅导入模块就创建后台任务。
function startCleanup() {
    if (securityCleanupInterval) return false;
    cleanupOldData();
    securityCleanupInterval = setInterval(cleanupOldData, 60 * 60 * 1000);
    securityCleanupInterval.unref?.();
    return true;
}

function stopCleanup() {
    if (!securityCleanupInterval) return false;
    clearInterval(securityCleanupInterval);
    securityCleanupInterval = null;
    return true;
}

// 导出中间件
module.exports = {
    checkBlacklist,
    deviceFingerprint,
    behaviorAnalysis,
    basicRateLimit,
    strictRateLimit,
    userActionRateLimit,
    readHeavyRateLimit,
    dynamicRateLimit,
    generateFingerprint,
    adminRateLimit,
    adminStrictLimit,

    // 工具函数
    addToBlacklist: () => refreshBlacklist(true),
    removeFromBlacklist: () => refreshBlacklist(true),
    refreshBlacklist,
    getBlacklist: () => Array.from(ipBlacklist),
    getBehaviorEntries: () => Array.from(userBehavior.entries()),
    getUserBehavior: (ip) => userBehavior.get(ip),
    clearUserBehavior: (ip) => userBehavior.delete(ip),
    startCleanup,
    stopCleanup
};
