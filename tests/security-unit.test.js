const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { parseCookies, decodeSignedSessionCookie } = require('../lib/session-auth');
const {
    getClientIp,
    isTrustedProxyAddress,
    normalizeIp
} = require('../lib/client-ip');
const {
    createIdempotencyMiddleware,
    hashRequest,
    retryQuery,
    stableStringify
} = require('../lib/idempotency');
const BalanceLogger = require('../balance-logger');
const { requestContextMiddleware, setRequestId } = require('../lib/request-context');
const {
    clampInteger,
    normalizeRoute,
    normalizeTimestamp,
    sanitizeMetadata,
    sanitizePreferences
} = require('../lib/ux-analytics');

function signSessionId(sessionId, secret) {
    const signature = crypto.createHmac('sha256', secret)
        .update(sessionId)
        .digest('base64')
        .replace(/=+$/, '');
    return `s:${sessionId}.${signature}`;
}

test('client IP normalization handles mapped IPv4 and bracketed IPv6', () => {
    assert.equal(normalizeIp('::ffff:203.0.113.9'), '203.0.113.9');
    assert.equal(normalizeIp('[2001:db8::5]:443'), '2001:db8::5');
    assert.equal(normalizeIp('not-an-ip'), null);
});

test('private and loopback ingress addresses are recognized as trusted proxies', () => {
    assert.equal(isTrustedProxyAddress('10.28.232.2'), true);
    assert.equal(isTrustedProxyAddress('172.20.1.5'), true);
    assert.equal(isTrustedProxyAddress('::1'), true);
    assert.equal(isTrustedProxyAddress('203.0.113.20'), false);
});

test('Render proxy chain resolves to the first forwarded client IP', () => {
    const req = {
        headers: { 'x-forwarded-for': '203.0.113.40, 172.68.1.2, 10.28.232.2' },
        socket: { remoteAddress: '10.20.30.40' },
        ip: '10.28.232.2'
    };
    assert.equal(getClientIp(req, { trustForwardedHeaders: true }), '203.0.113.40');
});

test('forwarded client IP is ignored when the direct peer is not a trusted proxy', () => {
    const req = {
        headers: { 'x-forwarded-for': '192.0.2.99' },
        socket: { remoteAddress: '198.51.100.25' },
        ip: '192.0.2.99'
    };
    assert.equal(getClientIp(req, { trustForwardedHeaders: true }), '198.51.100.25');
});

test('malformed first forwarded value falls back instead of trusting a later value', () => {
    const req = {
        headers: { 'x-forwarded-for': 'spoofed, 203.0.113.40' },
        socket: { remoteAddress: '10.20.30.40' },
        ip: '10.20.30.40'
    };
    assert.equal(getClientIp(req, { trustForwardedHeaders: true }), '10.20.30.40');
});

test('UX routes drop query strings and reject control characters', () => {
    assert.equal(normalizeRoute('/wish?token=secret#result'), '/wish');
    assert.equal(normalizeRoute('https://example.com/private'), '/unknown');
    assert.equal(normalizeRoute('/wish\nforged'), '/unknown');
});

test('UX integer and timestamp values are bounded', () => {
    assert.equal(clampInteger(null, 1, 100, null), null);
    assert.equal(clampInteger(500, 1, 100, 0), 100);
    const now = new Date('2026-08-12T12:00:00.000Z');
    assert.equal(
        normalizeTimestamp('2020-01-01T00:00:00.000Z', { now, maxPastMs: 1000 }).toISOString(),
        '2026-08-12T11:59:59.000Z'
    );
});

test('UX preferences retain safe capabilities and clamp dimensions', () => {
    assert.deepEqual(sanitizePreferences({
        deviceType: 'mobile',
        browserLanguage: 'zh-CN',
        preferredLanguages: ['zh-CN', 'en-CA', 'zh-CN', '<bad>'],
        screenWidth: 99999,
        viewportHeight: 844,
        colorScheme: 'dark',
        reducedMotion: true
    }), {
        deviceType: 'mobile',
        platform: null,
        browserLanguage: 'zh-CN',
        preferredLanguages: ['zh-CN', 'en-CA'],
        appLanguage: null,
        timezone: null,
        timezoneOffsetMinutes: 0,
        screenWidth: 20000,
        screenHeight: null,
        viewportWidth: null,
        viewportHeight: 844,
        pixelRatio: null,
        orientation: null,
        colorScheme: 'dark',
        reducedMotion: true,
        highContrast: false,
        touchCapable: false,
        cookiesEnabled: false,
        standalone: false,
        hardwareConcurrency: null,
        deviceMemoryGb: null,
        connectionType: null,
        saveData: false
    });
});

