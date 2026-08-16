'use strict';

module.exports = function registerAdminCreatorDirectorRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const {
        creatorService,
        streamerWorldFlags,
        generateCSRFToken,
        requireLogin,
        requireAdmin,
        security
    } = deps;
    if (!creatorService?.adminSummaries || !streamerWorldFlags) {
        throw new TypeError('Creator Director routes require service and feature flags');
    }
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const guards = [requireLogin, requireAdmin, readHeavyRateLimit];
    const enabled = (req, res, next) => streamerWorldFlags.creatorFoundationEnabled
        ? next()
        : res.status(404).send(res.locals.lang === 'zh' ? '主播互动导演台尚未开放' : 'Creator Director is not available');

    app.get('/admin/creator-director', ...guards, enabled, async (req, res) => {
        try {
            const summary = await creatorService.adminSummaries(req.query.page);
            res.set('Cache-Control', 'private, no-store');
            return res.render('admin-creator-director', {
                title: res.locals.lang === 'zh' ? '主播互动导演台' : 'Creator Director',
                user: req.session.user,
                balance: null,
                csrfToken: generateCSRFToken(req),
                ownerUsername: streamerWorldFlags.ownerUsername,
                summary
            });
        } catch (error) {
            console.error('Creator Director read failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '导演台暂时无法加载' : 'Creator Director is temporarily unavailable');
        }
    });
};
