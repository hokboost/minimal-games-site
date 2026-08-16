'use strict';

const { QuestV2ServiceError } = require('../services/quest-v2-service');
const { QuestRuleError } = require('../domain/quests/v2/rules');
const { QuestEvidenceError } = require('../domain/quests/v2/evidence');
const { QuestTransitionError } = require('../domain/quests/v2/transitions');

module.exports = function registerQuestV2Routes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const { questV2Service, streamerWorldFlags, generateCSRFToken,
        requireLogin, requireAuthorized, requireCSRF, security } = deps;
    if (!questV2Service?.journal || !streamerWorldFlags) throw new TypeError('Quest V2 routes require service and feature flags');
    const basic = requireFunction(security, 'basicRateLimit', 'security middleware');
    const action = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrf = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const reads = [requireLogin, requireAuthorized, readHeavy];
    const writes = [requireLogin, requireAuthorized, basic, action, csrf];

    function enabled(req, res, next) {
        if (streamerWorldFlags.questEngineV2Enabled) return next();
        if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, code: 'FEATURE_DISABLED', message: 'Feature unavailable' });
        return res.status(404).send(res.locals.lang === 'zh' ? '任务日志尚未开放' : 'Quest Journal is not available');
    }
    const context = (req) => ({ requestId: req.requestId, finalizeIdempotency: req.finalizeIdempotency, ipAddress: req.clientIP, userAgent: req.get('user-agent') });
    function sendError(error, res) {
        if (error instanceof QuestV2ServiceError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        if (error instanceof QuestTransitionError) return res.status(409).json({ success: false, code: error.code, message: error.message });
        if (error instanceof QuestRuleError || error instanceof QuestEvidenceError) return res.status(400).json({ success: false, code: error.code, message: error.message });
        if (error?.code === '23505') return res.status(409).json({ success: false, code: 'QUEST_CONFLICT', message: 'Quest state changed concurrently' });
        console.error('Quest V2 route failed:', error);
        return res.status(503).json({ success: false, code: 'QUEST_SERVICE_UNAVAILABLE', message: 'Quest service unavailable' });
    }
    app.get('/quests', ...reads, enabled, async (req, res) => {
        try {
            const journal = await questV2Service.journal(req.session.user.username);
            res.set('Cache-Control', 'private, no-store');
            return res.render('quest-journal', { title: res.locals.lang === 'zh' ? '任务日志' : 'Quest Journal', user: req.session.user, balance: null, csrfToken: generateCSRFToken(req), journal });
        } catch (error) {
            console.error('Quest journal failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '任务日志暂时无法加载' : 'Quest Journal is temporarily unavailable');
        }
    });
    app.get('/api/quests/v2/journal', ...reads, enabled, async (req, res) => {
        try { res.set('Cache-Control', 'private, no-store'); return res.json({ success: true, journal: await questV2Service.journal(req.session.user.username) }); }
        catch (error) { return sendError(error, res); }
    });
    const handle = (method, status) => async (req, res) => {
        try { return res.status(status).json(await method(req.session.user.username, req.body, context(req))); }
        catch (error) { return sendError(error, res); }
    };
    app.post('/api/quests/v2/offers/claim', ...writes, enabled, handle((u, b, c) => questV2Service.offer(u, b, c), 201));
    app.post('/api/quests/v2/assignments/accept', ...writes, enabled, handle((u, b, c) => questV2Service.transition(u, b, 'accept', c), 200));
    app.post('/api/quests/v2/assignments/decline', ...writes, enabled, handle((u, b, c) => questV2Service.transition(u, b, 'decline', c), 200));
    app.post('/api/quests/v2/assignments/postpone', ...writes, enabled, handle((u, b, c) => questV2Service.postpone(u, b, c), 200));
    app.post('/api/quests/v2/evidence/submit', ...writes, enabled, handle((u, b, c) => questV2Service.submitEvidence(u, b, c), 201));
    app.post('/api/quests/v2/assignments/submit', ...writes, enabled, handle((u, b, c) => questV2Service.transition(u, b, 'submit', c), 200));
    app.post('/api/quests/v2/legacy/import', ...writes, enabled, handle((u, b, c) => questV2Service.importLegacy(u, b, c), 200));
};
