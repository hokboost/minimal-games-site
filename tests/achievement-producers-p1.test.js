'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packs = require('../content/streamer-world/games');
const {
    ENGINE_REGISTRY,
    StreamerGameService,
    hash
} = require('../services/streamer-game-service');
const { QuestV2Service } = require('../services/quest-v2-service');
const { MIGRATIONS } = require('../lib/database-migrations');

function gameRun(gameId = 'studio-crafting', overrides = {}) {
    return {
        id: crypto.randomUUID(),
        gameId,
        configVersion: packs[gameId].version,
        creatorUserId: 71,
        creatorUsername: 'producer_creator',
        ownerUserId: null,
        ownerUsername: null,
        liveInteractionId: null,
        mode: 'solo',
        difficulty: 'standard',
        status: 'active',
        revision: 4,
        score: 0,
        resumed: true,
        ...overrides
    };
}

function completionState(gameId = 'studio-crafting') {
    return {
        status: 'completed',
        challengeId: packs[gameId].challenges[0].id,
        score: 912
    };
}

function producerService({ achievementEvents = [], rewardIntents = [], writerError = null } = {}) {
    return new StreamerGameService({
        repository: { async withTransaction(work) { return work({ transaction: true }); } },
        achievementService: {
            async recordTrustedEvent(client, username, event) {
                achievementEvents.push({ client, username, event: structuredClone(event) });
                return { success: true, replayed: false, unlocked: [] };
            }
        },
        rewardGrantIntentWriter: {
            async enqueue(client, intent) {
                if (writerError) throw writerError;
                rewardIntents.push({ client, intent: structuredClone(intent) });
                return { inserted: true };
            }
        },
        clock: () => new Date('2026-08-17T12:00:00.000Z')
    });
}

test('game completion producer emits one strict achievement and one mapped reward intent in the source transaction', async () => {
    const achievementEvents = [];
    const rewardIntents = [];
    const service = producerService({ achievementEvents, rewardIntents });
    const client = { transaction: 'source' };
    const run = gameRun();
    await service.recordCompletionAchievements(client, run, completionState(), {
        requestId: 'producer-game-completion'
    });
    assert.equal(achievementEvents.length, 1);
    assert.equal(achievementEvents[0].client, client);
    assert.equal(achievementEvents[0].username, run.creatorUsername);
    assert.deepEqual(achievementEvents[0].event.payload, {
        runId: run.id,
        gameId: 'studio-crafting',
        challengeId: completionState().challengeId,
        difficulty: 'standard',
        mode: 'solo',
        score: 912,
        authoritativeScore: true,
        resumed: true
    });
    assert.equal(rewardIntents.length, 1);
    assert.equal(rewardIntents[0].client, client);
    assert.equal(rewardIntents[0].intent.sourceType, 'game');
    assert.equal(rewardIntents[0].intent.userId, run.creatorUserId);
    assert.equal(rewardIntents[0].intent.catalogSlug, 'starlight-studio-badge');
});

test('unmapped games still emit achievements but cannot manufacture a reward grant', async () => {
    const achievementEvents = [];
    const rewardIntents = [];
    const service = producerService({ achievementEvents, rewardIntents });
    await service.recordCompletionAchievements({}, gameRun('broadcast-bingo'),
        completionState('broadcast-bingo'));
    assert.equal(achievementEvents.length, 1);
    assert.equal(rewardIntents.length, 0);
});

test('reward intent failure rejects completion hook so its enclosing source transaction can roll back', async () => {
    const service = producerService({ writerError: new Error('intent persistence failed') });
    await assert.rejects(service.recordCompletionAchievements({}, gameRun(), completionState()),
        /intent persistence failed/);
});

