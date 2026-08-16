'use strict';

const { GAME_DEFINITIONS } = require('../domain/games/registry');

const POLICY_NAMES = new Set([
    'admin',
    'admin-audit',
    'admin-only',
    'action-rate-limit',
    'analytics-session',
    'authorized',
    'basic-rate-limit',
    'capacity',
    'csrf',
    'idempotent',
    'login',
    'paid-rate-limit',
    'same-site',
    'worker-auth',
    'worker-lease'
]);

const route = (method, path, policies) => Object.freeze({
    method,
    path,
    policies: Object.freeze(policies)
});

const gameRoutes = GAME_DEFINITIONS.flatMap((game) => game.actions.map((action) => route(
    action.method,
    action.path,
    action.policies
)));

const adminPaths = [
    '/api/admin/add-electric-coin',
    '/api/admin/authorize-user',
    '/api/admin/unauthorize-user',
    '/api/admin/reset-password',
    '/api/admin/update-balance',
    '/api/admin/dictation/mark',
    '/api/admin/delete-account',
    '/api/admin/unlock-account',
    '/api/admin/clear-failures',
    '/api/admin/change-self-password',
    '/api/admin/ip/blacklist',
    '/api/admin/ip/whitelist',
    '/api/admin/ip/remove-blacklist',
    '/api/admin/force-logout',
    '/api/admin/pk-reconciliation',
    '/api/admin/gift-reconciliation',
    '/api/admin/reset-stuck-gift-tasks',
    '/api/admin/test/security-alert',
    '/api/admin/tasks/assign-offers',
    '/api/admin/tasks/assign-event',
    '/api/admin/tasks/review',
    '/api/admin/lock-user',
    '/api/admin/unlock-user',
    '/admin/security/unblock',
    '/api/bilibili/room',
    '/api/bilibili/cookies/refresh'
];

const nonIdempotentAdminPaths = new Set([
    '/api/admin/reset-password'
]);

const adminRoutes = adminPaths.map((path) => route('POST', path, [
    'login',
    'admin',
    'csrf',
    'admin-audit',
    ...(nonIdempotentAdminPaths.has(path) ? [] : ['idempotent'])
]));

const identityRoutes = [
    route('POST', '/reset-password', ['csrf']),
    route('POST', '/register', ['csrf']),
    route('POST', '/login', ['csrf']),
    route('POST', '/logout', ['csrf'])
];

const workerStatePaths = [
    '/api/pk-tasks/:id/start',
    '/api/pk-tasks/:id/complete',
    '/api/pk-tasks/:id/fail',
    '/api/pk/runner/update',
    '/api/pk/authorize',
    '/api/pk/send-start',
    '/api/pk/report',
    '/api/gift-tasks/:id/start',
    '/api/gift-tasks/:id/complete',
    '/api/gift-tasks/:id/uncertain',
    '/api/gift-tasks/:id/fail'
];

const workerStateRoutes = workerStatePaths.map((path) => route(
    'POST',
    path,
    ['worker-auth', 'worker-lease']
));

const analyticsRoutes = [
    route('POST', '/api/ux/bootstrap', ['same-site']),
    route('POST', '/api/ux/revoke', ['same-site', 'analytics-session']),
    route('POST', '/api/ux/batch', ['same-site', 'analytics-session'])
];

const applicationRoutes = [
    ...identityRoutes,
    route('POST', '/api/change-password', ['login', 'csrf', 'idempotent']),
    route('POST', '/api/gifts/exchange', ['login', 'authorized', 'csrf', 'paid-rate-limit', 'capacity', 'idempotent']),
    route('POST', '/api/pk/start', ['login', 'authorized', 'csrf', 'paid-rate-limit', 'idempotent']),
    route('POST', '/api/pk/stop', ['login', 'authorized', 'csrf', 'paid-rate-limit', 'idempotent']),
    route('POST', '/api/bilibili/room', ['login', 'admin', 'csrf', 'admin-audit', 'idempotent']),
    route('DELETE', '/api/bilibili/room', ['login', 'admin', 'csrf', 'admin-audit']),
    ...gameRoutes,
    route('POST', '/api/wish/simulate', ['login', 'authorized', 'csrf', 'admin-only']),
    route('POST', '/api/tasks/claim', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/tasks/action', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/tasks/event-complete', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    ...adminRoutes.filter((entry) => entry.path !== '/api/bilibili/room'),
    ...analyticsRoutes,
    route('POST', '/api/workers/heartbeat', ['worker-auth']),
    route('POST', '/api/workers/drain', ['worker-auth', 'worker-lease']),
    route('POST', '/api/pk-tasks/claim', ['worker-auth', 'worker-lease']),
    route('POST', '/api/gift-tasks/claim', ['worker-auth', 'worker-lease']),
    ...workerStateRoutes
];

function validateRouteManifest(entries = applicationRoutes) {
    const keys = new Set();
    for (const entry of entries) {
        const key = `${entry.method} ${entry.path}`;
        if (!/^(POST|PUT|PATCH|DELETE)$/.test(entry.method) || !entry.path.startsWith('/')) {
            throw new Error(`Invalid mutation route descriptor: ${key}`);
        }
        if (keys.has(key)) throw new Error(`Duplicate mutation route descriptor: ${key}`);
        keys.add(key);
        for (const policy of entry.policies) {
            if (!POLICY_NAMES.has(policy)) throw new Error(`Unknown route policy ${policy}: ${key}`);
        }
        if (!entry.policies.includes('csrf')
            && !entry.policies.includes('worker-auth')
            && !entry.policies.includes('same-site')) {
            throw new Error(`Mutation route lacks cross-site request protection: ${key}`);
        }
        if (entry.policies.includes('admin') && !entry.policies.includes('admin-audit')) {
            throw new Error(`Admin mutation lacks failure audit policy: ${key}`);
        }
        if (entry.policies.includes('analytics-session') && !entry.policies.includes('same-site')) {
            throw new Error(`Analytics mutation lacks same-site protection: ${key}`);
        }
    }
    return entries;
}

const ROUTE_MANIFEST = Object.freeze(validateRouteManifest(applicationRoutes));
const IDEMPOTENT_WRITE_PATHS = Object.freeze([...new Set(
    ROUTE_MANIFEST.filter((entry) => entry.policies.includes('idempotent')).map((entry) => entry.path)
)]);
const MUTATING_ADMIN_PATHS = new Set(
    ROUTE_MANIFEST.filter((entry) => entry.policies.includes('admin-audit')).map((entry) => entry.path)
);

module.exports = {
    IDEMPOTENT_WRITE_PATHS,
    MUTATING_ADMIN_PATHS,
    POLICY_NAMES,
    ROUTE_MANIFEST,
    validateRouteManifest
};
