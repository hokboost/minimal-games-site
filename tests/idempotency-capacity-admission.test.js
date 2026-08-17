'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { createConcurrencyGuard } = require('../lib/concurrency-guard');
const { createIdempotencyMiddleware, hashRequest } = require('../lib/idempotency');
const {
    CAPACITY_IDEMPOTENT_WRITE_ROUTES,
    ROUTE_MANIFEST
} = require('../routes/manifest');

const root = path.resolve(__dirname, '..');

function createPool(query = async () => ({ rows: [] })) {
    return {
        query,
        options: { max: 20 },
        totalCount: 1,
        idleCount: 1,
        waitingCount: 0
    };
}

function createRequest({
    key = 'test-idempotency-000000000001',
    pathValue = '/api/constellation-repair/start',
    username = 'tester'
} = {}) {
    return {
        method: 'POST',
        path: pathValue,
        body: { commandId: '00000000-0000-4000-a000-000000000001' },
        session: { user: { username } },
        get(name) {
            return String(name).toLowerCase() === 'idempotency-key' ? key : undefined;
        }
    };
}

function createResponse(onJson = null) {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.headersSent = false;
    res.set = (name, value) => {
        res.headers[name] = value;
        return res;
    };
    res.status = (status) => {
        res.statusCode = status;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        onJson?.({ body, headers: { ...res.headers }, status: res.statusCode });
        return res;
    };
    return res;
}

function invokeIdempotency(middleware, req, route) {
    return new Promise((resolve, reject) => {
        const res = createResponse(resolve);
        Promise.resolve(middleware(req, res, () => route(req, res)))
            .catch(reject);
    });
}

test('manifest derives exact method/path admissions only for capacity plus idempotency', () => {
    const expected = ROUTE_MANIFEST
        .filter(({ policies }) => policies.includes('capacity') && policies.includes('idempotent'))
        .map(({ method, path: routePath }) => `${method} ${routePath}`);

    assert.deepEqual(CAPACITY_IDEMPOTENT_WRITE_ROUTES, expected);
    assert.ok(CAPACITY_IDEMPOTENT_WRITE_ROUTES.includes('POST /api/constellation-repair/start'));
    assert.equal(CAPACITY_IDEMPOTENT_WRITE_ROUTES.includes('POST /api/pk/start'), false);
});

test('new capacity rejection atomically removes only its pending key and is explicitly retryable', async () => {
    const statements = [];
    let record = null;
    const pool = createPool(async (sql, values) => {
        const statement = String(sql);
        statements.push(statement);
        if (statement.includes('INSERT INTO idempotency_keys')) {
            record = { status: 'pending', request_hash: values[4] };
            return { rows: [{ id: 1 }] };
        }
        if (statement.includes('DELETE FROM idempotency_keys')) {
            if (record?.status !== 'pending') return { rows: [] };
            record = null;
            return { rows: [{ id: 1 }] };
        }
        throw new Error(`Unexpected query: ${statement}`);
    });
    const guard = createConcurrencyGuard({
        pool,
        maxInFlight: 1,
        maxPerUser: 1,
        maxPoolWaiters: 0,
        maxEventLoopLagMs: 5000
    });
    const holder = createResponse();
    guard(createRequest({ username: 'holder' }), holder, () => {});
    assert.equal(guard.getStats().active, 1);

    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/constellation-repair/start'],
        retryableCapacityRoutes: ['POST /api/constellation-repair/start']
    });
    let routeRuns = 0;
    const result = await invokeIdempotency(
        middleware,
        createRequest(),
        (req, res) => guard(req, res, () => { routeRuns += 1; })
    );

    assert.equal(result.status, 503);
    assert.equal(result.headers['Retry-After'], '2');
    assert.equal(result.headers['Idempotency-Status'], 'retryable');
    assert.deepEqual(result.body, { success: false, message: '服务器繁忙，请稍后重试' });
    assert.equal(routeRuns, 0);
    assert.equal(record, null);
    assert.equal(statements.filter(statement => statement.includes('INSERT INTO idempotency_keys')).length, 1);
    assert.equal(statements.filter(statement => statement.includes('DELETE FROM idempotency_keys')).length, 1);
    holder.emit('finish');
    assert.equal(guard.getStats().active, 0);
});

