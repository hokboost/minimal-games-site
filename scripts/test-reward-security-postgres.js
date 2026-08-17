'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BalanceLogger = require('../balance-logger');
const giftConfig = require('../gift-codes.json');
const { applyTrackedMigration } = require('../lib/database-migrations');
const { AchievementService } = require('../services/achievement-service');
const { CreatorProfileService } = require('../services/creator-profile-service');
const { QuestV2Service } = require('../services/quest-v2-service');
const { RewardCatalogService } = require('../services/reward-catalog-service');
const { RewardGrantDispatcher } = require('../services/reward-grant-dispatcher');
const {
    RewardGrantIntentError,
    RewardGrantIntentWriter
} = require('../services/reward-grant-intent-writer');
const { CreatorRepository } = require('../repositories/creator-repository');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const {
    RewardGrantIntentRepository
} = require('../repositories/reward-grant-intent-repository');
const { DisposableDatabase } = require('../tests/helpers/integration-environment');

if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
    throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to run the disposable reward security test');
}

const FIXED_NOW = new Date('2026-08-17T12:00:00.000Z');
const uuid = () => crypto.randomUUID();

async function transaction(pool, work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const value = await work(client);
        await client.query('COMMIT');
        return value;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function createProfile(pool, username) {
    await pool.query(`INSERT INTO creator_profiles(
        user_id,display_name,timezone,live_interaction_opt_in
    ) SELECT id,$2,'UTC',TRUE FROM users WHERE username=$1`,
    [username, `Security ${username}`]);
}

async function accountId(pool, username) {
    const row = (await pool.query('SELECT id FROM users WHERE username=$1', [username])).rows[0];
    assert.ok(row, `missing account ${username}`);
    return Number(row.id);
}

async function enqueue(pool, writer, value) {
    return transaction(pool, client => writer.enqueue(client, value));
}

async function count(pool, relation, predicate = 'TRUE', values = []) {
    if (!/^[a-z_][a-z0-9_]*$/.test(relation)) throw new Error('unsafe test relation');
    return Number((await pool.query(`SELECT COUNT(*) AS count FROM ${relation} WHERE ${predicate}`,
        values)).rows[0].count);
}

async function assertGenericNotFound(operation) {
    await assert.rejects(operation, error => error?.status === 404
        && error?.code === 'REWARD_ITEM_NOT_FOUND'
        && error?.message === 'Reward item not found');
}

async function verifyHistoricalUpgrade(database) {
    await database.create();
    await transaction(database.pool, async client => {
        await client.query('DROP TABLE reward_grant_intent_events, reward_grant_intents CASCADE');
        await client.query('DROP FUNCTION protect_reward_grant_intent_event()');
        await client.query('DROP FUNCTION protect_reward_grant_intent()');
        await client.query(`DELETE FROM minimal_games_schema_migrations
            WHERE filename='add_streamer_reward_security_outbox.sql'`);
    });
    const absent = await database.pool.query(
        "SELECT to_regclass('public.reward_grant_intents') AS relation"
    );
    assert.equal(absent.rows[0].relation, null);

    const client = await database.pool.connect();
    try {
        await applyTrackedMigration(client, 'add_streamer_reward_security_outbox.sql', () => {});
    } finally {
        client.release();
    }
    const upgraded = await database.pool.query(`SELECT
        to_regclass('public.reward_grant_intents') AS intents,
        to_regclass('public.reward_grant_intent_events') AS events`);
    assert.equal(upgraded.rows[0].intents, 'reward_grant_intents');
    assert.equal(upgraded.rows[0].events, 'reward_grant_intent_events');
    const ledger = await database.pool.query(`SELECT status FROM minimal_games_schema_migrations
        WHERE filename='add_streamer_reward_security_outbox.sql'`);
    assert.equal(ledger.rows[0]?.status, 'applied');
}

async function verifyVisibilityAndQuietInbox(database) {
    const owner = await database.createUser({ username: 'reward_owner', isAdmin: true });
    const creator = await database.createUser({ username: 'reward_creator' });
    const raceCreator = await database.createUser({ username: 'reward_unlock_race' });
    await createProfile(database.pool, creator.username);
    const creatorId = await accountId(database.pool, creator.username);
    await database.pool.query(`INSERT INTO creator_quiet_hours(
        user_id,weekday,start_minute,end_minute,enabled
    ) VALUES($1,1,0,1439,TRUE)`, [creatorId]);

    const repository = new RewardCatalogRepository({ pool: database.pool });
    const realtime = [];
    const quietService = new RewardCatalogService({
        repository,
        BalanceLogger,
        giftConfig,
        ownerUsername: owner.username,
        clock: () => FIXED_NOW,
        publishRewardNotification: value => realtime.push(value)
    });
    await quietService.initialize();
    const achievementService = new AchievementService({ pool: database.pool, clock: () => FIXED_NOW });
    await achievementService.initialize();

    const rows = (await database.pool.query(`SELECT version.id,item.slug
        FROM reward_catalog_versions version
        JOIN reward_catalog_items item ON item.id=version.item_id`)).rows;
    const ids = new Map(rows.map(row => [row.slug, Number(row.id)]));
    const before = await quietService.catalog(creator.username);
    assert.equal(before.items.some(item => item.slug === 'paper-star-frame'), false);
    assert.equal(before.items.some(item => item.slug === 'owner-milestone-fanlight'), false);

    await assertGenericNotFound(quietService.itemDetail(creator.username,
        ids.get('paper-star-frame')));
    await assertGenericNotFound(quietService.itemDetail(creator.username,
        ids.get('owner-milestone-fanlight')));
    await assertGenericNotFound(quietService.wishlist(creator.username, {
        commandId: uuid(), catalogVersionId: ids.get('paper-star-frame'),
        targetQuantity: 1, priority: 1
    }));
    await assertGenericNotFound(quietService.createOrder(creator.username, {
        commandId: uuid(), catalogVersionId: ids.get('paper-star-frame'), quantity: 1
    }));
    await assertGenericNotFound(quietService.ownerGrant(owner.username, {
        commandId: uuid(), creatorUsername: creator.username,
        catalogVersionId: ids.get('story-lantern-grant'),
        templateKey: 'story-route-milestone'
    }));

    const outsideSeason = new RewardCatalogService({
        repository,
        BalanceLogger,
        giftConfig,
        clock: () => new Date('2028-08-17T12:00:00.000Z')
    });
    await assertGenericNotFound(outsideSeason.itemDetail(creator.username,
        ids.get('memory-book-cover')));
    await database.pool.query(`UPDATE reward_catalog_versions SET lifecycle='retired',retired_at=NOW()
        WHERE id=$1`, [ids.get('dream-compass-key')]);
    await assertGenericNotFound(quietService.itemDetail(creator.username,
        ids.get('dream-compass-key')));

    const runId = uuid();
    const event = {
        sourceType: 'streamer_game',
        sourceEventId: `achievement-game-run:${runId}`,
        eventType: 'game.run.completed',
        occurredAt: FIXED_NOW.toISOString(),
        payload: {
            runId,
            gameId: 'constellation-repair',
            challengeId: 'repair-security-line',
            difficulty: 'standard',
            mode: 'solo',
            score: 900,
            authoritativeScore: true,
            resumed: false
        }
    };
    await transaction(database.pool, client => achievementService.recordTrustedEvent(
        client, creator.username, event, { requestId: 'reward-visibility-achievement' }
    ));
    const replay = await transaction(database.pool, client => achievementService.recordTrustedEvent(
        client, creator.username, event, { requestId: 'reward-visibility-achievement-replay' }
    ));
    assert.equal(replay.replayed, true);
    const unlocked = await quietService.itemDetail(creator.username, ids.get('paper-star-frame'));
    assert.equal(unlocked.item.slug, 'paper-star-frame');

    const raceClient = await database.pool.connect();
    let raceOrder;
    try {
        await raceClient.query('BEGIN');
        const raceRunId = uuid();
        await achievementService.recordTrustedEvent(raceClient, raceCreator.username, {
            ...event,
            sourceEventId: `achievement-game-run:${raceRunId}`,
            payload: { ...event.payload, runId: raceRunId }
        }, { requestId: 'reward-unlock-redemption-race' });
        raceOrder = quietService.createOrder(raceCreator.username, {
            commandId: uuid(), catalogVersionId: ids.get('paper-star-frame'), quantity: 1
        }, { requestId: 'reward-unlock-redemption-race-order' });
        await new Promise(resolve => setImmediate(resolve));
        await raceClient.query('COMMIT');
    } catch (error) {
        await raceClient.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        raceClient.release();
    }
    const raced = await raceOrder;
    assert.equal(raced.order.slug, 'paper-star-frame',
        'redemption serialized behind the immutable unlock instead of observing a partial state');

    const quietGrant = await quietService.ownerGrant(owner.username, {
        commandId: uuid(), creatorUsername: creator.username,
        catalogVersionId: ids.get('owner-milestone-fanlight'),
        templateKey: 'quest-chain-celebration'
    });
    assert.equal(quietGrant.order.notificationPolicy, 'quiet_suppressed');
    assert.equal(realtime.length, 0);

    await database.pool.query('DELETE FROM creator_quiet_hours WHERE user_id=$1', [creatorId]);
    await database.pool.query(`INSERT INTO creator_interaction_windows(
        user_id,weekday,start_minute,end_minute,interaction_mode,enabled
    ) VALUES($1,1,60,120,'live',TRUE)`, [creatorId]);
    const outsidePreferredGrant = await quietService.ownerGrant(owner.username, {
        commandId: uuid(), creatorUsername: creator.username,
        catalogVersionId: ids.get('owner-heartfelt-grant'),
        templateKey: 'story-route-milestone'
    });
    assert.equal(outsidePreferredGrant.order.notificationPolicy, 'quiet_suppressed');
    assert.equal(realtime.length, 0, 'outside preferred time must not fan out realtime');

    const ownerId = await accountId(database.pool, owner.username);
    const roomId = Number((await database.pool.query(`INSERT INTO live_interactions(
        interaction_key,creator_user_id,owner_user_id,status
    ) VALUES($1,$2,$3,'reported') RETURNING id`, [uuid(), creatorId, ownerId])).rows[0].id);
    await database.pool.query(`INSERT INTO live_interaction_reports(
        report_key,interaction_id,reporter_user_id,reason_code,status
    ) VALUES($1,$2,$3,'unwanted_contact','open')`, [uuid(), roomId, creatorId]);
    await assert.rejects(quietService.ownerGrant(owner.username, {
        commandId: uuid(), creatorUsername: creator.username,
        catalogVersionId: ids.get('owner-milestone-fanlight'),
        templateKey: 'quest-chain-celebration'
    }), error => error?.code === 'REWARD_GRANT_MUTED' && error?.status === 403);

    const creatorRepository = new CreatorRepository({ pool: database.pool });
    const creatorService = new CreatorProfileService({ repository: creatorRepository });
    const inbox = await creatorRepository.listInbox(database.pool, creatorId);
    assert.equal(inbox.filter(message => message.messageType === 'reward_status').length, 2,
        'quiet and outside-preferred grants must both survive reload');
    const rewardMessage = inbox.find(message => message.messageType === 'reward_status');
    assert.ok(rewardMessage, 'quiet reward must survive a page reload in the durable inbox');
    await creatorService.updateInbox(creator.username, rewardMessage.id, 'read');
    const readBack = (await creatorRepository.listInbox(database.pool, creatorId))
        .find(message => message.id === rewardMessage.id);
    assert.ok(readBack?.readAt);
    await creatorService.updateInbox(creator.username, rewardMessage.id, 'archive');
    assert.equal((await creatorRepository.listInbox(database.pool, creatorId))
        .some(message => message.id === rewardMessage.id), false);
}

async function verifyIntentConcurrencyAndRollback(database) {
    const usernames = ['intent_once', 'intent_crash', 'intent_dead'];
    for (const username of usernames) await database.createUser({ username });
    const ids = new Map();
    for (const username of usernames) ids.set(username, await accountId(database.pool, username));

    const writer = new RewardGrantIntentWriter();
    const once = {
        sourceType: 'game',
        sourceEventId: 'game-run:postgres-concurrency-one',
        userId: ids.get('intent_once'),
        catalogSlug: 'fanlight-thanks',
        payload: { runId: 'postgres-concurrency-one' }
    };
    const writes = await Promise.all([
        enqueue(database.pool, writer, once),
        enqueue(database.pool, writer, once)
    ]);
    assert.deepEqual(writes.map(value => value.inserted).sort(), [false, true]);
    assert.equal(await count(database.pool, 'reward_grant_intents',
        'source_type=$1 AND source_event_id=$2', [once.sourceType, once.sourceEventId]), 1);
    await assert.rejects(enqueue(database.pool, writer, {
        ...once,
        catalogSlug: 'starlight-studio-badge'
    }), error => error instanceof RewardGrantIntentError
        && error.code === 'REWARD_GRANT_INTENT_COLLISION');

    const repository = new RewardCatalogRepository({ pool: database.pool });
    const intents = new RewardGrantIntentRepository({ pool: database.pool });
    const service = new RewardCatalogService({
        repository,
        BalanceLogger,
        giftConfig,
        clock: () => FIXED_NOW,
        grantIntentRepository: intents
    });
    const beforeOrders = await count(database.pool, 'reward_orders');
    const beforeGrants = await count(database.pool, 'reward_inventory_grants');
    const beforeBudget = Number((await database.pool.query(
        'SELECT COALESCE(SUM(used_amount),0) AS used FROM reward_budget_counters'
    )).rows[0].used);
    const dispatchers = [
        new RewardGrantDispatcher({ repository: intents, rewardService: service,
            workerId: 'reward-postgres-worker-a' }),
        new RewardGrantDispatcher({ repository: intents, rewardService: service,
            workerId: 'reward-postgres-worker-b' })
    ];
    const results = await Promise.all(dispatchers.map(dispatcher => dispatcher.dispatchBatch()));
    assert.equal(results.reduce((sum, row) => sum + row.completed, 0), 1);
    assert.equal(await count(database.pool, 'reward_orders') - beforeOrders, 1);
    assert.equal(await count(database.pool, 'reward_inventory_grants') - beforeGrants, 1);
    const afterBudget = Number((await database.pool.query(
        'SELECT COALESCE(SUM(used_amount),0) AS used FROM reward_budget_counters'
    )).rows[0].used);
    assert.equal(afterBudget - beforeBudget, 3,
        'one unit is reserved exactly once in each of the three active budgets');
    assert.equal((await database.pool.query(`SELECT status,attempts FROM reward_grant_intents
        WHERE source_type=$1 AND source_event_id=$2`, [once.sourceType, once.sourceEventId])).rows[0].status,
    'completed');

    const crash = {
        sourceType: 'story',
        sourceEventId: 'story-event:postgres-crash-recovery',
        userId: ids.get('intent_crash'),
        catalogSlug: 'fanlight-thanks',
        payload: { episode: 'postgres-crash-recovery' }
    };
    const crashIntent = (await enqueue(database.pool, writer, crash)).intent;
    const claimed = await intents.claimBatch('reward-crash-worker-a', { limit: 1, leaseSeconds: 10 });
    assert.equal(claimed[0]?.id, crashIntent.id);
    await database.pool.query(`UPDATE reward_grant_intents
        SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [crashIntent.id]);
    const recovered = await intents.claimBatch('reward-crash-worker-b', { limit: 1, leaseSeconds: 60 });
    assert.equal(recovered[0]?.id, crashIntent.id);
    await service.dispatchClaimedIntent(recovered[0], 'reward-crash-worker-b');
    const crashEvents = (await database.pool.query(`SELECT event_type
        FROM reward_grant_intent_events WHERE intent_id=$1 ORDER BY sequence`, [crashIntent.id]))
        .rows.map(row => row.event_type);
    assert.ok(crashEvents.includes('lease_recovered'));
    assert.equal(crashEvents.at(-1), 'dispatch_completed');

    const dead = {
        sourceType: 'quest',
        sourceEventId: 'quest-chain:postgres-rollback-dead',
        userId: ids.get('intent_dead'),
        catalogSlug: 'fanlight-thanks',
        payload: { chain: 'postgres-rollback-dead' }
    };
    const deadIntent = (await enqueue(database.pool, writer, dead)).intent;
    const beforeDeadOrders = await count(database.pool, 'reward_orders');
    const beforeDeadGrants = await count(database.pool, 'reward_inventory_grants');
    const beforeDeadBudget = Number((await database.pool.query(
        'SELECT COALESCE(SUM(used_amount),0) AS used FROM reward_budget_counters'
    )).rows[0].used);
    const deadRepository = new RewardGrantIntentRepository({
        pool: database.pool,
        maxAttempts: 1
    });
    const faultingCatalog = new Proxy(new RewardCatalogRepository({ pool: database.pool }), {
        get(target, property, receiver) {
            if (property === 'audit') return async () => {
                const error = new Error('forced audit rollback');
                error.code = 'REWARD_TEST_ROLLBACK';
                throw error;
            };
            const value = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    const faultingService = new RewardCatalogService({
        repository: faultingCatalog,
        BalanceLogger,
        giftConfig,
        clock: () => FIXED_NOW,
        grantIntentRepository: deadRepository
    });
    const deadDispatcher = new RewardGrantDispatcher({
        repository: deadRepository,
        rewardService: faultingService,
        workerId: 'reward-dead-worker-a'
    });
    const deadResult = await deadDispatcher.dispatchBatch();
    assert.equal(deadResult.deadLettered, 1);
    assert.equal(await count(database.pool, 'reward_orders') - beforeDeadOrders, 0);
    assert.equal(await count(database.pool, 'reward_inventory_grants') - beforeDeadGrants, 0);
    const afterDeadBudget = Number((await database.pool.query(
        'SELECT COALESCE(SUM(used_amount),0) AS used FROM reward_budget_counters'
    )).rows[0].used);
    assert.equal(afterDeadBudget, beforeDeadBudget);
    const deadRow = (await database.pool.query(`SELECT status,last_error_code
        FROM reward_grant_intents WHERE id=$1`, [deadIntent.id])).rows[0];
    assert.deepEqual(deadRow, { status: 'dead_letter', last_error_code: 'REWARD_TEST_ROLLBACK' });
    assert.ok((await deadRepository.listDeadLetters()).some(row => row.id === deadIntent.id));

    assert.equal(await count(database.pool, 'wish_inventory',
        "source_type='reward_catalog'"), 0);
    assert.equal(await count(database.pool, 'gift_exchanges'), 0);
    assert.equal(await count(database.pool, 'delivery_outbox'), 0);
}

async function verifyQuestAchievementProducers(database) {
    const creator = await database.createUser({ username: 'quest_producer_creator' });
    const admin = await database.createUser({ username: 'quest_producer_admin', isAdmin: true });
    await createProfile(database.pool, creator.username);
    const creatorId = await accountId(database.pool, creator.username);
    await database.pool.query(`INSERT INTO relationship_profiles(user_id)
        VALUES($1) ON CONFLICT(user_id) DO NOTHING`, [creatorId]);

    const writer = new RewardGrantIntentWriter();
    const achievements = new AchievementService({
        pool: database.pool,
        clock: () => FIXED_NOW,
        rewardGrantIntentWriter: writer
    });
    await achievements.initialize();
    const quests = new QuestV2Service({
        pool: database.pool,
        BalanceLogger,
        achievementService: achievements,
        rewardGrantIntentWriter: writer,
        ownerUsername: admin.username,
        clock: () => FIXED_NOW
    });
    await quests.initialize();

    const nodes = (await database.pool.query(`SELECT chain.id AS chain_id,chain.slug AS chain_slug,
               node.node_number,node.version_id,version.reward_policy_version,
               version.reward_points,version.completion_rule
        FROM quest_v2_chains chain
        JOIN quest_v2_chain_nodes node ON node.chain_id=chain.id
        JOIN quest_v2_versions version ON version.id=node.version_id
        WHERE chain.id=(SELECT MIN(id) FROM quest_v2_chains)
        ORDER BY node.node_number`)).rows;
    assert.ok(nodes.length >= 3);
    let triggerAssignmentId;
    for (const node of nodes) {
        const inserted = await database.pool.query(`INSERT INTO quest_v2_assignments(
            assignment_key,user_id,version_id,chain_id,status,occurrence,
            reward_policy_version,reward_points,completion_rule,assignment_source,
            completed_at,resolved_at,due_at
        ) VALUES($1,$2,$3,$4,'completed',1,$5,$6,$7::JSONB,'chain',
            NOW(),NOW(),NOW()+INTERVAL '1 day') RETURNING id`, [
            `producer-chain:${creatorId}:${node.chain_id}:${node.node_number}`,
            creatorId, node.version_id, node.chain_id, node.reward_policy_version,
            node.reward_points, JSON.stringify(node.completion_rule)
        ]);
        triggerAssignmentId = Number(inserted.rows[0].id);
    }
    const assignment = (await database.pool.query(`SELECT assignment.*,account.username,
               definition.slug,version.category,version.verification_mode,
               chain.slug || ':' || node.node_number::TEXT AS chain_node_key
        FROM quest_v2_assignments assignment
        JOIN users account ON account.id=assignment.user_id
        JOIN quest_v2_versions version ON version.id=assignment.version_id
        JOIN quest_v2_definitions definition ON definition.id=version.definition_id
        JOIN quest_v2_chains chain ON chain.id=assignment.chain_id
        JOIN quest_v2_chain_nodes node ON node.chain_id=assignment.chain_id
          AND node.version_id=assignment.version_id
        WHERE assignment.id=$1`, [triggerAssignmentId])).rows[0];
    await transaction(database.pool, client => quests.emitChainCompletedAchievement(
        client, new QuestV2RuntimeRepository(client), assignment, creator.username,
        { requestId: 'quest-chain-postgres-producer' }
    ));
    await transaction(database.pool, client => quests.emitChainCompletedAchievement(
        client, new QuestV2RuntimeRepository(client), assignment, creator.username,
        { requestId: 'quest-chain-postgres-replay' }
    ));
    assert.equal(await count(database.pool, 'quest_v2_chain_completions',
        'user_id=$1 AND chain_id=$2', [creatorId, nodes[0].chain_id]), 1);
    assert.equal(await count(database.pool, 'streamer_achievement_events',
        "user_id=$1 AND event_type='quest.chain.completed'", [creatorId]), 1);
    assert.equal(await count(database.pool, 'reward_grant_intents',
        "user_id=$1 AND source_type='quest'", [creatorId]), 1);

    const rewardRepository = new RewardCatalogRepository({ pool: database.pool });
    const intents = new RewardGrantIntentRepository({ pool: database.pool });
    const rewardService = new RewardCatalogService({ repository: rewardRepository,
        BalanceLogger, giftConfig, grantIntentRepository: intents, clock: () => FIXED_NOW });
    const dispatcher = new RewardGrantDispatcher({ repository: intents,
        rewardService, workerId: 'quest-reward-postgres-worker' });
    assert.equal((await dispatcher.dispatchBatch()).completed, 1);
    assert.equal(await count(database.pool, 'reward_orders',
        "user_id=$1 AND source_type='quest'", [creatorId]), 1);

    const rejectedVersion = (await database.pool.query(`SELECT version.id,
               version.reward_policy_version,version.reward_points,version.completion_rule
        FROM quest_v2_versions version
        WHERE NOT EXISTS(SELECT 1 FROM quest_v2_chain_nodes node
            WHERE node.version_id=version.id)
        ORDER BY version.id DESC LIMIT 1`)).rows[0];
    const rejected = (await database.pool.query(`INSERT INTO quest_v2_assignments(
        assignment_key,user_id,version_id,status,occurrence,reward_policy_version,
        reward_points,completion_rule,assignment_source,resolved_at,rejected_at,due_at
    ) VALUES($1,$2,$3,'rejected',1,$4,$5,$6::JSONB,'system',NOW(),NOW(),
        NOW()+INTERVAL '1 day') RETURNING id`, [`producer-appeal:${creatorId}`,
        creatorId, rejectedVersion.id, rejectedVersion.reward_policy_version,
        rejectedVersion.reward_points, JSON.stringify(rejectedVersion.completion_rule)])).rows[0];
    const appealCommandId = uuid();
    const submitted = await quests.submitAppeal(creator.username, {
        assignmentId: Number(rejected.id), commandId: appealCommandId,
        reason: 'The retained audit should record a bounded appeal.'
    }, { requestId: 'quest-appeal-submit-postgres' });
    assert.equal((await quests.submitAppeal(creator.username, {
        assignmentId: Number(rejected.id), commandId: appealCommandId,
        reason: 'The retained audit should record a bounded appeal.'
    })).replayed, true);
    const resolutionCommandId = uuid();
    const resolution = {
        appealId: submitted.appealId,
        commandId: resolutionCommandId,
        decision: 'dismissed',
        note: 'The original decision remains supported by the retained evidence audit.'
    };
    assert.equal((await quests.resolveAppeal(admin.username, resolution)).status, 'resolved');
    assert.equal((await quests.resolveAppeal(admin.username, resolution)).replayed, true);
    assert.equal(await count(database.pool, 'streamer_achievement_events',
        "user_id=$1 AND event_type='quest.appeal.resolved'", [creatorId]), 1);
    await assert.rejects(database.pool.query('DELETE FROM quest_v2_appeals WHERE id=$1',
        [submitted.appealId]), /quest appeals cannot be deleted/);

    const textStep = (await database.pool.query(`SELECT step.id AS step_id,step.version_id,
               version.reward_policy_version,version.reward_points,version.completion_rule
        FROM quest_v2_step_definitions step
        JOIN quest_v2_versions version ON version.id=step.version_id
        WHERE step.evidence_kind='text' AND step.version_id<>$1
          AND NOT EXISTS(SELECT 1 FROM quest_v2_chain_nodes node
              WHERE node.version_id=step.version_id)
        ORDER BY step.id LIMIT 1`, [rejectedVersion.id])).rows[0];
    assert.ok(textStep);
    const evidenceAssignment = (await database.pool.query(`INSERT INTO quest_v2_assignments(
        assignment_key,user_id,version_id,status,occurrence,reward_policy_version,
        reward_points,completion_rule,assignment_source,due_at
    ) VALUES($1,$2,$3,'active',1,$4,$5,$6::JSONB,'system',NOW()+INTERVAL '1 day')
    RETURNING id`, [`producer-evidence:${creatorId}`, creatorId, textStep.version_id,
        textStep.reward_policy_version, textStep.reward_points,
        JSON.stringify(textStep.completion_rule)])).rows[0];
    const evidenceId = uuid();
    const evidenceHash = crypto.createHash('sha256').update('bounded evidence').digest('hex');
    await database.pool.query(`INSERT INTO quest_v2_evidence(
        id,assignment_id,step_definition_id,submitted_by_user_id,evidence_kind,
        content,content_sha256,retention_until
    ) VALUES($1,$2,$3,$4,'text',$5::JSONB,$6,NOW()-INTERVAL '1 day')`, [
        evidenceId, evidenceAssignment.id, textStep.step_id, creatorId,
        JSON.stringify({ text: 'bounded evidence' }), evidenceHash
    ]);
    assert.equal(await quests.redactExpiredEvidence(), 1);
    assert.equal(await count(database.pool, 'streamer_achievement_events',
        "user_id=$1 AND event_type='quest.evidence.redacted'", [creatorId]), 1);
    const tombstone = (await database.pool.query(`SELECT content,media_bytes,content_sha256,
        redacted_at FROM quest_v2_evidence WHERE id=$1`, [evidenceId])).rows[0];
    assert.deepEqual(tombstone.content, {});
    assert.equal(tombstone.media_bytes, null);
    assert.equal(tombstone.content_sha256, evidenceHash);
    assert.ok(tombstone.redacted_at);
}

async function verifyRewardOrderEventSequencing(database) {
    const repository = new RewardCatalogRepository({ pool: database.pool });
    const account = (await database.pool.query(`SELECT id FROM users
        WHERE username='reward_creator'`)).rows[0];
    const version = (await database.pool.query(`SELECT version.id
        FROM reward_catalog_versions version
        JOIN reward_catalog_items item ON item.id=version.item_id
        WHERE item.slug='owner-milestone-fanlight' AND version.lifecycle='active'`)).rows[0];
    assert.ok(account && version, 'reward sequencing fixture requires a user and active catalog version');
    const orderId = uuid();
    await repository.withTransaction(client => repository.createOrder(client, {
        id: orderId,
        userId: Number(account.id),
        catalogVersionId: Number(version.id),
        sourceType: 'game',
        sourceKey: `sequence:${orderId}`,
        createdByUserId: null,
        status: 'approved',
        pointsCost: 0,
        exposureValue: 0,
        semanticHash: crypto.createHash('sha256').update(`sequence:${orderId}`).digest('hex')
    }));

    const sequences = await Promise.all(Array.from({ length: 20 }, (_, index) =>
        repository.withTransaction(client => repository.appendOrderEvent(client, {
            eventId: uuid(), orderId, eventType: 'order_approved', actorUserId: null,
            details: { concurrentIndex: index }
        }))));
    assert.deepEqual([...sequences].sort((left, right) => left - right),
        Array.from({ length: 20 }, (_, index) => index + 1));
    const persisted = (await database.pool.query(`SELECT sequence FROM reward_order_events
        WHERE order_id=$1 ORDER BY sequence`, [orderId])).rows.map(row => Number(row.sequence));
    assert.deepEqual(persisted, Array.from({ length: 20 }, (_, index) => index + 1));

    const rollbackClient = await database.pool.connect();
    let rolledBackSequence;
    try {
        await rollbackClient.query('BEGIN');
        rolledBackSequence = await repository.appendOrderEvent(rollbackClient, {
            eventId: uuid(), orderId, eventType: 'grant_available', actorUserId: null,
            details: { rollbackProbe: true }
        });
        await rollbackClient.query('ROLLBACK');
    } finally {
        rollbackClient.release();
    }
    const reusedSequence = await repository.withTransaction(client => repository.appendOrderEvent(client, {
        eventId: uuid(), orderId, eventType: 'grant_available', actorUserId: null,
        details: { rollbackReuse: true }
    }));
    assert.equal(rolledBackSequence, 21);
    assert.equal(reusedSequence, rolledBackSequence,
        'a rolled-back event must not burn or skip the next order-local sequence');

    await assert.rejects(repository.withTransaction(client => repository.appendOrderEvent(client, {
        eventId: uuid(), orderId: uuid(), eventType: 'order_submitted', actorUserId: null,
        details: { missingParent: true }
    })), error => error?.code === 'REWARD_ORDER_NOT_FOUND');

    const appendClient = await database.pool.connect();
    const transitionClient = await database.pool.connect();
    let transitionBlocked = false;
    try {
        await appendClient.query('BEGIN');
        const appendSequence = await repository.appendOrderEvent(appendClient, {
            eventId: uuid(), orderId, eventType: 'grant_available', actorUserId: null,
            details: { transitionRace: true }
        });
        assert.equal(appendSequence, 22);

        await transitionClient.query('BEGIN');
        await transitionClient.query("SET LOCAL lock_timeout='250ms'");
        try {
            await repository.transitionOrder(transitionClient, orderId, 'revoked');
        } catch (error) {
            transitionBlocked = error?.code === '55P03';
        }
        await transitionClient.query('ROLLBACK');
        await appendClient.query('COMMIT');
    } catch (error) {
        await transitionClient.query('ROLLBACK').catch(() => {});
        await appendClient.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        transitionClient.release();
        appendClient.release();
    }
    assert.equal(transitionBlocked, true,
        'event append must hold the parent order lock against a concurrent transition');
    const transitioned = await repository.withTransaction(client =>
        repository.transitionOrder(client, orderId, 'revoked'));
    assert.equal(transitioned.status, 'revoked');
    assert.deepEqual((await database.pool.query(`SELECT sequence FROM reward_order_events
        WHERE order_id=$1 ORDER BY sequence`, [orderId])).rows.map(row => Number(row.sequence)),
    Array.from({ length: 22 }, (_, index) => index + 1));
}

async function main() {
    const fresh = new DisposableDatabase('reward_security');
    const upgrade = new DisposableDatabase('reward_upgrade');
    try {
        await fresh.create();
        const schema = await fresh.pool.query(`SELECT
            to_regclass('public.reward_grant_intents') AS intents,
            to_regclass('public.reward_grant_intent_events') AS events`);
        assert.equal(schema.rows[0].intents, 'reward_grant_intents');
        assert.equal(schema.rows[0].events, 'reward_grant_intent_events');
        await verifyVisibilityAndQuietInbox(fresh);
        await verifyIntentConcurrencyAndRollback(fresh);
        await verifyQuestAchievementProducers(fresh);
        await verifyRewardOrderEventSequencing(fresh);
        await verifyHistoricalUpgrade(upgrade);
        console.log('Reward security PostgreSQL fresh/upgrade/concurrency/rollback tests passed');
    } finally {
        await fresh.close();
        await upgrade.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
