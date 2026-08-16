'use strict';

const { QuestV2ServiceError } = require('../services/quest-v2-service');
const { QuestRuleError } = require('../domain/quests/v2/rules');

module.exports = function registerAdminQuestStudioRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const { questV2Service, streamerWorldFlags, generateCSRFToken,
        requireLogin, requireAdmin, requireCSRF, security } = deps;
    if (!questV2Service?.studio || !streamerWorldFlags) throw new TypeError('Quest Studio routes require service and feature flags');
    const basic = requireFunction(security, 'basicRateLimit', 'security middleware');
    const action = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrf = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const enabled = (req, res, next) => {
        if (streamerWorldFlags.questEngineV2Enabled) return next();
        if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, code: 'FEATURE_DISABLED', message: 'Feature unavailable' });
        return res.status(404).send('Quest Studio is not available');
    };
    const context = (req) => ({ requestId: req.requestId, finalizeIdempotency: req.finalizeIdempotency, ipAddress: req.clientIP, userAgent: req.get('user-agent') });
    function fail(error, res) {
        if (error instanceof QuestV2ServiceError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        if (error instanceof QuestRuleError) return res.status(400).json({ success: false, code: error.code, message: error.message });
        console.error('Quest Studio route failed:', error);
        return res.status(503).json({ success: false, code: 'QUEST_STUDIO_UNAVAILABLE', message: 'Quest Studio unavailable' });
    }
    app.get('/admin/quest-studio', requireLogin, requireAdmin, readHeavy, enabled, async (req, res) => {
        try { const studio = await questV2Service.studio(); res.set('Cache-Control', 'private, no-store'); return res.render('admin-quest-studio', { title: res.locals.lang === 'zh' ? '任务工作室' : 'Quest Studio', user: req.session.user, balance: null, csrfToken: generateCSRFToken(req), versions: studio.versions, reviewQueue: studio.reviewQueue }); }
        catch (error) { console.error('Quest Studio read failed:', error); return res.status(503).send('Quest Studio unavailable'); }
    });
    const writes = [requireLogin, requireAdmin, basic, action, csrf];
    app.post('/api/admin/quests/v2/drafts', ...writes, enabled, async (req, res) => {
        try { return res.status(201).json(await questV2Service.createDraft(req.session.user.username, req.body, context(req))); }
        catch (error) { return fail(error, res); }
    });
    app.post('/api/admin/quests/v2/publish', ...writes, enabled, async (req, res) => {
        try { return res.json(await questV2Service.publish(req.session.user.username, req.body, context(req))); }
        catch (error) { return fail(error, res); }
    });
    app.post('/api/admin/quests/v2/review', ...writes, enabled, async (req, res) => {
        try { return res.json(await questV2Service.review(req.session.user.username, req.body, context(req))); }
        catch (error) { return fail(error, res); }
    });
};
