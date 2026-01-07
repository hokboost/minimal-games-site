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
    max: 5,
    message: "❌ 尝试次数过多，请 10 分钟后再试。"
});

const registerLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
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
            'SELECT username, authorized, spins_allowed FROM users WHERE username = $1',
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

// 登录处理
app.post('/login', loginLimiter, async (req, res) => {
    const { username, password, _csrf } = req.body;
    
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
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1', 
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).render('login', {
                title: '登录 - Minimal Games',
                error: '用户名或密码错误！',
                csrfToken: generateCSRFToken(req)
            });
        }

        const user = result.rows[0];
        const now = new Date();
        
        // 账户锁定检查
        if (!user.is_admin && user.locked_until && new Date(user.locked_until) > now) {
            const lockMinutes = Math.ceil((new Date(user.locked_until) - now) / 60000);
            return res.status(423).render('login', {
                title: '登录 - Minimal Games',
                error: `账户已被锁定，请 ${lockMinutes} 分钟后再试！`,
                csrfToken: generateCSRFToken(req)
            });
        }

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
                
                const errorMsg = lockUntil ? 
                    `密码错误！账户已被锁定 ${failures-2} 分钟` : 
                    `密码错误！连续错误3次将被锁定 (当前${failures}次)`;
                    
                return res.status(401).render('login', {
                    title: '登录 - Minimal Games',
                    error: errorMsg,
                    csrfToken: generateCSRFToken(req)
                });
            }
        }

        // 成功 - 清除失败记录并重新生成session
        if (!user.is_admin) {
            await pool.query(
                'UPDATE users SET login_failures = 0, last_failure_time = NULL, locked_until = NULL WHERE username = $1',
                [username]
            );
        }
        
        req.session.regenerate(function (err) {
            if (err) {
                console.error("Session regenerate error:", err);
                return res.status(500).send("Session error");
            }
            
            req.session.user = {
                id: user.id,
                username: user.username,
                authorized: user.authorized,
                is_admin: user.is_admin
            };
            
            req.session.username = user.username;
            res.redirect('/');
        });

    } catch (err) {
        console.error('❌ 登录错误:', err);
        res.status(500).render('login', {
            title: '登录 - Minimal Games',
            error: '登录失败，请稍后再试。',
            csrfToken: generateCSRFToken(req)
        });
    }
});

// 登出
app.get('/logout', (req, res) => {
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
        
        const result = await pool.query(
            'UPDATE users SET balance = balance + $1 WHERE username = $2 RETURNING balance',
            [amount, username]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        res.json({ 
            success: true, 
            newBalance: parseFloat(result.rows[0].balance),
            addedAmount: amount
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
    
    // 如果用户已登录，获取余额
    let balance = 0;
    if (req.session.user) {
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
        
        // 检查并扣除电币
        const result = await pool.query(
            'UPDATE users SET balance = balance - 10 WHERE username = $1 AND balance >= 10 RETURNING balance',
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: '电币不足，需要10电币才能开始答题' });
        }
        
        res.json({ 
            success: true, 
            message: '游戏开始，已扣除10电币',
            newBalance: result.rows[0].balance 
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
        
        // 存储到数据库 - 对齐kingboost格式
        try {
            await pool.query(
                'INSERT INTO submissions (username, score, submitted_at) VALUES ($1, $2, NOW())',
                [username, correctCount]
            );
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
        
        try {
            const balanceResult = await pool.query(
                'UPDATE users SET balance = balance + $1 WHERE username = $2 RETURNING balance',
                [reward, username]
            );
            newBalance = balanceResult.rows[0]?.balance || 0;
        } catch (balanceError) {
            console.error('电币奖励发放失败:', balanceError);
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
app.get('/api/quiz/leaderboard', async (req, res) => {
    try {
        // 对齐kingboost的排行榜查询
        const result = await pool.query(
            `SELECT username, score, submitted_at 
             FROM submissions 
             WHERE DATE(submitted_at) = CURRENT_DATE 
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
        
        // 检查并扣除电币
        const result = await pool.query(
            'UPDATE users SET balance = balance - $1 WHERE username = $2 AND balance >= $1 RETURNING balance',
            [betAmount, username]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: '电币不足' });
        }
        
        const currentBalance = parseFloat(result.rows[0].balance);
        
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
        
        // 更新用户余额
        const finalResult = await pool.query(
            'UPDATE users SET balance = balance + $1 WHERE username = $2 RETURNING balance',
            [payout, username]
        );
        
        const finalBalance = parseFloat(finalResult.rows[0].balance);
        
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
        
        // 验证档位参数 - 修复winCount根据档位设置
        const validTiers = [
            { cost: 5, winCount: 5 },   // 5元档位，5个中奖号码
            { cost: 10, winCount: 10 }, // 10元档位，10个中奖号码  
            { cost: 100, winCount: 20 } // 100元档位，20个中奖号码
        ];
        
        const selectedTier = validTiers.find(t => t.cost === tier && t.winCount === winCount);
        if (!selectedTier) {
            return res.status(400).json({ success: false, message: '无效的游戏档位' });
        }
        
        // 检查并扣除电币
        const result = await pool.query(
            'UPDATE users SET balance = balance - $1 WHERE username = $2 AND balance >= $1 RETURNING balance',
            [tier, username]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: '电币不足' });
        }
        
        const currentBalance = parseFloat(result.rows[0].balance);
        
        // 新的中奖逻辑：期望值等于投注金额
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
        
        // 更新用户余额
        const finalResult = await pool.query(
            'UPDATE users SET balance = balance + $1 WHERE username = $2 RETURNING balance',
            [payout, username]
        );
        
        const finalBalance = parseFloat(finalResult.rows[0].balance);
        
        // 生成刮刮乐显示内容
        const winningNumbers = [];
        for (let i = 0; i < winCount; i++) {
            winningNumbers.push(Math.floor(Math.random() * 100) + 1);
        }
        
        // 生成非中奖区域 - 显示各种诱人的金额
        const slots = [];
        const attractiveAmounts = [
            1000, 2000, 5000, 10000, 20000, 50000, 100000, 
            500000, 1000000, 2000000, 5000000, 10000000, 
            88888, 66666, 99999, 168000, 888888, 666666
        ];
        
        for (let i = 0; i < (25 - winCount); i++) {
            const randomAmount = attractiveAmounts[Math.floor(Math.random() * attractiveAmounts.length)];
            slots.push({
                num: Math.floor(Math.random() * 100) + 1,
                prize: `${randomAmount} 电币`
            });
        }
        
        res.json({
            success: true,
            outcome: outcomeType,
            payout: payout,
            newBalance: currentBalance,
            finalBalance: finalBalance,
            winningNumbers: winningNumbers,
            slots: slots
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

// 404 处理
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
});