'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { evaluateObjective, validateObjective, validateProgressEvent } = require('../domain/quests/objectives');
const { QuestService } = require('../domain/quests/service');

const root = path.resolve(__dirname, '..');
const source = (filename) => fs.readFileSync(path.join(root, filename), 'utf8');

function definition() {
    return {
        id: 1,
        slug: 'star-archive-three-chapters',
        version: 1,
        title_zh: '星图远征：连续通关三章',
        title_en: 'Star Map Expedition: Clear Three Chapters',
        description_zh: '通关三章',
        description_en: 'Clear three chapters',
        verification_mode: 'automatic',
        objective_version: 1,
        objective: {
            type: 'event_count',
            event: 'adventure.chapter.completed',
            target: 3,
            filters: { campaignId: 'star-archive-v1' }
        },
        reward_points: 1200
    };
}

function progressEvent(id = 33, chapterId = 'clockwork-library') {
    return {
        sourceType: 'adventure',
        sourceEventId: `adventure-completion:${id}`,
        username: 'hokboost',
        eventType: 'adventure.chapter.completed',
        eventVersion: 1,
        occurredAt: '2026-08-16T12:00:00.000Z',
        payload: {
            campaignId: 'star-archive-v1',
            chapterId,
            runId: '84d58aa4-bfe6-48a4-9f71-48e39b686c73',
            completionId: id
        }
    };
}

function quizDefinition() {
    return {
        ...definition(),
        id: 2,
        slug: 'quiz-three-strong-rounds',
        reward_points: 600,
        objective: {
            type: 'event_count',
            event: 'quiz.round.completed',
            target: 3,
            filters: { minimumCorrect: 8 }
        }
    };
}

function quizProgressEvent(id = 71, correct = 8) {
    return {
        sourceType: 'quiz',
        sourceEventId: `quiz-submission:${id}`,
        username: 'hokboost',
        eventType: 'quiz.round.completed',
        eventVersion: 1,
        occurredAt: '2026-08-16T12:30:00.000Z',
        payload: {
            submissionId: id,
            sessionId: '0123456789abcdef0123456789abcdef',
            correct,
            total: 10
        }
    };
}

function doudizhuDefinition() {
    return {
        ...definition(),
        id: 3,
        slug: 'doudizhu-first-win',
        reward_points: 500,
        objective: {
            type: 'event_threshold',
            event: 'doudizhu.match.won',
            field: 'scoreDelta',
            operator: '>=',
            value: 1
        }
    };
}

function doudizhuProgressEvent(scoreDelta = 6) {
    const gameId = '3bc697b1-f256-43a7-a62a-930f6f7fc329';
    return {
        sourceType: 'doudizhu',
        sourceEventId: `doudizhu-game:${gameId}`,
        username: 'hokboost',
        eventType: 'doudizhu.match.won',
        eventVersion: 1,
        occurredAt: '2026-08-16T12:45:00.000Z',
        payload: {
            gameId,
            rulesVersion: 'classic-jj-v1',
            humanRole: 'farmer',
            scoreDelta,
            baseScore: 3,
            multiplier: 2
        }
    };
}

class MemoryRepository {
    constructor(state) {
        this.state = state;
    }

    async listPublishedDefinitions() { return this.state.definitions; }

    async createAssignment(username, questDefinition, target) {
        const existing = this.state.assignments.find((row) => row.username === username && row.definition_id === questDefinition.id);
        if (existing) return null;
        const row = {
            id: this.state.nextAssignmentId++,
            username,
            definition_id: questDefinition.id,
            status: 'active',
            progress_value: 0,
            target_value: target,
            reward_points: questDefinition.reward_points,
            revision: 0,
            objective_version: questDefinition.objective_version,
            objective_snapshot: structuredClone(questDefinition.objective),
            slug: questDefinition.slug,
            version: questDefinition.version,
            verification_mode: questDefinition.verification_mode
        };
        this.state.assignments.push(row);
        return row;
    }

