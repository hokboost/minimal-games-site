'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const doudizhu = require('../domain/games/doudizhu');
const { createBudget } = require('../domain/games/doudizhu/ai');
const gameRegistry = require('../domain/games/registry');
const { ROUTE_MANIFEST } = require('../routes/manifest');
const registerDoudizhuRoutes = require('../routes/doudizhu');

const root = path.resolve(__dirname, '..');
const routeSource = fs.readFileSync(path.join(root, 'routes/doudizhu.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'public/js/doudizhu.js'), 'utf8');
const GAME_ID = '11111111-1111-4111-8111-111111111111';
const FORBIDDEN_PUBLIC_KEYS = new Set([
    'deck',
    'hands',
    'nonPassPlays',
    'playedCards',
    'privateState',
    'rng',
    'seed'
]);
const FORBIDDEN_REQUEST_KEYS = [
    'username',
    'seat',
    'humanSeat',
    'turnSeat',
    'state',
    'hands',
    'deck',
    'seed',
    'revision'
];

function deterministicRandom() {
    return 0;
}

function assertNoForbiddenKeys(value, forbiddenKeys, location = 'value') {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
        assert.equal(forbiddenKeys.has(key), false, `${location}.${key} must not be public`);
        assertNoForbiddenKeys(nested, forbiddenKeys, `${location}.${key}`);
    }
}

function createResponse() {
    return {
        statusCode: 200,
        body: undefined,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        set(name, value) {
            this.headers[String(name).toLowerCase()] = value;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        render(view, body) {
            this.view = view;
            this.body = body;
            return this;
        }
    };
}

function createRouteHarness({ pool: poolOverride } = {}) {
    const registrations = [];
    const app = {
        get(routePath, ...handlers) {
            registrations.push({ method: 'GET', path: routePath, handlers });
        },
        post(routePath, ...handlers) {
            registrations.push({ method: 'POST', path: routePath, handlers });
        }
    };
    const middleware = {
        rejectWhenOverloaded() {},
        requireLogin() {},
        requireAuthorized() {},
        basicRateLimit() {},
        userActionRateLimit() {},
        readHeavyRateLimit() {},
        csrfProtection() {}
    };
    const pool = poolOverride || {
        async query() {
            return { rows: [] };
        },
        async connect() {
            return {
                async query() {
                    return { rows: [], rowCount: 0 };
                },
                release() {}
            };
        }
    };

    registerDoudizhuRoutes(app, {
        pool,
        gameRegistry,
        generateCSRFToken() {},
        requireLogin: middleware.requireLogin,
        requireAuthorized: middleware.requireAuthorized,
        requireCSRF: middleware.csrfProtection,
        security: {
            basicRateLimit: middleware.basicRateLimit,
            readHeavyRateLimit: middleware.readHeavyRateLimit,
            userActionRateLimit: middleware.userActionRateLimit
        },
        paidActionConcurrencyGuard: middleware.rejectWhenOverloaded,
        questService: {
            async ensurePilotAssignments() { return []; },
            async recordProgressEvent() { return { matches: [], rewardEarned: 0, balance: null }; }
        }
    });

    function route(method, routePath) {
        const registration = registrations.find((entry) => (
            entry.method === method && entry.path === routePath
        ));
        assert.ok(registration, `${method} ${routePath} must be registered`);
        return registration;
    }

    return { middleware, pool, registrations, route };
}

function privateGameRow(state, overrides = {}) {
    return {
        id: GAME_ID,
        username: 'alice',
        status: 'active',
        phase: state.phase,
        state,
        revision: state.revision,
        rules_version: state.rulesVersion,
        human_role: null,
        outcome: null,
        score_delta: null,
        base_score: 1,
        multiplier: 1,
        created_at: new Date(0),
        updated_at: new Date(0),
        finished_at: null,
        ...overrides
    };
}

function handlerFor(harness, method, routePath) {
    return harness.route(method, routePath).handlers.at(-1);
}

async function invokeInvalidBody(handler, body) {
    const response = createResponse();
    await handler({
        body,
        session: { user: { username: 'alice' } }
    }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body?.success, false);
    assert.equal(response.body?.code, 'INVALID_REQUEST');
}

test('public projections expose only the viewer hand and never private deck state', () => {
    const state = doudizhu.createGame({ humanSeat: 0, rng: deterministicRandom });
    const projected = doudizhu.projectState(state, state.humanSeat);

    assert.deepEqual(
        projected.hand.map((card) => card.id),
        state.hands[state.humanSeat]
    );
    assert.deepEqual(projected.bottomCards, [], 'bottom cards stay hidden during bidding');
    for (const player of projected.seats) {
        assert.deepEqual(
            Object.keys(player).sort(),
            ['cardCount', 'isViewer', 'kind', 'role', 'seat']
        );
    }
    assertNoForbiddenKeys(projected, FORBIDDEN_PUBLIC_KEYS, 'projection');

    const afterLandlord = doudizhu.applyCommand(state, {
        type: 'bid',
        bid: 3,
        seat: state.humanSeat
    }).state;
    const revealed = doudizhu.projectState(afterLandlord, afterLandlord.humanSeat);
    assert.equal(revealed.bottomCards.length, 3, 'landlord assignment makes bottom cards public');
    assertNoForbiddenKeys(revealed, FORBIDDEN_PUBLIC_KEYS, 'revealedProjection');
});

test('card selection and bot work stay within explicit hard budgets', () => {
    const bidding = doudizhu.createGame({ humanSeat: 0, rng: deterministicRandom });
    const playing = doudizhu.applyCommand(bidding, {
        type: 'bid',
        bid: 3,
        seat: bidding.humanSeat
    }).state;
    const tooManyCards = [...playing.hands[0], playing.hands[1][0]];

    assert.equal(tooManyCards.length, doudizhu.RULE_PROFILE.maximumSelectedCards + 1);
    assert.throws(() => doudizhu.applyCommand(playing, {
        type: 'play',
        seat: playing.humanSeat,
        cardIds: tooManyCards
    }), (error) => error?.code === 'INVALID_CARDS');
    assert.throws(() => doudizhu.applyCommand(playing, {
        type: 'play',
        seat: playing.humanSeat,
        cardIds: ['not-a-card']
    }), (error) => error?.code === 'INVALID_CARD_ID');
    assert.throws(() => doudizhu.applyCommand(playing, {
        type: 'play',
        seat: playing.humanSeat,
        cardIds: [playing.hands[0][0], playing.hands[0][0]]
    }), (error) => error?.code === 'DUPLICATE_CARD');

    let now = 100;
    const budget = createBudget({ maxNodes: 2, deadlineMs: 5, clock: () => now });
    assert.equal(budget.consume(), true);
    assert.equal(budget.consume(), true);
    assert.equal(budget.consume(), false, 'node budget must stop additional search');
    now = 105;
    assert.equal(budget.expired(), true, 'deadline must stop additional search');

    const clamped = createBudget({
        maxNodes: Number.MAX_SAFE_INTEGER,
        deadlineMs: Number.MAX_SAFE_INTEGER,
        clock: () => 0
    });
    assert.equal(clamped.maxNodes, doudizhu.RULE_PROFILE.ai.hardMaxNodes);
    assert.equal(clamped.deadline, doudizhu.RULE_PROFILE.ai.hardDeadlineMs);

    const botOpening = doudizhu.createGame({ humanSeat: 2, rng: deterministicRandom });
    const advanced = doudizhu.advanceBots(botOpening, {
        rng: deterministicRandom,
        clock: () => 0,
        maxNodes: 1,
        deadlineMs: 1,
        maxActions: 1
    });
    assert.equal(advanced.state.revision, 1, 'maxActions must bound bot transitions per request');
    assert.equal(advanced.events.length > 0, true);
});

test('start, action, and hint use the declared middleware and idempotency policies', () => {
    const harness = createRouteHarness();
    const expectedMiddleware = [
        harness.middleware.rejectWhenOverloaded,
        harness.middleware.requireLogin,
        harness.middleware.requireAuthorized,
        harness.middleware.basicRateLimit,
        harness.middleware.userActionRateLimit,
        harness.middleware.csrfProtection
    ];
    const expectedPolicies = [
        'capacity',
        'login',
        'authorized',
        'basic-rate-limit',
        'action-rate-limit',
        'csrf',
        'idempotent'
    ];

    for (const routePath of [
        '/api/doudizhu/start',
        '/api/doudizhu/action',
        '/api/doudizhu/hint'
    ]) {
        const registration = harness.route('POST', routePath);
        assert.deepEqual(registration.handlers.slice(0, -1), expectedMiddleware, routePath);
        const manifestEntry = ROUTE_MANIFEST.find((entry) => entry.path === routePath);
        assert.ok(manifestEntry, `${routePath} must be in the route manifest`);
        assert.deepEqual(manifestEntry.policies, expectedPolicies, routePath);
    }
});

test('API bodies cannot choose identity, seat, revision, or hidden state', async () => {
    let databaseCalls = 0;
    const harness = createRouteHarness({
        pool: {
            async query() {
                databaseCalls += 1;
                return { rows: [] };
            },
            async connect() {
                databaseCalls += 1;
                throw new Error('invalid bodies must not reach the database');
            }
        }
    });
    const start = handlerFor(harness, 'POST', '/api/doudizhu/start');
    const action = handlerFor(harness, 'POST', '/api/doudizhu/action');
    const hint = handlerFor(harness, 'POST', '/api/doudizhu/hint');

    for (const key of FORBIDDEN_REQUEST_KEYS) {
        await invokeInvalidBody(start, { [key]: key === 'revision' ? 0 : 'attacker-value' });
        await invokeInvalidBody(action, {
            gameId: GAME_ID,
            expectedRevision: 0,
            type: 'pass',
            [key]: key === 'revision' ? 0 : 'attacker-value'
        });
        await invokeInvalidBody(hint, {
            gameId: GAME_ID,
            expectedRevision: 0,
            [key]: key === 'revision' ? 0 : 'attacker-value'
        });
    }

    await invokeInvalidBody(action, {
        gameId: GAME_ID,
        expectedRevision: 0,
        type: 'play',
        cardIds: Array.from({ length: 21 }, (_, index) => `X${index}`)
    });
    await invokeInvalidBody(action, {
        gameId: GAME_ID,
        expectedRevision: 0,
        type: 'play',
        cardIds: ['X'.repeat(33)]
    });
    await invokeInvalidBody(action, {
        gameId: GAME_ID,
        expectedRevision: 0,
        type: 'play',
        cardIds: ['S3', 'S3']
    });
    assert.equal(databaseCalls, 0, 'rejected bodies must fail before database access');
});

test('state API projects private database state before responding', async () => {
    const privateState = doudizhu.createGame({ humanSeat: 0, rng: deterministicRandom });
    const databaseCalls = [];
    const harness = createRouteHarness({
        pool: {
            async query(sql, values) {
                databaseCalls.push({ sql, values });
                return { rows: [privateGameRow(privateState)] };
            },
            async connect() {
                throw new Error('state reads do not open a transaction');
            }
        }
    });
    const response = createResponse();
    await handlerFor(harness, 'GET', '/api/doudizhu/state')({
        session: { user: { username: 'alice' } }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body?.success, true);
    assert.equal(response.body?.state?.gameId, GAME_ID);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    assert.deepEqual(
        response.body.state.hand.map((card) => card.id),
        privateState.hands[privateState.humanSeat]
    );
    assertNoForbiddenKeys(response.body.state, FORBIDDEN_PUBLIC_KEYS, 'api.state');
    assert.equal(databaseCalls.length, 1);
    assert.deepEqual(databaseCalls[0].values, ['alice']);
});

test('action and hint reject stale revisions before AI work or database writes', async () => {
    const privateState = doudizhu.createGame({ humanSeat: 0, rng: deterministicRandom });
    const databaseCalls = [];
    const harness = createRouteHarness({
        pool: {
            async query(sql, values) {
                databaseCalls.push({ sql, values });
                return { rows: [privateGameRow(privateState)] };
            },
            async connect() {
                throw new Error('stale requests must not open a write transaction');
            }
        }
    });

    for (const [routePath, body] of [
        ['/api/doudizhu/action', {
            gameId: GAME_ID,
            expectedRevision: privateState.revision + 1,
            type: 'bid',
            bid: 0
        }],
        ['/api/doudizhu/hint', {
            gameId: GAME_ID,
            expectedRevision: privateState.revision + 1
        }]
    ]) {
        const response = createResponse();
        await handlerFor(harness, 'POST', routePath)({
            body,
            session: { user: { username: 'alice' } }
        }, response);
        assert.equal(response.statusCode, 409, routePath);
        assert.equal(response.body?.code, 'STALE_REVISION', routePath);
        assert.equal(response.body?.state?.revision, privateState.revision, routePath);
        assertNoForbiddenKeys(response.body.state, FORBIDDEN_PUBLIC_KEYS, `${routePath}.state`);
        assert.equal(response.headers['cache-control'], 'private, no-store', routePath);
    }

    assert.equal(databaseCalls.length, 2);
    assert.equal(databaseCalls.every(({ values }) => (
        values[0] === GAME_ID && values[1] === 'alice'
    )), true, 'game reads must be scoped by both id and authenticated username');
});

test('action persistence is owner-bound CAS and finalizes idempotency before commit', () => {
    const actionStart = routeSource.indexOf("app.post('/api/doudizhu/action'");
    const hintStart = routeSource.indexOf("app.post('/api/doudizhu/hint'");
    const startStart = routeSource.indexOf("app.post('/api/doudizhu/start'");
    const actionSource = routeSource.slice(actionStart, hintStart);
    const startSource = routeSource.slice(startStart, actionStart);

    assert.ok(actionStart >= 0 && hintStart > actionStart && startStart >= 0);
    assert.match(actionSource,
        /WHERE id = \$1\s+AND username = \$2\s+AND status = 'active'\s+AND revision = \$3/s);
    assert.match(actionSource, /seat:\s*game\.state\.humanSeat/);
    assert.match(actionSource, /privateState\.revision <= parsed\.expectedRevision/);
    assert.ok(
        actionSource.indexOf('req.finalizeIdempotency?.(client, 200, responseBody)')
            < actionSource.indexOf("client.query('COMMIT')"),
        'action idempotency must commit in the same transaction before the response'
    );
    assert.match(startSource, /pg_advisory_xact_lock/);
    assert.match(startSource, /WHERE username = \$1 AND status = 'active'/);
    assert.ok(
        startSource.indexOf('req.finalizeIdempotency?.(client, 200, responseBody)')
            < startSource.indexOf("client.query('COMMIT')"),
        'start idempotency must commit in the same transaction before the response'
    );
    assert.match(routeSource, /maxNodes:\s*serverConfig\.aiNodeBudget/);
    assert.match(routeSource, /deadlineMs:\s*serverConfig\.aiDeadlineMs/);
    assert.match(routeSource, /maxActions:\s*serverConfig\.maxBotActionsPerRequest/);
});

test('Dou Dizhu has no third-party runtime package or bundled model artifacts', () => {
    const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const dependencyNames = Object.keys({
        ...(packageManifest.dependencies || {}),
        ...(packageManifest.devDependencies || {}),
        ...(packageManifest.optionalDependencies || {})
    });
    assert.equal(
        dependencyNames.some((name) => /(?:douzero|rlcard|doudizhu)/i.test(name)),
        false
    );

    const engineDirectory = path.join(root, 'domain', 'games', 'doudizhu');
    const engineFiles = fs.readdirSync(engineDirectory, { withFileTypes: true });
    assert.equal(engineFiles.every((entry) => entry.isFile() && entry.name.endsWith('.js')), true);
    const engineSource = engineFiles.map((entry) => (
        fs.readFileSync(path.join(engineDirectory, entry.name), 'utf8')
    )).join('\n');
    assert.doesNotMatch(engineSource, /require\(['"](?:douzero|rlcard|doudizhu)[/'"]/i);
    assert.doesNotMatch(engineSource, /\b(?:DouZero|RLCard)\b/);

    const notices = fs.readFileSync(path.join(root, 'docs', 'THIRD_PARTY_NOTICES.md'), 'utf8');
    assert.match(notices, /does not copy,\s+bundle, import, or execute third-party game code/s);
    assert.match(notices, /RLCard[\s\S]*MIT License/);
    assert.match(notices, /DouZero[\s\S]*Apache License 2\.0/);
    assert.match(notices, /Neither project is a runtime or build dependency/);
});

test('Doudizhu hand selection recovers after requests without requiring Hint', () => {
    const setBusyStart = uiSource.indexOf('function setBusy(');
    const setBusyEnd = uiSource.indexOf('\n    function showError(', setBusyStart);
    const setBusySource = uiSource.slice(setBusyStart, setBusyEnd);
    const postStart = uiSource.indexOf('async function post(');
    const postEnd = uiSource.indexOf('\n    async function startMatch(', postStart);
    const postSource = uiSource.slice(postStart, postEnd);
    const toggleStart = uiSource.indexOf('function toggleCard(');
    const toggleEnd = uiSource.indexOf('\n    function setBusy(', toggleStart);
    const toggleSource = uiSource.slice(toggleStart, toggleEnd);

    assert.ok(setBusyStart >= 0 && postStart >= 0 && toggleStart >= 0);
    assert.match(setBusySource, /actionInFlight\s*=\s*busy/);
    assert.match(setBusySource, /renderHand\(\);[\s\S]*renderControls\(\);/,
        'busy transitions must refresh both card buttons and controls');
    assert.match(postSource, /finally\s*{\s*setBusy\(false\);\s*}/,
        'every completed request must restore card interactivity');
    assert.match(toggleSource, /state\?\.phase\s*!==\s*'playing'/);
    assert.match(toggleSource, /!state\?\.legal\?\.canAct/);
    assert.match(toggleSource, /selectedCardIds\.(?:add|delete)/);
    assert.match(uiSource,
        /elements\.play\.disabled\s*=\s*actionInFlight\s*\|\|\s*!playing\s*\|\|\s*selectedCardIds\.size\s*===\s*0/,
        'Play is available for a non-empty selection without invoking Hint');
});