test('UX metadata drops nested objects and unsafe keys', () => {
    assert.deepEqual(sanitizeMetadata({
        game: 'quiz',
        success: true,
        durationMs: 42,
        nested: { answer: 'private' },
        'bad-key': 'ignored'
    }), { game: 'quiz', success: true, durationMs: 42 });
});

test('cookie parsing preserves encoded values containing equals signs', () => {
    assert.deepEqual(parseCookies('a=1; token=abc%3D%3D; broken=%E0%A4%A'), {
        a: '1',
        token: 'abc==',
        broken: '%E0%A4%A'
    });
});

test('signed session cookies reject tampering', () => {
    const secret = 'test-secret-with-enough-entropy';
    const signed = signSessionId('session-id', secret);
    assert.equal(decodeSignedSessionCookie(signed, secret), 'session-id');
    assert.equal(decodeSignedSessionCookie(`${signed}x`, secret), null);
    assert.equal(decodeSignedSessionCookie(signed, `${secret}-wrong`), null);
});

test('idempotency hashes are stable across object key order', () => {
    const first = { method: 'POST', path: '/api/slot/play', body: { bet: 5, mode: 'a' } };
    const second = { method: 'POST', path: '/api/slot/play', body: { mode: 'a', bet: 5 } };
    assert.equal(hashRequest(first), hashRequest(second));
    assert.notEqual(hashRequest(first), hashRequest({ ...second, body: { mode: 'a', bet: 6 } }));
});

test('stable stringify retains array order and sorts object keys', () => {
    assert.equal(stableStringify({ z: [2, 1], a: true }), '{"a":true,"z":[2,1]}');
});

test('idempotency middleware replays a completed response without rerunning the action', async () => {
    const records = new Map();
    const pool = {
        async query(sql, values) {
            const statement = String(sql);
            const recordKey = `${values[0]}:${values[1]}`;
            if (statement.includes('INSERT INTO idempotency_keys')) {
                if (records.has(recordKey)) return { rows: [] };
                records.set(recordKey, { request_hash: values[4], status: 'pending' });
                return { rows: [{ id: 1 }] };
            }
            if (statement.includes('SELECT request_hash')) {
                return { rows: [records.get(recordKey)] };
            }
            if (statement.includes('UPDATE idempotency_keys')) {
                records.set(recordKey, {
                    ...records.get(recordKey),
                    status: 'completed',
                    response_status: values[2],
                    response_body: JSON.parse(values[3])
                });
                return { rows: [] };
            }
            throw new Error(`Unexpected query: ${statement}`);
        }
    };
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/slot/play'] });
    let actionRuns = 0;

    const invoke = () => new Promise((resolve, reject) => {
        const headers = {};
        const req = {
            method: 'POST',
            path: '/api/slot/play',
            body: { bet: 5 },
            session: { user: { username: 'tester' } },
            get: (name) => name === 'Idempotency-Key' ? 'request-key-1234' : undefined
        };
        const res = {
            statusCode: 200,
            headersSent: false,
            set(name, value) {
                headers[name] = value;
                return this;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                resolve({ body, headers, status: this.statusCode });
                return this;
            }
        };
        middleware(req, res, () => {
            actionRuns += 1;
            res.status(201).json({ success: true, spin: 7 });
        }).catch(reject);
    });

    const first = await invoke();
    const replay = await invoke();
    assert.equal(actionRuns, 1);
    assert.deepEqual(first.body, { success: true, spin: 7 });
    assert.equal(first.headers['Idempotency-Status'], 'created');
    assert.deepEqual(replay.body, first.body);
    assert.equal(replay.status, 201);
    assert.equal(replay.headers['Idempotency-Status'], 'replayed');
});

test('idempotency finalization retries transient database failures', async () => {
    let attempts = 0;
    const result = await retryQuery({
        async query() {
            attempts += 1;
            if (attempts < 3) throw new Error('temporary failure');
            return { rows: [{ ok: true }] };
        }
    }, 'SELECT 1', []);

    assert.equal(attempts, 3);
    assert.deepEqual(result.rows, [{ ok: true }]);
});

