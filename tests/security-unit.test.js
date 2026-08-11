const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { parseCookies, decodeSignedSessionCookie } = require('../lib/session-auth');
const {
    createIdempotencyMiddleware,
    hashRequest,
    retryQuery,
    stableStringify
} = require('../lib/idempotency');
const BalanceLogger = require('../balance-logger');

function signSessionId(sessionId, secret) {
    const signature = crypto.createHmac('sha256', secret)
        .update(sessionId)
        .digest('base64')
        .replace(/=+$/, '');
    return `s:${sessionId}.${signature}`;
}

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
