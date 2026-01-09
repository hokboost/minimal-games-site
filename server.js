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
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://yourdomain.com"] // 🚨 生产环境请替换为实际域名
            : ["http://localhost:3000", "http://127.0.0.1:3000"],
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
            isAdmin: sessionData.user.is_admin || false
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
function notifySecurityEvent(username, event) {
    console.log(`🔔 尝试发送安全警告给用户 ${username}: ${event.type}`);
    
    if (userSockets.has(username)) {
        const socketIds = userSockets.get(username);
        console.log(`📡 用户 ${username} 有 ${socketIds.size} 个WebSocket连接`);
        
        let sentCount = 0;
        for (const socketId of socketIds) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
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
    script-src 'self' 'unsafe-inline';
    script-src-elem 'self' 'unsafe-inline';
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

// 认证中间件
const requireLogin = (req, res, next) => {
    if (!req.session.user) {
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
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9999);
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

// 个人资料页面
app.get('/profile', requireLogin, async (req, res) => {
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

// 礼物兑换页面
app.get('/gifts', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const userResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );
        
        const balance = userResult.rows.length > 0 ? userResult.rows[0].balance : 0;
        
        res.render('gifts', {
            title: '礼物兑换 - Minimal Games',
            user: req.session.user,
            balance: balance
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).send('服务器错误');
    }
});

// 管理员后台
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
    try {
        // 初始化session
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req); // 统一使用csrf库
        }
        
        const usersResult = await pool.query(
            'SELECT username, balance, spins_allowed, authorized, is_admin, login_failures, last_failure_time, locked_until FROM users ORDER BY username'
        );
        
        const users = usersResult.rows.map(user => ({
            ...user,
            is_locked: user.locked_until && new Date(user.locked_until) > new Date(),
            lock_minutes: user.locked_until ? Math.ceil((new Date(user.locked_until) - new Date()) / 60000) : 0
        }));
        
        res.render('admin', {
            title: '管理后台 - Minimal Games',
            user: req.session.user,
            userLoggedIn: req.session.user?.username,
            users: users,
            csrfToken: req.session.csrfToken
        });
    } catch (err) {
        console.error('❌ 管理员页面加载失败:', err);
        res.status(500).send("后台加载失败");
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
// 管理员API路由
// ====================

// 添加电币
app.post('/api/admin/add-electric-coin', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username, amount } = req.body;
        
        if (!username || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: '参数错误：用户名和电币数量必须有效' });
        }
        
        if (amount > 100000) {
            return res.status(400).json({ success: false, message: '单次添加不能超过100,000电币' });
        }
        
        // 使用余额日志系统进行管理员充值
        const balanceResult = await BalanceLogger.updateBalance({
            username: username,
            amount: parseFloat(amount),
            operationType: 'admin_add',
            description: `管理员充值：添加 ${amount} 电币`,
            gameData: {
                admin_user: req.session.user.username,
                amount: amount,
                type: 'manual_recharge'
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requireSufficientBalance: false
        });
        
        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }
        
        res.json({ 
            success: true, 
            newBalance: balanceResult.balance,
            addedAmount: parseFloat(amount)
        });
    } catch (error) {
        console.error('添加电币失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 授权用户
app.post('/api/admin/authorize-user', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        await pool.query(
            'UPDATE users SET authorized = true WHERE username = $1',
            [username]
        );
        
        res.json({ success: true, message: '授权成功' });
    } catch (error) {
        console.error('授权失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 取消授权
app.post('/api/admin/unauthorize-user', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        await pool.query(
            'UPDATE users SET authorized = false WHERE username = $1',
            [username]
        );
        
        res.json({ success: true, message: '取消授权成功' });
    } catch (error) {
        console.error('取消授权失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 重置密码
app.post('/api/admin/reset-password', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username, newPassword = '123456' } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE username = $2',
            [hashedPassword, username]
        );
        
        res.json({ success: true, message: '密码重置成功' });
    } catch (error) {
        console.error('重置密码失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 添加CSRF中间件
const requireCSRF = (req, res, next) => {
    const providedToken = req.body.csrfToken || req.headers['x-csrf-token'];
    if (!verifyCSRFToken(req, providedToken)) {
        return res.status(403).json({ success: false, message: 'CSRF token验证失败' });
    }
    next();
};

// 修改用户余额 - 添加CSRF保护
app.post('/api/admin/update-balance', requireLogin, requireAdmin, requireCSRF, async (req, res) => {
    try {
        const { username, balance } = req.body;
        const adminUsername = req.session.user.username;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        if (balance === undefined || balance < 0) {
            return res.status(400).json({ success: false, message: '无效的余额数值' });
        }

        // 获取当前余额
        const currentBalanceResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );

        if (currentBalanceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }

        const currentBalance = currentBalanceResult.rows[0].balance;
        const delta = balance - currentBalance;

        // 使用BalanceLogger进行安全的余额修改（带审计和原子锁）
        const balanceResult = await BalanceLogger.updateBalance({
            username: username,
            amount: delta,
            operationType: 'admin_balance_adjustment',
            description: `管理员 ${adminUsername} 将余额从 ${currentBalance} 调整为 ${balance}`,
            gameData: {
                admin_username: adminUsername,
                old_balance: currentBalance,
                new_balance: balance,
                delta: delta
            },
            ipAddress: req.clientIP,
            userAgent: req.userAgent,
            requireSufficientBalance: false // 管理员操作允许负余额调整
        });

        if (!balanceResult.success) {
            return res.status(500).json({ 
                success: false, 
                message: `余额修改失败: ${balanceResult.message}` 
            });
        }
        
        res.json({ 
            success: true, 
            message: '余额修改成功', 
            newBalance: balance,
            oldBalance: currentBalance
        });
    } catch (error) {
        console.error('修改余额失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 删除账户
app.post('/api/admin/delete-account', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        // 防止删除管理员账户
        const userResult = await pool.query(
            'SELECT is_admin FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows[0]?.is_admin) {
            return res.status(403).json({ success: false, message: '不能删除管理员账户' });
        }
        
        await pool.query('DELETE FROM users WHERE username = $1', [username]);
        
        res.json({ success: true, message: '账户删除成功' });
    } catch (error) {
        console.error('删除账户失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 解锁账户
app.post('/api/admin/unlock-account', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        await pool.query(
            'UPDATE users SET login_failures = 0, last_failure_time = NULL, locked_until = NULL WHERE username = $1',
            [username]
        );
        
        res.json({ success: true, message: '账户解锁成功' });
    } catch (error) {
        console.error('解锁账户失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 清除失败记录
app.post('/api/admin/clear-failures', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        await pool.query(
            'UPDATE users SET login_failures = 0, last_failure_time = NULL WHERE username = $1',
            [username]
        );
        
        res.json({ success: true, message: '失败记录清除成功' });
    } catch (error) {
        console.error('清除失败记录失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 管理员修改自己密码
app.post('/api/admin/change-self-password', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const username = req.session.user.username;
        
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '缺少必要参数' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: '新密码长度至少需要6位' });
        }
        
        // 验证当前密码
        const userResult = await pool.query('SELECT password FROM users WHERE username = $1', [username]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        const isOldPasswordValid = await bcrypt.compare(oldPassword, userResult.rows[0].password);
        
        if (!isOldPasswordValid) {
            return res.status(400).json({ success: false, message: '当前密码错误' });
        }
        
        // 加密新密码
        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        
        // 更新密码
        await pool.query(
            'UPDATE users SET password = $1 WHERE username = $2',
            [hashedNewPassword, username]
        );
        
        res.json({ success: true, message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ====================
// 游戏路由
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

app.get('/quiz', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        // 🛡️ 安全修复：统一使用csrf库生成token
        generateCSRFToken(req);
    }
    
    const username = req.session.user.username;
    
    // 获取用户电币余额
    let balance = 0;
    try {
        const result = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );
        balance = result.rows.length > 0 ? result.rows[0].balance : 0;
    } catch (dbError) {
        console.error('Database query error:', dbError);
    }
    
    res.render('quiz', { 
        username,
        balance,
        csrfToken: req.session.csrfToken
    });
});

// Quiz 开始游戏 API - 扣除电币
app.post('/api/quiz/start', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        const { username } = req.body;
        
        // 验证用户名
        if (username !== req.session.user.username) {
            return res.status(403).json({ success: false, message: '用户名不匹配' });
        }
        
        // 使用余额日志系统扣除电币
        const balanceResult = await BalanceLogger.updateBalance({
            username: username,
            amount: -10,
            operationType: 'quiz_start',
            description: '开始答题游戏',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }
        
        res.json({ 
            success: true, 
            message: '游戏开始，已扣除10电币',
            newBalance: balanceResult.balance 
        });
    } catch (error) {
        console.error('Quiz start error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.get('/slot', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        // 初始化session
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req); // 统一使用csrf库
        }
        
        const username = req.session.user.username;
        
        // 获取用户余额
        const userResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );
        
        const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;
        
        res.render('slot', { 
            username,
            balance,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Slot page error:', error);
        res.status(500).send('服务器错误');
    }
});

app.get('/scratch', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        // 初始化session
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req); // 统一使用csrf库
        }
        
        const username = req.session.user.username;
        
        // 获取用户余额
        const userResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );
        
        const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;
        
        res.render('scratch', { 
            username,
            balance,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Scratch page error:', error);
        res.status(500).send('服务器错误');
    }
});

app.get('/spin', requireLogin, requireAuthorized, security.basicRateLimit, (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        // 🛡️ 安全修复：统一使用csrf库生成token
        generateCSRFToken(req);
    }
    
    const username = req.session.user.username;
    res.render('spin', { 
        username,
        csrfToken: req.session.csrfToken
    });
});

app.get('/wish', requireLogin, requireAuthorized, security.basicRateLimit, (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        // 🛡️ 安全修复：统一使用csrf库生成token
        generateCSRFToken(req);
    }
    
    const username = req.session.user.username;
    let balance = 0;
    
    pool.query(
        'SELECT balance FROM users WHERE username = $1',
        [username]
    ).then((result) => {
        balance = result.rows.length > 0 ? parseFloat(result.rows[0].balance) : 0;
        res.render('wish', { 
            username,
            balance,
            csrfToken: req.session.csrfToken,
            canWishTest: username === 'hokboost'
        });
    }).catch((dbError) => {
        console.error('Database query error:', dbError);
        res.render('wish', { 
            username,
            balance,
            csrfToken: req.session.csrfToken,
            canWishTest: username === 'hokboost'
        });
    });
});

app.get('/stone', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req);
        }

        const username = req.session.user.username;
        const userResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );

        const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

        res.render('stone', {
            username,
            balance,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Stone page error:', error);
        res.status(500).send('服务器错误');
    }
});

app.get('/flip', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req);
        }

        const username = req.session.user.username;
        const userResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );

        const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

        res.render('flip', {
            username,
            balance,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Flip page error:', error);
        res.status(500).send('服务器错误');
    }
});

app.get('/duel', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req);
        }

        const username = req.session.user.username;
        const userResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );

        const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

        res.render('duel', {
            username,
            balance,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Duel page error:', error);
        res.status(500).send('服务器错误');
    }
});

// Quiz API 路由
app.get('/api/user-info', security.basicRateLimit, (req, res) => {
    const username = generateUsername();
    res.json({ success: true, username });
});

