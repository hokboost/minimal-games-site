require('dotenv').config();
require('./lib/safe-logger').installSafeConsole();
require('./lib/config-validation').validateServerEnvironment();

const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const csrf = require('csrf');

// 数据库连接
const pool = require('./db');
const pgSession = require('connect-pg-simple')(session);
const {
    applyDatabaseMigrations,
    assertDatabaseSchemaCurrent
} = require('./lib/database-migrations');

// 导入本地游戏数据和逻辑
const questions = require('./data/questions');
const GameLogic = require('./data/gameLogic');
const BalanceLogger = require('./balance-logger');
const { QuestService } = require('./domain/quests/service');
const { parseMoney } = require('./lib/integer-money');
const gameRegistry = require('./domain/games');
const { parseWorkerCredentials } = require('./lib/worker-credentials');
const { getLifetimeEarnings } = require('./lib/earnings');

// 礼物配置
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const developmentSessionSecret = crypto.randomBytes(32).toString('hex');
const sessionSecret = process.env.SESSION_SECRET || developmentSessionSecret;
const purposeSecret = (name) => Buffer.from(
    process.env[name] || crypto.randomBytes(32).toString('hex'),
    'utf8'
);
const idempotencyHashSecret = purposeSecret('IDEMPOTENCY_HMAC_SECRET');
const resetTokenSecret = purposeSecret('RESET_TOKEN_SECRET');
const analyticsTokenSecret = purposeSecret('ANALYTICS_TOKEN_SECRET');
const dictationTokenSecret = purposeSecret('DICTATION_TOKEN_SECRET');
const dummyPasswordHash = bcrypt.hashSync('invalid-login-password-A1', 12);
const { parseCookies, decodeSignedSessionCookie } = require('./lib/session-auth');
const { createIdempotencyMiddleware } = require('./lib/idempotency');
const { createAdminFailureAuditMiddleware } = require('./lib/admin-audit-failure');
const { IDEMPOTENT_WRITE_PATHS } = require('./routes/manifest');
const { getClientIp, isTrustedProxyAddress } = require('./lib/client-ip');
const { requestContextMiddleware, setRequestId } = require('./lib/request-context');
const PostgresRateLimitStore = require('./lib/postgres-rate-limit-store');
const { createConcurrencyGuard } = require('./lib/concurrency-guard');
const { PostgresEventBus } = require('./lib/postgres-event-bus');
const { ApplicationLifecycle } = require('./app/application-lifecycle');
const { queueMissingPkRunners } = require('./lib/pk-runner-recovery');
const { hasActiveWorkerRoleLease } = require('./lib/worker-role-lease');
const {
    SIGNATURE_VERSION,
    signRequest,
    signaturesMatch
} = require('./lib/request-signature');

let giftConfig;
try {
    const giftConfigData = fs.readFileSync(path.join(__dirname, 'gift-codes.json'), 'utf8');
    giftConfig = JSON.parse(giftConfigData);
    const requiredGiftTypes = ['heartbox', 'fanlight', 'tiedu_one'];
    if (!giftConfig || typeof giftConfig !== 'object' || !giftConfig.礼物映射) {
        throw new Error('Gift mapping is missing');
    }
    for (const giftType of requiredGiftTypes) {
        const gift = giftConfig.礼物映射[giftType];
        if (!gift || typeof gift.名称 !== 'string' || !/^\d+$/.test(String(gift.bilibili_id || ''))
            || !Number.isSafeInteger(gift.电币成本) || gift.电币成本 < 0) {
            throw new Error(`Required gift configuration is invalid: ${giftType}`);
        }
    }
    gameRegistry.validateGiftBackedConfiguration(giftConfig);
} catch (error) {
    throw new Error('礼物配置缺失或无效，拒绝启动服务', { cause: error });
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
const registerDoudizhuRoutes = require('./routes/doudizhu');
const registerAdventureRoutes = require('./routes/adventure');
const registerTaskRoutes = require('./routes/tasks');
const registerAnalyticsRoutes = require('./routes/analytics');
const questService = new QuestService({ BalanceLogger });

// 导入i18n国际化
const { i18nMiddleware, setupLanguageRoutes } = require('./i18n');

// CSRF 保护
const tokens = new csrf();

const paidActionConcurrencyGuard = createConcurrencyGuard({
    pool,
    maxInFlight: process.env.PAID_ACTION_MAX_IN_FLIGHT,
    maxPerUser: process.env.PAID_ACTION_MAX_PER_USER,
    maxPoolWaiters: process.env.PAID_ACTION_MAX_POOL_WAITERS,
    maxEventLoopLagMs: process.env.PAID_ACTION_MAX_EVENT_LOOP_LAG_MS
});
const applicationLifecycle = new ApplicationLifecycle({
    onJobError(error, { name, runNumber }) {
        console.error('后台任务执行失败', { job: name, runNumber, error });
    }
});

const app = express();
app.locals.gameCatalog = gameRegistry.GAME_DEFINITIONS;
app.locals.gameCatalogGroups = gameRegistry.GAME_GROUPS;
app.locals.gameRecordViews = gameRegistry.presentation.RECORD_VIEWS;
app.locals.gamePublicWishConfigs = gameRegistry.getPublicWishConfigs();
const server = http.createServer(app);

// WebSocket session认证中间件
const sessionStore = new pgSession({
    pool: pool,
    tableName: 'user_sessions',
    pruneSessionInterval: 60,
    errorLog: console.error
});

const configuredWebOrigins = new Set(
    String(process.env.PUBLIC_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
);
configuredWebOrigins.add('https://www.wuguijiang.com');
configuredWebOrigins.add('https://wuguijiang.com');

function isAllowedWebOrigin(origin) {
    try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin || parsed.username || parsed.password) return false;
        if (process.env.NODE_ENV !== 'production') {
            return parsed.protocol === 'http:'
                && ['localhost', '127.0.0.1'].includes(parsed.hostname)
                && parsed.port === String(PORT || 3000);
        }
        return parsed.protocol === 'https:' && configuredWebOrigins.has(parsed.origin);
    } catch (error) {
        return false;
    }
}

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) {
                return callback(process.env.NODE_ENV === 'production' ? new Error('Origin required') : null, process.env.NODE_ENV !== 'production');
            }
            return callback(isAllowedWebOrigin(origin) ? null : new Error('Not allowed by CORS'), isAllowedWebOrigin(origin));
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

        const currentUser = await pool.query(`
            SELECT account.id, account.username, account.authorized, account.is_admin, account.deactivated
            FROM users AS account
            JOIN active_sessions AS active ON active.username = account.username
            WHERE account.username = $1
              AND active.session_id = $2
              AND active.is_active = true
              AND account.deactivated = false
        `,
            [sessionData.user.username, sessionId]
        );
        const user = currentUser.rows[0];
        if (!user?.authorized) {
            return next(new Error('Session is no longer authorized'));
        }

        // 将验证过的用户信息附加到socket
        socket.authenticatedUser = {
            username: user.username,
            userId: user.id,
            isAdmin: user.is_admin === true,
            sessionId
        };

        next();
    } catch (error) {
        console.error('WebSocket认证失败:', error);
        next(new Error('Authentication failed'));
    }
});

io.on('connection', (socket) => {
    const username = socket.authenticatedUser.username;
    // 🛡️ 安全修复：直接使用已验证的用户名，不再信任客户端
    if (!userSockets.has(username)) {
        userSockets.set(username, new Set());
    }
    userSockets.get(username).add(socket.id);
    socket.username = username;
    socket.emit('recent_messages', danmaku.getRecentMessages(10));

    // 处理断开连接
    socket.on('disconnect', () => {
        if (socket.username && userSockets.has(socket.username)) {
            userSockets.get(socket.username).delete(socket.id);
            if (userSockets.get(socket.username).size === 0) {
                userSockets.delete(socket.username);
            }
        }
    });
});

function emitUserNotificationLocal(username, notification) {
    if (userSockets.has(username)) {
        const socketIds = userSockets.get(username);
        for (const socketId of socketIds) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('notification', notification);
            }
        }
    }
}

function emitSecurityEventLocal(username, event, excludeSessionId = null) {
    if (userSockets.has(username)) {
        const socketIds = userSockets.get(username);
        for (const socketId of socketIds) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                if (excludeSessionId && socket.authenticatedUser?.sessionId === excludeSessionId) {
                    continue;
                }
                socket.emit('security-alert', event);
            }
        }
    }
}

