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
require('dotenv').config();

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
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// WebSocket连接管理
const userSockets = new Map(); // username -> Set of socket ids

io.on('connection', (socket) => {
    console.log('用户连接WebSocket:', socket.id);

    // 用户身份验证和注册
    socket.on('register', (username) => {
        if (username) {
            if (!userSockets.has(username)) {
                userSockets.set(username, new Set());
            }
            userSockets.get(username).add(socket.id);
            socket.username = username;
            console.log(`用户 ${username} 注册WebSocket连接: ${socket.id}`);
        }
    });

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
    connect-src 'self'
      https://slot-server-9682.onrender.com
      https://scratch-server-vmit.onrender.com
      https://secure-spin-server.onrender.com
      https://wish-server.onrender.com;
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

// CSRF token 生成
function generateCSRFToken(req) {
    const token = tokens.create(req.session.id);
    req.session.csrfToken = token;
    return token;
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
        
        const user = userResult.rows[0];
        
        res.render('profile', {
            title: '个人资料 - Minimal Games',
            user: user
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
            req.session.csrfToken = GameLogic.generateToken(16);
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
            req.session.csrfToken = GameLogic.generateToken(16);

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

// 修改用户余额
app.post('/api/admin/update-balance', requireLogin, requireAdmin, async (req, res) => {
    try {
        const { username, balance } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名' });
        }
        
        if (balance === undefined || balance < 0) {
            return res.status(400).json({ success: false, message: '无效的余额数值' });
        }
        
        await pool.query(
            'UPDATE users SET balance = $1 WHERE username = $2',
            [balance, username]
        );
        
        res.json({ success: true, message: '余额修改成功', newBalance: balance });
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
        req.session.csrfToken = GameLogic.generateToken(16);
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
        req.session.csrfToken = GameLogic.generateToken(16);
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
            req.session.csrfToken = GameLogic.generateToken(16);
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
            req.session.csrfToken = GameLogic.generateToken(16);
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
        req.session.csrfToken = GameLogic.generateToken(16);
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
        req.session.csrfToken = GameLogic.generateToken(16);
    }
    
    const username = req.session.user.username;
    res.render('wish', { 
        username,
        csrfToken: req.session.csrfToken
    });
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
    try {
        const { giftType, cost } = req.body;
        const username = req.session.user.username;
        const clientIP = req.clientIP;
        const userAgent = req.userAgent;

        // 验证输入参数
        if (!giftType || !cost) {
            return res.status(400).json({ 
                success: false, 
                message: '参数不完整' 
            });
        }

        // 从配置文件获取可用的礼物类型
        const availableGifts = {};
        if (giftConfig.礼物映射) {
            for (const [key, config] of Object.entries(giftConfig.礼物映射)) {
                availableGifts[key] = {
                    name: config.名称,
                    cost: config.电币成本,
                    bilibili_id: config.bilibili_id
                };
            }
        } else {
            // 备用配置
            availableGifts.heartbox = { name: '心动盲盒', cost: 150, bilibili_id: '32251' };
            availableGifts.fanlight = { name: '粉丝团灯牌', cost: 1, bilibili_id: '31164' };
        }

        // 验证礼物类型
        if (!availableGifts[giftType]) {
            return res.status(400).json({ 
                success: false, 
                message: '无效的礼物类型' 
            });
        }

        // 验证价格
        if (cost !== availableGifts[giftType].cost) {
            return res.status(400).json({ 
                success: false, 
                message: '价格不匹配' 
            });
        }

        // 使用BalanceLogger进行扣费
        const balanceResult = await BalanceLogger.updateBalance({
            username: username,
            amount: -cost, // 负数表示扣除
            operationType: 'gift_exchange',
            description: `兑换礼物: ${availableGifts[giftType].name}`,
            gameData: {
                giftType: giftType,
                giftName: availableGifts[giftType].name,
                cost: cost
            },
            ipAddress: clientIP,
            userAgent: userAgent,
            requireSufficientBalance: true
        });

        if (!balanceResult.success) {
            return res.status(400).json({ 
                success: false, 
                message: balanceResult.message 
            });
        }

        // 获取用户的B站房间号
        const userRoomResult = await pool.query(`
            SELECT bilibili_room_id FROM users WHERE username = $1
        `, [username]);

        const bilibiliRoomId = userRoomResult.rows[0]?.bilibili_room_id;
        
        // 记录兑换记录，包含房间号和delivery状态
        const insertResult = await pool.query(`
            INSERT INTO gift_exchanges (
                username, gift_type, gift_name, cost, status, created_at,
                bilibili_room_id, delivery_status
            ) VALUES ($1, $2, $3, $4, 'completed', NOW(), $5, $6)
            RETURNING id
        `, [username, giftType, availableGifts[giftType].name, cost, bilibiliRoomId, 
            bilibiliRoomId ? 'pending' : 'no_room']);

        const exchangeId = insertResult.rows[0].id;

        console.log(`✅ 用户 ${username} 成功兑换 ${availableGifts[giftType].name}，花费 ${cost} 电币`);

        // 礼物将由Windows监听服务处理，无需立即发送
        let deliveryMessage = '';
        if (bilibiliRoomId) {
            console.log(`🎁 礼物兑换记录已创建，等待Windows监听服务处理...`);
            deliveryMessage = '，礼物正在发送中，请稍候...';
        } else {
            console.log(`⚠️ 用户 ${username} 未绑定B站房间号，跳过礼物发送`);
            deliveryMessage = '，请先绑定B站房间号以发送礼物';
        }

        res.json({ 
            success: true, 
            message: `兑换成功${deliveryMessage}`,
            newBalance: balanceResult.balance,
            deliveryStatus: bilibiliRoomId ? (deliveryMessage.includes('成功') ? 'delivered' : 'failed') : 'no_room'
        });

    } catch (error) {
        console.error('礼物兑换失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误，请稍后重试' 
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

        const result = await pool.query(`
            SELECT gift_type, gift_name, cost, status, created_at, delivery_status
            FROM gift_exchanges 
            WHERE username = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
        `, [username, limit, offset]);

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
        
        const giftSender = getGiftSender();
        const refreshResult = await giftSender.refreshCookies();
        
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
        
        const giftSender = getGiftSender();
        const cookieManager = giftSender.cookieManager;
        const checkResult = await cookieManager.checkCookieExpiry();
        
        res.json({
            success: true,
            expired: checkResult.expired,
            reason: checkResult.reason,
            lastCheck: giftSender.lastCookieCheck,
            nextCheck: giftSender.lastCookieCheck + giftSender.cookieCheckInterval,
            checkInterval: giftSender.cookieCheckInterval
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
        
        // 存储游戏记录到slot_results表（对齐kingboost格式）
        try {
            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-${Date.now()}-${Math.random()}`)
                .digest('hex');
                
            await pool.query(`
                INSERT INTO slot_results (username, result, won, proof, created_at) 
                VALUES ($1, $2, $3, $4, NOW())
            `, [
                username, 
                JSON.stringify([outcome.type, outcome.type, outcome.type]), // 三个相同结果
                outcome.type,
                proof
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
        
        // 存储游戏记录到scratch_results表（对齐kingboost格式）
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
            
            await pool.query(`
                INSERT INTO scratch_results (username, winning_numbers, slots, reward, proof, reward_list, created_at) 
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [
                username,
                JSON.stringify(winningNumbers),
                JSON.stringify(userSlots),
                outcomeType,
                proof,
                JSON.stringify(rewardList)
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

// 批量祈愿API - 瞬时处理
app.post('/api/wish-batch', 
    security.basicRateLimit,
    security.csrfProtection,
    (req, res) => {
    try {
        const { currentCount = 0, username, batchCount = 10 } = req.body;
        
        // 限制批量数量，防止滥用
        if (batchCount > 100000) {
            return res.status(400).json({ success: false, message: '批量数量过大' });
        }
        
        let successCount = 0;
        let newCurrentCount = currentCount;
        let lastResult;
        
        // 批量执行祈愿
        for (let i = 0; i < batchCount; i++) {
            lastResult = GameLogic.wish.makeWish(newCurrentCount);
            
            if (lastResult.isWin) {
                successCount++;
                newCurrentCount = 0; // 重置保底计数
                
                // 只在成功时触发飘屏（避免刷屏）
                if (username && Math.random() < 0.1) { // 10%概率显示飘屏
                    broadcastDanmaku(username, 'wish', true);
                }
            } else {
                newCurrentCount++;
            }
        }
        
        res.json({
            success: true,
            successCount,
            newCurrentCount,
            globalRate: lastResult.globalRate,
            actualRate: ((successCount / batchCount) * 100).toFixed(4)
        });
        
    } catch (error) {
        console.error('Batch wish error:', error);
        res.status(500).json({ success: false, message: '批量祈愿系统故障' });
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

// 测试通知API
app.post('/api/test/notification', (req, res) => {
    const { username, type } = req.body;
    
    const testNotification = {
        type: type || 'test',
        title: '测试通知',
        message: `这是发送给 ${username} 的测试通知`,
        level: 'info'
    };
    
    notifyUser(username, testNotification);
    console.log(`📤 发送测试通知给用户: ${username}`);
    
    res.json({ success: true, message: '测试通知已发送' });
});

// 测试安全警告API
app.post('/api/test/security-alert', (req, res) => {
    const { username } = req.body;
    
    const testEvent = {
        type: 'device_logout',
        title: '测试安全提醒',
        message: '这是一个测试的设备登录警告',
        level: 'warning',
        details: {
            kickedDevices: 1,
            timestamp: new Date().toISOString()
        }
    };
    
    notifySecurityEvent(username, testEvent);
    console.log(`🚨 发送测试安全警告给用户: ${username}`);
    
    res.json({ success: true, message: '测试安全警告已发送' });
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        games: ['quiz', 'slot', 'scratch', 'spin', 'wish'],
        questions: questions.length
    });
});

// 安全监控面板（需要认证）
app.get('/admin/security', (req, res) => {
    // 简单的密码保护
    const auth = req.headers.authorization;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (!auth || !auth.startsWith('Bearer ') || auth.split(' ')[1] !== adminPassword) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        return res.status(401).json({ message: 'Unauthorized' });
    }
    
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

// 安全管理接口
app.post('/admin/security/unblock', (req, res) => {
    const auth = req.headers.authorization;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (!auth || !auth.startsWith('Bearer ') || auth.split(' ')[1] !== adminPassword) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const { ip } = req.body;
    if (ip) {
        security.removeFromBlacklist(ip);
        security.clearUserBehavior(ip);
        res.json({ success: true, message: `IP ${ip} has been unblocked` });
    } else {
        res.status(400).json({ success: false, message: 'IP address required' });
    }
});

// ====== Windows监听服务API ======

// API密钥验证中间件
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const validApiKey = process.env.WINDOWS_API_KEY || 'your-secret-api-key-2024';
    
    if (!apiKey || apiKey !== validApiKey) {
        return res.status(401).json({ 
            success: false, 
            message: '无效的API密钥' 
        });
    }
    
    next();
}

// 获取待处理的礼物发送任务
app.get('/api/gift-tasks', requireApiKey, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, gift_type, bilibili_room_id, username, gift_name, created_at
            FROM gift_exchanges 
            WHERE delivery_status = 'pending' AND bilibili_room_id IS NOT NULL
            ORDER BY created_at ASC 
            LIMIT 10
        `);

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
        
        const result = await pool.query(`
            UPDATE gift_exchanges 
            SET delivery_status = 'delivered',
                processed_at = NOW()
            WHERE id = $1
            RETURNING username, gift_name
        `, [taskId]);

        if (result.rows.length > 0) {
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
        
        const result = await pool.query(`
            UPDATE gift_exchanges 
            SET delivery_status = 'failed',
                processed_at = NOW()
            WHERE id = $1
            RETURNING username, gift_name
        `, [taskId]);

        if (result.rows.length > 0) {
            console.log(`❌ Windows服务任务失败 ${taskId}: ${result.rows[0].username} 的 ${result.rows[0].gift_name} - ${errorMessage}`);
            res.json({ success: true, message: '任务标记为失败' });
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

server.listen(PORT, () => {
    console.log(`🎮 游戏服务器运行在端口 ${PORT}`);
    console.log(`📚 题库包含 ${questions.length} 道题目`);
    console.log(`🌐 访问 http://localhost:${PORT} 开始游戏`);
    console.log(`🚀 WebSocket飘屏系统已启动`);
    console.log(`🎁 B站送礼功能已启用`);
});

// 优雅关闭处理
process.on('SIGINT', async () => {
    console.log('\n🔄 正在优雅关闭服务器...');
    
    try {
        // 清理B站送礼浏览器资源
        const giftSender = getGiftSender();
        await giftSender.cleanup();
        
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
        const giftSender = getGiftSender();
        await giftSender.cleanup();
        
        if (pool) {
            await pool.end();
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 关闭时发生错误:', error);
        process.exit(1);
    }
});