'use strict';

require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const {
    BASE_MIGRATION,
    MIGRATIONS,
    applyDatabaseMigrations,
    migrationTransactionBody
} = require('../lib/database-migrations');
const { queueMissingPkRunners } = require('../lib/pk-runner-recovery');
const { StreamerGameRepository } = require('../repositories/streamer-game-repository');
const { QuestV2CatalogRepository } = require('../repositories/quest-v2-catalog-repository');
const { QuestV2Service } = require('../services/quest-v2-service');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { LiveInteractionService } = require('../services/live-interaction-service');
const registerAdminCreatorDirectorRoutes = require('../routes/admin-creator-director');
const BalanceLogger = require('../balance-logger');
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
let questConcurrencyPool;

function securityHash(value) {
    return createHash('sha256').update(`migration-security:${value}`).digest('hex');
}

async function createQuestVersion(client, {
    slug,
    target = 1,
    rewardPoints = 0,
    repeatable = false,
    cooldownHours = 0,
    startsAt = null,
    endsAt = null,
    lifecycle = 'active',
    allowEventReuse = false
}) {
    const definition = await client.query(`
        INSERT INTO quest_v2_definitions(slug, source, created_by)
        VALUES($1, 'owner_studio', 'migration-owner')
        RETURNING id
    `, [slug]);
    const rule = {
        op: 'event_count',
        event: 'story.episode.completed',
        target,
        filters: {}
    };
    const version = await client.query(`
        INSERT INTO quest_v2_versions(
            definition_id, version, lifecycle, category, tags, difficulty,
            estimated_minutes, safety_class, title_zh, title_en,
            description_zh, description_en, hint_zh, hint_en,
            completion_zh, completion_en, verification_mode, consent_category,
            eligibility_rule, completion_rule, reward_points, review_policy,
            cooldown_hours, repeatable, allow_event_reuse, starts_at, ends_at,
            published_at, content_hash
        ) VALUES(
            $1, 1, $2::VARCHAR(20), 'story', ARRAY['security'], 'guided', 5, 'standard',
            $3, $4, $3, $4, $3, $4, $3, $4, 'automatic', 'story',
            '{"op":"relationship_level","minimum":1}'::JSONB, $5::JSONB,
            $6, 'none', $7, $8, $9, $10, $11,
            CASE WHEN $2::VARCHAR(20) IN ('active','scheduled','retired') THEN NOW() ELSE NULL END,
            $12
        ) RETURNING id
    `, [definition.rows[0].id, lifecycle, `安全窗口 ${slug}`, `Security window ${slug}`,
        JSON.stringify(rule), rewardPoints, cooldownHours, repeatable,
        allowEventReuse, startsAt, endsAt, securityHash(`version:${slug}`)]);
    await client.query(`
        INSERT INTO quest_v2_step_definitions(
            version_id, step_key, ordinal, title_zh, title_en,
            instructions_zh, instructions_en, evidence_kind, completion_rule
        ) VALUES($1, 'complete', 1, '完成', 'Complete', '完成', 'Complete',
                 'trusted_event', $2::JSONB)
    `, [version.rows[0].id, JSON.stringify(rule)]);
    return Number(version.rows[0].id);
}

async function createQuestWorkflowVersion(client, {
    slug,
    verificationMode,
    reviewPolicy,
    rewardPoints = 0,
    repeatable = false,
    cooldownHours = 0,
    completionRule,
    steps
}) {
    const definition = await client.query(`
        INSERT INTO quest_v2_definitions(slug, source, created_by)
        VALUES($1, 'owner_studio', 'migration-owner')
        RETURNING id
    `, [slug]);
    const version = await client.query(`
        INSERT INTO quest_v2_versions(
            definition_id,version,lifecycle,category,tags,difficulty,
            estimated_minutes,safety_class,title_zh,title_en,
            description_zh,description_en,hint_zh,hint_en,
            completion_zh,completion_en,verification_mode,consent_category,
            eligibility_rule,completion_rule,reward_points,review_policy,
            cooldown_hours,repeatable,published_at,content_hash
        ) VALUES(
            $1,1,'active','story',ARRAY['p1-security'],'guided',10,'standard',
            $2,$3,$2,$3,$2,$3,$2,$3,$4,'story',
            '{"op":"relationship_level","minimum":1}'::JSONB,$5::JSONB,
            $6,$7,$8,$9,NOW(),$10
        ) RETURNING id
    `, [
        definition.rows[0].id,
        `P1 生命周期 ${slug}`,
        `P1 lifecycle ${slug}`,
        verificationMode,
        JSON.stringify(completionRule),
        rewardPoints,
        reviewPolicy,
        cooldownHours,
        repeatable,
        securityHash(`p1-version:${slug}`)
    ]);
    for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        await client.query(`
            INSERT INTO quest_v2_step_definitions(
                version_id,step_key,ordinal,title_zh,title_en,
                instructions_zh,instructions_en,evidence_kind,
                depends_on_keys,completion_rule,required
            ) VALUES($1,$2,$3,$4,$5,$4,$5,$6,$7,$8::JSONB,TRUE)
        `, [
            version.rows[0].id,
            step.key,
            index + 1,
            `步骤 ${index + 1}`,
            `Step ${index + 1}`,
            step.evidenceKind,
            step.dependsOnKeys || [],
            JSON.stringify(step.completionRule)
        ]);
    }
    return Number(version.rows[0].id);
}

async function createScheduledBoard(client, slug, versionId, {
    lifecycle = 'active',
    scheduleLifecycle = 'active',
    startsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
} = {}) {
    const board = await client.query(`
        INSERT INTO quest_v2_boards(slug,title_zh,title_en,lifecycle,content_hash)
        VALUES($1,$2,$3,$4,$5) RETURNING id
    `, [slug, `安全周板 ${slug}`, `Security board ${slug}`, lifecycle,
        securityHash(`board:${slug}`)]);
    await client.query(`
        INSERT INTO quest_v2_board_slots(board_id,slot_number,version_id)
        VALUES($1,1,$2)
    `, [board.rows[0].id, versionId]);
    await client.query(`
        INSERT INTO quest_v2_schedules(
            schedule_key,board_id,timezone,starts_at,ends_at,lifecycle
        ) VALUES($1,$2,'UTC',$3,$4,$5)
    `, [`security-${slug}`, board.rows[0].id, startsAt, endsAt, scheduleLifecycle]);
    return Number(board.rows[0].id);
}

function internalStoryEvent(number, username, occurredAt, eventType = 'story.episode.completed') {
    return {
        sourceType: 'story',
        sourceEventId: `story-${eventType === 'story.choice.committed' ? 'event' : 'episode'}:migration-${number}:security-window`,
        username,
        eventType,
        occurredAt: new Date(occurredAt).toISOString(),
        payload: eventType === 'story.choice.committed'
            ? { runId: number, contentVersion: 1, episodeSlug: 'security-window', choiceId: 'safe-choice' }
            : { runId: number, contentVersion: 1, episodeSlug: 'security-window' }
    };
}

