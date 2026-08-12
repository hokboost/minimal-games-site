#!/usr/bin/env node
'use strict';

/**
 * LOCAL VISUAL PREVIEW ONLY.
 *
 * This server deliberately skips authentication, sessions, PostgreSQL, Redis,
 * Socket.IO, CSRF validation, and every real game transaction. Never use it in
 * production or expose it outside localhost.
 */

const path = require('path');
const express = require('express');
const { i18nMiddleware, setupLanguageRoutes } = require('../i18n');

if (process.env.NODE_ENV === 'production') {
    console.error('[preview-ui] Refusing to run with NODE_ENV=production.');
    process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const app = express();
app.locals.cspNonce = 'preview-only';
const previewBalance = 12880;
const csrfToken = 'preview-only-not-a-real-csrf-token';
const previewUser = Object.freeze({
    username: 'preview_player',
    authorized: true,
    is_admin: false,
    balance: previewBalance
});
const previewAdmin = Object.freeze({
    username: 'preview_admin',
    authorized: true,
    is_admin: true,
    balance: 999999
});

const blindboxTiers = Object.freeze([
    { key: 'starmoon', nameZh: '星月盲盒', nameEn: 'Star Moon Box', cost: 50 },
    { key: 'heart', nameZh: '心动盲盒', nameEn: 'Heart Box', cost: 150 },
    { key: 'supreme', nameZh: '至尊盲盒', nameEn: 'Supreme Box', cost: 1000 }
]);
const blindboxCounts = Object.freeze([1, 10, 50]);
const blindboxConfigs = Object.freeze({
    starmoon: {
        cost: 50,
        items: [
            { giftId: '34999', name: '原地求婚', weight: 0.0002 },
            { giftId: '31122', name: '水晶球', weight: 0.0005 },
            { giftId: '33668', name: '啵啵', weight: 0.003 },
            { giftId: '31053', name: '告白花束', weight: 0.005 },
            { giftId: '34315', name: '喜欢你', weight: 0.0664 },
            { giftId: '31044', name: '情书', weight: 0.7249 },
            { giftId: '34500', name: '你真好看', weight: 0.2 }
        ]
    },
    heart: {
        cost: 150,
        items: [
            { giftId: '31028', name: '探索者启航', weight: 0.0004 },
            { giftId: '31122', name: '水晶球', weight: 0.02 },
            { giftId: '33668', name: '啵啵', weight: 0.05 },
            { giftId: '31053', name: '告白花束', weight: 0.184876 },
            { giftId: '34315', name: '喜欢你', weight: 0.544724 },
            { giftId: '31044', name: '情书', weight: 0.2 }
        ]
    },
    supreme: {
        cost: 1000,
        items: [
            { giftId: '34998', name: '小电视飞船', weight: 0.003 },
            { giftId: '34381', name: '飞屋环游', weight: 0.085 },
            { giftId: '31122', name: '水晶球', weight: 0.3 },
            { giftId: '33668', name: '啵啵', weight: 0.3162 },
            { giftId: '31053', name: '告白花束', weight: 0.2958 }
        ]
    }
});

const gamePages = Object.freeze({
    '/quiz': { view: 'quiz', titleZh: '知识问答', titleEn: 'Quiz Sprint' },
    '/slot': { view: 'slot', titleZh: '幸运老虎机', titleEn: 'Lucky Reels' },
    '/scratch': { view: 'scratch', titleZh: '刮刮乐', titleEn: 'Scratch Card' },
    '/dictation': { view: 'dictation', titleZh: '汉字听写', titleEn: 'Chinese Dictation' },
    '/spin': { view: 'spin', titleZh: '挑战转盘', titleEn: 'Challenge Wheel' },
    '/stone': { view: 'stone', titleZh: '合石头', titleEn: 'Stone Match' },
    '/flip': { view: 'flip', titleZh: '翻卡牌', titleEn: 'Card Flip' },
    '/duel': { view: 'duel', titleZh: '决斗挑战', titleEn: 'Duel Challenge' },
    '/blindbox': { view: 'blindbox', titleZh: '惊喜盲盒', titleEn: 'Surprise Boxes' },
    '/wish': { view: 'wish', titleZh: '幸运祈愿', titleEn: 'Lucky Wish' }
});
const profileStats = Object.freeze({
    quiz: { total: 26, bestScore: 15 },
    slot: { total: 42, wins: 16 },
    scratch: { total: 31, wins: 11 },
    wish: { total: 18, wins: 2 },
    blindbox: { total: 24 },
    stone: { total: 37 },
    flip: { total: 29 },
    duel: { total: 21 }
});
const adminUsers = Object.freeze([
    {
        ...previewAdmin,
        spins_allowed: 3,
        login_failures: 0,
        is_locked: false,
        lock_minutes: 0
    },
    {
        ...previewUser,
        spins_allowed: 2,
        login_failures: 0,
        is_locked: false,
        lock_minutes: 0
    },
    {
        username: 'preview_pending',
        balance: 360,
        spins_allowed: 0,
        authorized: false,
        is_admin: false,
        login_failures: 2,
        is_locked: false,
        lock_minutes: 0
    },
    {
        username: 'preview_locked',
        balance: 75,
        spins_allowed: 0,
        authorized: true,
        is_admin: false,
        login_failures: 5,
        is_locked: true,
        lock_minutes: 12
    }
]);
const adminLatestRecords = Object.freeze({
    preview_admin: {
        quiz: '2026-07-11 19:12:00 | 分数 15',
        slot: '2026-07-11 18:43:00 | 120积分',
        scratch: '2026-07-11 17:20:00 | 50积分',
        wish: '2026-07-11 16:06:00 | 梦幻游乐园',
        stone: '2026-07-11 15:11:00 | redeem | 300积分',
        flip: '2026-07-11 14:39:00 | 好3坏0 | 500积分',
        duel: '2026-07-11 13:22:00 | crown | 成功 | 30000积分',
        spin: '未记录'
    },
    preview_player: {
        quiz: '2026-07-11 18:55:00 | 分数 12',
        slot: '2026-07-11 18:30:00 | 60积分',
        scratch: '2026-07-11 17:02:00 | 20积分',
        wish: '2026-07-11 15:46:00 | 未中奖',
        stone: '2026-07-11 14:52:00 | fill | 0积分',
        flip: '2026-07-11 14:09:00 | 好2坏0 | 200积分',
        duel: '2026-07-11 12:40:00 | jade | 失败 | 0积分',
        spin: '未记录'
    },
    preview_pending: {},
    preview_locked: {}
});
const previewRecords = Object.freeze({
    quiz: [{ played_at: '2026-07-11 18:55:00', score: 12 }],
    slot: [{
        played_at: '2026-07-11 18:30:00',
        result: 'won',
        bet_amount: 20,
        multiplier: 3,
        payout: 60,
        amounts: '[7, 7, 7]'
    }],
    scratch: [{
        played_at: '2026-07-11 17:02:00',
        tier_cost: 10,
        matches_count: 2,
        reward: 20
    }],
    wish: [{
        played_at: '2026-07-11 15:46:00',
        gift_type: 'crystal_ball',
        cost: 66,
        success: true,
        reward: '水晶球',
        wishes_count: 1
    }],
    stone: [{
        played_at: '2026-07-11 14:52:00',
        action_type: 'fill',
        cost: 180,
        reward: 0,
        slot_index: null,
        before_slots: '["red", "red", null, null, null, null]',
        after_slots: '["red", "red", "cyan", "yellow", "blue", "red"]'
    }],
    flip: [{
        played_at: '2026-07-11 14:09:00',
        action_type: 'end',
        cost: 0,
        reward: 200,
        card_index: 4,
        card_type: 'good',
        good_count: 2,
        bad_count: 0,
        ended: true
    }],
    duel: [{
        played_at: '2026-07-11 12:40:00',
        gift_type: 'jade',
        power: 42,
        cost: 435,
        success: true,
        reward: 1000
    }]
});
const profileRecordSamples = Object.freeze({
    quiz: previewRecords.quiz,
    slot: previewRecords.slot,
    scratch: [{ ...previewRecords.scratch[0], result: '中奖 20积分' }],
    wish: [{
        played_at: '2026-07-11 15:46:00',
        batch_count: 1,
        total_cost: 66,
        success_count: 1,
        gift_type: 'crystal_ball',
        gift_name: '水晶球'
    }],
    blindbox: [{
        played_at: '2026-07-11 15:02:00',
        tier_name: '星月盲盒',
        box_count: 10,
        total_cost: 500,
        total_reward_value: 680
    }],
    stone: previewRecords.stone,
    flip: previewRecords.flip,
    duel: previewRecords.duel
});

function requestedUser(req) {
    const mode = String(req.query.as || req.query.preview || '').toLowerCase();
    if (mode === 'anonymous' || mode === 'guest' || mode === 'logged-out') {
        return null;
    }
    if (mode === 'pending') {
        return { username: 'preview_pending', authorized: false, is_admin: false };
    }
    return previewUser;
}

function pageTitle(res, titleZh, titleEn) {
    return res.locals.lang === 'zh' ? titleZh : titleEn;
}

function previewApi(res, payload = {}, success = false) {
    return res.json({
        success,
        preview: true,
        previewOnly: true,
        message: success
            ? '本地视觉预览数据，不会写入数据库'
            : '本地视觉预览模式：此操作不会执行，也不会写入数据库',
        ...payload
    });
}

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(projectRoot, 'views'));
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    res.setHeader('X-Minimal-Games-Preview', 'local-visual-preview-only');
    res.setHeader('Cache-Control', 'no-store');
    next();
});
app.use(i18nMiddleware);
setupLanguageRoutes(app);