test('completed replay bypasses saturated capacity and never changes or replaces its key', async () => {
    const req = createRequest({ key: 'completed-capacity-key-0001' });
    const record = {
        request_hash: hashRequest(req),
        status: 'completed',
        response_status: 201,
        response_body: { success: true, replay: true }
    };
    let deletes = 0;
    const pool = createPool(async sql => {
        const statement = String(sql);
        if (statement.includes('INSERT INTO idempotency_keys')) return { rows: [] };
        if (statement.includes('SELECT request_hash')) return { rows: [record] };
        if (statement.includes('DELETE FROM idempotency_keys')) deletes += 1;
        return { rows: [] };
    });
    const guard = createConcurrencyGuard({ pool, maxInFlight: 1, maxPerUser: 1 });
    const holder = createResponse();
    guard(createRequest({ username: 'holder' }), holder, () => {});
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: [req.path],
        retryableCapacityRoutes: [`POST ${req.path}`]
    });
    let routeRuns = 0;

    const result = await invokeIdempotency(middleware, req, () => { routeRuns += 1; });

    assert.equal(result.status, 201);
    assert.equal(result.headers['Idempotency-Status'], 'replayed');
    assert.deepEqual(result.body, record.response_body);
    assert.equal(routeRuns, 0);
    assert.equal(deletes, 0);
    assert.equal(record.status, 'completed');
    holder.emit('close');
});

test('pending and indeterminate keys remain fenced while capacity is saturated', async () => {
    for (const status of ['pending', 'indeterminate']) {
        const req = createRequest({ key: `${status}-capacity-key-0001` });
        const record = {
            request_hash: hashRequest(req),
            status,
            response_status: 409,
            response_body: status === 'indeterminate'
                ? { success: false, message: 'manual reconciliation required' }
                : null
        };
        let deletes = 0;
        const pool = createPool(async sql => {
            const statement = String(sql);
            if (statement.includes('INSERT INTO idempotency_keys')) return { rows: [] };
            if (statement.includes('SELECT request_hash')) return { rows: [record] };
            if (statement.includes('DELETE FROM idempotency_keys')) deletes += 1;
            return { rows: [] };
        });
        const guard = createConcurrencyGuard({ pool, maxInFlight: 1, maxPerUser: 1 });
        const holder = createResponse();
        guard(createRequest({ username: 'holder' }), holder, () => {});
        const middleware = createIdempotencyMiddleware({
            pool,
            paths: [req.path],
            retryableCapacityRoutes: [`POST ${req.path}`]
        });
        let routeRuns = 0;

        const result = await invokeIdempotency(middleware, req, () => { routeRuns += 1; });

        assert.equal(result.status, 409);
        assert.equal(result.headers['Idempotency-Status'], status);
        assert.equal(routeRuns, 0);
        assert.equal(deletes, 0);
        assert.equal(record.status, status);
        holder.emit('close');
    }
});

test('a service 503 after reservation remains indeterminate and is never relabelled retryable', async () => {
    const statements = [];
    const pool = createPool(async (sql) => {
        const statement = String(sql);
        statements.push(statement);
        if (statement.includes('INSERT INTO idempotency_keys')) return { rows: [{ id: 1 }] };
        if (statement.includes("SET status = 'indeterminate'")) return { rows: [{ id: 1 }] };
        throw new Error(`Unexpected query: ${statement}`);
    });
    const guard = createConcurrencyGuard({
        pool,
        maxInFlight: 1,
        maxPerUser: 1,
        maxPoolWaiters: 0,
        maxEventLoopLagMs: 5000
    });
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/constellation-repair/start'],
        retryableCapacityRoutes: ['POST /api/constellation-repair/start']
    });

    const result = await invokeIdempotency(middleware, createRequest(), (req, res) => (
        guard(req, res, () => res.status(503).json({ success: false, message: 'business failed' }))
    ));

    assert.equal(result.status, 409);
    assert.equal(result.headers['Idempotency-Status'], 'indeterminate');
    assert.equal(result.headers['Retry-After'], undefined);
    assert.match(result.body.message, /无法自动确认/);
    assert.equal(statements.some(statement => statement.includes("SET status = 'indeterminate'")), true);
});

function browserResponse(status, headers = {}) {
    const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: name => normalized.get(String(name).toLowerCase()) || null }
    };
}