    async insertProgressEvent(event) {
        const key = `${event.sourceType}:${event.sourceEventId}`;
        const existing = this.state.events.get(key);
        if (existing) {
            if (!existing.result) await existing.done;
            return null;
        }
        let resolveDone;
        const done = new Promise((resolve) => { resolveDone = resolve; });
        const row = {
            id: this.state.nextEventId++,
            source_type: event.sourceType,
            source_event_id: event.sourceEventId,
            username: event.username,
            event_type: event.eventType,
            event_version: event.eventVersion,
            occurred_at: event.occurredAt,
            payload: structuredClone(event.payload),
            result: null,
            done,
            resolveDone
        };
        this.state.events.set(key, row);
        return row;
    }

    async loadProgressEvent(sourceType, sourceEventId) {
        return this.state.events.get(`${sourceType}:${sourceEventId}`) || null;
    }

    async listCandidateAssignments(username, eventType) {
        return this.state.assignments.filter((row) => row.username === username
            && row.status === 'active' && row.objective_snapshot.event === eventType);
    }

    async updateProgress(id, revision, progress) {
        if (this.state.failProgressUpdate) return null;
        const row = this.state.assignments.find((entry) => entry.id === id && entry.status === 'active' && entry.revision === revision);
        if (!row) return null;
        row.progress_value = progress;
        row.revision += 1;
        return { revision: row.revision };
    }

    async insertRewardPosting(posting) {
        if (this.state.postings.some((row) => row.assignmentId === posting.assignmentId)) return null;
        this.state.postings.push({ ...posting, status: 'pending' });
        return { posting_id: posting.postingId };
    }

    async markPostingPosted(postingId, balanceBefore, balanceAfter) {
        const row = this.state.postings.find((entry) => entry.postingId === postingId);
        row.status = 'posted';
        row.balanceBefore = balanceBefore;
        row.balanceAfter = balanceAfter;
    }

    async completeAssignment(id, revision, progress, postingId) {
        const row = this.state.assignments.find((entry) => entry.id === id && entry.status === 'active' && entry.revision === revision);
        if (!row) throw new Error('Quest assignment completion raced');
        row.status = 'completed';
        row.progress_value = progress;
        row.reward_posting_id = postingId;
        row.revision += 1;
        return { revision: row.revision };
    }

    async insertAudit(entry) { this.state.audit.push(structuredClone(entry)); }

    async finalizeProgressEvent(id, status, result) {
        const row = [...this.state.events.values()].find((entry) => entry.id === Number(id));
        row.processing_status = status;
        row.result = structuredClone(result);
        row.resolveDone();
    }

    async listUserAssignments(username) {
        return this.state.assignments.filter((row) => row.username === username).map((row) => ({
            ...row,
            ...definition(),
            id: row.id,
            status: row.status,
            progress_value: row.progress_value,
            target_value: row.target_value,
            reward_points: row.reward_points,
            reward_posting_id: row.reward_posting_id
        }));
    }
}

function stateWithAssignment(progress = 2, questDefinition = definition()) {
    const normalizedObjective = validateObjective(questDefinition.objective, Number(questDefinition.objective_version));
    return {
        definitions: [questDefinition],
        assignments: [{
            id: 10,
            username: 'hokboost',
            definition_id: questDefinition.id,
            status: 'active',
            progress_value: progress,
            target_value: normalizedObjective.target,
            reward_points: questDefinition.reward_points,
            revision: progress,
            objective_version: 1,
            objective_snapshot: structuredClone(questDefinition.objective),
            slug: questDefinition.slug,
            version: 1,
            verification_mode: 'automatic'
        }],
        events: new Map(),
        postings: [],
        audit: [],
        ledger: [],
        balance: 500,
        nextAssignmentId: 20,
        nextEventId: 30
    };
}

function serviceFor(state, { failLedger = false } = {}) {
    const repository = new MemoryRepository(state);
    const BalanceLogger = {
        async updateBalance(options) {
            if (failLedger) return { success: false, message: 'injected failure' };
            assert.equal(options.managedTransaction, true);
            assert.equal(options.operationType, 'quest_auto_reward');
            const before = state.balance;
            state.balance += options.amount;
            state.ledger.push({ amount: options.amount, operationType: options.operationType, gameData: options.gameData });
            return { success: true, balanceBefore: before, balance: state.balance };
        }
    };
    return new QuestService({ BalanceLogger, repositoryFactory: () => repository });
}

