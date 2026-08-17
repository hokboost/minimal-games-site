'use strict';

const {
    LiveProtocolError
} = require('../domain/live-interactions/protocol');
const {
    LiveInteractionServiceError
} = require('../services/live-interaction-service');

module.exports = function registerLiveInteractionRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const {
        liveInteractionService,
        streamerWorldFlags,
        generateCSRFToken,
        requireLogin,
        requireAuthorized,
        requireCSRF,
        security
    } = deps;
    if (!liveInteractionService?.state || !streamerWorldFlags) throw new TypeError(
        'Live interaction routes require service and flags');
    const basic = requireFunction(security, 'basicRateLimit', 'security middleware');
    const action = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrf = requireFunction({
        requireCSRF
    }, 'requireCSRF', 'route dependency');
    const reads = [requireLogin, requireAuthorized, readHeavy];
    const writes = [requireLogin, requireAuthorized, basic, action, csrf];
    const enabled = (req, res, next) => streamerWorldFlags.liveInteractionsEnabled ? next() : (req.path.startsWith(
            '/api/') ? res.status(404).json({
            success: false,
            code: 'FEATURE_DISABLED',
            message: 'Feature unavailable'
        }) : res.status(404).send(res.locals.lang === 'zh' ? '实时互动尚未开放' :
        'Live interactions are not available'));
    const context = req => ({
        requestId: req.requestId,
        finalizeIdempotency: req.finalizeIdempotency
    });

    function fail(error, res) {
        if (error instanceof LiveProtocolError) return res.status(400).json({
            success: false,
            code: error.code,
            field: error.field,
            message: error.message
        });
        if (error instanceof LiveInteractionServiceError) return res.status(error.status).json({
            success: false,
            code: error.code,
            message: error.message
        });
        if (error?.code === '23505') return res.status(409).json({
            success: false,
            code: 'LIVE_STATE_CONFLICT',
            message: 'Interaction changed concurrently'
        });
        console.error('Live interaction route failed:', error);
        return res.status(503).json({
            success: false,
            code: 'LIVE_SERVICE_UNAVAILABLE',
            message: 'Live interaction service unavailable'
        });
    }
    app.get('/live-room', ...reads, enabled, async (req, res) => {
        try {
            const state = await liveInteractionService.state(req.session.user.username, req.query
                .interactionId);
            res.set('Cache-Control', 'private, no-store');
            return res.render('live-room', {
                title: res.locals.lang === 'zh' ? '实时联络室' : 'Live Relay Room',
                user: req.session.user,
                balance: null,
                csrfToken: generateCSRFToken(req),
                state
            });
        } catch (error) {
            console.error('Live room failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '联络室暂时无法加载' :
                'Live room is temporarily unavailable');
        }
    });
    app.get('/api/live/state', ...reads, enabled, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.json(await liveInteractionService.state(req.session.user.username, req.query
                .interactionId));
        } catch (error) {
            return fail(error, res);
        }
    });
    app.get('/api/live/events', ...reads, enabled, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.json(await liveInteractionService.catchUp(req.session.user.username, req.query));
        } catch (error) {
            return fail(error, res);
        }
    });
    const handler = (fn, status = 200) => async (req, res) => {
        try {
            const body = await fn(req.session.user.username, req.body, context(req));
            return res.status(status).json(body);
        } catch (error) {
            return fail(error, res);
        }
    };
    app.post('/api/live/items/accept', ...writes, enabled, handler((u, b, c) => liveInteractionService.itemAction(u,
        b, 'accept', c)));
    app.post('/api/live/items/decline', ...writes, enabled, handler((u, b, c) => liveInteractionService.itemAction(
        u, b, 'decline', c)));
    app.post('/api/live/polls/vote', ...writes, enabled, handler((u, b, c) => liveInteractionService.itemAction(u,
        b, 'vote', c)));
    app.post('/api/live/presence', ...writes, enabled, handler((u, b, c) => liveInteractionService.creatorAction(u,
        b, 'availability', c)));
    app.post('/api/live/mute', ...writes, enabled, handler((u, b, c) => liveInteractionService.creatorAction(u, b,
        'mute', c)));
    app.post('/api/live/leave', ...writes, enabled, handler((u, b, c) => liveInteractionService.creatorAction(u, b,
        'leave', c)));
    app.post('/api/live/report', ...writes, enabled, handler((u, b, c) => liveInteractionService.report(u, b, c),
        201));
    app.post('/api/live/reconsent', ...writes, enabled, handler((u, b, c) => liveInteractionService.reconsent(u, b,
        c)));
    app.post('/api/live/ack', ...writes, enabled, handler((u, b) => liveInteractionService.acknowledge(u, b)));
};
