'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { QuestV2Service } = require('../services/quest-v2-service');
const { StoryWorldService } = require('../services/story-world-service');
const { LiveInteractionService } = require('../services/live-interaction-service');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { CreatorRepository } = require('../repositories/creator-repository');
const { StreamerGameRepository } = require('../repositories/streamer-game-repository');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');

const uuid = number => `00000000-0000-4000-a000-${String(number).padStart(12, '0')}`;

function transactionalPool(state = {}) {
    const trace = [];
    let connections = 0;
    let releases = 0;
    let active = 0;
    let peak = 0;
    return {
        state,
        trace,
        get connections() {
            return connections;
        },
        get releases() {
            return releases;
        },
        get peak() {
            return peak;
        },
        async query() {
            return { rows: [] };
        },
        async connect() {
            connections += 1;
            active += 1;
            peak = Math.max(peak, active);
            const snapshot = structuredClone(state);
            let inTransaction = false;
            return {
                state,
                async query(sql) {
                    const statement = String(sql).trim();
                    trace.push(statement);
                    if (statement === 'BEGIN') {
                        inTransaction = true;
                        return { rows: [] };
                    }
                    if (statement === 'COMMIT') {
                        inTransaction = false;
                        return { rows: [] };
                    }
                    if (statement === 'ROLLBACK') {
                        for (const key of Object.keys(state)) delete state[key];
                        Object.assign(state, structuredClone(snapshot));
                        inTransaction = false;
                        return { rows: [] };
                    }
                    return { rows: [] };
                },
                release() {
                    assert.equal(inTransaction, false, 'connection released with open transaction');
                    releases += 1;
                    active -= 1;
                }
            };
        }
    };
}

function repositoryFactories(initialState) {
    const definitions = [
        ['creator', CreatorRepository],
        ['live', LiveInteractionRepository],
        ['streamer-game', StreamerGameRepository],
        ['reward', RewardCatalogRepository]
    ];
    return definitions.map(([name, Repository]) => {
        const pool = transactionalPool(structuredClone(initialState));
        return [name, new Repository({ pool }), pool];
    });
}

test('four expansion repositories commit successful work before release', async () => {
    for (const [name, repository, pool] of repositoryFactories({ count: 0 })) {
        const result = await repository.withTransaction(async client => {
            client.state.count += 1;
            return `${name}-committed`;
        });
        assert.equal(result, `${name}-committed`);
        assert.equal(pool.state.count, 1);
        assert.deepEqual(pool.trace, ['BEGIN', 'COMMIT']);
        assert.equal(pool.connections, 1);
        assert.equal(pool.releases, 1);
    }
});

test('four expansion repositories roll back business mutation on failure', async () => {
    for (const [name, repository, pool] of repositoryFactories({ count: 7, rows: ['stable'] })) {
        await assert.rejects(repository.withTransaction(async client => {
            client.state.count = 999;
            client.state.rows.push('partial');
            throw new Error(`${name}-failure`);
        }), new RegExp(`${name}-failure`));
        assert.deepEqual(pool.state, { count: 7, rows: ['stable'] });
        assert.deepEqual(pool.trace, ['BEGIN', 'ROLLBACK']);
        assert.equal(pool.connections, 1);
        assert.equal(pool.releases, 1);
    }
});

test('four expansion repositories release every connection under parallel successful load', async () => {
    for (const [name, repository, pool] of repositoryFactories({ completed: [] })) {
        const results = await Promise.all(Array.from({ length: 80 }, (_, index) => repository.withTransaction(async client => {
            await Promise.resolve();
            client.state.completed.push(index);
            return index;
        })));
        assert.equal(results.length, 80, name);
        assert.equal(new Set(results).size, 80, name);
        assert.equal(pool.connections, 80, name);
        assert.equal(pool.releases, 80, name);
        assert.equal(pool.trace.filter(entry => entry === 'BEGIN').length, 80, name);
        assert.equal(pool.trace.filter(entry => entry === 'COMMIT').length, 80, name);
        assert.equal(pool.trace.includes('ROLLBACK'), false, name);
    }
});

