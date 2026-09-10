'use strict';

const path = require('node:path');
const { canPlayDoorbell } = require('../domain/games/doorbell');
const { DoorbellService, DoorbellError } = require('../services/doorbell-service');

module.exports = function registerDoorbellRoutes(app, {
    pool, BalanceLogger, requireLogin, requireAuthorized, requireCSRF,
    generateCSRFToken, security, paidActionConcurrencyGuard
}) {
    const service = new DoorbellService({ pool, balanceLogger: BalanceLogger });
    const { basicRateLimit, userActionRateLimit } = security;
    const csrfProtection = requireCSRF;
    const rejectWhenOverloaded = paidActionConcurrencyGuard;
    const privateAccess = (req, res, next) => {
        res.set('Cache-Control', 'private, no-store');
        if (!canPlayDoorbell(req.session.user)) return res.status(404).json({ success: false, message: '游戏尚未开放' });
        return next();
    };
    const reads = [requireLogin, requireAuthorized, privateAccess, basicRateLimit];
    function errorResponse(error, res) {
        if (error instanceof DoorbellError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        console.error('Doorbell request failed:', error);
        return res.status(503).json({ success: false, message: '游戏暂时无法连接，请稍后重试；已提交的进度会保留' });
    }
    app.get('/doorbell', ...reads, async (req, res) => {
        try {
            const state = await service.state(req.session.user.username);
            return res.render('doorbell', { title: '开门大吉', user: req.session.user, balance: state.balance,
                csrfToken: generateCSRFToken(req), state });
        } catch (error) { return errorResponse(error, res); }
    });
    app.get('/api/doorbell/state', ...reads, async (req, res) => {
        try { return res.json(await service.state(req.session.user.username)); }
        catch (error) { return errorResponse(error, res); }
    });
    app.get('/api/doorbell/runs/:runId/audio/:door/:kind', ...reads, async (req, res) => {
        try {
            const filename = await service.audio(req.session.user.username, req.params.runId, req.params.door, req.params.kind);
            res.type('audio/mpeg');
            return res.sendFile(path.join(__dirname, '..', 'private', 'doorbell-audio', filename),
                { cacheControl: false, lastModified: false, dotfiles: 'deny' }, error => {
                    if (error && !res.headersSent) res.status(503).json({ success: false, message: '音频暂时无法加载，请重播' });
                });
        } catch (error) { return errorResponse(error, res); }
    });
    app.post('/api/doorbell/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, privateAccess, async (req, res) => {
        try { return res.json(await service.command(req.session.user.username, req.body, true)); }
        catch (error) { return errorResponse(error, res); }
    });
    app.post('/api/doorbell/action', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, privateAccess, async (req, res) => {
        try { return res.json(await service.command(req.session.user.username, req.body, false,
            { ipAddress: req.ip, userAgent: req.get('user-agent') })); }
        catch (error) { return errorResponse(error, res); }
    });
};