app.use((req, res, next) => {
    const user = requestedUser(req);
    res.locals.req = req;
    res.locals.user = user;
    res.locals.username = user?.username || previewUser.username;
    res.locals.balance = user?.authorized ? previewBalance : null;
    res.locals.csrfToken = csrfToken;
    res.locals.canWishTest = false;
    next();
});

app.get('/', (req, res) => {
    res.render('index', {
        title: pageTitle(res, 'Minimal Games 游戏中心', 'Minimal Games Game Center')
    });
});

app.get('/games', (req, res) => {
    res.render('games', {
        title: pageTitle(res, '游戏专区', 'Game Zone')
    });
});

app.get('/login', (req, res) => {
    res.render('login', {
        title: pageTitle(res, '登录 - Minimal Games', 'Login - Minimal Games'),
        user: null,
        error: req.query.error || null
    });
});

app.get('/register', (req, res) => {
    res.render('register', {
        title: pageTitle(res, '注册 - Minimal Games', 'Register - Minimal Games'),
        user: null,
        error: req.query.error || null
    });
});

app.get('/profile', (req, res) => {
    res.render('profile', {
        title: pageTitle(res, '个人资料 - Minimal Games', 'Profile - Minimal Games'),
        user: previewUser,
        gameStats: profileStats,
        csrfToken
    });
});