test('four expansion repositories release every connection under mixed failure load', async () => {
    for (const [name, repository, pool] of repositoryFactories({ attempts: 0 })) {
        const settled = await Promise.allSettled(Array.from({ length: 60 }, (_, index) => repository.withTransaction(async client => {
            client.state.attempts += 1;
            if (index % 3 === 0) throw new Error(`failure-${index}`);
            return index;
        })));
        assert.equal(settled.filter(item => item.status === 'fulfilled').length, 40, name);
        assert.equal(settled.filter(item => item.status === 'rejected').length, 20, name);
        assert.equal(pool.connections, 60, name);
        assert.equal(pool.releases, 60, name);
        assert.equal(pool.trace.filter(entry => entry === 'ROLLBACK').length, 20, name);
        assert.equal(pool.trace.filter(entry => entry === 'COMMIT').length, 40, name);
    }
});

class QuestRuntime {
    constructor(state) {
        this.state = state;
        this.client = { state };
    }

    async lockCreator(username) {
        this.state.lockCalls += 1;
        return username === 'creator' ? { id: 1, username: 'creator' } : null;
    }

    async insertTrustedEvent(event) {
        const key = `${event.sourceType}:${event.dedupeKey}`;
        const existing = this.state.events.get(key);
        if (existing) return null;
        const row = {
            id: this.state.events.size + 1,
            source_type: event.sourceType,
            dedupe_key: event.dedupeKey,
            event_type: event.eventType,
            actor_user_id: event.actorUserId,
            subject_user_id: event.subjectUserId,
            occurred_at: event.occurredAt,
            correlation_id: event.correlationId,
            payload: structuredClone(event.payload),
            event_id: event.eventId,
            result: null
        };
        this.state.events.set(key, row);
        return row;
    }

    async loadTrustedEvent(sourceType, dedupeKey) {
        return this.state.events.get(`${sourceType}:${dedupeKey}`) || null;
    }

    async listTrustedHistory() {
        return [...this.state.events.values()];
    }

    async listAssignmentTrustedHistory() {
        return [...this.state.events.values()].map((event) => ({
            trustedEventId: event.id,
            eventType: event.event_type,
            occurredAt: event.occurred_at,
            payload: event.payload
        }));
    }

    async consumeTrustedEvents() {
        return [];
    }

    async listTrustedCandidates() {
        return [];
    }

    async finalizeTrustedEvent(id, result) {
        if (this.state.failFinalize) throw new Error('trusted finalize failure');
        const row = [...this.state.events.values()].find(event => event.id === id);
        row.result = structuredClone(result);
        this.state.finalized += 1;
    }

    async redactExpiredEvidenceBatch(limit) {
        this.state.retentionLimits.push(limit);
        const due = this.state.evidence
            .filter(item => !item.redacted && item.due)
            .slice(0, limit);
        for (const item of due) {
            item.content = {};
            item.mediaBytes = null;
            item.redacted = true;
        }
        return due.map(item => ({ id: item.id, assignment_id: item.assignmentId }));
    }

    async insertAudit(value) {
        if (this.state.failAudit) throw new Error('retention audit failure');
        this.state.audits.push(structuredClone(value));
    }
}

function questFixture(overrides = {}) {
    const state = {
        events: new Map(),
        finalized: 0,
        lockCalls: 0,
        evidence: [],
        retentionLimits: [],
        audits: [],
        failFinalize: false,
        failAudit: false,
        ...overrides
    };
    const pool = transactionalPool(state);
    const service = new QuestV2Service({
        pool,
        BalanceLogger: {
            async updateBalance() {
                throw new Error('no settlement expected');
            }
        },
        catalogRepositoryFactory: () => ({}),
        runtimeRepositoryFactory: () => new QuestRuntime(state)
    });
    return { service, pool, state };
}

function storyEvent(number = 1) {
    return {
        sourceType: 'story',
        sourceEventId: `story-episode:event-${String(number).padStart(4, '0')}:harbor-awakening`,
        username: 'creator',
        eventType: 'story.episode.completed',
        occurredAt: '2026-08-17T12:00:00.000Z',
        payload: {
            runId: number,
            contentVersion: 1,
            episodeSlug: 'harbor-awakening'
        }
    };
}

