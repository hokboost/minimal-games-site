'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BalanceLogger = require('../balance-logger');
const { AchievementRepository } = require('../repositories/achievement-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { AchievementService } = require('../services/achievement-service');
const { QuestV2Service } = require('../services/quest-v2-service');
const { DisposableDatabase, delay } = require('../tests/helpers/integration-environment');

if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
    throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to run the disposable Quest retention locking test');
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolveValue, rejectValue) => {
        resolve = resolveValue;
        reject = rejectValue;
    });
    return { promise, resolve, reject };
}

async function timed(promise, message, timeoutMs = 15000) {
    return Promise.race([
        promise,
        delay(timeoutMs).then(() => { throw new Error(message); })
    ]);
}

async function accountId(pool, username) {
    const row = (await pool.query('SELECT id FROM users WHERE username=$1', [username])).rows[0];
    assert.ok(row, `missing account ${username}`);
    return Number(row.id);
}

async function loadTemplate(pool) {
    const row = (await pool.query(`
        SELECT version.id AS version_id,version.reward_policy_version,
               version.reward_points,version.completion_rule,version.review_policy,
               step.id AS step_id,step.evidence_kind
        FROM quest_v2_versions version
        JOIN quest_v2_definitions definition ON definition.id=version.definition_id
        JOIN quest_v2_step_definitions step ON step.version_id=version.id
        WHERE definition.slug='welcome-map-reading'
          AND version.lifecycle='active' AND step.required=TRUE
        ORDER BY version.version DESC,step.ordinal
        LIMIT 1
    `)).rows[0];
    assert.ok(row, 'Quest retention fixture requires the seeded welcome-map-reading quest');
    assert.equal(row.review_policy, 'owner');
    assert.ok(['text', 'checklist'].includes(row.evidence_kind));
    return row;
}

function evidenceContent(template, label) {
    return template.evidence_kind === 'checklist'
        ? { items: [{ text: label, checked: true }] }
        : { text: label };
}

async function createAssignment(pool, template, userId, {
    key = `retention:${userId}:${crypto.randomUUID()}`,
    status = 'completed',
    evidenceCount = 1,
    expired = true
} = {}) {
    const assignment = (await pool.query(`
        INSERT INTO quest_v2_assignments(
            assignment_key,user_id,version_id,status,occurrence,
            reward_policy_version,reward_points,completion_rule,assignment_source,
            offered_at,accepted_at,submitted_at,completed_at,resolved_at
        ) VALUES($1,$2,$3,$4::VARCHAR(20),1,$5,$6,$7::JSONB,'system',
            NOW()-INTERVAL '2 days',NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day',
            CASE WHEN $4::VARCHAR(20)='completed' THEN NOW()-INTERVAL '1 day' ELSE NULL END,
            CASE WHEN $4::VARCHAR(20)='completed' THEN NOW()-INTERVAL '1 day' ELSE NULL END)
        RETURNING id
    `, [key, userId, template.version_id, status, template.reward_policy_version,
        template.reward_points, JSON.stringify(template.completion_rule)])).rows[0];
    const stepStatus = status === 'under_review' ? 'submitted' : 'completed';
    await pool.query(`
        INSERT INTO quest_v2_assignment_steps(
            assignment_id,step_definition_id,status,progress,completed_at
        ) VALUES($1,$2,$3::VARCHAR(20),'{}'::JSONB,
            CASE WHEN $3::VARCHAR(20)='completed' THEN NOW()-INTERVAL '1 day' ELSE NULL END)
    `, [assignment.id, template.step_id, stepStatus]);

    const evidenceIds = [];
    for (let index = 0; index < evidenceCount; index += 1) {
        const id = crypto.randomUUID();
        const content = evidenceContent(template, `${key}:${index}`);
        const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
        await pool.query(`
            INSERT INTO quest_v2_evidence(
                id,assignment_id,step_definition_id,submitted_by_user_id,evidence_kind,
                content,content_sha256,retention_until,submitted_at
            ) VALUES($1,$2,$3,$4,$5,$6::JSONB,$7,
                CASE WHEN $8::BOOLEAN THEN NOW()-INTERVAL '1 day'
                     ELSE NOW()+INTERVAL '7 days' END,
                NOW()-INTERVAL '2 days'+make_interval(secs => $9))
        `, [id, assignment.id, template.step_id, userId, template.evidence_kind,
            JSON.stringify(content), hash, expired, index]);
        evidenceIds.push(id);
    }
    return { id: Number(assignment.id), userId, evidenceIds };
}

