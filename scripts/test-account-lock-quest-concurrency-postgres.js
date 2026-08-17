'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BalanceLogger = require('../balance-logger');
const { AchievementRepository } = require('../repositories/achievement-repository');
const { CreatorRepository } = require('../repositories/creator-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
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
    await pool.query(`INSERT INTO creator_profiles(user_id,display_name,timezone,evidence_retention)
        VALUES($1,$2,'UTC','minimum')`, [userId, `Concurrency ${username}`]);
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

    const creatorClient = await database.pool.connect();
    let reviewPromise;
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

        const lockedAssignment = await creatorRuntime.lockAssignment(creatorId, assignment.id);
        assert.equal(Number(lockedAssignment.id), assignment.id,
            'creator holding the user row must acquire assignment without a reviewer deadlock');
        await creatorClient.query('COMMIT');

        const result = await Promise.race([
            reviewPromise,
            delay(8000).then(() => { throw new Error('Quest review lock-order regression timed out'); })
        ]);
        assert.equal(result.status, 'completed');
        assert.equal(result.rewardEarned, assignment.rewardPoints);
    } catch (error) {
        await creatorClient.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        creatorClient.release();
        await reviewPromise?.catch(() => {});
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

async function main() {
    const database = new DisposableDatabase('account_quest_locking');
    try {
        await database.create();
        await verifyReviewLockOrder(database);
        console.log('Account-lock and Quest PostgreSQL concurrency tests passed');
    } finally {
        await database.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