function ingestStoryEvent(service, event) {
    return service.transaction(client => service.recordInternalTrustedEvent(client, event));
}

test('Quest trusted ingestion persists one canonical result and replays without new progress', async () => {
    const { service, state } = questFixture();
    const event = storyEvent(1);
    const first = await ingestStoryEvent(service, event);
    const replay = await ingestStoryEvent(service, { ...event, payload: { ...event.payload } });
    assert.deepEqual(replay, first);
    assert.equal(first.enabled, true);
    assert.equal(first.matches.length, 0);
    assert.equal(first.rewardEarned, 0);
    assert.equal(state.events.size, 1);
    assert.equal(state.finalized, 1);
    assert.equal(state.lockCalls, 2);
});

test('Quest trusted ingestion fails closed on same source with changed semantics', async () => {
    const { service, state } = questFixture();
    const event = storyEvent(2);
    await ingestStoryEvent(service, event);
    await assert.rejects(ingestStoryEvent(service, {
        ...event,
        payload: { ...event.payload, episodeSlug: 'different-route' }
    }), /identity collision/);
    assert.equal(state.events.size, 1);
    assert.equal(state.finalized, 1);
});

test('Quest trusted ingestion rolls event back when finalization fails', async () => {
    const { service, pool, state } = questFixture({ failFinalize: true });
    await assert.rejects(ingestStoryEvent(service, storyEvent(3)), /trusted finalize failure/);
    assert.equal(state.events.size, 0);
    assert.equal(state.finalized, 0);
    assert.equal(pool.trace.filter(entry => entry === 'ROLLBACK').length, 1);
    assert.equal(pool.releases, 1);
});

test('Quest trusted ingestion load preserves exactly-once source identities', async () => {
    const { service, state, pool } = questFixture();
    const events = Array.from({ length: 120 }, (_, index) => storyEvent(index + 10));
    const results = await Promise.all(events.map(event => ingestStoryEvent(service, event)));
    assert.equal(results.length, 120);
    assert.equal(results.every(result => result.enabled && result.matches.length === 0), true);
    assert.equal(state.events.size, 120);
    assert.equal(state.finalized, 120);
    assert.equal(pool.connections, 120);
    assert.equal(pool.releases, 120);
    assert.equal(pool.trace.filter(entry => entry === 'COMMIT').length, 120);
});

test('Quest evidence retention processes at most one hundred tombstones per run', async () => {
    const evidence = Array.from({ length: 145 }, (_, index) => ({
        id: index + 1,
        assignmentId: Math.floor(index / 3) + 1,
        due: true,
        redacted: false,
        content: { text: `evidence-${index}` },
        mediaBytes: 'private-bytes'
    }));
    const { service, state } = questFixture({ evidence });
    const count = await service.redactExpiredEvidence();
    assert.equal(count, 100);
    assert.deepEqual(state.retentionLimits, [100]);
    assert.equal(state.evidence.filter(item => item.redacted).length, 100);
    assert.equal(state.evidence.filter(item => item.redacted).every(item => item.mediaBytes === null), true);
    assert.equal(state.evidence.filter(item => item.redacted).every(item => Object.keys(item.content).length === 0), true);
    assert.equal(state.audits.length, 100);
    assert.ok(state.audits.every(item => item.action === 'quest.evidence.retention_redacted'));
});

test('Quest evidence retention leaves future evidence untouched', async () => {
    const evidence = [
        { id: 1, assignmentId: 1, due: true, redacted: false, content: { text: 'due' }, mediaBytes: 'bytes' },
        { id: 2, assignmentId: 1, due: false, redacted: false, content: { text: 'future' }, mediaBytes: 'future-bytes' }
    ];
    const { service, state } = questFixture({ evidence });
    assert.equal(await service.redactExpiredEvidence(), 1);
    assert.equal(state.evidence[0].redacted, true);
    assert.equal(state.evidence[1].redacted, false);
    assert.deepEqual(state.evidence[1].content, { text: 'future' });
    assert.equal(state.evidence[1].mediaBytes, 'future-bytes');
});

