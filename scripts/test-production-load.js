'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { io } = require('socket.io-client');
const { PostgresEventBus } = require('../lib/postgres-event-bus');
const {
    BrowserSession,
    DisposableDatabase,
    delay,
    reservePort,
    startApp
} = require('../tests/helpers/integration-environment');

function percentile(values, fraction) {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function waitForSocket(socket, event, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Socket event timed out: ${event}`));
        }, timeoutMs);
        const onEvent = (payload) => {
            cleanup();
            resolve(payload);
        };
        const onError = (error) => {
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
        };
        const cleanup = () => {
            clearTimeout(timer);
            socket.removeListener(event, onEvent);
            socket.removeListener('connect_error', onError);
        };
        socket.once(event, onEvent);
        socket.once('connect_error', onError);
    });
}

async function verifySocketFanout(database, apps, session, username) {
    const options = {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: { Cookie: session.cookieHeader() }
    };
    const sockets = apps.map((app) => io(app.baseUrl, options));
    const publisher = new PostgresEventBus(database.pool, () => {});
    try {
        await Promise.all(sockets.map((socket) => (
            socket.connected ? Promise.resolve() : waitForSocket(socket, 'connect')
        )));
        await publisher.start();
        const notificationId = crypto.randomUUID();
        const notifications = sockets.map((socket) => waitForSocket(socket, 'notification'));
        await publisher.publish('user_notification', {
            username,
            notification: { type: 'load-test', notificationId }
        });
        const payloads = await Promise.all(notifications);
        assert.ok(payloads.every((payload) => payload?.notificationId === notificationId));
    } finally {
        sockets.forEach((socket) => socket.close());
        await publisher.close();
    }
}

async function runSustainedLoad({ apps, sessions, durationMs }) {
    const metrics = {
        latencies: [],
        statuses: new Map(),
        errors: [],
        serverFailures: []
    };
    const deadline = Date.now() + durationMs;
    await Promise.all(sessions.map(async (session, userIndex) => {
        let sequence = userIndex;
        while (Date.now() < deadline) {
            const app = apps[(userIndex + sequence) % apps.length];
            session.baseUrl = app.baseUrl;
            // A pressure test represents many independent clients. Reusing one
            // IP per worker exhausts the 100/minute public safety limit after
            // exactly 800 successful requests, then the cheap 429 responses
            // accelerate the loop and make the result depend on runner speed.
            // Keep a small, bounded pool of RFC 2544 benchmark addresses per
            // session; shared rate limiting is verified separately below with
            // one deliberately fixed address.
            const ip = `198.18.${userIndex}.${10 + (sequence % 8)}`;
            const startedAt = Date.now();
            try {
                let response;
                let pathname;
                if (sequence % 8 === 0) {
                    pathname = '/api/slot/play';
                    response = await session.postJson('/api/slot/play', {
                        username: session.username,
                        betAmount: 1
                    }, {
                        idempotencyKey: `load-${userIndex}-${sequence}-${crypto.randomUUID()}`,
                        headers: { 'x-forwarded-for': ip },
                        timeout: 15000
                    });
                } else {
                    pathname = '/api/stone/state';
                    response = await session.request('/api/stone/state', {
                        headers: { 'x-forwarded-for': ip },
                        timeout: 15000
                    });
                }
                metrics.latencies.push(Date.now() - startedAt);
                metrics.statuses.set(response.status, (metrics.statuses.get(response.status) || 0) + 1);
                const responseText = await response.text();
                if (response.status >= 500) {
                    metrics.serverFailures.push({
                        pathname,
                        status: response.status,
                        retryAfter: response.headers.get('retry-after'),
                        body: responseText.slice(0, 200)
                    });
                }
            } catch (error) {
                metrics.errors.push(error.message);
            }
            sequence += 1;
            await delay(10);
        }
    }));
    return metrics;
}

async function verifySharedRateLimit(apps, session) {
    const statuses = [];
    for (let index = 0; index < 110; index += 1) {
        session.baseUrl = apps[index % apps.length].baseUrl;
        const response = await session.request('/api/stone/state', {
            headers: { 'x-forwarded-for': '203.0.113.200' },
            timeout: 10000
        });
        statuses.push(response.status);
        await response.text();
    }
    const limited = statuses.filter((status) => status === 429).length;
    assert.ok(limited >= 10, `Expected shared rate limiting, observed ${limited} limited requests`);
    assert.ok(statuses.slice(0, 90).every((status) => status === 200));
    assert.ok(statuses.every((status) => [200, 429].includes(status)));
    return limited;
}

async function run() {
    const parsedDuration = Number.parseInt(process.env.LOAD_TEST_DURATION_MS, 10);
    const durationMs = Number.isSafeInteger(parsedDuration)
        ? Math.min(120000, Math.max(5000, parsedDuration))
        : 12000;
    const database = new DisposableDatabase('load');
    const apps = [];
    let connectionSampler;
    let sampling = true;
    let maxApplicationConnections = 0;
    try {
        await database.create();
        const users = [];
        for (let index = 0; index < 8; index += 1) {
            users.push(await database.createUser({ username: `load_user_${index}` }));
        }
        const ports = await Promise.all([reservePort(), reservePort()]);
        for (let index = 0; index < 2; index += 1) {
            apps.push(await startApp({
                databaseName: database.name,
                port: ports[index],
                label: `load-${index}`,
                poolMax: 4,
                extraEnv: {
                    RENDER: 'true',
                    RENDER_SERVICE_ID: 'local-load-test'
                }
            }));
        }

        const sessions = [];
        for (let index = 0; index < users.length; index += 1) {
            sessions.push(await new BrowserSession(apps[index % apps.length].baseUrl).login(users[index]));
        }
        await verifySocketFanout(database, apps, sessions[0], users[0].username);

        connectionSampler = (async () => {
            while (sampling) {
                const result = await database.pool.query(`
                    SELECT COUNT(*)::integer AS count
                    FROM pg_stat_activity
                    WHERE datname = $1 AND application_name = ANY($2::text[])
                `, [database.name, apps.map((app) => app.applicationName)]);
                maxApplicationConnections = Math.max(
                    maxApplicationConnections,
                    Number(result.rows[0].count)
                );
                await delay(100);
            }
        })();

        const metrics = await runSustainedLoad({ apps, sessions, durationMs });
        sampling = false;
        await connectionSampler;
        connectionSampler = null;

        const totalResponses = [...metrics.statuses.values()].reduce((sum, count) => sum + count, 0);
        const controlledOverloads = metrics.serverFailures.filter((failure) => (
            failure.status === 503
            && failure.retryAfter === '2'
            && failure.body.includes('服务器繁忙')
        ));
        const unexpectedServerErrors = metrics.serverFailures.length - controlledOverloads.length;
        const rateLimitedResponses = metrics.statuses.get(429) || 0;
        const p95 = percentile(metrics.latencies, 0.95);
        const p99 = percentile(metrics.latencies, 0.99);
        console.log('Load measurements:', {
            totalResponses,
            statusCounts: Object.fromEntries(metrics.statuses),
            p95Ms: p95,
            p99Ms: p99,
            maxApplicationConnections,
            serverFailures: metrics.serverFailures.slice(0, 10)
        });
        assert.equal(metrics.errors.length, 0, `Load transport errors: ${metrics.errors.slice(0, 3).join('; ')}`);
        assert.equal(unexpectedServerErrors, 0, `Load produced ${unexpectedServerErrors} unexpected HTTP 5xx responses`);
        assert.ok(totalResponses >= sessions.length, `Too few load responses: ${totalResponses}`);
        assert.ok(
            controlledOverloads.length / totalResponses <= 0.6,
            'Controlled capacity rejection dominated the pressure test'
        );
        assert.ok(
            rateLimitedResponses / totalResponses <= 0.1,
            'Public rate limiting dominated the pressure test instead of exercising application capacity'
        );
        assert.ok(p95 < 6000, `P95 latency too high: ${p95}ms`);
        assert.ok(p99 < 10000, `P99 latency too high: ${p99}ms`);
        assert.ok(maxApplicationConnections <= 8, `Pool cap exceeded: ${maxApplicationConnections}`);
        assert.ok(maxApplicationConnections >= 6, 'Load did not exercise both application pools under pressure');

        const limitedRequests = await verifySharedRateLimit(apps, sessions[0]);
        const audit = await database.pool.query(`
            SELECT COUNT(*)::integer AS inconsistent
            FROM balance_audit_current
            WHERE NOT is_consistent OR NOT is_chain_consistent
        `);
        assert.equal(Number(audit.rows[0].inconsistent), 0);

        console.log('Production-style load test passed:', {
            durationMs,
            totalResponses,
            statusCounts: Object.fromEntries(metrics.statuses),
            p95Ms: p95,
            p99Ms: p99,
            maxApplicationConnections,
            controlledOverloadResponses: controlledOverloads.length,
            crossInstanceLimitedRequests: limitedRequests,
            socketFanoutInstances: 2
        });
    } finally {
        sampling = false;
        await connectionSampler?.catch(() => {});
        for (const app of apps.reverse()) await app.stop().catch(() => {});
        await database.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