async function verifyQuestAndInvitationSecurity(pool, databaseName) {
    const username = 'quest-security-user';
    await pool.query(`
        INSERT INTO users(username,password_hash,balance,authorized)
        VALUES($1,'not-a-real-hash',100,TRUE),
              ('migration-owner','not-a-real-hash',100,TRUE)
    `, [username]);
    await pool.query(`UPDATE users SET is_admin=TRUE WHERE username='migration-owner'`);
    await pool.query(`
        INSERT INTO creator_profiles(user_id,display_name,live_interaction_opt_in)
        SELECT id,'Quest Security Creator',TRUE FROM users WHERE username=$1
    `, [username]);
    await pool.query(`
        INSERT INTO relationship_profiles(user_id)
        SELECT id FROM users WHERE username=$1
    `, [username]);

    const questService = new QuestV2Service({ pool, BalanceLogger });
    await questService.initialize();
    const userRow = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
    const userId = Number(userRow.rows[0].id);

    // Execute the audited invitation query through the real service and its
    // production route handler. PostgreSQL itself must resolve version.category.
    const liveRepository = new LiveInteractionRepository({ pool });
    const liveService = new LiveInteractionService({
        repository: liveRepository,
        ownerUsername: 'migration-owner',
        questEnabled: true,
        games: [
            { id: 'quiz', href: '/quiz' },
            { id: 'adventure', href: '/adventure' },
            { id: 'doudizhu', href: '/doudizhu' }
        ],
        storyNodeIds: [
            'quiet-frequency.owner',
            'locked-window.owner',
            'constellation-pieces.owner'
        ]
    });
    const opened = await liveService.open('migration-owner', {
        commandId: randomUUID(), creatorUsername: username
    });
    const registeredPosts = new Map();
    const app = {
        get() {},
        post(pathname, ...handlers) {
            registeredPosts.set(pathname, handlers.at(-1));
        }
    };
    const pass = (_req, _res, next) => next();
    registerAdminCreatorDirectorRoutes(app, {
        creatorService: { adminSummaries: async () => ({ creators: [] }) },
        liveInteractionService: liveService,
        streamerWorldFlags: {
            creatorFoundationEnabled: true,
            liveInteractionsEnabled: true,
            rewardsEnabled: false,
            ownerUsername: 'migration-owner'
        },
        generateCSRFToken: () => 'migration-csrf',
        requireLogin: pass,
        requireAdmin: pass,
        requireCSRF: pass,
        security: {
            readHeavyRateLimit: pass,
            basicRateLimit: pass,
            userActionRateLimit: pass
        }
    });
    const response = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return body; }
    };
    await registeredPosts.get('/api/admin/live/send')({
        session: { user: { username: 'migration-owner' } },
        requestId: 'migration-live-quest-route',
        body: {
            commandId: randomUUID(),
            creatorUsername: username,
            interactionId: opened.interaction.id,
            expectedRevision: opened.interaction.revision,
            itemType: 'quest_invite',
            templateKey: 'quest-invite.small-signal',
            referenceId: 'welcome-map-reading',
            expiresInMinutes: 60
        }
    }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.item.payload.referenceId, 'welcome-map-reading');
    assert.equal(response.body.item.payload.actionPath, '/quests');

    const client = await pool.connect();
    let windowVersion;
    let windowBoard;
    let concurrentVersion;
    let concurrentBoard;
    try {
        await client.query('BEGIN');
        windowVersion = await createQuestVersion(client, {
            slug: 'security-event-window', target: 1, rewardPoints: 25,
            repeatable: true
        });
        windowBoard = await createScheduledBoard(client, 'security-event-window-board', windowVersion);
        concurrentVersion = await createQuestVersion(client, {
            slug: 'security-concurrent-final', target: 2, rewardPoints: 30,
            repeatable: false
        });
        concurrentBoard = await createScheduledBoard(client, 'security-concurrent-final-board',
            concurrentVersion);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }

    const offer = await questService.offer(username, {
        versionId: windowVersion, boardId: windowBoard
    }, { requestId: 'migration-window-offer-1' });
    const accepted = await questService.transition(username, {
        assignmentId: offer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'migration-window-accept-1' });
    assert.equal(accepted.status, 'active');
    let assignmentRow = (await pool.query(`
        SELECT accepted_at,due_at FROM quest_v2_assignments WHERE id=$1
    `, [offer.assignmentId])).rows[0];
    const acceptedMs = new Date(assignmentRow.accepted_at).getTime();
    const preAcceptance = await questService.transaction((transactionClient) =>
        questService.recordInternalTrustedEvent(transactionClient,
            internalStoryEvent(1001, username, acceptedMs - 1),
            { requestId: 'migration-window-pre-accept' }));
    assert.deepEqual(preAcceptance.matches, []);
    assert.equal((await pool.query('SELECT status FROM quest_v2_assignments WHERE id=$1',
        [offer.assignmentId])).rows[0].status, 'active');

    const postAcceptance = await questService.transaction((transactionClient) =>
        questService.recordInternalTrustedEvent(transactionClient,
            internalStoryEvent(1002, username, acceptedMs + 1),
            { requestId: 'migration-window-post-accept' }));
    assert.equal(postAcceptance.matches.length, 1);
    const replay = await questService.transaction((transactionClient) =>
        questService.recordInternalTrustedEvent(transactionClient,
            internalStoryEvent(1002, username, acceptedMs + 1),
            { requestId: 'migration-window-post-accept' }));
    assert.deepEqual(replay, postAcceptance);
    const firstSettlement = await pool.query(`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM quest_v2_reward_settlements WHERE assignment_id=$1) AS settlements,
          (SELECT COUNT(*)::INTEGER FROM balance_logs
             WHERE username=$2 AND operation_type='quest_auto_reward'
               AND game_data->>'assignmentId'=$1::TEXT) AS ledger_entries
    `, [offer.assignmentId, username]);
    assert.deepEqual(firstSettlement.rows[0], { settlements: 1, ledger_entries: 1 });

    // A new occurrence whose accepted_at is adversarially backdated still
    // cannot recycle the first occurrence's durable event consumption.
    const secondOffer = await questService.offer(username, {
        versionId: windowVersion, boardId: windowBoard
    }, { requestId: 'migration-window-offer-2' });
    await questService.transition(username, {
        assignmentId: secondOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'migration-window-accept-2' });
    await pool.query(`
        UPDATE quest_v2_assignments
        SET accepted_at=$2, due_at=NOW()+INTERVAL '1 hour'
        WHERE id=$1
    `, [secondOffer.assignmentId, new Date(acceptedMs).toISOString()]);
    const crossOccurrence = await questService.transaction((transactionClient) =>
        questService.recordInternalTrustedEvent(transactionClient,
            internalStoryEvent(1003, username, Date.now(), 'story.choice.committed'),
            { requestId: 'migration-window-cross-occurrence' }));
    assert.deepEqual(crossOccurrence.matches, []);
    assert.equal((await pool.query('SELECT status FROM quest_v2_assignments WHERE id=$1',
        [secondOffer.assignmentId])).rows[0].status, 'active');

    // Expiry boundary is inclusive at due_at and rejects anything after it.
    await pool.query(`
        UPDATE quest_v2_assignments
        SET due_at=GREATEST(offered_at + INTERVAL '1 millisecond', NOW()-INTERVAL '1 millisecond')
        WHERE id=$1
    `, [secondOffer.assignmentId]);
    assignmentRow = (await pool.query('SELECT due_at FROM quest_v2_assignments WHERE id=$1',
        [secondOffer.assignmentId])).rows[0];
    const afterDue = await questService.transaction((transactionClient) =>
        questService.recordInternalTrustedEvent(transactionClient,
            internalStoryEvent(1004, username, new Date(assignmentRow.due_at).getTime() + 1),
            { requestId: 'migration-window-after-due' }));
    assert.deepEqual(afterDue.matches, []);

    await assert.rejects(
        questService.transaction((transactionClient) => questService.recordInternalTrustedEvent(
            transactionClient,
            internalStoryEvent(1005, username, Date.now() + 10 * 60 * 1000),
            { requestId: 'migration-window-future' }
        )),
        (error) => error.code === 'TRUSTED_EVENT_FUTURE_TIMESTAMP'
    );

    await pool.query(`
        UPDATE quest_v2_assignments
        SET status='cancelled',resolved_at=NOW(),revision=revision+1
        WHERE id=$1
    `, [secondOffer.assignmentId]);
    const concurrentOffer = await questService.offer(username, {
        versionId: concurrentVersion, boardId: concurrentBoard
    }, { requestId: 'migration-concurrent-offer' });
    await questService.transition(username, {
        assignmentId: concurrentOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'migration-concurrent-accept' });
    const concurrentAssignment = (await pool.query(`
        SELECT accepted_at FROM quest_v2_assignments WHERE id=$1
    `, [concurrentOffer.assignmentId])).rows[0];
    const concurrentAcceptedMs = new Date(concurrentAssignment.accepted_at).getTime();
    const firstProgress = await questService.transaction((transactionClient) =>
        questService.recordInternalTrustedEvent(transactionClient,
            internalStoryEvent(1010, username, concurrentAcceptedMs + 1),
            { requestId: 'migration-concurrent-first' }));
    assert.deepEqual(firstProgress.matches, []);

    questConcurrencyPool = new Pool({ ...commonConfig, database: databaseName, max: 4 });
    const finalResults = await Promise.all([
        questService.transaction((transactionClient) => questService.recordInternalTrustedEvent(
            transactionClient, internalStoryEvent(1011, username, Date.now()),
            { requestId: 'migration-concurrent-final-a' })),
        new QuestV2Service({ pool: questConcurrencyPool, BalanceLogger }).transaction(
            (transactionClient) => new QuestV2Service({
                pool: questConcurrencyPool,
                BalanceLogger
            }).recordInternalTrustedEvent(transactionClient,
                internalStoryEvent(1012, username, Date.now()),
                { requestId: 'migration-concurrent-final-b' }))
    ]);
    assert.equal(finalResults.reduce((sum, result) => sum + result.matches.length, 0), 1);
    const concurrentSettlement = await pool.query(`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM quest_v2_reward_settlements WHERE assignment_id=$1) AS settlements,
          (SELECT COUNT(*)::INTEGER FROM balance_logs
             WHERE username=$2 AND operation_type='quest_auto_reward'
               AND game_data->>'assignmentId'=$1::TEXT) AS ledger_entries,
          (SELECT COUNT(*)::INTEGER FROM quest_v2_assignment_events
             WHERE assignment_id=$1 AND event_type='quest.trusted.completed') AS terminal_events
    `, [concurrentOffer.assignmentId, username]);
    assert.deepEqual(concurrentSettlement.rows[0], {
        settlements: 1, ledger_entries: 1, terminal_events: 1
    });

    const rollbackSetup = await pool.connect();
    let rollbackVersion;
    let rollbackBoard;
    try {
        await rollbackSetup.query('BEGIN');
        rollbackVersion = await createQuestVersion(rollbackSetup, {
            slug: 'security-ledger-rollback', rewardPoints: 40
        });
        rollbackBoard = await createScheduledBoard(rollbackSetup,
            'security-ledger-rollback-board', rollbackVersion);
        await rollbackSetup.query('COMMIT');
    } catch (error) {
        await rollbackSetup.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        rollbackSetup.release();
    }
    const rollbackOffer = await questService.offer(username, {
        versionId: rollbackVersion, boardId: rollbackBoard
    }, { requestId: 'migration-rollback-offer' });
    await questService.transition(username, {
        assignmentId: rollbackOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'migration-rollback-accept' });
    const rollbackAcceptedAt = (await pool.query(`
        SELECT accepted_at FROM quest_v2_assignments WHERE id=$1
    `, [rollbackOffer.assignmentId])).rows[0].accepted_at;
    const rejectedSourceId = 'story-episode:migration-1020:security-window';
    const failingQuestService = new QuestV2Service({
        pool,
        BalanceLogger: { updateBalance: async () => ({ success: false }) }
    });
    await assert.rejects(failingQuestService.transaction((transactionClient) =>
        failingQuestService.recordInternalTrustedEvent(transactionClient,
            internalStoryEvent(1020, username, new Date(rollbackAcceptedAt).getTime() + 1),
            { requestId: 'migration-rollback-final' })),
    /Quest reward ledger update failed/);
    const rollbackState = await pool.query(`
        SELECT
          (SELECT status FROM quest_v2_assignments WHERE id=$1) AS assignment_status,
          (SELECT COUNT(*)::INTEGER FROM quest_v2_reward_settlements WHERE assignment_id=$1) AS settlements,
          (SELECT COUNT(*)::INTEGER FROM quest_v2_trusted_events
             WHERE source_type='story' AND dedupe_key=$2) AS trusted_events,
          (SELECT COUNT(*)::INTEGER FROM quest_v2_assignment_event_consumptions
             WHERE assignment_id=$1) AS consumptions,
          (SELECT COUNT(*)::INTEGER FROM balance_logs
             WHERE username=$3 AND operation_type='quest_auto_reward'
               AND game_data->>'assignmentId'=$1::TEXT) AS ledger_entries
    `, [rollbackOffer.assignmentId, rejectedSourceId, username]);
    assert.deepEqual(rollbackState.rows[0], {
        assignment_status: 'active', settlements: 0, trusted_events: 0,
        consumptions: 0, ledger_entries: 0
    });

    // Candidate loading and assignment creation share one transaction and
    // fail closed for every schedule/category/lifecycle boundary.
    const catalogClient = await pool.connect();
    const unavailableCandidates = [];
    try {
        await catalogClient.query('BEGIN');
        const catalog = new QuestV2CatalogRepository(catalogClient);
        assert.ok(await catalog.loadOfferCandidate(userId, windowVersion, windowBoard, null));

        const futureVersion = await createQuestVersion(catalogClient, {
            slug: 'security-future-schedule'
        });
        const futureBoard = await createScheduledBoard(catalogClient, 'security-future-schedule-board',
            futureVersion, {
                scheduleLifecycle: 'active',
                startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
            });
        assert.equal(await catalog.loadOfferCandidate(userId, futureVersion, futureBoard, null), null);
        unavailableCandidates.push({ versionId: futureVersion, boardId: futureBoard });

        const scheduledVersion = await createQuestVersion(catalogClient, {
            slug: 'security-scheduled-current'
        });
        const scheduledBoard = await createScheduledBoard(catalogClient,
            'security-scheduled-current-board', scheduledVersion, {
                scheduleLifecycle: 'scheduled'
            });
        assert.equal(await catalog.loadOfferCandidate(userId, scheduledVersion, scheduledBoard, null), null);
        unavailableCandidates.push({ versionId: scheduledVersion, boardId: scheduledBoard });

        const expiredVersion = await createQuestVersion(catalogClient, {
            slug: 'security-expired-schedule'
        });
        const expiredBoard = await createScheduledBoard(catalogClient, 'security-expired-schedule-board',
            expiredVersion, {
                startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                endsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
            });
        assert.equal(await catalog.loadOfferCandidate(userId, expiredVersion, expiredBoard, null), null);
        unavailableCandidates.push({ versionId: expiredVersion, boardId: expiredBoard });

        const futureWindowVersion = await createQuestVersion(catalogClient, {
            slug: 'security-future-version-window',
            startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        });
        const futureWindowBoard = await createScheduledBoard(catalogClient,
            'security-future-version-window-board', futureWindowVersion);
        assert.equal(await catalog.loadOfferCandidate(userId, futureWindowVersion,
            futureWindowBoard, null), null);
        unavailableCandidates.push({ versionId: futureWindowVersion, boardId: futureWindowBoard });

        const expiredWindowVersion = await createQuestVersion(catalogClient, {
            slug: 'security-expired-version-window',
            endsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
        });
        const expiredWindowBoard = await createScheduledBoard(catalogClient,
            'security-expired-version-window-board', expiredWindowVersion);
        assert.equal(await catalog.loadOfferCandidate(userId, expiredWindowVersion,
            expiredWindowBoard, null), null);
        unavailableCandidates.push({ versionId: expiredWindowVersion, boardId: expiredWindowBoard });

        const retiredVersion = await createQuestVersion(catalogClient, {
            slug: 'security-retired-version', lifecycle: 'retired'
        });
        const retiredVersionBoard = await createScheduledBoard(catalogClient,
            'security-retired-version-board', retiredVersion);
        assert.equal(await catalog.loadOfferCandidate(userId, retiredVersion, retiredVersionBoard, null), null);
        unavailableCandidates.push({ versionId: retiredVersion, boardId: retiredVersionBoard });

        const retiredBoardVersion = await createQuestVersion(catalogClient, {
            slug: 'security-retired-board'
        });
        const retiredBoard = await createScheduledBoard(catalogClient, 'security-retired-board-board',
            retiredBoardVersion, { lifecycle: 'retired' });
        assert.equal(await catalog.loadOfferCandidate(userId, retiredBoardVersion, retiredBoard, null), null);
        unavailableCandidates.push({ versionId: retiredBoardVersion, boardId: retiredBoard });

        await catalogClient.query(`
            INSERT INTO creator_preferences(
                user_id,preference_type,preference_key,preference_value,source
            ) VALUES($1,'quest_category','story','block','creator')
        `, [userId]);
        assert.equal(await catalog.loadOfferCandidate(userId, windowVersion, windowBoard, null), null);
        await catalogClient.query(`DELETE FROM creator_preferences
            WHERE user_id=$1 AND preference_type='quest_category' AND preference_key='story'`, [userId]);
        await catalogClient.query('COMMIT');
    } catch (error) {
        await catalogClient.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        catalogClient.release();
    }

    for (let index = 0; index < unavailableCandidates.length; index += 1) {
        await assert.rejects(questService.offer(username, unavailableCandidates[index], {
            requestId: `migration-unavailable-offer-${index}`
        }), (error) => error.code === 'QUEST_NOT_ELIGIBLE'
            && error.status === 403 && error.message === 'Quest is unavailable');
    }

    await pool.query(`
        INSERT INTO creator_preferences(
            user_id,preference_type,preference_key,preference_value,source
        ) VALUES($1,'quest_category','story','block','creator')
    `, [userId]);
    await assert.rejects(questService.offer(username, {
        versionId: windowVersion, boardId: windowBoard
    }, { requestId: 'migration-blocked-category-offer' }),
    (error) => error.code === 'QUEST_NOT_ELIGIBLE'
        && error.status === 403 && error.message === 'Quest is unavailable');
    await pool.query(`DELETE FROM creator_preferences
        WHERE user_id=$1 AND preference_type='quest_category' AND preference_key='story'`, [userId]);

    const scheduleLocker = await pool.connect();
    const scheduleUpdater = await questConcurrencyPool.connect();
    try {
        await scheduleLocker.query('BEGIN');
        const lockedCandidate = await new QuestV2CatalogRepository(scheduleLocker)
            .loadOfferCandidate(userId, windowVersion, windowBoard, null);
        assert.ok(lockedCandidate);
        await scheduleUpdater.query('BEGIN');
        await scheduleUpdater.query("SET LOCAL lock_timeout='150ms'");
        await assert.rejects(scheduleUpdater.query(`
            UPDATE quest_v2_schedules SET lifecycle='cancelled'
            WHERE board_id=$1 AND lifecycle='active'
        `, [windowBoard]), (error) => error.code === '55P03');
        await scheduleUpdater.query('ROLLBACK');
        await scheduleLocker.query('COMMIT');
    } catch (error) {
        await scheduleUpdater.query('ROLLBACK').catch(() => {});
        await scheduleLocker.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        scheduleUpdater.release();
        scheduleLocker.release();
    }

    const cooldownVersion = await (async () => {
        const setup = await pool.connect();
        try {
            await setup.query('BEGIN');
            const versionId = await createQuestVersion(setup, {
                slug: 'security-cooldown', repeatable: true, cooldownHours: 24
            });
            const boardId = await createScheduledBoard(setup, 'security-cooldown-board', versionId);
            await setup.query(`
                INSERT INTO quest_v2_assignments(
                    assignment_key,user_id,version_id,board_id,status,occurrence,
                    reward_policy_version,reward_points,completion_rule,
                    assignment_source,accepted_at,completed_at,resolved_at,due_at
                ) SELECT 'security-cooldown-prior',$1,$2,$3,'completed',1,1,0,
                         version.completion_rule,'board',NOW()-INTERVAL '1 hour',
                         NOW(),NOW(),NOW()+INTERVAL '1 day'
                  FROM quest_v2_versions version WHERE version.id=$2
            `, [userId, versionId, boardId]);
            await setup.query('COMMIT');
            return { versionId, boardId };
        } catch (error) {
            await setup.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            setup.release();
        }
    })();
    await assert.rejects(questService.offer(username, {
        versionId: cooldownVersion.versionId, boardId: cooldownVersion.boardId
    }, { requestId: 'migration-cooldown-offer' }),
    (error) => error.code === 'QUEST_ALREADY_ACTIVE_OR_COOLDOWN');

    const claimSetup = await pool.connect();
    let claimVersion;
    let claimBoard;
    try {
        await claimSetup.query('BEGIN');
        claimVersion = await createQuestVersion(claimSetup, { slug: 'security-concurrent-claim' });
        claimBoard = await createScheduledBoard(claimSetup, 'security-concurrent-claim-board', claimVersion);
        await claimSetup.query('COMMIT');
    } catch (error) {
        await claimSetup.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        claimSetup.release();
    }
    const claimService = new QuestV2Service({ pool: questConcurrencyPool, BalanceLogger });
    const claims = await Promise.allSettled([
        questService.offer(username, { versionId: claimVersion, boardId: claimBoard },
            { requestId: 'migration-claim-a' }),
        claimService.offer(username, { versionId: claimVersion, boardId: claimBoard },
            { requestId: 'migration-claim-b' })
    ]);
    assert.equal(claims.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(claims.filter((item) => item.status === 'rejected'
        && item.reason.code === 'QUEST_ALREADY_ACTIVE_OR_COOLDOWN').length, 1);
    assert.equal(Number((await pool.query(`
        SELECT COUNT(*) FROM quest_v2_assignments WHERE user_id=$1 AND version_id=$2
    `, [userId, claimVersion])).rows[0].count), 1);
}