function questService(pool, achievementService, options = {}) {
    return new QuestV2Service({
        pool,
        BalanceLogger,
        achievementService,
        ownerUsername: options.ownerUsername || null,
        runtimeRepositoryFactory: options.runtimeRepositoryFactory
    });
}

async function bulkUsers(pool, passwordHash, prefix, count) {
    const result = await pool.query(`
        INSERT INTO users(username,password_hash,balance,authorized,is_admin,registration_ip)
        SELECT $1 || LPAD(series.number::TEXT,3,'0'),$2,0,TRUE,FALSE,'127.0.0.1'
        FROM generate_series(1,$3::INTEGER) AS series(number)
        RETURNING id,username
    `, [prefix, passwordHash, count]);
    return result.rows.map((row) => ({ id: Number(row.id), username: row.username }));
}

async function waitForBlockedQuery(pool, pid, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const row = (await pool.query(`
            SELECT wait_event_type,wait_event,query
            FROM pg_stat_activity WHERE pid=$1
        `, [pid])).rows[0];
        if (row?.wait_event_type === 'Lock') return row;
        await delay(25);
    }
    throw new Error(`backend ${pid} did not reach a row-lock wait`);
}

async function verifyReviewCleanupBarrier(database, services, template, owner) {
    const creator = await database.createUser({ username: 'retention_review_creator' });
    const creatorId = await accountId(database.pool, creator.username);
    const assignment = await createAssignment(database.pool, template, creatorId, {
        key: 'retention:review-race', status: 'under_review'
    });
    const cleanupLocked = deferred();
    const releaseCleanup = deferred();

    class PausingRetentionRepository extends QuestV2RuntimeRepository {
        async redactExpiredEvidenceBatch(limit) {
            const rows = await super.redactExpiredEvidenceBatch(limit);
            cleanupLocked.resolve(rows);
            await releaseCleanup.promise;
            return rows;
        }
    }

    const cleanup = questService(database.pool, services.achievement, {
        runtimeRepositoryFactory: (client) => new PausingRetentionRepository(client)
    });
    const reviewPid = deferred();
    const trackedReviewPool = {
        async connect() {
            const client = await database.pool.connect();
            const pid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
            reviewPid.resolve(pid);
            return client;
        }
    };
    const reviewer = questService(trackedReviewPool, services.achievement, {
        ownerUsername: owner.username
    });

    const cleanupPromise = cleanup.redactExpiredEvidence();
    const lockedRows = await timed(cleanupLocked.promise,
        'retention cleanup did not acquire its account/assignment/evidence barriers');
    assert.equal(lockedRows.length, 1);
    const reviewPromise = reviewer.review(owner.username, {
        assignmentId: assignment.id,
        decision: 'returned',
        note: 'Concurrency barrier verification'
    }, { requestId: 'quest-retention-review-barrier' });

    let observationError = null;
    try {
        const blocked = await waitForBlockedQuery(database.pool,
            await timed(reviewPid.promise, 'review did not acquire a PostgreSQL backend'));
        assert.match(blocked.query, /FROM users[\s\S]*ORDER BY id[\s\S]*FOR NO KEY UPDATE/,
            'review must wait at the creator account barrier, never after locking assignment/evidence');
    } catch (error) {
        observationError = error;
    } finally {
        releaseCleanup.resolve();
    }

    const settled = await timed(Promise.allSettled([cleanupPromise, reviewPromise]),
        'review-vs-retention cleanup concurrency test timed out');
    if (observationError) throw observationError;
    assert.deepEqual(settled.map((item) => item.status), ['fulfilled', 'fulfilled'],
        settled.map((item) => item.reason?.stack || item.value));
    assert.equal(settled[0].value, 1);
    assert.equal(settled[1].value.status, 'returned');

    const state = (await database.pool.query(`
        SELECT assignment.status,evidence.redacted_at,
               COUNT(*) FILTER (WHERE audit.action='quest.evidence.retention_redacted')::INTEGER
                   AS retention_audits
        FROM quest_v2_assignments assignment
        JOIN quest_v2_evidence evidence ON evidence.assignment_id=assignment.id
        LEFT JOIN quest_v2_audit_log audit ON audit.assignment_id=assignment.id
        WHERE assignment.id=$1
        GROUP BY assignment.status,evidence.redacted_at
    `, [assignment.id])).rows[0];
    assert.equal(state.status, 'returned');
    assert.ok(state.redacted_at);
    assert.equal(Number(state.retention_audits), 1);
}