test('idempotency can be finalized by the same transaction as the business write', async () => {
    const pool = {
        async query(sql) {
            if (String(sql).includes('INSERT INTO idempotency_keys')) return { rows: [{ id: 9 }] };
            throw new Error(`Unexpected pool query: ${sql}`);
        }
    };
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/slot/play'] });
    const transactionQueries = [];
    const client = {
        async query(sql, values) {
            transactionQueries.push({ sql: String(sql), values });
            return { rows: [{ id: 9 }] };
        }
    };
    const req = {
        method: 'POST',
        path: '/api/slot/play',
        body: { bet: 5 },
        session: { user: { username: 'tester' } },
        get: () => 'transaction-key-1234'
    };

    await new Promise((resolve, reject) => {
        const res = {
            statusCode: 200,
            set() { return this; },
            status(code) { this.statusCode = code; return this; },
            json() { return this; }
        };
        middleware(req, res, async () => {
            try {
                await req.finalizeIdempotency(client, 200, { success: true, spin: 7 });
                resolve();
            } catch (error) {
                reject(error);
            }
        }).catch(reject);
    });

    assert.equal(transactionQueries.length, 1);
    assert.match(transactionQueries[0].sql, /status = 'completed'/);
    assert.deepEqual(transactionQueries[0].values, [
        'tester',
        'transaction-key-1234',
        200,
        JSON.stringify({ success: true, spin: 7 })
    ]);
});

test('an ambiguous commit error replays the transactionally committed response', async () => {
    let record = null;
    const pool = {
        async query(sql, values) {
            const statement = String(sql);
            if (statement.includes('INSERT INTO idempotency_keys')) {
                record = { status: 'pending', request_hash: values[4] };
                return { rows: [{ id: 11 }] };
            }
            if (statement.includes('DELETE FROM idempotency_keys')) {
                if (record?.status === 'pending') {
                    record = null;
                    return { rows: [{ id: 11 }] };
                }
                return { rows: [] };
            }
            if (statement.includes('SELECT response_status')) {
                return { rows: record?.status === 'completed' ? [record] : [] };
            }
            throw new Error(`Unexpected pool query: ${statement}`);
        }
    };
    const transactionClient = {
        async query(sql, values) {
            assert.match(String(sql), /status = 'completed'/);
            record = {
                ...record,
                status: 'completed',
                response_status: values[2],
                response_body: JSON.parse(values[3])
            };
            return { rows: [{ id: 11 }] };
        }
    };
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/duel/play'] });
    const result = await new Promise((resolve, reject) => {
        const headers = {};
        const req = {
            method: 'POST',
            path: '/api/duel/play',
            body: { power: 10 },
            session: { user: { username: 'tester' } },
            get: () => 'ambiguous-commit-key-1234'
        };
        const res = {
            statusCode: 200,
            headersSent: false,
            set(name, value) { headers[name] = value; return this; },
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ body, headers, status: this.statusCode }); return this; }
        };
        middleware(req, res, async () => {
            try {
                await req.finalizeIdempotency(transactionClient, 200, { success: true, reward: 50 });
                res.status(500).json({ success: false, message: 'commit acknowledgement lost' });
            } catch (error) {
                reject(error);
            }
        }).catch(reject);
    });

    assert.equal(result.status, 200);
    assert.equal(result.headers['Idempotency-Status'], 'replayed');
    assert.deepEqual(result.body, { success: true, reward: 50 });
});

test('indeterminate idempotency records are never executed again', async () => {
    const req = {
        method: 'POST',
        path: '/api/wish/play',
        body: { giftType: 'test' },
        session: { user: { username: 'tester' } },
        get: () => 'indeterminate-key-1234'
    };
    const pool = {
        async query(sql) {
            if (String(sql).includes('INSERT INTO idempotency_keys')) return { rows: [] };
            return {
                rows: [{
                    request_hash: hashRequest(req),
                    status: 'indeterminate',
                    response_status: 409,
                    response_body: { success: false, message: 'manual review' }
                }]
            };
        }
    };
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    let actionRuns = 0;
    const result = await new Promise((resolve, reject) => {
        const headers = {};
        const res = {
            statusCode: 200,
            set(name, value) { headers[name] = value; return this; },
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ body, headers, status: this.statusCode }); return this; }
        };
        middleware(req, res, () => { actionRuns += 1; }).catch(reject);
    });

    assert.equal(actionRuns, 0);
    assert.equal(result.status, 409);
    assert.equal(result.headers['Idempotency-Status'], 'indeterminate');
    assert.equal(result.body.message, 'manual review');
});