test('objective schema is versioned, allowlisted, and evaluates only matching adventure completions', () => {
    const objective = validateObjective(definition().objective, 1);
    assert.deepEqual(evaluateObjective(objective, progressEvent()), { matched: true, increment: 1, target: 3 });
    assert.equal(evaluateObjective(objective, {
        ...progressEvent(),
        payload: { ...progressEvent().payload, campaignId: 'another-campaign' }
    }).matched, false);
    assert.throws(() => validateObjective({ ...objective, target: 0 }, 1), /objective/);
    assert.throws(() => validateObjective({ ...objective, script: 'return true' }, 1), /objective/);
    assert.throws(() => validateProgressEvent({ ...progressEvent(), payload: { ...progressEvent().payload, trustedReward: 999999 } }), /payload/);
});

test('quiz completion contract validates trusted settlement data and applies the score filter', () => {
    const objective = validateObjective(quizDefinition().objective, 1);
    const qualifying = validateProgressEvent(quizProgressEvent(71, 8));
    const lowScore = validateProgressEvent(quizProgressEvent(72, 7));
    assert.deepEqual(evaluateObjective(objective, qualifying), { matched: true, increment: 1, target: 3 });
    assert.deepEqual(evaluateObjective(objective, lowScore), { matched: false, increment: 0, target: 3 });
    assert.throws(() => validateProgressEvent({
        ...quizProgressEvent(),
        payload: { ...quizProgressEvent().payload, reward: 999999 }
    }), /quiz quest event payload/);
    assert.throws(() => validateProgressEvent({
        ...quizProgressEvent(),
        sourceEventId: 'adventure-completion:71'
    }), /Unsupported quest progress event/);
});

test('doudizhu win contract uses a fixed scoreDelta threshold and rejects client-shaped results', () => {
    const objective = validateObjective(doudizhuDefinition().objective, 1);
    const event = validateProgressEvent(doudizhuProgressEvent());
    assert.deepEqual(evaluateObjective(objective, event), { matched: true, increment: 1, target: 1 });
    assert.throws(() => validateObjective({ ...doudizhuDefinition().objective, field: 'balance' }, 1), /threshold/);
    assert.throws(() => validateProgressEvent(doudizhuProgressEvent(-1)), /doudizhu quest event payload/);
    assert.throws(() => validateProgressEvent({
        ...doudizhuProgressEvent(),
        sourceEventId: 'doudizhu-game:not-a-uuid'
    }), /Unsupported quest progress event/);
});

test('pilot assignment is reachable, snapshots the published version, and projects real progress', async () => {
    const state = stateWithAssignment();
    state.assignments = [];
    const service = serviceFor(state);
    assert.deepEqual(await service.ensurePilotAssignments({}, 'hokboost', true), [20]);
    assert.equal(state.assignments[0].reward_points, 1200);
    assert.deepEqual(state.assignments[0].objective_snapshot, definition().objective);
    const quests = await service.listUserQuests({}, 'hokboost', 'zh', true);
    assert.equal(quests[0].progress, 0);
    assert.equal(quests[0].target, 3);
    assert.equal(quests[0].definitionVersion, 1);
});

test('concurrent duplicate event calls replay one durable result and post one reward', async () => {
    const state = stateWithAssignment(2);
    const service = serviceFor(state);
    const event = progressEvent();
    const [first, replay] = await Promise.all([
        service.recordProgressEvent({}, event, { requestId: 'req-1' }),
        service.recordProgressEvent({}, structuredClone(event), { requestId: 'req-1' })
    ]);
    assert.deepEqual(replay, first);
    assert.equal(first.rewardEarned, 1200);
    assert.equal(state.balance, 1700);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.postings.length, 1);
    assert.equal(state.audit.filter((row) => row.action === 'automatic_completion_rewarded').length, 1);
    assert.equal(state.assignments[0].status, 'completed');
    assert.ok([...state.events.values()][0].result);
});

