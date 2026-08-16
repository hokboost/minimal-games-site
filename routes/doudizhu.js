'use strict';

const { randomInt, randomUUID } = require('node:crypto');
const { isTaskCardPilotUser } = require('../domain/quests/eligibility');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF_BODY_KEYS = Object.freeze(['csrfToken', '_csrf']);
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const MAX_PRIVATE_STATE_BYTES = 512 * 1024;
const ENGINE_ERROR_CONTRACT = new Map([
    ['AI_BUDGET_EXCEEDED', { status: 503, code: 'AI_BUDGET_EXCEEDED', message: '人机思考超时，请重试' }],
    ['AI_DEADLINE_EXCEEDED', { status: 503, code: 'AI_BUDGET_EXCEEDED', message: '人机思考超时，请重试' }],
    ['CARD_NOT_OWNED', { status: 409, code: 'CARDS_NOT_OWNED', message: '手牌状态已变化，请刷新后重试' }],
    ['DUPLICATE_CARD', { status: 400, code: 'INVALID_ACTION', message: '同一张牌不能重复选择' }],
    ['GAME_FINISHED', { status: 409, code: 'GAME_FINISHED', message: '游戏已结束' }],
    ['ILLEGAL_BID', { status: 409, code: 'INVALID_BID', message: '当前叫分无效' }],
    ['LEADER_CANNOT_PASS', { status: 409, code: 'CANNOT_PASS', message: '本轮先手不能不出' }],
    ['MOVE_DOES_NOT_BEAT', { status: 409, code: 'CANNOT_BEAT', message: '所选牌无法压过当前牌型' }],
    ['OUT_OF_TURN', { status: 409, code: 'NOT_YOUR_TURN', message: '当前未轮到你操作' }],
    ['WRONG_PHASE', { status: 409, code: 'INVALID_ACTION', message: '当前阶段不能执行此操作' }]
]);

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value, allowedKeys) {
    return isPlainObject(value)
        && Object.keys(value).every((key) => allowedKeys.has(key));
}

function isRevision(value) {
    return Number.isSafeInteger(value) && value >= 0 && value < POSTGRES_INTEGER_MAX;
}

function isCardId(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= 32
        && !/[\u0000-\u001f\u007f]/.test(value);
}

function secureRandomUnit() {
    return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}