test('a concurrent duplicate gets a pending response and does not enter the action', async () => {
    const req = {
        method: 'POST',
        path: '/api/scratch/play',
        body: { tier: 10 },
        session: { user: { username: 'tester' } },
        get: () => 'concurrent-key-1234'
    };
    const pool = {
        async query(sql) {
            if (String(sql).includes('INSERT INTO idempotency_keys')) return { rows: [] };
            return {
                rows: [{
                    request_hash: hashRequest(req),
                    status: 'pending'
                }]
            };
        }
    };
    const middleware = createIdempotencyMiddleware({ pool, paths: [req.path] });
    let actionRuns = 0;
    const result = await new Promise((resolve, reject) => {
        const headers = {};
        const res = {
            statusCode: 200,
            set(name, value) {
                headers[name] = value;
                return this;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                resolve({ body, headers, status: this.statusCode });
                return this;
            }
        };
        middleware(req, res, () => {
            actionRuns += 1;
        }).catch(reject);
    });

    assert.equal(actionRuns, 0);
    assert.equal(result.status, 409);
    assert.equal(result.headers['Idempotency-Status'], 'pending');
});

test('an idempotency replay is denied when current authorization validation fails', async () => {
    let selectedResponse = false;
    const pool = {
        async query(sql) {
            if (String(sql).includes('INSERT INTO idempotency_keys')) return { rows: [] };
            selectedResponse = true;
            return { rows: [] };
        }
    };
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/admin/reset-password'],
        validateExistingRequest: async () => ({ status: 403, message: 'admin revoked' })
    });
    const result = await new Promise((resolve, reject) => {
        const req = {
            method: 'POST',
            path: '/api/admin/reset-password',
            body: { username: 'target' },
            session: { user: { username: 'former-admin' } },
            get: () => 'admin-request-1234'
        };
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                resolve({ body, status: this.statusCode });
                return this;
            }
        };
        middleware(req, res, () => reject(new Error('action should not run'))).catch(reject);
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.message, 'admin revoked');
    assert.equal(selectedResponse, false);
});

test('managed balance updates release their savepoint on insufficient funds', async () => {
    const statements = [];
    const client = {
        async query(sql) {
            const normalized = String(sql).trim().replace(/\s+/g, ' ');
            statements.push(normalized);
            if (normalized.startsWith('UPDATE users')) return { rows: [] };
            return { rows: [] };
        }
    };

    const result = await BalanceLogger.updateBalance({
        username: 'test-user',
        amount: -10,
        operationType: 'test',
        client,
        managedTransaction: true
    });

    assert.equal(result.success, false);
    assert.deepEqual(statements, [
        'SAVEPOINT balance_update_1',
        'UPDATE users SET balance = balance + $2 WHERE username = $1 AND balance >= $3 RETURNING balance',
        'ROLLBACK TO SAVEPOINT balance_update_1',
        'RELEASE SAVEPOINT balance_update_1'
    ]);
});

test('a failed ledger insert rolls the balance update back to its savepoint', async () => {
    const statements = [];
    const client = {
        async query(sql) {
            const normalized = String(sql).trim().replace(/\s+/g, ' ');
            statements.push(normalized);
            if (normalized.startsWith('UPDATE users')) return { rows: [{ balance: 90 }] };
            if (normalized.startsWith('INSERT INTO balance_logs')) throw new Error('ledger unavailable');
            return { rows: [] };
        }
    };

    const result = await BalanceLogger.updateBalance({
        username: 'test-user',
        amount: -10,
        operationType: 'test',
        client,
        managedTransaction: true
    });

    assert.equal(result.success, false);
    assert.deepEqual(statements, [
        'SAVEPOINT balance_update_1',
        'UPDATE users SET balance = balance + $2 WHERE username = $1 AND balance >= $3 RETURNING balance',
        'INSERT INTO balance_logs ( username, operation_type, amount, balance_before, balance_after, description, game_data, ip_address, user_agent, request_id ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        'ROLLBACK TO SAVEPOINT balance_update_1',
        'RELEASE SAVEPOINT balance_update_1'
    ]);
});

test('balance ledger entries inherit the request id from async request context', async () => {
    let insertedValues = null;
    const client = {
        async query(sql, values) {
            const normalized = String(sql).trim().replace(/\s+/g, ' ');
            if (normalized.startsWith('UPDATE users')) return { rows: [{ balance: 110 }] };
            if (normalized.startsWith('INSERT INTO balance_logs')) insertedValues = values;
            return { rows: [] };
        }
    };

    const result = await new Promise((resolve, reject) => {
        requestContextMiddleware({}, {}, async () => {
            try {
                setRequestId('request-context-key-1234');
                resolve(await BalanceLogger.updateBalance({
                    username: 'test-user',
                    amount: 10,
                    operationType: 'test',
                    client,
                    managedTransaction: true
                }));
            } catch (error) {
                reject(error);
            }
        });
    });

    assert.equal(result.success, true);
    assert.equal(insertedValues[9], 'request-context-key-1234');
});