app.get('/gifts', (req, res) => {
    res.render('gifts', {
        title: pageTitle(res, '礼物兑换 - Minimal Games', 'Gift Exchange - Minimal Games'),
        user: previewUser,
        balance: previewBalance,
        csrfToken
    });
});

app.get('/admin', (req, res) => {
    res.render('admin', {
        title: pageTitle(res, '管理后台 - Minimal Games', 'Admin Panel - Minimal Games'),
        user: previewAdmin,
        userLoggedIn: previewAdmin.username,
        users: adminUsers,
        latestRecords: adminLatestRecords,
        dictationSubmissions: [{
            id: 1001,
            submitted_at: '2026-07-11 19:08:00',
            username: previewUser.username,
            level: 2,
            set_id: 4,
            word_id: '4-07',
            word: '井然有序',
            pronunciation: 'jǐng rán yǒu xù',
            definition: '整齐而有条理',
            user_input: '井然有序',
            image_path: null,
            status: 'pending'
        }],
        dictationLatest: [{
            username: previewUser.username,
            set_id: 4,
            result: '审核中',
            started_at: '2026-07-11 19:01:00',
            ended_at: '2026-07-11 19:08:00'
        }],
        csrfToken
    });
});

app.get('/admin/users/:username/records', (req, res) => {
    const targetUsername = String(req.params.username || 'preview');
    res.render('admin-user-records', {
        title: pageTitle(res, `用户记录 - ${targetUsername}`, `User Records - ${targetUsername}`),
        user: previewAdmin,
        targetUsername,
        records: previewRecords
    });
});

