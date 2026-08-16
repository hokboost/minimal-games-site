'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const fetch = require('node-fetch');
const { hashRequest } = require('../lib/idempotency');
const {
    SIGNATURE_VERSION,
    signRequest
} = require('../lib/request-signature');
const {
    BrowserSession,
    DisposableDatabase,
    TEST_SECRETS,
    TEST_WORKER_CREDENTIALS,
    delay,
    expectConnectionLoss,
    reservePort,
    startApp,
    waitForExit
} = require('../tests/helpers/integration-environment');

const FAULT_TOKEN = 'runtime-fault-token-0123456789abcdef';
const IDEMPOTENCY_HMAC_SECRET = TEST_SECRETS.idempotency;

function cloneSession(session, baseUrl) {
    const clone = new BrowserSession(baseUrl);
    clone.cookies = new Map(session.cookies);
    clone.csrfToken = session.csrfToken;
    clone.username = session.username;
    return clone;
}

async function jsonResponse(response) {
    const body = await response.json();
    return { body, response };
}

async function eventually(check, { timeoutMs = 5000, intervalMs = 50 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            return await check();
        } catch (error) {
            lastError = error;
            await delay(intervalMs);
        }
    }
    throw lastError || new Error('Condition did not become true');
}

async function financialSnapshot(pool, username) {
    const result = await pool.query(`
        SELECT account.balance,
               audit.expected_balance,
               audit.is_chain_consistent,
               audit.is_consistent,
               (SELECT COUNT(*)::integer FROM slot_results WHERE username = $1) AS slot_count,
               (SELECT COUNT(*)::integer FROM flip_logs WHERE username = $1) AS flip_count
        FROM users AS account
        JOIN balance_audit_current AS audit ON audit.username = account.username
        WHERE account.username = $1
    `, [username]);
    assert.equal(result.rowCount, 1);
    const row = result.rows[0];
    assert.equal(row.is_chain_consistent, true);
    assert.equal(row.is_consistent, true);
    assert.equal(row.balance, row.expected_balance);
    return {
        balance: Number(row.balance),
        slotCount: Number(row.slot_count),
        flipCount: Number(row.flip_count)
    };
}

async function idempotencyRecord(pool, username, key) {
    const result = await pool.query(`
        SELECT status, response_status, response_body
        FROM idempotency_keys
        WHERE username = $1 AND idempotency_key = $2
    `, [username, key]);
    assert.equal(result.rowCount, 1, `Missing idempotency record ${key}`);
    return result.rows[0];
}

async function signedWorkerPost(baseUrl, path, workerId, body = {}) {
    const credentials = TEST_WORKER_CREDENTIALS[workerId];
    assert.ok(credentials, `Missing integration credentials for worker ${workerId}`);
    const timestamp = String(Date.now());
    const nonce = crypto.randomBytes(18).toString('hex');
    const signature = signRequest(credentials.hmacSecret, {
        timestamp,
        nonce,
        workerId,
        method: 'POST',
        path,
        body
    });
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': credentials.apiKey,
            'x-timestamp': timestamp,
            'x-nonce': nonce,
            'x-worker-id': workerId,
            'x-signature-version': SIGNATURE_VERSION,
            'x-signature': signature
        },
        body: JSON.stringify(body),
        timeout: 10000
    });
}

async function testProviderTimeout() {
    const { WindowsGiftListener } = require('../windows-gift-listener');
    const sockets = new Set();
    const provider = http.createServer(() => {});
    provider.on('connection', (socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
        provider.once('error', reject);
        provider.listen(0, '127.0.0.1', resolve);
    });
    try {
        const listener = new WindowsGiftListener();
        listener.threeServerUrl = `http://127.0.0.1:${provider.address().port}`;
        const startedAt = Date.now();
        const result = await listener.sendToThreeServer('31036', 1);
        const elapsedMs = Date.now() - startedAt;
        assert.equal(result.success, false);
        assert.equal(result.reachable, false);
        assert.match(result.error, /timeout|aborted/i);
        // Production intentionally waits 25 seconds so threeserver's 20-second
        // provider-confirmation window can finish before the transport aborts.
        assert.ok(elapsedMs >= 24000 && elapsedMs < 35000, `Unexpected provider timeout: ${elapsedMs}ms`);
    } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => provider.close(resolve));
    }
}

