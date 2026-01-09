// 生产环境安全检查 - 必须在所有操作之前
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
    // 强制检查SESSION_SECRET
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-secret-key-change-this-in-production') {
        console.error('🚨 生产环境安全错误: SESSION_SECRET 未正确配置！');
        console.error('请设置环境变量 SESSION_SECRET 为足够长的随机字符串');
        process.exit(1);
    }
    
    // 放宽长度要求：16字节以上即可，建议32字节
    if (process.env.SESSION_SECRET.length < 16) {
        console.error('🚨 生产环境安全错误: SESSION_SECRET 长度过短！');
        console.error('当前长度:', process.env.SESSION_SECRET.length);
        console.error('最少需要16字节，建议32字节以上');
        process.exit(1);
    }
    
    if (process.env.SESSION_SECRET.length < 32) {
        console.warn('⚠️ 生产环境安全警告: SESSION_SECRET 长度建议至少32字节');
        console.warn('当前长度:', process.env.SESSION_SECRET.length);
        console.warn('建议增加SESSION_SECRET长度以提高安全性');
    }
    
    // 🛡️ 安全修复：检查Windows API密钥不能使用默认值
    if (!process.env.WINDOWS_API_KEY || process.env.WINDOWS_API_KEY === 'your-secret-api-key-2024') {
        console.error('🚨 生产环境安全错误: WINDOWS_API_KEY 未正确配置或使用默认值！');
        console.error('请设置环境变量 WINDOWS_API_KEY 为足够长的随机字符串');
        process.exit(1);
    }
    
    if (process.env.WINDOWS_API_KEY.length < 32) {
        console.error('🚨 生产环境安全错误: WINDOWS_API_KEY 长度过短！');
        console.error('当前长度:', process.env.WINDOWS_API_KEY.length);
        console.error('最少需要32字节的强随机字符串');
        process.exit(1);
    }
    
    console.log('✅ 生产环境安全检查通过');
}

const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const csrf = require('csrf');

// 数据库连接
const pool = require('./db');
const pgSession = require('connect-pg-simple')(session);

// 导入本地游戏数据和逻辑
const questions = require('./data/questions');
const GameLogic = require('./data/gameLogic');
const BalanceLogger = require('./balance-logger');

// 礼物配置
const fs = require('fs');
const axios = require('axios');
const { getSimpleGiftSender } = require('./bilibili-gift-sender-simple');
const crypto = require('crypto');

let giftConfig = {};
try {
    const giftConfigData = fs.readFileSync('./gift-codes.json', 'utf8');
    giftConfig = JSON.parse(giftConfigData);
    console.log('✅ 礼物配置加载成功');
} catch (error) {
    console.error('❌ 礼物配置加载失败:', error.message);
}

// 导入安全管理模块
const IPManager = require('./ip-manager');
const SessionManager = require('./session-manager');

// 导入安全中间件
const security = require('./middleware/security');
const registerAdminRoutes = require('./routes/admin');
const registerGiftRoutes = require('./routes/gifts');
const registerWishRoutes = require('./routes/wish');
const registerGameRoutes = require('./routes/games');

// CSRF 保护
const tokens = new csrf();

const app = express();
const server = http.createServer(app);

// WebSocket session认证中间件
const sessionStore = new pgSession({
    pool: pool,
    tableName: 'user_sessions',
    pruneSessionInterval: 60,
    errorLog: console.error
});

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }
            if (process.env.NODE_ENV !== 'production') {
                const allowedLocal = ["http://localhost:3000", "http://127.0.0.1:3000"];
                return callback(null, allowedLocal.includes(origin));
            }
            const allowedProd = new Set([
                "https://www.wuguijiang.com",
                "https://wuguijiang.com"
            ]);
            if (allowedProd.has(origin) || origin.endsWith(".wuguijiang.com")) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

// WebSocket连接管理
const userSockets = new Map(); // username -> Set of socket ids

// WebSocket session验证中间件
io.use(async (socket, next) => {
    try {
        const cookieHeader = socket.handshake.headers.cookie;
        if (!cookieHeader) {
            return next(new Error('No cookies provided'));
        }

        // 解析session cookie
        const cookies = {};
        cookieHeader.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                cookies[name] = decodeURIComponent(value);
            }
        });

        const sessionId = cookies['minimal_games_sid'];
        if (!sessionId) {
            return next(new Error('No session cookie'));
        }

        // 从数据库获取session
        const sessionQuery = 'SELECT sess FROM user_sessions WHERE sid = $1';
        const result = await pool.query(sessionQuery, [sessionId]);
        
        if (result.rows.length === 0) {
            return next(new Error('Invalid session'));
        }

        const sessionData = result.rows[0].sess;
        if (!sessionData.user || !sessionData.user.authorized) {
            return next(new Error('User not authenticated'));
        }

        // 将验证过的用户信息附加到socket
        socket.authenticatedUser = {
            username: sessionData.user.username,
            userId: sessionData.user.id,
            isAdmin: sessionData.user.is_admin || false,
            sessionId
        };

        console.log(`✅ WebSocket认证成功: ${sessionData.user.username}`);
        next();
    } catch (error) {
        console.error('WebSocket认证失败:', error);
        next(new Error('Authentication failed'));
    }
});

