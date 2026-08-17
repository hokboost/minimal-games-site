'use strict';

const requireFunction = require('../lib/require-function');
const packs = require('../content/streamer-world/games/batch-one');
const { StreamerGameServiceError } = require('../services/streamer-game-service');

const GAME_SPECS = Object.freeze([
    ['constellation-repair', '/constellation-repair', '/api/constellation-repair/start', '/api/constellation-repair/action'],
    ['signal-duet', '/signal-duet', '/api/signal-duet/start', '/api/signal-duet/action'],
    ['mystery-board', '/mystery-board', '/api/mystery-board/start', '/api/mystery-board/action'],
    ['story-weaver', '/story-weaver', '/api/story-weaver/start', '/api/story-weaver/action'],
    ['studio-crafting', '/studio-crafting', '/api/studio-crafting/start', '/api/studio-crafting/action']
].map(([gameId, pagePath, startPath, actionPath]) => Object.freeze({ gameId, pagePath, startPath, actionPath })));

module.exports = function registerStreamerGameRoutes(app, deps) {
    const { streamerGameService, streamerWorldFlags, generateCSRFToken, requireLogin,
        requireAuthorized, requireCSRF, security, paidActionConcurrencyGuard } = deps;
    if (!streamerGameService?.state || !streamerWorldFlags) throw new TypeError('Streamer game routes require service and flags');
    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const userActionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const rejectWhenOverloaded = requireFunction(
        { paidActionConcurrencyGuard },
        'paidActionConcurrencyGuard',
        'route dependency'
    );
    const csrfProtection = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const reads = [requireLogin, requireAuthorized, readHeavy];
    const enabled = (req, res, next) => streamerWorldFlags.newGamesEnabled ? next()
        : req.path.startsWith('/api/') ? res.status(404).json({ success: false, code: 'FEATURE_DISABLED' })
            : res.status(404).send(res.locals.lang === 'zh' ? '新游戏尚未开放' : 'New games are not available');
    const context = req => ({ requestId: req.requestId, finalizeIdempotency: req.finalizeIdempotency });

    function fail(error, res) {
        if (error instanceof StreamerGameServiceError) return res.status(error.status).json({
            success: false, code: error.code, message: error.message
        });
        if (error instanceof TypeError) return res.status(400).json({
            success: false, code: 'GAME_INVALID_INPUT', message: error.message
        });
        if (error?.code === '23505') return res.status(409).json({
            success: false, code: 'GAME_ACTIVE_RUN_EXISTS', message: 'An active run already exists'
        });
        console.error('Streamer game route failed:', error);
        return res.status(503).json({ success: false, code: 'GAME_SERVICE_UNAVAILABLE', message: 'Game unavailable' });
    }

    for (const spec of GAME_SPECS) {
        app.get(spec.pagePath, ...reads, enabled, async (req, res) => {
            try {
                const state = await streamerGameService.state(req.session.user.username, spec.gameId, req.query.runId || null);
                res.set('Cache-Control', 'private, no-store');
                return res.render('streamer-game', {
                    title: res.locals.lang === 'zh' ? packs[spec.gameId].challenges[0].titleZh : packs[spec.gameId].challenges[0].titleEn,
                    user: req.session.user,
                    balance: null,
                    csrfToken: generateCSRFToken(req),
                    gameId: spec.gameId,
                    pack: { gameId: spec.gameId, version: packs[spec.gameId].version,
                        challenges: packs[spec.gameId].challenges.map(challenge => ({ id: challenge.id,
                            titleZh: challenge.titleZh, titleEn: challenge.titleEn,
                            briefZh: challenge.briefZh, briefEn: challenge.briefEn })) },
                    state
                });
            } catch (error) {
                console.error('Streamer game page failed:', error);
                return res.status(503).send(res.locals.lang === 'zh' ? '游戏暂时无法加载' : 'Game temporarily unavailable');
            }
        });
        app.get(`/api/${spec.gameId}/state`, ...reads, enabled, async (req, res) => {
            try {
                res.set('Cache-Control', 'private, no-store');
                return res.json(await streamerGameService.state(req.session.user.username, spec.gameId, req.query.runId || null));
            } catch (error) {
                return fail(error, res);
            }
        });
    }

    const startHandler = gameId => async (req, res) => {
            try {
                return res.status(201).json(await streamerGameService.start(req.session.user.username,
                    gameId, req.body, context(req)));
            } catch (error) {
                return fail(error, res);
            }
        };
    const actionHandler = gameId => async (req, res) => {
            try {
                return res.json(await streamerGameService.action(req.session.user.username,
                    gameId, req.body, context(req)));
            } catch (error) {
                return fail(error, res);
            }
        };

    app.post('/api/constellation-repair/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => startHandler('constellation-repair')(req, res));
    app.post('/api/constellation-repair/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => actionHandler('constellation-repair')(req, res));
    app.post('/api/signal-duet/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => startHandler('signal-duet')(req, res));
    app.post('/api/signal-duet/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => actionHandler('signal-duet')(req, res));
    app.post('/api/mystery-board/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => startHandler('mystery-board')(req, res));
    app.post('/api/mystery-board/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => actionHandler('mystery-board')(req, res));
    app.post('/api/story-weaver/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => startHandler('story-weaver')(req, res));
    app.post('/api/story-weaver/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => actionHandler('story-weaver')(req, res));
    app.post('/api/studio-crafting/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => startHandler('studio-crafting')(req, res));
    app.post('/api/studio-crafting/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, enabled, async (req, res) => actionHandler('studio-crafting')(req, res));
};

module.exports.GAME_SPECS = GAME_SPECS;