function disconnectUserSocketsLocal(username, sessionIds = null) {
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

function validSocketUsername(value) {
    return typeof value === 'string' && value.length >= 1 && value.length <= 50;
}

function handleSocketBusEvent(type, payload) {
    const username = payload?.username;
    if (type === 'danmaku') {
        danmaku.acceptRemoteMessage(payload?.message);
        return;
    }
    if (!validSocketUsername(username)) return;
    if (type === 'user_notification') {
        emitUserNotificationLocal(username, payload.notification);
    } else if (type === 'security_event') {
        emitSecurityEventLocal(username, payload.event, payload.excludeSessionId || null);
    } else if (type === 'disconnect_user') {
        const sessionIds = Array.isArray(payload.sessionIds)
            ? payload.sessionIds.filter((id) => typeof id === 'string' && id.length <= 200)
            : null;
        disconnectUserSocketsLocal(username, sessionIds);
    }
}

const socketEventBus = new PostgresEventBus(pool, handleSocketBusEvent);

function publishSocketEvent(type, payload) {
    try {
        return Promise.resolve(socketEventBus.publish(type, payload)).catch(() => {
            console.error('WebSocket跨实例事件发布失败');
            return false;
        });
    } catch {
        console.error('WebSocket跨实例事件发布失败');
        return Promise.resolve(false);
    }
}

// 发送用户通知的辅助函数
function notifyUser(username, notification) {
    try {
        emitUserNotificationLocal(username, notification);
    } catch {
        console.error('本实例用户通知发送失败');
    }
    return publishSocketEvent('user_notification', { username, notification });
}

// 发送安全警告的辅助函数
function notifySecurityEvent(username, event, excludeSessionId = null) {
    try {
        emitSecurityEventLocal(username, event, excludeSessionId);
    } catch {
        console.error('本实例安全通知发送失败');
    }
    return publishSocketEvent('security_event', { username, event, excludeSessionId });
}

function disconnectUserSockets(username, sessionIds = null) {
    try {
        disconnectUserSocketsLocal(username, sessionIds);
    } catch {
        console.error('本实例会话断开失败');
    }
    return publishSocketEvent('disconnect_user', { username, sessionIds });
}

let socketSessionValidationRunning = false;
async function revalidateConnectedSockets() {
    if (socketSessionValidationRunning || io.sockets.sockets.size === 0) return;
    socketSessionValidationRunning = true;
    try {
        const connected = [...io.sockets.sockets.values()]
            .map((socket) => ({
                socket,
                sessionId: socket.authenticatedUser?.sessionId,
                username: socket.authenticatedUser?.username
            }))
            .filter((entry) => entry.sessionId && entry.username);
        if (connected.length === 0) return;
        const sessionIds = [...new Set(connected.map((entry) => entry.sessionId))];
        const activeResult = await pool.query(`
            SELECT active.session_id, active.username
            FROM active_sessions AS active
            JOIN users AS account ON account.username = active.username
            JOIN user_sessions AS stored ON stored.sid = active.session_id
            WHERE active.session_id = ANY($1::text[])
              AND active.is_active = TRUE
              AND account.authorized = TRUE
              AND account.deactivated = FALSE
              AND stored.expire > NOW()
        `, [sessionIds]);
        const valid = new Set(activeResult.rows.map(
            (row) => `${row.session_id}\u0000${row.username}`
        ));
        for (const entry of connected) {
            if (!valid.has(`${entry.sessionId}\u0000${entry.username}`)) {
                entry.socket.disconnect(true);
            }
        }
    } catch (error) {
        console.error('WebSocket会话复核失败');
    } finally {
        socketSessionValidationRunning = false;
    }
}

const PORT = process.env.PORT || 3000;

// 数据库初始化函数
async function initializeDatabase() {
    try {
        console.log("Checking database schema");
        if (process.env.NODE_ENV === 'production') {
            await assertDatabaseSchemaCurrent(pool);
        } else {
            await applyDatabaseMigrations(pool, {
                onMigration: (filename) => console.log("Applying database migration", { filename })
            });
        }
        return true;
    } catch (error) {
        console.error("Database initialization failed", { error });
        return false;
    }
}

let idempotencyRecoveryRunning = false;
async function recoverStaleIdempotencyKeys() {
    if (idempotencyRecoveryRunning) return;
    idempotencyRecoveryRunning = true;
    try {
        await pool.query(`
            UPDATE idempotency_keys
            SET status = 'indeterminate',
                response_status = 409,
                response_body = '{"success":false,"message":"请求处理结果无法自动确认，请联系管理员核对账务"}'::jsonb,
                failure_reason = '幂等处理租约超时，业务结果需要核对',
                updated_at = NOW()
            WHERE status = 'pending'
              AND updated_at < NOW() - INTERVAL '10 minutes'
        `);
    } catch (error) {
        console.error('幂等恢复任务失败:', error);
    } finally {
        idempotencyRecoveryRunning = false;
    }
}

async function runDatabaseMaintenance() {
    let client;
    let locked = false;
    try {
        client = await pool.connect();
        const lockResult = await client.query(
            "SELECT pg_try_advisory_lock(hashtextextended('minimal_games_maintenance', 0)) AS locked"
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
        const stalePkReservations = await client.query(`
            SELECT authorization_id, username
            FROM pk_spend_authorizations
            WHERE status = 'reserved'
              AND created_at < NOW() - INTERVAL '30 minutes'
            ORDER BY created_at
            LIMIT 100
        `);
        for (const row of stalePkReservations.rows) {
            await client.query('BEGIN');
            try {
                await client.query(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                    [`pk:${row.username}`]
                );
                const reservationResult = await client.query(`
                    SELECT authorization_id, username, ticket_count
                    FROM pk_spend_authorizations
                    WHERE authorization_id = $1
                      AND status = 'reserved'
                      AND created_at < NOW() - INTERVAL '30 minutes'
                    FOR UPDATE
                `, [row.authorization_id]);
                const reservation = reservationResult.rows[0];
                if (!reservation) {
                    await client.query('ROLLBACK');
                    continue;
                }
                const refundAmount = parseMoney(
                    reservation.ticket_count,
                    'stale PK reservation amount',
                    { min: 1, max: 100000000 }
                );
                const refund = await BalanceLogger.updateBalance({
                    username: reservation.username,
                    amount: refundAmount,
                    operationType: 'pk_pre_send_timeout_release',
                    description: `PK发送开始前预授权超时，释放 ${refundAmount} 积分`,
                    gameData: { authorizationId: reservation.authorization_id },
                    requestId: `${reservation.authorization_id}:pre-send-timeout`,
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });
                if (!refund.success) throw new Error('Stale PK reservation refund failed');
                const released = await client.query(`
                    UPDATE pk_spend_authorizations
                    SET status = 'released',
                        outcome_reason = '发送开始前预授权超时，未发生外部副作用',
                        settled_at = NOW(), updated_at = NOW()
                    WHERE authorization_id = $1 AND status = 'reserved'
                    RETURNING authorization_id
                `, [reservation.authorization_id]);
                if (released.rowCount !== 1) {
                    throw new Error('Stale PK reservation state changed concurrently');
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            }
        }
        await client.query(`
            UPDATE pk_spend_authorizations
            SET status = 'uncertain',
                outcome_reason = COALESCE(outcome_reason, '发送已经开始但结算回报超时，需要对账'),
                settled_at = NOW(), updated_at = NOW()
            WHERE status = 'sending'
              AND started_at < NOW() - INTERVAL '30 minutes'
        `);
        await client.query(`
            UPDATE pk_runner_state
            SET running = FALSE, pid = NULL, updated_at = NOW()
            WHERE running = TRUE AND lease_expires_at < NOW()
        `);
        await queueMissingPkRunners(client);
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
            DELETE FROM rate_limit_counters
            WHERE (namespace, key_hash) IN (
                SELECT namespace, key_hash
                FROM rate_limit_counters
                WHERE reset_time < NOW() - INTERVAL '1 day'
                ORDER BY reset_time
                LIMIT 5000
            )
        `);
        await client.query(`
            WITH archived AS (
                DELETE FROM delivery_outbox
                WHERE id IN (
                    SELECT id FROM delivery_outbox
                    WHERE status IN ('completed', 'dead_letter')
                      AND COALESCE(completed_at, created_at) < NOW() - INTERVAL '30 days'
                    ORDER BY id
                    LIMIT 1000
                )
                RETURNING id, event_type, aggregate_id, payload, status,
                          attempt_count, last_error, created_at, completed_at
            )
            INSERT INTO delivery_outbox_archive (
                id, event_type, aggregate_id, payload, status,
                attempt_count, last_error, created_at, completed_at
            )
            SELECT id, event_type, aggregate_id, payload, status,
                   attempt_count, last_error, created_at, completed_at
            FROM archived
            ON CONFLICT (id) DO NOTHING
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
                WHERE last_seen_at < NOW() - INTERVAL '180 days'
                ORDER BY last_seen_at
                LIMIT 1000
            )
        `);
        await client.query(`
            DELETE FROM worker_heartbeats AS heartbeat
            WHERE heartbeat.last_seen_at < NOW() - INTERVAL '30 days'
              AND NOT EXISTS (
                  SELECT 1
                  FROM worker_role_leases AS lease
                  WHERE lease.worker_id = heartbeat.worker_id
                    AND lease.lease_expires_at > NOW()
              )
        `);
    } catch (error) {
        console.error('数据库维护失败:', error);
    } finally {
        if (client) {
            if (locked) {
                await client.query(
                    "SELECT pg_advisory_unlock(hashtextextended('minimal_games_maintenance', 0))"
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
app.set('trust proxy', (address) => isTrustedProxyAddress(address));

app.use((req, res, next) => {
    const nonce = crypto.randomBytes(18).toString('base64');
    res.locals.cspNonce = nonce;
    const productionDirectives = process.env.NODE_ENV === 'production'
        ? 'upgrade-insecure-requests;'
        : '';
    res.setHeader('Content-Security-Policy', `
        default-src 'self';
        script-src 'self';
        script-src-elem 'self';
        script-src-attr 'none';
        style-src 'self';
        style-src-elem 'self' 'nonce-${nonce}';
        style-src-attr 'none';
        font-src 'self';
        img-src 'self' data:;
        media-src 'self';
        connect-src 'self';
        object-src 'none';
        base-uri 'self';
        form-action 'self';
        frame-src 'none';
        frame-ancestors 'none';
        manifest-src 'self';
        worker-src 'self';
        ${productionDirectives}
    `.replace(/\s+/g, ' ').trim());
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
app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    setRequestId(req.requestId);
    res.set('X-Request-ID', req.requestId);
    next();
});
app.use((req, res, next) => {
    if (req.path.startsWith('/dictation/') || req.path.startsWith('/uploads/dictation/')) {
        return res.status(404).send('Not found');
    }
    return next();
});
app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));
app.use('/api/ux/batch', express.text({ type: 'text/plain', limit: '32kb' }));
app.use(express.json({ limit: '2mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 100 }));
app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
});
app.use('/api/ux/batch', (error, req, res, next) => {
    // Browsers may terminate an ordinary heartbeat while preserving the
    // pagehide beacon. Telemetry is best-effort, so aborted bodies are ignored.
    if (error?.type === 'request.aborted' || error?.type === 'stream.not.readable') {
        return res.status(204).end();
    }
    return next(error);
});

// 国际化中间件
app.use(i18nMiddleware);

// 语言切换路由
setupLanguageRoutes(app);

// IP风控中间件
app.use((req, res, next) => {
    const clientIP = getClientIp(req);
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    // 记录所有请求的IP活动
    if (req.session && req.session.user) {
        IPManager.recordIPActivity(clientIP, req.session.user.username, userAgent, 'request')
            .catch((error) => console.error('IP活动记录失败:', error));
    }
    
    // 将IP信息添加到请求对象
    req.clientIP = clientIP;
    req.userAgent = userAgent;
    
    next();
});

app.use(createAdminFailureAuditMiddleware(pool));
app.use(security.checkBlacklist);
app.use(security.deviceFingerprint);
app.use(security.behaviorAnalysis);
app.use(security.dynamicRateLimit);

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
    const providedToken = req.body?.csrfToken || req.body?._csrf || req.headers['x-csrf-token'];
    if (!verifyCSRFToken(req, providedToken)) {
        return res.status(403).json({ success: false, message: 'CSRF token验证失败' });
    }
    next();
};

// 认证中间件
const requireLogin = async (req, res, next) => {
    if (req.sessionValidated === true) return next();
    if (!req.session.user) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ success: false, message: '请先登录' });
        }
        return res.redirect('/login');
    }

    try {
        const username = req.session.user.username;
        const sessionCreatedAt = Number(req.session.createdAt || 0);
        const absoluteLifetimeMs = req.session.user.is_admin
            ? 8 * 60 * 60 * 1000
            : 24 * 60 * 60 * 1000;
        if (!Number.isFinite(sessionCreatedAt)
            || sessionCreatedAt <= 0
            || Date.now() - sessionCreatedAt > absoluteLifetimeMs) {
            await SessionManager.terminateSession(req.sessionID, 'absolute_lifetime_expired');
            return req.session.destroy(() => {
                res.clearCookie('minimal_games_sid');
                if (req.path.startsWith('/api/')) {
                    return res.status(401).json({ success: false, message: '登录会话已过期' });
                }
                return res.redirect('/login?expired=true');
            });
        }
        const result = await pool.query(`
            UPDATE active_sessions AS active
            SET last_activity = CASE
                    WHEN active.last_activity < NOW() - INTERVAL '1 minute' THEN NOW()
                    ELSE active.last_activity
                END
            FROM users AS account
            WHERE active.username = account.username
              AND active.username = $1
              AND active.session_id = $2
              AND active.is_active = true
              AND account.deactivated = false
            RETURNING account.id, account.username, account.authorized, account.is_admin,
                      account.account_locked,
                      account.deactivated, active.is_active, active.termination_reason
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
            is_admin: current.is_admin === true,
            account_locked: current.account_locked === true
        };
        req.sessionValidated = true;
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

const accountLockGate = async (req, res, next) => {
    if (!req.session?.user?.username) return next();
    if (req.method === 'POST' && req.path === '/logout') return next();
    try {
        const result = await pool.query(
            'SELECT account_locked FROM users WHERE username = $1 AND deactivated = FALSE',
            [req.session.user.username]
        );
        if (result.rowCount !== 1) return next();
        const locked = result.rows[0].account_locked === true;
        req.session.user.account_locked = locked;
        if (!locked) return next();
        const allowed = req.method === 'GET' && req.path === '/account-locked';
        if (allowed) return next();
        if (req.path.startsWith('/api/')) {
            return res.status(423).json({
                success: false,
                code: 'ACCOUNT_LOCKED',
                message: '账户已被锁定，请联系管理员'
            });
        }
        return res.redirect('/account-locked');
    } catch (error) {
        console.error('账户锁定状态检查失败:', error);
        return res.status(503).send(uiText(res, '账户状态检查暂不可用', 'Account status check is temporarily unavailable'));
    }
};

app.use(accountLockGate);

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

const idempotentWritePaths = IDEMPOTENT_WRITE_PATHS;

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
        || req.path.startsWith('/api/bilibili/')
        || req.path.startsWith('/admin/security/');
    if (requiresAdmin && current.is_admin !== true) {
        return { status: 403, message: '无权访问管理员后台' };
    }
    return null;
}

async function validateTransactionalIdempotentRequest(req, client) {
    const requiresAdmin = req.path.startsWith('/api/admin/')
        || req.path.startsWith('/api/bilibili/')
        || req.path.startsWith('/admin/security/');
    const result = await client.query(`
        SELECT 1
        FROM active_sessions AS active
        JOIN users AS account ON account.username = active.username
        WHERE active.session_id = $1
          AND active.username = $2
          AND active.is_active = TRUE
          AND account.authorized = TRUE
          AND account.deactivated = FALSE
          AND ($3::boolean = FALSE OR account.is_admin = TRUE)
        FOR SHARE OF active
    `, [req.sessionID, req.session?.user?.username, requiresAdmin]);
    if (result.rowCount !== 1) {
        return {
            status: requiresAdmin ? 403 : 401,
            message: requiresAdmin ? '管理员权限或会话已失效' : '登录会话或授权已失效'
        };
    }
    return null;
}

app.use((req, res, next) => {
    if (!req.session?.user) return next();
    return requireLogin(req, res, next);
});

app.use(createIdempotencyMiddleware({
    pool,
    paths: idempotentWritePaths,
    validateExistingRequest: validateExistingIdempotentRequest,
    validateTransactionalRequest: validateTransactionalIdempotentRequest,
    hashSecret: idempotencyHashSecret
}));

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
    keyGenerator: clientIpRateLimitKey,
    store: new PostgresRateLimitStore(pool, 'auth:login-ip'),
    passOnStoreError: false
});

const loginAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'auth:login-account'),
    passOnStoreError: false,
    keyGenerator: (req) => {
        const username = typeof req.body?.username === 'string'
            ? req.body.username.normalize('NFKC').trim().toLocaleLowerCase('en-US').slice(0, 32)
            : 'invalid';
        return username;
    },
    handler: (req, res) => res.status(429).render('login', {
        title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
        error: uiText(res, '用户名或密码错误，请稍后重试。', 'Invalid credentials. Please try again later.'),
        csrfToken: generateCSRFToken(req)
    })
});

const registerLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: "⚠️ 注册太频繁，请稍后再试。",
    keyGenerator: clientIpRateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(pool, 'auth:register-ip'),
    passOnStoreError: false,
});

// 飘屏系统
class DanmakuSystem {
    constructor() {
        this.recentMessages = []; // 内存存储最近的消息
        this.maxMessages = 50;    // 最多存储50条
    }
    
    rememberAndBroadcast(message) {
        this.recentMessages.unshift(message);
        if (this.recentMessages.length > this.maxMessages) {
            this.recentMessages = this.recentMessages.slice(0, this.maxMessages);
        }
        io.emit('new_danmaku', message);
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
        
        this.rememberAndBroadcast(message);
        publishSocketEvent('danmaku', { message });
        return message;
    }