test('Quest evidence retention rolls tombstone changes back when audit fails', async () => {
    const evidence = [
        { id: 1, assignmentId: 1, due: true, redacted: false, content: { text: 'retain on rollback' }, mediaBytes: 'bytes' }
    ];
    const { service, state, pool } = questFixture({ evidence, failAudit: true });
    await assert.rejects(service.redactExpiredEvidence(), /retention audit failure/);
    assert.equal(state.evidence[0].redacted, false);
    assert.deepEqual(state.evidence[0].content, { text: 'retain on rollback' });
    assert.equal(state.evidence[0].mediaBytes, 'bytes');
    assert.equal(state.audits.length, 0);
    assert.equal(pool.trace.filter(entry => entry === 'ROLLBACK').length, 1);
});

function storyReadFixture() {
    const pool = transactionalPool({});
    let readCreatorCalls = 0;
    let lockCreatorCalls = 0;
    let latestCalls = 0;
    const repository = {
        async readCreator(username) {
            readCreatorCalls += 1;
            return { id: 1, username, timezone: 'UTC', story_tone: 'gentle' };
        },
        async lockCreator() {
            lockCreatorCalls += 1;
            throw new Error('read path must not lock creator');
        },
        async loadBoundaries() {
            return { preferences: [], quietHours: [] };
        },
        async latestRun() {
            latestCalls += 1;
            return null;
        }
    };
    const service = new StoryWorldService({
        pool,
        repositoryFactory: () => repository,
        clock: () => new Date('2026-08-17T12:00:00.000Z')
    });
    service.catalog = { campaign: { id: 11 }, version: { id: 12 } };
    return {
        service,
        pool,
        calls: () => ({ readCreatorCalls, lockCreatorCalls, latestCalls })
    };
}

test('Story state read uses non-locking account path and safe empty projection', async () => {
    const fixture = storyReadFixture();
    const result = await fixture.service.state('creator', { language: 'en' });
    assert.equal(result.success, true);
    assert.equal(result.available, true);
    assert.equal(result.hasRun, false);
    assert.equal(result.runId, null);
    assert.equal(result.story, null);
    assert.equal(result.seasons.length, 5);
    assert.equal(fixture.calls().readCreatorCalls, 1);
    assert.equal(fixture.calls().lockCreatorCalls, 0);
});

test('Story state read load remains bounded and does not serialize on account locks', async () => {
    const fixture = storyReadFixture();
    const reads = await Promise.all(Array.from({ length: 150 }, (_, index) => fixture.service.state('creator', {
        language: index % 2 ? 'en' : 'zh'
    })));
    assert.equal(reads.length, 150);
    assert.equal(reads.every(item => item.success && item.story === null), true);
    assert.equal(fixture.calls().readCreatorCalls, 150);
    assert.equal(fixture.calls().latestCalls, 150);
    assert.equal(fixture.calls().lockCreatorCalls, 0);
    assert.equal(fixture.pool.connections, 150);
    assert.equal(fixture.pool.releases, 150);
    assert.equal(fixture.pool.trace.filter(entry => entry === 'COMMIT').length, 150);
});

