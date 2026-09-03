'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');
const express = require('express');

const registerAdminRoutes = require('../routes/admin');
const gameRegistry = require('../domain/games');
const { songGroups, songTotal } = require('../data/xiaobao-songs');

function captureAdminRoutes() {
    const routes = [];
    const app = {};
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        app[method] = (pathname, ...handlers) => routes.push({ method, pathname, handlers });
    }
    const requireLogin = function requireLogin() {};
    const requireAdmin = function requireAdmin() {};
    const readHeavyRateLimit = function readHeavyRateLimit() {};
    const noop = function noop() {};

    registerAdminRoutes(app, {
        gameRegistry,
        passwordResetTokenSecret: Buffer.alloc(32),
        requireLogin,
        requireAdmin,
        requireAuthorized: noop,
        requireCSRF: noop,
        security: {
            adminRateLimit: noop,
            adminStrictLimit: noop,
            readHeavyRateLimit
        }
    });
    return { routes, requireLogin, requireAdmin, readHeavyRateLimit };
}

test('Xiaobao song data preserves both screenshot categories and all 234 entries', () => {
    assert.equal(songTotal, 234);
    assert.deepEqual(songGroups.map(({ category, songs }) => [category, songs.length]), [
        ['流行', 217],
        ['英文', 17]
    ]);
});

test('Xiaobao songbook route uses login, admin-role and read-rate guards in order', () => {
    const { routes, requireLogin, requireAdmin, readHeavyRateLimit } = captureAdminRoutes();
    const route = routes.find(({ method, pathname }) => method === 'get' && pathname === '/admin/xiaobao-songbook');

    assert.ok(route, 'protected songbook route must be registered');
    assert.equal(route.handlers.length, 5);
    assert.equal(route.handlers[1], requireLogin);
    assert.equal(route.handlers[2], requireAdmin);
    assert.equal(route.handlers[3], readHeavyRateLimit);

    const headers = {};
    route.handlers[0]({}, { set(values) { Object.assign(headers, values); } }, () => {});
    assert.equal(headers['Cache-Control'], 'private, no-store, max-age=0');
    assert.match(headers['X-Robots-Tag'], /noindex/);
});

test('Xiaobao songbook template renders every song without exposing a public data API', async () => {
    const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'xiaobao-songbook.ejs'), {
        title: '小饱的歌单（管理员专用）',
        songGroups,
        songTotal
    });

    assert.match(html, /<h1 id="page-title">小饱的歌单<\/h1>/);
    assert.match(html, /当前显示 234 首歌/);
    assert.equal((html.match(/data-song-name=/g) || []).length, 234);
    assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
});

test('HTTP access returns no song data to logged-out and non-admin visitors', async (context) => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    const noop = function noop() {};
    const requireLogin = (req, res, next) => (
        req.get('x-test-role') ? next() : res.redirect('/login')
    );
    const requireAdmin = (req, res, next) => (
        req.get('x-test-role') === 'admin' ? next() : res.status(403).send('forbidden')
    );
    registerAdminRoutes(app, {
        gameRegistry,
        passwordResetTokenSecret: Buffer.alloc(32),
        requireLogin,
        requireAdmin,
        requireAuthorized: noop,
        requireCSRF: noop,
        security: {
            adminRateLimit: noop,
            adminStrictLimit: noop,
            readHeavyRateLimit: (req, res, next) => next()
        }
    });

    const server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    context.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const anonymous = await fetch(`${baseUrl}/admin/xiaobao-songbook`, { redirect: 'manual' });
    assert.equal(anonymous.status, 302);
    assert.equal(anonymous.headers.get('location'), '/login');
    assert.match(anonymous.headers.get('x-robots-tag') || '', /noindex/);

    const regular = await fetch(`${baseUrl}/admin/xiaobao-songbook`, {
        headers: { 'x-test-role': 'user' }
    });
    assert.equal(regular.status, 403);
    assert.doesNotMatch(await regular.text(), /小饱的歌单|data-song-name/);

    const admin = await fetch(`${baseUrl}/admin/xiaobao-songbook`, {
        headers: { 'x-test-role': 'admin' }
    });
    const adminHtml = await admin.text();
    assert.equal(admin.status, 200);
    assert.match(admin.headers.get('cache-control') || '', /no-store/);
    assert.equal((adminHtml.match(/data-song-name=/g) || []).length, 234);
});