function loadIdempotentFetch(responses) {
    const calls = [];
    const waits = [];
    const storage = new Map();
    let uuid = 0;
    const window = {};
    const context = {
        window,
        globalThis: null,
        Headers,
        Date,
        JSON,
        Map,
        Uint8Array,
        sessionStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value)
        },
        crypto: {
            randomUUID() {
                uuid += 1;
                return `00000000-0000-4000-a000-${String(uuid).padStart(12, '0')}`;
            }
        },
        fetch: async (url, options) => {
            calls.push({ url, options, key: options.headers.get('Idempotency-Key') });
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next;
        },
        setTimeout(callback, milliseconds) {
            waits.push(milliseconds);
            callback();
            return waits.length;
        }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'public/js/idempotent-fetch.js'), 'utf8'), context);
    return { calls, storage, waits, window };
}

test('browser retries one explicit capacity preflight with a new outer key and unchanged command', async () => {
    const browser = loadIdempotentFetch([
        browserResponse(503, { 'Idempotency-Status': 'retryable', 'Retry-After': '1' }),
        browserResponse(201, { 'Idempotency-Status': 'created' })
    ]);
    const body = JSON.stringify({
        commandId: '00000000-0000-4000-a000-000000000077',
        gameId: 'constellation-repair'
    });

    const response = await browser.window.idempotentFetch('/api/constellation-repair/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' },
        body
    });

    assert.equal(response.status, 201);
    assert.equal(browser.calls.length, 2);
    assert.notEqual(browser.calls[0].key, browser.calls[1].key);
    assert.deepEqual(browser.calls.map(call => [call.url, call.options.method, call.options.body]), [
        ['/api/constellation-repair/start', 'POST', body],
        ['/api/constellation-repair/start', 'POST', body]
    ]);
    assert.equal(browser.calls[0].options.headers.get('X-CSRF-Token'), 'csrf');
    assert.equal(browser.calls[1].options.headers.get('X-CSRF-Token'), 'csrf');
    assert.deepEqual(browser.waits, [1000]);
    assert.equal(browser.storage.get('minimal-games-pending-idempotency-v1'), '[]');
});

test('browser never retries an unmarked 503, a retryable 409, or a network error', async () => {
    for (const first of [
        browserResponse(503),
        browserResponse(409, { 'Idempotency-Status': 'retryable', 'Retry-After': '1' }),
        new Error('network unavailable')
    ]) {
        const browser = loadIdempotentFetch([first, browserResponse(200)]);
        const request = browser.window.idempotentFetch('/api/slot/play', {
            method: 'POST',
            body: JSON.stringify({ bet: 10 })
        });
        if (first instanceof Error) await assert.rejects(request, /network unavailable/);
        else assert.equal((await request).status, first.status);
        assert.equal(browser.calls.length, 1);
        assert.deepEqual(browser.waits, []);
    }
});

test('browser response loss reuses the same outer key and unchanged command on manual replay', async () => {
    const browser = loadIdempotentFetch([
        new Error('connection reset after commit'),
        browserResponse(200, { 'Idempotency-Status': 'replayed' })
    ]);
    const body = JSON.stringify({ username: 'tester', betAmount: 10 });

    await assert.rejects(browser.window.idempotentFetch('/api/slot/play', {
        method: 'POST',
        body
    }), /connection reset after commit/);
    const replay = await browser.window.idempotentFetch('/api/slot/play', {
        method: 'POST',
        body
    });

    assert.equal(replay.status, 200);
    assert.equal(browser.calls.length, 2);
    assert.equal(browser.calls[0].key, browser.calls[1].key);
    assert.equal(browser.calls[0].options.body, body);
    assert.equal(browser.calls[1].options.body, body);
});

test('browser bounds capacity retry to one attempt and caps Retry-After', async () => {
    const browser = loadIdempotentFetch([
        browserResponse(503, { 'Idempotency-Status': 'retryable', 'Retry-After': '99' }),
        browserResponse(503, { 'Idempotency-Status': 'retryable', 'Retry-After': '1' }),
        browserResponse(200)
    ]);

    const response = await browser.window.idempotentFetch('/api/slot/play', {
        method: 'POST',
        body: JSON.stringify({ bet: 10 })
    });

    assert.equal(response.status, 503);
    assert.equal(browser.calls.length, 2);
    assert.deepEqual(browser.waits, [5000]);
    assert.notEqual(browser.calls[0].key, browser.calls[1].key);
});
