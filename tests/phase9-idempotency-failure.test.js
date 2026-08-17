'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    bodyForHash,
    createIdempotencyMiddleware,
    hashRequest,
    retryQuery,
    stableStringify
} = require('../lib/idempotency');

function request(overrides = {}) {
    const headers = new Map(Object.entries({
        'idempotency-key': 'phase9-command-0001',
        ...(overrides.headers || {})
    }).map(([key, value]) => [key.toLowerCase(), value]));
    return {
        method: 'POST',
        path: '/api/creator/inbox/read',
        body: { messageId: 9 },
        session: { user: { username: 'creator' } },
        get(name) {
            return headers.get(String(name).toLowerCase());
        },
        ...overrides,
        headers: undefined
    };
}

function response() {
    const calls = [];
    const headers = new Map();
    const res = {
        calls,
        headers,
        statusCode: 200,
        headersSent: false,
        status(value) {
            this.statusCode = value;
            calls.push({ type: 'status', value });
            return this;
        },
        set(name, value) {
            headers.set(String(name).toLowerCase(), String(value));
            calls.push({ type: 'header', name: String(name), value: String(value) });
            return this;
        },
        json(body) {
            calls.push({ type: 'json', status: this.statusCode, body: structuredClone(body) });
            return this;
        },
        send(body) {
            calls.push({ type: 'send', status: this.statusCode, body });
            return this;
        },
        end(...args) {
            calls.push({ type: 'end', status: this.statusCode, args });
            return this;
        }
    };
    return res;
}

function database(handler) {
    const calls = [];
    return {
        calls,
        async query(sql, values = []) {
            const call = { sql: String(sql), values: structuredClone(values) };
            calls.push(call);
            return handler ? handler(call, calls.length) : { rows: [] };
        }
    };
}

function insertedPool() {
    return database(call => {
        if (/INSERT INTO idempotency_keys/.test(call.sql)) return { rows: [{ id: 1 }] };
        if (/UPDATE idempotency_keys/.test(call.sql)) return { rows: [{ id: 1 }] };
        return { rows: [] };
    });
}

function existingPool(row) {
    return database(call => {
        if (/INSERT INTO idempotency_keys/.test(call.sql)) return { rows: [] };
        if (/SELECT request_hash, status/.test(call.sql)) return { rows: row ? [structuredClone(row)] : [] };
        return { rows: [] };
    });
}

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

test('stable stringify canonicalizes nested object key order', () => {
    const first = { z: 1, a: { d: 4, b: 2 }, list: [{ y: 2, x: 1 }] };
    const second = { list: [{ x: 1, y: 2 }], a: { b: 2, d: 4 }, z: 1 };
    assert.equal(stableStringify(first), stableStringify(second));
    assert.equal(stableStringify(first), '{"a":{"b":2,"d":4},"list":[{"x":1,"y":2}],"z":1}');
});

test('stable stringify preserves array order', () => {
    assert.notEqual(stableStringify([1, 2, 3]), stableStringify([3, 2, 1]));
    assert.equal(stableStringify([null, true, 'x']), '[null,true,"x"]');
});

test('stable stringify maps undefined and functions to null without execution', () => {
    let executed = false;
    const value = () => {
        executed = true;
    };
    assert.equal(stableStringify(undefined), 'null');
    assert.equal(stableStringify(value), 'null');
    assert.equal(executed, false);
});

test('body hash removes only CSRF transport fields', () => {
    const body = {
        csrfToken: 'secret-one',
        _csrf: 'secret-two',
        messageId: 9,
        expectedRevision: 3
    };
    assert.deepEqual(bodyForHash(body), { messageId: 9, expectedRevision: 3 });
    assert.equal(body.csrfToken, 'secret-one');
    assert.equal(body._csrf, 'secret-two');
});

test('body hash preserves arrays and primitive request bodies', () => {
    assert.deepEqual(bodyForHash([1, 2]), [1, 2]);
    assert.equal(bodyForHash('text'), 'text');
    assert.deepEqual(bodyForHash(0), {});
    assert.deepEqual(bodyForHash(null), {});
});

test('request hash is stable across object insertion order', () => {
    const first = request({ body: { expectedRevision: 2, messageId: 9 } });
    const second = request({ body: { messageId: 9, expectedRevision: 2 } });
    assert.equal(hashRequest(first), hashRequest(second));
    assert.match(hashRequest(first), /^[a-f0-9]{64}$/);
});

test('request hash ignores CSRF token rotation', () => {
    const first = request({ body: { messageId: 9, csrfToken: 'old' } });
    const second = request({ body: { messageId: 9, csrfToken: 'new' } });
    assert.equal(hashRequest(first), hashRequest(second));
});