test('concurrent duplicate quiz settlements advance once and replay the durable reward response', async () => {
    const questDefinition = quizDefinition();
    const state = stateWithAssignment(2, questDefinition);
    const service = serviceFor(state);
    const event = quizProgressEvent();
    const [first, replay] = await Promise.all([
        service.recordProgressEvent({}, event, { requestId: 'quiz-request' }),
        service.recordProgressEvent({}, structuredClone(event), { requestId: 'quiz-request' })
    ]);
    assert.deepEqual(replay, first);
    assert.equal(first.rewardEarned, 600);
    assert.equal(state.balance, 1100);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.postings.length, 1);
    assert.equal(state.assignments[0].status, 'completed');
});

test('a server-authoritative doudizhu win completes once with its snapshotted reward', async () => {
    const state = stateWithAssignment(0, doudizhuDefinition());
    const service = serviceFor(state);
    const first = await service.recordProgressEvent({}, doudizhuProgressEvent(), { requestId: 'ddz-request' });
    const replay = await service.recordProgressEvent({}, doudizhuProgressEvent(), { requestId: 'ddz-request' });
    assert.deepEqual(replay, first);
    assert.equal(first.rewardEarned, 500);
    assert.equal(state.balance, 1000);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.assignments[0].status, 'completed');
    assert.equal(state.postings[0].postingId, 'quest:10:completion:1');
});

test('duplicate source identity with changed payload fails closed', async () => {
    const state = stateWithAssignment(0);
    const service = serviceFor(state);
    await service.recordProgressEvent({}, progressEvent(40));
    await assert.rejects(
        service.recordProgressEvent({}, progressEvent(40, 'mirror-hall')),
        /identity collision/
    );
    assert.equal(state.assignments[0].progress_value, 1);
});

test('ledger failure rolls the event, posting, audit, assignment, and balance back together', async () => {
    const durable = stateWithAssignment(2);
    const draft = structuredClone(durable);
    draft.events = new Map();
    const service = serviceFor(draft, { failLedger: true });
    await assert.rejects(service.recordProgressEvent({}, progressEvent(51)), /ledger update failed/);
    // The caller owns the transaction: discarding the failed draft models ROLLBACK.
    assert.equal(durable.balance, 500);
    assert.equal(durable.assignments[0].status, 'active');
    assert.equal(durable.assignments[0].progress_value, 2);
    assert.equal(durable.postings.length, 0);
    assert.equal(durable.audit.length, 0);
    assert.equal(durable.events.size, 0);
});

test('assignment CAS failure is surfaced so the caller transaction can roll back the event', async () => {
    const durable = stateWithAssignment(0, quizDefinition());
    const draft = structuredClone(durable);
    draft.events = new Map();
    draft.failProgressUpdate = true;
    const service = serviceFor(draft);
    await assert.rejects(service.recordProgressEvent({}, quizProgressEvent(91)), /progress raced/);
    assert.equal(durable.assignments[0].progress_value, 0);
    assert.equal(durable.balance, 500);
    assert.equal(durable.events.size, 0);
    assert.equal(durable.audit.length, 0);
    assert.equal(durable.ledger.length, 0);
});

test('migration and adventure transaction enforce immutable versions, dedupe, row locks, and atomic ordering', () => {
    const migration = source('migrations/add_quest_v2_foundation.sql');
    const adventure = source('routes/adventure.js');
    const action = adventure.slice(adventure.indexOf("app.post('/api/adventure/action'"));
    const repository = source('domain/quests/postgres-repository.js');
    assert.match(migration, /UNIQUE \(slug, version\)/);
    assert.match(migration, /published quest definitions are immutable; publish a new version/);
    assert.match(migration, /UNIQUE \(source_type, source_event_id\)/);
    assert.match(migration, /quest progress events cannot be deleted/);
    assert.match(migration, /quest progress event transition is invalid/);
    assert.match(migration, /assignment_id BIGINT NOT NULL UNIQUE/);
    assert.match(migration, /quest reward postings cannot be deleted/);
    assert.match(migration, /quest reward posting transition is invalid/);
    assert.match(migration, /quest_assignments_reward_posting_fk/);
    assert.match(migration, /quest_audit_log_append_only/);
    assert.match(repository, /FOR UPDATE OF a/);
    assert.match(repository, /ON CONFLICT \(source_type, source_event_id\) DO NOTHING/);
    assert.ok(action.indexOf('INSERT INTO adventure_completions') < action.indexOf('questService.recordProgressEvent'));
    assert.ok(action.indexOf('questService.recordProgressEvent') < action.indexOf('finalizeIdempotency'));
    assert.ok(action.indexOf('finalizeIdempotency') < action.indexOf("client.query('COMMIT')"));
});