function liveServiceFixture({ canShowPresence = true, publishFailure = false } = {}) {
    const state = {
        room: {
            id: 1,
            key: 'creator:owner',
            creatorUserId: 7,
            creatorUsername: 'creator',
            ownerUserId: 8,
            ownerUsername: 'owner',
            status: 'active',
            revision: 0,
            nextSequence: 1,
            availability: 'offline',
            mutedUntil: null,
            memberRole: 'creator',
            memberStatus: 'active'
        },
        commands: new Map(),
        events: [],
        audits: [],
        publishCalls: []
    };
    let transactionTail = Promise.resolve();
    const repository = {
        pool: { async query() { return { rows: [] }; } },
        async withTransaction(work) {
            const previous = transactionTail;
            let unlock;
            transactionTail = new Promise(resolve => {
                unlock = resolve;
            });
            await previous;
            const snapshot = structuredClone(state);
            try {
                return await work({});
            } catch (error) {
                state.room = snapshot.room;
                state.commands = snapshot.commands;
                state.events = snapshot.events;
                state.audits = snapshot.audits;
                throw error;
            } finally {
                unlock();
            }
        },
        async readRoomIdentity() {
            return { creator_username: 'creator', owner_username: 'owner' };
        },
        async lockAccounts() {
            return {
                creator: {
                    id: 7,
                    username: 'creator',
                    authorized: true,
                    deactivated: false,
                    account_locked: false,
                    timezone: 'UTC',
                    live_interaction_opt_in: true
                },
                owner: { id: 8, username: 'owner', is_admin: true,
                    authorized: true, deactivated: false, account_locked: false }
            };
        },
        async lockMemberRoom() {
            return structuredClone(state.room);
        },
        async creatorBoundaries() {
            return {
                preferences: canShowPresence ? {} : { all_messages: 'block' },
                quietHours: [],
                interactionWindows: []
            };
        },
        async findCommand(client, interactionId, actorId, commandId) {
            return state.commands.get(`${interactionId}:${actorId}:${commandId}`) || null;
        },
        async advanceRoom(client, room, next) {
            state.room = { ...room, ...next, revision: room.revision + 1, nextSequence: room.nextSequence + 1 };
            return structuredClone(state.room);
        },
        async appendEvent(client, input) {
            const event = {
                version: 1,
                interactionId: input.interactionId,
                eventId: input.eventId,
                sequence: state.events.length + 1,
                eventType: input.eventType,
                actor: { type: input.actorType },
                subjectUserId: input.subjectUserId,
                serverTimestamp: '2026-08-17T12:00:00.000Z',
                payload: structuredClone(input.payload),
                correlationId: input.correlationId,
                stateRevision: input.stateRevision
            };
            state.events.push(event);
            return event;
        },
        async saveCommand(client, command) {
            state.commands.set(`${command.interactionId}:${command.actorUserId}:${command.commandId}`, {
                semantic_hash: command.semanticHash,
                response_body: structuredClone(command.body)
            });
        },
        async insertAudit(client, audit) {
            state.audits.push(structuredClone(audit));
        }
    };
    const service = new LiveInteractionService({
        repository,
        ownerUsername: 'owner',
        storyNodeIds: ['quiet-frequency.owner', 'locked-window.owner', 'constellation-pieces.owner'],
        games: [
            { id: 'doudizhu', href: '/doudizhu' },
            { id: 'adventure', href: '/adventure' },
            { id: 'quiz', href: '/quiz' }
        ],
        async publish(event, room, audience) {
            state.publishCalls.push({ event: structuredClone(event), room: structuredClone(room), audience });
            if (publishFailure) throw new Error('fanout unavailable');
        },
        clock: () => new Date('2026-08-17T12:00:00.000Z')
    });
    return { service, state };
}

function availabilityCommand(number, revision, availability = 'available') {
    return {
        commandId: uuid(number),
        interactionId: 1,
        expectedRevision: revision,
        availability
    };
}

test('presence update persists before bounded fan-out and replays exactly once', async () => {
    const { service, state } = liveServiceFixture();
    const command = availabilityCommand(1, 0);
    const first = await service.creatorAction('creator', command, 'availability');
    const replay = await service.creatorAction('creator', command, 'availability');
    assert.deepEqual(replay, first);
    assert.equal(first.revision, 1);
    assert.equal(first.event.payload.availability, 'available');
    assert.equal(first.event.payload.visibility, 'shared');
    assert.equal(state.events.length, 1);
    assert.equal(state.commands.size, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.publishCalls.length, 1);
    assert.equal(Buffer.byteLength(JSON.stringify(first.event), 'utf8') < 6000, true);
});

test('presence update suppresses presence under communication block', async () => {
    const { service, state } = liveServiceFixture({ canShowPresence: false });
    const result = await service.creatorAction('creator', availabilityCommand(2, 0), 'availability');
    assert.equal(result.event.payload.availability, 'offline');
    assert.equal(result.event.payload.visibility, 'suppressed');
    assert.equal(state.room.availability, 'available');
    assert.equal(state.events.length, 1);
    assert.equal(JSON.stringify(result.event).includes('all_messages'), false);
});

test('presence fan-out failure cannot roll back authoritative persisted event', async () => {
    const { service, state } = liveServiceFixture({ publishFailure: true });
    const result = await service.creatorAction('creator', availabilityCommand(3, 0), 'availability');
    assert.equal(result.success, true);
    assert.equal(result.revision, 1);
    assert.equal(state.events.length, 1);
    assert.equal(state.commands.size, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.publishCalls.length, 1);
});