async function verifyQuestEligibilityFactsP2(pool) {
    const username = 'quest-eligibility-p2-user';
    const insertedUser = await pool.query(`
        INSERT INTO users(username,password_hash,balance,authorized)
        VALUES($1,'not-a-real-hash',0,TRUE)
        RETURNING id
    `, [username]);
    const userId = Number(insertedUser.rows[0].id);
    await pool.query(`
        INSERT INTO creator_profiles(user_id,display_name,timezone)
        VALUES($1,'Quest Eligibility P2','America/Toronto')
    `, [userId]);
    await pool.query(`
        INSERT INTO relationship_profiles(user_id,level,total_xp)
        VALUES($1,3,0)
    `, [userId]);

    const achievementDefinition = await pool.query(`
        INSERT INTO streamer_achievement_definitions(
            slug,version,title_zh,title_en,description_zh,description_en,
            event_type,target,filters,hidden,collection_key,content_hash
        ) VALUES(
            'eligibility-first-signal',1,'资格信号','Eligibility Signal',
            '资格事实测试','Eligibility fact test','story.episode.completed',1,
            '{}'::JSONB,FALSE,'eligibility-signal-collection',$1
        ) RETURNING id
    `, [securityHash('eligibility-achievement')]);
    const achievementEvent = await pool.query(`
        INSERT INTO streamer_achievement_events(
            event_id,user_id,source_type,source_event_id,event_type,
            occurred_at,payload,semantic_hash
        ) VALUES($1,$2,'story','eligibility-achievement-source',
            'story.episode.completed',NOW(),'{}'::JSONB,$3)
        RETURNING id
    `, [randomUUID(), userId, securityHash('eligibility-achievement-event')]);
    await pool.query(`
        INSERT INTO streamer_achievement_unlocks(
            user_id,achievement_id,achievement_event_id
        ) VALUES($1,$2,$3)
    `, [userId, achievementDefinition.rows[0].id, achievementEvent.rows[0].id]);
    await pool.query(`
        INSERT INTO streamer_collection_holdings(
            user_id,item_key,source_type,source_id
        ) VALUES($1,'eligibility-starlight-compass','achievement',
            'eligibility-first-signal')
    `, [userId]);

    async function insertStoryProjection({ campaignSlug, flagKey, flagValue, status = 'active' }) {
        const campaign = await pool.query(`
            INSERT INTO story_campaigns(slug,title_zh,title_en)
            VALUES($1,$1,$1) RETURNING id
        `, [campaignSlug]);
        const version = await pool.query(`
            INSERT INTO story_content_versions(
                campaign_id,version,status,content_hash,content_snapshot,
                node_count,choice_count,published_at
            ) VALUES($1,1,'active',$2,'{}'::JSONB,1,0,NOW())
            RETURNING id
        `, [campaign.rows[0].id, securityHash(`eligibility-story:${campaignSlug}`)]);
        const run = await pool.query(`
            INSERT INTO story_runs(
                user_id,campaign_id,content_version_id,status,current_episode,
                current_node_id,revision,replay_mode,state_snapshot,completed_at
            ) VALUES($1,$2,$3,$4::VARCHAR(20),'episode-one','episode-one.start',
                0,FALSE,'{}'::JSONB,
                CASE WHEN $4::VARCHAR(20)='completed' THEN NOW() ELSE NULL END)
            RETURNING id
        `, [userId, campaign.rows[0].id, version.rows[0].id, status]);
        const eventId = randomUUID();
        await pool.query(`
            INSERT INTO story_events(
                event_id,run_id,command_id,semantic_hash,actor_type,
                actor_username,action,to_node_id,from_revision,to_revision,
                effects_digest,response_snapshot
            ) VALUES($1,$2,$3,$4,'creator',$5,'start','episode-one.start',
                0,0,'{}'::JSONB,'{}'::JSONB);
        `, [eventId, run.rows[0].id, `eligibility-story-${campaignSlug}`,
            securityHash(`eligibility-story-event:${campaignSlug}`), username]);
        await pool.query(`
            INSERT INTO story_flags(run_id,flag_key,flag_value,source_event_id)
            VALUES($1,$2,$3::JSONB,$4)
        `, [run.rows[0].id, flagKey, JSON.stringify(flagValue), eventId]);
        return Number(run.rows[0].id);
    }

    await insertStoryProjection({
        campaignSlug: 'eligibility-authoritative-one',
        flagKey: 'eligibility.station-restored',
        flagValue: true
    });
    await insertStoryProjection({
        campaignSlug: 'eligibility-abandoned',
        flagKey: 'eligibility.abandoned-only',
        flagValue: true,
        status: 'abandoned'
    });

    function serviceFor(rule) {
        return new QuestV2Service({
            pool,
            BalanceLogger,
            runtimeRepositoryFactory: (client) => {
                const repository = new (require('../repositories/quest-v2-runtime-repository')
                    .QuestV2RuntimeRepository)(client);
                return {
                    lockCreator: (...args) => repository.lockCreator(...args),
                    loadEligibilityFacts: (...args) => repository.loadEligibilityFacts(...args),
                    insertAssignmentEvent: async () => true,
                    insertAudit: async () => true
                };
            },
            catalogRepositoryFactory: () => ({
                loadOfferCandidate: async () => ({
                    id: 7001,
                    category: 'story',
                    lifecycle: 'active',
                    eligibility_rule: rule
                }),
                listBlockedCategories: async () => [],
                offerAssignment: async () => ({ id: 9001 })
            })
        });
    }

    const completeRule = {
        op: 'all',
        rules: [
            { op: 'relationship_level', minimum: 3 },
            { op: 'has_achievement', slug: 'eligibility-first-signal' },
            { op: 'story_flag', flag: 'eligibility.station-restored', value: true },
            { op: 'owns_collection_item', item: 'eligibility-starlight-compass' }
        ]
    };
    const allowed = await serviceFor(completeRule).offer(username, {
        versionId: 7001,
        boardId: 8001,
        // These fields are deliberately false: only repository facts count.
        achievements: [],
        storyFlags: { 'eligibility.station-restored': false },
        collectionItems: []
    }, { requestId: 'eligibility-p2-real-pg-allow' });
    assert.equal(allowed.status, 'offered');

    await assert.rejects(serviceFor({
        op: 'story_flag', flag: 'eligibility.abandoned-only', value: true
    }).offer(username, { versionId: 7001, boardId: 8001 }), (error) =>
        error?.code === 'QUEST_NOT_ELIGIBLE');

    await insertStoryProjection({
        campaignSlug: 'eligibility-conflict-two',
        flagKey: 'eligibility.station-restored',
        flagValue: false,
        status: 'completed'
    });
    await assert.rejects(serviceFor({
        op: 'story_flag', flag: 'eligibility.station-restored', value: true
    }).offer(username, { versionId: 7001, boardId: 8001 }),
    /conflicting authoritative values/);
}

