'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BalanceLogger = require('../balance-logger');
const { GAME_DEFINITIONS } = require('../domain/games/registry');
const { AchievementRepository } = require('../repositories/achievement-repository');
const { CreatorRepository } = require('../repositories/creator-repository');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { QuestV2CatalogRepository } = require('../repositories/quest-v2-catalog-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
const { StreamerGameRepository } = require('../repositories/streamer-game-repository');
const { LiveInteractionService } = require('../services/live-interaction-service');
const { QuestV2Service } = require('../services/quest-v2-service');
const { DisposableDatabase, delay } = require('../tests/helpers/integration-environment');

if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
    throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to run the disposable account-lock/Quest concurrency test');
}

async function withTransaction(pool, work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function accountId(pool, username) {
    const row = (await pool.query('SELECT id FROM users WHERE username=$1', [username])).rows[0];
    assert.ok(row, `missing account ${username}`);
    return Number(row.id);
}

async function createCreatorState(pool, username) {
    const userId = await accountId(pool, username);
    await pool.query(`INSERT INTO creator_profiles(
        user_id,display_name,timezone,evidence_retention,live_interaction_opt_in
    ) VALUES($1,$2,'UTC','minimum',TRUE)`, [userId, `Concurrency ${username}`]);
    await pool.query(`INSERT INTO relationship_profiles(user_id)
        VALUES($1) ON CONFLICT(user_id) DO NOTHING`, [userId]);
    return userId;
}

async function createReviewAssignment(pool, userId) {
    const version = (await pool.query(`SELECT version.id,version.reward_policy_version,
               version.reward_points,version.completion_rule
        FROM quest_v2_versions version
        JOIN quest_v2_definitions definition ON definition.id=version.definition_id
        WHERE definition.slug='welcome-map-reading' AND version.lifecycle='active'
        ORDER BY version.version DESC LIMIT 1`)).rows[0];
    assert.ok(version && Number(version.reward_points) > 0,
        'review concurrency fixture requires the active welcome-map-reading quest');
    const assignment = (await pool.query(`INSERT INTO quest_v2_assignments(
            assignment_key,user_id,version_id,status,occurrence,reward_policy_version,
            reward_points,completion_rule,assignment_source,accepted_at,submitted_at,due_at
        ) VALUES($1,$2,$3,'under_review',1,$4,$5,$6::JSONB,'system',
            NOW()-INTERVAL '1 hour',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day')
        RETURNING id`, [`lock-order:${userId}:${crypto.randomUUID()}`, userId, version.id,
        version.reward_policy_version, version.reward_points,
        JSON.stringify(version.completion_rule)])).rows[0];
    const steps = (await pool.query(`SELECT id,evidence_kind FROM quest_v2_step_definitions
        WHERE version_id=$1 AND required=TRUE ORDER BY ordinal`, [version.id])).rows;
    assert.ok(steps.length > 0 && steps.every(step => ['text', 'checklist'].includes(step.evidence_kind)),
        'review concurrency fixture requires bounded reviewable evidence steps');
    for (const step of steps) {
        await pool.query(`INSERT INTO quest_v2_assignment_steps(
            assignment_id,step_definition_id,status,progress
        ) VALUES($1,$2,'submitted','{}'::JSONB)`, [assignment.id, step.id]);
        const content = step.evidence_kind === 'checklist'
            ? { items: [{ text: 'Concurrency proof', checked: true }] }
            : { text: 'Concurrency proof' };
        const contentHash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
        await pool.query(`INSERT INTO quest_v2_evidence(
            id,assignment_id,step_definition_id,submitted_by_user_id,evidence_kind,
            content,content_sha256,retention_until
        ) VALUES($1,$2,$3,$4,$5,$6::JSONB,$7,NOW()+INTERVAL '7 days')`, [
            crypto.randomUUID(), assignment.id, step.id, userId, step.evidence_kind,
            JSON.stringify(content), contentHash
        ]);
    }
    return { id: Number(assignment.id), rewardPoints: Number(version.reward_points) };
}

async function verifyReviewLockOrder(database) {
    const creator = await database.createUser({ username: 'quest_lock_creator', balance: 1000 });
    const owner = await database.createUser({ username: 'quest_lock_owner', isAdmin: true });
    const creatorId = await createCreatorState(database.pool, creator.username);
    const service = new QuestV2Service({
        pool: database.pool,
        BalanceLogger,
        ownerUsername: owner.username,
        clock: () => new Date()
    });
    await service.initialize();
    const assignment = await createReviewAssignment(database.pool, creatorId);
    const liveService = new LiveInteractionService({
        repository: new LiveInteractionRepository({ pool: database.pool }),
        ownerUsername: owner.username,
        games: GAME_DEFINITIONS
    });
    const opened = await liveService.open(owner.username, {
        commandId: crypto.randomUUID(), creatorUsername: creator.username
    });

    const creatorClient = await database.pool.connect();
    let reviewPromise;
    let liveAckPromise;
    try {
        await creatorClient.query('BEGIN');
        await creatorClient.query("SET LOCAL lock_timeout='2s'");
        const creatorRuntime = new QuestV2RuntimeRepository(creatorClient);
        assert.ok(await creatorRuntime.lockCreator(creator.username));

        let reviewFinished = false;
        reviewPromise = service.review(owner.username, {
            assignmentId: assignment.id,
            decision: 'approved',
            note: ''
        }, { requestId: 'quest-review-lock-order-postgres' }).then((result) => {
            reviewFinished = true;
            return result;
        });
        await delay(150);
        assert.equal(reviewFinished, false,
            'review must wait for the creator row before touching the assignment');
        let liveAckFinished = false;
        liveAckPromise = liveService.acknowledge(creator.username, {
            interactionId: opened.interaction.id,
            sequence: opened.event.sequence
        }).then(result => {
            liveAckFinished = true;
            return result;
        });
        await delay(150);
        assert.equal(liveAckFinished, false,
            'live acknowledgement must wait on the same creator-first global account barrier');

        const lockedAssignment = await creatorRuntime.lockAssignment(creatorId, assignment.id);
        assert.equal(Number(lockedAssignment.id), assignment.id,
            'creator holding the user row must acquire assignment without a reviewer deadlock');
        await creatorClient.query('COMMIT');

        const [result, ackResult] = await Promise.race([
            Promise.all([reviewPromise, liveAckPromise]),
            delay(8000).then(() => { throw new Error('Quest review lock-order regression timed out'); })
        ]);
        assert.equal(result.status, 'completed');
        assert.equal(result.rewardEarned, assignment.rewardPoints);
        assert.equal(ackResult.highestAckSequence, opened.event.sequence);
    } catch (error) {
        await creatorClient.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        creatorClient.release();
        await reviewPromise?.catch(() => {});
        await liveAckPromise?.catch(() => {});
    }

    const state = (await database.pool.query(`SELECT assignment.status,account.balance,
               COUNT(settlement.*)::INTEGER settlement_count
        FROM quest_v2_assignments assignment
        JOIN users account ON account.id=assignment.user_id
        LEFT JOIN quest_v2_reward_settlements settlement ON settlement.assignment_id=assignment.id
        WHERE assignment.id=$1 GROUP BY assignment.status,account.balance`, [assignment.id])).rows[0];
    assert.equal(state.status, 'completed');
    assert.equal(Number(state.balance), 1000 + assignment.rewardPoints);
    assert.equal(Number(state.settlement_count), 1);

    await database.pool.query(`UPDATE users SET account_locked=TRUE,
        account_locked_at=NOW(),account_locked_by=$2,
        account_lock_reason='postgres regression'
        WHERE id=$1`, [creatorId, owner.username]);
    await withTransaction(database.pool, async client => {
        assert.equal(await new QuestV2RuntimeRepository(client).lockCreator(creator.username), null);
        assert.equal(await new StoryWorldRepository(client).lockCreator(creator.username), null);
        assert.equal(await new AchievementRepository(client).lockUser(creator.username), null);
        assert.equal(await new CreatorRepository({ pool: database.pool }).lockUser(client, creator.username), null);
    });
    const unchanged = await database.pool.query('SELECT balance FROM users WHERE id=$1', [creatorId]);
    assert.equal(Number(unchanged.rows[0].balance), 1000 + assignment.rewardPoints,
        'locked-account rejection must not post another balance entry');
}

async function verifyCrossReviewerGlobalOrder(database) {
    const first = await database.createUser({ username: 'quest_cross_reviewer_a', isAdmin: true });
    const second = await database.createUser({ username: 'quest_cross_reviewer_b', isAdmin: true });
    const firstId = await accountId(database.pool, first.username);
    const secondId = await accountId(database.pool, second.username);
    assert.ok(firstId < secondId, 'cross-review fixture requires a stable global user ID order');
    const firstClient = await database.pool.connect();
    const secondClient = await database.pool.connect();
    let firstOpen = false;
    let secondOpen = false;
    try {
        await firstClient.query('BEGIN');
        firstOpen = true;
        await secondClient.query('BEGIN');
        secondOpen = true;
        let firstSettled = false;
        let secondSettled = false;
        const firstAttempt = new QuestV2RuntimeRepository(firstClient)
            .lockReviewerAndSubject(first.username, secondId)
            .then(value => ({ value }), error => ({ error }))
            .finally(() => { firstSettled = true; });
        const secondAttempt = new QuestV2RuntimeRepository(secondClient)
            .lockReviewerAndSubject(second.username, firstId)
            .then(value => ({ value }), error => ({ error }))
            .finally(() => { secondSettled = true; });
        await delay(200);
        assert.equal(Number(firstSettled) + Number(secondSettled), 1,
            'opposite reviewer/subject pairs must serialize on one global user-row order');
        if (firstSettled) {
            const firstResult = await firstAttempt;
            assert.equal(firstResult.error, undefined, `first cross-review failed: ${firstResult.error?.code}`);
            await firstClient.query('COMMIT');
            firstOpen = false;
        } else {
            const secondResult = await secondAttempt;
            assert.equal(secondResult.error, undefined, `second cross-review failed: ${secondResult.error?.code}`);
            await secondClient.query('COMMIT');
            secondOpen = false;
        }
        const [firstResult, secondResult] = await Promise.race([
            Promise.all([firstAttempt, secondAttempt]),
            delay(8000).then(() => { throw new Error('opposite Quest reviews deadlocked'); })
        ]);
        assert.equal(firstResult.error, undefined, `first cross-review failed: ${firstResult.error?.code}`);
        assert.equal(secondResult.error, undefined, `second cross-review failed: ${secondResult.error?.code}`);
        assert.equal(Number(firstResult.value.subject.id), secondId);
        assert.equal(Number(secondResult.value.subject.id), firstId);
        if (firstOpen) {
            await firstClient.query('COMMIT');
            firstOpen = false;
        }
        if (secondOpen) {
            await secondClient.query('COMMIT');
            secondOpen = false;
        }
    } finally {
        if (firstOpen) await firstClient.query('ROLLBACK').catch(() => {});
        if (secondOpen) await secondClient.query('ROLLBACK').catch(() => {});
        firstClient.release();
        secondClient.release();
    }
}

async function readAfterUserBarrier(database, userId, updateFacts, readFacts, label) {
    const writer = await database.pool.connect();
    const reader = await database.pool.connect();
    let writerOpen = false;
    let readerOpen = false;
    try {
        await writer.query('BEGIN');
        writerOpen = true;
        await writer.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
        await updateFacts(writer);
        await reader.query('BEGIN');
        readerOpen = true;
        let settled = false;
        const attempt = readFacts(reader).then(value => ({ value }), error => ({ error }))
            .finally(() => { settled = true; });
        await delay(150);
        assert.equal(settled, false, `${label} must wait on the creator user barrier`);
        await writer.query('COMMIT');
        writerOpen = false;
        const outcome = await Promise.race([
            attempt,
            delay(5000).then(() => { throw new Error(`${label} fact refresh timed out`); })
        ]);
        assert.equal(outcome.error, undefined, `${label} failed after the user barrier: ${outcome.error?.code}`);
        await reader.query('ROLLBACK');
        readerOpen = false;
        return outcome.value;
    } finally {
        if (writerOpen) await writer.query('ROLLBACK').catch(() => {});
        if (readerOpen) await reader.query('ROLLBACK').catch(() => {});
        writer.release();
        reader.release();
    }
}

async function verifyPostBarrierDynamicFacts(database) {
    const creator = await database.createUser({ username: 'authority_fact_creator' });
    const creatorId = await createCreatorState(database.pool, creator.username);

    const gameAccounts = await readAfterUserBarrier(database, creatorId, client => client.query(`
        UPDATE creator_profiles SET timezone='Asia/Shanghai',live_interaction_opt_in=FALSE,
            version=version+1 WHERE user_id=$1
    `, [creatorId]), client => new StreamerGameRepository({ pool: database.pool })
        .lockAccounts(client, [creator.username]), 'Streamer Game authority');
    assert.equal(gameAccounts.get(creator.username).timezone, 'Asia/Shanghai');
    assert.equal(gameAccounts.get(creator.username).live_interaction_opt_in, false);

    await database.pool.query(`UPDATE creator_profiles SET timezone='UTC',live_interaction_opt_in=TRUE,
        version=version+1 WHERE user_id=$1`, [creatorId]);
    const storyCreator = await readAfterUserBarrier(database, creatorId, client => client.query(`
        UPDATE creator_profiles SET timezone='America/Toronto',story_tone='mystery',
            live_interaction_opt_in=FALSE,version=version+1 WHERE user_id=$1
    `, [creatorId]), client => new StoryWorldRepository(client).lockCreator(creator.username),
    'Story creator authority');
    assert.equal(storyCreator.timezone, 'America/Toronto');
    assert.equal(storyCreator.story_tone, 'mystery');
    assert.equal(storyCreator.live_interaction_opt_in, false);

    await database.pool.query(`UPDATE creator_profiles SET timezone='UTC',evidence_retention='minimum',
        version=version+1 WHERE user_id=$1`, [creatorId]);
    await database.pool.query(`UPDATE relationship_profiles SET level=1,version=version+1
        WHERE user_id=$1`, [creatorId]);
    const questCreator = await readAfterUserBarrier(database, creatorId, async client => {
        await client.query(`UPDATE creator_profiles SET timezone='Europe/London',
            evidence_retention='extended',version=version+1 WHERE user_id=$1`, [creatorId]);
        await client.query(`UPDATE relationship_profiles SET level=7,version=version+1
            WHERE user_id=$1`, [creatorId]);
    }, client => new QuestV2RuntimeRepository(client).lockCreator(creator.username),
    'Quest runtime creator authority');
    assert.equal(questCreator.timezone, 'Europe/London');
    assert.equal(questCreator.evidence_retention, 'extended');
    assert.equal(Number(questCreator.relationship_level), 7);

    await database.pool.query(`UPDATE creator_profiles SET timezone='UTC',version=version+1
        WHERE user_id=$1`, [creatorId]);
    const catalogCreator = await readAfterUserBarrier(database, creatorId, client => client.query(`
        UPDATE creator_profiles SET timezone='Asia/Tokyo',version=version+1 WHERE user_id=$1
    `, [creatorId]), client => new QuestV2CatalogRepository(client).lockCreator(creator.username),
    'Quest catalog creator authority');
    assert.equal(catalogCreator.timezone, 'Asia/Tokyo');

    const sideEffects = await database.pool.query(`SELECT
        (SELECT COUNT(*) FROM streamer_game_runs WHERE creator_user_id=$1)::INTEGER game_runs,
        (SELECT COUNT(*) FROM story_runs WHERE user_id=$1)::INTEGER story_runs,
        (SELECT COUNT(*) FROM quest_v2_assignments WHERE user_id=$1)::INTEGER quest_assignments`, [creatorId]);
    assert.deepEqual(sideEffects.rows[0], { game_runs: 0, story_runs: 0, quest_assignments: 0 },
        'authority fact refresh probes must not create gameplay or Quest state');
}

async function main() {
    const database = new DisposableDatabase('account_quest_locking');
    try {
        await database.create();
        await verifyReviewLockOrder(database);
        await verifyCrossReviewerGlobalOrder(database);
        await verifyPostBarrierDynamicFacts(database);
        console.log('Account-lock and Quest PostgreSQL concurrency tests passed');
    } finally {
        await database.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