test('creator state recovery records one durable resume fact and projects it into later completion evidence', async () => {
    const gameId = 'constellation-repair';
    const pack = packs[gameId];
    const engine = ENGINE_REGISTRY[pack.version];
    const state = engine.createState({
        gameId,
        challengeId: pack.challenges[0].id,
        difficulty: 'gentle',
        mode: 'solo',
        creatorUsername: 'producer_creator',
        serverStartedAtMs: Date.parse('2026-08-17T11:59:00.000Z'),
        serverDateKey: '2026-08-17',
        contentPack: pack
    });
    const run = gameRun(gameId, {
        contentSnapshot: pack,
        contentHash: hash(pack),
        state,
        resumed: false
    });
    let resumeWrites = 0;
    const repository = {
        async listHistory() { return [{ id: run.id, status: run.status }]; },
        async withTransaction(work) { return work({}); },
        async readRunIdentity() {
            return { id: run.id, game_id: gameId, mode: 'solo', status: 'active',
                creator_user_id: run.creatorUserId, creator_username: run.creatorUsername,
                owner_user_id: null, owner_username: null, live_interaction_id: null };
        },
        async lockAccounts() {
            return new Map([[run.creatorUsername, { id: run.creatorUserId,
                username: run.creatorUsername, authorized: true, deactivated: false,
                account_locked: false }]]);
        },
        async lockRun() { return { run, actorRole: 'creator', actorUserId: run.creatorUserId }; },
        async markRunResumed(client, lockedRun, actorUserId, stateHash) {
            resumeWrites += 1;
            assert.equal(lockedRun, run);
            assert.equal(actorUserId, run.creatorUserId);
            assert.equal(stateHash, hash(run.state));
            return true;
        }
    };
    const achievements = [];
    const service = new StreamerGameService({
        repository,
        achievementService: { async recordTrustedEvent(client, username, event) {
            achievements.push(event);
            return { success: true };
        } },
        clock: () => new Date('2026-08-17T12:00:00.000Z')
    });
    const first = await service.state(run.creatorUsername, gameId, run.id);
    const second = await service.state(run.creatorUsername, gameId, run.id);
    assert.equal(first.run.resumed, true);
    assert.equal(second.run.resumed, true);
    assert.equal(resumeWrites, 1);
    await service.recordCompletionAchievements({}, run, {
        challengeId: state.challengeId,
        score: 100,
        status: 'completed'
    });
    assert.equal(achievements[0].payload.resumed, true);
});

function questService(runtime, { achievementEvents = [], rewardIntents = [] } = {}) {
    const client = { async query() { return { rows: [], rowCount: 0 }; }, release() {} };
    return { client, achievementEvents, rewardIntents, service: new QuestV2Service({
        pool: { async connect() { return client; } },
        BalanceLogger: { async updateBalance() { return { success: true, balance: 100 }; } },
        catalogRepositoryFactory: () => ({}),
        runtimeRepositoryFactory: () => runtime,
        achievementService: { async recordTrustedEvent(transactionClient, username, event) {
            achievementEvents.push({ client: transactionClient, username, event: structuredClone(event) });
            return { success: true };
        } },
        rewardGrantIntentWriter: { async enqueue(transactionClient, intent) {
            rewardIntents.push({ client: transactionClient, intent: structuredClone(intent) });
            return { inserted: true };
        } },
        ownerUsername: 'quest_owner',
        clock: () => new Date('2026-08-17T12:00:00.000Z')
    }) };
}

function questAssignment(overrides = {}) {
    return {
        id: 41,
        user_id: 91,
        username: 'quest_creator',
        slug: 'producer-quest',
        category: 'story',
        verification_mode: 'manual',
        reward_points: 0,
        board_id: 3,
        chain_id: null,
        chain_node_key: '',
        revision: 7,
        ...overrides
    };
}

test('Quest assignment and completed-chain helpers emit strict events and one source-side reward intent', async () => {
    const runtime = {
        async recordChainCompletion() {
            return {
                id: '10000000-0000-4000-a000-000000000001',
                chain_slug: 'quiet-orbit-chain',
                source_event_id: 'quest-chain:91:12',
                trigger_assignment_id: 41,
                created_at: '2026-08-17T12:00:00.000Z'
            };
        }
    };
    const fixture = questService(runtime);
    const assignment = questAssignment({ chain_id: 12, chain_node_key: 'quiet-orbit-chain:3' });
    await fixture.service.emitAssignmentCompletedAchievement(fixture.client, assignment, {
        username: assignment.username,
        sourceEventId: 'achievement-quest-review:41:8',
        verification: 'manual',
        resubmitted: true,
        occurredAt: '2026-08-17T12:00:00.000Z'
    });
    await fixture.service.emitChainCompletedAchievement(
        fixture.client, runtime, assignment, assignment.username, { requestId: 'quest-chain-producer' }
    );
    assert.deepEqual(fixture.achievementEvents.map(row => row.event.eventType), [
        'quest.assignment.completed', 'quest.chain.completed'
    ]);
    assert.equal(fixture.achievementEvents[0].event.payload.resubmitted, true);
    assert.deepEqual(fixture.achievementEvents[1].event.payload, {
        chain: 'quiet-orbit-chain', assignmentId: 41
    });
    assert.equal(fixture.rewardIntents.length, 1);
    assert.equal(fixture.rewardIntents[0].client, fixture.client);
    assert.equal(fixture.rewardIntents[0].intent.sourceType, 'quest');
    assert.equal(fixture.rewardIntents[0].intent.catalogSlug, 'quiet-orbit-frame');
    runtime.recordChainCompletion = async () => null;
    await fixture.service.emitChainCompletedAchievement(
        fixture.client, runtime, assignment, assignment.username, { requestId: 'quest-chain-replay' }
    );
    assert.equal(fixture.achievementEvents.length, 2);
    assert.equal(fixture.rewardIntents.length, 1);
});

