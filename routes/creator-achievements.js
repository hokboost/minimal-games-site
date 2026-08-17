'use strict';

const requireFunction = require('../lib/require-function');
const { AchievementServiceError } = require('../services/achievement-service');

module.exports = function registerCreatorAchievementRoutes(app, deps) {
    const { achievementService, streamerWorldFlags, requireLogin, requireAuthorized, security } = deps;
    if (!achievementService?.state || !streamerWorldFlags) throw new TypeError('Achievement routes require service and flags');
    const readHeavy = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const enabled = (req,res,next) => streamerWorldFlags.achievementsEnabled ? next()
        : req.path.startsWith('/api/') ? res.status(404).json({ success:false,code:'FEATURE_DISABLED' })
            : res.status(404).send(res.locals.lang === 'zh' ? '成就档案尚未开放' : 'Achievement archive unavailable');
    const reads = [requireLogin,requireAuthorized,readHeavy,enabled];
    const fail = (error,res) => error instanceof AchievementServiceError
        ? res.status(error.status).json({ success:false,code:error.code,message:error.message })
        : res.status(503).json({ success:false,code:'ACHIEVEMENT_SERVICE_UNAVAILABLE' });
    app.get('/creator-achievements', ...reads, async (req,res) => {
        try {
            res.set('Cache-Control','private, no-store');
            return res.render('creator-achievements', { title:res.locals.lang === 'zh' ? '成就与季节档案' : 'Achievements and season archive',
                user:req.session.user,balance:null,state:await achievementService.state(req.session.user.username,{language:res.locals.lang}) });
        } catch (error) { console.error('Achievement page failed:',error); return res.status(503).send('Achievement archive unavailable'); }
    });
    app.get('/api/creator-achievements/state', ...reads, async (req,res) => {
        try { res.set('Cache-Control','private, no-store'); return res.json(await achievementService.state(req.session.user.username,{language:res.locals.lang})); }
        catch (error) { return fail(error,res); }
    });
};
