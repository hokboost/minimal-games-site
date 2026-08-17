'use strict';

const { CreatorValidationError } = require('../domain/creators/profile');
const { CreatorServiceError } = require('../services/creator-profile-service');

module.exports = function registerCreatorRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const {
        creatorService,
        streamerWorldFlags,
        generateCSRFToken,
        requireLogin,
        requireAuthorized,
        requireCSRF,
        security
    } = deps;
    if (!creatorService?.dashboard || !streamerWorldFlags) {
        throw new TypeError('Creator routes require service and feature flags');
    }
    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const userActionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrfProtection = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const readGuards = [requireLogin, requireAuthorized, readHeavyRateLimit];
    const writeGuards = [requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection];

    function enabled(req, res, next) {
        if (streamerWorldFlags.creatorFoundationEnabled) return next();
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ success: false, code: 'FEATURE_DISABLED', message: 'Feature unavailable' });
        }
        return res.status(404).send(res.locals.lang === 'zh' ? '主播世界尚未开放' : 'Creator World is not available');
    }

    function context(req) {
        return {
            requestId: req.requestId,
            finalizeIdempotency: req.finalizeIdempotency
        };
    }

    function localizeDashboard(dashboard, lang) {
        const zh = lang === 'zh';
        return {
            ...dashboard,
            memories: dashboard.memories.map((memory) => ({
                ...memory,
                title: zh ? memory.titleZh : memory.titleEn,
                body: zh ? memory.bodyZh : memory.bodyEn
            })),
            inbox: dashboard.inbox.map((message) => ({
                ...message,
                title: zh ? message.titleZh : message.titleEn,
                body: zh ? message.bodyZh : message.bodyEn
            }))
        };
    }

    function sendError(error, res) {
        if (error instanceof CreatorValidationError) {
            return res.status(400).json({ success: false, code: error.code, field: error.field, message: error.message });
        }
        if (error instanceof CreatorServiceError) {
            return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        }
        if (error?.code === '23505') {
            return res.status(409).json({ success: false, code: 'CREATOR_STATE_CONFLICT', message: 'State changed concurrently' });
        }
        console.error('Creator route failed:', error);
        return res.status(503).json({ success: false, code: 'CREATOR_SERVICE_UNAVAILABLE', message: 'Creator service unavailable' });
    }

    app.get('/creator', ...readGuards, enabled, async (req, res) => {
        try {
            const dashboard = localizeDashboard(
                await creatorService.dashboard(req.session.user.username),
                res.locals.lang
            );
            res.set('Cache-Control', 'private, no-store');
            return res.render('creator-home', {
                title: res.locals.lang === 'zh' ? '主播世界' : 'Creator World',
                user: req.session.user,
                balance: null,
                csrfToken: generateCSRFToken(req),
                storyWorldEnabled: streamerWorldFlags.storyWorldEnabled,
                dashboard
            });
        } catch (error) {
            console.error('Creator home failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '主播世界暂时无法加载' : 'Creator World is temporarily unavailable');
        }
    });

    app.get('/creator/profile', ...readGuards, enabled, async (req, res) => {
        try {
            const dashboard = await creatorService.dashboard(req.session.user.username);
            res.set('Cache-Control', 'private, no-store');
            return res.render('creator-profile', {
                title: res.locals.lang === 'zh' ? '互动偏好' : 'Interaction preferences',
                user: req.session.user,
                balance: null,
                csrfToken: generateCSRFToken(req),
                dashboard
            });
        } catch (error) {
            console.error('Creator profile failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '互动偏好暂时无法加载' : 'Preferences are temporarily unavailable');
        }
    });

    app.get('/api/creator/state', ...readGuards, enabled, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.json({ success: true, dashboard: await creatorService.dashboard(req.session.user.username) });
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.get('/api/creator/export', ...readGuards, enabled, async (req, res) => {
        try {
            const filename = `creator-world-${new Date().toISOString().slice(0, 10)}.json`;
            res.set('Cache-Control', 'private, no-store');
            res.set('Content-Disposition', `attachment; filename="${filename}"`);
            return res.json({ success: true, data: await creatorService.exportData(req.session.user.username) });
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.put('/api/creator/profile', ...writeGuards, enabled, async (req, res) => {
        try {
            const body = await creatorService.updateProfile(req.session.user.username, req.body, context(req));
            return res.status(200).json(body);
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.put('/api/creator/preferences', ...writeGuards, enabled, async (req, res) => {
        try {
            return res.json(await creatorService.updatePreferences(req.session.user.username, req.body, context(req)));
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.put('/api/creator/quiet-hours', ...writeGuards, enabled, async (req, res) => {
        try {
            return res.json(await creatorService.updateQuietHours(req.session.user.username, req.body, context(req)));
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.put('/api/creator/interaction-windows', ...writeGuards, enabled, async (req, res) => {
        try {
            return res.json(await creatorService.updateInteractionWindows(req.session.user.username, req.body, context(req)));
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.post('/api/creator/room-binding-requests', ...writeGuards, enabled, async (req, res) => {
        try {
            const body = await creatorService.requestRoomBinding(req.session.user.username, req.body, context(req));
            return res.status(201).json(body);
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.post('/api/creator/room-binding-requests/cancel', ...writeGuards, enabled, async (req, res) => {
        try {
            return res.json(await creatorService.cancelRoomBindingRequest(
                req.session.user.username,
                req.body?.requestId,
                context(req)
            ));
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.patch('/api/creator/memories', ...writeGuards, enabled, async (req, res) => {
        try {
            return res.json(await creatorService.updateMemory(
                req.session.user.username,
                req.body?.memoryId,
                req.body,
                context(req)
            ));
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.post('/api/creator/inbox/read', ...writeGuards, enabled, async (req, res) => {
        try {
            return res.json(await creatorService.updateInbox(
                req.session.user.username,
                req.body?.messageId,
                'read',
                context(req)
            ));
        } catch (error) {
            return sendError(error, res);
        }
    });

    app.post('/api/creator/inbox/archive', ...writeGuards, enabled, async (req, res) => {
        try {
            return res.json(await creatorService.updateInbox(
                req.session.user.username,
                req.body?.messageId,
                'archive',
                context(req)
            ));
        } catch (error) {
            return sendError(error, res);
        }
    });
};