async function verifyQuestLifecycleP1(pool) {
    const username = 'quest-security-user';
    const owner = 'migration-owner';
    const reviewer = 'migration-reviewer';
    await pool.query(`
        INSERT INTO users(username,password_hash,balance,authorized,is_admin)
        VALUES($1,'not-a-real-hash',100,TRUE,TRUE)
        ON CONFLICT(username) DO UPDATE SET authorized=TRUE,is_admin=TRUE,deactivated=FALSE
    `, [reviewer]);
    const userId = Number((await pool.query(
        'SELECT id FROM users WHERE username=$1', [username]
    )).rows[0].id);
    const service = new QuestV2Service({ pool, BalanceLogger, ownerUsername: owner });
    const concurrentService = new QuestV2Service({
        pool: questConcurrencyPool, BalanceLogger, ownerUsername: owner
    });

    const setup = await pool.connect();
    const catalog = {};
    try {
        await setup.query('BEGIN');
        const choiceRule = {
            op: 'event_count', event: 'story.choice.committed', target: 1, filters: {}
        };
        const episodeRule = {
            op: 'event_count', event: 'story.episode.completed', target: 1, filters: {}
        };
        catalog.automaticVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-automatic-dependent',
            verificationMode: 'automatic', reviewPolicy: 'none', rewardPoints: 41,
            completionRule: episodeRule,
            steps: [
                { key: 'trusted-first', evidenceKind: 'trusted_event', completionRule: choiceRule },
                { key: 'trusted-second', evidenceKind: 'trusted_event', dependsOnKeys: ['trusted-first'], completionRule: episodeRule }
            ]
        });
        catalog.automaticBoard = await createScheduledBoard(
            setup, 'p1-automatic-dependent-board', catalog.automaticVersion
        );
        catalog.manualVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-manual-dependent',
            verificationMode: 'manual', reviewPolicy: 'owner', rewardPoints: 52,
            completionRule: { op: 'evidence_approved' },
            steps: [
                { key: 'manual-first', evidenceKind: 'text', completionRule: { op: 'evidence_approved' } },
                { key: 'manual-second', evidenceKind: 'text', dependsOnKeys: ['manual-first'], completionRule: { op: 'evidence_approved' } }
            ]
        });
        catalog.manualBoard = await createScheduledBoard(
            setup, 'p1-manual-dependent-board', catalog.manualVersion
        );
        catalog.hybridVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-hybrid-dependent',
            verificationMode: 'hybrid', reviewPolicy: 'owner', rewardPoints: 63,
            completionRule: {
                op: 'all', rules: [episodeRule, { op: 'evidence_approved' }]
            },
            steps: [
                { key: 'hybrid-trusted', evidenceKind: 'trusted_event', completionRule: episodeRule },
                { key: 'hybrid-reviewed', evidenceKind: 'text', dependsOnKeys: ['hybrid-trusted'], completionRule: { op: 'evidence_approved' } }
            ]
        });
        catalog.hybridBoard = await createScheduledBoard(
            setup, 'p1-hybrid-dependent-board', catalog.hybridVersion
        );
        catalog.adminVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-admin-review-terminal',
            verificationMode: 'manual', reviewPolicy: 'admin', rewardPoints: 74,
            completionRule: { op: 'evidence_approved' },
            steps: [{ key: 'admin-proof', evidenceKind: 'text', completionRule: { op: 'evidence_approved' } }]
        });
        catalog.adminBoard = await createScheduledBoard(
            setup, 'p1-admin-review-terminal-board', catalog.adminVersion
        );
        catalog.concurrentReviewVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-concurrent-manual-review',
            verificationMode: 'manual', reviewPolicy: 'admin', rewardPoints: 79,
            completionRule: { op: 'evidence_approved' },
            steps: [{ key: 'review-proof', evidenceKind: 'text', completionRule: { op: 'evidence_approved' } }]
        });
        catalog.concurrentReviewBoard = await createScheduledBoard(
            setup, 'p1-concurrent-manual-review-board', catalog.concurrentReviewVersion
        );
        catalog.ownerlessAdminVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-ownerless-admin-review',
            verificationMode: 'manual', reviewPolicy: 'admin', rewardPoints: 0,
            completionRule: { op: 'evidence_approved' },
            steps: [{ key: 'ownerless-proof', evidenceKind: 'text', completionRule: { op: 'evidence_approved' } }]
        });
        catalog.ownerlessAdminBoard = await createScheduledBoard(
            setup, 'p1-ownerless-admin-review-board', catalog.ownerlessAdminVersion
        );
        catalog.expiryVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-expiry-repeatable',
            verificationMode: 'automatic', reviewPolicy: 'none', rewardPoints: 85,
            repeatable: true,
            completionRule: episodeRule,
            steps: [{ key: 'expiry-trusted', evidenceKind: 'trusted_event', completionRule: episodeRule }]
        });
        catalog.expiryBoard = await createScheduledBoard(
            setup, 'p1-expiry-repeatable-board', catalog.expiryVersion
        );
        catalog.postponeVersion = await createQuestWorkflowVersion(setup, {
            slug: 'p1-postpone-deadline',
            verificationMode: 'automatic', reviewPolicy: 'none', rewardPoints: 0,
            completionRule: episodeRule,
            steps: [{ key: 'postpone-trusted', evidenceKind: 'trusted_event', completionRule: episodeRule }]
        });
        catalog.postponeBoard = await createScheduledBoard(
            setup, 'p1-postpone-deadline-board', catalog.postponeVersion
        );
        await setup.query('COMMIT');
    } catch (error) {
        await setup.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        setup.release();
    }

    // Automatic dependencies unlock in the same transaction and settle only
    // after the final active trusted step completes.
    const automaticOffer = await service.offer(username, {
        versionId: catalog.automaticVersion, boardId: catalog.automaticBoard
    }, { requestId: 'p1-auto-offer' });
    await service.transition(username, {
        assignmentId: automaticOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'p1-auto-accept' });
    const automaticAcceptedAt = new Date((await pool.query(
        'SELECT accepted_at FROM quest_v2_assignments WHERE id=$1',
        [automaticOffer.assignmentId]
    )).rows[0].accepted_at).getTime();
    const firstAutomatic = await service.transaction((client) =>
        service.recordInternalTrustedEvent(client,
            internalStoryEvent(2101, username, automaticAcceptedAt + 1, 'story.choice.committed'),
            { requestId: 'p1-auto-first-event' }));
    assert.deepEqual(firstAutomatic.matches, []);
    const automaticMid = await pool.query(`
        SELECT assignment.status,
               array_agg(state.status ORDER BY step.ordinal) AS step_statuses,
               (SELECT COUNT(*) FROM quest_v2_assignment_events event
                WHERE event.assignment_id=assignment.id
                  AND event.event_type='quest.step.unlocked')::INTEGER AS unlock_events,
               (SELECT COUNT(*) FROM quest_v2_reward_settlements settlement
                WHERE settlement.assignment_id=assignment.id)::INTEGER AS settlements
        FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1 GROUP BY assignment.id
    `, [automaticOffer.assignmentId]);
    assert.deepEqual(automaticMid.rows[0], {
        status: 'active', step_statuses: ['completed', 'active'],
        unlock_events: 1, settlements: 0
    });
    const finalAutomatic = await service.transaction((client) =>
        service.recordInternalTrustedEvent(client,
            internalStoryEvent(2102, username, automaticAcceptedAt + 2),
            { requestId: 'p1-auto-final-event' }));
    assert.equal(finalAutomatic.matches.some((item) =>
        item.assignmentId === automaticOffer.assignmentId), true);

    // Manual dependency review cycles active -> under_review -> active, then
    // returned -> resubmitted -> completed without losing the first step.
    const manualOffer = await service.offer(username, {
        versionId: catalog.manualVersion, boardId: catalog.manualBoard
    }, { requestId: 'p1-manual-offer' });
    await service.transition(username, {
        assignmentId: manualOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'p1-manual-accept' });
    let manual = (await pool.query(`
        SELECT assignment.revision,step.id step_id FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1 AND step.step_key='manual-first'
    `, [manualOffer.assignmentId])).rows[0];
    await service.submitEvidence(username, {
        assignmentId: manualOffer.assignmentId, stepId: Number(manual.step_id),
        evidence: { text: 'First bounded manual proof.' }
    }, { requestId: 'p1-manual-evidence-first' });
    await service.transition(username, {
        assignmentId: manualOffer.assignmentId, expectedRevision: Number(manual.revision)
    }, 'submit', { requestId: 'p1-manual-submit-first' });
    let reviewed = await service.review(owner, {
        assignmentId: manualOffer.assignmentId, decision: 'approved', note: ''
    }, { requestId: 'p1-manual-review-first' });
    assert.equal(reviewed.status, 'active');
    assert.equal(reviewed.rewardEarned, 0);
    manual = (await pool.query(`
        SELECT assignment.revision,step.id step_id,state.status
        FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1 AND step.step_key='manual-second'
    `, [manualOffer.assignmentId])).rows[0];
    assert.equal(manual.status, 'active');
    await service.submitEvidence(username, {
        assignmentId: manualOffer.assignmentId, stepId: Number(manual.step_id),
        evidence: { text: 'Second proof needs one revision.' }
    }, { requestId: 'p1-manual-evidence-second-a' });
    await service.transition(username, {
        assignmentId: manualOffer.assignmentId, expectedRevision: Number(manual.revision)
    }, 'submit', { requestId: 'p1-manual-submit-second-a' });
    reviewed = await service.review(owner, {
        assignmentId: manualOffer.assignmentId, decision: 'returned',
        note: 'Please make the final detail explicit.'
    }, { requestId: 'p1-manual-return-second' });
    assert.equal(reviewed.status, 'returned');
    manual = (await pool.query(`
        SELECT assignment.revision,step.id step_id,state.status
        FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1 AND step.step_key='manual-second'
    `, [manualOffer.assignmentId])).rows[0];
    assert.equal(manual.status, 'returned');
    await service.submitEvidence(username, {
        assignmentId: manualOffer.assignmentId, stepId: Number(manual.step_id),
        evidence: { text: 'Second bounded proof with the requested detail.' }
    }, { requestId: 'p1-manual-evidence-second-b' });
    await service.transition(username, {
        assignmentId: manualOffer.assignmentId, expectedRevision: Number(manual.revision)
    }, 'submit', { requestId: 'p1-manual-submit-second-b' });
    reviewed = await service.review(owner, {
        assignmentId: manualOffer.assignmentId, decision: 'approved', note: ''
    }, { requestId: 'p1-manual-review-second' });
    assert.equal(reviewed.status, 'completed');
    assert.equal(reviewed.rewardEarned, 52);
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM quest_v2_reward_settlements
        WHERE assignment_id=$1`, [manualOffer.assignmentId])).rows[0].count), 1);

    // Hybrid completion combines a trusted prerequisite and reviewed evidence.
    const hybridOffer = await service.offer(username, {
        versionId: catalog.hybridVersion, boardId: catalog.hybridBoard
    }, { requestId: 'p1-hybrid-offer' });
    await service.transition(username, {
        assignmentId: hybridOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'p1-hybrid-accept' });
    const hybridAccepted = new Date((await pool.query(
        'SELECT accepted_at FROM quest_v2_assignments WHERE id=$1',
        [hybridOffer.assignmentId]
    )).rows[0].accepted_at).getTime();
    await service.transaction((client) => service.recordInternalTrustedEvent(client,
        internalStoryEvent(2201, username, hybridAccepted + 1),
        { requestId: 'p1-hybrid-trusted' }));
    let hybrid = (await pool.query(`
        SELECT assignment.revision,step.id step_id,state.status
        FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1 AND step.step_key='hybrid-reviewed'
    `, [hybridOffer.assignmentId])).rows[0];
    assert.equal(hybrid.status, 'active');
    await service.submitEvidence(username, {
        assignmentId: hybridOffer.assignmentId, stepId: Number(hybrid.step_id),
        evidence: { text: 'Hybrid reviewed proof.' }
    }, { requestId: 'p1-hybrid-evidence' });
    await service.transition(username, {
        assignmentId: hybridOffer.assignmentId, expectedRevision: Number(hybrid.revision)
    }, 'submit', { requestId: 'p1-hybrid-submit' });
    reviewed = await service.review(owner, {
        assignmentId: hybridOffer.assignmentId, decision: 'approved', note: ''
    }, { requestId: 'p1-hybrid-review' });
    assert.equal(reviewed.status, 'completed');
    assert.equal(reviewed.rewardEarned, 63);

    // review_policy=admin excludes the configured owner. An independent active
    // administrator may issue an honest terminal rejection and no settlement.
    const adminOffer = await service.offer(username, {
        versionId: catalog.adminVersion, boardId: catalog.adminBoard
    }, { requestId: 'p1-admin-offer' });
    await service.transition(username, {
        assignmentId: adminOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'p1-admin-accept' });
    const adminStep = (await pool.query(`
        SELECT assignment.revision,step.id step_id
        FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1
    `, [adminOffer.assignmentId])).rows[0];
    await service.submitEvidence(username, {
        assignmentId: adminOffer.assignmentId, stepId: Number(adminStep.step_id),
        evidence: { text: 'Admin policy proof.' }
    }, { requestId: 'p1-admin-evidence' });
    await service.transition(username, {
        assignmentId: adminOffer.assignmentId, expectedRevision: Number(adminStep.revision)
    }, 'submit', { requestId: 'p1-admin-submit' });
    await assert.rejects(service.review(owner, {
        assignmentId: adminOffer.assignmentId, decision: 'approved', note: ''
    }, { requestId: 'p1-admin-owner-forbidden' }),
    (error) => error.code === 'QUEST_REVIEW_FORBIDDEN' && error.status === 403);
    reviewed = await service.review(reviewer, {
        assignmentId: adminOffer.assignmentId, decision: 'rejected',
        note: 'Independent review could not verify this evidence.'
    }, { requestId: 'p1-admin-independent-reject' });
    assert.equal(reviewed.status, 'rejected');
    const rejected = (await pool.query(`
        SELECT status,rejected_at IS NOT NULL rejected,resolved_at IS NOT NULL resolved,
               (SELECT COUNT(*) FROM quest_v2_reward_settlements WHERE assignment_id=$1)::INTEGER settlements
        FROM quest_v2_assignments WHERE id=$1
    `, [adminOffer.assignmentId])).rows[0];
    assert.deepEqual(rejected, {
        status: 'rejected', rejected: true, resolved: true, settlements: 0
    });

    // Independent reviewers racing the same submitted evidence serialize on
    // the assignment row. Exactly one approval, settlement, ledger entry, and
    // terminal event survives.
    const concurrentReviewOffer = await service.offer(username, {
        versionId: catalog.concurrentReviewVersion,
        boardId: catalog.concurrentReviewBoard
    }, { requestId: 'p1-concurrent-review-offer' });
    await service.transition(username, {
        assignmentId: concurrentReviewOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'p1-concurrent-review-accept' });
    const concurrentReviewStep = (await pool.query(`
        SELECT assignment.revision,step.id step_id
        FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1
    `, [concurrentReviewOffer.assignmentId])).rows[0];
    await service.submitEvidence(username, {
        assignmentId: concurrentReviewOffer.assignmentId,
        stepId: Number(concurrentReviewStep.step_id),
        evidence: { text: 'One proof, one concurrent decision.' }
    }, { requestId: 'p1-concurrent-review-evidence' });
    await service.transition(username, {
        assignmentId: concurrentReviewOffer.assignmentId,
        expectedRevision: Number(concurrentReviewStep.revision)
    }, 'submit', { requestId: 'p1-concurrent-review-submit' });
    const reviewRace = await Promise.allSettled([
        service.review(reviewer, {
            assignmentId: concurrentReviewOffer.assignmentId,
            decision: 'approved', note: ''
        }, { requestId: 'p1-concurrent-review-a' }),
        concurrentService.review(reviewer, {
            assignmentId: concurrentReviewOffer.assignmentId,
            decision: 'approved', note: ''
        }, { requestId: 'p1-concurrent-review-b' })
    ]);
    assert.equal(reviewRace.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(reviewRace.filter((item) => item.status === 'rejected'
        && item.reason.code === 'QUEST_NOT_REVIEWABLE').length, 1);
    const reviewRaceState = (await pool.query(`
        SELECT assignment.status,
          (SELECT COUNT(*) FROM quest_v2_reward_settlements settlement
           WHERE settlement.assignment_id=assignment.id)::INTEGER settlements,
          (SELECT COUNT(*) FROM balance_logs ledger
           WHERE ledger.username=$2 AND ledger.operation_type='quest_auto_reward'
             AND ledger.game_data->>'assignmentId'=assignment.id::TEXT)::INTEGER ledger_entries,
          (SELECT COUNT(*) FROM quest_v2_assignment_events event
           WHERE event.assignment_id=assignment.id
             AND event.event_type='quest.review.approved')::INTEGER terminal_events
        FROM quest_v2_assignments assignment WHERE assignment.id=$1
    `, [concurrentReviewOffer.assignmentId, username])).rows[0];
    assert.deepEqual(reviewRaceState, {
        status: 'completed', settlements: 1, ledger_entries: 1, terminal_events: 1
    });

    // Quest can be enabled without Live or a configured owner. Admin-policy
    // evidence remains reviewable by an authoritative administrator, while
    // owner-policy quests continue to fail closed in that deployment shape.
    const ownerlessService = new QuestV2Service({
        pool, BalanceLogger, ownerUsername: null
    });
    const ownerlessOffer = await ownerlessService.offer(username, {
        versionId: catalog.ownerlessAdminVersion,
        boardId: catalog.ownerlessAdminBoard
    }, { requestId: 'p1-ownerless-admin-offer' });
    await ownerlessService.transition(username, {
        assignmentId: ownerlessOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'p1-ownerless-admin-accept' });
    const ownerlessStep = (await pool.query(`
        SELECT assignment.revision,step.id step_id
        FROM quest_v2_assignments assignment
        JOIN quest_v2_assignment_steps state ON state.assignment_id=assignment.id
        JOIN quest_v2_step_definitions step ON step.id=state.step_definition_id
        WHERE assignment.id=$1
    `, [ownerlessOffer.assignmentId])).rows[0];
    await ownerlessService.submitEvidence(username, {
        assignmentId: ownerlessOffer.assignmentId,
        stepId: Number(ownerlessStep.step_id),
        evidence: { text: 'Ownerless admin policy remains operable.' }
    }, { requestId: 'p1-ownerless-admin-evidence' });
    await ownerlessService.transition(username, {
        assignmentId: ownerlessOffer.assignmentId,
        expectedRevision: Number(ownerlessStep.revision)
    }, 'submit', { requestId: 'p1-ownerless-admin-submit' });
    const ownerlessReviewed = await ownerlessService.review(reviewer, {
        assignmentId: ownerlessOffer.assignmentId,
        decision: 'approved', note: ''
    }, { requestId: 'p1-ownerless-admin-approve' });
    assert.equal(ownerlessReviewed.status, 'completed');
    assert.equal(ownerlessReviewed.rewardEarned, 0);

    // Postponement extends the actual deadline and the immutable command/event
    // records the cumulative cap rather than writing a decorative timestamp.
    const postponeOffer = await service.offer(username, {
        versionId: catalog.postponeVersion, boardId: catalog.postponeBoard
    }, { requestId: 'p1-postpone-offer' });
    const beforePostpone = (await pool.query(`SELECT revision,due_at FROM quest_v2_assignments
        WHERE id=$1`, [postponeOffer.assignmentId])).rows[0];
    const postponed = await service.postpone(username, {
        assignmentId: postponeOffer.assignmentId,
        expectedRevision: Number(beforePostpone.revision), hours: 24
    }, { requestId: 'p1-postpone-command' });
    assert.equal(new Date(postponed.dueAt).getTime()
        - new Date(beforePostpone.due_at).getTime(), 24 * 60 * 60 * 1000);
    assert.equal(postponed.postponedHours, 24);
    await assert.rejects(service.postpone(username, {
        assignmentId: postponeOffer.assignmentId,
        expectedRevision: postponed.revision, hours: 168
    }, { requestId: 'p1-postpone-over-cap' }),
    (error) => error.code === 'POSTPONE_UNAVAILABLE');
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM quest_v2_assignment_events
        WHERE assignment_id=$1 AND event_type='quest.assignment.postponed'`,
    [postponeOffer.assignmentId])).rows[0].count), 1);

    // Two workers race the same overdue assignment. SKIP LOCKED plus CAS gives
    // one expiry event/audit, no reward, and repeatable recurrence unblocks.
    const expiryOffer = await service.offer(username, {
        versionId: catalog.expiryVersion, boardId: catalog.expiryBoard
    }, { requestId: 'p1-expiry-offer' });
    await service.transition(username, {
        assignmentId: expiryOffer.assignmentId, expectedRevision: 0
    }, 'accept', { requestId: 'p1-expiry-accept' });
    await pool.query(`UPDATE quest_v2_assignments
        SET offered_at=NOW()-INTERVAL '2 days',accepted_at=NOW()-INTERVAL '2 days',
            due_at=NOW()-INTERVAL '1 day'
        WHERE id=$1`, [expiryOffer.assignmentId]);
    const expiryRuns = await Promise.all([
        service.expireDueAssignments({ limit: 100 }),
        concurrentService.expireDueAssignments({ limit: 100 })
    ]);
    assert.equal(expiryRuns.reduce((sum, item) => sum + item.processed, 0), 1);
    const expired = (await pool.query(`
        SELECT status,expired_at IS NOT NULL expired,resolved_at IS NOT NULL resolved,
          (SELECT COUNT(*) FROM quest_v2_assignment_events event
           WHERE event.assignment_id=$1 AND event.event_type='quest.assignment.expired')::INTEGER events,
          (SELECT COUNT(*) FROM quest_v2_audit_log audit
           WHERE audit.assignment_id=$1 AND audit.action='quest.assignment.expired')::INTEGER audits,
          (SELECT COUNT(*) FROM quest_v2_reward_settlements settlement
           WHERE settlement.assignment_id=$1)::INTEGER settlements
        FROM quest_v2_assignments WHERE id=$1
    `, [expiryOffer.assignmentId])).rows[0];
    assert.deepEqual(expired, {
        status: 'expired', expired: true, resolved: true,
        events: 1, audits: 1, settlements: 0
    });
    assert.equal((await service.expireDueAssignments({ limit: 100 })).processed, 0);
    const replacement = await service.offer(username, {
        versionId: catalog.expiryVersion, boardId: catalog.expiryBoard
    }, { requestId: 'p1-expiry-replacement-offer' });
    assert.ok(replacement.assignmentId > expiryOffer.assignmentId);

    // Service and the database publish trigger both reject dangling/cyclic DAGs.
    for (const [slug, dependencies] of [
        ['p1-publish-missing', [['first', []], ['second', ['missing']]]],
        ['p1-publish-cycle', [['first', ['second']], ['second', ['first']]]]
    ]) {
        const definition = await pool.query(`INSERT INTO quest_v2_definitions(slug,source,created_by)
            VALUES($1,'owner_studio',$2) RETURNING id`, [slug, owner]);
        const draft = await pool.query(`INSERT INTO quest_v2_versions(
            definition_id,version,lifecycle,category,tags,difficulty,estimated_minutes,
            safety_class,title_zh,title_en,description_zh,description_en,hint_zh,hint_en,
            completion_zh,completion_en,verification_mode,consent_category,
            eligibility_rule,completion_rule,reward_points,review_policy,content_hash
        ) VALUES($1,1,'draft','story',ARRAY['p1-security'],'guided',5,'standard',
            $2,$2,$2,$2,$2,$2,$2,$2,'manual','story',
            '{"op":"relationship_level","minimum":1}'::JSONB,
            '{"op":"evidence_approved"}'::JSONB,0,'owner',$3) RETURNING id`,
        [definition.rows[0].id, slug, securityHash(`p1-invalid:${slug}`)]);
        for (let index = 0; index < dependencies.length; index += 1) {
            await pool.query(`INSERT INTO quest_v2_step_definitions(
                version_id,step_key,ordinal,title_zh,title_en,instructions_zh,instructions_en,
                evidence_kind,depends_on_keys,completion_rule)
                VALUES($1,$2,$3,$2,$2,$2,$2,'text',$4,
                    '{"op":"evidence_approved"}'::JSONB)`,
            [draft.rows[0].id, dependencies[index][0], index + 1, dependencies[index][1]]);
        }
        await assert.rejects(service.publish(owner, {
            versionId: Number(draft.rows[0].id)
        }, { requestId: `p1-invalid-publish-${slug}` }),
        (error) => error.code === 'QUEST_STEP_DEPENDENCY_INVALID');
        await assert.rejects(pool.query(`UPDATE quest_v2_versions SET lifecycle='active',published_at=NOW()
            WHERE id=$1`, [draft.rows[0].id]), /quest step dependency/);
    }

    const sensitiveDefinition = await pool.query(`
        INSERT INTO quest_v2_definitions(slug,source,created_by)
        VALUES('p1-publish-sensitive-owner','owner_studio',$1) RETURNING id
    `, [owner]);
    const sensitiveDraft = await pool.query(`
        INSERT INTO quest_v2_versions(
            definition_id,version,lifecycle,category,tags,difficulty,
            estimated_minutes,safety_class,title_zh,title_en,
            description_zh,description_en,hint_zh,hint_en,
            completion_zh,completion_en,verification_mode,consent_category,
            eligibility_rule,completion_rule,reward_points,review_policy,content_hash
        ) VALUES($1,1,'draft','story',ARRAY['p1-security'],'guided',5,'sensitive',
            '敏感审核','Sensitive review','敏感审核','Sensitive review',
            '敏感审核','Sensitive review','敏感审核','Sensitive review',
            'manual','story','{"op":"relationship_level","minimum":1}'::JSONB,
            '{"op":"evidence_approved"}'::JSONB,0,'owner',$2) RETURNING id
    `, [sensitiveDefinition.rows[0].id, securityHash('p1-sensitive-owner')]);
    await pool.query(`
        INSERT INTO quest_v2_step_definitions(
            version_id,step_key,ordinal,title_zh,title_en,instructions_zh,
            instructions_en,evidence_kind,completion_rule
        ) VALUES($1,'proof',1,'证据','Proof','证据','Proof','text',
            '{"op":"evidence_approved"}'::JSONB)
    `, [sensitiveDraft.rows[0].id]);
    await assert.rejects(service.publish(owner, {
        versionId: Number(sensitiveDraft.rows[0].id)
    }, { requestId: 'p1-sensitive-owner-service-publish' }),
    (error) => error.code === 'QUEST_STEP_DEPENDENCY_INVALID');
    await assert.rejects(pool.query(`
        UPDATE quest_v2_versions SET lifecycle='active',published_at=NOW() WHERE id=$1
    `, [sensitiveDraft.rows[0].id]),
    /sensitive evidence quests require independent admin review/);

    // Restart is idempotent. The rolling horizon has one current and twelve
    // future local weeks, with stable keys and creator-timezone boundaries.
    await pool.query(`
        INSERT INTO users(username,password_hash,balance,authorized)
        VALUES('p1-toronto-creator','not-a-real-hash',0,TRUE)
        ON CONFLICT(username) DO NOTHING;
        INSERT INTO creator_profiles(user_id,display_name,timezone)
        SELECT id,'P1 Toronto Creator','America/Toronto'
        FROM users WHERE username='p1-toronto-creator'
        ON CONFLICT(user_id) DO UPDATE SET timezone=EXCLUDED.timezone;
        INSERT INTO relationship_profiles(user_id)
        SELECT id FROM users WHERE username='p1-toronto-creator'
        ON CONFLICT(user_id) DO NOTHING
    `);
    const materializationRace = await Promise.all([
        service.materializeWeeklyBoards({ horizonWeeks: 12 }),
        concurrentService.materializeWeeklyBoards({ horizonWeeks: 12 })
    ]);
    const firstMaterialization = materializationRace[0];
    const stableBefore = (await pool.query(`SELECT schedule_key FROM quest_v2_schedules
        WHERE rotation_week_start IS NOT NULL ORDER BY timezone,rotation_week_start`)).rows;
    const duplicateWeeks = await pool.query(`
        SELECT timezone,rotation_week_start
        FROM quest_v2_schedules WHERE rotation_week_start IS NOT NULL
        GROUP BY timezone,rotation_week_start HAVING COUNT(*) > 1
    `);
    assert.equal(duplicateWeeks.rowCount, 0);
    assert.ok(materializationRace.every((result) => result.current >= 2));
    await service.initialize();
    const stableAfter = (await pool.query(`SELECT schedule_key FROM quest_v2_schedules
        WHERE rotation_week_start IS NOT NULL ORDER BY timezone,rotation_week_start`)).rows;
    assert.deepEqual(stableAfter, stableBefore);
    assert.ok(firstMaterialization.current >= 2);
    const futureAsOf = new Date(Date.now() + 12 * 7 * 86400000).toISOString();
    await service.materializeWeeklyBoards({
        horizonWeeks: 12,
        timezones: ['America/Toronto'],
        asOf: futureAsOf
    });
    const rolling = (await pool.query(`
        SELECT COUNT(*) FILTER(WHERE lifecycle='active' AND starts_at<=$2 AND ends_at>$2)::INTEGER current,
               COUNT(*) FILTER(WHERE lifecycle='scheduled' AND starts_at>$2)::INTEGER future,
               COUNT(DISTINCT rotation_week_start)::INTEGER distinct_weeks,
               COUNT(*)::INTEGER rows,
               BOOL_AND(EXTRACT(ISODOW FROM starts_at AT TIME ZONE timezone)=1
                    AND (starts_at AT TIME ZONE timezone)::TIME=TIME '00:00:00'
                    AND (ends_at AT TIME ZONE timezone)::TIME=TIME '00:00:00') boundaries
        FROM quest_v2_schedules
        WHERE timezone=$1 AND rotation_week_start IS NOT NULL AND ends_at>$2
    `, ['America/Toronto', futureAsOf])).rows[0];
    assert.deepEqual(rolling, {
        current: 1, future: 12, distinct_weeks: 13, rows: 13, boundaries: true
    });
}

