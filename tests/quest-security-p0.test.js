'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    QuestV2Service,
    QuestV2ServiceError
} = require('../services/quest-v2-service');
const { MIGRATIONS } = require('../lib/database-migrations');

const MINUTE = 60 * 1000;

function uuid(number) {
    return `00000000-0000-4000-a000-${String(number).padStart(12, '0')}`;
}

function storyEvent(number, occurredAt, eventType = 'story.episode.completed') {
    const payload = eventType === 'story.choice.committed'
        ? { runId: number, contentVersion: 1, episodeSlug: 'security-window', choiceId: 'safe-choice' }
        : { runId: number, contentVersion: 1, episodeSlug: 'security-window' };
    return {
        sourceType: 'story',
        sourceEventId: `story-${eventType === 'story.choice.committed' ? 'event' : 'episode'}:security-${number}:security-window`,
        username: 'creator',
        eventType,
        occurredAt: new Date(occurredAt).toISOString(),
        payload
    };
}

function assignment(overrides = {}) {
    const now = Date.now();
    return {
        id: 11,
        user_id: 1,
        username: 'creator',
        version_id: 7,
        status: 'active',
        revision: 2,
        occurrence: 1,
        accepted_at: new Date(now - MINUTE).toISOString(),
        due_at: new Date(now + MINUTE).toISOString(),
        completed_at: null,
        resolved_at: null,
        allow_event_reuse: false,
        reward_policy_version: 1,
        reward_points: 25,
        completion_rule: {
            op: 'event_count',
            event: 'story.episode.completed',
            target: 1,
            filters: {}
        },
        slug: 'security-window-quest',
        version: 1,
        verification_mode: 'automatic',
        category: 'story',
        board_id: 1,
        chain_node_key: '',
        ...overrides
    };
}

class Runtime {
    constructor(state) {
        this.state = state;
        this.client = {};
    }

    async lockCreator(username) {
        return username === 'creator' ? { id: 1, username } : null;
    }

    async insertTrustedEvent(event) {
        const key = `${event.sourceType}:${event.dedupeKey}`;
        if (this.state.events.has(key)) return null;
        const row = {
            id: this.state.nextEventId++,
            event_id: event.eventId,
            source_type: event.sourceType,
            dedupe_key: event.dedupeKey,
            event_type: event.eventType,
            actor_user_id: event.actorUserId,
            subject_user_id: event.subjectUserId,
            occurred_at: event.occurredAt,
            correlation_id: event.correlationId,
            payload: structuredClone(event.payload),
            processing_status: 'recorded',
            result: null
        };
        this.state.events.set(key, row);
        return row;
    }

    async loadTrustedEvent(sourceType, dedupeKey) {
        return this.state.events.get(`${sourceType}:${dedupeKey}`) || null;
    }

    // This legacy method intentionally exposes the vulnerable, unbounded view.
    // The repaired service must use the assignment-scoped method below.
    async listTrustedHistory() {
        return [...this.state.events.values()].map((row) => ({
            trustedEventId: row.id,
            eventType: row.event_type,
            occurredAt: row.occurred_at,
            payload: row.payload
        }));
    }

    async listTrustedCandidates() {
        return this.state.assignments.filter((item) => item.status === 'active');
    }

    async listAssignmentTrustedHistory(assignmentId) {
        const item = this.state.assignments.find((candidate) => candidate.id === assignmentId);
        const lower = new Date(item.accepted_at).getTime();
        const due = item.due_at ? new Date(item.due_at).getTime() : Number.POSITIVE_INFINITY;
        const terminal = Math.min(
            item.completed_at ? new Date(item.completed_at).getTime() : Number.POSITIVE_INFINITY,
            item.resolved_at ? new Date(item.resolved_at).getTime() : Number.POSITIVE_INFINITY,
            Date.now()
        );
        return [...this.state.events.values()]
            .filter((row) => {
                const occurred = new Date(row.occurred_at).getTime();
                const priorConsumption = this.state.consumptions.find((entry) =>
                    entry.eventId === row.id
                    && entry.userId === item.user_id
                    && entry.versionId === item.version_id
                    && entry.assignmentId !== item.id
                );
                return occurred >= lower && occurred <= due && occurred < terminal
                    && (item.allow_event_reuse || !priorConsumption);
            })
            .map((row) => ({
                trustedEventId: row.id,
                eventType: row.event_type,
                occurredAt: row.occurred_at,
                payload: row.payload
            }));
    }