app.get('/coming-soon', (req, res) => {
    res.render('coming-soon', {
        title: pageTitle(res, '请登录或注册', 'Please Login or Register'),
        user: null
    });
});

for (const [route, page] of Object.entries(gamePages)) {
    app.get(route, (req, res) => {
        const locals = {
            title: pageTitle(res, page.titleZh, page.titleEn),
            user: previewUser,
            username: previewUser.username,
            balance: previewBalance,
            csrfToken,
            canWishTest: false
        };
        if (page.view === 'blindbox') {
            locals.tiers = blindboxTiers;
            locals.counts = blindboxCounts;
            locals.blindboxConfigs = blindboxConfigs;
        }
        res.render(page.view, locals);
    });
}

app.get('/logout', (req, res) => res.redirect('/games?as=anonymous'));
app.get('/socket.io/socket.io.js', (req, res) => {
    res.type('application/javascript').send(`
        window.io = function previewSocket() {
            return { on: function () {}, emit: function () {}, disconnect: function () {} };
        };
    `);
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Page routes must precede static files because public/dictation is a directory.
app.use(express.static(path.join(projectRoot, 'public'), { etag: false, maxAge: 0 }));

app.get('/preview/anonymous', (req, res) => res.redirect('/games?as=anonymous'));
app.get('/preview/authorized', (req, res) => res.redirect('/games?as=authorized'));
app.get('/preview/pending', (req, res) => res.redirect('/games?as=pending'));

app.get('/api/quiz/leaderboard', (req, res) => previewApi(res, {
    leaderboard: [
        { username: 'Mina', score: 15, submitted_at: '2026-07-11T14:12:00.000Z' },
        { username: 'Kai', score: 14, submitted_at: '2026-07-11T13:48:00.000Z' },
        { username: 'preview_player', score: 12, submitted_at: '2026-07-11T12:31:00.000Z' }
    ]
}, true));

app.get('/api/stone/state', (req, res) => previewApi(res, {
    slots: ['red', 'red', 'cyan', 'yellow', null, null],
    isFull: false,
    maxSame: 2,
    reward: 0,
    replaceCost: null,
    canReplace: false
}, true));

app.get('/api/flip/state', (req, res) => previewApi(res, {
    ended: false,
    goodCount: 1,
    badCount: 0,
    nextCost: 112,
    canFlip: true,
    cashoutReward: 50,
    board: Array.from({ length: 9 }, (_, index) => ({
        type: index === 0 ? 'good' : 'unknown',
        flipped: index === 0
    }))
}, true));

app.get('/api/wish/progress', (req, res) => previewApi(res, {
    progress: {
        gift_name: String(req.query.giftType || 'deepsea_singer'),
        total_wishes: 18,
        consecutive_fails: 7,
        total_spent: 3200,
        total_rewards_value: 0
    }
}, true));

app.get('/api/dictation/latest-status', (req, res) => previewApi(res, {
    pending: false,
    status: null
}, true));

app.get('/api/wish/backpack', (req, res) => previewApi(res, {
    items: [
        {
            id: 501,
            gift_type: 'crystal_ball',
            gift_name: '水晶球',
            created_at: '2026-07-11 15:46:00',
            expires_at: '2026-07-18T19:46:00.000Z',
            expires_note: '2026-07-18 15:46',
            status: 'stored',
            last_failure_reason: null
        },
        {
            id: 502,
            gift_type: 'bobo',
            gift_name: '啵啵',
            created_at: '2026-07-10 12:18:00',
            expires_at: null,
            expires_note: null,
            status: 'sent',
            last_failure_reason: null
        }
    ]
}, true));

app.get('/api/game-records/:gameType', (req, res) => {
    const gameType = String(req.params.gameType || '');
    const records = profileRecordSamples[gameType] || [];
    return previewApi(res, {
        records,
        pagination: {
            current: 1,
            total: 1,
            hasPrev: false,
            hasNext: false
        }
    }, true);
});

app.get('/api/gifts/history', (req, res) => previewApi(res, {
    history: [
        {
            gift_type: 'heartbox',
            quantity: 2,
            cost: 300,
            delivery_status: 'success',
            failure_reason: null,
            created_at: '2026-07-11 17:35:00'
        },
        {
            gift_type: 'fanlight',
            quantity: 10,
            cost: 10,
            delivery_status: 'pending',
            failure_reason: null,
            created_at: '2026-07-11 18:02:00'
        }
    ]
}, true));

app.get('/api/pk/status', (req, res) => previewApi(res, { running: false }, true));

app.get('/api/bilibili/cookies/status', (req, res) => previewApi(res, {
    expired: false,
    lastCheck: '2026-07-11T18:50:00.000Z',
    nextCheck: '2026-07-11T19:20:00.000Z',
    checkInterval: 1800000
}, true));

app.get('/api/bilibili/room', (req, res) => previewApi(res, {
    isAdminView: true,
    allBindings: [
        {
            username: previewUser.username,
            roomId: '3929738',
            bindTime: '2026-07-10T15:20:00.000Z'
        }
    ]
}, true));

app.get('/health', (req, res) => previewApi(res, {
    service: 'minimal-games-ui-preview',
    pages: [
        '/',
        '/games',
        '/login',
        '/register',
        '/profile',
        '/gifts',
        '/admin',
        '/admin/users/preview/records',
        '/coming-soon',
        ...Object.keys(gamePages)
    ],
    database: 'disabled',
    authentication: 'mocked'
}, true));

app.all('/api/*', (req, res) => previewApi(res, {
    method: req.method,
    path: req.path
}));

app.post(['/login', '/register'], (req, res) => previewApi(res, {
    method: req.method,
    path: req.path
}));

app.use((req, res) => {
    res.status(404).send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Preview 404</title><body><h1>Preview 404</h1><p>本地预览服务器没有路由：<code>${req.path}</code></p><p><a href="/games">返回游戏目录</a></p></body></html>`);
});

app.use((error, req, res, next) => {
    console.error(`[preview-ui] ${req.method} ${req.path}`, error);
    if (res.headersSent) {
        return next(error);
    }
    return res.status(500).send('Local preview render failed. Check the preview-ui console.');
});

if (require.main === module) {
    const requestedPort = Number.parseInt(process.env.PORT || '3000', 10);
    const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
        ? requestedPort
        : 3000;
    const host = '127.0.0.1';
    const server = app.listen(port, host, () => {
        console.log('');
        console.log('Minimal Games local UI preview (NOT FOR PRODUCTION)');
        console.log(`Open: http://localhost:${port}`);
        console.log(`Anonymous catalog: http://localhost:${port}/games?as=anonymous`);
        console.log('Database, authentication, and game transactions are disabled.');
        console.log('');
    });
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`[preview-ui] Port ${port} is already in use. Try: PORT=3001 node scripts/preview-ui.js`);
            process.exitCode = 1;
            return;
        }
        throw error;
    });
}

module.exports = { app, gamePages };