io.on('connection', (socket) => {
    const username = socket.authenticatedUser.username;
    console.log(`🔗 用户 ${username} 建立WebSocket连接: ${socket.id}`);

    // 🛡️ 安全修复：直接使用已验证的用户名，不再信任客户端
    if (!userSockets.has(username)) {
        userSockets.set(username, new Set());
    }
    userSockets.get(username).add(socket.id);
    socket.username = username;

    // 处理断开连接
    socket.on('disconnect', () => {
        if (socket.username && userSockets.has(socket.username)) {
            userSockets.get(socket.username).delete(socket.id);
            if (userSockets.get(socket.username).size === 0) {
                userSockets.delete(socket.username);
            }
            console.log(`用户 ${socket.username} 断开WebSocket连接: ${socket.id}`);
        }
    });
});

// 发送用户通知的辅助函数
function notifyUser(username, notification) {
    if (userSockets.has(username)) {
        const socketIds = userSockets.get(username);
        for (const socketId of socketIds) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('notification', notification);
            }
        }
        console.log(`发送通知给用户 ${username}: ${notification.message}`);
    }
}

// 发送安全警告的辅助函数
function notifySecurityEvent(username, event, excludeSessionId = null) {
    console.log(`🔔 尝试发送安全警告给用户 ${username}: ${event.type}`);
    
    if (userSockets.has(username)) {
        const socketIds = userSockets.get(username);
        console.log(`📡 用户 ${username} 有 ${socketIds.size} 个WebSocket连接`);
        
        let sentCount = 0;
        for (const socketId of socketIds) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                if (excludeSessionId && socket.authenticatedUser?.sessionId === excludeSessionId) {
                    continue;
                }
                socket.emit('security-alert', event);
                sentCount++;
            }
        }
        console.log(`✅ 成功发送安全警告给用户 ${username}: ${event.type} (${sentCount}/${socketIds.size})`);
    } else {
        console.log(`⚠️ 用户 ${username} 没有活跃的WebSocket连接`);
    }
}

const PORT = process.env.PORT || 3000;

