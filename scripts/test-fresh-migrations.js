'use strict';

require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const {
    BASE_MIGRATION,
    MIGRATIONS,
    applyDatabaseMigrations,
    migrationTransactionBody
} = require('../lib/database-migrations');
const { queueMissingPkRunners } = require('../lib/pk-runner-recovery');
const {
    acquireWorkerRoleLease,
    hasActiveWorkerRoleLease,
    releaseWorkerRoleLease
} = require('../lib/worker-role-lease');

if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
    throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to run the disposable database test');
}

const databaseSuffix = `${process.pid}_${Date.now()}`;
const databaseNames = [
    `minimal_games_migration_test_${databaseSuffix}`,
    `minimal_games_legacy_test_${databaseSuffix}`,
    `minimal_games_early_legacy_test_${databaseSuffix}`
];
if (databaseNames.some((name) => !/^[a-z0-9_]+$/.test(name))) {
    throw new Error('Unsafe test database name');
}

const commonConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    ssl: process.env.DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    options: '-c timezone=Asia/Shanghai'
};

const adminPool = new Pool({ ...commonConfig, database: process.env.DB_NAME, max: 1 });
let testPool;
let legacyPool;
let earlyLegacyPool;

async function createDisposablePool(databaseName) {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    return new Pool({ ...commonConfig, database: databaseName, max: 1 });
}

async function loadLegacyBaseline(pool) {
    const baselineSql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', BASE_MIGRATION),
        'utf8'
    );
    await pool.query('BEGIN');
    try {
        await pool.query("SET LOCAL statement_timeout = '120s'");
        await pool.query(migrationTransactionBody(baselineSql));
        await pool.query('COMMIT');
    } catch (error) {
        await pool.query('ROLLBACK').catch(() => {});
        throw error;
    }
}

async function verifyLegacyUpgrade(pool, label) {
    await applyDatabaseMigrations(pool);
    await applyDatabaseMigrations(pool);
    const result = await pool.query(`
        SELECT
            (SELECT status = 'applied' AND attempts = 1
             FROM minimal_games_schema_migrations WHERE filename = $1) AS baseline_registered,
            (SELECT COUNT(*) = $2 AND BOOL_AND(status = 'applied')
             FROM minimal_games_schema_migrations) AS migrations_applied,
            EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'wish_results'
                  AND column_name = 'gift_type'
            ) AS wish_columns_upgraded,
            EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'slot_results'
                  AND column_name = 'balance_after' AND data_type = 'bigint'
            ) AS result_money_upgraded,
            EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'wish_inventory'::regclass
                  AND tgname = 'wish_inventory_transition_guard'
                  AND NOT tgisinternal
            ) AS inventory_guard_installed,
            to_regclass('public.creator_profiles') IS NOT NULL AS creator_foundation_upgraded,
            to_regclass('public.quest_v2_assignments') IS NOT NULL AS quest_engine_upgraded,
            to_regclass('public.story_runs') IS NOT NULL AS story_world_upgraded,
            to_regclass('public.live_interaction_events') IS NOT NULL AS live_platform_upgraded,
            to_regclass('public.streamer_game_runs') IS NOT NULL AS streamer_games_upgraded,
            to_regclass('public.reward_orders') IS NOT NULL AS reward_catalog_upgraded,
            to_regclass('public.streamer_achievement_progress') IS NOT NULL AS achievements_upgraded,
            to_regclass('public.creator_inbox_user_archive_time_idx') IS NOT NULL AS phase9_inbox_index,
            to_regclass('public.reward_orders_user_status_cursor_idx') IS NOT NULL AS phase9_reward_index,
            to_regclass('public.streamer_achievement_progress_user_unlock_cursor_idx') IS NOT NULL AS phase9_achievement_index
    `, [BASE_MIGRATION, MIGRATIONS.length + 1]);
    if (!Object.values(result.rows[0]).every(Boolean)) {
        throw new Error(`${label} schema verification failed: ${JSON.stringify(result.rows[0])}`);
    }
}

