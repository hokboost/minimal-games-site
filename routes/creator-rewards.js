'use strict';

const requireFunction = require('../lib/require-function');
const { RewardCatalogServiceError } = require('../services/reward-catalog-service');

module.exports = function registerCreatorRewardRoutes(app, deps) {
    const { rewardCatalogService, streamerWorldFlags, generateCSRFToken, requireLogin,
        requireAuthorized, requireAdmin, requireCSRF, security, paidActionConcurrencyGuard } = deps;
    if (!rewardCatalogService?.catalog || !streamerWorldFlags) {
        throw new TypeError('Creator reward routes require service and feature flags');
    }
    const basic = requireFunction(security, 'basicRateLimit', 'security middleware');
    const action = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrf = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const capacity = requireFunction({ paidActionConcurrencyGuard },
        'paidActionConcurrencyGuard', 'route dependency');
    const userReads = [requireLogin, requireAuthorized, readHeavy];
    const userWrites = [capacity, requireLogin, requireAuthorized, basic, action, csrf];
    const adminWrites = [capacity, requireLogin, requireAuthorized, requireAdmin, basic, action, csrf];
    const enabled = (req, res, next) => streamerWorldFlags.rewardsEnabled ? next()
        : req.path.startsWith('/api/')
            ? res.status(404).json({ success: false, code: 'FEATURE_DISABLED' })
            : res.status(404).send(res.locals.lang === 'zh' ? '奖励目录尚未开放' : 'Reward catalog unavailable');
    const context = req => ({ requestId: req.requestId, ipAddress: req.ip,
        userAgent: req.get('user-agent'), finalizeIdempotency: req.finalizeIdempotency });
    const saveSession = req => typeof req.session.save !== 'function' ? Promise.resolve() : new Promise((resolve, reject) => {
        req.session.save(error => error ? reject(error) : resolve());
    });

    function fail(error, res) {
        if (error instanceof RewardCatalogServiceError) return res.status(error.status).json({
            success: false, code: error.code, message: error.message
        });
        if (error instanceof TypeError) return res.status(400).json({
            success: false, code: 'REWARD_INVALID_INPUT', message: error.message
        });
        if (error?.code === 'REWARD_BUDGET_EXCEEDED') return res.status(409).json({
            success: false, code: error.code, message: 'Reward budget is exhausted'
        });
        if (error?.code === '23505') return res.status(409).json({
            success: false, code: 'REWARD_PENDING_ORDER_EXISTS', message: 'A reward request already exists'
        });
        console.error('Reward catalog route failed:', error);
        return res.status(503).json({ success: false, code: 'REWARD_SERVICE_UNAVAILABLE' });
    }

    app.get('/creator-rewards', ...userReads, enabled, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.render('creator-rewards', {
                title: res.locals.lang === 'zh' ? '奖励与收藏' : 'Rewards and collection',
                user: req.session.user,
                balance: req.session.user.balance,
                csrfToken: generateCSRFToken(req),
                catalog: await rewardCatalogService.catalog(req.session.user.username),
                state: await rewardCatalogService.state(req.session.user.username, 1)
            });
        } catch (error) {
            console.error('Reward page failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '奖励页暂时不可用' : 'Rewards temporarily unavailable');
        }
    });
    app.get('/api/creator-rewards/catalog', ...userReads, enabled, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.json(await rewardCatalogService.catalog(req.session.user.username));
        } catch (error) { return fail(error, res); }
    });
    app.get('/api/creator-rewards/state', ...userReads, enabled, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.json(await rewardCatalogService.state(req.session.user.username, Number(req.query.page || 1)));
        } catch (error) { return fail(error, res); }
    });
    app.get('/admin/creator-rewards', requireLogin, requireAuthorized, requireAdmin, readHeavy, enabled, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.render('admin-creator-rewards', {
                title: res.locals.lang === 'zh' ? '奖励审核台' : 'Reward review studio',
                user: req.session.user,
                balance: null,
                csrfToken: generateCSRFToken(req),
                state: await rewardCatalogService.adminState(req.session.user.username)
            });
        } catch (error) {
            console.error('Reward admin page failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '奖励审核台暂时不可用' : 'Reward review unavailable');
        }
    });

    const userMutation = (method, successStatus = 200) => async (req, res) => {
        try {
            const body = await rewardCatalogService[method](req.session.user.username, req.body, context(req));
            if (Number.isSafeInteger(body.balance) && body.balance >= 0) {
                req.session.user.balance = body.balance;
                await saveSession(req);
            }
            return res.status(successStatus).json(body);
        } catch (error) { return fail(error, res); }
    };
    app.post('/api/creator-rewards/orders/create', ...userWrites, enabled, userMutation('createOrder', 201));
    app.post('/api/creator-rewards/orders/claim', ...userWrites, enabled, userMutation('claim'));
    app.post('/api/creator-rewards/orders/cancel', ...userWrites, enabled, userMutation('cancel'));
    app.post('/api/creator-rewards/wishlist/update', ...userWrites, enabled, userMutation('wishlist'));
    app.post('/api/admin/creator-director/reward-grants/create', ...adminWrites, enabled, async (req, res) => {
        try { return res.status(201).json(await rewardCatalogService.ownerGrant(
            req.session.user.username, req.body, context(req)));
        } catch (error) { return fail(error, res); }
    });
    app.post('/api/admin/creator-rewards/reviews/decide', ...adminWrites, enabled, async (req, res) => {
        try { return res.json(await rewardCatalogService.review(req.session.user.username, req.body, context(req))); }
        catch (error) { return fail(error, res); }
    });
    app.post('/api/admin/creator-rewards/grants/revoke', ...adminWrites, enabled, async (req, res) => {
        try { return res.json(await rewardCatalogService.revoke(req.session.user.username, req.body, context(req))); }
        catch (error) { return fail(error, res); }
    });
};
