'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
    BrowserSession,
    DisposableDatabase,
    delay,
    reservePort,
    startApp
} = require('../tests/helpers/integration-environment');

const FAULT_TOKEN = 'capacity-fault-token-0123456789abcdef';
const STREAMER_GAME_ENV = Object.freeze({
    STREAMER_WORLD_ENABLED: 'true',
    CREATOR_PROFILE_ENABLED: 'true',
    STREAMER_NEW_GAMES_ENABLED: 'true',
    PAID_ACTION_MAX_IN_FLIGHT: '1',
    PAID_ACTION_MAX_PER_USER: '1',
    PAID_ACTION_MAX_POOL_WAITERS: '4',
    PAID_ACTION_MAX_EVENT_LOOP_LAG_MS: '5000',
    TEST_FAULT_PAUSE_MS: '5000'
});

async function eventually(check, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            return await check();
        } catch (error) {
            lastError = error;
            await delay(25);
        }
    }
    throw lastError || new Error('Condition did not become true');
}

function isRetryableCapacityResponse(response) {
    return response.status === 503
        && response.headers.get('idempotency-status') === 'retryable';
}

async function postWithOneCapacityRetry({
    session,
    pathname,
    body,
    keys,
    beforeRetry = async () => {}
}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await session.postJson(pathname, body, { idempotencyKey: keys[attempt] });
        if (attempt === 0 && isRetryableCapacityResponse(response)) {
            await beforeRetry(response);
            continue;
        }
        return { attempt, response };
    }
    throw new Error('Bounded capacity retry exhausted without a response');
}

async function gameEffects(pool, username) {
    const result = await pool.query(`
        SELECT
            (SELECT COUNT(*)::integer
             FROM streamer_game_runs run
             JOIN users account ON account.id = run.creator_user_id
             WHERE account.username = $1 AND run.game_id = 'constellation-repair') AS run_count,
            (SELECT COUNT(*)::integer
             FROM streamer_game_start_commands command
             JOIN users account ON account.id = command.actor_user_id
             WHERE account.username = $1 AND command.game_id = 'constellation-repair') AS command_count,
            (SELECT COUNT(*)::integer
             FROM streamer_game_events event
             JOIN streamer_game_runs run ON run.id = event.run_id
             JOIN users account ON account.id = run.creator_user_id
             WHERE account.username = $1 AND run.game_id = 'constellation-repair') AS event_count
    `, [username]);
    return result.rows[0];
}

async function idempotencyRecord(pool, username, key) {
    const result = await pool.query(`
        SELECT status, request_path, response_status
        FROM idempotency_keys
        WHERE username = $1 AND idempotency_key = $2
    `, [username, key]);
    return result.rows[0] || null;
}

