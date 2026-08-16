const {
    NAME_PATTERN,
    clampInteger,
    isUuid,
    normalizeRoute,
    normalizeTimestamp,
    optionalString,
    sanitizeMetadata,
    sanitizePreferences
} = require('../lib/ux-analytics');
const crypto = require('crypto');
const PostgresRateLimitStore = require('../lib/postgres-rate-limit-store');

const CONSENT_VERSION = '2026-08-12';
const MAX_ANALYTICS_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const ALLOWED_EVENTS = new Set([
    'page_view',
    'page_exit',
    'navigation_click',
    'api_action',
    'game_started',
    'game_completed',
    'game_error',
    'insufficient_balance',
    'client_error',
    'music_started',
    'music_paused',
    'music_completed',
    'language_changed',
    'ui_action'
]);

function requestIsSameSite(req) {
    const fetchSite = req.get('Sec-Fetch-Site');
    if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) return false;

    const origin = req.get('Origin');
    if (!origin) return process.env.NODE_ENV !== 'production';
    try {
        const parsed = new URL(origin);
        const expectedProtocol = process.env.NODE_ENV === 'production' ? 'https:' : `${req.protocol}:`;
        return parsed.protocol === expectedProtocol
            && parsed.host === req.get('host')
            && !parsed.username
            && !parsed.password;
    } catch {
        return false;
    }
}