    acceptRemoteMessage(message) {
        if (!message || !validSocketUsername(message.username)
            || !['success', 'fail'].includes(message.type)
            || typeof message.content !== 'string'
            || message.content.length > 200
            || !Number.isFinite(Number(message.timestamp))) {
            return;
        }
        this.rememberAndBroadcast({
            username: message.username,
            type: message.type,
            content: message.content,
            timestamp: Number(message.timestamp)
        });
    }
    
    getRecentMessages(limit = 20) {
        return this.recentMessages.slice(0, limit);
    }
}

const danmaku = new DanmakuSystem();

// 全局广播函数
function broadcastDanmaku(username, type, isWin) {
    // 只在成功时飘屏
    if (isWin) {
        return danmaku.addMessage(username, type, isWin);
    }
    return null;
}

// 创建题目ID索引，提升查找性能

// ====================
// 认证路由
// ====================
const uiText = (res, zh, en) => (res.locals.lang === 'zh' ? zh : en);
const usernamePattern = /^[\p{L}\p{N}_-]{3,32}$/u;
const normalizeUsernameInput = (value) => typeof value === 'string'
    ? value.normalize('NFKC').trim()
    : '';
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

app.get('/account-locked', (req, res) => {
    if (!req.session?.user) return res.redirect('/login');
    if (req.session.user.account_locked !== true) return res.redirect('/');
    res.status(423).render('account-locked', {
        title: uiText(res, '账户已锁定', 'Account locked'),
        user: req.session.user,
        csrfToken: generateCSRFToken(req)
    });
});

app.get('/reset-password', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    let valid = false;
    if (/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
        try {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const result = await pool.query(`
                SELECT t.password_fingerprint, u.password_hash
                FROM password_reset_tokens t
                JOIN users u ON u.username = t.username
                WHERE t.token_hash = $1
                  AND t.used_at IS NULL
                  AND t.revoked_at IS NULL
                  AND t.expires_at > NOW()
                  AND u.deactivated = false
            `, [tokenHash]);
            valid = result.rows.length === 1
                && crypto.createHash('sha256')
                    .update(result.rows[0].password_hash)
                    .digest('hex') === result.rows[0].password_fingerprint;
        } catch (error) {
            console.error('密码重置令牌检查失败:', error);
            return res.status(503).render('reset-password', {
                title: uiText(res, '重置密码 - Minimal Games', 'Reset Password - Minimal Games'),
                csrfToken: generateCSRFToken(req),
                token: '',
                error: uiText(res, '重置服务暂不可用，请稍后重试', 'Reset service is temporarily unavailable.'),
                success: false
            });
        }
    }

    return res.status(valid ? 200 : 410).render('reset-password', {
        title: uiText(res, '重置密码 - Minimal Games', 'Reset Password - Minimal Games'),
        csrfToken: generateCSRFToken(req),
        token: valid ? token : '',
        error: valid ? null : uiText(res, '重置链接无效、已使用或已过期', 'This reset link is invalid, used, or expired.'),
        success: false
    });
});