app.post('/api/quiz/next', 
    requireLogin,
    requireAuthorized,
    security.basicRateLimit,
    security.csrfProtection,
    (req, res) => {
    try {
        const { username, seen = [], questionIndex = 0 } = req.body;
        
        const question = GameLogic.quiz.getRandomQuestion(questions, seen, questionIndex);
        if (!question) {
            return res.json({ success: false, message: '没有更多题目了' });
        }
        
        const token = GameLogic.generateToken(16);
        const signature = GameLogic.generateToken(16);
        
        // 存储问题信息
        if (!userSessions.has(username)) {
            userSessions.set(username, {});
        }
        userSessions.get(username)[token] = {
            questionId: question.id,
            timestamp: Date.now()
        };
        
        res.json({
            success: true,
            question: {
                id: question.id,
                question: question.question,
                options: question.options
            },
            token,
            signature
        });
    } catch (error) {
        console.error('Quiz next error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/quiz/submit', 
    requireLogin,
    requireAuthorized,
    security.basicRateLimit,
    security.csrfProtection,
    async (req, res) => {
    try {
        const { username, answers = [] } = req.body;
        
        // 验证用户名与登录用户一致
        if (username !== req.session.user.username) {
            return res.status(403).json({ success: false, message: '用户名不匹配' });
        }
        
        let correctCount = 0;
        const userSession = userSessions.get(username) || {};
        
        for (const answer of answers) {
            const sessionData = userSession[answer.token];
            if (sessionData) {
                const question = questionMap.get(sessionData.questionId);
                if (question && GameLogic.quiz.validateAnswer(question, answer.answerIndex)) {
                    correctCount++;
                }
            } else {
                console.warn(`Missing session data for token: ${answer.token}, user: ${username}`);
            }
        }
        
        // 存储到数据库 - 完全对齐kingboost格式
        try {
            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-${Date.now()}-${Math.random()}`)
                .digest('hex');
                
            // 存储主记录到submissions表
            const submissionResult = await pool.query(
                'INSERT INTO submissions (username, score, submitted_at, proof) VALUES ($1, $2, NOW(), $3) RETURNING id',
                [username, correctCount, proof]
            );
            
            const submissionId = submissionResult.rows[0].id;
            
            // 存储详细答题记录到submission_details表
            for (let i = 0; i < answers.length; i++) {
                const answer = answers[i];
                const userSession = userSessions.get(username) || {};
                const sessionData = userSession[answer.token];
                
                if (sessionData) {
                    const question = questionMap.get(sessionData.questionId);
                    if (question) {
                        const userAnswer = question.options[answer.answerIndex];
                        const correctAnswer = question.options[question.correct];
                        const isCorrect = answer.answerIndex === question.correct;
                        
                        await pool.query(
                            'INSERT INTO submission_details (submission_id, question_id, user_answer, is_correct, correct_answer) VALUES ($1, $2, $3, $4, $5)',
                            [submissionId, question.id, userAnswer, isCorrect, correctAnswer]
                        );
                    }
                }
            }
        } catch (dbError) {
            console.error('数据库存储失败:', dbError);
        }
        
        // 清理用户会话
        if (Object.keys(userSession).length > 0) {
            userSessions.delete(username);
        }
        
        // 发放电币奖励 (得分 × 2)
        const reward = correctCount * 2;
        let newBalance = 0;
        
        if (reward > 0) {
            const balanceResult = await BalanceLogger.updateBalance({
                username: username,
                amount: reward,
                operationType: 'quiz_reward',
                description: `答题奖励：${correctCount}题正确 × 2电币`,
                gameData: {
                    score: correctCount,
                    total: answers.length,
                    reward: reward
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false
            });
            
            if (balanceResult.success) {
                newBalance = balanceResult.balance;
            } else {
                console.error('电币奖励发放失败:', balanceResult.message);
            }
        }
        
        res.json({
            success: true,
            score: correctCount,
            total: answers.length,
            reward: reward,
            newBalance: newBalance,
            proof: GameLogic.generateToken(8)
        });
    } catch (error) {
        console.error('Quiz submit error:', error);
        res.status(500).json({ success: false, message: '提交失败' });
    }
});

// Quiz 排行榜 API
app.get('/api/quiz/leaderboard', requireLogin, requireAuthorized, async (req, res) => {
    try {
        // 修改为只显示每个账号的最高分
        const result = await pool.query(
            `SELECT username, MAX(score) as score, 
                    (SELECT submitted_at FROM submissions s2 
                     WHERE s2.username = s1.username AND s2.score = MAX(s1.score) 
                     ORDER BY submitted_at DESC LIMIT 1) as submitted_at
             FROM submissions s1
             WHERE DATE(submitted_at) = CURRENT_DATE
               AND s1.username NOT IN (SELECT username FROM users WHERE is_admin = TRUE)
             GROUP BY username
             ORDER BY score DESC, submitted_at ASC 
             LIMIT 20`
        );
        
        res.json({
            success: true,
            leaderboard: result.rows
        });
    } catch (error) {
        console.error('Quiz leaderboard error:', error);
        res.status(500).json({ success: false, message: '获取排行榜失败' });
    }
});

// 余额变动记录 API
app.get('/api/balance/logs', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        
        const logs = await BalanceLogger.getUserBalanceLogs(username, limit, offset);
        
        res.json({
            success: true,
            logs: logs,
            page: page,
            limit: limit
        });
    } catch (error) {
        console.error('Balance logs error:', error);
        res.status(500).json({ success: false, message: '获取记录失败' });
    }
});

// ====================
// 礼物兑换 API
// ====================

// 礼物兑换
app.post('/api/gifts/exchange', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    console.log('🚀 [DEBUG] 礼物兑换API开始执行');
    console.log('🚀 [DEBUG] 请求体:', JSON.stringify(req.body, null, 2));
    console.log('🚀 [DEBUG] 用户session:', req.session?.user);
    
    // ✅ FIX: 提前声明，避免外层catch作用域拿不到
    let username = 'unknown';
    // ✅ FIX: 事务内拿到的值需要在事务外继续用
    let currentBalance;
    let bilibiliRoomId;

    try {
        const { giftType, cost, quantity = 1 } = req.body;
        username = req.session.user.username; // ✅ FIX: 不再用const，赋值到外层变量
        const clientIP = req.clientIP;
        const userAgent = req.userAgent;

        console.log(`🔍 [DEBUG] 解析后参数: giftType=${giftType}, cost=${cost}, quantity=${quantity}, username=${username}`);
        console.log(`🔍 [DEBUG] 客户端信息: IP=${clientIP}, UA=${userAgent}`);

        // ✅ FIX: 统一把 cost / quantity 转成数字，避免 "150" !== 150
        const costNum = Number(cost);
        const quantityNum = Number(quantity);

        // 验证输入参数
        if (!giftType || !Number.isFinite(costNum) || quantityNum < 1) { // ✅ FIX
            console.log('❌ [DEBUG] 参数验证失败:', { giftType, cost, quantity });
            return res.status(400).json({ 
                success: false, 
                message: '参数不完整或数量无效' 
            });
        }
        console.log('✅ [DEBUG] 参数验证通过');

        // 验证数量上限
        if (quantityNum > 100) { // ✅ FIX
            return res.status(400).json({ 
                success: false, 
                message: '单次最多只能兑换100个礼物' 
            });
        }

        // 从配置文件获取可用的礼物类型
        console.log('🔍 [DEBUG] giftConfig状态:', { hasConfig: !!giftConfig, hasMapping: !!giftConfig.礼物映射 });
        
        const availableGifts = {};
        if (giftConfig.礼物映射) {
            console.log('✅ [DEBUG] 使用配置文件中的礼物映射');
            for (const [key, config] of Object.entries(giftConfig.礼物映射)) {
                availableGifts[key] = {
                    name: config.名称,
                    cost: config.电币成本,
                    bilibili_id: config.bilibili_id
                };
                console.log(`🔍 [DEBUG] 加载礼物: ${key} = ${JSON.stringify(availableGifts[key])}`);
            }
        } else {
            console.log('⚠️ [DEBUG] 配置文件无效，使用备用配置');
            // 备用配置
            availableGifts.heartbox = { name: '心动盲盒', cost: 150, bilibili_id: '32251' };
            availableGifts.fanlight = { name: '粉丝团灯牌', cost: 1, bilibili_id: '31164' };
        }
        
        console.log('🔍 [DEBUG] 最终可用礼物:', availableGifts);

        // 验证礼物类型
        if (!availableGifts[giftType]) {
            return res.status(400).json({ 
                success: false, 
                message: '无效的礼物类型' 
            });
        }

        // 验证价格（考虑数量）
        const expectedTotalCost = availableGifts[giftType].cost * quantityNum; // ✅ FIX
        if (costNum !== expectedTotalCost) { // ✅ FIX
            return res.status(400).json({ 
                success: false, 
                message: `价格不匹配，期望价格: ${expectedTotalCost} 电币` 
            });
        }

        // 🛡️ 真正的预扣机制：在事务中原子地检查余额、锁住资金并创建任务
        console.log('🔍 [DEBUG] 开始数据库事务操作');
        const client = await pool.connect();
        let insertResult;
        try {
            console.log('🔍 [DEBUG] 开始事务');
            await client.query('BEGIN');
            
            // 1. 锁定用户行并检查余额
            console.log(`🔍 [DEBUG] 查询用户 ${username} 的余额和房间号`);
            const lockResult = await client.query(
                'SELECT balance, bilibili_room_id FROM users WHERE username = $1 FOR UPDATE',
                [username]
            );
            console.log('🔍 [DEBUG] 数据库查询结果:', lockResult.rows);
            
            if (lockResult.rows.length === 0) {
                throw new Error('用户不存在');
            }

            // ✅ FIX: 去掉const解构，写入外层变量供事务外使用
            currentBalance = Number(lockResult.rows[0].balance);
            bilibiliRoomId = lockResult.rows[0].bilibili_room_id;

            console.log(`🔍 [DEBUG] 用户信息: 余额=${currentBalance}, 房间号=${bilibiliRoomId}`);
            
            if (currentBalance < costNum) { // ✅ FIX
                console.log(`❌ [DEBUG] 余额不足: 当前=${currentBalance}, 需要=${costNum}`); // ✅ FIX
                throw new Error(`余额不足！当前余额: ${currentBalance} 电币，需要: ${costNum} 电币`); // ✅ FIX
            }
            console.log('✅ [DEBUG] 余额检查通过');

            // 2. 检查是否有pending的任务（防止重复兑换）
            console.log('🔍 [DEBUG] 检查是否有pending任务');
            const pendingResult = await client.query(
                'SELECT COUNT(*) as count FROM gift_exchanges WHERE username = $1 AND delivery_status IN ($2, $3)',
                [username, 'pending', 'processing']
            );
            console.log('🔍 [DEBUG] pending任务查询结果:', pendingResult.rows);

            if (parseInt(pendingResult.rows[0].count) > 0) {
                console.log('❌ [DEBUG] 检测到pending任务，阻止兑换');
                throw new Error('您有礼物正在发送中，请等待完成后再兑换');
            }
            console.log('✅ [DEBUG] 无pending任务，可以继续');

            // 3. 立即锁住资金（从余额中扣除，但标记为frozen）
            console.log(`🔍 [DEBUG] 扣除资金: ${costNum} 电币`); // ✅ FIX
            await client.query(
                'UPDATE users SET balance = balance - $1 WHERE username = $2',
                [costNum, username] // ✅ FIX
            );
            console.log('✅ [DEBUG] 资金扣除完成');

            // 4. 创建任务记录，标记资金已锁定
            console.log('🔍 [DEBUG] 创建礼物兑换任务记录');
            const insertParams = [username, giftType, availableGifts[giftType].name, costNum, quantityNum, bilibiliRoomId,  // ✅ FIX
                bilibiliRoomId ? 'pending' : 'no_room'];
            console.log('🔍 [DEBUG] INSERT参数:', insertParams);
            
            insertResult = await client.query(`
                INSERT INTO gift_exchanges (
                    username, gift_type, gift_name, cost, quantity, status, created_at,
                    bilibili_room_id, delivery_status
                ) VALUES ($1, $2, $3, $4, $5, 'funds_locked', NOW(), $6, $7)
                RETURNING id
            `, insertParams);
            console.log('✅ [DEBUG] 任务记录创建成功:', insertResult.rows);

            console.log('🔍 [DEBUG] 提交事务');
            await client.query('COMMIT');
            console.log('✅ [DEBUG] 事务提交成功');
            
            console.log(`🔒 用户 ${username} 资金已锁定: ${costNum} 电币，剩余余额: ${currentBalance - costNum} 电币`); // ✅ FIX
            
        } catch (error) {
            console.log('💥 [DEBUG] 事务中发生错误:', error.message);
            console.log('💥 [DEBUG] 错误堆栈:', error.stack);
            await client.query('ROLLBACK');
            console.log('🔍 [DEBUG] 事务已回滚');
            console.error('兑换事务失败:', error.message);
            return res.status(400).json({ 
                success: false, 
                message: error.message 
            });
        } finally {
            console.log('🔍 [DEBUG] 释放数据库连接');
            client.release();
        }

        const exchangeId = insertResult.rows[0].id;

        console.log(`✅ 用户 ${username} 成功兑换 ${availableGifts[giftType].name} x${quantityNum}，花费 ${costNum} 电币`); // ✅ FIX

        // 礼物将由Windows监听服务处理，无需立即发送
        let deliveryMessage = '';
        if (bilibiliRoomId) {
            console.log(`🎁 礼物兑换记录已创建，等待Windows监听服务处理...`);
            deliveryMessage = '，礼物正在发送中，请稍候...';
        } else {
            console.log(`⚠️ 用户 ${username} 未绑定B站房间号，跳过礼物发送`);
            deliveryMessage = '，请先绑定B站房间号以发送礼物';
        }

        // 🛡️ 预扣机制：返回扣费后的余额
        res.json({ 
            success: true, 
            message: `兑换成功${deliveryMessage}`,
            newBalance: currentBalance - costNum, // ✅ FIX
            deliveryStatus: bilibiliRoomId ? 'pending' : 'no_room',
            note: '资金已锁定，礼物发送完成后确认扣费'
        });

    } catch (error) {
        console.error('🚨 礼物兑换严重错误:', {
            message: error.message,
            stack: error.stack,
            username: username || 'unknown', // ✅ FIX: 现在不会ReferenceError
            giftType: req.body?.giftType,
            cost: req.body?.cost,
            quantity: req.body?.quantity
        });
        res.status(500).json({ 
            success: false, 
            message: `服务器错误: ${error.message}` 
        });
    }
});


// 获取兑换历史
app.get('/api/gifts/history', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;

        // 尝试查询包含quantity字段，如果失败则使用不包含quantity的查询
        let result;
        try {
            result = await pool.query(`
                SELECT gift_type, gift_name, cost, quantity, status, created_at, delivery_status
                FROM gift_exchanges 
                WHERE username = $1 
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `, [username, limit, offset]);
        } catch (error) {
            if (error.code === '42703') { // column does not exist
                console.log('⚠️ quantity字段不存在，历史记录使用备用查询');
                result = await pool.query(`
                    SELECT gift_type, gift_name, cost, status, created_at, delivery_status
                    FROM gift_exchanges 
                    WHERE username = $1 
                    ORDER BY created_at DESC 
                    LIMIT $2 OFFSET $3
                `, [username, limit, offset]);
                // 为每行添加默认quantity
                result.rows.forEach(row => {
                    row.quantity = 1;
                });
            } else {
                throw error;
            }
        }

        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM gift_exchanges WHERE username = $1',
            [username]
        );

        const total = parseInt(totalResult.rows[0].total);

        res.json({
            success: true,
            history: result.rows,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('获取兑换历史失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 获取房间号绑定状态 (管理员可查看所有用户，普通用户只能查看自己)
app.get('/api/bilibili/room', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const isAdmin = req.session.user.is_admin;
        const targetUsername = req.query.username; // 管理员可通过查询参数指定用户
        
        // 普通用户只能查看自己的信息
        const usernameToQuery = (isAdmin && targetUsername) ? targetUsername : username;
        
        // 如果是管理员且未指定用户，返回所有用户的房间绑定信息
        if (isAdmin && !targetUsername) {
            const result = await pool.query(`
                SELECT username, bilibili_room_id, created_at as bind_time
                FROM users 
                WHERE bilibili_room_id IS NOT NULL
                ORDER BY username
            `);
            
            return res.json({
                success: true,
                isAdminView: true,
                allBindings: result.rows.map(row => ({
                    username: row.username,
                    roomId: row.bilibili_room_id,
                    bindTime: row.bind_time
                }))
            });
        }
        
        const result = await pool.query(`
            SELECT bilibili_room_id, created_at as bind_time
            FROM users 
            WHERE username = $1
        `, [usernameToQuery]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }
        
        const roomInfo = result.rows[0];
        
        res.json({
            success: true,
            username: usernameToQuery,
            roomId: roomInfo.bilibili_room_id || null,
            bindTime: roomInfo.bind_time,
            isBound: !!roomInfo.bilibili_room_id,
            isAdminView: isAdmin && targetUsername
        });
        
    } catch (error) {
        console.error('获取房间号失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 绑定或更新B站房间号 (仅管理员)
app.post('/api/bilibili/room', requireLogin, requireAdmin, security.basicRateLimit, async (req, res) => {
    try {
        const { roomId, targetUsername } = req.body;
        const adminUsername = req.session.user.username;
        const usernameToUpdate = targetUsername || adminUsername; // 允许管理员为其他用户设置房间号
        
        // 验证房间号格式（数字，6-12位）
        if (!roomId || !/^\d{6,12}$/.test(roomId.toString())) {
            return res.status(400).json({
                success: false,
                message: '房间号格式不正确，应为6-12位数字'
            });
        }
        
        // 如果指定了目标用户，验证用户是否存在
        if (targetUsername) {
            const userExistsResult = await pool.query(`
                SELECT username FROM users WHERE username = $1
            `, [targetUsername]);
            
            if (userExistsResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `用户 ${targetUsername} 不存在`
                });
            }
        }
        
        // 检查房间号是否已被其他用户绑定
        const existingResult = await pool.query(`
            SELECT username FROM users 
            WHERE bilibili_room_id = $1 AND username != $2
        `, [roomId, usernameToUpdate]);
        
        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `房间号 ${roomId} 已被用户 ${existingResult.rows[0].username} 绑定`
            });
        }
        
        // 更新用户的房间号
        await pool.query(`
            UPDATE users 
            SET bilibili_room_id = $1 
            WHERE username = $2
        `, [roomId, usernameToUpdate]);
        
        console.log(`✅ 管理员 ${adminUsername} 为用户 ${usernameToUpdate} 成功绑定B站房间号: ${roomId}`);
        
        res.json({
            success: true,
            message: `成功为用户 ${usernameToUpdate} 绑定B站房间号: ${roomId}`,
            roomId: roomId,
            targetUser: usernameToUpdate
        });
        
    } catch (error) {
        console.error('绑定房间号失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 手动刷新B站Cookie (仅管理员)
app.post('/api/bilibili/cookies/refresh', requireLogin, requireAdmin, security.basicRateLimit, async (req, res) => {
    try {
        console.log(`🔄 管理员 ${req.session.user.username} 请求刷新B站Cookie`);
        
        // Cookie现在由Windows监听服务管理
        const refreshResult = { success: true, message: 'Cookie由Windows监听服务管理' };
        
        if (refreshResult.success) {
            console.log('✅ Cookie刷新成功');
            res.json({
                success: true,
                message: refreshResult.message
            });
        } else {
            console.log('❌ Cookie刷新失败');
            res.status(500).json({
                success: false,
                message: refreshResult.error || 'Cookie刷新失败'
            });
        }
        
    } catch (error) {
        console.error('❌ 刷新Cookie API失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 检查B站Cookie状态 (仅管理员)
app.get('/api/bilibili/cookies/status', requireLogin, requireAdmin, async (req, res) => {
    try {
        console.log(`🔍 管理员 ${req.session.user.username} 检查Cookie状态`);
        
        // Cookie现在由Windows监听服务管理
        const checkResult = { valid: true, message: 'Cookie由Windows监听服务管理' };
        
        res.json({
            success: true,
            expired: checkResult.expired || false,
            reason: checkResult.reason || 'Windows监听服务管理',
            lastCheck: Date.now(),
            nextCheck: Date.now() + 60000, // 1分钟后
            checkInterval: 60000 // 1分钟间隔
        });
        
    } catch (error) {
        console.error('❌ 检查Cookie状态失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 解除房间号绑定 (仅管理员)
app.delete('/api/bilibili/room', requireLogin, requireAdmin, security.basicRateLimit, async (req, res) => {
    try {
        const { targetUsername } = req.body;
        const adminUsername = req.session.user.username;
        const usernameToUpdate = targetUsername || adminUsername; // 允许管理员为其他用户解除绑定
        
        // 如果指定了目标用户，验证用户是否存在
        if (targetUsername) {
            const userExistsResult = await pool.query(`
                SELECT username FROM users WHERE username = $1
            `, [targetUsername]);
            
            if (userExistsResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `用户 ${targetUsername} 不存在`
                });
            }
        }
        
        await pool.query(`
            UPDATE users 
            SET bilibili_room_id = NULL 
            WHERE username = $1
        `, [usernameToUpdate]);
        
        console.log(`✅ 管理员 ${adminUsername} 为用户 ${usernameToUpdate} 成功解除B站房间号绑定`);
        
        res.json({
            success: true,
            message: `成功为用户 ${usernameToUpdate} 解除房间号绑定`,
            targetUser: usernameToUpdate
        });
        
    } catch (error) {
        console.error('解除房间号绑定失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 管理员查看所有余额记录 API
app.get('/api/admin/balance/logs', requireLogin, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = (page - 1) * limit;
        const operationType = req.query.type || null;
        
        const logs = await BalanceLogger.getAllBalanceLogs(limit, offset, operationType);
        
        res.json({
            success: true,
            logs: logs,
            page: page,
            limit: limit,
            operationType: operationType
        });
    } catch (error) {
        console.error('Admin balance logs error:', error);
        res.status(500).json({ success: false, message: '获取记录失败' });
    }
});

// ====================
// Slot 老虎机游戏API
// ====================

app.post('/api/slot/play', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const { username, betAmount } = req.body;
        
        // 验证用户名
        if (username !== req.session.user.username) {
            return res.status(403).json({ success: false, message: '用户名不匹配' });
        }
        
        // 验证投注金额
        if (!betAmount || betAmount < 1 || betAmount > 1000) {
            return res.status(400).json({ success: false, message: '投注金额必须在1-1000电币之间' });
        }
        
        // 扣除投注电币
        const betResult = await BalanceLogger.updateBalance({
            username: username,
            amount: -betAmount,
            operationType: 'slot_bet',
            description: `老虎机投注：${betAmount} 电币`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        if (!betResult.success) {
            return res.status(400).json({ success: false, message: betResult.message });
        }
        
        const currentBalance = betResult.balance;
        
        // 生成游戏结果 - 5种结果各20%概率
        const outcomes = [
            { type: '不亏不赚', multiplier: 1.0 },
            { type: '×2', multiplier: 2.0 },
            { type: '归零', multiplier: 0.0 },
            { type: '×1.5', multiplier: 1.5 },
            { type: '×0.5', multiplier: 0.5 }
        ];
        
        const randomIndex = Math.floor(Math.random() * 5);
        const outcome = outcomes[randomIndex];
        
        // 计算奖励
        const payout = Math.floor(betAmount * outcome.multiplier);
        
        // 发放奖励电币
        let finalBalance = currentBalance;
        if (payout > 0) {
            const winResult = await BalanceLogger.updateBalance({
                username: username,
                amount: payout,
                operationType: 'slot_win',
                description: `老虎机中奖：${outcome.type}，获得 ${payout} 电币`,
                gameData: {
                    bet_amount: betAmount,
                    outcome: outcome.type,
                    multiplier: outcome.multiplier,
                    payout: payout
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false
            });
            
            if (winResult.success) {
                finalBalance = winResult.balance;
            }
        }
        
        // 存储游戏记录到slot_results表（记录金额转动结果）
        try {
            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-${Date.now()}-${Math.random()}`)
                .digest('hex');
                
            // 生成三个金额转动结果（符合老虎机逻辑）
            const amounts = [5, 10, 20, 50, 100, 200, 500];
            const slot1 = amounts[Math.floor(Math.random() * amounts.length)];
            const slot2 = amounts[Math.floor(Math.random() * amounts.length)];
            const slot3 = amounts[Math.floor(Math.random() * amounts.length)];
            
            // 如果是中奖，让显示的金额与实际payout一致；否则随机三格
            const isLose = payout <= 0;
            const displayAmount = payout; // bet=5且“不亏不赚” => payout=5 => 显示[5,5,5]
            const slotResults = isLose ? [slot1, slot2, slot3] : [displayAmount, displayAmount, displayAmount];

            await pool.query(`
                INSERT INTO slot_results (
                    username, result, won, proof, created_at,
                    bet_amount, payout_amount, balance_before, balance_after, multiplier, game_details
                ) 
                VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)
            `, [
                username,
                JSON.stringify(slotResults), // result: 三个金额转动结果
                outcome.type,                // won: 你现在存的是 outcome.type（先不动）
                proof,
                betAmount,                   // $5 bet_amount ✅
                payout,                      // $6 payout_amount ✅
                currentBalance + betAmount,  // $7 balance_before ✅（下注前余额）
                finalBalance,                // $8 balance_after ✅
                outcome.multiplier,          // $9 multiplier ✅
                JSON.stringify({             // $10 game_details ✅
                    outcome: outcome.type,
                    amounts: slotResults,
                    won: payout > 0,         // ✅ 最小改动：别用 lost，直接用 payout>0
                    timestamp: new Date().toISOString()
                })
            ]);
        } catch (dbError) {
            console.error('Slot游戏记录存储失败:', dbError);
        }

        res.json({
            success: true,
            outcome: outcome.type,
            multiplier: outcome.multiplier,
            payout: payout,
            newBalance: currentBalance,
            finalBalance: finalBalance
        });
        
    } catch (error) {
        console.error('Slot play error:', error);
        res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
    }
});


// ====================
// Scratch 刮刮乐游戏API
// ====================

app.post('/api/scratch/play', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const { username, tier, winCount } = req.body;
        
        // 验证用户名
        if (username !== req.session.user.username) {
            return res.status(403).json({ success: false, message: '用户名不匹配' });
        }
        
        // 验证档位参数 - 修复为正确的号码配置逻辑
        const validTiers = [
            { cost: 5, winCount: 5, userCount: 5 },    // 5元：5个中奖号码，5个我的号码
            { cost: 10, winCount: 5, userCount: 10 },  // 10元：5个中奖号码，10个我的号码  
            { cost: 100, winCount: 5, userCount: 20 }  // 100元：5个中奖号码，20个我的号码
        ];
        
        const selectedTier = validTiers.find(t => t.cost === tier);
        if (!selectedTier) {
            return res.status(400).json({ success: false, message: '无效的游戏档位' });
        }
        
        // 扣除投注电币
        const betResult = await BalanceLogger.updateBalance({
            username: username,
            amount: -tier,
            operationType: 'scratch_bet',
            description: `刮刮乐投注：${tier} 电币 (${selectedTier.winCount}中奖+${selectedTier.userCount}我的)`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        if (!betResult.success) {
            return res.status(400).json({ success: false, message: betResult.message });
        }
        
        const currentBalance = betResult.balance;
        
        // 按用户要求的中奖梯度：
        // 5元：50%中5元，20%中10元，1%中20元，29%不中
        // 10元：50%中10元，20%中20元，1%中40元，29%不中  
        // 100元：50%中100元，20%中200元，1%中400元，29%不中
        const random = Math.random() * 100; // 0-100的随机数
        let payout = 0;
        let outcomeType = '';
        
        if (random <= 50) {
            // 50% 概率中等额
            payout = tier;
            outcomeType = `中奖 ${tier} 电币`;
        } else if (random <= 70) {
            // 20% 概率中2倍
            payout = tier * 2;
            outcomeType = `大奖 ${payout} 电币`;
        } else if (random <= 71) {
            // 1% 概率中4倍  
            payout = tier * 4;
            outcomeType = `超级大奖 ${payout} 电币`;
        } else {
            // 29% 概率不中
            payout = 0;
            outcomeType = '未中奖';
        }
        
        // 发放奖励电币
        let finalBalance = currentBalance;
        if (payout > 0) {
            const winResult = await BalanceLogger.updateBalance({
                username: username,
                amount: payout,
                operationType: 'scratch_win',
                description: `刮刮乐中奖：${outcomeType}，获得 ${payout} 电币`,
                gameData: {
                    tier: tier,
                    outcome: outcomeType,
                    payout: payout,
                    tier_config: selectedTier
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false
            });
            
            if (winResult.success) {
                finalBalance = winResult.balance;
            }
        }
        
        // 生成刮刮乐显示内容 - 修复为正确的号码配置
        const winningNumbers = [];
        for (let i = 0; i < selectedTier.winCount; i++) {
            winningNumbers.push(Math.floor(Math.random() * 100) + 1);
        }
        
        // 生成我的号码区域 - 修复中奖金额显示逻辑
        const userSlots = [];
        let matchedCount = 0;
        
        // 定义奖励金额梯度
        const rewardAmounts = {
            5: [5, 10, 15, 20, 25, 30, 50],     // 5电币档位奖励
            10: [10, 20, 30, 40, 50, 80, 100],  // 10电币档位奖励
            100: [100, 200, 300, 500, 800, 1000, 1500] // 100电币档位奖励
        };
        
        const tierRewards = rewardAmounts[tier] || [tier, tier*2, tier*3, tier*4, tier*5, tier*8, tier*10];
        
        for (let i = 0; i < selectedTier.userCount; i++) {
            let num;
            let prize;
            
            // 如果应该中奖且还没有匹配号码
            if (payout > 0 && matchedCount === 0) {
                num = winningNumbers[Math.floor(Math.random() * winningNumbers.length)];
                prize = `${payout} 电币`; // 使用实际中奖金额
                matchedCount++;
            } else {
                // 生成不匹配的号码，显示诱人的大金额
                do {
                    num = Math.floor(Math.random() * 100) + 1;
                } while (winningNumbers.includes(num));
                const bigReward = tierRewards[Math.floor(Math.random() * Math.min(4, tierRewards.length))];
                prize = `${bigReward} 电币`;
            }
            
            userSlots.push({
                num: num,
                prize: prize
            });
        }
        
        // 存储完整游戏记录到scratch_results表
        try {
            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-${Date.now()}-${Math.random()}`)
                .digest('hex');
                
            // 生成reward_list（匹配的奖励）
            const rewardList = [];
            if (payout > 0) {
                rewardList.push(`${payout} 电币`);
            }
            
            // 计算中奖号码匹配情况
            const matches = userSlots.filter(slot => 
                winningNumbers.includes(slot.num)
            );
            
            await pool.query(`
                INSERT INTO scratch_results (
                    username, winning_numbers, slots, reward, proof, reward_list,
                    tier_cost, tier_config, balance_before, balance_after, matches_count, game_details,
                    created_at
                ) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            `, [
                username,
                JSON.stringify(winningNumbers),
                JSON.stringify(userSlots),
                outcomeType,
                proof,
                JSON.stringify(rewardList),
                tier, // tier_cost
                JSON.stringify(selectedTier), // tier_config
                currentBalance + tier, // balance_before
                finalBalance, // balance_after
                matches.length, // matches_count
                JSON.stringify({
                    outcome: outcomeType,
                    payout: payout,
                    winningNumbers: winningNumbers,
                    userSlots: userSlots,
                    matches: matches,
                    timestamp: new Date().toISOString()
                })
            ]);
        } catch (dbError) {
            console.error('Scratch游戏记录存储失败:', dbError);
        }
        
        res.json({
            success: true,
            outcome: outcomeType,
            payout: payout,
            newBalance: currentBalance,
            finalBalance: finalBalance,
            winningNumbers: winningNumbers,
            slots: userSlots  // 使用新的userSlots
        });
        
    } catch (error) {
        console.error('Scratch play error:', error);
        res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
    }
});

// ====================
// 幸运祈愿 Wish 游戏API
// ====================

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
        const j = Math.floor(Math.random() * (i + 1));
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
    return stoneColors[Math.floor(Math.random() * stoneColors.length)];
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

app.post('/api/wish/play', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const giftType = req.body.giftType || 'deepsea_singer';
        const config = getWishConfig(giftType);
        if (!config) {
            return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
        }
        const wishCost = config.cost;
        const successRate = config.successRate;
        const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;
        const rewardName = config.name;
        const rewardValue = config.rewardValue;

        // 获取用户当前祈愿进度
        let progressResult = await pool.query(
            'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
            [username, giftType]
        );

        // 如果用户没有祈愿记录，创建一个
        if (progressResult.rows.length === 0) {
            await pool.query(`
                INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
                VALUES ($1, $2, 0, 0, 0, 0)
            `, [username, giftType]);
            
            progressResult = await pool.query(
                'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
                [username, giftType]
            );
        }

        const progress = progressResult.rows[0];

        // 扣除祈愿费用
        const betResult = await BalanceLogger.updateBalance({
            username: username,
            amount: -wishCost,
            operationType: 'wish_bet',
            description: `幸运祈愿：${wishCost} 电币`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!betResult.success) {
            return res.status(400).json({ success: false, message: betResult.message });
        }

        const balanceBefore = betResult.balance + wishCost;
        let balanceAfter = betResult.balance;

        // 判断是否成功
        const isGuaranteed = Number.isFinite(guaranteeThreshold) && progress.consecutive_fails >= guaranteeThreshold;
        const randomSuccess = Math.random() < successRate;
        const success = isGuaranteed || randomSuccess;

        let reward = null;
        
        if (success) {
            // 成功获得深海歌姬
            reward = rewardName;
            
            // 写入背包奖励
            try {
                await pool.query(`
                    INSERT INTO wish_inventory (
                        username, gift_type, gift_name, bilibili_gift_id, status, expires_at,
                        created_at, updated_at
                    )
                    VALUES (
                        $1, $2, $3, $4, 'stored',
                        (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                        (NOW() AT TIME ZONE 'Asia/Shanghai'),
                        (NOW() AT TIME ZONE 'Asia/Shanghai')
                    )
                `, [username, giftType, rewardName, config.bilibiliGiftId]);
            } catch (dbError) {
                console.error('祈愿背包记录存储失败:', dbError);
            }
        }

        // 更新祈愿进度
        const newTotalWishes = progress.total_wishes + 1;
        const newConsecutiveFails = success ? 0 : progress.consecutive_fails + 1;
        const newTotalSpent = progress.total_spent + wishCost;
        const newTotalRewardsValue = progress.total_rewards_value + (success ? rewardValue : 0);

        await pool.query(`
            UPDATE wish_progress 
            SET total_wishes = $1, consecutive_fails = $2, total_spent = $3, total_rewards_value = $4,
                last_success_at = CASE WHEN $5 THEN (NOW() AT TIME ZONE 'Asia/Shanghai') ELSE last_success_at END,
                updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
            WHERE username = $6 AND gift_type = $7
        `, [
            newTotalWishes,
            newConsecutiveFails,
            newTotalSpent,
            newTotalRewardsValue,
            success,
            username,
            giftType
        ]);

        // 保存祈愿记录
        try {
            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-wish-${Date.now()}-${Math.random()}`)
                .digest('hex');

            await pool.query(`
                INSERT INTO wish_results (
                    username, gift_type, cost, success, reward, reward_value, balance_before, balance_after,
                    wishes_count, is_guaranteed, game_details, created_at
                ) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, (NOW() AT TIME ZONE 'Asia/Shanghai'))
            `, [
                username,
                giftType,
                wishCost,
                success,
                reward,
                success ? rewardValue : null,
                balanceBefore,
                balanceAfter,
                newTotalWishes,
                isGuaranteed,
                JSON.stringify({
                    success_rate: successRate,
                    is_guaranteed: isGuaranteed,
                    consecutive_fails_before: progress.consecutive_fails,
                    proof: proof,
                    timestamp: new Date().toISOString()
                })
            ]);
        } catch (dbError) {
            console.error('祈愿记录存储失败:', dbError);
        }

        // 记录祈愿会话（单次）
        try {
            await pool.query(`
                INSERT INTO wish_sessions (
                    username, gift_type, gift_name, batch_count, total_cost, success_count, total_reward_value, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Asia/Shanghai'))
            `, [
                username,
                giftType,
                rewardName,
                1,
                wishCost,
                success ? 1 : 0,
                success ? rewardValue : 0
            ]);
        } catch (dbError) {
            console.error('祈愿会话记录失败:', dbError);
        }

        res.json({
            success: true,
            wishSuccess: success,
            reward: reward,
            rewardValue: success ? rewardValue : 0,
            newBalance: balanceAfter,
            progress: {
                total_wishes: newTotalWishes,
                consecutive_fails: newConsecutiveFails,
                total_spent: newTotalSpent,
                total_rewards_value: newTotalRewardsValue,
                progress_percentage: Number.isFinite(guaranteeThreshold)
                    ? Math.min((newConsecutiveFails / (guaranteeThreshold + 1)) * 100, 100).toFixed(1)
                    : null,
                wishes_until_guarantee: Number.isFinite(guaranteeThreshold)
                    ? Math.max(0, guaranteeThreshold + 1 - newConsecutiveFails)
                    : null,
                guarantee_count: config.guaranteeCount
            },
            isGuaranteed: isGuaranteed,
            giftName: rewardName
        });

    } catch (error) {
        console.error('Wish play error:', error);
        res.status(500).json({ success: false, message: '祈愿失败，请稍后重试' });
    }
});

// 获取祈愿历史记录
app.get('/api/wish/history', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;

        const result = await pool.query(`
            SELECT * FROM wish_results 
            WHERE username = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
        `, [username, limit, offset]);

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM wish_results WHERE username = $1',
            [username]
        );

        res.json({
            success: true,
            history: result.rows,
            pagination: {
                page: page,
                limit: limit,
                total: parseInt(countResult.rows[0].count),
                hasMore: (page * limit) < parseInt(countResult.rows[0].count)
            }
        });

    } catch (error) {
        console.error('获取祈愿历史失败:', error);
        res.status(500).json({ success: false, message: '获取历史记录失败' });
    }
});