async function verifyBusyUserThroughput(database, services, template) {
    const busy = await database.createUser({ username: 'retention_busy_creator' });
    const free = await database.createUser({ username: 'retention_free_creator' });
    const busyId = await accountId(database.pool, busy.username);
    const freeId = await accountId(database.pool, free.username);
    assert.ok(busyId < freeId, 'busy-user fixture requires the busy account first in ID order');
    const busyAssignment = await createAssignment(database.pool, template, busyId,
        { key: 'retention:busy-user' });
    const freeAssignment = await createAssignment(database.pool, template, freeId,
        { key: 'retention:free-user' });
    const blocker = await database.pool.connect();
    try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [busyId]);
        assert.equal(await services.quest.redactExpiredEvidence(), 1,
            'a locked first user must not starve a later free user');
        const interim = await database.pool.query(`
            SELECT assignment_id,redacted_at FROM quest_v2_evidence
            WHERE assignment_id=ANY($1::BIGINT[]) ORDER BY assignment_id
        `, [[busyAssignment.id, freeAssignment.id]]);
        assert.equal(interim.rows[0].redacted_at, null);
        assert.ok(interim.rows[1].redacted_at);
        await blocker.query('ROLLBACK');
        assert.equal(await services.quest.redactExpiredEvidence(), 1);
    } finally {
        await blocker.query('ROLLBACK').catch(() => {});
        blocker.release();
    }
    const finalRows = await database.pool.query(`
        SELECT COUNT(*) FILTER (WHERE redacted_at IS NOT NULL)::INTEGER AS redacted
        FROM quest_v2_evidence WHERE assignment_id=ANY($1::BIGINT[])
    `, [[busyAssignment.id, freeAssignment.id]]);
    assert.equal(Number(finalRows.rows[0].redacted), 2);
}