module.exports = function registerDoudizhuRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const engine = require('../domain/games/doudizhu');
    const {
        pool,
        gameRegistry,
        generateCSRFToken,
        requireLogin,
        requireAuthorized,
        requireCSRF,
        security,
        paidActionConcurrencyGuard,
        questService
    } = deps;

    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
        throw new TypeError('Doudizhu routes require a database pool');
    }
    if (!gameRegistry
        || typeof gameRegistry.getPublicDoudizhuConfig !== 'function'
        || !gameRegistry.DOUDIZHU_CONFIG) {
        throw new TypeError('Doudizhu routes require the game registry');
    }
    if (!questService
        || typeof questService.ensurePilotAssignments !== 'function'
        || typeof questService.recordProgressEvent !== 'function') {
        throw new TypeError('Doudizhu routes require the quest application service');
    }
    requireFunction({ generateCSRFToken }, 'generateCSRFToken', 'route dependency');
    requireFunction({ requireLogin }, 'requireLogin', 'route dependency');
    requireFunction({ requireAuthorized }, 'requireAuthorized', 'route dependency');

    const createGame = requireFunction(engine, 'createGame', 'doudizhu engine');
    const applyCommand = requireFunction(engine, 'applyCommand', 'doudizhu engine');
    const advanceBots = requireFunction(engine, 'advanceBots', 'doudizhu engine');
    const projectState = requireFunction(engine, 'projectState', 'doudizhu engine');
    const suggestMove = requireFunction(engine, 'suggestMove', 'doudizhu engine');
    const ruleProfile = engine.RULE_PROFILE;
    const serverConfig = gameRegistry.DOUDIZHU_CONFIG;
    const rulesVersion = String(ruleProfile?.version || ruleProfile?.id || '');
    if (!rulesVersion || rulesVersion !== serverConfig.rulesVersion) {
        throw new Error('Doudizhu engine and registry rules versions do not match');
    }

    const userActionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrfProtection = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const rejectWhenOverloaded = requireFunction(
        { paidActionConcurrencyGuard },
        'paidActionConcurrencyGuard',
        'route dependency'
    );

    const botOptions = Object.freeze({
        rng: secureRandomUnit,
        maxNodes: serverConfig.aiNodeBudget,
        deadlineMs: serverConfig.aiDeadlineMs,
        maxActions: serverConfig.maxBotActionsPerRequest
    });
    const hintOptions = Object.freeze({
        rng: secureRandomUnit,
        maxNodes: serverConfig.aiNodeBudget,
        deadlineMs: serverConfig.aiDeadlineMs
    });

    function apiError(res, status, code, message, extra = undefined) {
        return res.status(status).json({
            success: false,
            code,
            message,
            ...(extra || {})
        });
    }

    function preventPrivateCaching(res) {
        res.set('Cache-Control', 'private, no-store');
        res.set('Pragma', 'no-cache');
    }

    function engineErrorResponse(res, error) {
        const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,48}$/.test(error.code)
            ? error.code
            : null;
        if (!code) return null;
        const contract = ENGINE_ERROR_CONTRACT.get(code);
        if (contract) {
            return apiError(res, contract.status, contract.code, contract.message);
        }
        if (/^(INVALID_|MALFORMED_|UNKNOWN_)/.test(code)) {
            return apiError(res, 400, code, '游戏操作参数无效');
        }
        if (/^(ILLEGAL_|NOT_|BID_|PLAY_|PASS_|TURN_|PHASE_|GAME_)/.test(code)) {
            return apiError(res, 409, code, '操作不符合当前游戏状态或规则');
        }
        return null;
    }

    function parseStoredState(value) {
        if (typeof value !== 'string') return value;
        return JSON.parse(value);
    }

    function validatePrivateState(state) {
        if (!isPlainObject(state)
            || !['bidding', 'playing', 'finished'].includes(state.phase)
            || !isRevision(state.revision)
            || !Number.isInteger(state.humanSeat)
            || state.humanSeat < 0
            || state.humanSeat >= serverConfig.playerCount
            || state.rulesVersion !== rulesVersion) {
            const error = new Error('Doudizhu engine produced invalid private state');
            error.code = 'DOUDIZHU_STATE_INVALID';
            throw error;
        }
        return state;
    }

    function normalizeRow(row) {
        if (!row) return null;
        const state = validatePrivateState(parseStoredState(row.state));
        const revision = Number(row.revision);
        if (!isRevision(revision)
            || state.revision !== revision
            || row.rules_version !== rulesVersion) {
            const error = new Error('Doudizhu database revision does not match state');
            error.code = 'DOUDIZHU_STATE_INVALID';
            throw error;
        }
        return { ...row, revision, state };
    }

    function publicState(gameId, privateState) {
        const state = validatePrivateState(privateState);
        const projected = projectState(state, state.humanSeat);
        if (!isPlainObject(projected) || projected.revision !== state.revision) {
            const error = new Error('Doudizhu engine produced invalid public projection');
            error.code = 'DOUDIZHU_PROJECTION_INVALID';
            throw error;
        }
        return {
            ...projected,
            gameId: String(gameId)
        };
    }

    function persistenceFields(privateState) {
        const state = validatePrivateState(privateState);
        const humanRole = Number.isInteger(state.landlordSeat)
            ? (state.humanSeat === state.landlordSeat ? 'landlord' : 'farmer')
            : null;
        const finished = state.phase === 'finished';
        const humanTeam = humanRole === 'landlord' ? 'landlord' : 'farmers';
        const outcome = finished
            ? (state.winner?.team === humanTeam ? 'win' : 'loss')
            : null;
        const scoreDelta = finished ? state.score?.deltas?.[state.humanSeat] : null;
        const contractBid = state.score?.contractBid ?? state.contractBid;
        const multiplier = state.score?.multiplier ?? state.multiplier;
        const baseScore = Number.isSafeInteger(contractBid) && contractBid > 0 ? contractBid : 1;
        const storedMultiplier = Number.isSafeInteger(multiplier) && multiplier > 0 ? multiplier : 1;

        if ((finished && (!humanRole
                || !['landlord', 'farmers'].includes(state.winner?.team)
                || !Number.isSafeInteger(scoreDelta)))
            || !Number.isSafeInteger(baseScore)
            || baseScore > POSTGRES_INTEGER_MAX
            || !Number.isSafeInteger(storedMultiplier)
            || storedMultiplier > POSTGRES_INTEGER_MAX
            || (scoreDelta !== null
                && (scoreDelta < -POSTGRES_INTEGER_MAX || scoreDelta > POSTGRES_INTEGER_MAX))) {
            const error = new Error('Doudizhu engine produced invalid settlement');
            error.code = 'DOUDIZHU_SETTLEMENT_INVALID';
            throw error;
        }

        return {
            status: finished ? 'finished' : 'active',
            phase: state.phase,
            revision: state.revision,
            humanRole,
            outcome,
            scoreDelta,
            baseScore,
            multiplier: storedMultiplier
        };
    }

    function serializePrivateState(privateState) {
        validatePrivateState(privateState);
        const serialized = JSON.stringify(privateState);
        if (Buffer.byteLength(serialized, 'utf8') > MAX_PRIVATE_STATE_BYTES) {
            const error = new Error('Doudizhu private state exceeded its storage limit');
            error.code = 'DOUDIZHU_STATE_TOO_LARGE';
            throw error;
        }
        return serialized;
    }

    function normalizeTransition(result, operation) {
        if (!isPlainObject(result) || !isPlainObject(result.state)) {
            const error = new Error(`Doudizhu ${operation} returned an invalid transition`);
            error.code = 'DOUDIZHU_TRANSITION_INVALID';
            throw error;
        }
        return validatePrivateState(result.state);
    }

    function normalizeBotTransition(result) {
        const state = normalizeTransition(result, 'bot advancement');
        if (state.phase !== 'finished' && state.turnSeat !== state.humanSeat) {
            const error = new Error('Doudizhu bot advancement stopped before the human turn');
            error.code = 'AI_BUDGET_EXCEEDED';
            throw error;
        }
        return state;
    }

    async function findGameById(username, gameId, queryable = pool) {
        const result = await queryable.query(`
            SELECT id, username, status, phase, state, revision, rules_version,
                   human_role, outcome, score_delta, base_score, multiplier,
                   created_at, updated_at, finished_at
            FROM doudizhu_games
            WHERE id = $1 AND username = $2
        `, [gameId, username]);
        return normalizeRow(result.rows[0] || null);
    }

    async function findActiveGame(username, queryable = pool) {
        const result = await queryable.query(`
            SELECT id, username, status, phase, state, revision, rules_version,
                   human_role, outcome, score_delta, base_score, multiplier,
                   created_at, updated_at, finished_at
            FROM doudizhu_games
            WHERE username = $1 AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        `, [username]);
        return normalizeRow(result.rows[0] || null);
    }

    function validateGameReference(body, allowedBusinessKeys) {
        const allowedKeys = new Set([...allowedBusinessKeys, ...CSRF_BODY_KEYS]);
        if (!hasOnlyKeys(body, allowedKeys)
            || typeof body.gameId !== 'string'
            || !UUID_PATTERN.test(body.gameId)
            || !isRevision(body.expectedRevision)) {
            return null;
        }
        return {
            gameId: body.gameId.toLowerCase(),
            expectedRevision: body.expectedRevision
        };
    }

    function validateActionBody(body) {
        const reference = validateGameReference(
            body,
            ['gameId', 'expectedRevision', 'type', 'bid', 'cardIds']
        );
        if (!reference || !['bid', 'play', 'pass'].includes(body.type)) return null;

        if (body.type === 'bid') {
            if (!Number.isInteger(body.bid)
                || body.bid < 0
                || body.bid > serverConfig.maximumBid
                || Object.hasOwn(body, 'cardIds')) return null;
            return { ...reference, command: { type: 'bid', bid: body.bid } };
        }

        if (body.type === 'play') {
            if (Object.hasOwn(body, 'bid')
                || !Array.isArray(body.cardIds)
                || body.cardIds.length < 1
                || body.cardIds.length > serverConfig.maximumSelectedCards
                || !body.cardIds.every(isCardId)
                || new Set(body.cardIds).size !== body.cardIds.length) return null;
            return { ...reference, command: { type: 'play', cardIds: [...body.cardIds] } };
        }

        if (Object.hasOwn(body, 'bid') || Object.hasOwn(body, 'cardIds')) return null;
        return { ...reference, command: { type: 'pass' } };
    }

    function sanitizeHint(command) {
        if (!isPlainObject(command) || !['bid', 'play', 'pass'].includes(command.type)) {
            const error = new Error('Doudizhu engine returned an invalid hint');
            error.code = 'DOUDIZHU_HINT_INVALID';
            throw error;
        }
        if (command.type === 'bid' && Number.isInteger(command.bid)) {
            return { type: 'bid', bid: command.bid };
        }
        if (command.type === 'play'
            && Array.isArray(command.cardIds)
            && command.cardIds.every(isCardId)
            && new Set(command.cardIds).size === command.cardIds.length) {
            return { type: 'play', cardIds: [...command.cardIds] };
        }
        if (command.type === 'pass') return { type: 'pass' };
        const error = new Error('Doudizhu engine returned an invalid hint payload');
        error.code = 'DOUDIZHU_HINT_INVALID';
        throw error;
    }

    function staleResponse(res, game) {
        return apiError(res, 409, 'STALE_REVISION', '游戏状态已更新，请刷新后重试', game ? {
            state: publicState(game.id, game.state)
        } : undefined);
    }

    app.get('/doudizhu', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        preventPrivateCaching(res);
        try {
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
            }
            if (!req.session.csrfSecret || !req.session.csrfToken) {
                generateCSRFToken(req);
            }
            const username = req.session.user.username;
            const activeGame = await findActiveGame(username);
            return res.render('doudizhu', {
                username,
                csrfToken: req.session.csrfToken,
                doudizhuConfig: gameRegistry.getPublicDoudizhuConfig(),
                initialState: activeGame ? publicState(activeGame.id, activeGame.state) : null
            });
        } catch (error) {
            console.error('Doudizhu page load failed:', error);
            return res.status(503).send('斗地主服务暂不可用');
        }
    });

    app.get('/api/doudizhu/state', requireLogin, requireAuthorized, basicRateLimit, readHeavyRateLimit, async (req, res) => {
        preventPrivateCaching(res);
        try {
            const activeGame = await findActiveGame(req.session.user.username);
            return res.json({
                success: true,
                state: activeGame ? publicState(activeGame.id, activeGame.state) : null
            });
        } catch (error) {
            console.error('Doudizhu state load failed:', error);
            return apiError(res, 503, 'DOUDIZHU_UNAVAILABLE', '斗地主服务暂不可用');
        }
    });

    app.post('/api/doudizhu/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        preventPrivateCaching(res);
        const allowedKeys = new Set(CSRF_BODY_KEYS);
        if (!hasOnlyKeys(req.body || {}, allowedKeys)) {
            return apiError(res, 400, 'INVALID_REQUEST', '开始游戏请求参数无效');
        }

        const username = req.session.user.username;
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '3s'");
            await client.query("SET LOCAL statement_timeout = '8s'");
            await client.query(
                'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
                [`doudizhu:${username}`]
            );
            await client.query(`
                UPDATE doudizhu_games
                SET status = 'abandoned', updated_at = NOW(), finished_at = NOW()
                WHERE username = $1 AND status = 'active'
            `, [username]);

            const created = validatePrivateState(createGame({ rng: secureRandomUnit }));
            const privateState = normalizeBotTransition(advanceBots(created, botOptions));
            const gameId = randomUUID();
            const fields = persistenceFields(privateState);
            await client.query(`
                INSERT INTO doudizhu_games (
                    id, username, status, phase, state, revision, rules_version,
                    human_role, outcome, score_delta, base_score, multiplier,
                    created_at, updated_at, finished_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, $12,
                    NOW(), NOW(), CASE WHEN $3 = 'finished' THEN NOW() ELSE NULL END
                )
            `, [
                gameId,
                username,
                fields.status,
                fields.phase,
                serializePrivateState(privateState),
                fields.revision,
                rulesVersion,
                fields.humanRole,
                fields.outcome,
                fields.scoreDelta,
                fields.baseScore,
                fields.multiplier
            ]);
            const responseBody = {
                success: true,
                state: publicState(gameId, privateState)
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            const handled = engineErrorResponse(res, error);
            if (handled) return handled;
            console.error('Doudizhu start failed:', error);
            return apiError(res, 503, 'DOUDIZHU_UNAVAILABLE', '斗地主服务暂不可用');
        } finally {
            client?.release();
        }
    });

    app.post('/api/doudizhu/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        preventPrivateCaching(res);
        const parsed = validateActionBody(req.body || {});
        if (!parsed) {
            return apiError(res, 400, 'INVALID_REQUEST', '游戏操作参数无效');
        }

        const username = req.session.user.username;
        let client;
        try {
            const game = await findGameById(username, parsed.gameId);
            if (!game) {
                return apiError(res, 404, 'GAME_NOT_FOUND', '游戏不存在');
            }
            if (game.status !== 'active') {
                return apiError(res, 409, 'GAME_NOT_ACTIVE', '游戏已结束', {
                    state: publicState(game.id, game.state)
                });
            }
            if (game.revision !== parsed.expectedRevision) {
                return staleResponse(res, game);
            }

            const humanCommand = {
                ...parsed.command,
                seat: game.state.humanSeat
            };
            const afterHuman = normalizeTransition(
                applyCommand(game.state, humanCommand, { rng: secureRandomUnit }),
                'human command'
            );
            const privateState = normalizeBotTransition(advanceBots(afterHuman, botOptions));
            if (privateState.revision <= parsed.expectedRevision) {
                throw Object.assign(new Error('Doudizhu revision did not advance'), {
                    code: 'DOUDIZHU_REVISION_INVALID'
                });
            }
            const fields = persistenceFields(privateState);
            const responseBody = {
                success: true,
                state: publicState(game.id, privateState)
            };

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '3s'");
            await client.query("SET LOCAL statement_timeout = '8s'");
            const updated = await client.query(`
                UPDATE doudizhu_games
                SET status = $4,
                    phase = $5,
                    state = $6,
                    revision = $7,
                    human_role = $8,
                    outcome = $9,
                    score_delta = $10,
                    base_score = $11,
                    multiplier = $12,
                    updated_at = NOW(),
                    finished_at = CASE WHEN $4 = 'finished' THEN NOW() ELSE NULL END
                WHERE id = $1
                  AND username = $2
                  AND status = 'active'
                  AND revision = $3
                RETURNING id, finished_at
            `, [
                game.id,
                username,
                parsed.expectedRevision,
                fields.status,
                fields.phase,
                serializePrivateState(privateState),
                fields.revision,
                fields.humanRole,
                fields.outcome,
                fields.scoreDelta,
                fields.baseScore,
                fields.multiplier
            ]);
            if (updated.rowCount !== 1) {
                await client.query('ROLLBACK');
                const current = await findGameById(username, game.id, client);
                return staleResponse(res, current);
            }

            let questProgress = null;
            if (fields.status === 'finished' && fields.outcome === 'win') {
                await questService.ensurePilotAssignments(client, username, isTaskCardPilotUser(username));
                questProgress = await questService.recordProgressEvent(client, {
                    sourceType: 'doudizhu',
                    sourceEventId: `doudizhu-game:${String(game.id)}`,
                    username,
                    eventType: 'doudizhu.match.won',
                    eventVersion: 1,
                    occurredAt: updated.rows[0].finished_at,
                    payload: {
                        gameId: String(game.id),
                        rulesVersion,
                        humanRole: fields.humanRole,
                        scoreDelta: fields.scoreDelta,
                        baseScore: fields.baseScore,
                        multiplier: fields.multiplier
                    }
                }, {
                    requestId: req.idempotencyKey || req.requestId,
                    ipAddress: req.clientIP,
                    userAgent: req.get('User-Agent')
                });
            }
            responseBody.questProgress = questProgress;

            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            const handled = engineErrorResponse(res, error);
            if (handled) return handled;
            console.error('Doudizhu action failed:', error);
            return apiError(res, 503, 'DOUDIZHU_UNAVAILABLE', '斗地主服务暂不可用');
        } finally {
            client?.release();
        }
    });

    app.post('/api/doudizhu/hint', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        preventPrivateCaching(res);
        const parsed = validateGameReference(
            req.body || {},
            ['gameId', 'expectedRevision']
        );
        if (!parsed) {
            return apiError(res, 400, 'INVALID_REQUEST', '提示请求参数无效');
        }

        try {
            const game = await findGameById(req.session.user.username, parsed.gameId);
            if (!game) {
                return apiError(res, 404, 'GAME_NOT_FOUND', '游戏不存在');
            }
            if (game.status !== 'active') {
                return apiError(res, 409, 'GAME_NOT_ACTIVE', '游戏已结束', {
                    state: publicState(game.id, game.state)
                });
            }
            if (game.revision !== parsed.expectedRevision) {
                return staleResponse(res, game);
            }
            const hint = sanitizeHint(suggestMove(
                game.state,
                game.state.humanSeat,
                hintOptions
            ));
            return res.json({
                success: true,
                state: publicState(game.id, game.state),
                hint
            });
        } catch (error) {
            const handled = engineErrorResponse(res, error);
            if (handled) return handled;
            console.error('Doudizhu hint failed:', error);
            return apiError(res, 503, 'DOUDIZHU_UNAVAILABLE', '斗地主服务暂不可用');
        }
    });
};
