'use strict';

const assert = require('node:assert/strict');
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

function stateWithAssignment(progress = 2) {
    const questDefinition = definition();
    return {
        definitions: [questDefinition],
        assignments: [{
            id: 10,
            username: 'hokboost',
            definition_id: 1,
            status: 'active',
            progress_value: progress,
            target_value: 3,
            reward_points: 1200,
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
    assert.throws(() => validateObjective({ ...objective, target: 0 }, 1), /target/);
    assert.throws(() => validateObjective({ ...objective, script: 'return true' }, 1), /type/);
    assert.throws(() => validateProgressEvent({ ...progressEvent(), payload: { ...progressEvent().payload, trustedReward: 999999 } }), /payload/);
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
