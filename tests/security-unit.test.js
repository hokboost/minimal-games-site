const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const { parseCookies, decodeSignedSessionCookie } = require('../lib/session-auth');
const {
    getClientIp,
    isTrustedProxyAddress,
    normalizeIp
} = require('../lib/client-ip');
const {
    createIdempotencyMiddleware,
    bodyForHash,
    hashRequest,
    retryQuery,
    stableStringify
} = require('../lib/idempotency');
const BalanceLogger = require('../balance-logger');
const { requestContextMiddleware, setRequestId } = require('../lib/request-context');
const {
    canonicalRequest,
    signRequest,
    signaturesMatch
} = require('../lib/request-signature');
const {
    clampInteger,
    normalizeRoute,
    normalizeTimestamp,
    sanitizeMetadata,
    sanitizePreferences
} = require('../lib/ux-analytics');
const {
    computeTicketCount,
    createSpendHash,
    normalizeGiftItems
} = require('../lib/pk-spend');
const { decodeBase32, generateTotp, matchTotpCounter, verifyTotp } = require('../lib/totp');
const gameRegistry = require('../domain/games');
const {
    assertRtp,
    assertTargetRtp,
    maximumFlipPolicyEconomics,
    maximumStonePolicyEconomics,
    optimalFlipEconomics,
    weightedRtp,
    wishRtp
} = gameRegistry.economics;
const { parseWorkerCredentials } = require('../lib/worker-credentials');
const { getAdminTotpSecret, parseAdminTotpSecrets } = require('../lib/admin-mfa');
const { createConcurrencyGuard } = require('../lib/concurrency-guard');
const { multiplyMoney, parseInteger, parseMoney } = require('../lib/integer-money');
const { randomArrayIndex, randomArrayItem } = require('../lib/random-index');
const { runWishSimulation } = require('../lib/wish-simulation');
const { BoundedSemaphore } = require('../lib/bounded-semaphore');
const { cleanString, sanitizeLogValue } = require('../lib/safe-logger');
const {
    createAdminFailureAuditMiddleware,
    scopedAuditRequestId
} = require('../lib/admin-audit-failure');
const GameLogic = require('../data/gameLogic');
const {
    WindowsGiftListener,
    createChildEnvironment,
    createWorkerInstanceId,
    isWorkerLeaseError,
    waitForChildSpawn
} = require('../windows-gift-listener');
const {
    validateServerEnvironment,
    validateWorkerEnvironment
} = require('../lib/config-validation');
const { reachTestFaultPoint } = require('../lib/test-fault-injection');
const { BilibiliCookieManager } = require('../bilibili-cookie-manager');
const {
    applyTrackedMigration,
    migrationTransactionBody
} = require('../lib/database-migrations');

async function withEnvironment(overrides, callback) {
    const previous = new Map();
    for (const [name, value] of Object.entries(overrides)) {
        previous.set(name, process.env[name]);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    try {
        return await callback();
    } finally {
        for (const [name, value] of previous) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
}

test('child process launch waits for an explicit spawn confirmation', async () => {
    const child = new EventEmitter();
    const launched = waitForChildSpawn(child, 100);
    queueMicrotask(() => child.emit('spawn'));
    await launched;
});

test('child process launch rejects asynchronous spawn failures', async () => {
    const child = new EventEmitter();
    const launched = waitForChildSpawn(child, 100);
    queueMicrotask(() => child.emit('error', new Error('spawn ENOENT')));
    await assert.rejects(launched, /spawn ENOENT/);
});

test('worker instances use distinct lease identities on the same host', () => {
    const first = createWorkerInstanceId('windows-host', 'ignored', 'a'.repeat(16));
    const second = createWorkerInstanceId('windows-host', 'ignored', 'b'.repeat(16));
    assert.equal(first, `windows-host:${'a'.repeat(16)}`);
    assert.notEqual(first, second);
    assert.equal(isWorkerLeaseError({ response: { data: { code: 'WORKER_LEASE_HELD' } } }), true);
});

function signSessionId(sessionId, secret) {
    const signature = crypto.createHmac('sha256', secret)
        .update(sessionId)
        .digest('base64')
        .replace(/=+$/, '');
    return `s:${sessionId}.${signature}`;
}

test('safe logger blocks log injection and redacts secrets and identifiers', () => {
    const clean = cleanString('line1\nline2 cookie=abc password:xyz Bearer token-value');
    assert.equal(clean.includes('\n'), false);
    assert.match(clean, /cookie=\[REDACTED\]/i);
    assert.match(clean, /password:\[REDACTED\]/i);
    assert.match(clean, /Bearer \[REDACTED\]/);

    const sanitized = sanitizeLogValue({
        username: 'private-user',
        clientIP: '203.0.113.2',
        cookie: 'private-cookie',
        nested: { apiKey: 'private-key' }
    });
    assert.match(sanitized.username, /^id:[a-f0-9]{12}$/);
    assert.match(sanitized.clientIP, /^id:[a-f0-9]{12}$/);
    assert.equal(sanitized.cookie, '[REDACTED]');
    assert.equal(sanitized.nested.apiKey, '[REDACTED]');
});

test('failed admin mutations are audited once without request body data', async () => {
    const queries = [];
    const pool = { query: async (sql, values) => { queries.push({ sql, values }); } };
    const middleware = createAdminFailureAuditMiddleware(pool);
    const req = {
        method: 'POST',
        path: '/api/admin/update-balance',
        requestId: 'request-id',
        idempotencyKey: 'idempotency-key',
        clientIP: '203.0.113.2',
        body: { password: 'must-not-be-audited' },
        session: { user: { username: 'admin-user' } }
    };
    const res = new EventEmitter();
    res.statusCode = 400;
    res.writableFinished = true;
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    res.emit('finish');
    res.emit('close');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(nextCalled, true);
    assert.equal(queries.length, 1);
    assert.equal(queries[0].values[0], scopedAuditRequestId('admin-user', 'idempotency-key'));
    assert.equal(queries[0].values.join(' ').includes('must-not-be-audited'), false);
});

test('paid action concurrency guard caps requests and releases every terminal response once', () => {
    const pool = {
        query: async () => ({ rows: [] }),
        options: { max: 20 },
        totalCount: 1,
        idleCount: 1,
        waitingCount: 0
    };
    const guard = createConcurrencyGuard({
        pool,
        maxInFlight: 1,
        maxPerUser: 1,
        maxPoolWaiters: 0,
        maxEventLoopLagMs: 5000
    });
    assert.equal(guard.start(), true);
    assert.equal(guard.start(), false);
    const response = () => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = {};
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
            return res;
        };
        return res;
    };
    const req = { session: { user: { username: 'tester' } } };
    const first = response();
    let runs = 0;
    guard(req, first, () => { runs += 1; });
    assert.equal(guard.getStats().active, 1);

    const rejected = response();
    guard(req, rejected, () => { runs += 1; });
    assert.equal(rejected.statusCode, 503);
    assert.equal(rejected.headers['Retry-After'], '2');
    assert.equal(runs, 1);

    first.emit('finish');
    first.emit('close');
    assert.equal(guard.getStats().active, 0);
    const resumed = response();
    guard(req, resumed, () => { runs += 1; });
    assert.equal(runs, 2);
    resumed.emit('close');
    assert.equal(guard.getStats().active, 0);
    assert.equal(guard.close(), true);
    assert.equal(guard.close(), false);
});

