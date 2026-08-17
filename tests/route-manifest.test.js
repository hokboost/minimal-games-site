'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    IDEMPOTENT_WRITE_PATHS,
    MUTATING_ADMIN_PATHS,
    ROUTE_MANIFEST,
    validateRouteManifest
} = require('../routes/manifest');
const { GAME_DEFINITIONS } = require('../domain/games');

const root = path.resolve(__dirname, '..');
const mutationFiles = [
    'server.js',
    'routes/admin.js',
    'routes/analytics.js',
    'routes/adventure.js',
    'routes/doudizhu.js',
    'routes/games.js',
    'routes/gifts.js',
    'routes/creators.js',
    'routes/quest-v2.js',
    'routes/admin-quest-studio.js',
    'routes/story-world.js',
    'routes/live-interactions.js',
    'routes/admin-creator-director.js',
    'routes/tasks.js',
    'routes/wish.js'
];

function discoverStaticMutationRoutes() {
    const routes = [];
    const pattern = /app\.(post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    for (const file of mutationFiles) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        let match;
        while ((match = pattern.exec(source)) !== null) {
            routes.push(`${match[1].toUpperCase()} ${match[2]}`);
        }
    }
    return routes.sort();
}

const middlewarePolicyNames = Object.freeze([
    ['rejectWhenOverloaded', 'capacity'],
    ['requireLogin', 'login'],
    ['requireAuthorized', 'authorized'],
    ['basicRateLimit', 'basic-rate-limit'],
    ['userActionRateLimit', 'action-rate-limit'],
    ['csrfProtection', 'csrf']
]);

function escapeRegularExpression(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function discoverGameActionMiddleware(action) {
    const routePattern = new RegExp(
        `app\\.${action.method.toLowerCase()}\\(\\s*['"]${escapeRegularExpression(action.path)}['"]\\s*,`
        + '([\\s\\S]*?)(?:async\\s+)?\\(\\s*req\\s*,\\s*res\\s*\\)\\s*=>'
    );
    const matches = [];
    for (const file of mutationFiles) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        const match = source.match(routePattern);
        if (match) matches.push({ file, middlewareSource: match[1] });
    }
    assert.equal(matches.length, 1, `${action.method} ${action.path} needs one static registration`);
    return middlewarePolicyNames
        .filter(([middleware]) => new RegExp(`\\b${middleware}\\b`).test(matches[0].middlewareSource))
        .map(([, policy]) => policy);
}

test('mutation route manifest covers every statically registered write route', () => {
    const discovered = discoverStaticMutationRoutes();
    const declared = ROUTE_MANIFEST.map(({ method, path: routePath }) => (
        `${method} ${routePath}`
    )).sort();
    assert.deepEqual(declared, discovered);
});

test('route manifest derives idempotency and admin audit sets from policies', () => {
    assert.deepEqual(
        [...IDEMPOTENT_WRITE_PATHS].sort(),
        ROUTE_MANIFEST
            .filter(({ policies }) => policies.includes('idempotent'))
            .map(({ path: routePath }) => routePath)
            .filter((routePath, index, values) => values.indexOf(routePath) === index)
            .sort()
    );
    assert.deepEqual(
        [...MUTATING_ADMIN_PATHS].sort(),
        ROUTE_MANIFEST
            .filter(({ policies }) => policies.includes('admin-audit'))
            .map(({ path: routePath }) => routePath)
            .filter((routePath, index, values) => values.indexOf(routePath) === index)
            .sort()
    );
});

test('game action policy metadata matches the registered Express middleware', () => {
    for (const game of GAME_DEFINITIONS) {
        for (const action of game.actions) {
            const declaredMiddlewarePolicies = action.policies.filter((policy) => policy !== 'idempotent');
            assert.deepEqual(
                discoverGameActionMiddleware(action),
                declaredMiddlewarePolicies,
                `${action.method} ${action.path} middleware policy drifted`
            );
        }
    }
});

test('route manifest fails closed for duplicate, unknown, and unprotected policies', () => {
    assert.throws(() => validateRouteManifest([
        { method: 'POST', path: '/one', policies: ['csrf'] },
        { method: 'POST', path: '/one', policies: ['csrf'] }
    ]), /Duplicate/);
    assert.throws(() => validateRouteManifest([
        { method: 'POST', path: '/one', policies: ['csrf', 'invented-policy'] }
    ]), /Unknown route policy/);
    assert.throws(() => validateRouteManifest([
        { method: 'POST', path: '/one', policies: ['login'] }
    ]), /cross-site request protection/);
    assert.throws(() => validateRouteManifest([
        { method: 'POST', path: '/one', policies: ['same-site', 'analytics-session'] },
        { method: 'POST', path: '/two', policies: ['csrf', 'admin'] }
    ]), /Admin mutation lacks failure audit/);
});
