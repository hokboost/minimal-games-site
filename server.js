const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const http = require('http');
const { Server } = require('socket.io');

// 导入本地游戏数据和逻辑
const questions = require('./data/questions');
const GameLogic = require('./data/gameLogic');

// 导入安全中间件
const security = require('./middleware/security');

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

// Helmet 安全头
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrcAttr: ["'unsafe-inline'"], // 允许内联事件处理器
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Session配置
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
}));

// 基础中间件
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize()); // 防止NoSQL注入

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

// 路由
app.get('/', (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = GameLogic.generateToken(16);
    }
    res.render('index');
});

app.get('/quiz', security.basicRateLimit, (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = GameLogic.generateToken(16);
    }
    
    const username = generateUsername();
    res.render('quiz', { 
        username,
        csrfToken: req.session.csrfToken
    });
});

app.get('/slot', security.basicRateLimit, (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = GameLogic.generateToken(16);
    }
    
    const username = generateUsername();
    res.render('slot', { 
        username,
        csrfToken: req.session.csrfToken
    });
});

app.get('/scratch', security.basicRateLimit, (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = GameLogic.generateToken(16);
    }
    
    const username = generateUsername();
    res.render('scratch', { 
        username,
        csrfToken: req.session.csrfToken
    });
});

app.get('/spin', security.basicRateLimit, (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = GameLogic.generateToken(16);
    }
    
    const username = generateUsername();
    res.render('spin', { 
        username,
        csrfToken: req.session.csrfToken
    });
});

app.get('/wish', security.basicRateLimit, (req, res) => {
    // 初始化session
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        req.session.csrfToken = GameLogic.generateToken(16);
    }
    
    const username = generateUsername();
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
    security.basicRateLimit,
    security.csrfProtection,
    (req, res) => {
    try {
        const { username, answers = [] } = req.body;
        
        let correctCount = 0;
        const userSession = userSessions.get(username) || {};
        
        for (const answer of answers) {
            const sessionData = userSession[answer.token];
            if (sessionData) {
                const question = questionMap.get(sessionData.questionId); // O(1)查找
                if (question && GameLogic.quiz.validateAnswer(question, answer.answerIndex)) {
                    correctCount++;
                }
            } else {
                console.warn(`Missing session data for token: ${answer.token}, user: ${username}`);
            }
        }
        
        // 只有在成功验证答案后才清理用户会话
        if (Object.keys(userSession).length > 0) {
            userSessions.delete(username);
        }
        
        res.json({
            success: true,
            score: correctCount,
            total: answers.length,
            proof: GameLogic.generateToken(8)
        });
    } catch (error) {
        console.error('Quiz submit error:', error);
        res.status(500).json({ success: false, message: '提交失败' });
    }
});

// Slot API 路由
app.post('/api/slot/spin', 
    security.basicRateLimit,
    security.csrfProtection,
    (req, res) => {
    try {
        const result = GameLogic.slot.spin();
        res.json({
            success: true,
            reels: result.reels,
            reward: result.reward
        });
    } catch (error) {
        console.error('Slot error:', error);
        res.status(500).json({ success: false, message: '老虎机故障' });
    }
});

// Scratch API 路由
app.post('/api/scratch', 
    security.basicRateLimit,
    security.csrfProtection,
    (req, res) => {
    try {
        const card = GameLogic.scratch.generateCard();
        res.json({
            success: true,
            winningNumbers: card.winningNumbers,
            slots: card.slots
        });
    } catch (error) {
        console.error('Scratch error:', error);
        res.status(500).json({ success: false, message: '刮刮卡生成失败' });
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

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        games: ['quiz', 'slot', 'scratch', 'spin', 'wish'],
        questions: questions.length
    });
});

// 管理员登录页面
app.get('/admin', (req, res) => {
    res.render('admin');
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