async function verifyQuestLifecycleSchema(pool, label) {
    const state = await pool.query(`
        SELECT
          EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='quest_v2_assignments'
              AND column_name='postponed_hours') postponed_hours,
          EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='quest_v2_assignments'
              AND column_name='rejected_at') rejected_at,
          EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='quest_v2_schedules'
              AND column_name='rotation_week_start') rotation_week_start,
          to_regclass('public.uq_quest_v2_schedule_timezone_week') IS NOT NULL schedule_identity,
          EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_quest_v2_validate_publish_graph'
            AND NOT tgisinternal) publish_guard,
          to_regprocedure(
            'quest_v2_assert_publish_graph(bigint,text,text,text)'
          ) IS NOT NULL published_catalog_validator
    `);
    assert.equal(Object.values(state.rows[0]).every(Boolean), true,
        `${label} Quest lifecycle schema is incomplete`);
    await pool.query(`
        SELECT quest_v2_assert_publish_graph(
            version.id,
            version.verification_mode::TEXT,
            version.review_policy::TEXT,
            version.safety_class::TEXT
        )
        FROM quest_v2_versions version
        JOIN quest_v2_definitions definition ON definition.id=version.definition_id
        WHERE version.lifecycle IN ('scheduled','active')
          AND definition.source <> 'legacy_import'
        ORDER BY version.id
    `);
}