// 获取祈愿进度
app.get('/api/wish/progress', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const giftType = req.query.giftType || 'deepsea_singer';
        const config = getWishConfig(giftType);
        if (!config) {
            return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
        }
        const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;
        
        let result = await pool.query(
            'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
            [username, giftType]
        );

        // 如果用户没有祈愿记录，创建一个
        if (result.rows.length === 0) {
            await pool.query(`
                INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
                VALUES ($1, $2, 0, 0, 0, 0)
            `, [username, giftType]);
            
            result = await pool.query(
                'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
                [username, giftType]
            );
        }

        const progress = result.rows[0];

        res.json({
            success: true,
            progress: {
                total_wishes: progress.total_wishes,
                consecutive_fails: progress.consecutive_fails,
                total_spent: progress.total_spent,
                total_rewards_value: progress.total_rewards_value,
                last_success_at: progress.last_success_at,
                progress_percentage: Number.isFinite(guaranteeThreshold)
                    ? Math.min((progress.consecutive_fails / (guaranteeThreshold + 1)) * 100, 100).toFixed(1)
                    : null,
                wishes_until_guarantee: Number.isFinite(guaranteeThreshold)
                    ? Math.max(0, guaranteeThreshold + 1 - progress.consecutive_fails)
                    : null,
                next_is_guaranteed: Number.isFinite(guaranteeThreshold)
                    ? progress.consecutive_fails >= guaranteeThreshold
                    : false,
                guarantee_count: config.guaranteeCount,
                gift_name: config.name
            }
        });

    } catch (error) {
        console.error('获取祈愿进度失败:', error);
        res.status(500).json({ success: false, message: '获取进度失败' });
    }
});

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
                        expires_at = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                        updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                    WHERE id = $1
                `, [inventoryId]);
                await client.query('COMMIT');
                return { success: false, message: '未绑定房间号，已延期' };
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
            SELECT id, username
            FROM wish_inventory
            WHERE status = 'stored'
              AND expires_at <= (NOW() AT TIME ZONE 'Asia/Shanghai')
            ORDER BY expires_at ASC
            LIMIT 20
        `);

        for (const row of expiredItems.rows) {
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

setInterval(autoSendExpiredWishRewards, 60 * 1000);

app.get('/api/wish/backpack', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const result = await pool.query(`
            SELECT id, gift_name, status, expires_at, created_at, gift_exchange_id
            FROM wish_inventory
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT 100
        `, [username]);

        res.json({
            success: true,
            items: result.rows
        });
    } catch (error) {
        console.error('获取背包失败:', error);
        res.status(500).json({ success: false, message: '获取背包失败' });
    }
});

