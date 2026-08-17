'use strict';

const { StoryTransitionError } = require('../domain/story/engine');
const { StoryWorldServiceError } = require('../services/story-world-service');

module.exports = function registerStoryWorldRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const { storyWorldService, streamerWorldFlags, generateCSRFToken, requireLogin, requireAuthorized, requireCSRF, security } = deps;
    if (!storyWorldService?.state || !streamerWorldFlags) throw new TypeError('Story routes require service and flags');
    const basic = requireFunction(security, 'basicRateLimit', 'security middleware');
    const action = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrf = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const reads = [requireLogin, requireAuthorized, readHeavy];
    const writes = [requireLogin, requireAuthorized, basic, action, csrf];
    const enabled = (req, res, next) => streamerWorldFlags.storyWorldEnabled ? next()
        : req.path.startsWith('/api/') ? res.status(404).json({ success: false, code: 'FEATURE_DISABLED', message: 'Feature unavailable' })
            : res.status(404).send(res.locals.lang === 'zh' ? '分支故事尚未开放' : 'Story World is not available');
    const context = (req) => ({ requestId: req.requestId, finalizeIdempotency: req.finalizeIdempotency });
    function error(errorValue, res) {
        if (errorValue instanceof StoryWorldServiceError) return res.status(errorValue.status).json({ success: false, code: errorValue.code, message: errorValue.message });
        if (errorValue instanceof StoryTransitionError) return res.status(errorValue.code === 'STORY_ACTION_INVALID' ? 400 : 409).json({ success: false, code: errorValue.code, message: errorValue.message });
        if (errorValue?.code === '23505') return res.status(409).json({ success: false, code: 'STORY_STATE_CONFLICT', message: 'Story changed concurrently' });
        console.error('Story World route failed:', errorValue);
        return res.status(503).json({ success: false, code: 'STORY_SERVICE_UNAVAILABLE', message: 'Story service unavailable' });
    }
    app.get('/story', ...reads, enabled, async (req, res) => {
        try {
            const state = await storyWorldService.state(req.session.user.username, { language: res.locals.lang, season: req.query.season || null });
            res.set('Cache-Control', 'private, no-store');
            return res.render('story-world', { title: res.locals.lang === 'zh' ? '我们之间的信号' : 'The Signal Between Us', user: req.session.user, balance: null, csrfToken: generateCSRFToken(req), initialState: state });
        } catch (caught) {
            if (caught instanceof StoryWorldServiceError && caught.status < 500) return res.status(caught.status).send(caught.message);
            console.error('Story page failed:', caught); return res.status(503).send(res.locals.lang === 'zh' ? '故事暂时无法加载' : 'Story is temporarily unavailable');
        }
    });
    app.get('/api/story/state', ...reads, enabled, async (req, res) => {
        try { res.set('Cache-Control', 'private, no-store'); return res.json(await storyWorldService.state(req.session.user.username, { language: res.locals.lang, season: req.query.season || null })); }
        catch (caught) { return error(caught, res); }
    });
    app.post('/api/story/runs/start', ...writes, enabled, async (req, res) => {
        try { return res.status(201).json(await storyWorldService.start(req.session.user.username, { ...req.body, language: res.locals.lang }, context(req))); }
        catch (caught) { return error(caught, res); }
    });
    app.post('/api/story/actions/commit', ...writes, enabled, async (req, res) => {
        try { return res.json(await storyWorldService.commit(req.session.user.username, { ...req.body, language: res.locals.lang }, context(req))); }
        catch (caught) { return error(caught, res); }
    });
    app.post('/api/story/actions/preview', requireLogin, requireAuthorized, basic, action, csrf, enabled, async (req, res) => {
        try { return res.json(await storyWorldService.preview(req.session.user.username, { ...req.body, language: res.locals.lang })); }
        catch (caught) { return error(caught, res); }
    });
    app.post('/api/story/runs/recover', ...writes, enabled, async (req, res) => {
        try { return res.json(await storyWorldService.recover(req.session.user.username, { ...req.body, language: res.locals.lang }, context(req))); }
        catch (caught) { return error(caught, res); }
    });
};