async function verifyQuestLifecycleMigrationRejectsPublishedInvalid(pool, label) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const definition = await client.query(`
            INSERT INTO quest_v2_definitions(slug,source,created_by)
            VALUES($1,'owner_studio','migration-owner') RETURNING id
        `, [`invalid-existing-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`]);
        await client.query(`
            INSERT INTO quest_v2_versions(
                definition_id,version,lifecycle,category,tags,difficulty,
                estimated_minutes,safety_class,title_zh,title_en,
                description_zh,description_en,hint_zh,hint_en,
                completion_zh,completion_en,verification_mode,consent_category,
                eligibility_rule,completion_rule,reward_points,review_policy,
                published_at,content_hash
            ) VALUES($1,1,'active','story',ARRAY['migration-invalid'],'guided',5,
                'standard','无效旧发布','Invalid old publication','无效','Invalid',
                '无效','Invalid','无效','Invalid','manual','story',
                '{"op":"relationship_level","minimum":1}'::JSONB,
                '{"op":"evidence_approved"}'::JSONB,0,'owner',NOW(),$2)
        `, [definition.rows[0].id, securityHash(`invalid-existing:${label}`)]);
        const migrationSql = fs.readFileSync(path.join(
            __dirname, '..', 'migrations', 'add_streamer_security_quest_lifecycle.sql'
        ), 'utf8');
        await assert.rejects(
            client.query(migrationTransactionBody(migrationSql)),
            /published quest requires at least one required step/
        );
    } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
    }
}

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
            to_regclass('public.quest_v2_chain_completions') IS NOT NULL AS quest_chain_producers_upgraded,
            to_regclass('public.quest_v2_appeals') IS NOT NULL AS quest_appeals_upgraded,
            to_regclass('public.story_runs') IS NOT NULL AS story_world_upgraded,
            to_regclass('public.live_interaction_events') IS NOT NULL AS live_platform_upgraded,
            to_regclass('public.streamer_game_runs') IS NOT NULL AS streamer_games_upgraded,
            to_regclass('public.reward_orders') IS NOT NULL AS reward_catalog_upgraded,
            to_regclass('public.reward_grant_intents') IS NOT NULL AS reward_intents_upgraded,
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
               to_regclass('public.quest_v2_chain_completions') IS NOT NULL AS quest_v2_chain_completions,
               to_regclass('public.quest_v2_appeals') IS NOT NULL AS quest_v2_appeals,
               to_regclass('public.story_runs') IS NOT NULL AS story_runs,
               to_regclass('public.live_interaction_events') IS NOT NULL AS live_interaction_events,
               to_regclass('public.streamer_game_runs') IS NOT NULL AS streamer_game_runs,
               to_regclass('public.reward_orders') IS NOT NULL AS reward_orders,
               to_regclass('public.reward_grant_intents') IS NOT NULL AS reward_grant_intents,
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

    // Execute the real extended-query protocol against PostgreSQL. A mock or
    // migration-only check cannot catch ambiguous parameter inference between
    // the VARCHAR status assignment and its completed-at predicate.
    const streamerGames = new StreamerGameRepository({ pool: testPool });
    assert.equal(await streamerGames.updateRun(testPool, {
        id: randomUUID(),
        revision: 0,
        configVersion: 'signal-v2',
        contentHash: '0'.repeat(64),
        contentSnapshot: {},
        creatorUsername: 'migration-test-user',
        ownerUsername: null
    }, { status: 'active', score: 0 }), null);

    await verifyQuestAndInvitationSecurity(testPool, databaseNames[0]);
    await verifyQuestLifecycleP1(testPool);
    await verifyQuestEligibilityFactsP2(testPool);

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
    await verifyQuestLifecycleSchema(legacyPool, 'Baseline legacy');
    await verifyQuestLifecycleMigrationRejectsPublishedInvalid(
        legacyPool, 'Baseline legacy'
    );
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
    await verifyQuestLifecycleSchema(earlyLegacyPool, 'Early legacy');
    console.log('Fresh and two legacy database migration tests passed');
}

async function cleanup() {
    await Promise.all([
        testPool?.end().catch(() => {}),
        legacyPool?.end().catch(() => {}),
        earlyLegacyPool?.end().catch(() => {}),
        questConcurrencyPool?.end().catch(() => {})
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