    async consumeTrustedEvents(assignmentId, trustedEventIds) {
        const item = this.state.assignments.find((candidate) => candidate.id === assignmentId);
        for (const eventId of trustedEventIds) {
            const prior = this.state.consumptions.find((entry) => entry.eventId === eventId
                && entry.userId === item.user_id && entry.versionId === item.version_id
                && entry.assignmentId !== item.id && !item.allow_event_reuse);
            if (prior) throw new Error('Trusted quest event was consumed by a previous occurrence');
            if (!this.state.consumptions.some((entry) => entry.assignmentId === item.id && entry.eventId === eventId)) {
                this.state.consumptions.push({
                    assignmentId: item.id,
                    eventId,
                    userId: item.user_id,
                    versionId: item.version_id,
                    occurrence: item.occurrence,
                    allowEventReuse: item.allow_event_reuse
                });
            }
        }
        return trustedEventIds;
    }

    async listTrustedSteps(assignmentId) {
        return [{
            id: assignmentId * 10,
            step_key: 'complete',
            status: this.state.stepStatus.get(assignmentId) || 'active',
            completion_rule: this.state.assignments.find((item) => item.id === assignmentId).completion_rule
        }];
    }

    async markTrustedStepCompleted(assignmentId) {
        this.state.stepStatus.set(assignmentId, 'completed');
    }

    async assignmentCompletionReadiness(assignmentId) {
        return this.state.stepStatus.get(assignmentId) === 'completed';
    }

    async insertSettlement(value) {
        if (this.state.settlements.some((item) => item.assignmentId === value.assignmentId)) return null;
        this.state.settlements.push(structuredClone(value));
        return { settlement_key: value.key, status: 'pending' };
    }

    async markSettlementPosted() {
        return true;
    }

    async transitionAssignment(assignmentId, revision) {
        const item = this.state.assignments.find((candidate) => candidate.id === assignmentId);
        if (!item || item.status !== 'active' || item.revision !== revision) return null;
        item.status = 'completed';
        item.revision += 1;
        item.completed_at = new Date().toISOString();
        item.resolved_at = item.completed_at;
        return item;
    }

    async insertAssignmentEvent(value) {
        this.state.assignmentEvents.push(structuredClone(value));
    }

    async insertAudit(value) {
        this.state.audits.push(structuredClone(value));
    }

    async finalizeTrustedEvent(id, result) {
        const row = [...this.state.events.values()].find((item) => item.id === id);
        row.processing_status = result.matches.length ? 'processed' : 'ignored';
        row.result = structuredClone(result);
    }
}

function fixture(assignments, { clock } = {}) {
    const state = {
        assignments: assignments.map((item) => ({ ...item })),
        events: new Map(),
        nextEventId: 1,
        consumptions: [],
        settlements: [],
        stepStatus: new Map(),
        assignmentEvents: [],
        audits: [],
        ledger: []
    };
    const runtime = new Runtime(state);
    const service = new QuestV2Service({
        pool: { connect() { throw new Error('transaction wrapper is not used by this fixture'); } },
        BalanceLogger: {
            async updateBalance(input) {
                state.ledger.push({ username: input.username, amount: input.amount, requestId: input.requestId });
                return { success: true, balanceBefore: 100, balance: 100 + input.amount };
            }
        },
        catalogRepositoryFactory: () => ({}),
        runtimeRepositoryFactory: () => runtime,
        clock
    });
    return { service, state, runtime };
}

test('trusted event one millisecond before acceptance cannot advance or settle an assignment', async () => {
    const acceptedAt = Date.now() - 1000;
    const { service, state } = fixture([assignment({ accepted_at: new Date(acceptedAt).toISOString() })]);
    const result = await service.recordInternalTrustedEvent({}, storyEvent(1, acceptedAt - 1));
    assert.deepEqual(result.matches, []);
    assert.equal(state.assignments[0].status, 'active');
    assert.equal(state.settlements.length, 0);
    assert.equal(state.ledger.length, 0);
});

test('post-acceptance event counts once and settlement metadata remains transaction-bound', async () => {
    const acceptedAt = Date.now() - 1000;
    const { service, state } = fixture([assignment({ accepted_at: new Date(acceptedAt).toISOString() })]);
    const result = await service.recordInternalTrustedEvent({}, storyEvent(2, acceptedAt + 1), {
        requestId: 'trusted-window-request-0002'
    });
    assert.equal(result.matches.length, 1);
    assert.equal(state.assignments[0].status, 'completed');
    assert.equal(state.settlements.length, 1);
    assert.deepEqual(state.ledger, [{
        username: 'creator', amount: 25, requestId: 'trusted-window-request-0002'
    }]);
    assert.equal(state.audits[0].details.trustedEventId, result.eventId);
});