test('presence concurrent same-revision commands permit one state sequence', async () => {
    const { service, state } = liveServiceFixture();
    const settled = await Promise.allSettled([
        service.creatorAction('creator', availabilityCommand(4, 0, 'available'), 'availability'),
        service.creatorAction('creator', availabilityCommand(5, 0, 'busy'), 'availability')
    ]);
    assert.equal(settled.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(settled.filter(item => item.status === 'rejected').length, 1);
    const rejected = settled.find(item => item.status === 'rejected').reason;
    assert.equal(rejected.code, 'LIVE_REVISION_CONFLICT');
    assert.equal(rejected.status, 409);
    assert.equal(state.room.revision, 1);
    assert.equal(state.events.length, 1);
    assert.equal(state.commands.size, 1);
});

function catchUpRepositoryFixture() {
    const calls = [];
    const rows = Array.from({ length: 120 }, (_, index) => ({
        interaction_id: 1,
        event_id: uuid(index + 100),
        sequence: index + 1,
        protocol_version: 1,
        event_type: 'interaction.nudge',
        audience: 'both',
        actor_type: 'owner',
        subject_user_id: 7,
        created_at: '2026-08-17T12:00:00.000Z',
        payload: { itemId: index + 1 },
        correlation_id: uuid(index + 300),
        state_revision: index + 1
    }));
    const pool = {
        async connect() {},
        async query(sql, parameters) {
            calls.push({ sql: String(sql), parameters: structuredClone(parameters) });
            if (/MAX\(sequence\)/.test(String(sql))) return { rows: [{ maximum: 120 }] };
            const [interactionId, afterSequence, queryLimit] = parameters;
            return {
                rows: rows
                    .filter(row => row.interaction_id === interactionId && row.sequence > afterSequence)
                    .slice(0, queryLimit)
            };
        }
    };
    const repository = new LiveInteractionRepository({ pool });
    repository.readMemberRoom = async (interactionId, username) => username === 'creator'
        ? { id: interactionId, creatorUserId: 7, memberRole: 'creator', memberStatus: 'active' }
        : null;
    return { repository, calls, rows };
}

test('co-op catch-up returns bounded ordered pages with explicit continuation', async () => {
    const { repository, calls } = catchUpRepositoryFixture();
    const first = await repository.catchUp(1, 'creator', 0, 30);
    assert.equal(first.events.length, 30);
    assert.equal(first.events[0].sequence, 1);
    assert.equal(first.events.at(-1).sequence, 30);
    assert.equal(first.hasMore, true);
    assert.equal(first.nextAfter, 30);
    assert.deepEqual(calls[0].parameters, [1, 0, 31, 'creator', 7]);
    const second = await repository.catchUp(1, 'creator', first.nextAfter, 30);
    assert.equal(second.events[0].sequence, 31);
    assert.equal(second.events.at(-1).sequence, 60);
    assert.equal(second.nextAfter, 60);
});

test('co-op catch-up denies non-member without querying event history', async () => {
    const { repository, calls } = catchUpRepositoryFixture();
    const result = await repository.catchUp(1, 'stranger', 0, 30);
    assert.equal(result, null);
    assert.equal(calls.length, 0);
});

test('co-op catch-up load keeps every page bounded and monotonic', async () => {
    const { repository, calls } = catchUpRepositoryFixture();
    const pages = await Promise.all(Array.from({ length: 100 }, (_, index) => repository.catchUp(
        1,
        'creator',
        index % 60,
        20
    )));
    assert.equal(pages.length, 100);
    assert.equal(pages.every(page => page.events.length <= 20), true);
    assert.equal(pages.every(page => page.events.every((event, index, values) => index === 0 || event.sequence > values[index - 1].sequence)), true);
    const pageCalls = calls.filter(call => /ORDER BY sequence LIMIT \$3/.test(call.sql));
    assert.equal(pageCalls.length, 100);
    assert.equal(pageCalls.every(call => call.parameters[2] === 21), true);
});
