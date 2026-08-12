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

    if (!process.env.GIFT_TASKS_HMAC_SECRET || process.env.GIFT_TASKS_HMAC_SECRET.length < 32) {
        console.error('生产环境安全错误: GIFT_TASKS_HMAC_SECRET 必须是至少32字节的随机字符串');
        process.exit(1);
    }

    if (process.env.CSRF_TEST_MODE === 'true' || process.env.CSRF_AUTO_FILL === 'true') {
        console.error('生产环境安全错误: 禁止启用 CSRF_TEST_MODE 或 CSRF_AUTO_FILL');
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
const developmentSessionSecret = crypto.randomBytes(32).toString('hex');
const sessionSecret = process.env.SESSION_SECRET || developmentSessionSecret;
const { parseCookies, decodeSignedSessionCookie } = require('./lib/session-auth');
const { createIdempotencyMiddleware } = require('./lib/idempotency');
const { getClientIp } = require('./lib/client-ip');
const { requestContextMiddleware, setRequestId } = require('./lib/request-context');

let giftConfig = {};
try {
    const giftConfigData = fs.readFileSync(path.join(__dirname, 'gift-codes.json'), 'utf8');
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
const registerAnalyticsRoutes = require('./routes/analytics');

// 导入i18n国际化
const { i18nMiddleware, setupLanguageRoutes } = require('./i18n');

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

        const cookies = parseCookies(cookieHeader);
        const sessionId = decodeSignedSessionCookie(cookies.minimal_games_sid, sessionSecret);
        if (!sessionId) {
            return next(new Error('Invalid session cookie'));
        }

        // 从数据库获取session
        const sessionQuery = 'SELECT sess FROM user_sessions WHERE sid = $1 AND expire > NOW()';
        const result = await pool.query(sessionQuery, [sessionId]);
        
        if (result.rows.length === 0) {
            return next(new Error('Invalid session'));
        }

        const sessionData = result.rows[0].sess;
        if (!sessionData.user?.username) {
            return next(new Error('User not authenticated'));
        }

        const currentUser = await pool.query(
            'SELECT id, username, authorized, is_admin, deactivated FROM users WHERE username = $1',
            [sessionData.user.username]
        );
        const activeSession = await pool.query(
            'SELECT is_active FROM active_sessions WHERE session_id = $1 AND username = $2',
            [sessionId, sessionData.user.username]
        );
        const user = currentUser.rows[0];
        if (!user?.authorized || user.deactivated === true || activeSession.rows[0]?.is_active !== true) {
            return next(new Error('Session is no longer authorized'));
        }

        // 将验证过的用户信息附加到socket
        socket.authenticatedUser = {
            username: user.username,
            userId: user.id,
            isAdmin: user.is_admin === true,
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

function disconnectUserSockets(username, sessionIds = null) {
    const allowedSessionIds = sessionIds ? new Set(sessionIds) : null;
    const socketIds = [...(userSockets.get(username) || [])];
    for (const socketId of socketIds) {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) continue;
        const sessionId = socket.authenticatedUser?.sessionId;
        if (!allowedSessionIds || allowedSessionIds.has(sessionId)) {
            socket.disconnect(true);
        }
    }
}

const PORT = process.env.PORT || 3000;

// 数据库初始化函数
async function initializeDatabase() {
    let migrationLockClient;
    try {
        console.log('🔧 检查数据库结构...');
        migrationLockClient = await pool.connect();
        await migrationLockClient.query(
            "SELECT pg_advisory_lock(hashtext('minimal_games_schema_migration'))"
        );

        for (const migrationName of [
            'add_idempotency_key.sql',
            'add_registration_ip.sql',
            'create_ux_analytics.sql',
            'create_wish_tables.sql',
            'create_idempotency_keys.sql',
            'create_quiz_runtime_tables.sql',
            'add_pk_report_id.sql',
            'strengthen_financial_audit.sql'
        ]) {
            const migrationPath = path.join(__dirname, 'migrations', migrationName);
            await pool.query(fs.readFileSync(migrationPath, 'utf8'));
        }
        
        // 检查quantity字段是否存在
        const checkQuantity = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'gift_exchanges' 
            AND column_name = 'quantity'
        `);
        
        if (checkQuantity.rows.length === 0) {
            console.log('➕ 添加quantity字段到gift_exchanges表...');
            await pool.query(`ALTER TABLE gift_exchanges ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1`);
            // 更新现有记录
            await pool.query(`UPDATE gift_exchanges SET quantity = 1 WHERE quantity IS NULL`);
            console.log('✅ quantity字段添加完成');
        } else {
            console.log('✅ quantity字段已存在');
        }

        const checkFailureReason = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'gift_exchanges'
            AND column_name = 'failure_reason'
        `);

        if (checkFailureReason.rows.length === 0) {
            console.log('➕ 添加failure_reason字段到gift_exchanges表...');
            await pool.query(`ALTER TABLE gift_exchanges ADD COLUMN IF NOT EXISTS failure_reason TEXT`);
            console.log('✅ failure_reason字段添加完成');
        } else {
            console.log('✅ failure_reason字段已存在');
        }

        const checkUpdatedAt = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'gift_exchanges'
            AND column_name = 'updated_at'
        `);

        if (checkUpdatedAt.rows.length === 0) {
            console.log('➕ 添加updated_at字段到gift_exchanges表...');
            await pool.query(`ALTER TABLE gift_exchanges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
            await pool.query(`UPDATE gift_exchanges SET updated_at = created_at WHERE updated_at IS NULL`);
            console.log('✅ updated_at字段添加完成');
        } else {
            console.log('✅ updated_at字段已存在');
        }

        const checkWishFailureReason = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'wish_inventory'
            AND column_name = 'last_failure_reason'
        `);

        if (checkWishFailureReason.rows.length === 0) {
            console.log('➕ 添加last_failure_reason字段到wish_inventory表...');
            await pool.query(`ALTER TABLE wish_inventory ADD COLUMN IF NOT EXISTS last_failure_reason TEXT`);
            console.log('✅ last_failure_reason字段添加完成');
        } else {
            console.log('✅ last_failure_reason字段已存在');
        }

        const checkWishSourceType = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'wish_inventory'
            AND column_name = 'source_type'
        `);

        if (checkWishSourceType.rows.length === 0) {
            console.log('➕ 添加source_type字段到wish_inventory表...');
            await pool.query(`ALTER TABLE wish_inventory ADD COLUMN IF NOT EXISTS source_type TEXT`);
            console.log('✅ source_type字段添加完成');
        } else {
            console.log('✅ source_type字段已存在');
        }

        const checkWishBatchId = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'wish_inventory'
            AND column_name = 'source_batch_id'
        `);

        if (checkWishBatchId.rows.length === 0) {
            console.log('➕ 添加source_batch_id字段到wish_inventory表...');
            await pool.query(`ALTER TABLE wish_inventory ADD COLUMN IF NOT EXISTS source_batch_id TEXT`);
            console.log('✅ source_batch_id字段添加完成');
        } else {
            console.log('✅ source_batch_id字段已存在');
        }

        const checkWishBatchOrder = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'wish_inventory'
            AND column_name = 'batch_order'
        `);

        if (checkWishBatchOrder.rows.length === 0) {
            console.log('➕ 添加batch_order字段到wish_inventory表...');
            await pool.query(`ALTER TABLE wish_inventory ADD COLUMN IF NOT EXISTS batch_order INTEGER`);
            console.log('✅ batch_order字段添加完成');
        } else {
            console.log('✅ batch_order字段已存在');
        }

        const checkWishBatchValue = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'wish_inventory'
            AND column_name = 'batch_value'
        `);

        if (checkWishBatchValue.rows.length === 0) {
            console.log('➕ 添加batch_value字段到wish_inventory表...');
            await pool.query(`ALTER TABLE wish_inventory ADD COLUMN IF NOT EXISTS batch_value INTEGER`);
            console.log('✅ batch_value字段添加完成');
        } else {
            console.log('✅ batch_value字段已存在');
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pk_gift_logs (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                room_id VARCHAR(50),
                gift_ids JSONB NOT NULL,
                ticket_count INTEGER,
                script_name VARCHAR(50),
                success BOOLEAN,
                reason TEXT,
                created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai')
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pk_gift_logs_username ON pk_gift_logs(username, created_at DESC)`);

        const checkPkTicketCount = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'pk_gift_logs'
              AND column_name = 'ticket_count'
        `);
        if (checkPkTicketCount.rows.length === 0) {
            console.log('➕ 添加ticket_count字段到pk_gift_logs表...');
            await pool.query(`ALTER TABLE pk_gift_logs ADD COLUMN IF NOT EXISTS ticket_count INTEGER`);
            console.log('✅ ticket_count字段添加完成');
        } else {
            console.log('✅ ticket_count字段已存在');
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pk_tasks (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                room_id VARCHAR(50),
                action VARCHAR(20) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                error TEXT,
                created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai'),
                processed_at TIMESTAMP
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pk_tasks_status ON pk_tasks(status, created_at ASC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pk_tasks_user ON pk_tasks(username, created_at DESC)`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pk_runner_state (
                username VARCHAR(50) PRIMARY KEY,
                room_id VARCHAR(50),
                running BOOLEAN DEFAULT FALSE,
                pid INTEGER,
                updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai')
            )
        `);
        return true;
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
        return false;
    } finally {
        if (migrationLockClient) {
            try {
                await migrationLockClient.query(
                    "SELECT pg_advisory_unlock(hashtext('minimal_games_schema_migration'))"
                );
            } catch (unlockError) {
                console.error('❌ 释放数据库迁移锁失败:', unlockError);
            }
            migrationLockClient.release();
        }
    }
}

async function runDatabaseMaintenance() {
    let client;
    let locked = false;
    try {
        client = await pool.connect();
        const lockResult = await client.query(
            "SELECT pg_try_advisory_lock(hashtext('minimal_games_maintenance')) AS locked"
        );
        locked = lockResult.rows[0]?.locked === true;
        if (!locked) return;

        await client.query(`
            WITH expired AS (
                SELECT id
                FROM quiz_sessions
                WHERE status = 'active' AND expires_at < NOW()
                ORDER BY expires_at
                LIMIT 1000
            )
            UPDATE quiz_sessions AS session
            SET status = 'expired', settled_at = NOW()
            FROM expired
            WHERE session.id = expired.id
        `);
        await client.query(`
            DELETE FROM quiz_sessions
            WHERE id IN (
                SELECT id
                FROM quiz_sessions
                WHERE status != 'active'
                  AND created_at < NOW() - INTERVAL '30 days'
                ORDER BY created_at
                LIMIT 1000
            )
        `);
        await client.query(`
            DELETE FROM idempotency_keys
            WHERE id IN (
                SELECT id
                FROM idempotency_keys
                WHERE status = 'completed'
                  AND updated_at < NOW() - INTERVAL '180 days'
                ORDER BY updated_at
                LIMIT 5000
            )
        `);
        await client.query(`
            DELETE FROM ux_events
            WHERE id IN (
                SELECT id FROM ux_events
                WHERE occurred_at < NOW() - INTERVAL '180 days'
                ORDER BY occurred_at
                LIMIT 5000
            )
        `);
        await client.query(`
            DELETE FROM ux_sessions
            WHERE id IN (
                SELECT id FROM ux_sessions
                WHERE last_seen_at < NOW() - INTERVAL '365 days'
                ORDER BY last_seen_at
                LIMIT 1000
            )
        `);
    } catch (error) {
        console.error('数据库维护失败:', error);
    } finally {
        if (client) {
            if (locked) {
                await client.query(
                    "SELECT pg_advisory_unlock(hashtext('minimal_games_maintenance'))"
                ).catch((error) => console.error('释放数据库维护锁失败:', error));
            }
            client.release();
        }
    }
}

// 视图引擎设置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Keep protocol/cookie proxy handling narrow. Client IP resolution is handled
// separately because Render's ingress contains more than one proxy hop.
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
    store: sessionStore,
    secret: sessionSecret,
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
app.use(requestContextMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/ux/batch', express.text({ type: 'text/plain', limit: '32kb' }));
app.use(express.json({ limit: '2mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 100 }));
app.use('/api/ux/batch', (error, req, res, next) => {
    // Browsers may terminate an ordinary heartbeat while preserving the
    // pagehide beacon. Telemetry is best-effort, so aborted bodies are ignored.
    if (error?.type === 'request.aborted' || error?.type === 'stream.not.readable') {
        return res.status(204).end();
    }
    return next(error);
});
app.use(mongoSanitize()); // 防止NoSQL注入

// 国际化中间件
app.use(i18nMiddleware);

// 语言切换路由
setupLanguageRoutes(app);

// IP风控中间件
app.use(async (req, res, next) => {
    const clientIP = getClientIp(req);
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
    if (!req.session.csrfSecret) {
        req.session.csrfSecret = tokens.secretSync();
    }
    const token = tokens.create(req.session.csrfSecret);
    req.session.csrfToken = token;
    return token;
}

// 统一的CSRF验证
function verifyCSRFToken(req, providedToken) {
    const csrfSecret = req.session.csrfSecret;
    if (!csrfSecret || !providedToken) {
        return false;
    }
    return tokens.verify(csrfSecret, providedToken);
}

// Existing sessions created before per-session CSRF secrets were introduced are
// upgraded on their next page load. Mutating requests never accept legacy tokens.
app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD')
        && req.session?.initialized
        && (!req.session.csrfSecret || !req.session.csrfToken)) {
        generateCSRFToken(req);
    }
    next();
});

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
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ success: false, message: '请先登录' });
        }
        return res.redirect('/login');
    }

    try {
        const username = req.session.user.username;
        const result = await pool.query(`
            SELECT u.id, u.username, u.authorized, u.is_admin, u.deactivated,
                   a.is_active, a.termination_reason
            FROM users u
            LEFT JOIN active_sessions a
              ON a.username = u.username AND a.session_id = $2
            WHERE u.username = $1
        `, [username, req.sessionID]);
        const current = result.rows[0];

        if (!current || current.deactivated === true || current.is_active !== true) {
            const kicked = current?.termination_reason === 'new_device_login';
            return req.session.destroy(() => {
                res.clearCookie('minimal_games_sid');
                if (req.path.startsWith('/api/')) {
                    return res.status(401).json({
                        success: false,
                        message: kicked ? '账号已在其他设备登录' : '登录会话已失效'
                    });
                }
                return res.redirect(kicked ? '/login?kicked=true' : '/login');
            });
        }

        req.session.user = {
            id: current.id,
            username: current.username,
            authorized: current.authorized === true,
            is_admin: current.is_admin === true
        };
        await pool.query(`
            UPDATE active_sessions
            SET last_activity = NOW()
            WHERE session_id = $1
              AND is_active = true
              AND last_activity < NOW() - INTERVAL '1 minute'
        `, [req.sessionID]);
        return next();
    } catch (error) {
        console.error('Session validation error:', error);
        return res.status(503).json({ success: false, message: '会话验证暂不可用' });
    }
};

const requireAuthorized = (req, res, next) => {
    if (!req.session.user || !req.session.user.authorized) {
        // 检查是否是API请求
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: '未授权访问' });
        }
        return res.status(403).send(res.locals.lang === 'zh' ? '❌ 未授权访问' : '❌ Unauthorized access');
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.user.is_admin) {
        // 检查是否是API请求
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: '无权访问管理员后台' });
        }
        return res.status(403).send(res.locals.lang === 'zh' ? '🚫 无权访问管理员后台' : '🚫 Admin access denied');
    }
    next();
};

// 未授权用户只允许进入首页或退出登录
app.use((req, res, next) => {
    if (req.session.user && !req.session.user.authorized) {
        const allowedPaths = new Set(['/', '/logout', '/login', '/register']);
        if (allowedPaths.has(req.path) || req.path.startsWith('/set-language')) {
            return next();
        }
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: '未授权访问' });
        }
        return res.redirect('/?auth=pending');
    }
    next();
});

// 限流配置
const clientIpRateLimitKey = (req) => rateLimit.ipKeyGenerator(
    req.clientIP || getClientIp(req) || req.ip || 'unknown'
);

const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: "❌ 尝试次数过多，请 10 分钟后再试。",
    keyGenerator: clientIpRateLimitKey
});

const registerLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: "⚠️ 注册太频繁，请稍后再试。",
    keyGenerator: clientIpRateLimitKey,
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

// ====================
// 认证路由
// ====================
const uiText = (res, zh, en) => (res.locals.lang === 'zh' ? zh : en);
const usernamePattern = /^[\p{L}\p{N}_-]{3,32}$/u;
const isStrongPassword = (value) => typeof value === 'string'
    && value.length >= 12
    && value.length <= 128
    && Buffer.byteLength(value, 'utf8') <= 72
    && /\p{L}/u.test(value)
    && /\p{N}/u.test(value);

// 登录页面
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login', {
        title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
        csrfToken: generateCSRFToken(req),
        error: req.query.error,
        req
    });
});

// 注册页面
app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register', {
        title: uiText(res, '注册 - Minimal Games', 'Register - Minimal Games'),
        csrfToken: generateCSRFToken(req),
        error: req.query.error
    });
});

// 个人资料页面
app.get('/profile', requireLogin, (req, res, next) => {
    if (!req.session.user?.authorized) {
        return res.redirect('/?auth=pending');
    }
    next();
}, async (req, res) => {
    try {
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req);
        }
        const username = req.session.user.username;
        const userResult = await pool.query(
            'SELECT username, authorized, balance FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).send(uiText(res, '用户不存在', 'User not found'));
        }
        
        // 获取游戏记录统计
        const gameStats = await Promise.all([
            pool.query('SELECT COUNT(*) as count, MAX(score) as best_score FROM submissions WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count, SUM(CASE WHEN won != \'lost\' THEN 1 ELSE 0 END) as wins FROM slot_results WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count, SUM(CASE WHEN COALESCE(matches_count, 0) > 0 THEN 1 ELSE 0 END) as wins FROM scratch_results WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count, COALESCE(SUM(success_count), 0) as wins FROM wish_sessions WHERE username = $1', [username]),
            pool.query('SELECT COUNT(*) as count FROM blindbox_logs WHERE username = $1', [username]),
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
            blindbox: {
                total: parseInt(gameStats[4].rows[0].count) || 0
            },
            stone: {
                total: parseInt(gameStats[5].rows[0].count) || 0
            },
            flip: {
                total: parseInt(gameStats[6].rows[0].count) || 0
            },
            duel: {
                total: parseInt(gameStats[7].rows[0].count) || 0
            }
        };
        
        const user = userResult.rows[0];
        
        res.render('profile', {
            title: uiText(res, '个人资料 - Minimal Games', 'Profile - Minimal Games'),
            user: user,
            gameStats: stats,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('获取用户数据失败:', error);
        res.status(500).send(uiText(res, '服务器错误', 'Server error'));
    }
});

// 注册处理
app.post('/register', registerLimiter, async (req, res) => {
    const { username, password, _csrf } = req.body;
    
    // CSRF 验证
    if (!verifyCSRFToken(req, _csrf)) {
        return res.status(403).send(uiText(res, '⚠️ CSRF token 校验失败', '⚠️ CSRF token validation failed'));
    }

    // 输入验证
    if (!usernamePattern.test(String(username || '')) || !password) {
        return res.render('register', {
            title: uiText(res, '注册 - Minimal Games', 'Register - Minimal Games'),
            error: uiText(res, '用户名须为3-32位中文、字母、数字、下划线或连字符', 'Username must be 3-32 letters, numbers, underscores, or hyphens.'),
            csrfToken: generateCSRFToken(req)
        });
    }

    // 密码强度验证
    if (!isStrongPassword(password)) {
        return res.render('register', {
            title: uiText(res, '注册 - Minimal Games', 'Register - Minimal Games'),
            error: uiText(res, '密码须为12-128位，并同时包含字母和数字', 'Password must be 12-128 characters and include letters and numbers.'),
            csrfToken: generateCSRFToken(req)
        });
    }

    try {
        const hashed = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, created_at, registration_ip)
             VALUES ($1, $2, NOW(), $3)
             RETURNING id`,
            [username, hashed, req.clientIP]
        );
        await IPManager.recordIPActivity(req.clientIP, username, req.userAgent, 'register');
        
        console.log(`[注册成功] 用户ID: ${result.rows[0].id}, 用户名: ${username}`);
        res.redirect('/login?registered=true');
    } catch (err) {
        if (err.code === '23505') {
            res.render('register', {
                title: uiText(res, '注册 - Minimal Games', 'Register - Minimal Games'),
                error: uiText(res, '❌ 用户名已存在！', '❌ Username already exists!'),
                csrfToken: generateCSRFToken(req)
            });
        } else {
            console.error(err);
            res.render('register', {
                title: uiText(res, '注册 - Minimal Games', 'Register - Minimal Games'),
                error: uiText(res, '❌ 注册失败，请稍后重试。', '❌ Registration failed, please try again.'),
                csrfToken: generateCSRFToken(req)
            });
        }
    }
});