test('request hash changes with body semantics', () => {
    const first = request({ body: { messageId: 9 } });
    const second = request({ body: { messageId: 10 } });
    assert.notEqual(hashRequest(first), hashRequest(second));
});

test('request hash changes with method', () => {
    const first = request({ method: 'POST' });
    const second = request({ method: 'PATCH' });
    assert.notEqual(hashRequest(first), hashRequest(second));
});

test('request hash changes with fixed path identity', () => {
    const first = request({ path: '/api/creator/inbox/read' });
    const second = request({ path: '/api/creator/inbox/archive' });
    assert.notEqual(hashRequest(first), hashRequest(second));
});

test('HMAC request hash changes with deployment secret', () => {
    const req = request();
    const first = hashRequest(req, 'secret-one');
    const second = hashRequest(req, 'secret-two');
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.match(second, /^[a-f0-9]{64}$/);
    assert.notEqual(first, second);
});

test('idempotency bypasses safe read methods even on protected path', async () => {
    const pool = database(() => {
        throw new Error('database must not be called');
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    let nextCalls = 0;
    await middleware(request({ method: 'GET' }), response(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(pool.calls.length, 0);
});

test('idempotency bypasses mutation paths outside exact manifest set', async () => {
    const pool = database(() => {
        throw new Error('database must not be called');
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    let nextCalls = 0;
    await middleware(request({ path: '/api/creator/inbox/read/9' }), response(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(pool.calls.length, 0);
});

test('idempotency bypasses unauthenticated request for login middleware to decide', async () => {
    const pool = database(() => {
        throw new Error('database must not be called');
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    let nextCalls = 0;
    await middleware(request({ session: null }), response(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(pool.calls.length, 0);
});

test('idempotency rejects missing key before database access', async () => {
    const pool = database(() => {
        throw new Error('database must not be called');
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request({ get: () => undefined });
    const res = response();
    let nextCalls = 0;
    await middleware(req, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 0);
    assert.equal(pool.calls.length, 0);
    assert.equal(res.calls.at(-1).status, 400);
    assert.equal(res.calls.at(-1).body.success, false);
});

test('idempotency rejects short, whitespace, and non-token keys', async () => {
    const invalid = ['short', 'with space', '../command', 'x'.repeat(101), '命令-00000001'];
    for (const key of invalid) {
        const pool = database();
        const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
        const res = response();
        await middleware(request({ get: () => key }), res, () => assert.fail('must not call next'));
        assert.equal(res.calls.at(-1).status, 400, key);
        assert.equal(pool.calls.length, 0, key);
    }
});

test('idempotency accepts minimum and maximum key boundaries', async () => {
    for (const key of ['12345678', 'x'.repeat(100)]) {
        const pool = insertedPool();
        const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
        let nextCalls = 0;
        await middleware(request({ get: () => key }), response(), () => { nextCalls += 1; });
        assert.equal(nextCalls, 1, key.length);
        assert.equal(pool.calls[0].values[1], key);
    }
});

test('existing request validator can fail closed before idempotency insert', async () => {
    const pool = database(() => assert.fail('database must not be called'));
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/creator/inbox/read'],
        async validateExistingRequest(req) {
            assert.equal(req.session.user.username, 'creator');
            return { status: 401, message: 'Session revoked' };
        }
    });
    const res = response();
    await middleware(request(), res, () => assert.fail('must not call next'));
    assert.equal(res.calls.at(-1).status, 401);
    assert.equal(res.calls.at(-1).body.message, 'Session revoked');
    assert.equal(pool.calls.length, 0);
});

test('new idempotency request inserts bounded pending record and calls next', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    const res = response();
    let nextCalls = 0;
    await middleware(req, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.match(pool.calls[0].sql, /status = 'pending'|VALUES[\s\S]*'pending'/);
    assert.match(pool.calls[0].sql, /COUNT\(\*\)[\s\S]*< 25/);
    assert.match(pool.calls[0].sql, /COUNT\(\*\)[\s\S]*< 1000/);
    assert.deepEqual(pool.calls[0].values.slice(0, 4), ['creator', 'phase9-command-0001', 'POST', '/api/creator/inbox/read']);
    assert.equal(typeof req.finalizeIdempotency, 'function');
});

test('new idempotency request attaches stable key to request context', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    await middleware(req, response(), () => {});
    assert.equal(req.idempotencyKey, 'phase9-command-0001');
});

test('quota exhaustion with no persisted identity returns bounded 429', async () => {
    const pool = existingPool(null);
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const res = response();
    await middleware(request(), res, () => assert.fail('must not call next'));
    const result = res.calls.at(-1);
    assert.equal(result.status, 429);
    assert.equal(result.body.success, false);
    assert.match(result.body.message, /额度/);
    assert.equal(pool.calls.length, 2);
});

test('same key with different semantic request fails closed', async () => {
    const req = request();
    const pool = existingPool({
        request_hash: '0'.repeat(64),
        status: 'completed',
        response_status: 200,
        response_body: { success: true }
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    const res = response();
    await middleware(req, res, () => assert.fail('must not call next'));
    assert.equal(res.calls.at(-1).status, 409);
    assert.match(res.calls.at(-1).body.message, /其他请求/);
    assert.equal(res.headers.get('idempotency-status'), 'conflict');
});

test('completed request replays exact persisted response body and status', async () => {
    const req = request();
    const persisted = { success: true, messageId: 9, revision: 4 };
    const pool = existingPool({
        request_hash: hashRequest(req),
        status: 'completed',
        response_status: 201,
        response_body: persisted
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    const res = response();
    await middleware(req, res, () => assert.fail('must not call next'));
    assert.equal(res.calls.at(-1).status, 201);
    assert.deepEqual(res.calls.at(-1).body, persisted);
    assert.equal(res.headers.get('idempotency-status'), 'replayed');
});

test('completed request uses safe defaults for absent persisted response', async () => {
    const req = request();
    const pool = existingPool({
        request_hash: hashRequest(req),
        status: 'completed',
        response_status: null,
        response_body: null
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    const res = response();
    await middleware(req, res, () => assert.fail('must not call next'));
    assert.equal(res.calls.at(-1).status, 200);
    assert.deepEqual(res.calls.at(-1).body, {});
});

test('indeterminate request replays persisted reconciliation response', async () => {
    const req = request();
    const persisted = { success: false, message: 'Review required', reconciliationId: 7 };
    const pool = existingPool({
        request_hash: hashRequest(req),
        status: 'indeterminate',
        response_status: 409,
        response_body: persisted
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    const res = response();
    await middleware(req, res, () => assert.fail('must not call next'));
    assert.equal(res.calls.at(-1).status, 409);
    assert.deepEqual(res.calls.at(-1).body, persisted);
    assert.equal(res.headers.get('idempotency-status'), 'indeterminate');
});

test('indeterminate request never assumes automatic refund or resend', async () => {
    const req = request();
    const pool = existingPool({
        request_hash: hashRequest(req),
        status: 'indeterminate',
        response_status: null,
        response_body: null
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    const res = response();
    await middleware(req, res, () => assert.fail('must not call next'));
    const result = res.calls.at(-1);
    assert.equal(result.status, 409);
    assert.match(result.body.message, /联系管理员核对/);
    assert.doesNotMatch(result.body.message, /已退款|已重发/);
});

test('pending replay returns conflict and does not enter business handler', async () => {
    const req = request();
    const pool = existingPool({
        request_hash: hashRequest(req),
        status: 'pending',
        response_status: null,
        response_body: null
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    const res = response();
    let nextCalls = 0;
    await middleware(req, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 0);
    assert.equal(res.calls.at(-1).status, 409);
    assert.equal(res.headers.get('idempotency-status'), 'pending');
});

test('transaction finalize updates only matching pending identity', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    await middleware(req, response(), () => {});
    const client = database(call => {
        assert.match(call.sql, /status = 'completed'/);
        assert.match(call.sql, /status = 'pending'/);
        return { rows: [{ id: 1 }] };
    });
    const body = { success: true, messageId: 9, revision: 4 };
    await req.finalizeIdempotency(client, 200, body);
    assert.equal(client.calls.length, 1);
    assert.deepEqual(client.calls[0].values.slice(0, 3), ['creator', 'phase9-command-0001', 200]);
    assert.equal(client.calls[0].values[3], JSON.stringify(body));
});

test('transaction finalize fails when pending identity disappeared', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    await middleware(req, response(), () => {});
    const client = database(() => ({ rows: [] }));
    await assert.rejects(req.finalizeIdempotency(client, 200, { success: true }), /完成幂等记录/);
});

test('transaction session validator runs with the business transaction client', async () => {
    const pool = insertedPool();
    const validated = [];
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/creator/inbox/read'],
        async validateTransactionalRequest(req, client) {
            validated.push({ req, client });
            return null;
        }
    });
    const req = request();
    await middleware(req, response(), () => {});
    const client = database(() => ({ rows: [{ id: 1 }] }));
    await req.finalizeIdempotency(client, 200, { success: true });
    assert.equal(validated.length, 1);
    assert.equal(validated[0].req, req);
    assert.equal(validated[0].client, client);
});

test('transaction session revocation aborts finalize with stable denial', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/creator/inbox/read'],
        async validateTransactionalRequest() {
            return { status: 403, message: 'Authorization revoked' };
        }
    });
    const req = request();
    await middleware(req, response(), () => {});
    const client = database(() => assert.fail('update must not run'));
    await assert.rejects(req.finalizeIdempotency(client, 200, { success: true }), error => {
        assert.equal(error.code, 'TRANSACTIONAL_SESSION_INVALID');
        return true;
    });
    assert.deepEqual(req.idempotencyTransactionDenial, {
        status: 403,
        body: { success: false, message: 'Authorization revoked' }
    });
    assert.equal(client.calls.length, 0);
});

test('successful JSON response finalizes durable response asynchronously', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    const res = response();
    await middleware(req, res, () => {});
    res.status(201).json({ success: true, messageId: 9 });
    await flush();
    const update = pool.calls.find(call => /SET status = 'completed'/.test(call.sql));
    assert.ok(update);
    assert.equal(update.values[2], 201);
    assert.equal(update.values[3], JSON.stringify({ success: true, messageId: 9 }));
    assert.equal(res.headers.get('idempotency-status'), 'created');
    assert.deepEqual(res.calls.at(-1).body, { success: true, messageId: 9 });
});

test('successful send response finalizes the same status and body', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    const res = response();
    await middleware(req, res, () => {});
    res.status(202).send('accepted');
    await flush();
    const update = pool.calls.find(call => /SET status = 'completed'/.test(call.sql));
    assert.ok(update);
    assert.equal(update.values[2], 202);
    assert.equal(update.values[3], JSON.stringify('accepted'));
    assert.equal(res.calls.at(-1).type, 'send');
    assert.equal(res.calls.at(-1).body, 'accepted');
});

test('server error response records indeterminate instead of retrying business work', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    const res = response();
    await middleware(req, res, () => {});
    res.status(503).json({ success: false, message: 'Database unavailable' });
    await flush();
    const update = pool.calls.find(call => /status = 'indeterminate'/.test(call.sql));
    assert.ok(update);
    assert.equal(update.values[2], JSON.stringify({
        success: false,
        message: '请求处理结果无法自动确认，请联系管理员核对账务'
    }));
    assert.equal(res.headers.get('idempotency-status'), 'created');
    assert.equal(res.calls.at(-1).status, 503);
});

test('response wrapper finalizes at most once across json then end', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const req = request();
    const res = response();
    await middleware(req, res, () => {});
    res.json({ success: true });
    res.end();
    await flush();
    const updates = pool.calls.filter(call => /UPDATE idempotency_keys/.test(call.sql));
    assert.equal(updates.length, 1);
    assert.equal(res.calls.filter(call => call.type === 'json').length, 1);
    assert.equal(res.calls.filter(call => call.type === 'end').length, 1);
});

test('transactional denial replaces nominal success response', async () => {
    const pool = insertedPool();
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/creator/inbox/read'],
        async validateTransactionalRequest() {
            return { status: 401, message: 'Session expired' };
        }
    });
    const req = request();
    const res = response();
    await middleware(req, res, () => {});
    await assert.rejects(req.finalizeIdempotency(database(), 200, { success: true }));
    res.status(200).json({ success: true });
    await flush();
    assert.equal(res.calls.at(-1).status, 401);
    assert.deepEqual(res.calls.at(-1).body, { success: false, message: 'Session expired' });
});

test('middleware database failure returns service unavailable without business handler', async () => {
    const pool = database(() => {
        throw new Error('database down');
    });
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/creator/inbox/read'] });
    const res = response();
    let nextCalls = 0;
    const original = console.error;
    console.error = () => {};
    try {
        await middleware(request(), res, () => { nextCalls += 1; });
    } finally {
        console.error = original;
    }
    assert.equal(nextCalls, 0);
    assert.equal(res.calls.at(-1).status, 503);
    assert.equal(res.calls.at(-1).body.success, false);
});

test('retry query succeeds immediately without duplicate calls', async () => {
    const pool = database(() => ({ rows: [{ id: 1 }] }));
    const result = await retryQuery(pool, 'SELECT 1', [9]);
    assert.deepEqual(result.rows, [{ id: 1 }]);
    assert.equal(pool.calls.length, 1);
    assert.deepEqual(pool.calls[0].values, [9]);
});

test('retry query recovers after transient failures', async () => {
    let attempts = 0;
    const pool = database(() => {
        attempts += 1;
        if (attempts < 3) throw new Error('transient');
        return { rows: [{ id: 3 }] };
    });
    const result = await retryQuery(pool, 'UPDATE value', []);
    assert.deepEqual(result.rows, [{ id: 3 }]);
    assert.equal(attempts, 3);
});

test('retry query stops after five failed attempts and rethrows last error', async () => {
    let attempts = 0;
    const pool = database(() => {
        attempts += 1;
        throw Object.assign(new Error(`failure-${attempts}`), { attempt: attempts });
    });
    await assert.rejects(retryQuery(pool, 'UPDATE value', []), error => {
        assert.equal(error.message, 'failure-5');
        assert.equal(error.attempt, 5);
        return true;
    });
    assert.equal(attempts, 5);
});
