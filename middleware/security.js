const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// 存储用户行为数据
const userBehavior = new Map();
const ipBlacklist = new Set();
const suspiciousPatterns = new Map();

// 获取真实IP地址
function getRealIP(req) {
    return req.headers['cf-connecting-ip'] || 
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           req.ip;
}

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

// IP黑名单检查
function checkBlacklist(req, res, next) {
    const ip = getRealIP(req);
    
    if (ipBlacklist.has(ip)) {
        return res.status(403).json({
            success: false,
            message: '访问被拒绝',
            code: 'BLACKLISTED'
        });
    }
    
    next();
}

// 设备指纹验证
function deviceFingerprint(req, res, next) {
    const fingerprint = generateFingerprint(req);
    req.fingerprint = fingerprint;
    const realIP = getRealIP(req);
    
    // 检查指纹变化频率（放宽标准）
    const fpHistory = suspiciousPatterns.get(realIP) || { fingerprints: new Set(), lastChange: 0 };
    fpHistory.fingerprints.add(fingerprint);
    
    // 大幅放宽指纹检查 - 允许更多变化
    if (fpHistory.fingerprints.size > 10 && Date.now() - fpHistory.lastChange < 600000) { // 10分钟内超过10个指纹
        ipBlacklist.add(realIP);
        return res.status(403).json({
            success: false,
            message: '异常行为检测',
            code: 'SUSPICIOUS_ACTIVITY'
        });
    }
    
    fpHistory.lastChange = Date.now();
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
            intervals.push(behavior.requests[i] - behavior.requests[i-1]);
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
        if (avgInterval < 500 && behavior.requests.length > 100) { // 平均小于0.5秒且100+次
            suspicionScore += 15; // 降低评分
        }
        
        // 请求量异常 - 大幅放宽
        if (behavior.totalRequests > 5000 && (now - behavior.firstSeen) < 3600000) { // 1小时内超过5000次
            suspicionScore += 25; // 降低评分
        }
        
        behavior.suspicionScore = suspicionScore;
        
        // 大幅提高封禁阈值
        if (suspicionScore >= 90) { // 从70提高到90
            ipBlacklist.add(ip);
            return res.status(403).json({
                success: false,
                message: '检测到异常访问模式',
                code: 'ABNORMAL_PATTERN'
            });
        }
    }
    
    behavior.lastRequestTime = now;
    userBehavior.set(ip, behavior);
    
    // 传递行为数据供后续使用
    req.userBehavior = behavior;
    
    next();
}

// 基础速率限制（大幅放宽）
const basicRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 100, // 从30增加到100次
    message: '请求过于频繁，请稍后再试',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        // 记录过度请求的IP
        const ip = req.ip || req.connection.remoteAddress;
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
    legacyHeaders: false
});

// 针对已登录用户的细粒度限流（以用户为key，fallback为指纹/IP）
const userActionRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 40, // 高价值操作默认每分钟40次
    keyGenerator: (req) => req.session?.user?.username || req.fingerprint || getRealIP(req),
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: '操作过于频繁，请稍后再试'
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

// 管理员接口限流（账号/IP 维度更严格）
const adminRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 15,
    keyGenerator: (req) => req.session?.user?.username || getRealIP(req),
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: '管理员操作过于频繁，请稍后再试'
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

// 简单的管理员严格限流（内存计数，叠加 rateLimit，防止 miss）
const adminStrictLimit = (() => {
    const windowMs = 60 * 1000;
    const max = 12;
    const hits = new Map();
    return (req, res, next) => {
        const key = req.session?.user?.username || getRealIP(req);
        const now = Date.now();
        const entry = hits.get(key) || { count: 0, start: now };
        if (now - entry.start > windowMs) {
            entry.count = 0;
            entry.start = now;
        }
        entry.count += 1;
        hits.set(key, entry);
        if (entry.count > max) {
            return res.status(429).json({
                success: false,
                message: '管理员操作过于频繁，请稍后再试'
            });
        }
        return next();
    };
})();