// 登录处理 - 集成IP风控和单设备登录
app.post('/login', loginLimiter, async (req, res) => {
    const { username, password, _csrf } = req.body;
    const clientIP = req.clientIP;
    const userAgent = req.userAgent;
    
    if (!verifyCSRFToken(req, _csrf)) {
        return res.status(403).send(uiText(res, '⚠️ CSRF token 校验失败', '⚠️ CSRF token validation failed'));
    }

    if (!username || !password) {
        return res.status(400).render('login', {
            title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
            error: uiText(res, '用户名或密码不能为空！', 'Username and password cannot be empty!'),
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
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, '当前网络环境存在安全风险，请稍后重试', 'Current network environment is risky. Please try again later.'),
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
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, '用户名或密码错误！', 'Invalid username or password!'),
                csrfToken: generateCSRFToken(req)
            });
        }

        const user = result.rows[0];
        const now = new Date();

        if (user.deactivated === true) {
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_deactivated');
            return res.status(401).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, '用户名或密码错误！', 'Invalid username or password!'),
                csrfToken: generateCSRFToken(req)
            });
        }
        
        // 4. 账户锁定检查
        if (user.locked_until && new Date(user.locked_until) > now) {
            const lockMinutes = Math.ceil((new Date(user.locked_until) - now) / 60000);
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_locked');
            return res.status(423).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, `账户已被锁定，请 ${lockMinutes} 分钟后再试！`, `Account locked. Try again in ${lockMinutes} minutes.`),
                csrfToken: generateCSRFToken(req)
            });
        }

        // 5. 验证密码
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            const failureResult = await pool.query(`
                UPDATE users
                SET login_failures = COALESCE(login_failures, 0) + 1,
                    last_failure_time = NOW(),
                    locked_until = CASE
                        WHEN COALESCE(login_failures, 0) + 1 >= 3 THEN
                            NOW() + make_interval(mins => LEAST(
                                30,
                                POWER(2, LEAST(COALESCE(login_failures, 0) - 2, 5))::integer
                            ))
                        ELSE NULL
                    END
                WHERE username = $1
                RETURNING login_failures, locked_until
            `, [username]);
            const failureState = failureResult.rows[0];
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_failed');

            const errorMsg = failureState?.locked_until
                ? uiText(res, '用户名或密码错误，账户已被临时锁定', 'Invalid credentials. Account temporarily locked.')
                : uiText(res, '用户名或密码错误！', 'Invalid username or password!');

            return res.status(401).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: errorMsg,
                csrfToken: generateCSRFToken(req)
            });
        }

        // 6. 登录成功处理
        await pool.query(
            'UPDATE users SET login_failures = 0, last_failure_time = NULL, locked_until = NULL WHERE username = $1',
            [username]
        );
        
        // 7. 重新生成session ID以提高安全性
        req.session.regenerate(async function (err) {
            if (err) {
                console.error("Session regenerate error:", err);
                return res.status(500).send("Session error");
            }

            try {
            // regenerate会清空旧会话，最终用户信息由加锁后的数据库记录提供。
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req); // 统一使用csrf库

            // 9. 管理员登录日志
            if (username === 'hokboost') {
                console.log(`管理员 ${username} 登录 - 允许多设备会话`);
            }

            // 10. 创建单设备会话管理（使用新的session ID，恢复实时通知）
            const sessionResult = await SessionManager.createSingleDeviceSession(
                username,
                req.sessionID,
                clientIP,
                userAgent,
                notifySecurityEvent,
                user.password_hash
            );

            if (!sessionResult.success) {
                console.error('创建单设备会话失败');
                return req.session.destroy(() => {
                    res.clearCookie('minimal_games_sid');
                    const credentialsChanged = sessionResult.reason === 'credentials_changed';
                    res.status(credentialsChanged ? 401 : 503).send(credentialsChanged
                        ? uiText(res, '密码已发生变化，请重新登录', 'Password changed. Please sign in again.')
                        : uiText(res, '登录会话创建失败，请重试', 'Failed to create login session. Please retry.'));
                });
            }
            disconnectUserSockets(username, sessionResult.terminatedSessionIds);
            req.session.user = sessionResult.user;
            req.session.username = sessionResult.user.username;
            await new Promise((resolve, reject) => {
                req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
            });

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
            } catch (callbackError) {
                console.error('登录会话初始化失败:', callbackError);
                await SessionManager.terminateSession(req.sessionID, 'login_initialization_failed')
                    .catch(() => {});
                return req.session.destroy(() => {
                    res.clearCookie('minimal_games_sid');
                    if (!res.headersSent) {
                        res.status(503).send(uiText(res, '登录初始化失败，请重试', 'Login initialization failed. Please retry.'));
                    }
                });
            }
        });

    } catch (err) {
        console.error('❌ 登录错误:', err);
        await IPManager.recordIPActivity(clientIP, username || 'unknown', userAgent, 'login_error');
        res.status(500).render('login', {
            title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
            error: uiText(res, '登录失败，请稍后再试。', 'Login failed, please try again.'),
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
app.post('/api/change-password', requireLogin, requireCSRF, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const username = req.session.user.username;

        // 输入验证
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: '请填写所有字段' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: '新密码和确认密码不匹配' });
        }

        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ success: false, message: '新密码须为12-128位，并同时包含字母和数字' });
        }

        // 验证当前密码
        await client.query('BEGIN');
        const userResult = await client.query(
            'SELECT password_hash FROM users WHERE username = $1 FOR UPDATE',
            [username]
        );
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: '用户不存在' });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
        if (!isValidPassword) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: '当前密码错误' });
        }

        // 更新密码
        const newPasswordHash = await bcrypt.hash(newPassword, 12);
        await client.query(
            'UPDATE users SET password_hash = $1 WHERE username = $2',
            [newPasswordHash, username]
        );
        const otherSessions = await client.query(
            `SELECT session_id
             FROM active_sessions
             WHERE username = $1 AND session_id != $2 AND is_active = true
             FOR UPDATE`,
            [username, req.sessionID]
        );
        const otherSessionIds = otherSessions.rows.map((row) => row.session_id);
        await client.query(
            `UPDATE active_sessions
             SET is_active = false, terminated_at = NOW(), termination_reason = 'password_changed'
             WHERE username = $1 AND session_id != $2 AND is_active = true`,
            [username, req.sessionID]
        );
        if (otherSessionIds.length > 0) {
            await client.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [otherSessionIds]);
        }
        const responseBody = { success: true, message: '密码修改成功！' };
        await req.finalizeIdempotency?.(client, 200, responseBody);
        await client.query('COMMIT');

        disconnectUserSockets(username, otherSessionIds);

        res.json(responseBody);
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('修改密码失败:', error);
        res.status(500).json({ success: false, message: '修改密码失败，请稍后重试' });
    } finally {
        client?.release();
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
        title: uiText(res, 'Minimal Games 游戏中心', 'Minimal Games Game Center'),
        user: req.session.user || null,
        balance: balance,
        req: req
    });
});