test('money parsing accepts exact database integers and rejects truncation or overflow', () => {
    assert.equal(parseMoney('9007199254740991', 'balance'), Number.MAX_SAFE_INTEGER);
    assert.equal(parseInteger('10', 'count', { min: 1, max: 10 }), 10);
    assert.equal(multiplyMoney('500', 10, 'batch cost'), 5000);
    assert.throws(() => parseMoney('1.5', 'balance'), /must be an integer/);
    assert.throws(() => parseMoney('9007199254740992', 'balance'), /supported integer range/);
    assert.throws(() => multiplyMoney(Number.MAX_SAFE_INTEGER, 2), /supported integer range/);
});

test('array random selection uses an exclusive upper bound and can select the final item', () => {
    const calls = [];
    const chooseLast = (minimum, maximum) => {
        calls.push([minimum, maximum]);
        return maximum - 1;
    };

    assert.equal(randomArrayIndex(5, chooseLast), 4);
    assert.equal(randomArrayItem(['first', 'middle', 'last'], chooseLast), 'last');
    assert.deepEqual(calls, [[0, 5], [0, 3]]);
    assert.throws(() => randomArrayIndex(0), /positive safe integer/);
    assert.throws(() => randomArrayItem([]), /empty array/);
});

test('migration runner owns transaction boundaries and localizes dump settings', () => {
    const body = migrationTransactionBody(`
        BEGIN;
        SET statement_timeout = 0;
        SET row_security = off;
        SELECT 1;
        COMMIT;
    `);
    assert.doesNotMatch(body, /BEGIN|COMMIT|SET statement_timeout/);
    assert.match(body, /SET LOCAL row_security = off/);
    assert.match(body, /SELECT 1/);
});

test('migration runner preserves an applied marker after a lost COMMIT response', async () => {
    let state = null;
    let failedWrites = 0;
    const client = {
        async query(sql) {
            const normalized = String(sql).trim().replace(/\s+/g, ' ');
            if (normalized.startsWith('SELECT checksum, status')) return { rows: [] };
            if (normalized.startsWith('INSERT INTO minimal_games_schema_migrations')) {
                state = 'running';
                return { rowCount: 1, rows: [] };
            }
            if (normalized.includes("SET status = 'applied'")) {
                state = 'applied';
                return { rowCount: 1, rows: [] };
            }
            if (normalized === 'COMMIT') {
                throw new Error('connection lost after commit');
            }
            if (normalized.startsWith('SELECT status FROM minimal_games_schema_migrations')) {
                return { rows: [{ status: state }] };
            }
            if (normalized.includes("SET status = 'failed'")) {
                failedWrites += 1;
            }
            return { rowCount: 0, rows: [] };
        }
    };

    await applyTrackedMigration(client, 'add_registration_ip.sql', () => {});
    assert.equal(state, 'applied');
    assert.equal(failedWrites, 0);
});

test('wish simulation runs off the main thread and preserves guarantee boundaries', async () => {
    const result = await runWishSimulation({
        count: 500,
        successRate: 0,
        guaranteeThreshold: 0,
        timeoutMs: 2000
    });
    assert.deepEqual(result, { successCount: 500, consecutiveFails: 0 });
});