test('events after due_at or an existing terminal boundary cannot complete an assignment', async () => {
    const acceptedAt = Date.now() - 5000;
    const dueAt = acceptedAt + 1000;
    const terminalAt = acceptedAt + 2000;
    for (const cutoff of [
        { due_at: new Date(dueAt).toISOString(), occurredAt: dueAt + 1 },
        {
            due_at: null,
            completed_at: new Date(terminalAt).toISOString(),
            resolved_at: new Date(terminalAt).toISOString(),
            occurredAt: terminalAt
        }
    ]) {
        const { occurredAt, ...overrides } = cutoff;
        const { service, state } = fixture([assignment({
            accepted_at: new Date(acceptedAt).toISOString(),
            ...overrides
        })]);
        const result = await service.recordInternalTrustedEvent({}, storyEvent(3, occurredAt));
        assert.deepEqual(result.matches, []);
        assert.equal(state.settlements.length, 0);
    }
});

test('previous occurrence consumption is excluded unless immutable version explicitly opts in', async () => {
    const acceptedAt = Date.now() - 5000;
    for (const allowEventReuse of [false, true]) {
        const current = assignment({
            id: allowEventReuse ? 22 : 21,
            occurrence: 2,
            accepted_at: new Date(acceptedAt).toISOString(),
            allow_event_reuse: allowEventReuse
        });
        const { service, state } = fixture([current]);
        const prior = {
            id: 90,
            event_id: uuid(90),
            source_type: 'story',
            dedupe_key: 'prior-occurrence-event',
            event_type: 'story.episode.completed',
            actor_user_id: 1,
            subject_user_id: 1,
            occurred_at: new Date(acceptedAt + 1000).toISOString(),
            correlation_id: uuid(91),
            payload: { runId: 90, contentVersion: 1, episodeSlug: 'security-window' },
            processing_status: 'processed',
            result: { enabled: true, matches: [] }
        };
        state.events.set('story:prior-occurrence-event', prior);
        state.consumptions.push({ assignmentId: 20, eventId: 90, userId: 1, versionId: 7,
            occurrence: 1, allowEventReuse: false });
        const result = await service.recordInternalTrustedEvent({}, storyEvent(
            allowEventReuse ? 5 : 4,
            acceptedAt + 2000,
            'story.choice.committed'
        ));
        assert.equal(result.matches.length, allowEventReuse ? 1 : 0);
        assert.equal(state.assignments[0].status, allowEventReuse ? 'completed' : 'active');
    }
});

test('trusted producers cannot submit timestamps beyond the bounded source-clock skew', async () => {
    const serverNow = Date.parse('2026-08-17T12:00:00.000Z');
    const { service, state } = fixture([assignment()], {
        clock: () => new Date(serverNow)
    });
    await assert.rejects(
        service.recordInternalTrustedEvent({}, storyEvent(6, serverNow + 5 * MINUTE + 1)),
        (error) => error instanceof QuestV2ServiceError && error.code === 'TRUSTED_EVENT_FUTURE_TIMESTAMP'
    );
    assert.equal(state.events.size, 0);
    assert.equal(state.settlements.length, 0);
});

test('exact trusted-event replay returns its durable result without a second ledger post', async () => {
    const acceptedAt = Date.now() - 1000;
    const { service, state } = fixture([assignment({ accepted_at: new Date(acceptedAt).toISOString() })]);
    const event = storyEvent(7, acceptedAt + 1);
    const first = await service.recordInternalTrustedEvent({}, event, { requestId: 'lost-response-request' });
    const replay = await service.recordInternalTrustedEvent({}, structuredClone(event), {
        requestId: 'lost-response-request'
    });
    assert.deepEqual(replay, first);
    assert.equal(state.settlements.length, 1);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.assignmentEvents.length, 1);
});

test('a consumption collision fails closed before step completion or settlement', async () => {
    const acceptedAt = Date.now() - 1000;
    const { service, state, runtime } = fixture([
        assignment({ accepted_at: new Date(acceptedAt).toISOString() })
    ]);
    runtime.consumeTrustedEvents = async () => [];
    await assert.rejects(
        service.recordInternalTrustedEvent({}, storyEvent(8, acceptedAt + 1)),
        /consumption raced/
    );
    assert.equal(state.stepStatus.size, 0);
    assert.equal(state.settlements.length, 0);
    assert.equal(state.ledger.length, 0);
});

test('forward migration registers immutable per-occurrence consumption without rewriting history', () => {
    const filename = 'add_streamer_security_quest_windows.sql';
    assert.equal(MIGRATIONS.includes(filename), true);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', filename), 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS allow_event_reuse BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS quest_v2_assignment_event_consumptions/);
    assert.match(sql, /uq_quest_v2_consumption_exclusive_occurrence/);
    assert.match(sql, /quest_v2_consumptions_append_only/);
    assert.match(sql, /WITH eligible AS/);
});