app.get('/games', async (req, res) => {
    if (!req.session.initialized) {
        req.session.initialized = true;
        req.session.createdAt = Date.now();
        generateCSRFToken(req);
    }

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

    res.render('games', {
        title: uiText(res, '游戏专区', 'Game Zone'),
        user: req.session.user || null,
        balance: balance,
        req: req
    });
});

const wishConfigs = {
    deepsea_singer: {
        giftType: 'deepsea_singer',
        name: '梦幻游乐园',
        bilibiliGiftId: '34383',
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
    // 动态模式下不预先写死牌面，这里仅返回占位数组（向前兼容调用）
    return Array(9).fill(null);
}

// Flip: 使用预生成牌面，数据库记录牌面与已翻状态
async function getFlipState(username, client = pool, { forUpdate = false } = {}) {
    const executor = client.query ? client.query.bind(client) : client;
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    let result = await executor(
        `SELECT board, flipped, good_count, bad_count, ended FROM flip_states WHERE username = $1${lockClause}`,
        [username]
    );

    if (result.rows.length === 0) {
        const board = createFlipBoard();
        const flipped = Array(board.length).fill(false);
        await executor(
            `INSERT INTO flip_states (username, board, flipped, good_count, bad_count, ended, created_at, updated_at)
             VALUES ($1, $2, $3, 0, 0, FALSE, (NOW() AT TIME ZONE 'Asia/Shanghai'), (NOW() AT TIME ZONE 'Asia/Shanghai'))
             ON CONFLICT (username) DO NOTHING`,
            [username, JSON.stringify(board), JSON.stringify(flipped)]
        );
        result = await executor(
            `SELECT board, flipped, good_count, bad_count, ended FROM flip_states WHERE username = $1${lockClause}`,
            [username]
        );
    }

    const row = result.rows[0];
    let boardValue = row.board;
    if (typeof boardValue === 'string') {
        try {
            boardValue = JSON.parse(boardValue);
        } catch (err) {
            boardValue = null;
        }
    }
    let board = Array.isArray(boardValue) ? boardValue : createFlipBoard();
    if (!Array.isArray(board) || board.length === 0) {
        board = createFlipBoard();
    }
    if (board.length < 9) {
        board = board.concat(Array(9 - board.length).fill(null));
    } else if (board.length > 9) {
        board = board.slice(0, 9);
    }

    let flippedValue = row.flipped;
    if (typeof flippedValue === 'string') {
        try {
            flippedValue = JSON.parse(flippedValue);
        } catch (err) {
            flippedValue = null;
        }
    }
    const flipped = Array.isArray(flippedValue) ? flippedValue : [];
    const normalizedFlipped = Array(board.length).fill(false);
    for (let i = 0; i < Math.min(board.length, flipped.length); i += 1) {
        normalizedFlipped[i] = !!flipped[i];
    }

    const computedGood = board.reduce((sum, card, idx) => sum + (normalizedFlipped[idx] && card === 'good' ? 1 : 0), 0);
    const computedBad = board.reduce((sum, card, idx) => sum + (normalizedFlipped[idx] && card === 'bad' ? 1 : 0), 0);
    const ended = !!row.ended || computedBad > 0 || computedGood >= 7;

    return {
        board,
        flipped: normalizedFlipped,
        good_count: computedGood,
        bad_count: computedBad,
        ended
    };
}

async function saveFlipState(username, state, client = pool) {
    const executor = client.query ? client.query.bind(client) : client;
    await executor(
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
}, client = pool) {
    const executor = client.query ? client.query.bind(client) : client;
    await executor(
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

async function getStoneState(username, client = pool, { forUpdate = false } = {}) {
    const executor = client.query ? client.query.bind(client) : client;
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    let result = await executor(
        `SELECT slots FROM stone_states WHERE username = $1${lockClause}`,
        [username]
    );

    if (result.rows.length === 0) {
        const slots = normalizeStoneSlots([]);
        await executor(
            `INSERT INTO stone_states (username, slots, created_at, updated_at)
             VALUES ($1, $2, (NOW() AT TIME ZONE 'Asia/Shanghai'), (NOW() AT TIME ZONE 'Asia/Shanghai'))
             ON CONFLICT (username) DO NOTHING`,
            [username, JSON.stringify(slots)]
        );
        result = await executor(
            `SELECT slots FROM stone_states WHERE username = $1${lockClause}`,
            [username]
        );
    }

    return normalizeStoneSlots(result.rows[0].slots);
}

async function saveStoneState(username, slots, client = pool) {
    const executor = client.query ? client.query.bind(client) : client;
    await executor(
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
}, client = pool) {
    const executor = client.query ? client.query.bind(client) : client;
    await executor(
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
}

// ====================
// 祈愿背包 API
// ====================

async function enqueueWishInventorySend({ inventoryId, username, isAuto = false, idempotencyRequest = null }) {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1 || ':gift_exchange'))",
            [username]
        );

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
                        expires_at = 'infinity'::timestamptz,
                        updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                    WHERE id = $1
                `, [inventoryId]);
                await client.query('COMMIT');
                return { success: false, message: '未绑定房间号，暂不送出' };
            }

            await client.query('ROLLBACK');
            return { success: false, message: '请先绑定B站房间号再送出礼物' };
        }

        const activeDelivery = await client.query(`
            SELECT id
            FROM gift_exchanges
            WHERE username = $1
              AND status = 'funds_locked'
              AND delivery_status IN ('pending', 'processing', 'uncertain')
            LIMIT 1
        `, [username]);
        if (activeDelivery.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, message: '已有礼物正在发送或等待结果确认' };
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

        const result = { success: true, exchangeId: exchangeResult.rows[0].id };
        const responseBody = { success: true, message: '礼物已加入发送队列', exchangeId: result.exchangeId };
        await idempotencyRequest?.finalizeIdempotency?.(client, 200, responseBody);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('背包礼物入队失败:', error);
        return { success: false, message: '送出失败，请稍后重试' };
    } finally {
        client?.release();
    }
}

let isWishAutoSendRunning = false;
async function autoSendExpiredWishRewards() {
    if (isWishAutoSendRunning) {
        return;
    }
    isWishAutoSendRunning = true;
    let lockClient = null;
    let lockAcquired = false;

    try {
        lockClient = await pool.connect();
        const lockResult = await lockClient.query("SELECT pg_try_advisory_lock(hashtext('wish_auto_send')) AS locked");
        lockAcquired = lockResult.rows[0].locked === true;
        if (!lockAcquired) return;

        const expiredItems = await lockClient.query(`
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
                await lockClient.query(`
                    UPDATE wish_inventory
                    SET expires_at = 'infinity'::timestamptz,
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
        if (lockClient) {
            if (lockAcquired) {
                try {
                    await lockClient.query("SELECT pg_advisory_unlock(hashtext('wish_auto_send'))");
                } catch (e) {
                    console.error('释放 wish_auto_send 锁失败:', e);
                }
            }
            lockClient.release();
        }
        isWishAutoSendRunning = false;
    }
}

async function autoSendWishInventoryOnBind(username) {
    try {
        await pool.query(`
            UPDATE wish_inventory
            SET expires_at = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
            WHERE username = $1
              AND status = 'stored'
              AND (expires_at IS NULL OR expires_at = 'infinity'::timestamptz)
        `, [username]);
    } catch (error) {
        console.error('绑定房间号后自动送出失败:', error);
    }
}

const wishAutoSendInterval = setInterval(autoSendExpiredWishRewards, 60 * 1000);
wishAutoSendInterval.unref?.();

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        games: ['quiz', 'slot', 'scratch', 'dictation', 'spin', 'wish', 'blindbox', 'stone', 'flip', 'duel'],
        questions: questions.length
    });
});

// 🛡️ 安全修复：API密钥验证中间件 - 只允许header传key，禁止query参数
async function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key']; // 仅从header获取，不再支持query参数
    const validApiKey = process.env.WINDOWS_API_KEY || 'INVALID_DEFAULT_KEY';
    const ipWhitelist = process.env.GIFT_TASKS_IP_WHITELIST || '';
    const hmacSecret = process.env.GIFT_TASKS_HMAC_SECRET || '';
    const MAX_NONCE_CACHE_SIZE = 10000;
    const clientIp = req.clientIP || getClientIp(req);
    
    // 生产环境不允许默认密钥
    if (process.env.NODE_ENV === 'production' && validApiKey === 'INVALID_DEFAULT_KEY') {
        console.error('🚨 生产环境错误: WINDOWS_API_KEY 环境变量未设置');
        return res.status(500).json({ 
            success: false, 
            message: '服务配置错误' 
        });
    }
    
    const apiKeyBuffer = Buffer.from(String(apiKey || ''), 'utf8');
    const validApiKeyBuffer = Buffer.from(String(validApiKey || ''), 'utf8');
    if (!apiKey || !validApiKey || apiKeyBuffer.length !== validApiKeyBuffer.length
        || !crypto.timingSafeEqual(apiKeyBuffer, validApiKeyBuffer)) {
        return res.status(401).json({ 
            success: false, 
            message: '无效的API密钥' 
        });
    }

    if (!hmacSecret) {
        return res.status(500).json({
            success: false,
            message: '服务配置错误'
        });
    }

    if (ipWhitelist) {
        const whitelist = ipWhitelist.split(',').map((ip) => ip.trim()).filter(Boolean);
        if (!whitelist.includes(clientIp)) {
            return res.status(403).json({
                success: false,
                message: 'IP未授权'
            });
        }
    }

    const timestampHeader = req.headers['x-timestamp'];
    const signatureHeader = req.headers['x-signature'];
    const nonceHeader = req.headers['x-nonce'];

    if (!timestampHeader || !signatureHeader || !nonceHeader) {
        return res.status(401).json({
            success: false,
            message: '缺少签名头'
        });
    }

    const timestampRaw = Number(timestampHeader);
    if (!Number.isFinite(timestampRaw)) {
        return res.status(401).json({
            success: false,
            message: '无效时间戳'
        });
    }

    const now = Date.now();
    const timestampMs = timestampRaw < 1e12 ? timestampRaw * 1000 : timestampRaw;
    if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
        return res.status(401).json({
            success: false,
            message: '签名过期'
        });
    }

    if (typeof nonceHeader !== 'string' || nonceHeader.length < 8 || nonceHeader.length > 200
        || !/^[A-Za-z0-9._:-]+$/.test(nonceHeader)) {
        return res.status(401).json({
            success: false,
            message: '无效随机串'
        });
    }

    if (!requireApiKey.nonceCache) {
        requireApiKey.nonceCache = new Map();
    }

    const nonceCache = requireApiKey.nonceCache;
    if (!requireApiKey.lastMemoryNonceCleanupAt
        || now - requireApiKey.lastMemoryNonceCleanupAt > 60 * 1000) {
        requireApiKey.lastMemoryNonceCleanupAt = now;
        for (const [key, time] of nonceCache.entries()) {
            if (now - time > 10 * 60 * 1000) {
                nonceCache.delete(key);
            }
        }
    }
    if (nonceCache.size >= MAX_NONCE_CACHE_SIZE) {
        return res.status(429).json({
            success: false,
            message: '请求过于频繁'
        });
    }
    if (nonceCache.has(nonceHeader)) {
        return res.status(401).json({
            success: false,
            message: '重复请求'
        });
    }

    const canonicalBody = stableStringifyBody(req.body);
    const payload = `${timestampHeader}.${req.method}.${req.path}.${canonicalBody}`;
    const expectedSignature = crypto
        .createHmac('sha256', hmacSecret)
        .update(payload)
        .digest('hex');

    const signatureBuffer = Buffer.from(String(signatureHeader), 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return res.status(401).json({
            success: false,
            message: '签名不匹配'
        });
    }

    try {
        const nonceResult = await pool.query(`
            INSERT INTO api_request_nonces (
                nonce, request_method, request_path, request_timestamp, created_at
            ) VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), NOW())
            ON CONFLICT (nonce) DO NOTHING
            RETURNING nonce
        `, [nonceHeader, req.method, req.path, timestampMs]);
        if (nonceResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: '重复请求' });
        }
        nonceCache.set(nonceHeader, timestampMs);
        req.requestNonce = nonceHeader;
        setRequestId(nonceHeader);
        if (!requireApiKey.lastNonceCleanupAt || now - requireApiKey.lastNonceCleanupAt > 60 * 60 * 1000) {
            requireApiKey.lastNonceCleanupAt = now;
            pool.query("DELETE FROM api_request_nonces WHERE created_at < NOW() - INTERVAL '1 day'")
                .catch((error) => console.error('API nonce cleanup failed:', error));
        }
        return next();
    } catch (error) {
        console.error('API nonce persistence failed:', error);
        return res.status(503).json({ success: false, message: '请求验证服务暂不可用' });
    }
}

function stableStringifyBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) && body.length === 0) {
        return '';
    }
    const keys = Object.keys(body);
    if (keys.length === 0) {
        return '';
    }
    return stableStringify(body);
}

function stableStringify(value) {
    if (value === undefined || typeof value === 'function') {
        return 'null';
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

// ====================
// 路由注册
// ====================

const idempotentWritePaths = [
    '/api/change-password',
    '/api/quiz/start',
    '/api/quiz/next',
    '/api/quiz/submit',
    '/api/dictation/start',
    '/api/dictation/retry',
    '/api/dictation/submit',
    '/api/slot/play',
    '/api/scratch/play',
    '/api/stone/add',
    '/api/stone/fill',
    '/api/stone/replace',
    '/api/stone/redeem',
    '/api/flip/start',
    '/api/flip/flip',
    '/api/flip/cashout',
    '/api/blindbox/open',
    '/api/duel/play',
    '/api/spin',
    '/api/wish/play',
    '/api/wish-batch',
    '/api/wish/backpack/send',
    '/api/gifts/exchange',
    '/api/pk/start',
    '/api/pk/stop',
    '/api/admin/add-electric-coin',
    '/api/admin/authorize-user',
    '/api/admin/unauthorize-user',
    '/api/admin/reset-password',
    '/api/admin/update-balance',
    '/api/admin/dictation/mark',
    '/api/admin/delete-account',
    '/api/admin/unlock-account',
    '/api/admin/clear-failures',
    '/api/admin/change-self-password',
    '/api/bilibili/room',
    '/api/bilibili/cookies/refresh'
];
async function validateExistingIdempotentRequest(req) {
    const providedToken = req.body?.csrfToken || req.headers['x-csrf-token'];
    if (!verifyCSRFToken(req, providedToken)) {
        return { status: 403, message: 'CSRF token验证失败' };
    }

    const username = req.session?.user?.username;
    const sessionResult = await pool.query(`
        SELECT u.authorized, u.is_admin, a.is_active
        FROM users u
        LEFT JOIN active_sessions a
          ON a.username = u.username AND a.session_id = $2
        WHERE u.username = $1
    `, [username, req.sessionID]);
    const current = sessionResult.rows[0];
    if (!current || current.is_active !== true) {
        return { status: 401, message: '登录会话已失效' };
    }
    if (current.authorized !== true) {
        return { status: 403, message: '未授权访问' };
    }
    const requiresAdmin = req.path.startsWith('/api/admin/')
        || req.path.startsWith('/api/bilibili/');
    if (requiresAdmin && current.is_admin !== true) {
        return { status: 403, message: '无权访问管理员后台' };
    }
    return null;
}

app.use(createIdempotencyMiddleware({
    pool,
    paths: idempotentWritePaths,
    validateExistingRequest: validateExistingIdempotentRequest
}));

registerAnalyticsRoutes(app, {
    pool,
    rateLimit,
    requireLogin,
    requireAdmin,
    security
});

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
    disconnectUserSockets,
    path
});

registerGiftRoutes(app, {
    pool,
    giftConfig,
    BalanceLogger,
    requireLogin,
    requireAuthorized,
    requireApiKey,
    security,
    generateCSRFToken,
    enqueueWishInventorySend
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
    calculateDuelCost,
    enqueueWishInventorySend
});

// 404 处理（必须在所有API路由之后）
app.use('*', (req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: '接口不存在' });
    }
    res.redirect('/');
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (res.headersSent) return next(err);
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(500).json({ success: false, message: '服务器错误' });
    }
    return res.status(500).send('服务器错误');
});

let databaseMaintenanceInterval = null;

async function startServer() {
    const databaseReady = await initializeDatabase();
    if (!databaseReady) {
        throw new Error('数据库初始化失败，拒绝启动服务');
    }
    await runDatabaseMaintenance();
    databaseMaintenanceInterval = setInterval(runDatabaseMaintenance, 6 * 60 * 60 * 1000);
    databaseMaintenanceInterval.unref?.();
    server.listen(PORT, () => {
        console.log(`🎮 游戏服务器运行在端口 ${PORT}`);
        console.log(`📚 题库包含 ${questions.length} 道题目`);
        console.log(`🌐 访问 http://localhost:${PORT} 开始游戏`);
        console.log(`🚀 WebSocket飘屏系统已启动`);
        console.log(`🎁 B站送礼功能已启用`);
    });
}

startServer().catch((error) => {
    console.error('服务启动失败:', error);
    process.exitCode = 1;
    pool.end().catch(() => {});
});

let shutdownStarted = false;
async function shutdown(signal) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.log(`收到${signal}信号，正在关闭服务...`);
    if (databaseMaintenanceInterval) clearInterval(databaseMaintenanceInterval);

    try {
        io.close();
        await new Promise((resolve) => {
            if (!server.listening) return resolve();
            const timeout = setTimeout(resolve, 10000);
            timeout.unref?.();
            server.close(() => {
                clearTimeout(timeout);
                resolve();
            });
        });
        await pool.end();
        console.log('服务器已安全关闭');
        process.exit(0);
    } catch (error) {
        console.error('关闭服务器时发生错误:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