app.post('/reset-password', loginLimiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const newPassword = req.body?.newPassword;
    const confirmPassword = req.body?.confirmPassword;
    const renderFailure = (status, message) => res.status(status).render('reset-password', {
        title: uiText(res, '重置密码 - Minimal Games', 'Reset Password - Minimal Games'),
        csrfToken: generateCSRFToken(req),
        token: /^[A-Za-z0-9_-]{40,100}$/.test(token) ? token : '',
        error: message,
        success: false
    });

    if (!verifyCSRFToken(req, req.body?._csrf)) {
        return renderFailure(403, uiText(res, '请求验证失败，请重新打开重置链接', 'Request verification failed. Reopen the reset link.'));
    }
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
        return renderFailure(410, uiText(res, '重置链接无效、已使用或已过期', 'This reset link is invalid, used, or expired.'));
    }
    if (newPassword !== confirmPassword || !isStrongPassword(newPassword)) {
        return renderFailure(400, uiText(
            res,
            '两次密码必须一致，且新密码须为12-128位并包含字母和数字',
            'Passwords must match and contain 12-128 characters with letters and numbers.'
        ));
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    let preliminary;
    try {
        preliminary = await pool.query(`
            SELECT t.username, t.password_fingerprint, u.password_hash
            FROM password_reset_tokens t
            JOIN users u ON u.username = t.username
            WHERE t.token_hash = $1
              AND t.used_at IS NULL
              AND t.revoked_at IS NULL
              AND t.expires_at > NOW()
              AND u.deactivated = false
        `, [tokenHash]);
    } catch (error) {
        console.error('密码重置令牌读取失败:', error);
        return renderFailure(503, uiText(res, '重置服务暂不可用，请稍后重试', 'Reset service is temporarily unavailable.'));
    }
    if (preliminary.rows.length !== 1) {
        return renderFailure(410, uiText(res, '重置链接无效、已使用或已过期', 'This reset link is invalid, used, or expired.'));
    }

    const preliminaryRow = preliminary.rows[0];
    const currentFingerprint = crypto.createHash('sha256').update(preliminaryRow.password_hash).digest('hex');
    if (currentFingerprint !== preliminaryRow.password_fingerprint) {
        return renderFailure(410, uiText(res, '密码已发生变化，此重置链接已失效', 'The password changed, so this reset link is no longer valid.'));
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    let client;
    let sessionIds = [];
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const lockedToken = await client.query(`
            SELECT t.id, t.username, t.password_fingerprint, u.password_hash
            FROM password_reset_tokens t
            JOIN users u ON u.username = t.username
            WHERE t.token_hash = $1
              AND t.used_at IS NULL
              AND t.revoked_at IS NULL
              AND t.expires_at > NOW()
              AND u.deactivated = false
            FOR UPDATE OF t, u
        `, [tokenHash]);
        if (lockedToken.rows.length !== 1) {
            await client.query('ROLLBACK');
            return renderFailure(410, uiText(res, '重置链接无效、已使用或已过期', 'This reset link is invalid, used, or expired.'));
        }

        const locked = lockedToken.rows[0];
        const lockedFingerprint = crypto.createHash('sha256').update(locked.password_hash).digest('hex');
        if (lockedFingerprint !== locked.password_fingerprint) {
            await client.query('ROLLBACK');
            return renderFailure(410, uiText(res, '密码已发生变化，此重置链接已失效', 'The password changed, so this reset link is no longer valid.'));
        }

        const updatedUser = await client.query(`
            UPDATE users
            SET password_hash = $1,
                login_failures = 0,
                last_failure_time = NULL,
                locked_until = NULL
            WHERE username = $2 AND password_hash = $3 AND deactivated = false
            RETURNING username
        `, [newPasswordHash, locked.username, locked.password_hash]);
        if (updatedUser.rowCount !== 1) {
            throw new Error('Password reset user state changed concurrently');
        }
        const usedToken = await client.query(`
            UPDATE password_reset_tokens
            SET used_at = NOW()
            WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
            RETURNING id
        `, [locked.id]);
        if (usedToken.rowCount !== 1) {
            throw new Error('Password reset token state changed concurrently');
        }
        await client.query(`
            UPDATE password_reset_tokens
            SET revoked_at = NOW()
            WHERE username = $1 AND id != $2 AND used_at IS NULL AND revoked_at IS NULL
        `, [locked.username, locked.id]);
        const sessions = await client.query(
            'SELECT session_id FROM active_sessions WHERE username = $1 AND is_active = true FOR UPDATE',
            [locked.username]
        );
        sessionIds = sessions.rows.map((row) => row.session_id);
        await client.query(`
            UPDATE active_sessions
            SET is_active = false, terminated_at = NOW(), termination_reason = 'password_reset_completed'
            WHERE username = $1 AND is_active = true
        `, [locked.username]);
        if (sessionIds.length > 0) {
            await client.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [sessionIds]);
        }
        await client.query(`
            INSERT INTO security_events (event_type, username, ip_address, description, severity)
            VALUES ('password_reset_completed', $1, $2, '一次性密码重置令牌已使用', 'high')
        `, [locked.username, req.clientIP]);
        await client.query('COMMIT');
        disconnectUserSockets(locked.username, sessionIds);
        return res.render('reset-password', {
            title: uiText(res, '重置密码 - Minimal Games', 'Reset Password - Minimal Games'),
            csrfToken: '',
            token: '',
            error: null,
            success: true
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('完成密码重置失败:', error);
        return renderFailure(503, uiText(res, '重置服务暂不可用，请稍后重试', 'Reset service is temporarily unavailable.'));
    } finally {
        client?.release();
    }
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
        
        const [stats, lifetimeEarnings] = await Promise.all([
            gameRegistry.records.loadProfileStats(pool, username),
            getLifetimeEarnings(pool, username)
        ]);
        
        const user = userResult.rows[0];
        
        res.render('profile', {
            title: uiText(res, '个人资料 - Minimal Games', 'Profile - Minimal Games'),
            user: user,
            lifetimeEarnings,
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
    const { password, _csrf } = req.body || {};
    const username = normalizeUsernameInput(req.body?.username);
    
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
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO users (username, password_hash, balance, created_at, registration_ip)
                 VALUES ($1, $2, 0, NOW(), $3)`,
                [username, hashed, req.clientIP]
            );
            const signupBonus = await BalanceLogger.updateBalance({
                username,
                amount: 100,
                operationType: 'signup_promotion',
                description: '注册推广金库发放 100 积分',
                gameData: {
                    fundingSource: 'promotion_treasury',
                    assetClass: 'legacy_unsegregated_promotion'
                },
                ipAddress: req.clientIP,
                userAgent: req.userAgent,
                requestId: `signup:${username}`,
                requireSufficientBalance: false,
                client,
                managedTransaction: true
            });
            if (!signupBonus.success) throw new Error('Signup promotion posting failed');
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
        IPManager.recordIPActivity(req.clientIP, username, req.userAgent, 'register')
            .catch(() => console.error('注册IP遥测写入失败'));
        
        res.redirect('/login?registered=true');
    } catch (err) {
        if (err.code === '23505') {
            res.render('register', {
                title: uiText(res, '注册 - Minimal Games', 'Register - Minimal Games'),
                error: uiText(res, '❌ 用户名已存在！', '❌ Username already exists!'),
                csrfToken: generateCSRFToken(req)
            });
        } else {
            console.error('注册写入失败');
            res.render('register', {
                title: uiText(res, '注册 - Minimal Games', 'Register - Minimal Games'),
                error: uiText(res, '❌ 注册失败，请稍后重试。', '❌ Registration failed, please try again.'),
                csrfToken: generateCSRFToken(req)
            });
        }
    }
});

// 登录处理 - 集成IP风控和单设备登录
app.post('/login', loginLimiter, loginAccountLimiter, async (req, res) => {
    const { password, _csrf } = req.body || {};
    const username = normalizeUsernameInput(req.body?.username);
    const clientIP = req.clientIP;
    const userAgent = req.userAgent;
    
    if (!verifyCSRFToken(req, _csrf)) {
        return res.status(403).send(uiText(res, '⚠️ CSRF token 校验失败', '⚠️ CSRF token validation failed'));
    }

    if (!usernamePattern.test(String(username || ''))
        || typeof password !== 'string'
        || password.length < 1
        || password.length > 128
        || Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).render('login', {
            title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
            error: uiText(res, '用户名或密码不能为空！', 'Username and password cannot be empty!'),
            csrfToken: generateCSRFToken(req)
        });
    }

    try {
        // 1. IP风险评估
        const riskData = await IPManager.getIPRiskScore(clientIP, username);

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
            `SELECT username, password_hash, balance, is_admin, authorized,
                    login_failures, locked_until, deactivated
             FROM users WHERE username = $1`,
            [username]
        );
        
        if (result.rows.length === 0) {
            await bcrypt.compare(password, dummyPasswordHash);
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_failed');
            return res.status(401).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, '用户名或密码错误！', 'Invalid username or password!'),
                csrfToken: generateCSRFToken(req)
            });
        }

        const user = result.rows[0];
        const now = new Date();
        const accountLocked = user.locked_until && new Date(user.locked_until) > now;

        // Verify the password before revealing whether this account is locked.
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (user.deactivated === true) {
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_deactivated');
            return res.status(401).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, '用户名或密码错误！', 'Invalid username or password!'),
                csrfToken: generateCSRFToken(req)
            });
        }
        
        if (!isMatch) {
            if (accountLocked) {
                await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_failed');
                return res.status(401).render('login', {
                    title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                    error: uiText(res, '用户名或密码错误！', 'Invalid username or password!'),
                    csrfToken: generateCSRFToken(req)
                });
            }
            await pool.query(`
                WITH failure_state AS (
                    SELECT username,
                           LEAST(100000, CASE
                               WHEN last_failure_time IS NULL
                                 OR last_failure_time < NOW() - INTERVAL '15 minutes'
                               THEN 1
                               ELSE COALESCE(login_failures, 0) + 1
                           END) AS next_failures
                    FROM users
                    WHERE username = $1
                    FOR UPDATE
                )
                UPDATE users AS account
                SET login_failures = failure_state.next_failures,
                    last_failure_time = NOW(),
                    locked_until = CASE
                        WHEN account.locked_until > NOW() THEN account.locked_until
                        ELSE NULL
                    END
                FROM failure_state
                WHERE account.username = failure_state.username
                RETURNING account.login_failures, account.locked_until
            `, [username]);
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_failed');

            return res.status(401).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, '用户名或密码错误！', 'Invalid username or password!'),
                csrfToken: generateCSRFToken(req)
            });
        }

        // Only a caller who proved knowledge of the password learns that an
        // administrator or an earlier policy has locked the account.
        if (accountLocked) {
            const lockMinutes = Math.ceil((new Date(user.locked_until) - now) / 60000);
            await IPManager.recordIPActivity(clientIP, username, userAgent, 'login_locked');
            return res.status(423).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, `账户已被锁定，请 ${lockMinutes} 分钟后再试！`, `Account locked. Try again in ${lockMinutes} minutes.`),
                csrfToken: generateCSRFToken(req)
            });
        }

        // 5. 登录成功处理
        const loginStateReset = await pool.query(`
            UPDATE users
            SET login_failures = 0, last_failure_time = NULL, locked_until = NULL
            WHERE username = $1
              AND password_hash = $2
              AND deactivated = false
              AND (locked_until IS NULL OR locked_until <= NOW())
            RETURNING username
        `, [username, user.password_hash]);
        if (loginStateReset.rowCount !== 1) {
            return res.status(401).render('login', {
                title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
                error: uiText(res, '账号状态已变化，请重新登录', 'Account state changed. Please sign in again.'),
                csrfToken: generateCSRFToken(req)
            });
        }
        
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
                    const accountUnavailable = sessionResult.reason === 'account_unavailable';
                    res.status(credentialsChanged || accountUnavailable ? 401 : 503).send(
                        credentialsChanged
                            ? uiText(res, '密码已发生变化，请重新登录', 'Password changed. Please sign in again.')
                            : accountUnavailable
                                ? uiText(res, '用户名或密码错误', 'Invalid username or password.')
                                : uiText(res, '登录会话创建失败，请重试', 'Failed to create login session. Please retry.')
                    );
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
                
            }

            // 13. 登录成功，准备重定向
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
        console.error('登录处理失败');
        await IPManager.recordIPActivity(clientIP, username || 'unknown', userAgent, 'login_error');
        res.status(500).render('login', {
            title: uiText(res, '登录 - Minimal Games', 'Login - Minimal Games'),
            error: uiText(res, '登录失败，请稍后再试。', 'Login failed, please try again.'),
            csrfToken: generateCSRFToken(req)
        });
    }
});

// GET logout never mutates state. It remains as a compatibility redirect for old links.
app.get('/logout', (req, res) => res.redirect('/'));

app.post('/logout', requireCSRF, async (req, res) => {
    const sessionId = req.sessionID;
    const username = req.session?.user?.username;

    try {
        if (username && sessionId) {
            await SessionManager.terminateSession(sessionId, 'user_logout');
        }
    } catch (error) {
        console.error('会话登出记录失败:', error);
    }

    req.session.destroy(() => {
        res.clearCookie('minimal_games_sid');
        res.redirect('/');
    });
});

// 修改密码API
app.post('/api/change-password', requireLogin, requireCSRF, async (req, res) => {
    let client;
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body || {};
        const username = req.session.user.username;

        if (req.session.user.is_admin) {
            return res.status(403).json({
                success: false,
                message: '管理员必须在管理后台完成密码修改'
            });
        }

        if (typeof currentPassword !== 'string'
            || typeof newPassword !== 'string'
            || typeof confirmPassword !== 'string'
            || !currentPassword || !newPassword || !confirmPassword
            || Buffer.byteLength(currentPassword, 'utf8') > 72) {
            return res.status(400).json({ success: false, message: '请填写所有字段' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: '新密码和确认密码不匹配' });
        }

        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ success: false, message: '新密码须为12-128位，并同时包含字母和数字' });
        }

        const userResult = await pool.query(
            `SELECT password_hash
             FROM users
             WHERE username = $1 AND is_admin = false AND deactivated = false`,
            [username]
        );
        if (userResult.rows.length === 0) {
            return res.status(409).json({ success: false, message: '账号状态已变化，请重新登录' });
        }

        const currentPasswordHash = userResult.rows[0].password_hash;
        const isValidPassword = await bcrypt.compare(currentPassword, currentPasswordHash);
        if (!isValidPassword) {
            return res.status(400).json({ success: false, message: '当前密码错误' });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 12);
        client = await pool.connect();
        await client.query('BEGIN');
        const updateResult = await client.query(
            `UPDATE users
             SET password_hash = $1,
                 login_failures = 0,
                 last_failure_time = NULL,
                 locked_until = NULL
             WHERE username = $2
               AND password_hash = $3
               AND is_admin = false
               AND deactivated = false
             RETURNING username`,
            [newPasswordHash, username, currentPasswordHash]
        );
        if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: '密码已被其他会话修改，请重新登录' });
        }
        await client.query(`
            UPDATE password_reset_tokens
            SET revoked_at = NOW()
            WHERE username = $1 AND used_at IS NULL AND revoked_at IS NULL
        `, [username]);
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
            balance = result.rows.length === 1
                ? parseMoney(result.rows[0].balance, 'user balance', { min: 0 })
                : null;
        } catch (dbError) {
            console.error('Database query error:', dbError);
        }
    }
    
    res.render('index', {
        title: uiText(res, 'Minimal Games 游戏中心', 'Minimal Games Game Center'),
        user: req.session.user || null,
        balance: balance,
        csrfToken: req.session.csrfToken,
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
            balance = result.rows.length === 1
                ? parseMoney(result.rows[0].balance, 'user balance', { min: 0 })
                : null;
        } catch (dbError) {
            console.error('Database query error:', dbError);
        }
    }

    res.render('games', {
        title: uiText(res, '游戏专区', 'Game Zone'),
        user: req.session.user || null,
        balance: balance,
        csrfToken: req.session.csrfToken,
        req: req
    });
});

const stoneColors = gameRegistry.STONE_CONFIG.colors;

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
             VALUES ($1, $2, $3, 0, 0, FALSE, NOW(), NOW())
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
    const result = await executor(
        `UPDATE flip_states
         SET board = $1, flipped = $2, good_count = $3, bad_count = $4, ended = $5,
             updated_at = NOW()
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
    if (result.rowCount !== 1) throw new Error('Flip state row was not updated');
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
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
             VALUES ($1, $2, NOW(), NOW())
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
    const result = await executor(
        `UPDATE stone_states
         SET slots = $1, updated_at = NOW()
         WHERE username = $2`,
        [JSON.stringify(slots), username]
    );
    if (result.rowCount !== 1) throw new Error('Stone state row was not updated');
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
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
            "SELECT pg_advisory_xact_lock(hashtextextended($1 || ':gift_exchange', 0))",
            [username]
        );

        const inventoryResult = await client.query(`
            SELECT id, username, gift_type, gift_name, bilibili_gift_id, status, expires_at,
                   gift_exchange_id
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
            if (item.gift_exchange_id
                && ['queued', 'sent'].includes(item.status)) {
                await client.query('COMMIT');
                return {
                    success: true,
                    exchangeId: item.gift_exchange_id,
                    alreadyQueued: true
                };
            }
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
                        updated_at = NOW()
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
              AND delivery_status IN ('pending', 'claimed', 'processing', 'uncertain')
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
            ) VALUES ($1, $2, $3, $4, $5, 'funds_locked', NOW(), $6, 'pending')
            RETURNING id
        `, [
            username,
            item.gift_type,
            item.gift_name,
            0,
            1,
            bilibiliRoomId
        ]);

        const inventoryUpdated = await client.query(`
            UPDATE wish_inventory
            SET status = 'queued',
                gift_exchange_id = $1,
                updated_at = NOW()
            WHERE id = $2 AND username = $3 AND status = 'stored'
            RETURNING id
        `, [exchangeResult.rows[0].id, inventoryId, username]);
        if (inventoryUpdated.rowCount !== 1) {
            throw new Error('Wish inventory state changed concurrently');
        }

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
        const lockResult = await lockClient.query("SELECT pg_try_advisory_lock(hashtextextended('wish_auto_send', 0)) AS locked");
        lockAcquired = lockResult.rows[0].locked === true;
        if (!lockAcquired) return;

        const expiredItems = await lockClient.query(`
            SELECT wi.id, wi.username, u.bilibili_room_id
            FROM wish_inventory wi
            JOIN users u ON u.username = wi.username
            WHERE wi.status = 'stored'
              AND wi.expires_at <= NOW()
            ORDER BY wi.expires_at ASC
            LIMIT 20
        `);

        for (const row of expiredItems.rows) {
            if (!row.bilibili_room_id) {
                await lockClient.query(`
                    UPDATE wish_inventory
                    SET expires_at = 'infinity'::timestamptz,
                        updated_at = NOW()
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
                    await lockClient.query("SELECT pg_advisory_unlock(hashtextextended('wish_auto_send', 0))");
                } catch (e) {
                    console.error('释放 wish_auto_send 锁失败:', e);
                }
            }
            lockClient.release();
        }
        isWishAutoSendRunning = false;
    }
}

async function scheduleWishInventoryDeliveryOnBind(username, client = pool) {
    const result = await client.query(`
        UPDATE wish_inventory
        SET expires_at = ((date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai')
                + interval '1 day 23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Shanghai'),
            updated_at = NOW()
        WHERE username = $1
          AND status = 'stored'
          AND (expires_at IS NULL OR expires_at = 'infinity'::timestamptz)
        RETURNING id
    `, [username]);
    return result.rowCount;
}

function registerRuntimeLifecycle() {
    applicationLifecycle.registerComponent('database-pool', {
        async start() {},
        async stop() { await pool.end(); }
    });
    applicationLifecycle.registerComponent('session-store', {
        async start() {},
        async stop() { await sessionStore.close(); }
    });
    applicationLifecycle.registerComponent('paid-action-concurrency-guard', {
        async start() { paidActionConcurrencyGuard.start(); },
        async stop() { paidActionConcurrencyGuard.close(); }
    });
    applicationLifecycle.registerComponent('database-schema', {
        async start() {
            const databaseReady = await initializeDatabase();
            if (!databaseReady) {
                throw new Error('数据库初始化失败，拒绝启动服务');
            }
        },
        async stop() {}
    });
    applicationLifecycle.registerComponent('socket-event-bus', {
        start: () => socketEventBus.start(),
        stop: () => socketEventBus.close()
    });
    applicationLifecycle.registerComponent('session-cleanup', {
        async start() { SessionManager.startCleanup(); },
        stop: () => SessionManager.stopCleanup()
    });
    applicationLifecycle.registerComponent('ip-cleanup', {
        async start() { IPManager.startCleanup(); },
        stop: () => IPManager.stopCleanup()
    });
    applicationLifecycle.registerComponent('security-cleanup', {
        async start() { security.startCleanup(); },
        async stop() { security.stopCleanup(); }
    });
    applicationLifecycle.registerRecurringJob('socket-session-revalidation', {
        run: revalidateConnectedSockets,
        intervalMs: 60 * 1000,
        unref: true
    });
    applicationLifecycle.registerRecurringJob('wish-auto-send', {
        run: autoSendExpiredWishRewards,
        intervalMs: 60 * 1000,
        unref: true
    });
    applicationLifecycle.registerRecurringJob('idempotency-recovery', {
        run: recoverStaleIdempotencyKeys,
        intervalMs: 60 * 1000,
        runOnStart: true,
        unref: true
    });
    applicationLifecycle.registerRecurringJob('database-maintenance', {
        run: runDatabaseMaintenance,
        intervalMs: 6 * 60 * 60 * 1000,
        runOnStart: true,
        unref: true
    });
}

registerRuntimeLifecycle();

app.get('/live', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'alive' });
});

let readinessCache = null;
let readinessPromise = null;
async function checkReadiness() {
    if (readinessCache && Date.now() - readinessCache.checkedAt < 2000) {
        return readinessCache.result;
    }
    if (readinessPromise) return readinessPromise;

    readinessPromise = (async () => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL statement_timeout = '2000ms'");
            const schemaResult = await client.query(`
                SELECT
                    to_regclass('public.users') IS NOT NULL AS users_table,
                    to_regclass('public.balance_logs') IS NOT NULL AS balance_logs_table,
                    to_regclass('public.balance_audit_current') IS NOT NULL AS balance_audit_view,
                    to_regclass('public.idempotency_keys') IS NOT NULL AS idempotency_table,
                    to_regclass('public.gift_exchanges') IS NOT NULL AS gift_exchanges_table,
                    to_regclass('public.worker_heartbeats') IS NOT NULL AS worker_heartbeats_table,
                    to_regclass('public.worker_role_leases') IS NOT NULL AS worker_role_leases_table,
                    to_regclass('public.delivery_outbox') IS NOT NULL AS delivery_outbox_table,
                    to_regclass('public.rate_limit_counters') IS NOT NULL AS rate_limit_table,
                    to_regclass('public.minimal_games_schema_migrations') IS NOT NULL AS migrations_table,
                    NOT EXISTS (
                        SELECT 1
                        FROM minimal_games_schema_migrations
                        WHERE status <> 'applied'
                    ) AS migrations_applied,
                    NOT EXISTS (
                        SELECT 1
                        FROM users AS account
                        LEFT JOIN balance_audit_baselines AS baseline
                          ON baseline.username = account.username
                         AND baseline.version = 'append-only-v1'
                        WHERE baseline.username IS NULL
                    ) AS balance_baseline_coverage,
                    EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submissions'
                          AND column_name = 'quiz_session_id'
                    ) AS quiz_session_link,
                    EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'public.users'::regclass
                          AND conname = 'users_balance_invariant_check'
                          AND convalidated
                    ) AS balance_constraint,
                    EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgrelid = 'public.balance_logs'::regclass
                          AND tgname = 'balance_logs_append_only'
                          AND NOT tgisinternal
                    ) AS balance_append_only,
                    EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgrelid = 'public.balance_logs'::regclass
                          AND tgname = 'balance_logs_chain_guard'
                          AND NOT tgisinternal
                    ) AS balance_chain_guard,
                    EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgrelid = 'public.users'::regclass
                          AND tgname = 'users_balance_ledger_guard'
                          AND NOT tgisinternal
                    ) AS balance_update_guard,
                    EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgrelid = 'public.users'::regclass
                          AND tgname = 'users_establish_balance_audit_baseline'
                          AND NOT tgisinternal
                    ) AS balance_baseline_guard
            `);
            const workerResult = await client.query(`
                SELECT COUNT(*) FILTER (
                           WHERE lease.lease_expires_at > NOW()
                             AND heartbeat.status = 'online'
                             AND heartbeat.last_seen_at > NOW() - INTERVAL '90 seconds'
                       )::INTEGER AS online_workers,
                       MAX(heartbeat.last_seen_at) AS last_seen_at
                FROM worker_role_leases AS lease
                LEFT JOIN worker_heartbeats AS heartbeat
                  ON heartbeat.worker_id = lease.worker_id
                 AND heartbeat.worker_type = 'gift-pk'
                WHERE lease.role = 'gift-pk'
            `);
            await client.query('COMMIT');

            const schemaChecks = schemaResult.rows[0] || {};
            const schemaReady = Object.values(schemaChecks).every((value) => value === true);
            let workerCredentialsReady = process.env.NODE_ENV !== 'production';
            try {
                workerCredentialsReady = parseWorkerCredentials(
                    process.env.WORKER_CREDENTIALS_JSON
                ).size > 0;
            } catch {
                workerCredentialsReady = false;
            }
            const configurationReady = process.env.NODE_ENV !== 'production' || (
                typeof process.env.SESSION_SECRET === 'string'
                && process.env.SESSION_SECRET.length >= 32
                && workerCredentialsReady
            );
            const backgroundReady = Boolean(
                applicationLifecycle.state === 'running'
                && socketEventBus.isReady()
            );
            const onlineWorkers = Number(workerResult.rows[0]?.online_workers || 0);
            const ready = schemaReady && configurationReady && backgroundReady;
            return {
                httpStatus: ready ? 200 : 503,
                body: {
                    status: ready ? (onlineWorkers > 0 ? 'ok' : 'degraded') : 'unavailable',
                    ready,
                    timestamp: new Date().toISOString(),
                    checks: {
                        database: true,
                        schema: schemaReady,
                        configuration: configurationReady,
                        backgroundLoops: backgroundReady,
                        socketEventBus: socketEventBus.isReady(),
                        giftWorker: {
                            online: onlineWorkers > 0,
                            count: onlineWorkers,
                            lastSeenAt: workerResult.rows[0]?.last_seen_at || null
                        }
                    }
                }
            };
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            return {
                httpStatus: 503,
                body: {
                    status: 'unavailable',
                    ready: false,
                    timestamp: new Date().toISOString(),
                    checks: { database: false }
                }
            };
        } finally {
            client?.release();
        }
    })();

    try {
        const result = await readinessPromise;
        readinessCache = { checkedAt: Date.now(), result };
        return result;
    } finally {
        readinessPromise = null;
    }
}

const readinessHandler = async (req, res) => {
    const result = await checkReadiness();
    res.set('Cache-Control', 'no-store');
    return res.status(result.httpStatus).json({
        status: result.body.ready ? 'ready' : 'unavailable',
        ready: result.body.ready
    });
};
const diagnosticReadinessHandler = async (req, res) => {
    const token = req.get('X-Readiness-Token');
    const expectedToken = process.env.READINESS_TOKEN;
    const tokenBuffer = Buffer.from(String(token || ''), 'utf8');
    const expectedTokenBuffer = Buffer.from(String(expectedToken || ''), 'utf8');
    const tokenValid = tokenBuffer.length > 0
        && tokenBuffer.length === expectedTokenBuffer.length
        && crypto.timingSafeEqual(tokenBuffer, expectedTokenBuffer);
    if (!tokenValid) return res.status(404).json({ status: 'not_found' });
    const result = await checkReadiness();
    res.set('Cache-Control', 'no-store');
    return res.status(result.httpStatus).json(result.body);
};
app.get('/ready', readinessHandler);
app.get('/internal/ready', diagnosticReadinessHandler);
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'alive' });
});

// 🛡️ 安全修复：API密钥验证中间件 - 只允许header传key，禁止query参数
async function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key']; // 仅从header获取，不再支持query参数
    const ipWhitelist = process.env.GIFT_TASKS_IP_WHITELIST || '';
    const MAX_NONCE_CACHE_SIZE = 10000;
    const clientIp = req.clientIP || getClientIp(req);
    
    const workerId = req.headers['x-worker-id'];
    let credential;
    try {
        credential = parseWorkerCredentials(process.env.WORKER_CREDENTIALS_JSON).get(workerId);
    } catch {
        return res.status(500).json({ success: false, message: '服务配置错误' });
    }
    if (!credential) {
        return res.status(401).json({ success: false, message: '未知工作器身份' });
    }
    const validApiKey = credential.apiKey;
    const hmacSecret = credential.hmacSecret;
    const apiKeyBuffer = Buffer.from(String(apiKey || ''), 'utf8');
    const validApiKeyBuffer = Buffer.from(String(validApiKey || ''), 'utf8');
    if (!apiKey || !validApiKey || apiKeyBuffer.length !== validApiKeyBuffer.length
        || !crypto.timingSafeEqual(apiKeyBuffer, validApiKeyBuffer)) {
        return res.status(401).json({ 
            success: false, 
            message: '无效的API密钥' 
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
    const signatureVersion = req.headers['x-signature-version'];
    if (!timestampHeader || !signatureHeader || !nonceHeader || signatureVersion !== SIGNATURE_VERSION
        || typeof workerId !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(workerId)) {
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

    const expectedSignature = signRequest(hmacSecret, {
        timestamp: timestampHeader,
        nonce: nonceHeader,
        workerId,
        method: req.method,
        path: req.originalUrl,
        body: req.body
    });
    if (!signaturesMatch(String(signatureHeader), expectedSignature)) {
        return res.status(401).json({
            success: false,
            message: '签名不匹配'
        });
    }

    try {
        const nonceResult = await pool.query(`
            INSERT INTO api_request_nonces (
                nonce, request_method, request_path, request_timestamp, worker_id, created_at
            ) VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, NOW())
            ON CONFLICT (nonce) DO NOTHING
            RETURNING nonce
        `, [nonceHeader, req.method, req.path, timestampMs, workerId]);
        if (nonceResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: '重复请求' });
        }
        nonceCache.set(nonceHeader, timestampMs);
        req.requestNonce = nonceHeader;
        req.workerId = workerId;
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

async function requireActiveWorkerLease(req, res, next) {
    try {
        const active = await hasActiveWorkerRoleLease(pool, {
            role: 'gift-pk',
            workerId: req.workerId
        });
        if (!active) {
            return res.status(409).json({
                success: false,
                message: '当前工作器未持有活动租约',
                code: 'WORKER_LEASE_NOT_HELD'
            });
        }
        return next();
    } catch (error) {
        console.error('工作器租约校验失败');
        return res.status(503).json({
            success: false,
            message: '工作器租约服务暂不可用'
        });
    }
}

// ====================
// 路由注册
// ====================

registerAnalyticsRoutes(app, {
    pool,
    rateLimit,
    requireLogin,
    requireAdmin,
    security,
    analyticsTokenSecret
});

registerAdminRoutes(app, {
    pool,
    bcrypt,
    BalanceLogger,
    gameRegistry,
    generateCSRFToken,
    requireLogin,
    requireAdmin,
    requireAuthorized,
    requireCSRF,
    security,
    scheduleWishInventoryDeliveryOnBind,
    IPManager,
    SessionManager,
    notifySecurityEvent,
    disconnectUserSockets,
    passwordResetTokenSecret: resetTokenSecret
});

registerGiftRoutes(app, {
    pool,
    giftConfig,
    BalanceLogger,
    requireLogin,
    requireAuthorized,
    requireCSRF,
    requireApiKey,
    requireActiveWorkerLease,
    security,
    generateCSRFToken,
    enqueueWishInventorySend,
    paidActionConcurrencyGuard,
    applicationLifecycle
});

registerWishRoutes(app, {
    pool,
    BalanceLogger,
    gameRegistry,
    requireLogin,
    requireAuthorized,
    requireCSRF,
    security,
    generateCSRFToken,
    broadcastDanmaku,
    enqueueWishInventorySend,
    paidActionConcurrencyGuard
});

registerGameRoutes(app, {
    pool,
    BalanceLogger,
    GameLogic,
    questions,
    generateCSRFToken,
    requireLogin,
    requireAuthorized,
    requireCSRF,
    dictationTokenSecret,
    security,
    randomStoneColor,
    normalizeStoneSlots,
    getMaxSameCount,
    getStoneState,
    saveStoneState,
    logStoneAction,
    gameRegistry,
    createFlipBoard,
    getFlipState,
    saveFlipState,
    logFlipAction,
    paidActionConcurrencyGuard,
    giftConfig,
    questService
});

registerDoudizhuRoutes(app, {
    pool,
    gameRegistry,
    generateCSRFToken,
    requireLogin,
    requireAuthorized,
    requireCSRF,
    security,
    paidActionConcurrencyGuard,
    questService
});

registerAdventureRoutes(app, {
    pool,
    BalanceLogger,
    generateCSRFToken,
    requireLogin,
    requireAuthorized,
    requireCSRF,
    security,
    paidActionConcurrencyGuard,
    adventureConfig: gameRegistry.ADVENTURE_CONFIG,
    questService
});

registerTaskRoutes(app, {
    pool,
    BalanceLogger,
    generateCSRFToken,
    requireLogin,
    requireAuthorized,
    requireAdmin,
    requireCSRF,
    security,
    questService
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

function startHttpServer() {
    if (server.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanupListeners = () => {
            server.off('listening', onListening);
            server.off('error', onError);
        };
        const onListening = () => {
            cleanupListeners();
            console.log(`🎮 游戏服务器运行在端口 ${PORT}`);
            console.log(`📚 题库包含 ${questions.length} 道题目`);
            console.log(`🌐 访问 http://localhost:${PORT} 开始游戏`);
            console.log('🚀 WebSocket飘屏系统已启动');
            console.log('🎁 B站送礼功能已启用');
            resolve();
        };
        const onError = (error) => {
            cleanupListeners();
            reject(error);
        };
        server.once('listening', onListening);
        server.once('error', onError);
        try {
            server.listen(PORT);
        } catch (error) {
            cleanupListeners();
            reject(error);
        }
    });
}

