'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');

const registerTaskRoutes = require('../routes/tasks');
const { GAME_OPERATIONS, getLifetimeEarnings } = require('../lib/earnings');

const root = path.resolve(__dirname, '..');
const source = (filename) => fs.readFileSync(path.join(root, filename), 'utf8');

function named(name) {
    return { [name](req, res, next) { return next?.(); } }[name];
}

test('task route registration keeps user and administrator security middleware explicit', () => {
    const routes = [];
    const app = {
        get(routePath, ...handlers) { routes.push({ method: 'GET', path: routePath, handlers }); },
        post(routePath, ...handlers) { routes.push({ method: 'POST', path: routePath, handlers }); }
    };
    const middleware = {
        requireLogin: named('requireLogin'),
        requireAuthorized: named('requireAuthorized'),
        requireAdmin: named('requireAdmin'),
        requireRecentAdminAuth: named('requireRecentAdminAuth'),
        requireCSRF: named('requireCSRF'),
        generateCSRFToken: named('generateCSRFToken'),
        basicRateLimit: named('basicRateLimit'),
        userActionRateLimit: named('userActionRateLimit'),
        adminRateLimit: named('adminRateLimit'),
        adminStrictLimit: named('adminStrictLimit')
    };
    registerTaskRoutes(app, {
        pool: { query: async () => ({ rows: [] }), connect: async () => ({}) },
        BalanceLogger: { updateBalance: async () => ({ success: true }) },
        ...middleware,
        security: middleware
    });
    const claim = routes.find((entry) => entry.path === '/api/tasks/claim');
    assert.deepEqual(claim.handlers.slice(0, -1).map((handler) => handler.name), [
        'requireLogin', 'requireAuthorized', 'basicRateLimit', 'userActionRateLimit', 'requireCSRF'
    ]);
    const review = routes.find((entry) => entry.path === '/api/admin/tasks/review');
    assert.deepEqual(review.handlers.slice(0, -1).map((handler) => handler.name), [
        'requireLogin', 'requireAdmin', 'adminRateLimit', 'adminStrictLimit',
        'requireRecentAdminAuth', 'requireCSRF'
    ]);
    assert.deepEqual(routes.filter((entry) => entry.method === 'POST').map((entry) => entry.path).sort(), [
        '/api/admin/tasks/assign-event',
        '/api/admin/tasks/assign-offers',
        '/api/admin/tasks/review',
        '/api/tasks/action',
        '/api/tasks/claim',
        '/api/tasks/event-complete'
    ]);
});

test('task migration seeds exact rewards and enforces one active card per user', () => {
    const migration = source('migrations/add_task_cards_account_locks_and_earnings.sql');
    for (const [slug, reward] of [
        ['learn-wo-yiwei', 15000],
        ['sing-na-xie-hua', 2000],
        ['sing-meiyou-yiwai', 2888],
        ['sing-cangzai-xindi', 2000],
        ['duet-ai-ni-de-xin', 30000]
    ]) {
        assert.match(migration, new RegExp(`\\('${slug}',[\\s\\S]*?${reward},`));
    }
    assert.match(migration, /WHERE status IN \('claimed', 'pending_approval'\)/);
    assert.match(migration, /account_locked BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(migration, /due_at > assigned_at/);
});

test('task approval posts its reward and idempotency result before commit', () => {
    const tasks = source('routes/tasks.js');
    const reviewStart = tasks.indexOf("app.post('/api/admin/tasks/review'");
    const review = tasks.slice(reviewStart);
    assert.ok(review.indexOf('BalanceLogger.updateBalance') < review.indexOf('finalizeIdempotency'));
    assert.ok(review.indexOf('finalizeIdempotency') < review.indexOf("client.query('COMMIT')"));
    assert.match(review, /status = 'pending_approval'/);
    assert.match(review, /operationType: taskType === 'card' \? 'task_card_reward' : 'event_task_reward'/);
});

test('lifetime earnings use game net plus approved credits and gift value', async () => {
    assert.ok(GAME_OPERATIONS.includes('slot_bet'));
    assert.ok(GAME_OPERATIONS.includes('slot_win'));
    assert.ok(GAME_OPERATIONS.includes('blindbox_open'));
    const calls = [];
    const result = await getLifetimeEarnings({
        async query(sql, params) {
            calls.push({ sql, params });
            return { rows: [{ game_net: '-12', admin_earned: '100', task_earned: '50', gift_value: '20', lifetime_earnings: '158' }] };
        }
    }, 'hokboost');
    assert.deepEqual(result, { gameNet: -12, adminEarned: 100, taskEarned: 50, giftValue: 20, total: 158 });
    assert.equal(calls[0].params[0], 'hokboost');
    assert.match(calls[0].sql, /GREATEST\(amount, 0\)/);
});

test('game navigation no longer creates a CSP-blocked iframe', () => {
    const music = source('public/js/music-player.js');
    const server = source('server.js');
    assert.doesNotMatch(music, /createElement\(['"]iframe/);
    assert.doesNotMatch(music, /openInSiteFrame|music-shell-active/);
    assert.match(music, /sessionStorage\.setItem/);
    assert.match(server, /frame-src 'none'/);
});

test('permanent account lock remains separate from failed-login throttling', () => {
    const admin = source('routes/admin.js');
    const server = source('server.js');
    assert.match(admin, /account_locked = TRUE/);
    assert.match(admin, /is_admin = FALSE/);
    assert.match(server, /code: 'ACCOUNT_LOCKED'/);
    assert.match(server, /res\.redirect\('\/account-locked'\)/);
    assert.match(server, /login_failures = 0, last_failure_time = NULL, locked_until = NULL/);
});

test('task page renders when optional header balance is omitted', async () => {
    const html = await ejs.renderFile(path.join(root, 'views/tasks.ejs'), {
        lang: 'zh',
        title: '任务卡片',
        user: { username: 'hokboost', authorized: true, is_admin: false },
        csrfToken: 'test-token',
        initialTaskState: { featureEnabled: true, canClaim: true, cards: [], eventTasks: [] },
        cspNonce: 'test-nonce',
        t: { auth: { login: '登录', register: '注册' } }
    });
    assert.match(html, /任务卡片/);
    assert.match(html, /暂不可用/);
});