test('bounded semaphore serializes side effects and releases exactly once', async () => {
    const semaphore = new BoundedSemaphore(1);
    const releaseFirst = await semaphore.acquire();
    let secondAcquired = false;
    const second = semaphore.acquire(1000).then((release) => {
        secondAcquired = true;
        return release;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(secondAcquired, false);
    await assert.rejects(semaphore.acquire(1000), /queue is full/);
    releaseFirst();
    releaseFirst();
    const releaseSecond = await second;
    assert.equal(secondAcquired, true);
    releaseSecond();
    semaphore.close();
    await assert.rejects(semaphore.acquire(), /closed/);
});

test('worker child processes receive an allowlist instead of application secrets', async () => {
    await withEnvironment({
        PATH: '/safe/bin',
        LANG: 'zh_CN.UTF-8',
        DB_PASS: 'database-secret',
        SESSION_SECRET: 'session-secret',
        WORKER_API_KEY: 'worker-api-secret',
        WORKER_HMAC_SECRET: 'worker-hmac-secret'
    }, async () => {
        const environment = createChildEnvironment({ THREESERVER_PORT: '9876' });
        assert.equal(environment.PATH, '/safe/bin');
        assert.equal(environment.LANG, 'zh_CN.UTF-8');
        assert.equal(environment.THREESERVER_PORT, '9876');
        assert.equal(environment.DB_PASS, undefined);
        assert.equal(environment.SESSION_SECRET, undefined);
        assert.equal(environment.WORKER_API_KEY, undefined);
        assert.equal(environment.WORKER_HMAC_SECRET, undefined);
    });
});

test('external threeserver helpers are checksum-pinned with the entry script', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-games-threeserver-'));
    const bundledDirectory = path.join(__dirname, '..', 'workers', 'bilibili');
    const entryPath = path.join(directory, 'threeserver.py');
    const helperPath = path.join(directory, 'cookie_store.py');
    fs.copyFileSync(path.join(bundledDirectory, 'threeserver.py'), entryPath);
    fs.copyFileSync(path.join(bundledDirectory, 'cookie_store.py'), helperPath);
    const listener = Object.create(WindowsGiftListener.prototype);
    try {
        await withEnvironment({ THREESERVER_SCRIPT: entryPath }, async () => {
            assert.equal(
                listener.resolveVersionedScript('THREESERVER_SCRIPT', 'threeserver.py', ['cookie_store.py']),
                entryPath
            );
            fs.appendFileSync(helperPath, '\n# tampered\n');
            assert.throws(
                () => listener.resolveVersionedScript('THREESERVER_SCRIPT', 'threeserver.py', ['cookie_store.py']),
                /当前发布版本/
            );
        });
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('normal gift sender launches a dynamic room-bound HTTP threeserver before use', async () => {
    const child = new EventEmitter();
    Object.assign(child, {
        pid: 43210,
        exitCode: null,
        signalCode: null,
        stdout: { resume() {} },
        stderr: { resume() {} }
    });
    const listener = Object.create(WindowsGiftListener.prototype);
    Object.assign(listener, {
        allowedGiftIds: ['31036', '31122'],
        shuttingDown: false,
        threeServerProcess: null,
        threeServerProcessRoomId: null,
        threeServerUrl: null,
        threeServerToken: null,
        threeServerRoomId: null
    });
    listener.getFreePort = async () => 45678;
    listener.ensureRoomConfig = async (roomId) => {
        assert.equal(roomId, '123456');
        return 'C:/private/config.room.json';
    };
    let launchOptions;
    listener.launchGiftThreeServer = (options) => {
        launchOptions = options;
        queueMicrotask(() => child.emit('spawn'));
        return child;
    };
    listener.waitForThreeServerRoom = async (roomId, timeoutMs, url, token) => {
        assert.equal(roomId, '123456');
        assert.equal(timeoutMs, 20000);
        assert.equal(url, 'http://127.0.0.1:45678');
        assert.equal(token, launchOptions.backendToken);
        return true;
    };
    const terminated = [];
    listener.terminateProcessTree = async (pid) => terminated.push(pid);

    const url = await listener.ensureGiftThreeServer('123456');
    assert.equal(url, 'http://127.0.0.1:45678');
    assert.equal(launchOptions.configPath, 'C:/private/config.room.json');
    assert.equal(launchOptions.backendPort, 45678);
    assert.match(launchOptions.backendToken, /^[a-f0-9]{64}$/);
    assert.equal(listener.threeServerProcessRoomId, '123456');
    assert.equal(listener.threeServerRoomId, '123456');

    await listener.stopThreeServerProcess();
    assert.deepEqual(terminated, [43210]);
    assert.equal(listener.threeServerProcess, null);
    assert.equal(listener.threeServerUrl, null);
});

test('normal gift sender preflight failure stays refundable and never crosses the send boundary', async () => {
    const listener = Object.create(WindowsGiftListener.prototype);
    Object.assign(listener, {
        activeGiftTask: null,
        allowedGiftIds: ['31036'],
        externalSendSemaphore: new BoundedSemaphore(1),
        shuttingDown: false
    });
    const events = [];
    listener.ensureGiftThreeServer = async () => {
        events.push('preflight');
        throw new Error('sender startup failed');
    };
    listener.startGiftTask = async () => {
        events.push('start');
        return true;
    };
    listener.sendToThreeServer = async () => {
        events.push('send');
        return { success: true, providerTransactionId: 'must-not-send' };
    };
    listener.markTaskFailed = async (...args) => {
        events.push(`failed:${args[3]}`);
        assert.equal(listener.activeGiftTask.externalSendStarted, false);
        return true;
    };
    listener.markTaskUncertain = async () => events.push('uncertain');

    await listener.processTask({
        id: 17,
        claimToken: 'claim-token-17',
        claimGeneration: 1,
        giftId: '31036',
        quantity: 1,
        roomId: '123456'
    });
    assert.deepEqual(events, ['preflight', 'failed:worker_preflight_failed']);
    assert.equal(listener.activeGiftTask, null);
    listener.externalSendSemaphore.close();
});

test('normal gift sender treats every post-boundary failure as uncertain without fallback', async () => {
    const listener = Object.create(WindowsGiftListener.prototype);
    Object.assign(listener, {
        activeGiftTask: null,
        allowedGiftIds: ['31036'],
        externalSendSemaphore: new BoundedSemaphore(1),
        shuttingDown: false,
        threeServerToken: 'local-token'
    });
    const events = [];
    listener.ensureGiftThreeServer = async () => {
        events.push('preflight');
        return 'http://127.0.0.1:45678';
    };
    listener.startGiftTask = async () => {
        events.push('start');
        return true;
    };
    listener.sendToThreeServer = async () => {
        assert.equal(listener.activeGiftTask.externalSendStarted, true);
        events.push('send');
        return { success: false, error: 'transport_error' };
    };
    listener.markTaskComplete = async () => events.push('complete');
    listener.markTaskFailed = async () => events.push('failed');
    listener.markTaskUncertain = async (...args) => {
        events.push(`uncertain:${args[3]}`);
        return true;
    };

    await listener.processTask({
        id: 18,
        claimToken: 'claim-token-18',
        claimGeneration: 2,
        giftId: '31036',
        quantity: 1,
        roomId: '123456'
    });
    assert.deepEqual(events, [
        'preflight',
        'start',
        'send',
        'uncertain:threeserver_result_uncertain'
    ]);
    listener.externalSendSemaphore.close();
});

test('normal gift sender accepts success only with exactly one provider receipt', async () => {
    let providerReceipts = [];
    const sender = require('node:http').createServer((req, res) => {
        assert.equal(req.headers['x-local-sender-token'], 'test-local-token');
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), {
                gifts: [{ id: '31036', count: 1 }],
                wait: true,
                confirm: 'api'
            });
            const body = JSON.stringify({
                success: true,
                status: 'ok',
                results: providerReceipts.map((providerTransactionId) => ({
                    provider_transaction_id: providerTransactionId
                }))
            });
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            });
            res.end(body);
        });
    });
    await new Promise((resolve) => sender.listen(0, '127.0.0.1', resolve));
    const address = sender.address();
    const listener = Object.create(WindowsGiftListener.prototype);
    try {
        const missing = await listener.sendToThreeServer(
            '31036', 1, `http://127.0.0.1:${address.port}`, 'test-local-token'
        );
        assert.equal(missing.success, false);
        assert.equal(missing.error, 'provider_receipt_missing');

        providerReceipts = ['provider-tx-1', 'provider-tx-2'];
        const ambiguous = await listener.sendToThreeServer(
            '31036', 1, `http://127.0.0.1:${address.port}`, 'test-local-token'
        );
        assert.equal(ambiguous.success, false);
        assert.equal(ambiguous.error, 'provider_receipt_ambiguous');

        providerReceipts = ['provider-tx-1'];
        const confirmed = await listener.sendToThreeServer(
            '31036', 1, `http://127.0.0.1:${address.port}`, 'test-local-token'
        );
        assert.equal(confirmed.success, true);
        assert.equal(confirmed.providerTransactionId, 'provider-tx-1');
    } finally {
        await new Promise((resolve) => sender.close(resolve));
    }
});