async function run() {
    testPool = await createDisposablePool(databaseNames[0]);
    await applyDatabaseMigrations(testPool);
    await applyDatabaseMigrations(testPool);
    const verification = await testPool.query(`
        SELECT to_regclass('public.users') IS NOT NULL AS users,
               to_regclass('public.balance_logs') IS NOT NULL AS ledger,
               to_regclass('public.pk_spend_authorizations') IS NOT NULL AS pk_authorizations,
               to_regclass('public.worker_role_leases') IS NOT NULL AS worker_role_leases,
               to_regclass('public.admin_audit_log') IS NOT NULL AS admin_audit,
               to_regclass('public.creator_profiles') IS NOT NULL AS creator_profiles,
               to_regclass('public.quest_v2_assignments') IS NOT NULL AS quest_v2_assignments,
               to_regclass('public.story_runs') IS NOT NULL AS story_runs,
               to_regclass('public.live_interaction_events') IS NOT NULL AS live_interaction_events,
               to_regclass('public.streamer_game_runs') IS NOT NULL AS streamer_game_runs,
               to_regclass('public.reward_orders') IS NOT NULL AS reward_orders,
               to_regclass('public.streamer_achievement_definitions') IS NOT NULL AS achievement_definitions,
               to_regclass('public.streamer_achievement_progress') IS NOT NULL AS achievement_progress,
               to_regclass('public.streamer_season_archives') IS NOT NULL AS season_archives,
               to_regclass('public.creator_inbox_user_archive_time_idx') IS NOT NULL AS creator_inbox_cursor,
               to_regclass('public.quest_v2_assignments_user_updated_cursor_idx') IS NOT NULL AS quest_cursor,
               to_regclass('public.story_runs_user_campaign_version_cursor_idx') IS NOT NULL AS story_cursor,
               to_regclass('public.live_interaction_items_room_status_cursor_idx') IS NOT NULL AS live_cursor,
               to_regclass('public.reward_orders_user_status_cursor_idx') IS NOT NULL AS reward_cursor,
               to_regclass('public.streamer_achievement_progress_user_unlock_cursor_idx') IS NOT NULL AS achievement_cursor,
               EXISTS (
                   SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'users'::regclass
                     AND conname = 'users_balance_invariant_check'
                     AND convalidated
               ) AS balance_constraint,
               (
                   SELECT COUNT(*) = $1
                      AND BOOL_AND(status = 'applied')
                      AND BOOL_AND(attempts = 1)
                      AND BOOL_AND(started_at IS NOT NULL)
                      AND BOOL_AND(finished_at IS NOT NULL)
                      AND BOOL_AND(applied_at IS NOT NULL)
                   FROM minimal_games_schema_migrations
               ) AS migrations_tracked
    `, [MIGRATIONS.length + 1]);
    if (!Object.values(verification.rows[0]).every(Boolean)) {
        throw new Error(`Fresh schema verification failed: ${JSON.stringify(verification.rows[0])}`);
    }

    const phaseNinePlans = await Promise.all([
        testPool.query(`EXPLAIN (FORMAT JSON)
            SELECT id FROM creator_inbox_messages
            WHERE user_id = 1 AND archived_at IS NULL
            ORDER BY sent_at DESC, id DESC LIMIT 20`),
        testPool.query(`EXPLAIN (FORMAT JSON)
            SELECT id FROM quest_v2_assignments
            WHERE user_id = 1 ORDER BY updated_at DESC, id DESC LIMIT 30`),
        testPool.query(`EXPLAIN (FORMAT JSON)
            SELECT id FROM story_runs
            WHERE user_id = 1 AND campaign_id = 1 AND content_version_id = 1
            ORDER BY updated_at DESC, id DESC LIMIT 1`),
        testPool.query(`EXPLAIN (FORMAT JSON)
            SELECT id FROM live_interaction_items
            WHERE interaction_id = 1 AND status = 'delivered'
            ORDER BY created_at DESC, id DESC LIMIT 30`),
        testPool.query(`EXPLAIN (FORMAT JSON)
            SELECT id FROM reward_orders
            WHERE user_id = 1 AND status = 'pending_approval'
            ORDER BY created_at DESC, id DESC LIMIT 30`),
        testPool.query(`EXPLAIN (FORMAT JSON)
            SELECT achievement_id FROM streamer_achievement_progress
            WHERE user_id = 1 ORDER BY unlocked_at DESC, achievement_id DESC LIMIT 30`)
    ]);
    for (const plan of phaseNinePlans) {
        // PostgreSQL reports EXPLAIN as a utility command, so node-postgres may
        // leave Result.rowCount null even though the JSON plan row is present.
        assert.equal(plan.rows.length, 1);
        assert.ok(plan.rows[0]['QUERY PLAN'][0].Plan);
    }

    const firstWorkerLease = await acquireWorkerRoleLease(testPool, {
        role: 'gift-pk',
        workerId: 'worker-instance-a'
    });
    assert.equal(Number(firstWorkerLease.lease_generation), 1);
    assert.equal(await hasActiveWorkerRoleLease(testPool, {
        role: 'gift-pk',
        workerId: 'worker-instance-a'
    }), true);
    assert.equal(await acquireWorkerRoleLease(testPool, {
        role: 'gift-pk',
        workerId: 'worker-instance-b'
    }), null);
    await testPool.query(`
        UPDATE worker_role_leases
        SET lease_expires_at = NOW() - INTERVAL '1 second'
        WHERE role = 'gift-pk'
    `);
    const replacementWorkerLease = await acquireWorkerRoleLease(testPool, {
        role: 'gift-pk',
        workerId: 'worker-instance-b'
    });
    assert.equal(Number(replacementWorkerLease.lease_generation), 2);
    assert.equal(await releaseWorkerRoleLease(testPool, {
        role: 'gift-pk',
        workerId: 'worker-instance-b'
    }), true);

    await testPool.query(
        `INSERT INTO users (username, password_hash, balance, authorized)
         VALUES ('migration-test-user', 'not-a-real-hash', 100, TRUE)`
    );
    const initialAudit = await testPool.query(`
        SELECT actual_balance, expected_balance, post_baseline_entry_count,
               is_chain_consistent, is_consistent
        FROM balance_audit_current
        WHERE username = 'migration-test-user'
    `);
    assert.deepEqual(initialAudit.rows[0], {
        actual_balance: '100',
        expected_balance: '100',
        post_baseline_entry_count: '0',
        is_chain_consistent: true,
        is_consistent: true
    });
    await testPool.query('BEGIN');
    await testPool.query(
        "UPDATE users SET balance = 125 WHERE username = 'migration-test-user'"
    );
    await testPool.query(`
        INSERT INTO balance_logs (
            username, operation_type, amount, balance_before, balance_after, description
        ) VALUES (
            'migration-test-user', 'migration_test_credit', 25, 100, 125, 'migration test'
        )
    `);
    await testPool.query('COMMIT');
    const updatedAudit = await testPool.query(`
        SELECT actual_balance, expected_balance, post_baseline_entry_count,
               is_chain_consistent, is_consistent
        FROM balance_audit_current
        WHERE username = 'migration-test-user'
    `);
    assert.deepEqual(updatedAudit.rows[0], {
        actual_balance: '125',
        expected_balance: '125',
        post_baseline_entry_count: '1',
        is_chain_consistent: true,
        is_consistent: true
    });
    await testPool.query('BEGIN');
    await testPool.query(
        "UPDATE users SET balance = 126 WHERE username = 'migration-test-user'"
    );
    await assert.rejects(
        testPool.query('COMMIT'),
        /User balance changed without a matching ledger entry/
    );
    await testPool.query('ROLLBACK').catch(() => {});
    await assert.rejects(
        testPool.query(`
            INSERT INTO balance_logs (
                username, operation_type, amount, balance_before, balance_after, description
            ) VALUES (
                'migration-test-user', 'migration_invalid_chain', 1, 124, 125, 'invalid chain'
            )
        `),
        /Balance ledger chain is discontinuous/
    );
    await assert.rejects(
        testPool.query("UPDATE users SET balance = -1 WHERE username = 'migration-test-user'"),
        /users_balance_invariant_check/
    );
    await assert.rejects(
        testPool.query("UPDATE users SET bilibili_room_id = '12345' WHERE username = 'migration-test-user'"),
        /users_bilibili_room_binding_shape_check/
    );
    await testPool.query(`
        UPDATE users
        SET bilibili_room_id = '12345', bilibili_room_bound_at = NOW()
        WHERE username = 'migration-test-user'
    `);
    await assert.rejects(
        testPool.query("UPDATE users SET bilibili_room_id = NULL WHERE username = 'migration-test-user'"),
        /users_bilibili_room_binding_shape_check/
    );
    await testPool.query(`
        UPDATE users
        SET bilibili_room_id = NULL, bilibili_room_bound_at = NULL
        WHERE username = 'migration-test-user'
    `);
    await assert.rejects(
        testPool.query(`
            INSERT INTO pk_tasks (username, action, status)
            VALUES ('migration-test-user', 'invalid', 'pending')
        `),
        /pk_tasks_state_check/
    );

    const gift = await testPool.query(`
        INSERT INTO gift_exchanges (
            username, gift_type, gift_name, cost, status, delivery_status, quantity
        ) VALUES (
            'migration-test-user', 'test', 'Test', 10, 'funds_locked', 'pending', 1
        ) RETURNING id
    `);
    const giftId = gift.rows[0].id;
    await assert.rejects(
        testPool.query(
            "UPDATE gift_exchanges SET status = 'completed', delivery_status = 'success' WHERE id = $1",
            [giftId]
        ),
        /Illegal gift exchange state transition/
    );
    await testPool.query(`
        UPDATE gift_exchanges
        SET delivery_status = 'claimed', claim_token = 'claim', worker_id = 'worker',
            claim_generation = 1, attempt_count = 1
        WHERE id = $1
    `, [giftId]);
    await testPool.query(
        "UPDATE gift_exchanges SET delivery_status = 'processing' WHERE id = $1",
        [giftId]
    );
    await testPool.query(`
        UPDATE gift_exchanges
        SET status = 'completed', delivery_status = 'success', processed_at = NOW()
        WHERE id = $1
    `, [giftId]);
    await assert.rejects(
        testPool.query(
            "UPDATE gift_exchanges SET delivery_status = 'failed' WHERE id = $1",
            [giftId]
        ),
        /Terminal gift exchange state cannot transition/
    );

    const cancelledGift = await testPool.query(`
        INSERT INTO gift_exchanges (
            username, gift_type, gift_name, cost, status, delivery_status, quantity
        ) VALUES (
            'migration-test-user', 'cancel-test', 'Cancel Test', 10,
            'funds_locked', 'pending', 1
        ) RETURNING id
    `);
    await testPool.query(`
        UPDATE gift_exchanges
        SET status = 'failed', delivery_status = 'failed', processed_at = NOW()
        WHERE id = $1 AND started_at IS NULL
    `, [cancelledGift.rows[0].id]);
    await assert.rejects(
        testPool.query(
            "UPDATE gift_exchanges SET failure_reason = 'tampered' WHERE id = $1",
            [giftId]
        ),
        /Terminal gift exchange state cannot transition/
    );

    const pkTask = await testPool.query(`
        INSERT INTO pk_tasks (username, action, status, command_generation)
        VALUES ('migration-test-user', 'start', 'pending', 1)
        RETURNING id
    `);
    await assert.rejects(
        testPool.query(
            "UPDATE pk_tasks SET status = 'completed' WHERE id = $1",
            [pkTask.rows[0].id]
        ),
        /Illegal PK task state transition/
    );
    await testPool.query(`
        UPDATE pk_tasks
        SET status = 'claimed', claim_token = 'pk-claim', worker_id = 'worker',
            lease_expires_at = NOW() + INTERVAL '1 minute', claim_generation = 1
        WHERE id = $1
    `, [pkTask.rows[0].id]);
    await testPool.query(
        "UPDATE pk_tasks SET status = 'processing', started_at = NOW() WHERE id = $1",
        [pkTask.rows[0].id]
    );
    await testPool.query(
        "UPDATE pk_tasks SET status = 'completed', processed_at = NOW() WHERE id = $1",
        [pkTask.rows[0].id]
    );
    await assert.rejects(
        testPool.query("UPDATE pk_tasks SET error = 'tampered' WHERE id = $1", [pkTask.rows[0].id]),
        /Terminal PK task state cannot transition/
    );

    await testPool.query(`
        UPDATE users
        SET bilibili_room_id = '12345', bilibili_room_bound_at = NOW()
        WHERE username = 'migration-test-user'
    `);
    await testPool.query(`
        INSERT INTO pk_control_state (
            username, command_generation, desired_running, room_id, updated_at
        ) VALUES (
            'migration-test-user', 5, TRUE, '12345', NOW() - INTERVAL '1 minute'
        )
        ON CONFLICT (username) DO UPDATE
        SET command_generation = EXCLUDED.command_generation,
            desired_running = EXCLUDED.desired_running,
            room_id = EXCLUDED.room_id,
            updated_at = EXCLUDED.updated_at
    `);
    await testPool.query(`
        INSERT INTO pk_runner_state (
            username, room_id, running, generation_id, worker_id,
            lease_expires_at, command_generation, updated_at
        ) VALUES (
            'migration-test-user', '12345', TRUE, 'expired-generation', 'expired-worker',
            NOW() - INTERVAL '1 minute', 5, NOW() - INTERVAL '1 minute'
        )
        ON CONFLICT (username) DO UPDATE
        SET room_id = EXCLUDED.room_id,
            running = EXCLUDED.running,
            generation_id = EXCLUDED.generation_id,
            worker_id = EXCLUDED.worker_id,
            lease_expires_at = EXCLUDED.lease_expires_at,
            command_generation = EXCLUDED.command_generation,
            updated_at = EXCLUDED.updated_at
    `);
    const recoveredRunners = await queueMissingPkRunners(testPool);
    assert.equal(recoveredRunners.length, 1);
    assert.equal(Number(recoveredRunners[0].command_generation), 6);
    assert.equal((await queueMissingPkRunners(testPool)).length, 0);
    const recoveryState = await testPool.query(`
        SELECT control.command_generation, COUNT(task.id)::integer AS pending_tasks
        FROM pk_control_state AS control
        LEFT JOIN pk_tasks AS task
          ON task.username = control.username
         AND task.command_generation = control.command_generation
         AND task.action = 'start'
         AND task.status = 'pending'
        WHERE control.username = 'migration-test-user'
        GROUP BY control.command_generation
    `);
    assert.deepEqual(recoveryState.rows[0], {
        command_generation: '6',
        pending_tasks: 1
    });

    const idempotency = await testPool.query(`
        INSERT INTO idempotency_keys (
            username, idempotency_key, request_method, request_path, request_hash
        ) VALUES (
            'migration-test-user', 'migration-idempotency-key', 'POST', '/api/test', repeat('a', 64)
        ) RETURNING id
    `);
    await testPool.query(`
        UPDATE idempotency_keys
        SET status = 'completed', response_status = 200, response_body = '{"success":true}'::jsonb
        WHERE id = $1
    `, [idempotency.rows[0].id]);
    await assert.rejects(
        testPool.query(`
            UPDATE idempotency_keys
            SET response_body = '{"success":false}'::jsonb
            WHERE id = $1
        `, [idempotency.rows[0].id]),
        /Terminal idempotency state is immutable/
    );

    const outbox = await testPool.query(`
        INSERT INTO delivery_outbox (event_type, aggregate_id, payload)
        VALUES ('enqueue_inventory', 1, '{"username":"migration-test-user"}'::jsonb)
        RETURNING id
    `);
    await testPool.query(`
        UPDATE delivery_outbox
        SET status = 'processing', claim_token = 'claim', lease_expires_at = NOW() + INTERVAL '1 minute'
        WHERE id = $1
    `, [outbox.rows[0].id]);
    await testPool.query(`
        UPDATE delivery_outbox
        SET status = 'completed', claim_token = NULL, lease_expires_at = NULL, completed_at = NOW()
        WHERE id = $1
    `, [outbox.rows[0].id]);
    await assert.rejects(
        testPool.query("UPDATE delivery_outbox SET status = 'pending' WHERE id = $1", [outbox.rows[0].id]),
        /Terminal delivery outbox state cannot transition/
    );

    await testPool.query(`
        INSERT INTO pk_spend_authorizations (
            authorization_id, username, room_id, runner_generation, worker_id,
            gift_ids, ticket_count, request_hash
        ) VALUES (
            'migration-authorization', 'migration-test-user', '12345', 'generation-1', 'worker-1',
            '[{"giftId":1,"quantity":1}]'::jsonb, 1, repeat('b', 64)
        )
    `);
    await assert.rejects(
        testPool.query(`
            UPDATE pk_spend_authorizations
            SET status = 'settled', report_id = 'invalid-direct-settlement'
            WHERE authorization_id = 'migration-authorization'
        `),
        /Illegal PK spend authorization transition/
    );
    await testPool.query(`
        UPDATE pk_spend_authorizations
        SET status = 'sending', started_at = NOW()
        WHERE authorization_id = 'migration-authorization'
    `);
    await assert.rejects(
        testPool.query(`
            UPDATE pk_spend_authorizations
            SET status = 'released'
            WHERE authorization_id = 'migration-authorization'
        `),
        /Illegal PK spend authorization transition/
    );
    await testPool.query(`
        UPDATE pk_spend_authorizations
        SET status = 'uncertain', report_id = 'migration-report', outcome_reason = 'needs review'
        WHERE authorization_id = 'migration-authorization'
    `);
    await testPool.query(`
        UPDATE pk_spend_authorizations
        SET status = 'released', outcome_reason = 'confirmed not sent'
        WHERE authorization_id = 'migration-authorization'
    `);
    await assert.rejects(
        testPool.query(`
            UPDATE pk_spend_authorizations
            SET outcome_reason = 'tampered'
            WHERE authorization_id = 'migration-authorization'
        `),
        /Terminal PK spend authorization is immutable/
    );

    await testPool.query(`
        INSERT INTO pk_spend_authorizations (
            authorization_id, username, room_id, runner_generation, worker_id,
            gift_ids, ticket_count, request_hash
        ) VALUES (
            'migration-releasable-authorization', 'migration-test-user', '12345',
            'generation-2', 'worker-1', '[{"giftId":1,"quantity":1}]'::jsonb,
            1, repeat('c', 64)
        )
    `);
    await testPool.query(`
        UPDATE pk_spend_authorizations
        SET status = 'released', outcome_reason = 'room changed', settled_at = NOW()
        WHERE authorization_id = 'migration-releasable-authorization'
    `);

    const pkLog = await testPool.query(`
        INSERT INTO pk_gift_logs (
            username, room_id, gift_ids, ticket_count, script_name, success, reason, report_id
        ) VALUES (
            'migration-test-user', '12345', '[{"giftId":1,"quantity":1}]'::jsonb,
            1, 'migration-test', TRUE, 'sent', 'migration-log-report'
        ) RETURNING id
    `);
    await assert.rejects(
        testPool.query('DELETE FROM pk_gift_logs WHERE id = $1', [pkLog.rows[0].id]),
        /append-only/
    );

    const inventoryExchange = await testPool.query(`
        INSERT INTO gift_exchanges (
            username, gift_type, gift_name, cost, status, delivery_status, quantity
        ) VALUES (
            'migration-test-user', 'inventory-test', 'Inventory Test', 0,
            'funds_locked', 'pending', 1
        ) RETURNING id
    `);
    const inventory = await testPool.query(`
        INSERT INTO wish_inventory (
            username, gift_type, gift_name, bilibili_gift_id, status, expires_at
        ) VALUES (
            'migration-test-user', 'inventory-test', 'Inventory Test', '1',
            'stored', NOW() + INTERVAL '1 day'
        ) RETURNING id
    `);
    await assert.rejects(
        testPool.query(
            "UPDATE wish_inventory SET status = 'queued' WHERE id = $1",
            [inventory.rows[0].id]
        ),
        /wish_inventory_state_shape_check/
    );
    await testPool.query(`
        UPDATE wish_inventory
        SET status = 'queued', gift_exchange_id = $2
        WHERE id = $1
    `, [inventory.rows[0].id, inventoryExchange.rows[0].id]);
    await testPool.query(`
        UPDATE wish_inventory
        SET status = 'sent', sent_at = NOW()
        WHERE id = $1
    `, [inventory.rows[0].id]);
    await assert.rejects(
        testPool.query(
            "UPDATE wish_inventory SET status = 'stored', gift_exchange_id = NULL, sent_at = NULL WHERE id = $1",
            [inventory.rows[0].id]
        ),
        /Terminal wish inventory state is immutable/
    );

    await testPool.query(`
        INSERT INTO quiz_sessions (
            id, username, status, expires_at, settled_at
        ) VALUES (
            'migration-quiz-session', 'migration-test-user', 'settled', NOW(), NOW()
        )
    `);
    await testPool.query(`
        INSERT INTO submissions (
            username, score, submitted_at, result_trace, quiz_session_id
        ) VALUES (
            'migration-test-user', 10, NOW(), 'migration-quiz-trace-1', 'migration-quiz-session'
        )
    `);
    await assert.rejects(
        testPool.query(`
            INSERT INTO submissions (
                username, score, submitted_at, result_trace, quiz_session_id
            ) VALUES (
                'migration-test-user', 11, NOW(), 'migration-quiz-trace-2', 'migration-quiz-session'
            )
        `),
        /idx_submissions_quiz_session_unique/
    );

    legacyPool = await createDisposablePool(databaseNames[1]);
    await loadLegacyBaseline(legacyPool);
    await legacyPool.query(`
        INSERT INTO users (username, password_hash, balance, authorized)
        VALUES ('legacy-fraction-user', 'not-a-real-hash', 100, TRUE)
    `);
    await legacyPool.query(`
        INSERT INTO balance_logs (
            username, operation_type, amount, balance_before, balance_after, description
        ) VALUES (
            'legacy-fraction-user', 'legacy_fraction_test', -0.5, 100.5, 100,
            'legacy fractional evidence'
        )
    `);
    await verifyLegacyUpgrade(legacyPool, 'Baseline legacy');
    const preservedLegacyFraction = await legacyPool.query(`
        SELECT amount = -0.5
               AND balance_before = 100.5
               AND balance_after = 100 AS preserved
        FROM balance_logs
        WHERE username = 'legacy-fraction-user'
          AND operation_type = 'legacy_fraction_test'
    `);
    assert.equal(preservedLegacyFraction.rows[0]?.preserved, true);
    const legacyIntegerConstraint = await legacyPool.query(`
        SELECT convalidated
        FROM pg_constraint
        WHERE conrelid = 'balance_logs'::regclass
          AND conname = 'balance_logs_safe_integer_check'
    `);
    assert.equal(legacyIntegerConstraint.rows[0]?.convalidated, false);
    await legacyPool.query(
        'ALTER TABLE balance_logs DISABLE TRIGGER balance_logs_chain_guard'
    );
    try {
        await assert.rejects(
            legacyPool.query(`
                INSERT INTO balance_logs (
                    username, operation_type, amount, balance_before, balance_after, description
                ) VALUES (
                    'legacy-fraction-user', 'new_fraction_test', 0.5, 100, 100.5,
                    'must be rejected'
                )
            `),
            /balance_logs_safe_integer_check/
        );
    } finally {
        await legacyPool.query(
            'ALTER TABLE balance_logs ENABLE TRIGGER balance_logs_chain_guard'
        );
    }

    earlyLegacyPool = await createDisposablePool(databaseNames[2]);
    await loadLegacyBaseline(earlyLegacyPool);
    await earlyLegacyPool.query(`
        ALTER TABLE wish_progress RENAME COLUMN gift_type TO wish_type;
        ALTER TABLE wish_results RENAME COLUMN gift_type TO wish_type;
        ALTER TABLE wish_results RENAME COLUMN reward TO reward_name;
        ALTER TABLE wish_sessions RENAME COLUMN gift_type TO wish_type;
        ALTER TABLE wish_sessions RENAME COLUMN gift_name TO wish_name;
        ALTER TABLE wish_results DROP COLUMN IF EXISTS wish_session_id;
        ALTER TABLE wish_results DROP COLUMN IF EXISTS batch_position;
        ALTER TABLE wish_results DROP COLUMN IF EXISTS result_trace;
    `);
    await verifyLegacyUpgrade(earlyLegacyPool, 'Early legacy');
    console.log('Fresh and two legacy database migration tests passed');
}

async function cleanup() {
    await Promise.all([
        testPool?.end().catch(() => {}),
        legacyPool?.end().catch(() => {}),
        earlyLegacyPool?.end().catch(() => {})
    ]);
    for (const databaseName of databaseNames) {
        await adminPool.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
            [databaseName]
        ).catch(() => {});
        await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch((error) => {
            console.error(`Failed to drop disposable database ${databaseName}:`, error.message);
            process.exitCode = 1;
        });
    }
    await adminPool.end().catch(() => {});
}

run()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(cleanup);