function secureTokenMatches(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return leftBuffer.length > 0
        && leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function uuidFromHmac(secret, purpose, sessionId, tabNonce = '') {
    const bytes = crypto.createHmac('sha256', secret)
        .update(`${purpose}\0${sessionId}\0${tabNonce}`)
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deriveAnalyticsIdentity(secret, expressSessionId, tabNonce) {
    return {
        id: uuidFromHmac(secret, 'ux-session-v1', expressSessionId, tabNonce),
        anonymousId: uuidFromHmac(secret, 'ux-anonymous-v1', expressSessionId),
        tabId: uuidFromHmac(secret, 'ux-tab-v1', expressSessionId, tabNonce)
    };
}

function signAnalyticsSession(secret, expressSessionId, session) {
    const payload = [
        'ux-ingest-v1',
        expressSessionId,
        session.id,
        session.anonymousId,
        session.tabId,
        session.tabNonce,
        session.startedAt,
        session.detailedPreferences === true ? '1' : '0',
        CONSENT_VERSION
    ].join('\0');
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function validateAnalyticsSession(secret, expressSessionId, value, now = Date.now()) {
    if (!value || typeof value !== 'object'
        || !isUuid(value.id) || !isUuid(value.anonymousId) || !isUuid(value.tabId)
        || !isUuid(value.tabNonce) || typeof value.ingestToken !== 'string'
        || typeof value.startedAt !== 'string'
        || typeof value.detailedPreferences !== 'boolean') return null;

    const startedAtMs = new Date(value.startedAt).getTime();
    if (!Number.isFinite(startedAtMs)
        || startedAtMs > now + 5 * 60 * 1000
        || now - startedAtMs > MAX_ANALYTICS_SESSION_AGE_MS) return null;

    const identity = deriveAnalyticsIdentity(secret, expressSessionId, value.tabNonce);
    if (identity.id !== value.id
        || identity.anonymousId !== value.anonymousId
        || identity.tabId !== value.tabId) return null;

    const expectedToken = signAnalyticsSession(secret, expressSessionId, value);
    return secureTokenMatches(value.ingestToken, expectedToken)
        ? { ...value, ...identity, startedAtMs }
        : null;
}

function parsePageView(value, now) {
    if (!value || typeof value !== 'object' || !isUuid(value.id)) return null;
    const durationMs = clampInteger(value.durationMs, 0, 86400000, 0);
    return {
        id: value.id,
        route: normalizeRoute(value.route),
        referrerRoute: value.referrerRoute ? normalizeRoute(value.referrerRoute) : null,
        enteredAt: normalizeTimestamp(value.enteredAt, { now, maxPastMs: 86400000 }),
        exitedAt: value.exitedAt
            ? normalizeTimestamp(value.exitedAt, { now, maxPastMs: 86400000 })
            : null,
        durationMs,
        activeMs: Math.min(durationMs, clampInteger(value.activeMs, 0, 86400000, 0)),
        maxScrollPercent: clampInteger(value.maxScrollPercent, 0, 100, 0),
        exitReason: optionalString(value.exitReason, 30, NAME_PATTERN),
        isEmbedded: value.isEmbedded === true
    };
}

module.exports = function registerAnalyticsRoutes(app, deps) {
    const { pool, rateLimit, requireLogin, requireAdmin, security, analyticsTokenSecret } = deps;
    if (!Buffer.isBuffer(analyticsTokenSecret) || analyticsTokenSecret.length < 32) {
        throw new Error('analyticsTokenSecret must be a Buffer of at least 32 bytes');
    }
    const ingestLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 180,
        keyGenerator: (req) => req.session?.user?.username
            || rateLimit.ipKeyGenerator(req.clientIP || req.ip || 'unknown'),
        standardHeaders: true,
        legacyHeaders: false,
        store: new PostgresRateLimitStore(pool, 'ux:ingest'),
        passOnStoreError: false
    });

    app.post('/api/ux/bootstrap', ingestLimiter, async (req, res) => {
        if (!requestIsSameSite(req)) {
            return res.status(403).json({ success: false, message: '跨站分析请求已拒绝' });
        }
        const tabNonce = String(req.body?.tabNonce || '');
        const detailedPreferences = req.body?.detailedPreferences === true;
        if (req.body?.analytics !== true || req.body?.consentVersion !== CONSENT_VERSION
            || !isUuid(tabNonce)) {
            return res.status(400).json({ success: false, message: '分析同意信息无效' });
        }

        try {
            const now = Date.now();
            const identity = deriveAnalyticsIdentity(analyticsTokenSecret, req.sessionID, tabNonce);
            const analyticsSession = {
                ...identity,
                tabNonce,
                startedAt: new Date(now).toISOString(),
                consentVersion: CONSENT_VERSION,
                detailedPreferences
            };
            analyticsSession.ingestToken = signAnalyticsSession(
                analyticsTokenSecret,
                req.sessionID,
                analyticsSession
            );
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                session: analyticsSession
            });
        } catch (error) {
            console.error('UX 分析会话签发失败');
            return res.status(503).json({ success: false, message: '分析服务暂不可用' });
        }
    });

    app.post('/api/ux/revoke', ingestLimiter, async (req, res) => {
        if (!requestIsSameSite(req)) {
            return res.status(403).json({ success: false, message: '跨站分析请求已拒绝' });
        }
        const suppliedSession = req.body?.session;
        const validated = validateAnalyticsSession(
            analyticsTokenSecret,
            req.sessionID,
            suppliedSession
        );
        if (validated) {
            await pool.query(
                'DELETE FROM ux_sessions WHERE anonymous_id = $1',
                [validated.anonymousId]
            ).catch(() => {});
        }
        return res.status(204).end();
    });

    app.post('/api/ux/batch', ingestLimiter, async (req, res) => {
        if (!requestIsSameSite(req)) {
            return res.status(403).json({ success: false, message: '跨站分析请求已拒绝' });
        }

        let payload;
        try {
            payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch {
            return res.status(400).json({ success: false, message: '分析数据格式无效' });
        }
        let bodySize = 0;
        try {
            bodySize = Buffer.byteLength(JSON.stringify(payload || {}));
        } catch {
            return res.status(400).json({ success: false, message: '分析数据格式无效' });
        }
        if (bodySize > 32768) {
            return res.status(413).json({ success: false, message: '分析数据过大' });
        }

        const sessionInput = payload?.session;
        const now = new Date();
        const validatedSession = validateAnalyticsSession(
            analyticsTokenSecret,
            req.sessionID,
            sessionInput,
            now.getTime()
        );
        if (!validatedSession) {
            return res.status(401).json({ success: false, message: '分析会话无效' });
        }

        const pageView = parsePageView(payload.pageView, now);
        if (!pageView) {
            return res.status(400).json({ success: false, message: '页面访问数据无效' });
        }

        const rawEvents = Array.isArray(payload.events) ? payload.events.slice(0, 25) : [];
        const events = rawEvents.map((event) => ({
            id: event?.id,
            eventType: optionalString(event?.eventType, 50, /^[a-z][a-z0-9_]+$/),
            elementName: optionalString(event?.elementName, 80, NAME_PATTERN),
            metadata: sanitizeMetadata(event?.metadata),
            occurredAt: normalizeTimestamp(event?.occurredAt, { now, maxPastMs: 86400000 })
        })).filter((event) => isUuid(event.id) && ALLOWED_EVENTS.has(event.eventType));

        const detailedPreferences = validatedSession.detailedPreferences === true
            && sessionInput.detailedPreferences === true;
        const preferences = sanitizePreferences(detailedPreferences ? sessionInput.preferences : {});
        const startedAt = normalizeTimestamp(validatedSession.startedAt, {
            now,
            maxPastMs: 30 * 24 * 60 * 60 * 1000
        });
        let client;

        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL statement_timeout = '5s'");
            let userId = null;
            if (req.session?.user?.username) {
                const authenticatedUser = await client.query(`
                    SELECT account.id
                    FROM users AS account
                    JOIN active_sessions AS active ON active.username = account.username
                    WHERE account.username = $1
                      AND active.session_id = $2
                      AND active.is_active = TRUE
                      AND account.deactivated = FALSE
                    LIMIT 1
                `, [req.session.user.username, req.sessionID]);
                userId = authenticatedUser.rows[0]?.id || null;
            }
            const sessionResult = await client.query(`
                INSERT INTO ux_sessions (
                    id, anonymous_id, tab_id, user_id, started_at, last_seen_at,
                    device_type, platform, browser_language, preferred_languages,
                    app_language, timezone, timezone_offset_minutes,
                    screen_width, screen_height, viewport_width, viewport_height,
                    pixel_ratio, orientation, color_scheme, reduced_motion,
                    high_contrast, touch_capable, cookies_enabled, standalone,
                    hardware_concurrency, device_memory_gb, connection_type,
                    save_data, detailed_preferences, consent_version
                ) VALUES (
                    $1, $2, $3, $4, $5, NOW(),
                    $6, $7, $8, $9,
                    $10, $11, $12,
                    $13, $14, $15, $16,
                    $17, $18, $19, $20,
                    $21, $22, $23, $24,
                    $25, $26, $27,
                    $28, $29, $30
                )
                ON CONFLICT (id) DO UPDATE SET
                    user_id = COALESCE(EXCLUDED.user_id, ux_sessions.user_id),
                    last_seen_at = NOW(),
                    device_type = EXCLUDED.device_type,
                    platform = EXCLUDED.platform,
                    browser_language = EXCLUDED.browser_language,
                    preferred_languages = EXCLUDED.preferred_languages,
                    app_language = EXCLUDED.app_language,
                    timezone = EXCLUDED.timezone,
                    timezone_offset_minutes = EXCLUDED.timezone_offset_minutes,
                    viewport_width = EXCLUDED.viewport_width,
                    viewport_height = EXCLUDED.viewport_height,
                    orientation = EXCLUDED.orientation,
                    color_scheme = EXCLUDED.color_scheme,
                    connection_type = EXCLUDED.connection_type,
                    save_data = EXCLUDED.save_data,
                    detailed_preferences = EXCLUDED.detailed_preferences,
                    consent_version = EXCLUDED.consent_version,
                    updated_at = NOW()
                WHERE ux_sessions.anonymous_id = EXCLUDED.anonymous_id
                  AND ux_sessions.tab_id = EXCLUDED.tab_id
                RETURNING id
            `, [
                sessionInput.id,
                sessionInput.anonymousId,
                sessionInput.tabId,
                userId,
                startedAt,
                preferences.deviceType,
                preferences.platform,
                preferences.browserLanguage,
                preferences.preferredLanguages,
                preferences.appLanguage,
                preferences.timezone,
                preferences.timezoneOffsetMinutes,
                preferences.screenWidth,
                preferences.screenHeight,
                preferences.viewportWidth,
                preferences.viewportHeight,
                preferences.pixelRatio,
                preferences.orientation,
                preferences.colorScheme,
                preferences.reducedMotion,
                preferences.highContrast,
                preferences.touchCapable,
                preferences.cookiesEnabled,
                preferences.standalone,
                preferences.hardwareConcurrency,
                preferences.deviceMemoryGb,
                preferences.connectionType,
                preferences.saveData,
                detailedPreferences,
                CONSENT_VERSION
            ]);

            if (sessionResult.rows.length !== 1) {
                throw new Error('UX session identity conflict');
            }

            const pageResult = await client.query(`
                INSERT INTO ux_page_views (
                    id, session_id, user_id, route, referrer_route, entered_at,
                    last_seen_at, exited_at, duration_ms, active_ms,
                    max_scroll_percent, exit_reason, is_embedded
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    NOW(), $7, $8, $9,
                    $10, $11, $12
                )
                ON CONFLICT (id) DO UPDATE SET
                    user_id = COALESCE(EXCLUDED.user_id, ux_page_views.user_id),
                    last_seen_at = NOW(),
                    exited_at = CASE
                        WHEN EXCLUDED.exited_at IS NULL THEN ux_page_views.exited_at
                        WHEN ux_page_views.exited_at IS NULL THEN EXCLUDED.exited_at
                        ELSE GREATEST(ux_page_views.exited_at, EXCLUDED.exited_at)
                    END,
                    duration_ms = GREATEST(ux_page_views.duration_ms, EXCLUDED.duration_ms),
                    active_ms = GREATEST(ux_page_views.active_ms, EXCLUDED.active_ms),
                    max_scroll_percent = GREATEST(
                        ux_page_views.max_scroll_percent,
                        EXCLUDED.max_scroll_percent
                    ),
                    exit_reason = COALESCE(EXCLUDED.exit_reason, ux_page_views.exit_reason),
                    last_received_at = NOW()
                WHERE ux_page_views.session_id = EXCLUDED.session_id
                RETURNING session_id
            `, [
                pageView.id,
                sessionInput.id,
                userId,
                pageView.route,
                pageView.referrerRoute,
                pageView.enteredAt,
                pageView.exitedAt,
                pageView.durationMs,
                pageView.activeMs,
                pageView.maxScrollPercent,
                pageView.exitReason,
                pageView.isEmbedded
            ]);

            if (pageResult.rows.length !== 1) {
                throw new Error('UX page view identity conflict');
            }

            if (events.length > 0) {
                await client.query(`
                    INSERT INTO ux_events (
                        id, session_id, page_view_id, user_id,
                        event_type, element_name, metadata, occurred_at
                    )
                    SELECT event.id, $2, $3, $4,
                           event.event_type, event.element_name,
                           event.metadata, event.occurred_at
                    FROM jsonb_to_recordset($1::jsonb) AS event(
                        id UUID,
                        event_type VARCHAR(50),
                        element_name VARCHAR(80),
                        metadata JSONB,
                        occurred_at TIMESTAMPTZ
                    )
                    ON CONFLICT (id) DO NOTHING
                `, [
                    JSON.stringify(events.map((event) => ({
                        id: event.id,
                        event_type: event.eventType,
                        element_name: event.elementName,
                        metadata: event.metadata,
                        occurred_at: event.occurredAt
                    }))),
                    sessionInput.id,
                    pageView.id,
                    userId
                ]);
            }

            await client.query('COMMIT');
            return res.status(204).end();
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('UX分析写入失败:', error);
            return res.status(500).json({ success: false, message: '分析数据写入失败' });
        } finally {
            client?.release();
        }
    });

    const adminGuards = [
        requireLogin,
        requireAdmin,
        security.readHeavyRateLimit
    ];

    app.get('/admin/analytics', ...adminGuards, async (req, res) => {
        const allowedDays = new Set([1, 7, 30, 90]);
        const requestedDays = Number(req.query.days);
        const days = allowedDays.has(requestedDays) ? requestedDays : 7;
        let analyticsClient;
        try {
            const interval = `${days} days`;
            analyticsClient = await pool.connect();
            await analyticsClient.query('BEGIN TRANSACTION READ ONLY');
            await analyticsClient.query("SET LOCAL statement_timeout = '4s'");
            // A single PostgreSQL client serializes these reports and prevents one
            // dashboard request from occupying most of the application pool.
            const [summary, pages, devices, languages, timezones, preferences, paths, events, recent] = await Promise.all([
                analyticsClient.query(`
                    SELECT
                        COUNT(DISTINCT session_id)::integer AS sessions,
                        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::integer AS users,
                        COUNT(*)::integer AS page_views,
                        COALESCE(ROUND(AVG(active_ms) / 1000.0), 0)::integer AS avg_active_seconds,
                        COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY active_ms) / 1000.0), 0)::integer AS median_active_seconds,
                        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE active_ms < 10000) / NULLIF(COUNT(*), 0), 1), 0) AS short_visit_rate
                    FROM ux_page_views
                    WHERE entered_at >= NOW() - $1::interval
                `, [interval]),
                analyticsClient.query(`
                    SELECT route,
                           COUNT(*)::integer AS views,
                           COUNT(DISTINCT session_id)::integer AS sessions,
                           COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::integer AS users,
                           COALESCE(ROUND(AVG(active_ms) / 1000.0), 0)::integer AS avg_active_seconds,
                           COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY active_ms) / 1000.0), 0)::integer AS median_active_seconds,
                           COALESCE(ROUND(AVG(max_scroll_percent)), 0)::integer AS avg_scroll_percent,
                           COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE active_ms < 10000) / NULLIF(COUNT(*), 0), 1), 0) AS short_visit_rate
                    FROM ux_page_views
                    WHERE entered_at >= NOW() - $1::interval
                    GROUP BY route
                    ORDER BY views DESC, route
                    LIMIT 30
                `, [interval]),
                analyticsClient.query(`
                    SELECT device_type AS label, COUNT(*)::integer AS sessions
                    FROM ux_sessions
                    WHERE started_at >= NOW() - $1::interval
                    GROUP BY device_type ORDER BY sessions DESC
                `, [interval]),
                analyticsClient.query(`
                    SELECT COALESCE(browser_language, 'unknown') AS label,
                           COUNT(*)::integer AS sessions
                    FROM ux_sessions
                    WHERE started_at >= NOW() - $1::interval
                    GROUP BY browser_language ORDER BY sessions DESC LIMIT 12
                `, [interval]),
                analyticsClient.query(`
                    SELECT COALESCE(timezone, 'unknown') AS label,
                           COUNT(*)::integer AS sessions
                    FROM ux_sessions
                    WHERE started_at >= NOW() - $1::interval
                    GROUP BY timezone ORDER BY sessions DESC LIMIT 12
                `, [interval]),
                analyticsClient.query(`
                    SELECT color_scheme,
                           reduced_motion,
                           high_contrast,
                           connection_type,
                           save_data,
                           COUNT(*)::integer AS sessions
                    FROM ux_sessions
                    WHERE started_at >= NOW() - $1::interval
                    GROUP BY color_scheme, reduced_motion, high_contrast, connection_type, save_data
                    ORDER BY sessions DESC LIMIT 20
                `, [interval]),
                analyticsClient.query(`
                    WITH ordered AS (
                        SELECT session_id, route,
                               LEAD(route) OVER (PARTITION BY session_id ORDER BY entered_at, id) AS next_route
                        FROM ux_page_views
                        WHERE entered_at >= NOW() - $1::interval
                    )
                    SELECT route AS from_route, next_route AS to_route,
                           COUNT(*)::integer AS transitions
                    FROM ordered
                    WHERE next_route IS NOT NULL AND next_route <> route
                    GROUP BY route, next_route
                    ORDER BY transitions DESC, route, next_route
                    LIMIT 20
                `, [interval]),
                analyticsClient.query(`
                    SELECT event_type, COALESCE(element_name, '-') AS element_name,
                           COUNT(*)::integer AS events
                    FROM ux_events
                    WHERE occurred_at >= NOW() - $1::interval
                    GROUP BY event_type, element_name
                    ORDER BY events DESC, event_type
                    LIMIT 30
                `, [interval]),
                analyticsClient.query(`
                    SELECT COALESCE(users.username, 'anonymous') AS username,
                           page.route,
                           ROUND(page.active_ms / 1000.0)::integer AS active_seconds,
                           page.max_scroll_percent,
                           sessions.device_type,
                           sessions.platform,
                           sessions.viewport_width,
                           sessions.viewport_height,
                           sessions.browser_language,
                           sessions.timezone,
                           sessions.color_scheme,
                           sessions.connection_type,
                           page.entered_at
                    FROM ux_page_views AS page
                    JOIN ux_sessions AS sessions ON sessions.id = page.session_id
                    LEFT JOIN users ON users.id = page.user_id
                    WHERE page.entered_at >= NOW() - $1::interval
                    ORDER BY page.entered_at DESC
                    LIMIT 50
                `, [interval])
            ]);
            await analyticsClient.query('COMMIT');

            res.render('admin-analytics', {
                title: res.locals.lang === 'zh' ? 'UX 分析' : 'UX analytics',
                user: req.session.user,
                csrfToken: req.session.csrfToken,
                days,
                analytics: {
                    summary: summary.rows[0],
                    pages: pages.rows,
                    devices: devices.rows,
                    languages: languages.rows,
                    timezones: timezones.rows,
                    preferences: preferences.rows,
                    paths: paths.rows,
                    events: events.rows,
                    recent: recent.rows
                }
            });
        } catch (error) {
            if (analyticsClient) await analyticsClient.query('ROLLBACK').catch(() => {});
            console.error('UX分析报表加载失败:', error);
            res.status(500).send(res.locals.lang === 'zh' ? 'UX 分析加载失败' : 'Failed to load UX analytics');
        } finally {
            analyticsClient?.release();
        }
    });
};