test('PK authorization proxy rejects requests without its capability path', async () => {
    const listener = Object.create(WindowsGiftListener.prototype);
    listener.externalSendSemaphore = new BoundedSemaphore(1);
    listener.activePkReportIds = new Set();
    const proxy = await listener.startPkAuthorizationProxy({
        username: 'test-user',
        roomId: '123',
        generationId: 'generation',
        backendUrl: 'http://127.0.0.1:1',
        proxySecret: 'a'.repeat(48)
    });
    try {
        const response = await fetch(proxy.url.replace(/a{48}$/, 'not-authorized'));
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { success: false, error: 'not_found' });
    } finally {
        await new Promise((resolve) => proxy.server.close(resolve));
        listener.externalSendSemaphore.close();
    }
});

test('PK authorization proxy prevents automatic retry after a partial upstream result', async () => {
    const backend = require('node:http').createServer((req, res) => {
        req.resume();
        req.on('end', () => {
            const body = JSON.stringify({
                success: false,
                results: [{ id: 'gift-a', success: true }, { id: 'gift-b', success: false }]
            });
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            });
            res.end(body);
        });
    });
    await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
    const backendAddress = backend.address();
    const listener = Object.create(WindowsGiftListener.prototype);
    listener.externalSendSemaphore = new BoundedSemaphore(1);
    listener.activePkReportIds = new Set();
    const events = [];
    listener.spoolPkReport = (payload, phase) => {
        events.push(`spool:${phase}`);
        return null;
    };
    listener.removeSpooledPkReport = () => {};
    const reports = [];
    listener.postSignedWorkerRequest = async (pathname, payload) => {
        events.push(pathname);
        if (pathname === '/api/pk/report') reports.push(payload);
        return { data: { success: true } };
    };
    const proxy = await listener.startPkAuthorizationProxy({
        username: 'test-user',
        roomId: '123',
        generationId: 'generation',
        backendUrl: `http://127.0.0.1:${backendAddress.port}`,
        proxySecret: 'b'.repeat(48)
    });
    try {
        const response = await fetch(`${proxy.url}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gifts: ['gift-a', 'gift-b'],
                operationId: '1'.repeat(64)
            })
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
            success: false,
            error: 'send_result_uncertain'
        });
        assert.equal(reports.length, 1);
        assert.equal(reports[0].success, false);
        assert.deepEqual(events.slice(0, 4), [
            'spool:intent',
            '/api/pk/authorize',
            '/api/pk/send-start',
            'spool:final'
        ]);
    } finally {
        await new Promise((resolve) => proxy.server.close(resolve));
        await new Promise((resolve) => backend.close(resolve));
        listener.externalSendSemaphore.close();
    }
});

test('PK authorization proxy never resends an operation already known by the server', async () => {
    let backendRequests = 0;
    const backend = require('node:http').createServer((req, res) => {
        backendRequests += 1;
        req.resume();
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success":true}');
        });
    });
    await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
    const listener = Object.create(WindowsGiftListener.prototype);
    listener.externalSendSemaphore = new BoundedSemaphore(1);
    listener.activePkReportIds = new Set();
    listener.spoolPkReport = () => null;
    listener.removeSpooledPkReport = () => {};
    listener.quarantineSpooledPkReport = () => {};
    const calls = [];
    listener.postSignedWorkerRequest = async (pathname, payload) => {
        calls.push({ pathname, payload });
        if (pathname === '/api/pk/authorize') {
            return { data: { success: true, replayed: true, status: 'sending' } };
        }
        if (pathname === '/api/pk/report') return { data: { success: true } };
        throw new Error(`Unexpected worker request: ${pathname}`);
    };
    const proxy = await listener.startPkAuthorizationProxy({
        username: 'test-user',
        roomId: '123',
        generationId: 'generation',
        backendUrl: `http://127.0.0.1:${backend.address().port}`,
        proxySecret: 'c'.repeat(48)
    });
    try {
        const response = await fetch(`${proxy.url}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gifts: ['gift-a'], operationId: '2'.repeat(64) })
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
            success: false,
            error: 'duplicate_send_blocked'
        });
        assert.equal(backendRequests, 0);
        assert.deepEqual(calls.map((call) => call.pathname), [
            '/api/pk/authorize',
            '/api/pk/report'
        ]);
        assert.match(calls[0].payload.authorizationId, /^[a-f0-9]{40}$/);
        assert.equal(calls[1].payload.authorizationId, calls[0].payload.authorizationId);
    } finally {
        await new Promise((resolve) => proxy.server.close(resolve));
        await new Promise((resolve) => backend.close(resolve));
        listener.externalSendSemaphore.close();
    }
});

test('PK reports remain on disk until the server acknowledges them', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-games-pk-spool-'));
    const listener = Object.create(WindowsGiftListener.prototype);
    listener.pkReportSpoolDirectory = directory;
    listener.activePkReportIds = new Set();
    const intentPayload = {
        authorizationId: 'c'.repeat(40),
        reportId: 'd'.repeat(40),
        username: 'test-user',
        roomId: '123',
        runnerGeneration: 'generation',
        giftIds: ['gift-a'],
        success: false,
        reason: 'external_send_not_confirmed_started'
    };
    const payload = { ...intentPayload, success: true, reason: 'sent' };
    try {
        const intentPath = listener.spoolPkReport(intentPayload, 'intent');
        const spoolPath = listener.spoolPkReport(payload, 'final');
        assert.equal(fs.existsSync(intentPath), true);
        assert.equal(fs.existsSync(spoolPath), true);
        let delivered = null;
        listener.postSignedWorkerRequest = async (pathname, body) => {
            delivered = { pathname, body };
            return { data: { success: true } };
        };
        await listener.flushPendingPkReports();
        assert.equal(fs.existsSync(intentPath), false);
        assert.equal(fs.existsSync(spoolPath), false);
        assert.equal(delivered.pathname, '/api/pk/report');
        assert.deepEqual(delivered.body, payload);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('spin results always map to configured challenges and normalized angles', () => {
    assert.equal(GameLogic.spin.challenges.length, GameLogic.spin.weights.length);
    assert.equal(new Set(GameLogic.spin.challenges).size, GameLogic.spin.challenges.length);
    const configuredIds = new Set(gameRegistry.SPIN_CONFIG.challenges.map((challenge) => challenge.id));
    for (let index = 0; index < 5000; index += 1) {
        const result = GameLogic.spin.spin();
        assert.equal(GameLogic.spin.challenges.includes(result.prize), true);
        assert.equal(configuredIds.has(result.prizeId), true);
        assert.equal(Number.isFinite(result.angle), true);
        assert.equal(result.angle >= 0 && result.angle < 360, true);
        assert.equal(result.success, true);
    }
});

test('production configuration rejects CSRF bypasses and insecure worker origins', async () => {
    const validSecrets = {
        NODE_ENV: 'production',
        DB_HOST: 'db.example.test',
        DB_NAME: 'games',
        DB_USER: 'games',
        DB_PASS: 'database-password',
        SESSION_SECRET: 's'.repeat(32),
        IDEMPOTENCY_HMAC_SECRET: 'i'.repeat(32),
        RESET_TOKEN_SECRET: 'r'.repeat(32),
        ANALYTICS_TOKEN_SECRET: 'a'.repeat(32),
        DICTATION_TOKEN_SECRET: 'd'.repeat(32),
        LOG_HASH_SECRET: 'l'.repeat(32),
        WORKER_CREDENTIALS_JSON: JSON.stringify({
            'worker-test-01': { apiKey: 'w'.repeat(32), hmacSecret: 'h'.repeat(32) }
        }),
        WORKER_CREDENTIAL_ID: 'worker-test-01',
        WORKER_API_KEY: 'w'.repeat(32),
        WORKER_HMAC_SECRET: 'h'.repeat(32),
        ADMIN_TOTP_SECRETS_JSON: JSON.stringify({ admin: 'JBSWY3DPEHPK3PXP' }),
        READINESS_TOKEN: 'q'.repeat(32),
        CSRF_AUTO_FILL: 'true',
        CSRF_TEST_MODE: undefined,
        SERVER_URL: 'http://remote.example.test'
    };
    await withEnvironment(validSecrets, async () => {
        assert.throws(validateServerEnvironment, /CSRF bypass flags are forbidden/);
        assert.throws(validateWorkerEnvironment, /SERVER_URL must be an HTTPS origin/);
    });

    await withEnvironment({
        ...validSecrets,
        CSRF_AUTO_FILL: undefined,
        SERVER_URL: 'https://worker.example.test',
        DB_SSL: 'false',
        DB_SSL_REJECT_UNAUTHORIZED: undefined
    }, async () => {
        assert.throws(validateServerEnvironment, /Remote database TLS cannot be disabled/);
    });

    await withEnvironment({
        ...validSecrets,
        CSRF_AUTO_FILL: undefined,
        SERVER_URL: 'https://worker.example.test',
        DB_SSL: undefined,
        DB_SSL_REJECT_UNAUTHORIZED: 'false'
    }, async () => {
        assert.throws(validateServerEnvironment, /TLS verification cannot be disabled/);
    });
});

test('test fault injection is isolated to an explicitly configured test process', async () => {
    const productionEnvironment = {
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_NAME: 'games',
        DB_USER: 'games',
        DB_PASS: 'database-password',
        SESSION_SECRET: 's'.repeat(32),
        WORKER_CREDENTIAL_ID: 'worker-test-01',
        WORKER_API_KEY: 'w'.repeat(32),
        WORKER_HMAC_SECRET: 'h'.repeat(32),
        ENABLE_TEST_FAULT_INJECTION: undefined,
        TEST_FAULT_TOKEN: 't'.repeat(32),
        TEST_FAULT_PAUSE_MS: undefined,
        CSRF_AUTO_FILL: undefined,
        CSRF_TEST_MODE: undefined
    };
    await withEnvironment(productionEnvironment, async () => {
        assert.throws(validateServerEnvironment, /forbidden in production/);
    });

    await withEnvironment({
        NODE_ENV: 'development',
        ENABLE_TEST_FAULT_INJECTION: 'true',
        TEST_FAULT_TOKEN: 't'.repeat(32)
    }, async () => {
        assert.throws(validateServerEnvironment, /requires NODE_ENV=test/);
    });

    await withEnvironment({
        NODE_ENV: 'test',
        ENABLE_TEST_FAULT_INJECTION: 'true',
        TEST_FAULT_TOKEN: 'short',
        TEST_FAULT_PAUSE_MS: '1500'
    }, async () => {
        assert.throws(validateServerEnvironment, /TEST_FAULT_TOKEN/);
    });

    await withEnvironment({
        NODE_ENV: 'test',
        ENABLE_TEST_FAULT_INJECTION: 'true',
        TEST_FAULT_TOKEN: 'é'.repeat(32),
        TEST_FAULT_PAUSE_MS: '1500'
    }, async () => {
        assert.doesNotThrow(validateServerEnvironment);
        const headers = {
            'x-test-fault-token': 'a'.repeat(32),
            'x-test-fault-point': 'slot.before_commit',
            'x-test-fault-action': 'pause'
        };
        assert.equal(await reachTestFaultPoint({ get: (name) => headers[name] }, 'slot.before_commit'), false);
    });
});

test('Windows workers require a DPAPI cookie path unless plaintext is explicitly enabled', async () => {
    const workerEnvironment = {
        WORKER_CREDENTIAL_ID: 'worker-test-01',
        WORKER_API_KEY: 'w'.repeat(32),
        WORKER_HMAC_SECRET: 'h'.repeat(32),
        SERVER_URL: 'https://worker.example.test',
        THREESERVER_BACKEND: 'http',
        BILI_COOKIE_PATH: 'C:/private/cookie.txt',
        ALLOW_PLAINTEXT_BILI_COOKIE: undefined
    };
    await withEnvironment(workerEnvironment, async () => {
        assert.throws(
            () => validateWorkerEnvironment({ platform: 'win32' }),
            /DPAPI-protected file/
        );
    });
    await withEnvironment({
        ...workerEnvironment,
        ALLOW_PLAINTEXT_BILI_COOKIE: 'TRUE'
    }, async () => {
        assert.throws(
            () => validateWorkerEnvironment({ platform: 'win32' }),
            /must be true or false/
        );
    });
    await withEnvironment({
        ...workerEnvironment,
        ALLOW_PLAINTEXT_BILI_COOKIE: 'true'
    }, async () => {
        assert.doesNotThrow(() => validateWorkerEnvironment({ platform: 'win32' }));
    });
    await withEnvironment({
        ...workerEnvironment,
        BILI_COOKIE_PATH: 'C:/private/bilibili-cookie.dpapi'
    }, async () => {
        assert.doesNotThrow(() => validateWorkerEnvironment({ platform: 'win32' }));
    });
});

test('Bilibili cookie parsing preserves Netscape HttpOnly cookie records', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-games-cookie-'));
    const cookiePath = path.join(directory, 'cookie.txt');
    fs.writeFileSync(cookiePath, [
        '# Netscape HTTP Cookie File',
        '#HttpOnly_.bilibili.com\tTRUE\t/\tTRUE\t0\tSESSDATA\tsession-value',
        '.bilibili.com\tTRUE\t/\tTRUE\t0\tbili_jct\tcsrf-value'
    ].join('\n'), { mode: 0o600 });
    try {
        await withEnvironment({ ALLOW_PLAINTEXT_BILI_COOKIE: 'true' }, async () => {
            const cookies = new BilibiliCookieManager(cookiePath).loadCookiesFromTxt(cookiePath);
            assert.equal(cookies.find((cookie) => cookie.name === 'SESSDATA')?.value, 'session-value');
            assert.equal(cookies.find((cookie) => cookie.name === 'bili_jct')?.value, 'csrf-value');
        });
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('worker configuration rejects unconfirmed browser-click delivery', async () => {
    await withEnvironment({
        WORKER_CREDENTIAL_ID: 'worker-test-01',
        WORKER_API_KEY: 'w'.repeat(32),
        WORKER_HMAC_SECRET: 'h'.repeat(32),
        SERVER_URL: 'https://worker.example.test',
        THREESERVER_BACKEND: 'playwright'
    }, async () => {
        assert.throws(
            validateWorkerEnvironment,
            /provider-confirmed HTTP delivery/
        );
    });
});

test('TOTP verification follows the RFC test vector and rejects malformed codes', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    assert.equal(decodeBase32(secret).toString(), '12345678901234567890');
    assert.equal(generateTotp(secret, 1), '287082');
    assert.equal(verifyTotp(secret, '287082', { now: 30_000, window: 0 }), true);
    assert.equal(verifyTotp(secret, '287083', { now: 30_000, window: 0 }), false);
    assert.equal(verifyTotp(secret, 'abc', { now: 30_000 }), false);
    assert.equal(matchTotpCounter(secret, '287082', { now: 30_000, window: 0 }), 1);
});

test('worker credentials bind independent secrets to an immutable worker id', () => {
    const credentials = parseWorkerCredentials(JSON.stringify({
        'worker-prod-01': { apiKey: 'a'.repeat(32), hmacSecret: 'b'.repeat(32) },
        'worker-prod-02': { apiKey: 'c'.repeat(32), hmacSecret: 'd'.repeat(32) }
    }));
    assert.equal(credentials.get('worker-prod-01').apiKey, 'a'.repeat(32));
    assert.notEqual(
        credentials.get('worker-prod-01').hmacSecret,
        credentials.get('worker-prod-02').hmacSecret
    );
    assert.throws(() => parseWorkerCredentials('{invalid'), /valid JSON/);
});

test('administrator MFA secrets are isolated per account', () => {
    const raw = JSON.stringify({
        admin_one: 'JBSWY3DPEHPK3PXP',
        admin_two: 'GEZDGNBVGY3TQOJQ'
    });
    const secrets = parseAdminTotpSecrets(raw);
    assert.notEqual(secrets.get('admin_one'), secrets.get('admin_two'));
    assert.equal(getAdminTotpSecret('admin_two', { ADMIN_TOTP_SECRETS_JSON: raw }), 'GEZDGNBVGY3TQOJQ');
});

test('redeemable game economics enforce the 98%-99% policy and unsafe boundaries', () => {
    const { RTP_POLICY } = gameRegistry;
    assert.deepEqual(RTP_POLICY, { targetMinimum: 0.98, target: 0.985, maximum: 0.99 });
    assert.throws(() => assertTargetRtp('below-target', 0.979999), /below target/);
    assert.throws(() => assertRtp('above-maximum', 0.990001), /exceeds policy/);

    for (const [giftType, config] of Object.entries(gameRegistry.WISH_CONFIGS)) {
        assertTargetRtp(`wish:${giftType}`, wishRtp(config));
    }
    assertTargetRtp('slot', gameRegistry.ECONOMICS_REPORT.slot);
    assertTargetRtp('scratch', gameRegistry.ECONOMICS_REPORT.scratch);
    assertTargetRtp('flip:profit-optimal', gameRegistry.ECONOMICS_REPORT.flip.profitOptimal);
    assertTargetRtp('flip:maximum-policy', gameRegistry.ECONOMICS_REPORT.flip.maximumPolicy);
    assertTargetRtp('stone:profit-optimal', gameRegistry.ECONOMICS_REPORT.stone.profitOptimal);
    assertTargetRtp('stone:maximum-policy', gameRegistry.ECONOMICS_REPORT.stone.maximumPolicy);
    for (const [giftType, report] of Object.entries(gameRegistry.ECONOMICS_REPORT.duel)) {
        assertTargetRtp(`duel:${giftType}:maximum`, report.maximumRtp);
    }

    const blindbox = gameRegistry.createBlindboxRuntime(require('../gift-codes.json'));
    for (const [tier, rtp] of Object.entries(blindbox.rtp)) {
        assertTargetRtp(`blindbox:${tier}`, rtp);
    }

    const unsafeFlipCosts = [...gameRegistry.FLIP_CONFIG.costs];
    unsafeFlipCosts[2] = 184;
    const unsafeFlip = maximumFlipPolicyEconomics(
        unsafeFlipCosts,
        gameRegistry.FLIP_CONFIG.cashoutRewards
    );
    assert.ok(unsafeFlip.rtp > RTP_POLICY.maximum);
    assert.throws(() => assertRtp('flip:unsafe-184', unsafeFlip.rtp), /exceeds policy/);

    const unsafeStone = maximumStonePolicyEconomics({
        initialCost: gameRegistry.STONE_CONFIG.initialCost,
        rewards: gameRegistry.STONE_CONFIG.rewards,
        replaceCosts: { ...gameRegistry.STONE_CONFIG.replaceCosts, 4: 353 },
        slotCount: gameRegistry.STONE_CONFIG.slotCount,
        colorCount: gameRegistry.STONE_CONFIG.colors.length
    });
    assert.ok(unsafeStone.rtp > RTP_POLICY.maximum);
    assert.throws(() => assertRtp('stone:unsafe-353', unsafeStone.rtp), /exceeds policy/);

    const flip = optimalFlipEconomics(
        gameRegistry.FLIP_CONFIG.costs,
        gameRegistry.FLIP_CONFIG.cashoutRewards
    );
    assert.equal(flip.rtp, gameRegistry.ECONOMICS_REPORT.flip.profitOptimal);
    assert.equal(weightedRtp(100, [
        { value: 50, weight: 0.5 },
        { value: 150, weight: 0.5 }
    ]), 1);
});

test('worker request signatures bind the nonce, path, method, timestamp, and body', () => {
    const secret = 'test-secret-at-least-32-bytes-long';
    const request = {
        timestamp: '1786550400000',
        nonce: 'nonce-12345678',
        workerId: 'worker-test-01',
        method: 'post',
        path: '/api/gift-tasks/42/complete',
        body: { actual_quantity: 2, success: true }
    };
    const signature = signRequest(secret, request);

    assert.equal(signaturesMatch(signature, signRequest(secret, request)), true);
    assert.equal(signaturesMatch(signature, signRequest(secret, { ...request, nonce: 'nonce-87654321' })), false);
    assert.equal(signaturesMatch(signature, signRequest(secret, { ...request, workerId: 'worker-test-02' })), false);
    assert.equal(signaturesMatch(signature, signRequest(secret, { ...request, path: '/api/gift-tasks/43/complete' })), false);
    assert.equal(signaturesMatch('not-hex', signature), false);
    assert.match(canonicalRequest(request), /^3\n1786550400000\nnonce-12345678\nworker-test-01\nPOST\n/);
});

test('PK spend calculation rejects unknown, fractional, and oversized gifts', () => {
    const config = { '礼物池配置': { a: ['A', 5], b: ['B', 12] } };
    assert.deepEqual(normalizeGiftItems(['a', { id: 'b', count: 2 }]), [
        { id: 'a', count: 1 },
        { id: 'b', count: 2 }
    ]);
    assert.equal(computeTicketCount(['a', { id: 'b', count: 2 }], config), 290);
    assert.equal(computeTicketCount(['missing'], config), null);
    assert.equal(computeTicketCount(['constructor'], config), null);
    assert.equal(computeTicketCount(['toString'], config), null);
    assert.equal(computeTicketCount([{ id: 'a', count: 1.5 }], config), null);
    assert.equal(computeTicketCount([{ id: 'a', count: 1000001 }], config), null);
});

test('PK spend hashes bind the runner generation and normalized gift request', () => {
    const request = {
        username: 'tester', roomId: '123', runnerGeneration: 'generation-one',
        giftIds: ['a'], ticketCount: 50
    };
    assert.notEqual(
        createSpendHash(request),
        createSpendHash({ ...request, runnerGeneration: 'generation-two' })
    );
});

test('client IP normalization handles mapped IPv4 and bracketed IPv6', () => {
    assert.equal(normalizeIp('::ffff:203.0.113.9'), '203.0.113.9');
    assert.equal(normalizeIp('[2001:db8::5]:443'), '2001:db8::5');
    assert.equal(normalizeIp('not-an-ip'), null);
});

test('only explicitly configured and loopback ingress addresses are trusted proxies', () => {
    const env = { TRUSTED_PROXY_ADDRESSES: '10.28.232.2,172.20.1.5' };
    assert.equal(isTrustedProxyAddress('10.28.232.2', env), true);
    assert.equal(isTrustedProxyAddress('172.20.1.5', env), true);
    assert.equal(isTrustedProxyAddress('::1'), true);
    assert.equal(isTrustedProxyAddress('10.20.30.40'), false);
    assert.equal(isTrustedProxyAddress('203.0.113.20'), false);
});

test('Render proxy chain resolves to the first forwarded client IP', () => {
    const req = {
        headers: { 'x-forwarded-for': '203.0.113.40, 172.68.1.2, 10.28.232.2' },
        socket: { remoteAddress: '10.20.30.40' },
        ip: '10.28.232.2'
    };
    assert.equal(getClientIp(req, {
        trustForwardedHeaders: true,
        env: { TRUSTED_PROXY_ADDRESSES: '10.20.30.40' }
    }), '203.0.113.40');
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

test('idempotency hashes ignore rotating CSRF tokens and protect sensitive bodies with HMAC', () => {
    const first = {
        method: 'POST',
        path: '/api/change-password',
        body: { currentPassword: 'old-secret', newPassword: 'new-secret', csrfToken: 'token-one' }
    };
    const second = {
        ...first,
        body: { ...first.body, csrfToken: 'token-two' }
    };
    assert.equal(hashRequest(first, 'hash-secret'), hashRequest(second, 'hash-secret'));
    assert.notEqual(hashRequest(first, 'hash-secret'), hashRequest(first, 'different-secret'));
    assert.deepEqual(bodyForHash(first.body), {
        currentPassword: 'old-secret',
        newPassword: 'new-secret'
    });
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
                return { rows: [{ id: 1 }] };
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

test('transactional session revocation aborts the business response before idempotency completion', async () => {
    let storedResponse = null;
    const pool = {
        async query(sql, values) {
            const statement = String(sql);
            if (statement.includes('INSERT INTO idempotency_keys')) return { rows: [{ id: 12 }] };
            if (statement.includes('UPDATE idempotency_keys')) {
                storedResponse = {
                    status: values[2],
                    body: JSON.parse(values[3])
                };
                return { rows: [{ id: 12 }] };
            }
            throw new Error(`Unexpected pool query: ${statement}`);
        }
    };
    const transactionClient = {
        async query() {
            throw new Error('idempotency completion must not run after session revocation');
        }
    };
    const middleware = createIdempotencyMiddleware({
        pool,
        paths: ['/api/slot/play'],
        validateTransactionalRequest: async () => ({
            status: 401,
            message: 'session revoked'
        })
    });

    const result = await new Promise((resolve, reject) => {
        const headers = {};
        const req = {
            method: 'POST',
            path: '/api/slot/play',
            body: { bet: 5 },
            session: { user: { username: 'tester' } },
            get: () => 'revoked-session-key-1234'
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
                await req.finalizeIdempotency(transactionClient, 200, { success: true });
                reject(new Error('revoked transaction unexpectedly finalized'));
            } catch (error) {
                assert.equal(error.code, 'TRANSACTIONAL_SESSION_INVALID');
                res.status(500).json({ success: false, message: 'internal fallback' });
            }
        }).catch(reject);
    });

    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { success: false, message: 'session revoked' });
    assert.equal(result.headers['Idempotency-Status'], 'created');
    assert.deepEqual(storedResponse, {
        status: 401,
        body: { success: false, message: 'session revoked' }
    });
});

test('response finalization never overwrites a transactionally completed record', async () => {
    let record;
    const pool = {
        async query(sql, values) {
            const statement = String(sql);
            if (statement.includes('INSERT INTO idempotency_keys')) {
                record = { status: 'pending', request_hash: values[4] };
                return { rows: [{ id: 10 }] };
            }
            if (statement.includes('UPDATE idempotency_keys')) {
                assert.match(statement, /status = 'pending'/);
                return { rows: [] };
            }
            if (statement.includes('SELECT status, response_status')) {
                return { rows: [record] };
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
            return { rows: [{ id: 10 }] };
        }
    };
    const middleware = createIdempotencyMiddleware({ pool, paths: ['/api/slot/play'] });
    const result = await new Promise((resolve, reject) => {
        const headers = {};
        const req = {
            method: 'POST',
            path: '/api/slot/play',
            body: { bet: 5 },
            session: { user: { username: 'tester' } },
            get: () => 'transaction-response-key-1234'
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
                const body = { success: true, reward: 30 };
                await req.finalizeIdempotency(transactionClient, 200, body);
                res.json(body);
            } catch (error) {
                reject(error);
            }
        }).catch(reject);
    });

    assert.equal(result.status, 200);
    assert.equal(result.headers['Idempotency-Status'], 'replayed');
    assert.deepEqual(result.body, { success: true, reward: 30 });
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
            if (statement.includes("SET status = 'indeterminate'")) {
                if (record?.status === 'pending') {
                    record = {
                        ...record,
                        status: 'indeterminate',
                        response_status: 409,
                        response_body: JSON.parse(values[2])
                    };
                    return { rows: [{ id: 11 }] };
                }
                return { rows: [] };
            }
            if (statement.includes('SELECT status, response_status')) {
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

test('balance updates reject calls outside a caller-owned business transaction', async () => {
    const result = await BalanceLogger.updateBalance({
        username: 'test-user',
        amount: 10,
        operationType: 'test'
    });

    assert.equal(result.success, false);
    assert.match(result.message, /业务事务管理/);
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
