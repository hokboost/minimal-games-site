'use strict';

module.exports = function registerAdminStoryAuditRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const { storyWorldService, streamerWorldFlags, requireLogin, requireAdmin, security } = deps;
    if (!storyWorldService?.audit || !streamerWorldFlags) throw new TypeError('Story audit routes require service and flags');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    app.get('/admin/story-audit', requireLogin, requireAdmin, readHeavy, (req, res, next) => streamerWorldFlags.storyWorldEnabled ? next() : res.status(404).send(res.locals.lang === 'zh' ? '分支故事尚未开放' : 'Story World is not available'), async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.render('admin-story-audit', { title: res.locals.lang === 'zh' ? '剧情审计' : 'Story Audit', user: req.session.user, balance: null, audit: await storyWorldService.audit() });
        } catch (error) { console.error('Story audit failed:', error); return res.status(503).send('Story audit unavailable'); }
    });
};