async function run() {
    const database = new DisposableDatabase('resilience');
    const apps = [];
    let appA;
    let appB;
    try {
        await database.create();
        const user = await database.createUser({ username: 'resilience_user' });
        const [portA, portB] = await Promise.all([reservePort(), reservePort()]);
        appA = await startApp({
            databaseName: database.name,
            port: portA,
            label: 'fault-a1',
            faultToken: FAULT_TOKEN
        });
        apps.push(appA);
        appB = await startApp({
            databaseName: database.name,
            port: portB,
            label: 'steady-b',
            faultToken: FAULT_TOKEN
        });
        apps.push(appB);

        const sessionA = await new BrowserSession(appA.baseUrl).login(user);
        const sessionB = cloneSession(sessionA, appB.baseUrl);
        const initial = await financialSnapshot(database.pool, user.username);

        const beforeCommitKey = 'slot-before-commit-exit-0001';
        await expectConnectionLoss(sessionA.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 100
        }, {
            idempotencyKey: beforeCommitKey,
            headers: {
                'x-test-fault-token': FAULT_TOKEN,
                'x-test-fault-point': 'slot.before_commit',
                'x-test-fault-action': 'exit'
            }
        }));
        const beforeExit = await waitForExit(appA.child);
        assert.equal(beforeExit.code, 86);
        const afterBeforeCommitExit = await financialSnapshot(database.pool, user.username);
        assert.deepEqual(afterBeforeCommitExit, initial);
        assert.equal((await idempotencyRecord(database.pool, user.username, beforeCommitKey)).status, 'pending');
        console.log('passed: process exit before commit rolls back');

        const blockedRetry = await jsonResponse(await sessionB.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 100
        }, { idempotencyKey: beforeCommitKey }));
        assert.equal(blockedRetry.response.status, 409);
        assert.equal(blockedRetry.response.headers.get('idempotency-status'), 'pending');
        assert.deepEqual(await financialSnapshot(database.pool, user.username), initial);

        await database.pool.query(`
            UPDATE idempotency_keys
            SET status = 'indeterminate', response_status = 409,
                response_body = '{"success":false,"message":"request outcome requires reconciliation"}'::jsonb,
                failure_reason = 'test process exited before commit', updated_at = NOW()
            WHERE username = $1 AND idempotency_key = $2 AND status = 'pending'
        `, [user.username, beforeCommitKey]);
        const indeterminateRetry = await sessionB.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 100
        }, { idempotencyKey: beforeCommitKey });
        assert.equal(indeterminateRetry.status, 409);
        assert.equal(indeterminateRetry.headers.get('idempotency-status'), 'indeterminate');
        console.log('passed: unresolved request stays fenced');

        appA = await startApp({
            databaseName: database.name,
            port: portA,
            label: 'fault-a2',
            faultToken: FAULT_TOKEN
        });
        apps.push(appA);
        sessionA.baseUrl = appA.baseUrl;
        const afterCommitKey = 'slot-after-commit-exit-0001';
        await expectConnectionLoss(sessionA.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 120
        }, {
            idempotencyKey: afterCommitKey,
            headers: {
                'x-test-fault-token': FAULT_TOKEN,
                'x-test-fault-point': 'slot.after_commit',
                'x-test-fault-action': 'exit'
            }
        }));
        assert.equal((await waitForExit(appA.child)).code, 86);
        const afterCommitSnapshot = await financialSnapshot(database.pool, user.username);
        assert.equal(afterCommitSnapshot.slotCount, initial.slotCount + 1);
        const committed = await idempotencyRecord(database.pool, user.username, afterCommitKey);
        assert.equal(committed.status, 'completed');
        const replayAfterExit = await jsonResponse(await sessionB.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 120
        }, { idempotencyKey: afterCommitKey }));
        assert.equal(replayAfterExit.response.status, 200);
        assert.equal(replayAfterExit.response.headers.get('idempotency-status'), 'replayed');
        assert.deepEqual(replayAfterExit.body, committed.response_body);
        assert.equal((await financialSnapshot(database.pool, user.username)).slotCount, initial.slotCount + 1);
        console.log('passed: process exit after commit replays');

        appA = await startApp({
            databaseName: database.name,
            port: portA,
            label: 'fault-a3',
            faultToken: FAULT_TOKEN
        });
        apps.push(appA);
        sessionA.baseUrl = appA.baseUrl;
        const disconnectKey = 'slot-after-commit-disconnect-0001';
        await expectConnectionLoss(sessionA.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 130
        }, {
            idempotencyKey: disconnectKey,
            headers: {
                'x-test-fault-token': FAULT_TOKEN,
                'x-test-fault-point': 'slot.after_commit',
                'x-test-fault-action': 'disconnect'
            }
        }));
        const replayAfterDisconnect = await sessionB.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 130
        }, { idempotencyKey: disconnectKey });
        assert.equal(replayAfterDisconnect.status, 200);
        assert.equal(replayAfterDisconnect.headers.get('idempotency-status'), 'replayed');
        assert.equal((await financialSnapshot(database.pool, user.username)).slotCount, initial.slotCount + 2);
        console.log('passed: response disconnect after commit replays');

        const databaseDisconnectKey = 'slot-database-disconnect-0001';
        const pausedRequest = sessionA.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 140
        }, {
            idempotencyKey: databaseDisconnectKey,
            headers: {
                'x-test-fault-token': FAULT_TOKEN,
                'x-test-fault-point': 'slot.before_commit',
                'x-test-fault-action': 'pause'
            },
            timeout: 15000
        }).then(async (response) => ({ response, body: await response.json() }))
            .catch((error) => ({ error }));
        await eventually(() => {
            assert.ok(appA.faultEvents.some((event) => event.point === 'slot.before_commit'));
        });
        const terminated = await database.pool.query(`
            SELECT COUNT(*)::integer AS count
            FROM (
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = $1 AND application_name = $2
            ) AS terminated
        `, [database.name, appA.applicationName]);
        assert.ok(Number(terminated.rows[0].count) >= 1);
        const pausedResult = await pausedRequest;
        if (pausedResult.response) assert.equal(pausedResult.response.status, 500);
        const disconnectedRecord = await idempotencyRecord(
            database.pool,
            user.username,
            databaseDisconnectKey
        );
        assert.ok(['pending', 'indeterminate'].includes(disconnectedRecord.status));
        assert.equal((await financialSnapshot(database.pool, user.username)).slotCount, initial.slotCount + 2);
        if (disconnectedRecord.status === 'pending') {
            await database.pool.query(`
                UPDATE idempotency_keys
                SET updated_at = NOW() - INTERVAL '11 minutes'
                WHERE username = $1 AND idempotency_key = $2
            `, [user.username, databaseDisconnectKey]);
            await appA.stop();
            appA = await startApp({
                databaseName: database.name,
                port: portA,
                label: 'fault-a4',
                faultToken: FAULT_TOKEN
            });
            apps.push(appA);
            sessionA.baseUrl = appA.baseUrl;
        }
        await eventually(async () => {
            const record = await idempotencyRecord(database.pool, user.username, databaseDisconnectKey);
            assert.equal(record.status, 'indeterminate');
        });
        const disconnectedRetry = await sessionB.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 140
        }, { idempotencyKey: databaseDisconnectKey });
        assert.equal(disconnectedRetry.status, 409);
        assert.equal(disconnectedRetry.headers.get('idempotency-status'), 'indeterminate');
        console.log('passed: database disconnect rolls back and stale request is fenced');

        const concurrentKey = 'slot-cross-instance-concurrent-0001';
        const slotCountBeforeConcurrent = (await financialSnapshot(database.pool, user.username)).slotCount;
        const concurrentResponses = await Promise.all([
            sessionA.postJson('/api/slot/play', {
                username: user.username,
                betAmount: 150
            }, { idempotencyKey: concurrentKey }),
            sessionB.postJson('/api/slot/play', {
                username: user.username,
                betAmount: 150
            }, { idempotencyKey: concurrentKey })
        ]);
        assert.ok(concurrentResponses.some((response) => response.status === 200));
        assert.ok(concurrentResponses.every((response) => [200, 409].includes(response.status)));
        const finalConcurrentReplay = await sessionB.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 150
        }, { idempotencyKey: concurrentKey });
        assert.equal(finalConcurrentReplay.status, 200);
        assert.equal((await financialSnapshot(database.pool, user.username)).slotCount, slotCountBeforeConcurrent + 1);
        console.log('passed: same key across instances settles once');

        const oldReplayKey = 'slot-eight-day-replay-0001';
        const oldReplayBody = { username: user.username, betAmount: 151 };
        const oldReplaySnapshot = {
            success: true,
            outcome: 'durable-test-snapshot',
            payout: 0,
            newBalance: (await financialSnapshot(database.pool, user.username)).balance
        };
        const oldRequestHash = hashRequest({
            method: 'POST',
            path: '/api/slot/play',
            body: oldReplayBody
        }, IDEMPOTENCY_HMAC_SECRET);
        await database.pool.query(`
            INSERT INTO idempotency_keys (
                username, idempotency_key, request_method, request_path,
                request_hash, status, response_status, response_body,
                created_at, updated_at
            ) VALUES (
                $1, $2, 'POST', '/api/slot/play', $3, 'completed', 200, $4,
                NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'
            )
        `, [user.username, oldReplayKey, oldRequestHash, JSON.stringify(oldReplaySnapshot)]);
        const oldReplay = await sessionA.postJson('/api/slot/play', {
            username: user.username,
            betAmount: 151
        }, { idempotencyKey: oldReplayKey });
        assert.equal(oldReplay.status, 200);
        assert.equal(oldReplay.headers.get('idempotency-status'), 'replayed');
        assert.deepEqual(await oldReplay.json(), oldReplaySnapshot);
        assert.equal((await financialSnapshot(database.pool, user.username)).slotCount, slotCountBeforeConcurrent + 1);
        console.log('passed: replay after eight days stays deduplicated');

        const flipCountBefore = (await financialSnapshot(database.pool, user.username)).flipCount;
        const flipResponses = await Promise.all([
            sessionA.postJson('/api/flip/flip', { cardIndex: 0 }, {
                idempotencyKey: 'flip-cross-instance-a-0001'
            }),
            sessionB.postJson('/api/flip/flip', { cardIndex: 0 }, {
                idempotencyKey: 'flip-cross-instance-b-0001'
            })
        ]);
        assert.ok(flipResponses.some((response) => response.status === 200));
        assert.ok(flipResponses.every((response) => [200, 400, 409, 429].includes(response.status)));
        assert.equal((await financialSnapshot(database.pool, user.username)).flipCount, flipCountBefore + 1);
        console.log('passed: conflicting flip actions settle once');

        const workerA = 'integration-worker-a';
        const workerB = 'integration-worker-b';
        const heartbeat = {
            workerType: 'gift-pk',
            version: 'integration-1',
            protocolVersion: 4,
            capabilities: ['gift', 'pk']
        };
        assert.equal((await signedWorkerPost(appB.baseUrl, '/api/workers/heartbeat', workerA, heartbeat)).status, 200);
        const rejectedWorker = await jsonResponse(
            await signedWorkerPost(appB.baseUrl, '/api/workers/heartbeat', workerB, heartbeat)
        );
        assert.equal(rejectedWorker.response.status, 409);
        assert.equal(rejectedWorker.body.code, 'WORKER_LEASE_HELD');
        await database.pool.query(`
            UPDATE worker_role_leases
            SET lease_expires_at = NOW() - INTERVAL '1 second'
            WHERE role = 'gift-pk'
        `);
        const takeover = await jsonResponse(
            await signedWorkerPost(appB.baseUrl, '/api/workers/heartbeat', workerB, heartbeat)
        );
        assert.equal(takeover.response.status, 200);
        assert.equal(Number(takeover.body.leaseGeneration), 2);
        const fencedWorker = await jsonResponse(
            await signedWorkerPost(appB.baseUrl, '/api/gift-tasks/claim', workerA, {})
        );
        assert.equal(fencedWorker.response.status, 409);
        assert.equal(fencedWorker.body.code, 'WORKER_LEASE_NOT_HELD');
        console.log('passed: worker takeover fences former owner');

        await testProviderTimeout();
        console.log('passed: provider timeout is not treated as success');
        const final = await financialSnapshot(database.pool, user.username);
        assert.equal(final.slotCount, slotCountBeforeConcurrent + 1);
        console.log('Runtime resilience tests passed:', {
            beforeCommitRollback: true,
            afterCommitReplay: true,
            responseLossReplay: true,
            databaseDisconnectRollback: true,
            crossInstanceIdempotency: true,
            staleReplay: true,
            workerTakeoverFencing: true,
            providerTimeout: true
        });
    } finally {
        for (const app of apps.reverse()) await app.stop().catch(() => {});
        await database.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
