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
    '/api/admin/streamer-games/bingo-event',
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
    route('PUT', '/api/creator/profile', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('PUT', '/api/creator/preferences', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('PUT', '/api/creator/quiet-hours', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('PUT', '/api/creator/interaction-windows', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/creator/room-binding-requests', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/creator/room-binding-requests/cancel', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('PATCH', '/api/creator/memories', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/creator/inbox/read', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/creator/inbox/archive', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/offers/claim', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/assignments/accept', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/assignments/decline', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/assignments/postpone', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/evidence/submit', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/assignments/submit', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/appeals/submit', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/quests/v2/legacy/import', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/story/runs/start', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/story/actions/commit', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/story/actions/preview', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf']),
    route('POST', '/api/story/runs/recover', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/items/accept', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/items/decline', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/polls/vote', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/presence', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/mute', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/leave', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/report', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/reconsent', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']),
    route('POST', '/api/live/ack', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf']),
    route('POST', '/api/admin/live/open', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/live/send', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/live/reports/moderate', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/quests/v2/drafts', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/quests/v2/publish', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/quests/v2/review', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/quests/v2/appeals/resolve', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/creator-rewards/orders/create', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'capacity', 'csrf', 'idempotent']),
    route('POST', '/api/creator-rewards/orders/claim', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'capacity', 'csrf', 'idempotent']),
    route('POST', '/api/creator-rewards/orders/cancel', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'capacity', 'csrf', 'idempotent']),
    route('POST', '/api/creator-rewards/wishlist/update', ['login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'capacity', 'csrf', 'idempotent']),
    route('POST', '/api/admin/creator-director/reward-grants/create', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'capacity', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/creator-rewards/reviews/decide', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'capacity', 'csrf', 'admin-audit', 'idempotent']),
    route('POST', '/api/admin/creator-rewards/grants/revoke', ['login', 'admin', 'basic-rate-limit', 'action-rate-limit', 'capacity', 'csrf', 'admin-audit', 'idempotent']),
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