app.post('/api/wish/backpack/send', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const username = req.session.user.username;
        const inventoryId = Number(req.body.inventoryId);

        if (!Number.isFinite(inventoryId)) {
            return res.status(400).json({ success: false, message: '参数无效' });
        }

        const result = await enqueueWishInventorySend({ inventoryId, username, isAuto: false });
        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        res.json({ success: true, message: '礼物已加入发送队列' });
    } catch (error) {
        console.error('背包送出失败:', error);
        res.status(500).json({ success: false, message: '送出失败' });
    }
});

// ====================
// 合石头 Stone 游戏API
// ====================

app.get('/api/stone/state', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        const username = req.session.user.username;
        const slots = await getStoneState(username);
        const isFull = slots.every((slot) => slot);
        const maxSame = getMaxSameCount(slots);
        const reward = isFull ? (stoneRewards[maxSame] || 0) : 0;
        const replaceCost = isFull ? (stoneReplaceCosts[maxSame] || null) : null;

        res.json({
            success: true,
            slots,
            isFull,
            maxSame,
            reward,
            replaceCost,
            canReplace: isFull && maxSame < 6 && replaceCost !== null
        });
    } catch (error) {
        console.error('Stone state error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/stone/add', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const slots = await getStoneState(username);
        const beforeSlots = slots.slice();

        const emptyIndex = slots.findIndex((slot) => !slot);
        if (emptyIndex === -1) {
            return res.status(400).json({ success: false, message: '槽位已满' });
        }

        const balanceResult = await BalanceLogger.updateBalance({
            username,
            amount: -30,
            operationType: 'stone_add',
            description: '合石头：放入一颗石头',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }

        slots[emptyIndex] = randomStoneColor();
        await saveStoneState(username, slots);
        await logStoneAction({
            username,
            actionType: 'add',
            cost: 30,
            beforeSlots,
            afterSlots: slots
        });

        res.json({
            success: true,
            slots,
            newBalance: balanceResult.balance
        });
    } catch (error) {
        console.error('Stone add error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/stone/fill', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const slots = await getStoneState(username);
        const beforeSlots = slots.slice();
        const hasAny = slots.some((slot) => slot);

        if (hasAny) {
            return res.status(400).json({ success: false, message: '仅支持空槽位一键放满' });
        }

        const balanceResult = await BalanceLogger.updateBalance({
            username,
            amount: -180,
            operationType: 'stone_fill',
            description: '合石头：一键放满',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }

        const newSlots = Array.from({ length: 6 }, () => randomStoneColor());
        await saveStoneState(username, newSlots);
        await logStoneAction({
            username,
            actionType: 'fill',
            cost: 180,
            beforeSlots,
            afterSlots: newSlots
        });

        res.json({
            success: true,
            slots: newSlots,
            newBalance: balanceResult.balance
        });
    } catch (error) {
        console.error('Stone fill error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/stone/replace', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const slotIndex = Number(req.body.slotIndex);

        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 5) {
            return res.status(400).json({ success: false, message: '槽位无效' });
        }

        const slots = await getStoneState(username);
        const beforeSlots = slots.slice();
        const isFull = slots.every((slot) => slot);
        if (!isFull) {
            return res.status(400).json({ success: false, message: '槽位未满，无法更换' });
        }

        const maxSame = getMaxSameCount(slots);
        if (maxSame >= 6) {
            return res.status(400).json({ success: false, message: '已满6同色，无需更换' });
        }

        const replaceCost = stoneReplaceCosts[maxSame];
        if (!replaceCost) {
            return res.status(400).json({ success: false, message: '无法计算更换费用' });
        }

        const balanceResult = await BalanceLogger.updateBalance({
            username,
            amount: -replaceCost,
            operationType: 'stone_replace',
            description: `合石头：更换槽位 ${slotIndex + 1}`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }

        slots[slotIndex] = randomStoneColor();
        await saveStoneState(username, slots);
        await logStoneAction({
            username,
            actionType: 'replace',
            cost: replaceCost,
            slotIndex,
            beforeSlots,
            afterSlots: slots
        });

        res.json({
            success: true,
            slots,
            newBalance: balanceResult.balance,
            replacedSlot: slotIndex
        });
    } catch (error) {
        console.error('Stone replace error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/stone/redeem', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const slots = await getStoneState(username);
        const beforeSlots = slots.slice();
        const isFull = slots.every((slot) => slot);

        if (!isFull) {
            return res.status(400).json({ success: false, message: '槽位未满，无法兑换' });
        }

        const maxSame = getMaxSameCount(slots);
        const reward = stoneRewards[maxSame] || 0;

        const balanceResult = await BalanceLogger.updateBalance({
            username,
            amount: reward,
            operationType: 'stone_redeem',
            description: `合石头：兑换奖励 ${reward} 电币`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requireSufficientBalance: false
        });

        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }

        const emptySlots = normalizeStoneSlots([]);
        await saveStoneState(username, emptySlots);
        await logStoneAction({
            username,
            actionType: 'redeem',
            cost: 0,
            reward,
            beforeSlots,
            afterSlots: emptySlots
        });

        res.json({
            success: true,
            slots: emptySlots,
            reward,
            newBalance: balanceResult.balance
        });
    } catch (error) {
        console.error('Stone redeem error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ====================
// 翻卡牌 Flip 游戏API
// ====================

app.get('/api/flip/state', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
    try {
        const username = req.session.user.username;
        const state = await getFlipState(username);
        const flips = state.flipped.filter(Boolean).length;
        const nextCost = flips < flipCosts.length ? flipCosts[flips] : null;
        const canFlip = !state.ended && flips < flipCosts.length;
        const cashoutReward = flipCashoutRewards[state.good_count] || 0;

        res.json({
            success: true,
            board: state.flipped.map((isFlipped, index) => ({
                flipped: isFlipped,
                type: isFlipped ? state.board[index] : null
            })),
            goodCount: state.good_count,
            badCount: state.bad_count,
            ended: state.ended,
            nextCost,
            canFlip,
            cashoutReward
        });
    } catch (error) {
        console.error('Flip state error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/flip/start', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const board = createFlipBoard();
        const flipped = Array(9).fill(false);
        const state = {
            board,
            flipped,
            good_count: 0,
            bad_count: 0,
            ended: false
        };
        await saveFlipState(username, state);

        res.json({
            success: true,
            nextCost: flipCosts[0]
        });
    } catch (error) {
        console.error('Flip start error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/flip/flip', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const cardIndex = Number(req.body.cardIndex);

        if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 8) {
            return res.status(400).json({ success: false, message: '卡牌索引无效' });
        }

        const state = await getFlipState(username);
        const flips = state.flipped.filter(Boolean).length;
        if (state.ended || flips >= flipCosts.length) {
            return res.status(400).json({ success: false, message: '本轮已结束' });
        }

        if (state.flipped[cardIndex]) {
            return res.status(400).json({ success: false, message: '该卡牌已翻开' });
        }

        const cost = flipCosts[flips];
        const balanceResult = await BalanceLogger.updateBalance({
            username,
            amount: -cost,
            operationType: 'flip_card',
            description: `翻卡牌：翻开第${flips + 1}张`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }

        state.flipped[cardIndex] = true;
        const cardType = state.board[cardIndex];
        if (cardType === 'good') {
            state.good_count += 1;
        } else {
            state.bad_count += 1;
            state.ended = true;
        }

        let reward = 0;
        if (state.bad_count > 0) {
            reward = 50;
        } else if (state.good_count >= 7) {
            reward = 30000;
            state.ended = true;
        }

        if (reward > 0) {
            const rewardResult = await BalanceLogger.updateBalance({
                username,
                amount: reward,
                operationType: 'flip_reward',
                description: `翻卡牌奖励 ${reward} 电币`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false
            });

            if (!rewardResult.success) {
                return res.status(400).json({ success: false, message: rewardResult.message });
            }
        }

        await saveFlipState(username, state);
        if (state.ended) {
            await logFlipAction({
                username,
                actionType: 'end',
                reward,
                goodCount: state.good_count,
                badCount: state.bad_count,
                ended: true
            });
        }

        res.json({
            success: true,
            cardIndex,
            cardType,
            goodCount: state.good_count,
            badCount: state.bad_count,
            ended: state.ended,
            reward,
            newBalance: balanceResult.balance + reward
        });
    } catch (error) {
        console.error('Flip card error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

app.post('/api/flip/cashout', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const state = await getFlipState(username);

        if (state.ended) {
            return res.status(400).json({ success: false, message: '本轮已结束' });
        }

        if (state.bad_count > 0) {
            return res.status(400).json({ success: false, message: '坏牌已出现，无法退出' });
        }

        const reward = flipCashoutRewards[state.good_count] || 0;
        state.ended = true;
        await saveFlipState(username, state);

        const rewardResult = await BalanceLogger.updateBalance({
            username,
            amount: reward,
            operationType: 'flip_cashout',
            description: `翻卡牌退出奖励 ${reward} 电币`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requireSufficientBalance: false
        });

        if (!rewardResult.success) {
            return res.status(400).json({ success: false, message: rewardResult.message });
        }

        await logFlipAction({
            username,
            actionType: 'end',
            reward,
            goodCount: state.good_count,
            badCount: state.bad_count,
            ended: true
        });

        res.json({
            success: true,
            reward,
            newBalance: rewardResult.balance
        });
    } catch (error) {
        console.error('Flip cashout error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ====================
// 决斗挑战 Duel 游戏API
// ====================

app.post('/api/duel/play', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
    try {
        const username = req.session.user.username;
        const giftType = req.body.giftType;
        const power = Number(req.body.power);

        if (!duelRewards[giftType]) {
            return res.status(400).json({ success: false, message: '无效的奖品档位' });
        }

        if (!Number.isFinite(power) || power < 1 || power > 80) {
            return res.status(400).json({ success: false, message: '功力范围为1-80' });
        }

        const cost = calculateDuelCost(giftType, power);
        const successRate = power / 100;

        const balanceResult = await BalanceLogger.updateBalance({
            username,
            amount: -cost,
            operationType: 'duel_bet',
            description: `决斗挑战：功力${power}%`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!balanceResult.success) {
            return res.status(400).json({ success: false, message: balanceResult.message });
        }

        const success = Math.random() < successRate;
        const reward = success ? duelRewards[giftType].reward : 0;

        let newBalance = balanceResult.balance;
        if (success) {
            const rewardResult = await BalanceLogger.updateBalance({
                username,
                amount: reward,
                operationType: 'duel_win',
                description: `决斗挑战获胜：${duelRewards[giftType].name} ${reward} 电币`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false
            });

            if (!rewardResult.success) {
                return res.status(400).json({ success: false, message: rewardResult.message });
            }

            newBalance = rewardResult.balance;
        }

        await pool.query(
            `INSERT INTO duel_logs (
                username, gift_type, reward, power, cost, success, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
            [
                username,
                giftType,
                reward,
                power,
                cost,
                success
            ]
        );

        if (req.session.user) {
            req.session.user.balance = newBalance;
        }

        res.json({
            success: true,
            reward,
            success,
            newBalance
        });
    } catch (error) {
        console.error('Duel play error:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});


// Spin API 路由
app.post('/api/spin', 
    security.basicRateLimit,
    security.csrfProtection,
    (req, res) => {
    try {
        const result = GameLogic.spin.spin();
        res.json({
            success: true,
            prize: result.prize,
            angle: result.angle
        });
    } catch (error) {
        console.error('Spin error:', error);
        res.status(500).json({ success: false, message: '转盘故障' });
    }
});

// Wish API 路由
app.post('/api/wish', 
    security.basicRateLimit,
    security.csrfProtection,
    (req, res) => {
    try {
        const { currentCount = 0, username } = req.body;
        const result = GameLogic.wish.makeWish(currentCount);
        
        // 触发飘屏广播
        if (username) {
            broadcastDanmaku(username, 'wish', result.isWin);
        }
        
        res.json({
            success: true,
            isWin: result.isWin,
            guaranteed: result.guaranteed,
            globalRate: result.globalRate
        });
    } catch (error) {
        console.error('Wish error:', error);
        res.status(500).json({ success: false, message: '祈愿系统故障' });
    }
});

// 批量祈愿API - 仅支持10次，逐次记录
app.post('/api/wish-batch', 
    requireLogin,
    requireAuthorized,
    security.basicRateLimit,
    security.csrfProtection,
    async (req, res) => {
    try {
        const username = req.session.user.username;
        const batchCount = Number(req.body.batchCount || 10);
        const giftType = req.body.giftType || 'deepsea_singer';
        const config = getWishConfig(giftType);
        if (!config) {
            return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
        }
        const wishCost = config.cost;
        const successRate = config.successRate;
        const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;
        const rewardName = config.name;
        const rewardValue = config.rewardValue;
        
        if (batchCount !== 10) {
            return res.status(400).json({ success: false, message: '仅支持10次祈愿' });
        }
        
        // 获取用户余额，提前校验
        const balanceResult = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );
        if (balanceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        const currentBalance = parseFloat(balanceResult.rows[0].balance);
        const totalCost = wishCost * batchCount;
        if (currentBalance < totalCost) {
            return res.status(400).json({ success: false, message: '余额不足，无法进行10次祈愿' });
        }
        
        // 获取用户当前祈愿进度
        let progressResult = await pool.query(
            'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
            [username, giftType]
        );

        // 如果用户没有祈愿记录，创建一个
        if (progressResult.rows.length === 0) {
            await pool.query(`
                INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
                VALUES ($1, $2, 0, 0, 0, 0)
            `, [username, giftType]);
            
            progressResult = await pool.query(
                'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
                [username, giftType]
            );
        }

        let progress = progressResult.rows[0];
        let successCount = 0;
        let balanceAfter = currentBalance;

        for (let i = 0; i < batchCount; i++) {
            // 扣除祈愿费用
            const betResult = await BalanceLogger.updateBalance({
                username: username,
                amount: -wishCost,
                operationType: 'wish_bet',
                description: `幸运祈愿：${wishCost} 电币`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!betResult.success) {
                return res.status(400).json({ success: false, message: betResult.message });
            }

            const balanceBefore = betResult.balance + wishCost;
            balanceAfter = betResult.balance;

            // 判断是否成功
            const isGuaranteed = Number.isFinite(guaranteeThreshold) && progress.consecutive_fails >= guaranteeThreshold;
            const randomSuccess = Math.random() < successRate;
            const success = isGuaranteed || randomSuccess;

            let reward = null;
            if (success) {
                reward = rewardName;

                // 写入背包奖励
                try {
                    await pool.query(`
                        INSERT INTO wish_inventory (
                            username, gift_type, gift_name, bilibili_gift_id, status, expires_at,
                            created_at, updated_at
                        )
                        VALUES (
                            $1, $2, $3, $4, 'stored',
                            (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                            (NOW() AT TIME ZONE 'Asia/Shanghai'),
                            (NOW() AT TIME ZONE 'Asia/Shanghai')
                        )
                    `, [username, giftType, rewardName, config.bilibiliGiftId]);
                } catch (dbError) {
                    console.error('祈愿背包记录存储失败:', dbError);
                }
            }

            // 更新祈愿进度
            const newTotalWishes = progress.total_wishes + 1;
            const newConsecutiveFails = success ? 0 : progress.consecutive_fails + 1;
            const newTotalSpent = progress.total_spent + wishCost;
            const newTotalRewardsValue = progress.total_rewards_value + (success ? rewardValue : 0);

            await pool.query(`
                UPDATE wish_progress 
                SET total_wishes = $1, consecutive_fails = $2, total_spent = $3, total_rewards_value = $4,
                    last_success_at = CASE WHEN $5 THEN (NOW() AT TIME ZONE 'Asia/Shanghai') ELSE last_success_at END,
                    updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                WHERE username = $6 AND gift_type = $7
            `, [
                newTotalWishes,
                newConsecutiveFails,
                newTotalSpent,
                newTotalRewardsValue,
                success,
                username,
                giftType
            ]);

            // 保存祈愿记录
            try {
                const crypto = require('crypto');
                const proof = crypto.createHash('sha256')
                    .update(`${username}-wish-${Date.now()}-${Math.random()}`)
                    .digest('hex');

                await pool.query(`
                    INSERT INTO wish_results (
                        username, gift_type, cost, success, reward, reward_value, balance_before, balance_after,
                        wishes_count, is_guaranteed, game_details, created_at
                    ) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, (NOW() AT TIME ZONE 'Asia/Shanghai'))
                `, [
                    username,
                    giftType,
                    wishCost,
                    success,
                    reward,
                    success ? rewardValue : null,
                    balanceBefore,
                    balanceAfter,
                    newTotalWishes,
                    isGuaranteed,
                    JSON.stringify({
                        success_rate: successRate,
                        is_guaranteed: isGuaranteed,
                        consecutive_fails_before: progress.consecutive_fails,
                        proof: proof,
                        timestamp: new Date().toISOString()
                    })
                ]);
            } catch (dbError) {
                console.error('祈愿记录存储失败:', dbError);
            }

            if (success) {
                successCount += 1;
            }

            progress = {
                ...progress,
                total_wishes: newTotalWishes,
                consecutive_fails: newConsecutiveFails,
                total_spent: newTotalSpent,
                total_rewards_value: newTotalRewardsValue,
                last_success_at: success ? new Date() : progress.last_success_at
            };
        }

        // 记录祈愿会话（十连）
        try {
            await pool.query(`
                INSERT INTO wish_sessions (
                    username, gift_type, gift_name, batch_count, total_cost, success_count, total_reward_value, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Asia/Shanghai'))
            `, [
                username,
                giftType,
                rewardName,
                batchCount,
                wishCost * batchCount,
                successCount,
                successCount * rewardValue
            ]);
        } catch (dbError) {
            console.error('祈愿会话记录失败:', dbError);
        }
        
        res.json({
            success: true,
            successCount,
            newBalance: balanceAfter,
            progress: {
                total_wishes: progress.total_wishes,
                consecutive_fails: progress.consecutive_fails,
                total_spent: progress.total_spent,
                total_rewards_value: progress.total_rewards_value,
                progress_percentage: Number.isFinite(guaranteeThreshold)
                    ? Math.min((progress.consecutive_fails / (guaranteeThreshold + 1)) * 100, 100).toFixed(1)
                    : null,
                wishes_until_guarantee: Number.isFinite(guaranteeThreshold)
                    ? Math.max(0, guaranteeThreshold + 1 - progress.consecutive_fails)
                    : null,
                guarantee_count: config.guaranteeCount
            }
        });
        
    } catch (error) {
        console.error('Batch wish error:', error);
        res.status(500).json({ success: false, message: '批量祈愿系统故障' });
    }
});

// 祈愿概率模拟（管理员测试，无余额/数据库影响）
app.post('/api/wish/simulate',
    requireLogin,
    requireAuthorized,
    security.basicRateLimit,
    security.csrfProtection,
    async (req, res) => {
    try {
        const username = req.session.user.username;
        if (username !== 'hokboost') {
            return res.status(403).json({ success: false, message: '无权限' });
        }

        const giftType = req.body.giftType || 'deepsea_singer';
        const count = Number(req.body.count || 100000);
        const config = getWishConfig(giftType);
        if (!config) {
            return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
        }

        if (!Number.isFinite(count) || count < 1 || count > 100000) {
            return res.status(400).json({ success: false, message: '次数无效' });
        }

        const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;
        let consecutiveFails = 0;
        let successCount = 0;

        for (let i = 0; i < count; i++) {
            const isGuaranteed = Number.isFinite(guaranteeThreshold) && consecutiveFails >= guaranteeThreshold;
            const randomSuccess = Math.random() < config.successRate;
            const success = isGuaranteed || randomSuccess;
            if (success) {
                successCount += 1;
                consecutiveFails = 0;
            } else {
                consecutiveFails += 1;
            }
        }

        res.json({
            success: true,
            giftName: config.name,
            count,
            successCount,
            rate: ((successCount / count) * 100).toFixed(4) + '%'
        });
    } catch (error) {
        console.error('祈愿模拟失败:', error);
        res.status(500).json({ success: false, message: '模拟失败' });
    }
});

// ====================
// IP管理和安全API
// ====================

// 获取IP风险信息
app.get('/api/admin/ip/:ip', requireLogin, requireAdmin, async (req, res) => {
    try {
        const ip = req.params.ip;
        const [riskData, stats] = await Promise.all([
            IPManager.getIPRiskScore(ip),
            IPManager.getIPStats(ip)
        ]);

        res.json({
            success: true,
            ip,
            riskData,
            stats
        });
    } catch (error) {
        console.error('获取IP信息失败:', error);
        res.status(500).json({ success: false, message: '获取IP信息失败' });
    }
});

// 添加IP到黑名单
app.post('/api/admin/ip/blacklist', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { ip, reason } = req.body;
        const adminUser = req.session.user.username;
        
        if (!ip || !reason) {
            return res.status(400).json({ success: false, message: 'IP和原因不能为空' });
        }

        const success = await IPManager.addToBlacklist(ip, reason, adminUser);
        
        if (success) {
            console.log(`管理员 ${adminUser} 将IP ${ip} 添加到黑名单: ${reason}`);
            res.json({ success: true, message: 'IP已添加到黑名单' });
        } else {
            res.status(500).json({ success: false, message: '添加黑名单失败' });
        }
    } catch (error) {
        console.error('添加IP黑名单失败:', error);
        res.status(500).json({ success: false, message: '系统错误' });
    }
});

// 添加IP到白名单
app.post('/api/admin/ip/whitelist', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { ip, reason } = req.body;
        const adminUser = req.session.user.username;
        
        if (!ip || !reason) {
            return res.status(400).json({ success: false, message: 'IP和原因不能为空' });
        }

        const success = await IPManager.addToWhitelist(ip, reason, adminUser);
        
        if (success) {
            console.log(`管理员 ${adminUser} 将IP ${ip} 添加到白名单: ${reason}`);
            res.json({ success: true, message: 'IP已添加到白名单' });
        } else {
            res.status(500).json({ success: false, message: '添加白名单失败' });
        }
    } catch (error) {
        console.error('添加IP白名单失败:', error);
        res.status(500).json({ success: false, message: '系统错误' });
    }
});

// 移除IP黑名单
app.post('/api/admin/ip/remove-blacklist', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { ip } = req.body;
        const adminUser = req.session.user.username;
        
        if (!ip) {
            return res.status(400).json({ success: false, message: 'IP不能为空' });
        }

        const success = await IPManager.removeFromBlacklist(ip);
        
        if (success) {
            console.log(`管理员 ${adminUser} 将IP ${ip} 从黑名单移除`);
            res.json({ success: true, message: 'IP已从黑名单移除' });
        } else {
            res.status(500).json({ success: false, message: '移除黑名单失败' });
        }
    } catch (error) {
        console.error('移除IP黑名单失败:', error);
        res.status(500).json({ success: false, message: '系统错误' });
    }
});

// 强制踢出用户所有会话
app.post('/api/admin/force-logout', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username } = req.body;
        const adminUser = req.session.user.username;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '用户名不能为空' });
        }

        // 特别保护hokboost管理员账号
        if (username === 'hokboost') {
            console.log(`⚠️ 管理员 ${adminUser} 试图强制注销hokboost - 已拒绝`);
            return res.status(403).json({ 
                success: false, 
                message: '不能对hokboost管理员账号执行此操作' 
            });
        }

        const sessionCount = await SessionManager.forceLogoutUser(username, 'admin_force_logout');
        
        console.log(`管理员 ${adminUser} 强制注销用户 ${username} 的 ${sessionCount} 个会话`);
        res.json({ 
            success: true, 
            message: `已强制注销用户 ${username} 的 ${sessionCount} 个会话` 
        });
    } catch (error) {
        console.error('强制注销失败:', error);
        res.status(500).json({ success: false, message: '强制注销失败' });
    }
});

// 获取活跃会话列表
app.get('/api/admin/sessions', requireLogin, requireAdmin, async (req, res) => {
    try {
        const stats = await SessionManager.getSessionStats();
        
        const activeSessions = await pool.query(`
            SELECT username, ip_address, user_agent, created_at, last_activity
            FROM active_sessions 
            WHERE is_active = true 
            ORDER BY last_activity DESC 
            LIMIT 50
        `);

        res.json({
            success: true,
            stats,
            sessions: activeSessions.rows
        });
    } catch (error) {
        console.error('获取会话列表失败:', error);
        res.status(500).json({ success: false, message: '获取会话列表失败' });
    }
});

// 获取安全事件列表
app.get('/api/admin/security-events', requireLogin, requireAdmin, async (req, res) => {
    try {
        const events = await pool.query(`
            SELECT id, event_type, username, ip_address, description, severity, 
                   handled, handled_by, created_at
            FROM security_events 
            ORDER BY created_at DESC 
            LIMIT 100
        `);

        res.json({
            success: true,
            events: events.rows
        });
    } catch (error) {
        console.error('获取安全事件失败:', error);
        res.status(500).json({ success: false, message: '获取安全事件失败' });
    }
});

// WebSocket测试页面
app.get('/test-websocket', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-websocket.html'));
});

// 管理员工具：重置卡住的礼物任务
app.post('/api/admin/reset-stuck-gift-tasks', requireLogin, requireAdmin, async (req, res) => {
    try {
        const adminUser = req.session.user.username;
        
        console.log(`🔧 管理员 ${adminUser} 开始重置卡住的礼物任务`);
        
        // 查找卡住的任务（资金已锁定但任务pending超过10分钟）
        const stuckTasks = await pool.query(`
            SELECT id, username, gift_name, cost, created_at
            FROM gift_exchanges 
            WHERE status = 'funds_locked' 
              AND delivery_status IN ('pending', 'processing')
              AND created_at < NOW() - INTERVAL '10 minutes'
            ORDER BY created_at
        `);
        
        let resetCount = 0;
        const results = [];
        
        for (const task of stuckTasks.rows) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                // 退还资金
                await client.query(
                    'UPDATE users SET balance = balance + $1 WHERE username = $2',
                    [task.cost, task.username]
                );
                
                // 标记任务为失败
                await client.query(
                    'UPDATE gift_exchanges SET status = $1, delivery_status = $2, processed_at = NOW() WHERE id = $3',
                    ['failed', 'failed', task.id]
                );
                
                await client.query('COMMIT');
                
                console.log(`✅ 重置任务 ${task.id}: 退还 ${task.cost} 电币给 ${task.username}`);
                resetCount++;
                results.push({
                    taskId: task.id,
                    username: task.username,
                    giftName: task.gift_name,
                    refundedAmount: task.cost,
                    createdAt: task.created_at
                });
                
            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`❌ 重置任务 ${task.id} 失败:`, error.message);
                results.push({
                    taskId: task.id,
                    username: task.username,
                    error: error.message
                });
            } finally {
                client.release();
            }
        }
        
        console.log(`🔧 管理员 ${adminUser} 重置了 ${resetCount} 个卡住的任务`);
        
        res.json({
            success: true,
            message: `成功重置 ${resetCount} 个卡住的任务`,
            resetCount,
            results
        });
        
    } catch (error) {
        console.error('重置卡住任务失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '重置失败: ' + error.message 
        });
    }
});

// 🚨 安全修复：已删除未鉴权的测试通知API (防止任意用户骚扰推送)

// 危险的测试端点已删除 - 防止未授权用户骚扰推送
// 管理员安全警告测试API (需要管理员权限)
app.post('/api/admin/test/security-alert', requireLogin, requireAdmin, security.basicRateLimit, (req, res) => {
    const { username } = req.body;
    const adminUsername = req.session.user.username;
    
    if (!username) {
        return res.status(400).json({ success: false, message: '缺少用户名参数' });
    }
    
    const testEvent = {
        type: 'device_logout',
        title: '管理员测试安全提醒',
        message: `管理员 ${adminUsername} 发起的安全警告测试`,
        level: 'warning',
        details: {
            admin: adminUsername,
            testMode: true,
            timestamp: new Date().toISOString()
        }
    };
    
    notifySecurityEvent(username, testEvent);
    console.log(`🚨 管理员 ${adminUsername} 发送测试安全警告给用户: ${username}`);
    
    res.json({ success: true, message: `测试安全警告已发送给用户: ${username}` });
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        games: ['quiz', 'slot', 'scratch', 'spin', 'wish', 'stone', 'flip', 'duel'],
        questions: questions.length
    });
});

// 安全监控面板（需要认证）
// 安全监控面板 - 修复后：使用统一的session权限体系
app.get('/admin/security', requireLogin, requireAdmin, (req, res) => {
    // 已修复：不再使用危险的Bearer认证，统一使用session权限
    
    // 收集安全统计信息
    const blacklist = security.getBlacklist();
    const behaviorStats = [];
    
    // 获取行为统计（最多显示100个）
    let count = 0;
    for (const [ip, behavior] of Object.entries({})) {
        if (count >= 100) break;
        
        const userBehavior = security.getUserBehavior(ip);
        if (userBehavior) {
            behaviorStats.push({
                ip,
                totalRequests: userBehavior.totalRequests,
                suspicionScore: userBehavior.suspicionScore,
                avgInterval: Math.round(userBehavior.patterns?.avgInterval || 0),
                minInterval: userBehavior.patterns?.minInterval || 0,
                lastSeen: new Date(userBehavior.lastRequestTime).toISOString()
            });
        }
        count++;
    }
    
    res.json({
        timestamp: new Date().toISOString(),
        security: {
            blacklistedIPs: blacklist.length,
            blacklist: blacklist.slice(0, 20), // 只显示前20个
            activeUsers: behaviorStats.length,
            suspiciousUsers: behaviorStats.filter(u => u.suspicionScore > 30).length,
            recentBehavior: behaviorStats
                .sort((a, b) => b.suspicionScore - a.suspicionScore)
                .slice(0, 20)
        }
    });
});

// 🛡️ 安全修复：安全管理接口改为使用session认证，不再使用Bearer密码
app.post('/admin/security/unblock', requireLogin, requireAdmin, security.basicRateLimit, (req, res) => {
    const { ip } = req.body;
    const adminUsername = req.session.user.username;
    
    if (ip) {
        security.removeFromBlacklist(ip);
        security.clearUserBehavior(ip);
        console.log(`🔓 管理员 ${adminUsername} 解除IP封禁: ${ip}`);
        res.json({ success: true, message: `IP ${ip} has been unblocked` });
    } else {
        res.status(400).json({ success: false, message: 'IP address required' });
    }
});

// ====== Windows监听服务API ======

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

// 🛡️ 安全修复：获取待处理的礼物发送任务 - 使用原子操作防止重复领取
app.get('/api/gift-tasks', requireApiKey, async (req, res) => {
    try {
        // 原子操作：一次完成"领取+返回"，防止并发重复消费
        let result;
        try {
            result = await pool.query(`
                UPDATE gift_exchanges 
                SET delivery_status = 'processing', processed_at = NOW()
                WHERE id IN (
                    SELECT id FROM gift_exchanges 
                    WHERE delivery_status = 'pending' AND bilibili_room_id IS NOT NULL
                    ORDER BY created_at ASC 
                    LIMIT 10
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, gift_type, bilibili_room_id, username, gift_name, quantity, created_at
            `);
        } catch (error) {
            if (error.code === '42703') { // column does not exist
                console.log('⚠️ quantity字段不存在，使用备用查询');
                result = await pool.query(`
                    UPDATE gift_exchanges 
                    SET delivery_status = 'processing', processed_at = NOW()
                    WHERE id IN (
                        SELECT id FROM gift_exchanges 
                        WHERE delivery_status = 'pending' AND bilibili_room_id IS NOT NULL
                        ORDER BY created_at ASC 
                        LIMIT 10
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, gift_type, bilibili_room_id, username, gift_name, created_at
                `);
            } else {
                throw error;
            }
        }

        // 加载礼物配置
        const fs = require('fs');
        const giftConfig = JSON.parse(fs.readFileSync('./gift-codes.json', 'utf8'));
        
        res.json({
            success: true,
            tasks: result.rows.map(row => ({
                id: row.id,
                giftId: giftConfig.礼物映射[row.gift_type]?.bilibili_id || row.gift_type,
                roomId: row.bilibili_room_id,
                username: row.username,
                giftName: row.gift_name,
                quantity: row.quantity || 1, // 如果字段不存在，默认为1
                createdAt: row.created_at
            }))
        });

    } catch (error) {
        console.error('获取任务队列失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 标记任务开始处理
app.post('/api/gift-tasks/:id/start', requireApiKey, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        
        const result = await pool.query(`
            UPDATE gift_exchanges 
            SET delivery_status = 'processing',
                processed_at = NOW()
            WHERE id = $1 AND delivery_status = 'pending'
            RETURNING username, gift_name
        `, [taskId]);

        if (result.rows.length > 0) {
            console.log(`🔄 Windows服务开始处理任务 ${taskId}: ${result.rows[0].username} 的 ${result.rows[0].gift_name}`);
            res.json({ success: true, message: '任务开始处理' });
        } else {
            res.status(404).json({ success: false, message: '任务未找到或已被处理' });
        }
    } catch (error) {
        console.error('标记任务开始失败:', error);
        res.status(500).json({ success: false, message: '服务器错误', error: error.message });
    }
});

// 标记任务完成
app.post('/api/gift-tasks/:id/complete', requireApiKey, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        
        // 🛡️ 预扣机制：获取任务信息并执行部分成功的扣费
        // ✅ 兼容 Windows(Python) snake_case 与 JS camelCase  
        const actualQuantityVal = (req.body.actualQuantity ?? req.body.actual_quantity);
        const requestedQuantityVal = (req.body.requestedQuantity ?? req.body.requested_quantity);
        const partialSuccessVal = (req.body.partialSuccess ?? req.body.partial_success);
        const actualQuantity = Number.isFinite(Number(actualQuantityVal)) ? parseInt(actualQuantityVal, 10) : null;
        const requestedQuantity = Number.isFinite(Number(requestedQuantityVal)) ? parseInt(requestedQuantityVal, 10) : null;
        const partialSuccess = !!partialSuccessVal;
        
        const taskResult = await pool.query(`
            SELECT username, gift_name, cost, status, quantity
            FROM gift_exchanges 
            WHERE id = $1
        `, [taskId]);

        if (taskResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: '任务不存在' });
        }

        const { username, gift_name, cost, status, quantity } = taskResult.rows[0];

        // 🔒 资金已锁定状态的任务，成功时确认扣费（已经扣除了，标记为完成即可）
        if (status === 'funds_locked') {
            // 🛡️ 计算实际应扣费用和退款（基于实际发送数量）
            const unitCost = cost / quantity; // 单个礼物的成本
            const actualCost = Math.round(unitCost * (actualQuantity || quantity));
            const refundAmount = cost - actualCost; // 需要退还的金额
            
            if (partialSuccess && refundAmount > 0) {
                console.log(`⚠️ 任务 ${taskId} 部分成功: 原计划 ${quantity} 个，实际成功 ${actualQuantity} 个`);
                console.log(`💰 资金处理: 锁定 ${cost} 电池，实际消费 ${actualCost} 电池，退还 ${refundAmount} 电池`);
                
                // 退还多余的资金
                await pool.query(
                    'UPDATE users SET balance = balance + $1 WHERE username = $2',
                    [refundAmount, username]
                );
            }
            
            // 记录最终的扣费日志
            const balanceResult = await BalanceLogger.updateBalance({
                username: username,
                amount: 0, // 资金已经在兑换时锁定了，这里只是记录
                operationType: partialSuccess ? 'gift_delivery_partial' : 'gift_delivery_success', 
                description: `礼物发送${partialSuccess ? '部分' : ''}成功确认: ${gift_name} ${actualQuantity || quantity}/${quantity}${refundAmount > 0 ? `，退还 ${refundAmount} 电池` : ''}`,
                gameData: { 
                    taskId, 
                    gift_name, 
                    lockedAmount: cost,
                    actualCost: actualCost,
                    refundAmount: refundAmount,
                    requestedQuantity: quantity,
                    actualQuantity: actualQuantity || quantity,
                    partialSuccess: partialSuccess || false
                },
                requireSufficientBalance: false // 不检查余额，因为只是记录
            });

            console.log(`💰 任务 ${taskId} 资金确认: 锁定 ${cost} 电池，消费 ${actualCost} 电池，退还 ${refundAmount} 电池`);
        }

        const finalDeliveryStatus = partialSuccess ? 'partial_success' : 'success';
        // 标记任务完成
        const result = await pool.query(`
            UPDATE gift_exchanges 
            SET delivery_status = $2,
                status = 'completed',
                processed_at = NOW()
            WHERE id = $1
            RETURNING username, gift_name
        `, [taskId, finalDeliveryStatus]);

        if (result.rows.length > 0) {
            try {
                await pool.query(`
                    UPDATE wish_inventory
                    SET status = 'sent',
                        sent_at = (NOW() AT TIME ZONE 'Asia/Shanghai'),
                        updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                    WHERE gift_exchange_id = $1
                `, [taskId]);
            } catch (dbError) {
                console.error('更新背包发送状态失败:', dbError);
            }

            console.log(`✅ Windows服务完成任务 ${taskId}: ${result.rows[0].username} 的 ${result.rows[0].gift_name}`);
            res.json({ success: true, message: '任务完成' });
        } else {
            res.status(404).json({ success: false, message: '任务不存在' });
        }

    } catch (error) {
        console.error('标记任务完成失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误' 
        });
    }
});

// 重置卡住的任务（超过5分钟的processing任务重置为pending）
app.post('/api/gift-tasks/reset-stuck', requireApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            UPDATE gift_exchanges 
            SET delivery_status = 'pending',
                processed_at = NULL
            WHERE delivery_status = 'processing' 
            AND processed_at < NOW() - INTERVAL '5 minutes'
            RETURNING id, username, gift_name
        `);

        const resetCount = result.rows.length;
        console.log(`🔄 重置了 ${resetCount} 个卡住的任务`);
        
        result.rows.forEach(row => {
            console.log(`  - 任务 ${row.id}: ${row.username} 的 ${row.gift_name}`);
        });

        res.json({ 
            success: true, 
            message: `重置了 ${resetCount} 个卡住的任务`,
            resetTasks: result.rows
        });
    } catch (error) {
        console.error('重置卡住任务失败:', error);
        res.status(500).json({ success: false, message: '服务器错误', error: error.message });
    }
});

// 标记任务失败
app.post('/api/gift-tasks/:id/fail', requireApiKey, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const errorMessage = req.body.error || '礼物发送失败';

        // ✅ 兼容 Windows(Python) snake_case 与 JS camelCase
        const actualQuantityVal = (req.body.actualQuantity ?? req.body.actual_quantity);
        const partialSuccessVal = (req.body.partialSuccess ?? req.body.partial_success);
        const actualQuantity = Number.isFinite(Number(actualQuantityVal)) ? parseInt(actualQuantityVal, 10) : null;
        const partialSuccess = !!partialSuccessVal;

        // 🛡️ 预扣机制：任务失败时必须退还锁定的资金
        const taskResult = await pool.query(`
            SELECT username, gift_name, cost, status, quantity
            FROM gift_exchanges 
            WHERE id = $1
        `, [taskId]);

        if (taskResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: '任务不存在' });
        }

        const { username, gift_name, cost, status, quantity } = taskResult.rows[0];

        // 🔒 如果资金已锁定，需要退还给用户
        if (status === 'funds_locked') {
            // ✅ 计算实际应退款金额
            let refundAmount = cost; // 默认全退（保持你原有行为）
            let descExtra = '';

            if (partialSuccess && actualQuantity !== null && actualQuantity > 0 && quantity > 0) {
                const unitCost = cost / quantity;              // 单价
                const actualCost = Math.round(unitCost * actualQuantity);
                refundAmount = Math.max(0, cost - actualCost); // 只退未送出的差额
                descExtra = `（部分成功：${actualQuantity}/${quantity}，退还差额 ${refundAmount} 电币）`;
            }

            console.log(`🔄 任务 ${taskId} 失败，正在退还锁定资金 ${refundAmount} 电币给用户 ${username}`);

            // 使用 BalanceLogger 安全地退还资金并记录日志
            const refundResult = await BalanceLogger.updateBalance({
                username: username,
                amount: refundAmount,
                operationType: 'gift_delivery_failed_refund',
                description: `礼物发送失败退款: ${gift_name} ${quantity}个，退还 ${refundAmount} 电币 - 原因: ${errorMessage}${descExtra}`,
                gameData: {
                    taskId,
                    gift_name,
                    originalCost: cost,
                    refundAmount: refundAmount,
                    errorMessage: errorMessage,
                    quantity: quantity,
                    actualQuantity: actualQuantity,
                    partialSuccess: partialSuccess
                },
                requireSufficientBalance: false
            });

            if (!refundResult.success) {
                console.error(`❌ 退款失败: ${refundResult.message}`);
                return res.status(500).json({
                    success: false,
                    message: `任务失败且退款失败: ${refundResult.message}`
                });
            }

            console.log(`✅ 成功退还 ${refundAmount} 电币给 ${username}，新余额: ${refundResult.balance}`);
        }

        // 标记任务为失败
        const result = await pool.query(`
            UPDATE gift_exchanges 
            SET delivery_status = 'failed',
                status = 'failed',
                processed_at = NOW()
            WHERE id = $1
            RETURNING username, gift_name, cost
        `, [taskId]);

        if (result.rows.length > 0) {
            try {
                await pool.query(`
                    UPDATE wish_inventory
                    SET status = 'stored',
                        gift_exchange_id = NULL,
                        expires_at = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                        updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                    WHERE gift_exchange_id = $1
                `, [taskId]);
            } catch (dbError) {
                console.error('更新背包失败回退失败:', dbError);
            }

            console.log(`❌ 任务 ${taskId} 标记为失败: ${username} 的 ${gift_name} - ${errorMessage}`);
            if (status === 'funds_locked') {
                console.log(`💰 资金处理: 已按规则退还（可能为差额退款）`);
            } else {
                console.log(`💰 资金处理: 无需退款（状态: ${status}）`);
            }
            res.json({ success: true, message: '任务标记为失败，资金已安全退还' });
        } else {
            res.status(404).json({ success: false, message: '任务不存在' });
        }

    } catch (error) {
        console.error('标记任务失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误'
        });
    }
})


// ====================
// 游戏记录查看API
// ====================

// 获取用户游戏记录
app.get('/api/game-records/:gameType', requireLogin, requireAuthorized, async (req, res) => {
    try {
        const { gameType } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const username = req.session.user.username;
        const offset = (page - 1) * limit;

        let query, params, countQuery, countParams;

        switch (gameType) {
            case 'quiz':
                query = `
                    SELECT id,
                           score,
                           to_char(submitted_at::timestamp, 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM submissions 
                    WHERE username = $1 
                    ORDER BY submitted_at DESC 
                    LIMIT $2 OFFSET $3
                `;
                params = [username, limit, offset];
                countQuery = 'SELECT COUNT(*) FROM submissions WHERE username = $1';
                countParams = [username];
                break;

            case 'slot':
                query = `
                    SELECT id,
                           won as result,
                           COALESCE(payout_amount, 0) as payout,
                           game_details->>'amounts' as amounts,
                           to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM slot_results 
                    WHERE username = $1 
                    ORDER BY created_at DESC 
                    LIMIT $2 OFFSET $3
                `;

                params = [username, limit, offset];
                countQuery = 'SELECT COUNT(*) FROM slot_results WHERE username = $1';
                countParams = [username];
                break;

            case 'scratch':
                query = `
                    SELECT id, reward as result, COALESCE(matches_count, 0) as matches_count, 
                           COALESCE(tier_cost, 5) as tier_cost, 
                           winning_numbers, slots,
                           to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM scratch_results 
                    WHERE username = $1 
                    ORDER BY created_at DESC 
                    LIMIT $2 OFFSET $3
                `;
                params = [username, limit, offset];
                countQuery = 'SELECT COUNT(*) FROM scratch_results WHERE username = $1';
                countParams = [username];
                break;

            case 'wish':
                query = `
                    SELECT id,
                           batch_count,
                           total_cost,
                           success_count,
                           total_reward_value,
                           gift_name,
                           to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM wish_sessions
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                `;
                params = [username, limit, offset];
                countQuery = 'SELECT COUNT(*) FROM wish_sessions WHERE username = $1';
                countParams = [username];
                break;

            case 'stone':
                query = `
                    SELECT id,
                           action_type,
                           cost,
                           reward,
                           slot_index,
                           before_slots,
                           after_slots,
                           to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM stone_logs
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                `;
                params = [username, limit, offset];
                countQuery = 'SELECT COUNT(*) FROM stone_logs WHERE username = $1';
                countParams = [username];
                break;

            case 'flip':
                query = `
                    SELECT id,
                           action_type,
                           reward,
                           good_count,
                           bad_count,
                           ended,
                           to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM flip_logs
                    WHERE username = $1 AND action_type = 'end'
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                `;
                params = [username, limit, offset];
                countQuery = "SELECT COUNT(*) FROM flip_logs WHERE username = $1 AND action_type = 'end'";
                countParams = [username];
                break;

            case 'duel':
                query = `
                    SELECT id,
                           gift_type,
                           reward,
                           power,
                           cost,
                           success,
                           to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM duel_logs
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                `;
                params = [username, limit, offset];
                countQuery = "SELECT COUNT(*) FROM duel_logs WHERE username = $1";
                countParams = [username];
                break;

            default:
                return res.status(400).json({ success: false, message: '不支持的游戏类型' });
        }

        const [records, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
        ]);

        const total = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            gameType,
            records: records.rows,
            pagination: {
                current: parseInt(page),
                total: totalPages,
                count: total,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('获取游戏记录失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
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