// 管理接口 IP 白名单（通过 env 配置，逗号分隔），未配置则不拦截
function adminIPWhitelist(req, res, next) {
    const whitelist = (process.env.ADMIN_IP_WHITELIST || '').split(',').map((ip) => ip.trim()).filter(Boolean);
    if (whitelist.length === 0) {
        return next();
    }
    const ip = getRealIP(req);
    if (!whitelist.includes(ip)) {
        return res.status(403).json({
            success: false,
            message: '管理员 IP 未授权',
            code: 'ADMIN_IP_REJECTED'
        });
    }
    return next();
}

// 管理接口签名校验（HMAC-SHA256），未配置密钥则跳过
function verifyAdminSignature(req, res, next) {
    const secret = process.env.ADMIN_SIGN_SECRET;
    if (!secret) {
        return next();
    }

    const ts = req.headers['x-sig-ts'] || req.headers['x-admin-ts'];
    const sign = (req.headers['x-signature'] || req.headers['x-sig'] || '').toString().toLowerCase();

    if (!ts || !sign) {
        return res.status(401).json({ success: false, message: '缺少签名' });
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
        return res.status(401).json({ success: false, message: '签名时间无效' });
    }

    const payload = JSON.stringify(req.body || {});
    const raw = `${tsNum}:${req.method}:${req.originalUrl}:${payload}`;
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    if (expected !== sign) {
        return res.status(401).json({ success: false, message: '签名校验失败' });
    }

    return next();
}

// 动态速率限制（基于用户行为）- 放宽
function dynamicRateLimit(req, res, next) {
    const behavior = req.userBehavior || {};
    
    // 根据可疑分数调整限制 - 提高阈值
    if (behavior.suspicionScore > 80) { // 从50提高到80
        // 高度可疑用户，强制冷却
        const lastRequest = behavior.lastRequestTime || 0;
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

// Session验证（软性检查）
function requireSession(req, res, next) {
    // 如果没有session，自动创建一个
    if (!req.session || !req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = require('crypto').randomBytes(16).toString('hex');
    }
    
    // 检查session年龄
    const sessionAge = Date.now() - (req.session.createdAt || 0);
    if (sessionAge > 24 * 60 * 60 * 1000) { // 24小时
        // 重新初始化而不是销毁
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = require('crypto').randomBytes(16).toString('hex');
    }
    
    next();
}

// CSRF保护
function csrfProtection(req, res, next) {
    if (req.method === 'POST') {
        const token = req.headers['x-csrf-token'] || req.body.csrfToken;
        const sessionToken = req.session?.csrfToken;
        
        if (!token || token !== sessionToken) {
            return res.status(403).json({
                success: false,
                message: '无效的请求',
                code: 'CSRF_FAILED'
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
    
    // 定期清理黑名单 - 每小时清理一次，给被误封的用户机会
    console.log('清理安全数据，重置黑名单');
    ipBlacklist.clear();
}

// 每小时清理一次
setInterval(cleanupOldData, 60 * 60 * 1000);

// 启动时立即清理一次，特别清理Cloudflare IP
function initialCleanup() {
    // 清理Cloudflare边缘节点IP（这些不应该被封）
    const cloudflareRanges = [
        /^172\.69\./,
        /^172\.70\./,
        /^108\.162\./,
        /^104\.23\./,
        /^104\.24\./,
        /^104\.25\./,
        /^104\.26\./,
        /^104\.27\./,
        /^104\.28\./
    ];
    
    for (const ip of ipBlacklist) {
        if (cloudflareRanges.some(range => range.test(ip))) {
            ipBlacklist.delete(ip);
            console.log(`已解封Cloudflare IP: ${ip}`);
        }
    }
    
    cleanupOldData();
}

initialCleanup();

// 导出中间件
module.exports = {
    checkBlacklist,
    deviceFingerprint,
    behaviorAnalysis,
    basicRateLimit,
    strictRateLimit,
    dynamicRateLimit,
    requireSession,
    csrfProtection,
    generateFingerprint,
    adminIPWhitelist,
    verifyAdminSignature,
    adminRateLimit,
    adminStrictLimit,
    
    // 工具函数
    addToBlacklist: (ip) => ipBlacklist.add(ip),
    removeFromBlacklist: (ip) => ipBlacklist.delete(ip),
    getBlacklist: () => Array.from(ipBlacklist),
    getUserBehavior: (ip) => userBehavior.get(ip),
    clearUserBehavior: (ip) => userBehavior.delete(ip)
};