async function run() {
    const database = new DisposableDatabase('capacity_admission');
    let app;
    try {
        await database.create();
        const user = await database.createUser({ username: 'capacity_admission_user' });
        const holderUser = await database.createUser({ username: 'capacity_holder_user' });
        await database.pool.query(`
            INSERT INTO creator_profiles (user_id, display_name, timezone)
            SELECT id, username, 'America/Toronto'
            FROM users
            WHERE username = $1
        `, [user.username]);

        app = await startApp({
            databaseName: database.name,
            port: await reservePort(),
            label: 'capacity-admission-e2e',
            faultToken: FAULT_TOKEN,
            poolMax: 8,
            extraEnv: STREAMER_GAME_ENV
        });
        const session = await new BrowserSession(app.baseUrl).login(user);
        const holderSession = await new BrowserSession(app.baseUrl).login(holderUser);

        const replayKey = 'capacity-completed-slot-key-0001';
        const replayBody = { username: user.username, betAmount: 11 };
        const originalSlotResponse = await session.postJson('/api/slot/play', replayBody, {
            idempotencyKey: replayKey
        });
        assert.equal(originalSlotResponse.status, 200);
        const originalSlotBody = await originalSlotResponse.json();
        assert.equal(originalSlotBody.success, true);

        const holderKey = 'test-idempotency-000000000002';
        const holder = holderSession.postJson('/api/slot/play', {
            username: holderUser.username,
            betAmount: 10
        }, {
            idempotencyKey: holderKey,
            headers: {
                'x-test-fault-token': FAULT_TOKEN,
                'x-test-fault-point': 'slot.before_commit',
                'x-test-fault-action': 'pause'
            },
            timeout: 10000
        });
        await eventually(() => {
            assert.ok(app.faultEvents.some(event => (
                event.point === 'slot.before_commit' && event.action === 'pause'
            )));
        });

        const saturatedReplay = await session.postJson('/api/slot/play', replayBody, {
            idempotencyKey: replayKey
        });
        assert.equal(saturatedReplay.status, 200,
            'an already completed key must replay before saturated capacity is consulted');
        assert.equal(saturatedReplay.headers.get('idempotency-status'), 'replayed');
        const saturatedReplayBody = await saturatedReplay.json();
        assert.equal(saturatedReplayBody.resultTrace, originalSlotBody.resultTrace);
        const visibleSlotRows = await database.pool.query(`
            SELECT COUNT(*)::integer AS count
            FROM slot_results
            WHERE username = $1 AND result_trace = $2
        `, [user.username, originalSlotBody.resultTrace]);
        assert.equal(visibleSlotRows.rows[0].count, 1,
            'replaying while another request is paused must not repeat the completed debit');
        assert.deepEqual(await idempotencyRecord(database.pool, user.username, replayKey), {
            status: 'completed',
            request_path: '/api/slot/play',
            response_status: 200
        });

        const firstOuterKey = 'capacity-start-outer-key-0001';
        const retryOuterKey = 'capacity-start-outer-key-0002';
        const commandId = crypto.randomUUID();
        const command = {
            commandId,
            gameId: 'constellation-repair',
            challengeId: 'lantern-wharf',
            difficulty: 'gentle',
            mode: 'solo'
        };
        let firstResponseBody;
        const result = await postWithOneCapacityRetry({
            session,
            pathname: '/api/constellation-repair/start',
            body: command,
            keys: [firstOuterKey, retryOuterKey],
            beforeRetry: async response => {
                assert.equal(response.headers.get('retry-after'), '2');
                firstResponseBody = await response.json();
                assert.deepEqual(firstResponseBody, {
                    success: false,
                    message: '服务器繁忙，请稍后重试'
                });
                assert.equal(await idempotencyRecord(database.pool, user.username, firstOuterKey), null,
                    'pre-business capacity rejection must not reserve an outer idempotency key');
                assert.deepEqual(await gameEffects(database.pool, user.username), {
                    run_count: 0,
                    command_count: 0,
                    event_count: 0
                });
                const holderResponse = await holder;
                assert.equal(holderResponse.status, 200);
                await holderResponse.json();
                await delay(25);
            }
        });

        assert.equal(result.attempt, 1, 'the explicit retryable response should permit exactly one retry');
        assert.equal(result.response.status, 201);
        assert.equal(result.response.headers.get('idempotency-status'), 'replayed');
        const responseBody = await result.response.json();
        assert.equal(responseBody.success, true);
        assert.equal(responseBody.run.gameId, 'constellation-repair');
        assert.deepEqual(await gameEffects(database.pool, user.username), {
            run_count: 1,
            command_count: 1,
            event_count: 1
        });
        assert.equal(await idempotencyRecord(database.pool, user.username, firstOuterKey), null);
        assert.deepEqual(await idempotencyRecord(database.pool, user.username, retryOuterKey), {
            status: 'completed',
            request_path: '/api/constellation-repair/start',
            response_status: 201
        });
        const commandRows = await database.pool.query(`
            SELECT command.command_id::text AS command_id
            FROM streamer_game_start_commands command
            JOIN users account ON account.id = command.actor_user_id
            WHERE account.username = $1 AND command.game_id = 'constellation-repair'
        `, [user.username]);
        assert.deepEqual(commandRows.rows, [{ command_id: commandId }]);
        const finalSlotRows = await database.pool.query(`
            SELECT COUNT(*)::integer AS count
            FROM slot_results
            WHERE username = $1
        `, [user.username]);
        assert.equal(finalSlotRows.rows[0].count, 1,
            'the completed replay must not repeat the original debit');

        console.log('Capacity/idempotency E2E passed: existing replay stayed fenced and fresh rejection was retry-safe');
    } catch (error) {
        if (app?.output?.length) {
            console.error(`Capacity/idempotency application output:\n${app.output.join('').slice(-20000)}`);
        }
        throw error;
    } finally {
        await app?.stop().catch(() => {});
        await database.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