test('Phase 2 uses an append-only migration and hooks authoritative game settlements before idempotency finalization', () => {
    const foundation = source('migrations/add_quest_v2_foundation.sql');
    const extension = source('migrations/extend_quest_v2_game_events.sql');
    const migrations = source('lib/database-migrations.js');
    const quiz = source('routes/games.js').slice(source('routes/games.js').indexOf("app.post('/api/quiz/submit'"));
    const doudizhu = source('routes/doudizhu.js').slice(source('routes/doudizhu.js').indexOf("app.post('/api/doudizhu/action'"));
    assert.equal(
        crypto.createHash('sha256').update(foundation).digest('hex'),
        '3da26508d97380d97e6895f8bdca30cf1d90c5e36c732a82be1535cd533f9e24'
    );
    assert.match(migrations, /'add_quest_v2_foundation\.sql',\s*'extend_quest_v2_game_events\.sql'/);
    assert.match(extension, /conname = 'quest_definitions_objective_check'/);
    assert.match(extension, /DROP CONSTRAINT quest_definitions_objective_check/);
    assert.match(extension, /ADD CONSTRAINT quest_definitions_objective_v1_check/);
    assert.match(extension, /NOT VALID/);
    assert.match(extension, /VALIDATE CONSTRAINT quest_definitions_objective_v1_check/);
    assert.match(extension, /'quiz-three-strong-rounds', 1, 'published'/);
    assert.match(extension, /'doudizhu-first-win', 1, 'published'/);
    assert.match(extension, /Quiz Quest v1 conflicts with an existing definition/);
    assert.match(extension, /Dou Dizhu Quest v1 conflicts with an existing definition/);
    assert.ok(quiz.indexOf('UPDATE quiz_sessions SET status = \'settled\'') < quiz.indexOf('questService.recordProgressEvent'));
    assert.ok(quiz.indexOf('questService.recordProgressEvent') < quiz.indexOf('finalizeIdempotency'));
    assert.ok(quiz.indexOf('finalizeIdempotency') < quiz.indexOf("client.query('COMMIT')"));
    assert.match(doudizhu, /fields\.status === 'finished' && fields\.outcome === 'win'/);
    assert.ok(doudizhu.indexOf('UPDATE doudizhu_games') < doudizhu.indexOf('questService.recordProgressEvent'));
    assert.ok(doudizhu.indexOf('questService.recordProgressEvent') < doudizhu.indexOf('finalizeIdempotency'));
    assert.ok(doudizhu.indexOf('finalizeIdempotency') < doudizhu.indexOf("client.query('COMMIT')"));
});

test('legacy task-card routes and response fields remain backward compatible', () => {
    const tasks = source('routes/tasks.js');
    for (const route of [
        '/api/tasks/claim', '/api/tasks/action', '/api/tasks/event-complete',
        '/api/admin/tasks/assign-offers', '/api/admin/tasks/assign-event', '/api/admin/tasks/review'
    ]) assert.match(tasks, new RegExp(route.replaceAll('/', '\\/')));
    assert.match(tasks, /cards: isEnabled\(username\) \? mappedCards : \[\]/);
    assert.match(tasks, /eventTasks: events\.rows\.map\(mapEvent\)/);
    assert.match(tasks, /quests/);
    assert.match(source('public/js/task-cards.js'), /quest\.progress/);
});