async function stopHttpServer() {
    const timeout = setTimeout(() => {
        server.closeAllConnections?.();
    }, 10 * 1000);
    timeout.unref?.();
    try {
        await io.close();
    } finally {
        clearTimeout(timeout);
    }
}

applicationLifecycle.registerComponent('http-server', {
    start: startHttpServer,
    stop: stopHttpServer
});

async function startServer() {
    await applicationLifecycle.start();
    return server;
}

let shutdownPromise = null;
function shutdown(signal = 'manual') {
    if (shutdownPromise) return shutdownPromise;
    console.log(`收到${signal}信号，正在关闭服务...`);
    shutdownPromise = applicationLifecycle.stop().then(() => {
        console.log('服务器已安全关闭');
    });
    return shutdownPromise;
}

function handleShutdownSignal(signal) {
    void shutdown(signal).then(
        () => { process.exitCode = 0; },
        (error) => {
            console.error('关闭服务器时发生错误:', error);
            process.exitCode = 1;
        }
    );
}

if (require.main === module) {
    process.once('SIGINT', () => handleShutdownSignal('SIGINT'));
    process.once('SIGTERM', () => handleShutdownSignal('SIGTERM'));
    void startServer().catch((error) => {
        console.error('服务启动失败:', error);
        process.exitCode = 1;
    });
}

module.exports = {
    app,
    server,
    io,
    applicationLifecycle,
    startServer,
    shutdown
};
