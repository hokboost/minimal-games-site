'use strict';

module.exports = function registerAdminCreatorDirectorRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const {
        creatorService,
        liveInteractionService,
        streamerWorldFlags,
        generateCSRFToken,
        requireLogin,
        requireAdmin,
        requireCSRF,
        security
    } = deps;
    if (!creatorService?.adminSummaries || !liveInteractionService?.director || !streamerWorldFlags) {
        throw new TypeError('Creator Director routes require service and feature flags');
    }
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const actionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const csrfProtection = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const guards = [requireLogin, requireAdmin, readHeavyRateLimit];
    const enabled = (req, res, next) => streamerWorldFlags.creatorFoundationEnabled
        ? next()
        : res.status(404).send(res.locals.lang === 'zh' ? '主播互动导演台尚未开放' : 'Creator Director is not available');

    app.get('/admin/creator-director', ...guards, enabled, async (req, res) => {
        try {
            const liveEnabled=streamerWorldFlags.liveInteractionsEnabled&&Boolean(streamerWorldFlags.ownerUsername)&&req.session.user.username===streamerWorldFlags.ownerUsername;
            const foundation=await creatorService.adminSummaries(req.query.page);
            let summary=foundation;
            if(liveEnabled){const live=await liveInteractionService.director(req.session.user.username,req.query.page);const byUsername=new Map(live.creators.map((creator)=>[creator.username,creator]));summary={...foundation,creators:foundation.creators.map((creator)=>({...creator,...(byUsername.get(creator.username)||{})})),reports:live.reports,templates:live.templates};}
            res.set('Cache-Control', 'private, no-store');
            return res.render('admin-creator-director', {
                title: res.locals.lang === 'zh' ? '主播互动导演台' : 'Creator Director',
                user: req.session.user,
                balance: null,
                csrfToken: generateCSRFToken(req),
                ownerUsername: streamerWorldFlags.ownerUsername,
                summary,
                liveEnabled
            });
        } catch (error) {
            console.error('Creator Director read failed:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '导演台暂时无法加载' : 'Creator Director is temporarily unavailable');
        }
    });
    const liveEnabled=(req,res,next)=>streamerWorldFlags.liveInteractionsEnabled?next():res.status(404).json({success:false,code:'FEATURE_DISABLED',message:'Feature unavailable'});
    const requireConfiguredOwner=(req,res,next)=>streamerWorldFlags.ownerUsername&&req.session.user.username===streamerWorldFlags.ownerUsername
        ?next():res.status(403).json({success:false,code:'LIVE_OWNER_REQUIRED',message:'Configured owner account required'});
    const writes=[requireLogin,requireAdmin,requireConfiguredOwner,basicRateLimit,actionRateLimit,csrfProtection,liveEnabled];
    const context=req=>({requestId:req.requestId,finalizeIdempotency:req.finalizeIdempotency});
    const fail=(error,res)=>{if(Number.isInteger(error?.status))return res.status(error.status).json({success:false,code:error.code,message:error.message});console.error('Creator Director mutation failed:',error);return res.status(503).json({success:false,code:'LIVE_DIRECTOR_UNAVAILABLE',message:'Creator Director unavailable'});};
    app.post('/api/admin/live/open',...writes,async(req,res)=>{try{return res.status(201).json(await liveInteractionService.open(req.session.user.username,req.body,context(req)));}catch(error){return fail(error,res);}});
    app.post('/api/admin/live/send',...writes,async(req,res)=>{try{return res.status(201).json(await liveInteractionService.send(req.session.user.username,req.body,context(req)));}catch(error){return fail(error,res);}});
    app.post('/api/admin/live/reports/moderate',...writes,async(req,res)=>{try{return res.json(await liveInteractionService.moderate(req.session.user.username,req.body,context(req)));}catch(error){return fail(error,res);}});
};