async function verifyUnavailableAccountCleanup(database, services, template, owner) {
    const locked = await database.createUser({ username: 'retention_locked_creator' });
    const deactivated = await database.createUser({ username: 'retention_deactivated_creator' });
    const lockedId = await accountId(database.pool, locked.username);
    const deactivatedId = await accountId(database.pool, deactivated.username);
    const assignments = [
        await createAssignment(database.pool, template, lockedId, { key: 'retention:locked-account' }),
        await createAssignment(database.pool, template, deactivatedId, { key: 'retention:deactivated-account' })
    ];
    await database.pool.query(`
        UPDATE users SET account_locked=TRUE,account_locked_at=NOW(),
            account_locked_by=$2,account_lock_reason='retention privacy regression'
        WHERE id=$1
    `, [lockedId, owner.username]);
    await database.pool.query('UPDATE users SET deactivated=TRUE WHERE id=$1', [deactivatedId]);

    assert.equal(await services.quest.redactExpiredEvidence(), 2,
        'privacy retention must not depend on account login eligibility');
    const state = (await database.pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE evidence.redacted_at IS NOT NULL)::INTEGER AS redacted,
            COUNT(*) FILTER (WHERE audit.details->>'achievementSkippedReason'='account_unavailable')::INTEGER
                AS skipped_audits,
            COUNT(DISTINCT event.id)::INTEGER AS achievement_events
        FROM quest_v2_assignments assignment
        JOIN quest_v2_evidence evidence ON evidence.assignment_id=assignment.id
        LEFT JOIN quest_v2_audit_log audit
          ON audit.assignment_id=assignment.id AND audit.action='quest.evidence.retention_redacted'
        LEFT JOIN streamer_achievement_events event
          ON event.user_id=assignment.user_id AND event.event_type='quest.evidence.redacted'
        WHERE assignment.id=ANY($1::BIGINT[])
    `, [assignments.map((item) => item.id)])).rows[0];
    assert.equal(Number(state.redacted), 2);
    assert.equal(Number(state.skipped_audits), 2);
    assert.equal(Number(state.achievement_events), 0);
}

async function verifyTwoWorkers(database, services, template, passwordHash) {
    const users = await bulkUsers(database.pool, passwordHash, 'retention_worker_', 101);
    const assignments = [];
    for (const user of users) {
        assignments.push(await createAssignment(database.pool, template, user.id,
            { key: `retention:worker:${user.id}` }));
    }

    const results = await timed(Promise.all([
        services.quest.redactExpiredEvidence(),
        services.quest.redactExpiredEvidence()
    ]), 'two Quest retention workers timed out', 30000);
    assert.equal(results[0] + results[1], 101);
    assert.ok(results[0] > 0 && results[1] > 0,
        `both SKIP LOCKED workers must make progress, got ${results.join(',')}`);

    const ids = assignments.map((item) => item.id);
    const state = (await database.pool.query(`
        SELECT
            COUNT(DISTINCT evidence.id) FILTER (WHERE evidence.redacted_at IS NOT NULL)::INTEGER AS redacted,
            COUNT(DISTINCT audit.id)::INTEGER AS audits,
            COUNT(DISTINCT event.id)::INTEGER AS achievement_events,
            COUNT(DISTINCT unlock_row.user_id)::INTEGER AS unlock_users
        FROM quest_v2_assignments assignment
        JOIN quest_v2_evidence evidence ON evidence.assignment_id=assignment.id
        LEFT JOIN quest_v2_audit_log audit
          ON audit.assignment_id=assignment.id AND audit.action='quest.evidence.retention_redacted'
        LEFT JOIN streamer_achievement_events event
          ON event.user_id=assignment.user_id AND event.event_type='quest.evidence.redacted'
        LEFT JOIN streamer_achievement_unlocks unlock_row ON unlock_row.user_id=assignment.user_id
        WHERE assignment.id=ANY($1::BIGINT[])
    `, [ids])).rows[0];
    assert.equal(Number(state.redacted), 101);
    assert.equal(Number(state.audits), 101);
    assert.equal(Number(state.achievement_events), 101);
    assert.equal(Number(state.unlock_users), 101);
    assert.equal(await services.quest.redactExpiredEvidence(), 0,
        'a third worker pass must observe no duplicate retention work');
}

async function verifyRollbackRetryAndDedupe(database, services, template) {
    const creator = await database.createUser({ username: 'retention_rollback_creator' });
    const creatorId = await accountId(database.pool, creator.username);
    const assignment = await createAssignment(database.pool, template, creatorId,
        { key: 'retention:rollback-retry' });
    const failingAchievement = {
        async recordTrustedEvent(...args) {
            await services.achievement.recordTrustedEvent(...args);
            throw new Error('injected retention producer failure');
        }
    };
    const failingService = questService(database.pool, failingAchievement);
    await assert.rejects(failingService.redactExpiredEvidence(),
        /injected retention producer failure/);

    let state = (await database.pool.query(`
        SELECT evidence.redacted_at,evidence.content,
            (SELECT COUNT(*) FROM quest_v2_audit_log
             WHERE assignment_id=$1 AND action='quest.evidence.retention_redacted')::INTEGER AS audits,
            (SELECT COUNT(*) FROM streamer_achievement_events
             WHERE user_id=$2 AND event_type='quest.evidence.redacted')::INTEGER AS achievement_events,
            (SELECT COUNT(*) FROM streamer_achievement_unlocks WHERE user_id=$2)::INTEGER AS unlocks
        FROM quest_v2_evidence evidence WHERE evidence.assignment_id=$1
    `, [assignment.id, creatorId])).rows[0];
    assert.equal(state.redacted_at, null);
    assert.notDeepEqual(state.content, {});
    assert.equal(Number(state.audits), 0);
    assert.equal(Number(state.achievement_events), 0);
    assert.equal(Number(state.unlocks), 0);

    assert.equal(await services.quest.redactExpiredEvidence(), 1);
    assert.equal(await services.quest.redactExpiredEvidence(), 0);
    state = (await database.pool.query(`
        SELECT evidence.redacted_at,
            (SELECT COUNT(*) FROM quest_v2_audit_log
             WHERE assignment_id=$1 AND action='quest.evidence.retention_redacted')::INTEGER AS audits,
            (SELECT COUNT(*) FROM streamer_achievement_events
             WHERE user_id=$2 AND source_type='quest'
               AND source_event_id=$3)::INTEGER AS achievement_events,
            (SELECT COUNT(*) FROM streamer_achievement_unlocks WHERE user_id=$2)::INTEGER AS unlocks
        FROM quest_v2_evidence evidence WHERE evidence.assignment_id=$1
    `, [assignment.id, creatorId,
        `achievement-quest-evidence-redacted:${assignment.evidenceIds[0]}`])).rows[0];
    assert.ok(state.redacted_at);
    assert.equal(Number(state.audits), 1);
    assert.equal(Number(state.achievement_events), 1);
    assert.equal(Number(state.unlocks), 1);
}

async function verifyHardBatchLimit(database, services, template) {
    const creator = await database.createUser({ username: 'retention_limit_creator' });
    const creatorId = await accountId(database.pool, creator.username);
    const assignment = await createAssignment(database.pool, template, creatorId, {
        key: 'retention:hard-limit', evidenceCount: 101
    });
    assert.equal(await services.quest.redactExpiredEvidence(), 100);
    let state = (await database.pool.query(`
        SELECT COUNT(*) FILTER (WHERE redacted_at IS NOT NULL)::INTEGER AS redacted,
               COUNT(*) FILTER (WHERE redacted_at IS NULL)::INTEGER AS remaining
        FROM quest_v2_evidence WHERE assignment_id=$1
    `, [assignment.id])).rows[0];
    assert.deepEqual([Number(state.redacted), Number(state.remaining)], [100, 1]);
    assert.equal(await services.quest.redactExpiredEvidence(), 1);
    assert.equal(await services.quest.redactExpiredEvidence(), 0);
    state = (await database.pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE redacted_at IS NOT NULL)::INTEGER AS redacted,
            (SELECT COUNT(*) FROM quest_v2_audit_log
             WHERE assignment_id=$1 AND action='quest.evidence.retention_redacted')::INTEGER AS audits,
            (SELECT COUNT(*) FROM streamer_achievement_events
             WHERE user_id=$2 AND event_type='quest.evidence.redacted')::INTEGER AS achievement_events
        FROM quest_v2_evidence WHERE assignment_id=$1
    `, [assignment.id, creatorId])).rows[0];
    assert.equal(Number(state.redacted), 101);
    assert.equal(Number(state.audits), 101);
    assert.equal(Number(state.achievement_events), 101);
}

async function main() {
    const database = new DisposableDatabase('quest_retention');
    try {
        await database.create();
        const owner = await database.createUser({ username: 'retention_owner', isAdmin: true });
        const passwordHash = (await database.pool.query(
            'SELECT password_hash FROM users WHERE username=$1', [owner.username]
        )).rows[0].password_hash;
        const achievement = new AchievementService({
            pool: database.pool,
            repositoryFactory: (client) => new AchievementRepository(client)
        });
        const quest = questService(database.pool, achievement, { ownerUsername: owner.username });
        await achievement.initialize();
        await quest.initialize();
        const template = await loadTemplate(database.pool);
        const services = { achievement, quest };

        await verifyReviewCleanupBarrier(database, services, template, owner);
        await verifyBusyUserThroughput(database, services, template);
        await verifyUnavailableAccountCleanup(database, services, template, owner);
        await verifyTwoWorkers(database, services, template, passwordHash);
        await verifyRollbackRetryAndDedupe(database, services, template);
        await verifyHardBatchLimit(database, services, template);
        console.log('Quest retention PostgreSQL locking tests passed');
    } finally {
        await database.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
