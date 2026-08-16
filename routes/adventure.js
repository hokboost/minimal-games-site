'use strict';

const { randomUUID } = require('node:crypto');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF_KEYS = new Set(['csrfToken', '_csrf']);
const MAX_STATE_BYTES = 256 * 1024;

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function onlyKeys(value, allowed) {
    return isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

module.exports = function registerAdventureRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const engine = require('../domain/games/adventure');
    const {
        pool,
        BalanceLogger,
        generateCSRFToken,
        requireLogin,
        requireAuthorized,
        requireCSRF,
        security,
        paidActionConcurrencyGuard,
        adventureConfig
    } = deps;

    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
        throw new TypeError('Adventure routes require a database pool');
    }
    if (!BalanceLogger || typeof BalanceLogger.updateBalance !== 'function') {
        throw new TypeError('Adventure routes require the balance ledger');
    }
    const config = adventureConfig;
    if (!config || typeof config.contentVersion !== 'string' || !config.contentVersion) {
        throw new TypeError('Adventure routes require a valid configuration');
    }
    if (config.contentVersion !== require('../domain/games/configuration').ADVENTURE_CONFIG.contentVersion) {
        throw new Error('Adventure route and engine content versions do not match');
    }

    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const userActionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrfProtection = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const rejectWhenOverloaded = requireFunction(
        { paidActionConcurrencyGuard },
        'paidActionConcurrencyGuard',
        'route dependency'
    );
    requireFunction({ generateCSRFToken }, 'generateCSRFToken', 'route dependency');

    const noStore = (res) => {
        res.set('Cache-Control', 'private, no-store');
        res.set('Pragma', 'no-cache');
    };

    const apiError = (res, status, code, message, extra = {}) => res.status(status).json({
        success: false,
        code,
        message,
        ...extra
    });

    function parseState(value) {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return engine.validateRun(parsed);
    }

    function serializeState(state) {
        engine.validateRun(state);
        const value = JSON.stringify(state);
        if (Buffer.byteLength(value, 'utf8') > MAX_STATE_BYTES) {
            throw Object.assign(new Error('Adventure state is too large'), { code: 'STATE_TOO_LARGE' });
        }
        return value;
    }

    function publicRun(row) {
        if (!row) return null;
        const state = parseState(row.state);
        if (Number(row.revision) !== state.revision || row.rules_version !== state.rulesVersion) {
            throw Object.assign(new Error('Adventure persistence state drifted'), { code: 'STATE_INVALID' });
        }
        return {
            ...engine.projectState(state),
            gameId: String(row.id),
            rewardEligible: Boolean(row.reward_eligible),
            expiresAt: row.expires_at
        };
    }

    async function loadActive(username, queryable = pool) {
        const result = await queryable.query(`
            SELECT id, state, revision, rules_version, reward_eligible, expires_at
            FROM adventure_runs
            WHERE username = $1 AND status = 'active' AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
        `, [username]);
        return result.rows[0] || null;
    }

    async function loadCompletedChapterIds(username, queryable = pool) {
        const result = await queryable.query(`
            SELECT chapter_id
            FROM adventure_completions
            WHERE username = $1 AND rules_version = $2
        `, [username, config.contentVersion]);
        return result.rows.map((row) => row.chapter_id);
    }

    async function statePayload(username, queryable = pool) {
        const [active, completedChapterIds] = await Promise.all([
            loadActive(username, queryable),
            loadCompletedChapterIds(username, queryable)
        ]);
        return {
            missions: engine.getMissionCatalog(),
            completedChapterIds,
            active: publicRun(active)
        };
    }

    function parseReference(body, extraKeys = []) {
        const allowed = new Set(['gameId', 'expectedRevision', ...extraKeys, ...CSRF_KEYS]);
        if (!onlyKeys(body, allowed)
            || typeof body.gameId !== 'string' || !UUID_PATTERN.test(body.gameId)
            || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) return null;
        return { gameId: body.gameId, expectedRevision: body.expectedRevision };
    }

    function parseActionBody(body) {
        const reference = parseReference(body, ['action']);
        if (!reference || !isPlainObject(body.action)) return null;
        const type = body.action.type;
        const allowedByType = {
            continue: new Set(['type']),
            answer: new Set(['type', 'answer']),
            code: new Set(['type', 'code']),
            sequence: new Set(['type', 'sequence']),
            choose: new Set(['type', 'choiceId'])
        };
        const allowed = allowedByType[type];
        if (!allowed || !onlyKeys(body.action, allowed)) return null;
        return { ...reference, action: body.action };
    }

    function handleEngineError(res, error) {
        if (!(error instanceof engine.AdventureRuleError)) return null;
        const conflictCodes = new Set(['RUN_FINISHED', 'NOT_ENOUGH_ENERGY']);
        return apiError(
            res,
            conflictCodes.has(error.code) ? 409 : 400,
            error.code,
            error.code === 'NOT_ENOUGH_ENERGY' ? '能量不足，请选择另一条路线' : '当前操作不符合关卡规则'
        );
    }

    app.get('/adventure', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        noStore(res);
        try {
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
                generateCSRFToken(req);
            }
            const initialAdventure = await statePayload(req.session.user.username);
            return res.render('adventure', {
                username: req.session.user.username,
                csrfToken: req.session.csrfToken,
                initialAdventure,
                adventureConfig: {
                    contentVersion: config.contentVersion,
                    maximumHearts: config.maximumHearts
                }
            });
        } catch (error) {
            console.error('Adventure page failed:', error);
            return res.status(503).send('闯关服务暂不可用');
        }
    });

    app.get('/api/adventure/state', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        noStore(res);
        try {
            return res.json({ success: true, state: await statePayload(req.session.user.username) });
        } catch (error) {
            console.error('Adventure state failed:', error);
            return apiError(res, 503, 'ADVENTURE_UNAVAILABLE', '闯关服务暂不可用');
        }
    });

    app.get('/api/adventure/leaderboard', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        noStore(res);
        try {
            const result = await pool.query(`
                SELECT username, COUNT(*)::integer AS chapters,
                       SUM(insight)::integer AS insight,
                       SUM(mistakes)::integer AS mistakes
                FROM adventure_completions
                WHERE rules_version = $1
                GROUP BY username
                ORDER BY chapters DESC, insight DESC, mistakes ASC, username ASC
                LIMIT 20
            `, [config.contentVersion]);
            return res.json({ success: true, players: result.rows.map((row) => ({
                username: row.username,
                chapters: Number(row.chapters),
                insight: Number(row.insight),
                mistakes: Number(row.mistakes)
            })) });
        } catch (error) {
            console.error('Adventure leaderboard failed:', error);
            return apiError(res, 503, 'ADVENTURE_UNAVAILABLE', '排行榜暂不可用');
        }
    });

    app.post('/api/adventure/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        noStore(res);
        const allowed = new Set(['chapterId', ...CSRF_KEYS]);
        if (!onlyKeys(req.body || {}, allowed)
            || typeof req.body.chapterId !== 'string'
            || !engine.getChapter(req.body.chapterId)) {
            return apiError(res, 400, 'INVALID_CHAPTER', '请选择有效章节');
        }
        const username = req.session.user.username;
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '3s'");
            await client.query("SET LOCAL statement_timeout = '8s'");
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`adventure:${username}`]);
            await client.query(`
                UPDATE adventure_runs
                SET status = 'expired', updated_at = NOW()
                WHERE username = $1 AND status = 'active' AND expires_at <= NOW()
            `, [username]);
            const existing = await loadActive(username, client);
            if (existing && parseState(existing.state).chapterId === req.body.chapterId) {
                const responseBody = { success: true, resumed: true, state: await statePayload(username, client) };
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');
                return res.json(responseBody);
            }
            if (existing) {
                await client.query(`
                    UPDATE adventure_runs
                    SET status = 'abandoned', abandoned_at = NOW(), updated_at = NOW()
                    WHERE id = $1 AND username = $2 AND status = 'active'
                `, [existing.id, username]);
            }
            const completed = await client.query(`
                SELECT 1 FROM adventure_completions
                WHERE username = $1 AND chapter_id = $2 AND rules_version = $3
            `, [username, req.body.chapterId, config.contentVersion]);
            const gameId = randomUUID();
            const state = engine.createRun(req.body.chapterId);
            await client.query(`
                INSERT INTO adventure_runs (
                    id, username, chapter_id, rules_version, status, revision, state,
                    reward_eligible, created_at, updated_at, expires_at
                ) VALUES ($1, $2, $3, $4, 'active', 0, $5, $6, NOW(), NOW(), NOW() + ($7 * INTERVAL '1 day'))
            `, [
                gameId,
                username,
                state.chapterId,
                state.rulesVersion,
                serializeState(state),
                completed.rowCount === 0,
                config.runExpiryDays
            ]);
            const responseBody = { success: true, resumed: false, state: await statePayload(username, client) };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            const handled = handleEngineError(res, error);
            if (handled) return handled;
            console.error('Adventure start failed:', error);
            return apiError(res, 503, 'ADVENTURE_UNAVAILABLE', '领取章节失败，请稍后重试');
        } finally {
            client?.release();
        }
    });

    app.post('/api/adventure/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        noStore(res);
        const parsed = parseActionBody(req.body || {});
        if (!parsed) return apiError(res, 400, 'INVALID_REQUEST', '关卡操作参数无效');
        const username = req.session.user.username;
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '3s'");
            await client.query("SET LOCAL statement_timeout = '8s'");
            const loaded = await client.query(`
                SELECT id, chapter_id, state, revision, rules_version, reward_eligible, expires_at
                FROM adventure_runs
                WHERE id = $1 AND username = $2 AND status = 'active' AND expires_at > NOW()
                FOR UPDATE
            `, [parsed.gameId, username]);
            const row = loaded.rows[0];
            if (!row) {
                await client.query('ROLLBACK');
                return apiError(res, 404, 'RUN_NOT_FOUND', '没有找到进行中的章节');
            }
            const previous = parseState(row.state);
            if (Number(row.revision) !== parsed.expectedRevision || previous.revision !== parsed.expectedRevision) {
                await client.query('ROLLBACK');
                return apiError(res, 409, 'STALE_REVISION', '进度已经变化，页面已刷新', {
                    state: await statePayload(username)
                });
            }
            const stageId = engine.getChapter(previous.chapterId).stages[previous.stageIndex].id;
            const next = engine.applyAction(previous, parsed.action);
            const completed = next.phase === 'completed';
            const updated = await client.query(`
                UPDATE adventure_runs
                SET state = $4, revision = $5,
                    status = CASE WHEN $6 THEN 'completed' ELSE 'active' END,
                    completed_at = CASE WHEN $6 THEN NOW() ELSE NULL END,
                    updated_at = NOW()
                WHERE id = $1 AND username = $2 AND status = 'active' AND revision = $3
                RETURNING id
            `, [row.id, username, parsed.expectedRevision, serializeState(next), next.revision, completed]);
            if (updated.rowCount !== 1) {
                await client.query('ROLLBACK');
                return apiError(res, 409, 'STALE_REVISION', '进度已经变化，请重试');
            }
            await client.query(`
                INSERT INTO adventure_events (
                    run_id, username, revision, stage_id, action_type, outcome
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                row.id,
                username,
                next.revision,
                stageId,
                parsed.action.type,
                next.feedback?.tone || 'updated'
            ]);

            let rewardEarned = 0;
            let balance = null;
            if (completed && row.reward_eligible) {
                const chapter = engine.getChapter(next.chapterId);
                const completion = await client.query(`
                    INSERT INTO adventure_completions (
                        run_id, username, chapter_id, rules_version, reward,
                        insight, mistakes, rewinds, completed_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                    ON CONFLICT (username, chapter_id, rules_version) DO NOTHING
                    RETURNING id
                `, [
                    row.id,
                    username,
                    next.chapterId,
                    next.rulesVersion,
                    chapter.reward,
                    next.insight,
                    next.stats.incorrect,
                    next.stats.rewinds
                ]);
                if (completion.rowCount === 1 && chapter.reward > 0) {
                    const balanceResult = await BalanceLogger.updateBalance({
                        username,
                        amount: chapter.reward,
                        operationType: 'adventure_reward',
                        description: `完成闯关章节：${chapter.titleZh}`,
                        gameData: { runId: row.id, chapterId: chapter.id, rulesVersion: next.rulesVersion },
                        ipAddress: req.clientIP,
                        userAgent: req.get('User-Agent'),
                        client,
                        managedTransaction: true,
                        requireSufficientBalance: false
                    });
                    if (!balanceResult.success) throw new Error('Adventure reward ledger update failed');
                    rewardEarned = chapter.reward;
                    balance = balanceResult.balance;
                }
            }
            const responseBody = {
                success: true,
                rewardEarned,
                balance,
                completion: completed ? { ...engine.projectState(next), gameId: row.id } : null,
                state: await statePayload(username, client)
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            const handled = handleEngineError(res, error);
            if (handled) return handled;
            console.error('Adventure action failed:', error);
            return apiError(res, 503, 'ADVENTURE_UNAVAILABLE', '关卡操作失败，请稍后重试');
        } finally {
            client?.release();
        }
    });

    app.post('/api/adventure/abandon', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        noStore(res);
        const parsed = parseReference(req.body || {});
        if (!parsed) return apiError(res, 400, 'INVALID_REQUEST', '放弃章节参数无效');
        const username = req.session.user.username;
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '3s'");
            await client.query("SET LOCAL statement_timeout = '8s'");
            const result = await client.query(`
                UPDATE adventure_runs
                SET status = 'abandoned', abandoned_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND username = $2 AND status = 'active' AND revision = $3
                RETURNING id
            `, [parsed.gameId, username, parsed.expectedRevision]);
            if (result.rowCount !== 1) {
                await client.query('ROLLBACK');
                return apiError(res, 409, 'STALE_REVISION', '进度已经变化，请刷新后重试');
            }
            const responseBody = { success: true, state: await statePayload(username, client) };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Adventure abandon failed:', error);
            return apiError(res, 503, 'ADVENTURE_UNAVAILABLE', '暂时无法放弃章节');
        } finally {
            client?.release();
        }
    });
};