test('Quest decline and postpone operations produce trusted achievement events in their state transaction', async () => {
    const assignment = questAssignment({ status: 'offered', due_at: '2026-08-20T12:00:00.000Z',
        postpone_policy: { allowed: true, maxHours: 72 }, postponed_hours: 0 });
    const runtime = {
        client: null,
        async lockCreator() { return { id: assignment.user_id }; },
        async lockAssignment() { return assignment; },
        async transitionAssignment() { return { ...assignment, status: 'declined', revision: 8 }; },
        async postponeAssignment() { return { ...assignment, revision: 8,
            due_at: '2026-08-21T12:00:00.000Z', postpone_until: '2026-08-21T12:00:00.000Z',
            postponed_hours: 24 }; },
        async insertAssignmentEvent() {},
        async insertAudit() {}
    };
    const fixture = questService(runtime);
    runtime.client = fixture.client;
    await fixture.service.transition(assignment.username,
        { assignmentId: assignment.id, expectedRevision: 7 }, 'decline');
    assignment.status = 'active';
    await fixture.service.postpone(assignment.username,
        { assignmentId: assignment.id, expectedRevision: 7, hours: 24 });
    assert.deepEqual(fixture.achievementEvents.map(row => row.event.eventType), [
        'quest.assignment.declined', 'quest.assignment.postponed'
    ]);
    assert.ok(fixture.achievementEvents.every(row => row.client === fixture.client));
});

test('Quest retention redaction emits one trusted tombstone event per durable evidence row', async () => {
    const runtime = {
        async redactExpiredEvidenceBatch() {
            return [{ id: '20000000-0000-4000-a000-000000000001', assignment_id: 41,
                user_id: 91, username: 'quest_creator' }];
        },
        async insertAudit() {}
    };
    const fixture = questService(runtime);
    assert.equal(await fixture.service.redactExpiredEvidence(), 1);
    assert.equal(fixture.achievementEvents.length, 1);
    assert.equal(fixture.achievementEvents[0].event.eventType, 'quest.evidence.redacted');
    assert.deepEqual(fixture.achievementEvents[0].event.payload, {
        assignmentId: 41,
        evidenceId: '20000000-0000-4000-a000-000000000001'
    });
});

test('Quest appeal resolution preserves the appeal identity and produces its trusted achievement event', async () => {
    const appeal = {
        id: '30000000-0000-4000-a000-000000000001',
        assignment_id: 41,
        user_id: 91,
        username: 'quest_creator',
        status: 'pending'
    };
    const runtime = {
        async readAppealSubjectId() { return 91; },
        async lockReviewerAndSubject() {
            return {
                reviewer: { id: 7, username: 'quest_admin', is_admin: true },
                subject: { id: 91, username: 'quest_creator', is_admin: false }
            };
        },
        async lockAppeal() { return appeal; },
        async resolveAppeal() { return { ...appeal, status: 'resolved', decision: 'dismissed',
            resolution_command_id: '40000000-0000-4000-a000-000000000001' }; },
        async insertAudit() {}
    };
    const fixture = questService(runtime);
    const result = await fixture.service.resolveAppeal('quest_admin', {
        appealId: appeal.id,
        commandId: '40000000-0000-4000-a000-000000000001',
        decision: 'dismissed',
        note: 'The original evidence decision remains valid.'
    });
    assert.equal(result.status, 'resolved');
    assert.equal(fixture.achievementEvents.length, 1);
    assert.equal(fixture.achievementEvents[0].event.eventType, 'quest.appeal.resolved');
    assert.deepEqual(fixture.achievementEvents[0].event.payload, {
        assignmentId: 41,
        appealId: appeal.id
    });
});

test('Quest achievement producer schema is a forward-only append with immutable chain and appeal history', () => {
    const filename = 'add_streamer_achievement_producers.sql';
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', filename), 'utf8');
    assert.ok(MIGRATIONS.indexOf(filename)
        > MIGRATIONS.indexOf('add_streamer_reward_security_outbox.sql'));
    assert.match(sql, /CREATE TABLE quest_v2_chain_completions/);
    assert.match(sql, /UNIQUE\(user_id, chain_id\)/);
    assert.match(sql, /CREATE TABLE quest_v2_appeals/);
    assert.match(sql, /quest chain completion history is append-only/);
    assert.match(sql, /quest appeal source identity is immutable/);
    assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN)|TRUNCATE/i);
});