// 数据库初始化函数
async function initializeDatabase() {
    try {
        console.log('🔧 检查数据库结构...');
        
        // 检查quantity字段是否存在
        const checkQuantity = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'gift_exchanges' 
            AND column_name = 'quantity'
        `);
        
        if (checkQuantity.rows.length === 0) {
            console.log('➕ 添加quantity字段到gift_exchanges表...');
            await pool.query(`ALTER TABLE gift_exchanges ADD COLUMN quantity INTEGER DEFAULT 1`);
            // 更新现有记录
            await pool.query(`UPDATE gift_exchanges SET quantity = 1 WHERE quantity IS NULL`);
            console.log('✅ quantity字段添加完成');
        } else {
            console.log('✅ quantity字段已存在');
        }
        
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
    }
}

// 视图引擎设置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 信任代理（Render等平台需要）
app.set('trust proxy', 1);

// CSP设置 - 完全按照kingboost模式
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", `
    default-src 'self';
    script-src 'self';
    script-src-elem 'self';
    style-src 'self' 'unsafe-inline';
    style-src-elem 'self' 'unsafe-inline';
    font-src 'self';
    img-src 'self' data:;
    connect-src 'self';
  `.replace(/\n/g, ' '));
  next();
});

// Helmet 安全头 (简化版)
app.use(helmet({
    contentSecurityPolicy: false, // 禁用helmet的CSP，使用上面的手动设置
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Session配置 - 使用PostgreSQL存储
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions',
        pruneSessionInterval: 60,
        errorLog: console.error
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    },
    name: 'minimal_games_sid'
}));

// 基础中间件
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize()); // 防止NoSQL注入

// IP风控中间件
app.use(async (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    // 记录所有请求的IP活动
    if (req.session && req.session.user) {
        await IPManager.recordIPActivity(clientIP, req.session.user.username, userAgent, 'request');
    }
    
    // 将IP信息添加到请求对象
    req.clientIP = clientIP;
    req.userAgent = userAgent;
    
    next();
});

// ====================
// 认证系统中间件
// ====================

// 统一的CSRF token 生成（修复后：不再混用不同的token生成机制）
function generateCSRFToken(req) {
    // 统一使用csrf库，不再使用GameLogic.generateToken()
    if (!req.session.id) {
        // 确保session有ID
        req.session.save(() => {});
    }
    const token = tokens.create(req.session.id || 'default');
    req.session.csrfToken = token;
    return token;
}

// 统一的CSRF验证
function verifyCSRFToken(req, providedToken) {
    const sessionToken = req.session.csrfToken;
    if (!sessionToken || !providedToken) {
        return false;
    }
    return tokens.verify(req.session.id || 'default', providedToken);
}

// 添加CSRF中间件
const requireCSRF = (req, res, next) => {
    const providedToken = req.body.csrfToken || req.headers['x-csrf-token'];
    if (!verifyCSRFToken(req, providedToken)) {
        return res.status(403).json({ success: false, message: 'CSRF token验证失败' });
    }
    next();
};

// 认证中间件
const requireLogin = async (req, res, next) => {
    if (!req.session.user) {
        const cookieHeader = req.headers.cookie || '';
        const cookies = {};
        cookieHeader.split(';').forEach((cookie) => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                cookies[name] = decodeURIComponent(value);
            }
        });

        const sessionId = cookies['minimal_games_sid'];
        if (sessionId) {
            try {
                const result = await pool.query(
                    `SELECT is_active, termination_reason
                     FROM active_sessions
                     WHERE session_id = $1
                     ORDER BY terminated_at DESC NULLS LAST
                     LIMIT 1`,
                    [sessionId]
                );

                const sessionRow = result.rows[0];
                if (sessionRow && sessionRow.is_active === false && sessionRow.termination_reason === 'new_device_login') {
                    if (req.path.startsWith('/api/')) {
                        return res.status(401).json({ success: false, message: '账号已在其他设备登录' });
                    }
                    return res.redirect('/login?kicked=true');
                }
            } catch (error) {
                console.error('Session lookup error:', error);
            }
        }

        // 检查是否是API请求
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ success: false, message: '请先登录' });
        }
        return res.redirect('/login');
    }
    next();
};

const requireAuthorized = (req, res, next) => {
    if (!req.session.user || !req.session.user.authorized) {
        // 检查是否是API请求
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: '未授权访问' });
        }
        return res.status(403).send("❌ 未授权访问");
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.user.is_admin) {
        // 检查是否是API请求
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: '无权访问管理员后台' });
        }
        return res.status(403).send("🚫 无权访问管理员后台");
    }
    next();
};

// 未授权用户只允许进入开发中页面或退出登录
app.use((req, res, next) => {
    if (req.session.user && !req.session.user.authorized) {
        const allowedPaths = new Set(['/logout', '/coming-soon']);
        if (allowedPaths.has(req.path)) {
            return next();
        }
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: '未授权访问' });
        }
        return res.redirect('/coming-soon');
    }
    next();
});

// 限流配置
const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 25, // 放宽5倍：从5次改为25次
    message: "❌ 尝试次数过多，请 10 分钟后再试。"
});

const registerLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15, // 放宽5倍：从3次改为15次
    message: "⚠️ 注册太频繁，请稍后再试。",
    standardHeaders: true,
    legacyHeaders: false,
});

// 简化安全中间件 - 只保留基础速率限制
// app.use(security.checkBlacklist);
// app.use(security.deviceFingerprint);
// app.use(security.behaviorAnalysis);

// 生成随机用户名
function generateUsername() {
    const adjectives = ['快乐', '幸运', '聪明', '勇敢', '神秘', '酷炫', '超级', '无敌'];
    const nouns = ['玩家', '高手', '大师', '英雄', '冠军', '传奇', '战士', '天才'];
    const adj = adjectives[crypto.randomInt(0, adjectives.length)];
    const noun = nouns[crypto.randomInt(0, nouns.length)];
    const num = crypto.randomInt(0, 10000);
    return `${adj}${noun}${num}`;
}

// 存储用户会话数据 (简单内存存储)
const userSessions = new Map();

// 飘屏系统
class DanmakuSystem {
    constructor() {
        this.recentMessages = []; // 内存存储最近的消息
        this.maxMessages = 50;    // 最多存储50条
    }
    
    addMessage(username, type, isWin) {
        // 固定成功祝福消息
        const content = `🎉 恭喜 ${username} 祈愿成功！`;
        
        
        const message = {
            username,
            type: isWin ? 'success' : 'fail',
            content,
            timestamp: Date.now()
        };
        
        // 添加到内存
        this.recentMessages.unshift(message);
        if (this.recentMessages.length > this.maxMessages) {
            this.recentMessages = this.recentMessages.slice(0, this.maxMessages);
        }
        
        // 广播给所有在线用户
        io.emit('new_danmaku', message);
        
        return message;
    }
    
    getRecentMessages(limit = 20) {
        return this.recentMessages.slice(0, limit);
    }
}

const danmaku = new DanmakuSystem();

// WebSocket连接管理
const connectedUsers = new Set();

io.on('connection', (socket) => {
    console.log('用户连接:', socket.id);
    connectedUsers.add(socket.id);
    
    // 发送最近的飘屏消息给新连接的用户
    const recentMessages = danmaku.getRecentMessages(10);
    socket.emit('recent_messages', recentMessages);
    
    socket.on('disconnect', () => {
        connectedUsers.delete(socket.id);
        console.log('用户断开:', socket.id);
    });
    
});

// 全局广播函数
function broadcastDanmaku(username, type, isWin) {
    // 只在成功时飘屏
    if (isWin) {
        return danmaku.addMessage(username, type, isWin);
    }
    return null;
}

// 创建题目ID索引，提升查找性能
const questionMap = new Map(questions.map(q => [q.id, q]));

// 定时清理过期的用户会话数据
setInterval(() => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5分钟过期
    
    for (const [username, sessions] of userSessions.entries()) {
        if (typeof sessions === 'object' && sessions !== null) {
            for (const [token, data] of Object.entries(sessions)) {
                if (data && now - data.timestamp > maxAge) {
                    delete sessions[token];
                }
            }
            // 如果用户的所有session都过期了，删除用户记录
            if (Object.keys(sessions).length === 0) {
                userSessions.delete(username);
            }
        }
    }
    
    console.log(`Session cleanup: ${userSessions.size} active users`);
}, 60000); // 每分钟清理一次

// ====================
// 认证路由
// ====================

// 登录页面
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login', {
        title: '登录 - Minimal Games',
        csrfToken: generateCSRFToken(req),
        error: req.query.error
    });
});

// 注册页面
app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register', {
        title: '注册 - Minimal Games',
        csrfToken: generateCSRFToken(req),
        error: req.query.error
    });
});

app.get('/coming-soon', requireLogin, (req, res) => {
    res.render('coming-soon');
});

// 个人资料页面
app.get('/profile', requireLogin, (req, res, next) => {
    if (!req.session.user?.authorized) {
        return res.redirect('/coming-soon');
    }
    next();
}, async (req, res) => {
    try {
        const username = req.session.user.username;
        const userResult = await pool.query(
            'SELECT username, authorized, balance FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).send('用户不存在');
        }
        
        // 获取游戏记录统计
        const gameStats = await Promise.all([
            pool.query('SELECT COUNT(*) as count, MAX(score) as best_score FROM submissions WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count, SUM(CASE WHEN won != \'lost\' THEN 1 ELSE 0 END) as wins FROM slot_results WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count, SUM(CASE WHEN COALESCE(matches_count, 0) > 0 THEN 1 ELSE 0 END) as wins FROM scratch_results WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count, COALESCE(SUM(success_count), 0) as wins FROM wish_sessions WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count FROM stone_logs WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count FROM flip_logs WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count FROM duel_logs WHERE username = $1', [username])
        ]);
        
        const stats = {
            quiz: {
                total: parseInt(gameStats[0].rows[0].count) || 0,
                bestScore: gameStats[0].rows[0].best_score || 0
            },
            slot: {
                total: parseInt(gameStats[1].rows[0].count) || 0,
                wins: parseInt(gameStats[1].rows[0].wins) || 0
            },
            scratch: {
                total: parseInt(gameStats[2].rows[0].count) || 0,
                wins: parseInt(gameStats[2].rows[0].wins) || 0
            },
            wish: {
                total: parseInt(gameStats[3].rows[0].count) || 0,
                wins: parseInt(gameStats[3].rows[0].wins) || 0
            },
            stone: {
                total: parseInt(gameStats[4].rows[0].count) || 0
            },
            flip: {
                total: parseInt(gameStats[5].rows[0].count) || 0
            },
            duel: {
                total: parseInt(gameStats[6].rows[0].count) || 0
            }
        };
        
        const user = userResult.rows[0];
        
        res.render('profile', {
            title: '个人资料 - Minimal Games',
            user: user,
            gameStats: stats
        });
    } catch (error) {
        console.error('获取用户数据失败:', error);
        res.status(500).send('服务器错误');
    }
});

// 注册处理
app.post('/register', registerLimiter, async (req, res) => {
    const { username, password, _csrf } = req.body;
    
    // CSRF 验证
    if (_csrf !== req.session.csrfToken) {
        return res.status(403).send('⚠️ CSRF token 校验失败');
    }

    // 输入验证
    if (!username || !password) {
        return res.render('register', {
            title: '注册 - Minimal Games',
            error: '用户名或密码不能为空！',
            csrfToken: generateCSRFToken(req)
        });
    }

    // 密码强度验证
    if (password.length < 6) {
        return res.render('register', {
            title: '注册 - Minimal Games',
            error: '密码长度至少需要6个字符',
            csrfToken: generateCSRFToken(req)
        });
    }

    try {
        const hashed = await bcrypt.hash(password, 12);
        const result = await pool.query(
            'INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, NOW()) RETURNING id',
            [username, hashed]
        );
        
        console.log(`[注册成功] 用户ID: ${result.rows[0].id}, 用户名: ${username}`);
        res.redirect('/login?registered=true');
    } catch (err) {
        if (err.code === '23505') {
            res.render('register', {
                title: '注册 - Minimal Games',
                error: '❌ 用户名已存在！',
                csrfToken: generateCSRFToken(req)
            });
        } else {
            console.error(err);
            res.render('register', {
                title: '注册 - Minimal Games',
                error: '❌ 注册失败，请稍后重试。',
                csrfToken: generateCSRFToken(req)
            });
        }
    }
});

// 管理员登录限流豁免中间件
const adminLoginLimiterExempt = (req, res, next) => {
    // 如果是hokboost管理员，跳过限流
    if (req.body && req.body.username === 'hokboost') {
        console.log('管理员hokboost登录 - 跳过限流检查');
        return next();
    }
    // 其他用户正常应用限流
    return loginLimiter(req, res, next);
};

// 登录处理 - 集成IP风控和单设备登录
app.post('/login', adminLoginLimiterExempt, async (req, res) => {
    const { username, password, _csrf } = req.body;
    const clientIP = req.clientIP;
    const userAgent = req.userAgent;
    
    if (_csrf !== req.session.csrfToken) {
        return res.status(403).send('⚠️ CSRF token 校验失败');
    }

    if (!username || !password) {
        return res.status(400).render('login', {
            title: '登录 - Minimal Games',
            error: '用户名或密码不能为空！',
            csrfToken: generateCSRFToken(req)
        });
    }

    try {
        // 1. IP风险评估
        const riskData = await IPManager.getIPRiskScore(clientIP, username);
        console.log(`登录风险评估 - IP: ${clientIP}, 用户: ${username}, 风险分: ${riskData.score}, 等级: ${riskData.level}`);

        // 2. 高风险IP直接阻断
        if (IPManager.shouldBlock(riskData)) {
            await pool.query(`
                INSERT INTO security_events (event_type, username, ip_address, description, severity)
                VALUES ('blocked_login_attempt', $1, $2, $3, 'high')
            `, [username, clientIP, `高风险IP登录被阻断: ${riskData.reasons.join(', ')}`]);

            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_blocked');
            
            return res.status(403).render('login', {
                title: '登录 - Minimal Games',
                error: '当前网络环境存在安全风险，请稍后重试',
                csrfToken: generateCSRFToken(req)
            });
        }

        // 3. 检查用户是否存在
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1', 
            [username]
        );
        
        if (result.rows.length === 0) {
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_failed');
            return res.status(401).render('login', {
                title: '登录 - Minimal Games',
                error: '用户名或密码错误！',
                csrfToken: generateCSRFToken(req)
            });
        }

        const user = result.rows[0];
        const now = new Date();
        
        // 4. 账户锁定检查
        if (!user.is_admin && user.locked_until && new Date(user.locked_until) > now) {
            const lockMinutes = Math.ceil((new Date(user.locked_until) - now) / 60000);
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_locked');
            return res.status(423).render('login', {
                title: '登录 - Minimal Games',
                error: `账户已被锁定，请 ${lockMinutes} 分钟后再试！`,
                csrfToken: generateCSRFToken(req)
            });
        }

        // 5. 验证密码
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            // 失败登录处理
            if (!user.is_admin) {
                const failures = (user.login_failures || 0) + 1;
                let lockUntil = null;
                
                if (failures >= 3) {
                    const lockMinutes = failures - 2;
                    lockUntil = new Date(now.getTime() + lockMinutes * 60000);
                }
                
                await pool.query(
                    'UPDATE users SET login_failures = $1, last_failure_time = $2, locked_until = $3 WHERE username = $4',
                    [failures, now, lockUntil, username]
                );
                
                await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_failed');
                
                const errorMsg = lockUntil ? 
                    `密码错误！账户已被锁定 ${failures-2} 分钟` : 
                    `密码错误！连续错误3次将被锁定 (当前${failures}次)`;
                    
                return res.status(401).render('login', {
                    title: '登录 - Minimal Games',
                    error: errorMsg,
                    csrfToken: generateCSRFToken(req)
                });
            } else {
                await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_failed');
                return res.status(401).render('login', {
                    title: '登录 - Minimal Games',
                    error: '用户名或密码错误！',
                    csrfToken: generateCSRFToken(req)
                });
            }
        }

        // 6. 登录成功处理
        if (!user.is_admin) {
            await pool.query(
                'UPDATE users SET login_failures = 0, last_failure_time = NULL, locked_until = NULL WHERE username = $1',
                [username]
            );
        }
        
        // 7. 设置session在session.regenerate之前
        req.session.user = {
            id: user.id,
            username: user.username,
            authorized: user.authorized,
            is_admin: user.is_admin
        };
        req.session.username = user.username;

        // 8. 重新生成session ID以提高安全性
        req.session.regenerate(async function (err) {
            if (err) {
                console.error("Session regenerate error:", err);
                return res.status(500).send("Session error");
            }

            // 重新设置session数据（regenerate会清空所有数据）
            req.session.user = {
                id: user.id,
                username: user.username,
                authorized: user.authorized,
                is_admin: user.is_admin
            };
            req.session.username = user.username;
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req); // 统一使用csrf库

            // 9. 管理员登录日志
            if (username === 'hokboost') {
                console.log(`管理员 ${username} 登录 - 允许多设备会话`);
            }

            // 10. 创建单设备会话管理（使用新的session ID，恢复实时通知）
            const sessionSuccess = await SessionManager.createSingleDeviceSession(
                username, req.sessionID, clientIP, userAgent, notifySecurityEvent
            );

            if (!sessionSuccess) {
                console.error('创建单设备会话失败');
            }

            // 11. 记录登录日志和活动
            await Promise.all([
                pool.query(`
                    INSERT INTO login_logs (username, ip_address, user_agent, login_result, risk_score)
                    VALUES ($1, $2, $3, 'success', $4)
                `, [username, clientIP, userAgent, riskData.score]),
                
                IPManager.recordIPActivity(clientIP, username, userAgent, 'login_success')
            ]);

            // 12. 中高风险登录警告
            if (riskData.score >= 40) {
                await pool.query(`
                    INSERT INTO security_events (event_type, username, ip_address, description, severity)
                    VALUES ('suspicious_login', $1, $2, $3, 'medium')
                `, [username, clientIP, `中高风险登录: ${riskData.reasons.join(', ')}`]);
                
                console.log(`⚠️ 中高风险登录 - 用户: ${username}, IP: ${clientIP}, 风险分: ${riskData.score}`);
            }
            
            // 13. 登录成功，准备重定向
            
            console.log(`✅ 用户 ${username} 登录成功，IP: ${clientIP}, 风险分: ${riskData.score}`);
            res.redirect('/');
        });

    } catch (err) {
        console.error('❌ 登录错误:', err);
        await IPManager.recordIPActivity(clientIP, username || 'unknown', userAgent, 'login_error');
        res.status(500).render('login', {
            title: '登录 - Minimal Games',
            error: '登录失败，请稍后再试。',
            csrfToken: generateCSRFToken(req)
        });
    }
});

// 登出 - 清理会话管理
app.get('/logout', async (req, res) => {
    const sessionId = req.sessionID;
    const username = req.session?.user?.username;
    
    if (username && sessionId) {
        // 清理单设备会话管理
        await SessionManager.terminateSession(sessionId, 'user_logout');
        console.log(`用户 ${username} 主动登出`);
    }
    
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// 修改密码API
app.post('/api/change-password', requireLogin, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const username = req.session.user.username;

        // 输入验证
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: '请填写所有字段' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: '新密码和确认密码不匹配' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: '新密码至少需要6个字符' });
        }

        // 验证当前密码
        const userResult = await pool.query(
            'SELECT password_hash FROM users WHERE username = $1',
            [username]
        );

        const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
        if (!isValidPassword) {
            return res.status(400).json({ success: false, message: '当前密码错误' });
        }

        // 更新密码
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE username = $2',
            [newPasswordHash, username]
        );

        res.json({ success: true, message: '密码修改成功！' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ success: false, message: '修改密码失败，请稍后重试' });
    }
});

// ====================
// 页面路由
// ====================
app.get('/', async (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        // 🛡️ 安全修复：统一使用csrf库生成token
        generateCSRFToken(req);
    }
    
    // 只有已登录且已授权的用户才能获取余额
    let balance = null;
    if (req.session.user && req.session.user.authorized) {
        try {
            const result = await pool.query(
                'SELECT balance FROM users WHERE username = $1',
                [req.session.user.username]
            );
            balance = result.rows.length > 0 ? result.rows[0].balance : 0;
        } catch (dbError) {
            console.error('Database query error:', dbError);
        }
    }
    
    res.render('index', {
        title: 'Minimal Games 游戏中心',
        user: req.session.user || null,
        balance: balance,
        req: req
    });
});

const wishConfigs = {
    deepsea_singer: {
        giftType: 'deepsea_singer',
        name: '深海歌姬',
        bilibiliGiftId: '35082',
        cost: 500,
        successRate: 0.014,
        guaranteeCount: 148,
        rewardValue: 30000
    },
    sky_throne: {
        giftType: 'sky_throne',
        name: '飞天转椅',
        bilibiliGiftId: '34382',
        cost: 250,
        successRate: 0.0202,
        guaranteeCount: 83,
        rewardValue: 10000
    },
    proposal: {
        giftType: 'proposal',
        name: '原地求婚',
        bilibiliGiftId: '34999',
        cost: 208,
        successRate: 0.0325,
        guaranteeCount: 52,
        rewardValue: 5200
    },
    wonderland: {
        giftType: 'wonderland',
        name: '梦游仙境',
        bilibiliGiftId: '31932',
        cost: 150,
        successRate: 0.0405,
        guaranteeCount: 41,
        rewardValue: 3000
    },
    white_bride: {
        giftType: 'white_bride',
        name: '纯白花嫁',
        bilibiliGiftId: '34428',
        cost: 75,
        successRate: 0.046,
        guaranteeCount: 34,
        rewardValue: 1314
    },
    crystal_ball: {
        giftType: 'crystal_ball',
        name: '水晶球',
        bilibiliGiftId: '31122',
        cost: 66,
        successRate: 0.055,
        guaranteeCount: 32,
        rewardValue: 1000
    },
    bobo: {
        giftType: 'bobo',
        name: '啵啵',
        bilibiliGiftId: '33668',
        cost: 50,
        successRate: 0.104,
        guaranteeCount: 16,
        rewardValue: 399
    }
};

function getWishConfig(giftType) {
    return wishConfigs[giftType] || null;
}

const stoneColors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
const stoneReplaceCosts = {
    1: 28,
    2: 28,
    3: 78,
    4: 315,
    5: 3860
};
const stoneRewards = {
    1: 50,
    2: 120,
    3: 250,
    4: 800,
    5: 3000,
    6: 30000
};

const flipCosts = [50, 112, 172, 316, 620, 1025, 2033];
const flipCashoutRewards = {
    1: 50,
    2: 200,
    3: 500,
    4: 1200,
    5: 3000,
    6: 8000,
    7: 30000
};

const duelRewards = {
    crown: { name: '至尊奖', reward: 30000 },
    dragon: { name: '龙魂奖', reward: 13140 },
    phoenix: { name: '凤羽奖', reward: 5000 },
    jade: { name: '玉阶奖', reward: 1000 },
    bronze: { name: '青铜奖', reward: 500 },
    iron: { name: '铁心奖', reward: 200 }
};

function calculateDuelCost(giftType, power) {
    if (giftType === 'crown') {
        return Math.round(310 * power + 1);
    }
    const reward = duelRewards[giftType]?.reward || 0;
    const ratio = reward / 30000;
    return Math.round(310 * ratio * power + 1);
}

function shuffleArray(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function createFlipBoard() {
    const board = [
        'good', 'good', 'good', 'good', 'good', 'good', 'good',
        'bad', 'bad'
    ];
    return shuffleArray(board);
}

async function getFlipState(username) {
    const result = await pool.query(
        'SELECT * FROM flip_states WHERE username = $1',
        [username]
    );

    if (result.rows.length === 0) {
        const board = createFlipBoard();
        const flipped = Array(9).fill(false);
        await pool.query(
            `INSERT INTO flip_states (username, board, flipped, created_at, updated_at)
             VALUES ($1, $2, $3, (NOW() AT TIME ZONE 'Asia/Shanghai'), (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
            [username, JSON.stringify(board), JSON.stringify(flipped)]
        );
        return {
            board,
            flipped,
            good_count: 0,
            bad_count: 0,
            ended: false
        };
    }

    return {
        board: result.rows[0].board,
        flipped: result.rows[0].flipped,
        good_count: result.rows[0].good_count,
        bad_count: result.rows[0].bad_count,
        ended: result.rows[0].ended
    };
}

async function saveFlipState(username, state) {
    await pool.query(
        `UPDATE flip_states
         SET board = $1, flipped = $2, good_count = $3, bad_count = $4, ended = $5,
             updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
         WHERE username = $6`,
        [
            JSON.stringify(state.board),
            JSON.stringify(state.flipped),
            state.good_count,
            state.bad_count,
            state.ended,
            username
        ]
    );
}

async function logFlipAction({
    username,
    actionType,
    cost = 0,
    reward = 0,
    cardIndex = null,
    cardType = null,
    goodCount = 0,
    badCount = 0,
    ended = false
}) {
    try {
        await pool.query(
            `INSERT INTO flip_logs (
                username, action_type, cost, reward, card_index, card_type,
                good_count, bad_count, ended, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
            [
                username,
                actionType,
                cost,
                reward,
                cardIndex,
                cardType,
                goodCount,
                badCount,
                ended
            ]
        );
    } catch (error) {
        console.error('Flip log error:', error);
    }
}

function randomStoneColor() {
    return stoneColors[crypto.randomInt(0, stoneColors.length)];
}

function normalizeStoneSlots(slots) {
    const normalized = Array.isArray(slots) ? slots.slice(0, 6) : [];
    while (normalized.length < 6) {
        normalized.push(null);
    }
    return normalized;
}

function getMaxSameCount(slots) {
    const counts = {};
    slots.forEach((color) => {
        if (!color) return;
        counts[color] = (counts[color] || 0) + 1;
    });
    const values = Object.values(counts);
    return values.length ? Math.max(...values) : 0;
}

async function getStoneState(username) {
    const result = await pool.query(
        'SELECT slots FROM stone_states WHERE username = $1',
        [username]
    );

    if (result.rows.length === 0) {
        const slots = normalizeStoneSlots([]);
        await pool.query(
            `INSERT INTO stone_states (username, slots, created_at, updated_at)
             VALUES ($1, $2, (NOW() AT TIME ZONE 'Asia/Shanghai'), (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
            [username, JSON.stringify(slots)]
        );
        return slots;
    }

    return normalizeStoneSlots(result.rows[0].slots);
}

async function saveStoneState(username, slots) {
    await pool.query(
        `UPDATE stone_states
         SET slots = $1, updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
         WHERE username = $2`,
        [JSON.stringify(slots), username]
    );
}

async function logStoneAction({
    username,
    actionType,
    cost = 0,
    reward = 0,
    slotIndex = null,
    beforeSlots,
    afterSlots
}) {
    try {
        await pool.query(
            `INSERT INTO stone_logs (
                username, action_type, cost, reward, slot_index, before_slots, after_slots, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
            [
                username,
                actionType,
                cost,
                reward,
                slotIndex,
                JSON.stringify(beforeSlots || []),
                JSON.stringify(afterSlots || [])
            ]
        );
    } catch (error) {
        console.error('Stone log error:', error);
    }
}

// ====================
// 祈愿背包 API
// ====================

async function enqueueWishInventorySend({ inventoryId, username, isAuto = false }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const inventoryResult = await client.query(`
            SELECT id, username, gift_type, gift_name, bilibili_gift_id, status, expires_at
            FROM wish_inventory
            WHERE id = $1 AND username = $2
            FOR UPDATE
        `, [inventoryId, username]);

        if (inventoryResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: '背包物品不存在' };
        }

        const item = inventoryResult.rows[0];
        if (item.status !== 'stored') {
            await client.query('ROLLBACK');
            return { success: false, message: '该物品已处理' };
        }

        const userResult = await client.query(
            'SELECT bilibili_room_id FROM users WHERE username = $1',
            [username]
        );

        const bilibiliRoomId = userResult.rows.length > 0 ? userResult.rows[0].bilibili_room_id : null;
        if (!bilibiliRoomId) {
            if (isAuto) {
                await client.query(`
                    UPDATE wish_inventory
                    SET status = 'stored',
                        expires_at = NULL,
                        updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                    WHERE id = $1
                `, [inventoryId]);
                await client.query('COMMIT');
                return { success: false, message: '未绑定房间号，暂不送出' };
            }

            await client.query('ROLLBACK');
            return { success: false, message: '请先绑定B站房间号再送出礼物' };
        }

        const exchangeResult = await client.query(`
            INSERT INTO gift_exchanges (
                username, gift_type, gift_name, cost, quantity, status, created_at,
                bilibili_room_id, delivery_status
            ) VALUES ($1, $2, $3, $4, $5, 'funds_locked', (NOW() AT TIME ZONE 'Asia/Shanghai'), $6, 'pending')
            RETURNING id
        `, [
            username,
            item.gift_type,
            item.gift_name,
            0,
            1,
            bilibiliRoomId
        ]);

        await client.query(`
            UPDATE wish_inventory
            SET status = 'queued',
                gift_exchange_id = $1,
                updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
            WHERE id = $2
        `, [exchangeResult.rows[0].id, inventoryId]);

        await client.query('COMMIT');
        return { success: true, exchangeId: exchangeResult.rows[0].id };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('背包礼物入队失败:', error);
        return { success: false, message: '送出失败，请稍后重试' };
    } finally {
        client.release();
    }
}

let isWishAutoSendRunning = false;
async function autoSendExpiredWishRewards() {
    if (isWishAutoSendRunning) {
        return;
    }
    isWishAutoSendRunning = true;

    try {
        const expiredItems = await pool.query(`
            SELECT wi.id, wi.username, u.bilibili_room_id
            FROM wish_inventory wi
            JOIN users u ON u.username = wi.username
            WHERE wi.status = 'stored'
              AND wi.expires_at <= (NOW() AT TIME ZONE 'Asia/Shanghai')
            ORDER BY wi.expires_at ASC
            LIMIT 20
        `);

        for (const row of expiredItems.rows) {
            if (!row.bilibili_room_id) {
                await pool.query(`
                    UPDATE wish_inventory
                    SET expires_at = NULL,
                        updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                    WHERE id = $1
                `, [row.id]);
                continue;
            }

            await enqueueWishInventorySend({
                inventoryId: row.id,
                username: row.username,
                isAuto: true
            });
        }
    } catch (error) {
        console.error('自动发送祈愿礼物失败:', error);
    } finally {
        isWishAutoSendRunning = false;
    }
}

async function autoSendWishInventoryOnBind(username) {
    try {
        const storedItems = await pool.query(`
            SELECT id
            FROM wish_inventory
            WHERE username = $1
              AND status = 'stored'
              AND expires_at IS NULL
            ORDER BY created_at ASC
            LIMIT 50
        `, [username]);

        for (const row of storedItems.rows) {
            await enqueueWishInventorySend({
                inventoryId: row.id,
                username,
                isAuto: true
            });
        }
    } catch (error) {
        console.error('绑定房间号后自动送出失败:', error);
    }
}

setInterval(autoSendExpiredWishRewards, 60 * 1000);

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        games: ['quiz', 'slot', 'scratch', 'spin', 'wish', 'stone', 'flip', 'duel'],
        questions: questions.length
    });
});

// 🛡️ 安全修复：API密钥验证中间件 - 只允许header传key，禁止query参数
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key']; // 仅从header获取，不再支持query参数
    const validApiKey = process.env.WINDOWS_API_KEY || 'INVALID_DEFAULT_KEY';
    
    // 生产环境不允许默认密钥
    if (process.env.NODE_ENV === 'production' && validApiKey === 'INVALID_DEFAULT_KEY') {
        console.error('🚨 生产环境错误: WINDOWS_API_KEY 环境变量未设置');
        return res.status(500).json({ 
            success: false, 
            message: '服务配置错误' 
        });
    }
    
    if (!apiKey || !validApiKey || apiKey !== validApiKey) {
        return res.status(401).json({ 
            success: false, 
            message: '无效的API密钥' 
        });
    }
    
    next();
}

// ====================
// 路由注册
// ====================

registerAdminRoutes(app, {
    pool,
    bcrypt,
    BalanceLogger,
    generateCSRFToken,
    requireLogin,
    requireAdmin,
    requireAuthorized,
    requireCSRF,
    security,
    autoSendWishInventoryOnBind,
    IPManager,
    SessionManager,
    notifySecurityEvent,
    path
});

registerGiftRoutes(app, {
    pool,
    giftConfig,
    BalanceLogger,
    requireLogin,
    requireAuthorized,
    requireApiKey,
    security
});

registerWishRoutes(app, {
    pool,
    BalanceLogger,
    GameLogic,
    getWishConfig,
    requireLogin,
    requireAuthorized,
    security,
    generateCSRFToken,
    broadcastDanmaku,
    enqueueWishInventorySend
});

registerGameRoutes(app, {
    pool,
    BalanceLogger,
    GameLogic,
    questions,
    generateCSRFToken,
    generateUsername,
    requireLogin,
    requireAuthorized,
    security,
    userSessions,
    questionMap,
    randomStoneColor,
    normalizeStoneSlots,
    getMaxSameCount,
    getStoneState,
    saveStoneState,
    logStoneAction,
    stoneRewards,
    stoneReplaceCosts,
    flipCosts,
    flipCashoutRewards,
    createFlipBoard,
    getFlipState,
    saveFlipState,
    logFlipAction,
    duelRewards,
    calculateDuelCost
});

// 404 处理（必须在所有API路由之后）
app.use('*', (req, res) => {
    res.redirect('/');
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).redirect('/');
});

server.listen(PORT, async () => {
    console.log(`🎮 游戏服务器运行在端口 ${PORT}`);
    console.log(`📚 题库包含 ${questions.length} 道题目`);
    console.log(`🌐 访问 http://localhost:${PORT} 开始游戏`);
    console.log(`🚀 WebSocket飘屏系统已启动`);
    console.log(`🎁 B站送礼功能已启用`);
    
    // 启动后进行数据库初始化
    await initializeDatabase();
});

// 优雅关闭处理
process.on('SIGINT', async () => {
    console.log('\n🔄 正在优雅关闭服务器...');
    
    try {
        // Windows监听服务独立运行，无需清理
        
        // 关闭数据库连接池
        if (pool) {
            await pool.end();
            console.log('✅ 数据库连接已关闭');
        }
        
        console.log('✅ 服务器已优雅关闭');
        process.exit(0);
    } catch (error) {
        console.error('❌ 关闭服务器时发生错误:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('🔄 收到SIGTERM信号，正在关闭...');
    
    try {
        // Windows监听服务独立运行，无需清理
        
        if (pool) {
            await pool.end();
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 关闭时发生错误:', error);
        process.exit(1);
    }
});
