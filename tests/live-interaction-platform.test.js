'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ejs = require('ejs');
const {
    TEMPLATES
} = require('../content/streamer-world/live-interactions/templates');
const seasonOne = require('../content/streamer-world/story/season-one');
const {
    nextRoomState,
    transitionItem
} = require('../domain/live-interactions/engine');
const protocol = require('../domain/live-interactions/protocol');
const {
    LiveInteractionService
} = require('../services/live-interaction-service');
const {
    LiveSocketGateway
} = require('../services/live-socket-gateway');
const {
    ROUTE_MANIFEST,
    IDEMPOTENT_WRITE_PATHS
} = require('../routes/manifest');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const uuid = () => crypto.randomUUID();

class MemoryRepository {
    constructor({
        quiet = false
    } = {}) {
        this.pool = this;
        this.accounts = {
            owner: {
                id: 1,
                username: 'owner',
                is_admin: true,
                timezone: 'UTC',
                live_interaction_opt_in: false
            },
            creator: {
                id: 2,
                username: 'creator',
                is_admin: false,
                timezone: 'UTC',
                live_interaction_opt_in: true
            }
        };
        this.rooms = new Map();
        this.commands = new Map();
        this.events = [];
        this.items = new Map();
        this.reports = new Map();
        this.inbox = [];
        this.audits = [];
        this.members = new Map();
        this.nextRoom = 1;
        this.nextItem = 1;
        this.nextReport = 1;
        this.quiet = quiet;
        this.publish = [];
        this.queue = Promise.resolve();
        this.lockTrace = [];
        this.storyTarget = true;
        this.questVisible = true;
    }
    snapshot() {
        return structuredClone({
            rooms: this.rooms,
            commands: this.commands,
            events: this.events,
            items: this.items,
            reports: this.reports,
            inbox: this.inbox,
            audits: this.audits,
            members: this.members,
            nextRoom: this.nextRoom,
            nextItem: this.nextItem,
            nextReport: this.nextReport
        });
    }
    restore(s) {
        Object.assign(this, s);
    }
    async withTransaction(work) {
        const prior = this.queue;
        let release;
        this.queue = new Promise(resolve => {
            release = resolve;
        });
        await prior;
        const snapshot = this.snapshot();
        this.lockTrace.push('BEGIN');
        try {
            const value = await work(this);
            this.lockTrace.push('COMMIT');
            return value;
        } catch (error) {
            this.restore(snapshot);
            this.lockTrace.push('ROLLBACK');
            throw error;
        } finally {
            release();
        }
    }
    async query() {
        return {
            rows: [],
            rowCount: 0
        };
    }
    async lockAccounts(client, creatorUsername, ownerUsername) {
        this.lockTrace.push('users');
        return {
            creator: this.accounts[creatorUsername] || null,
            owner: this.accounts[ownerUsername] || null
        };
    }
    async readAccount(username) {
        return this.accounts[username] || null;
    }
    async creatorBoundaries() {
        return {
            preferences: {},
            quietHours: this.quiet ? [{
                weekday: 4,
                startMinute: 0,
                endMinute: 1439,
                enabled: true
            }] : [],
            interactionWindows: []
        };
    }
    async latestPairReport() {
        return [...this.reports.values()].at(-1) || null;
    }
    async findActivePair(client, creatorId, ownerId) {
        return [...this.rooms.values()].find(room => room.creatorUserId === creatorId && room.ownerUserId ===
            ownerId && room.status === 'active') || null;
    }
    async createRoom(client, input) {
        const room = {
            id: this.nextRoom++,
            key: input.interactionKey,
            creatorUserId: input.creatorUserId,
            ownerUserId: input.ownerUserId,
            status: 'active',
            revision: 0,
            nextSequence: 1,
            availability: 'offline',
            mutedUntil: null,
            creatorUsername: 'creator',
            ownerUsername: 'owner'
        };
        this.rooms.set(room.id, room);
        this.members.set(`${room.id}:creator`, {
            role: 'creator',
            status: 'active',
            ack: 0
        });
        this.members.set(`${room.id}:owner`, {
            role: 'owner',
            status: 'active',
            ack: 0
        });
        return {
            ...room
        };
    }
    async readRoomIdentity(client, id, username) {
        const room = this.rooms.get(id),
            member = this.members.get(`${id}:${username}`);
        return room && member ? {
            creator_username: 'creator',
            owner_username: 'owner',
            member_role: member.role
        } : null;
    }
    async lockMemberRoom(client, id, username) {
        this.lockTrace.push('room');
        const room = this.rooms.get(id),
            member = this.members.get(`${id}:${username}`);
        if (!room || !member) return null;
        return {
            ...room,
            memberRole: member.role,
            memberStatus: member.status,
            highestAckSequence: member.ack
        };
    }
    async readMemberRoom(id, username) {
        const room = this.rooms.get(id),
            member = this.members.get(`${id}:${username}`);
        return room && member ? {
            ...room,
            memberRole: member.role,
            memberStatus: member.status,
            highestAckSequence: member.ack
        } : null;
    }
    key(room, actor, command) {
        return `${room}:${actor}:${command}`;
    }
    async findCommand(client, room, actor, command) {
        return this.commands.get(this.key(room, actor, command)) || null;
    }
    async saveCommand(client, c) {
        this.commands.set(this.key(c.interactionId, c.actorUserId, c.commandId), {
            semantic_hash: c.semanticHash,
            response_body: structuredClone(c.body),
            event_id: c.eventId,
            response_status: c.status
        });
    }
    async advanceRoom(client, room, next) {
        const current = this.rooms.get(room.id);
        if (!current || current.revision !== room.revision) return null;
        Object.assign(current, {
            status: next.status,
            revision: next.revision,
            availability: next.availability,
            mutedUntil: next.mutedUntil
        });
        return {
            ...current,
            memberRole: room.memberRole,
            memberStatus: room.memberStatus,
            highestAckSequence: room.highestAckSequence
        };
    }
    async appendEvent(client, event) {
        const room = this.rooms.get(event.interactionId),
            sequence = room.nextSequence++;
        const row = {
            interaction_id: room.id,
            event_id: event.eventId,
            sequence,
            protocol_version: 1,
            event_type: event.eventType,
            actor_type: event.actorType,
            subject_user_id: event.subjectUserId,
            correlation_id: event.correlationId,
            state_revision: event.stateRevision,
            payload: structuredClone(event.payload),
            created_at: new Date('2026-08-16T20:00:00Z').toISOString()
        };
        const wrapped = protocol.envelope(row);
        this.events.push(wrapped);
        return wrapped;
    }
    async insertAudit(client, audit) {
        this.audits.push(structuredClone(audit));
    }
    async createItem(client, item) {
        const saved = {
            id: this.nextItem++,
            itemKey: item.itemKey,
            interactionId: item.interactionId,
            itemType: item.itemType,
            templateKey: item.templateKey,
            status: item.status,
            revision: 0,
            payload: structuredClone(item.payload),
            targetStoryNode: item.targetStoryNode,
            expiresAt: item.expiresAt
        };
        this.items.set(saved.id, saved);
        return structuredClone(saved);
    }
    async appendInbox(client, item) {
        this.inbox.push(item.id);
    }
    async lockItem(client, room, itemId) {
        const item = this.items.get(itemId);
        return item?.interactionId === room ? structuredClone(item) : null;
    }
    async transitionItem(client, item, transition) {
        const saved = this.items.get(item.id);
        saved.status = transition.status;
        saved.revision = transition.nextItemRevision;
        return structuredClone(saved);
    }
    async validateQuestReference() {
        return this.questVisible ? {
            slug: 'welcome-map-reading'
        } : null;
    }
    async validateStoryTarget() {
        return this.storyTarget ? {
            runId: 1
        } : null;
    }
    async updateAck(client, room, actor, sequence) {
        const member = actor === 2 ? this.members.get(`${room.id}:creator`) : this.members.get(`${room.id}:owner`);
        if (sequence > room.nextSequence - 1) return {
            invalid: true,
            highest: member.ack,
            maximum: room.nextSequence - 1
        };
        member.ack = Math.max(member.ack, sequence);
        return {
            invalid: false,
            highest: member.ack,
            maximum: room.nextSequence - 1
        };
    }
    async markMemberLeft(client, id, actor) {
        this.members.get(`${id}:${actor===2?'creator':'owner'}`).status = 'left';
    }
    async insertReport(client, report) {
        this.reports.set(this.nextReport, {
            id: this.nextReport,
            status: 'open',
            creator_reconsented_at: null,
            interaction_id: report.interactionId,
            ...structuredClone(report)
        });
        this.nextReport++;
    }
    async resolveReport(client, id, reviewer, status) {
        const report = this.reports.get(id);
        if (!report || !['open', 'reviewing'].includes(report.status)) return null;
        report.status = status;
        report.reviewer_user_id = reviewer;
        const room = this.rooms.get(report.interaction_id);
        room.status = 'closed';
        room.revision++;
        return {
            report: structuredClone(report),
            room: structuredClone(room)
        };
    }
    async reconsentReport(client, id, creator) {
        const report = this.reports.get(id);
        if (!report || report.reporterUserId !== creator || !['resolved', 'dismissed'].includes(report.status) ||
            report.creator_reconsented_at) return null;
        report.creator_reconsented_at = new Date().toISOString();
        return structuredClone(report);
    }
    async bumpRoomRevision(client, room) {
        const current = this.rooms.get(room.id);
        if (current.revision !== room.revision) return null;
        current.revision++;
        return {
            ...current,
            memberRole: room.memberRole,
            memberStatus: room.memberStatus,
            highestAckSequence: room.highestAckSequence
        };
    }
    async catchUp(id, username, after, limit) {
        const room = await this.readMemberRoom(id, username);
        if (!room) return null;
        const rows = this.events.filter(event => event.interactionId === id && event.sequence > after);
        return {
            room,
            events: rows.slice(0, limit),
            hasMore: rows.length > limit,
            nextAfter: rows.slice(0, limit).at(-1)?.sequence || after
        };
    }
    async listCreatorRooms(username) {
        const rooms = [];
        for (const room of [...this.rooms.values()].sort((a, b) => b.id - a.id)) {
            const member = this.members.get(`${room.id}:${username}`);
            if (member) rooms.push({
                ...room,
                memberRole: member.role,
                memberStatus: member.status,
                highestAckSequence: member.ack
            });
        }
        return rooms;
    }
    async roomState(id, username) {
        const room = await this.readMemberRoom(id, username);
        if (!room) return null;
        const report = [...this.reports.values()].filter(row => row.interaction_id === id && row.reporterUserId ===
            room.creatorUserId).at(-1);
        return {
            room,
            items: [...this.items.values()].filter(item => item.interactionId === id).map(item => structuredClone(
                item)),
            recent: this.events.filter(event => event.interactionId === id).slice(-30),
            report: report ? {
                id: report.id,
                status: report.status,
                reconsented: Boolean(report.creator_reconsented_at)
            } : null
        };
    }
}

function makeService(repository, overrides = {}) {
    const published = [];
    const service = new LiveInteractionService({
        repository,
        ownerUsername: 'owner',
        games: [{
            id: 'quiz',
            href: '/quiz'
        }, {
            id: 'doudizhu',
            href: '/doudizhu'
        }, {
            id: 'adventure',
            href: '/adventure'
        }],
        storyNodeIds: seasonOne.nodes.map(node => node.id),
        questEnabled: true,
        storyEnabled: true,
        clock: () => new Date('2026-08-20T12:00:00Z'),
        publish: async (event, room, audience) => {
            published.push({
                event,
                room,
                audience
            });
        },
        ...overrides
    });
    return {
        service,
        published
    };
}
async function open(service, context = {}) {
    return service.open('owner', {
        commandId: uuid(),
        creatorUsername: 'creator'
    }, context);
}

test('live flags require foundation and live switch while defaults remain closed', () => {
    const {
        readStreamerWorldFlags
    } = require('../lib/streamer-world-flags');
    assert.equal(readStreamerWorldFlags({}).liveInteractionsEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        LIVE_INTERACTIONS_ENABLED: 'true'
    }).liveInteractionsEnabled, true);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        LIVE_INTERACTIONS_ENABLED: 'TRUE'
    }).liveInteractionsEnabled, false);
});

test('24 unique bilingual structured templates cover all interaction kinds and real story nodes', () => {
    const values = Object.values(TEMPLATES);
    assert.equal(values.length, 24);
    assert.equal(new Set(values.map(x => x.titleZh)).size, 24);
    assert.equal(new Set(values.map(x => x.titleEn)).size, 24);
    assert.deepEqual(new Set(values.map(x => x.type)), new Set(protocol.ITEM_TYPES));
    const nodes = new Set(seasonOne.nodes.filter(node => node.type === 'owner_intervention').map(node => node
        .id));
    for (const template of values.filter(x => x.type === 'story_intervention'))
        for (const id of template.storyNodeIds) assert.ok(nodes.has(id), id);
});

test('protocol rejects unknown fields, oversized text, forged references, and malformed poll payloads', () => {
    const base = {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 0,
        creatorUsername: 'creator',
        itemType: 'poll',
        templateKey: 'poll.next-horizon',
        pollOptions: ['a', 'b']
    };
    assert.equal(protocol.validateDirectorCommand(base).pollOptions.length, 2);
    assert.throws(() => protocol.validateDirectorCommand({
        ...base,
        state: {
            hidden: true
        }
    }), /Unknown/);
    assert.throws(() => protocol.validateDirectorCommand({
        ...base,
        pollOptions: ['same', 'same']
    }), /unique/);
    assert.throws(() => protocol.validateDirectorCommand({
        ...base,
        pollOptions: ['a'.repeat(81), 'b']
    }), /Invalid/);
    assert.throws(() => protocol.validateCatchUp({
        interactionId: 1,
        afterSequence: 0,
        limit: 101
    }), /Invalid/);
});

test('pure item and room transitions are CAS-friendly and decline/leave are neutral', () => {
    const room = {
        status: 'active',
        revision: 3,
        availability: 'available',
        mutedUntil: null
    };
    assert.deepEqual(nextRoomState(room, 'leave', {}), {
        revision: 4,
        status: 'left',
        availability: 'offline',
        mutedUntil: null
    });
    const declined = transitionItem({
        id: 2,
        itemType: 'quest_invite',
        status: 'delivered',
        revision: 4,
        payload: {}
    }, 'decline');
    assert.equal(declined.status, 'declined');
    assert.doesNotMatch(JSON.stringify(declined), /xp|relationship|balance/i);
    assert.throws(() => transitionItem({
        status: 'declined'
    }, 'accept'), /actionable/);
});

test('migration enforces ordered events, immutable commands, report lifecycle, ack monotonicity, and reported pair block',
    () => {
        const sql = source('migrations/add_live_interaction_platform.sql');
        for (const table of ['live_interactions', 'live_interaction_members', 'live_interaction_items',
                'live_interaction_events', 'live_interaction_commands', 'live_interaction_reports',
                'live_interaction_audit_log'
            ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
        assert.match(sql, /UNIQUE \(interaction_id, sequence\)/);
        assert.match(sql, /WHERE status IN \('active', 'reported'\)/);
        assert.match(sql, /highest_ack_sequence < OLD\.highest_ack_sequence/);
        assert.match(sql, /closed report review provenance is immutable/);
        assert.match(sql, /creator_reconsented_at/);
        assert.doesNotMatch(sql, /BalanceLogger|gift_exchanges|wish_inventory|provider/i);
        assert.match(source('lib/database-migrations.js'), /add_live_interaction_platform\.sql/);
    });

test('open and send commit before fanout, replay exact durable response, and reject source collision', async () => {
    const repo = new MemoryRepository(),
        {
            service,
            published
        } = makeService(repo);
    const opened = await open(service);
    assert.equal(opened.event.sequence, 1);
    const commandId = uuid(),
        body = {
            commandId,
            creatorUsername: 'creator',
            interactionId: 1,
            expectedRevision: 1,
            itemType: 'nudge',
            templateKey: 'nudge.gentle-reset',
            expiresInMinutes: 60
        };
    const sent = await service.send('owner', body);
    assert.equal(sent.event.sequence, 2);
    assert.equal(sent.revision, 2);
    assert.equal(repo.events.length, 2);
    assert.equal(published.length, 2);
    const replay = await service.send('owner', body);
    assert.deepEqual(replay, sent);
    assert.equal(repo.events.length, 2);
    await assert.rejects(service.send('owner', {
        ...body,
        templateKey: 'nudge.open-window'
    }), error => error.code === 'LIVE_COMMAND_COLLISION');
    assert.equal(repo.events.length, 2);
});

test('live achievement hook is stable on response replay and failure rolls back the persisted item', async () => {
    const calls = [];
    const repo = new MemoryRepository();
    const { service } = makeService(repo, {
        achievementService: {
            async recordTrustedEvent(client, username, event) {
                calls.push({ client, username, event: structuredClone(event) });
            }
        }
    });
    await open(service);
    const command = {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'nudge',
        templateKey: 'nudge.gentle-reset'
    };
    const first = await service.send('owner', command);
    const replay = await service.send('owner', command);
    assert.deepEqual(replay, first);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].event.eventType, 'live.item.persisted');
    assert.equal(calls[0].event.sourceEventId, `achievement-live-persisted:${first.event.eventId}`);

    service.achievementService = {
        async recordTrustedEvent() {
            throw new Error('achievement settlement failed');
        }
    };
    const before = repo.snapshot();
    await assert.rejects(service.send('owner', {
        ...command,
        commandId: uuid(),
        expectedRevision: 2,
        templateKey: 'nudge.open-window'
    }), /achievement settlement failed/);
    assert.deepEqual(repo.snapshot(), before);
});

test('resolved live item and achievement event share one rollback boundary', async () => {
    const repo = new MemoryRepository();
    const { service } = makeService(repo, {
        achievementService: { recordTrustedEvent: async () => ({ success: true }) }
    });
    await open(service);
    const sent = await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'quest_invite',
        templateKey: 'quest-invite.small-signal',
        referenceId: 'welcome-map-reading'
    });
    const before = repo.snapshot();
    service.achievementService = {
        async recordTrustedEvent(client, username, event) {
            assert.equal(username, 'creator');
            assert.equal(event.eventType, 'live.item.resolved');
            assert.equal(event.sourceEventId.startsWith('achievement-live-resolved:'), true);
            throw new Error('resolved achievement failed');
        }
    };
    await assert.rejects(service.itemAction('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 2,
        itemId: sent.item.id
    }, 'accept'), /resolved achievement failed/);
    assert.deepEqual(repo.snapshot(), before);
    assert.equal(repo.items.get(sent.item.id).status, 'delivered');
});

test('configured owner is enforced even for an active administrator', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    repo.accounts.other = {
        id: 3,
        username: 'other',
        is_admin: true,
        timezone: 'UTC',
        live_interaction_opt_in: false
    };
    await assert.rejects(service.open('other', {
        commandId: uuid(),
        creatorUsername: 'creator'
    }), error => error.code === 'LIVE_OWNER_REQUIRED');
    assert.equal(repo.rooms.size, 0);
});

test('non-owner administrator cannot read owner-only live Director context or templates', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    repo.accounts.other = {
        id: 3,
        username: 'other',
        is_admin: true,
        timezone: 'UTC',
        live_interaction_opt_in: false
    };
    await assert.rejects(service.director('other', 1), error => error.code === 'LIVE_OWNER_REQUIRED');
});

test('quiet hours persist inbox immediately but suppress creator realtime push', async () => {
    const repo = new MemoryRepository({
            quiet: true
        }),
        {
            service,
            published
        } = makeService(repo);
    await open(service);
    const sent = await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'nudge',
        templateKey: 'nudge.one-breath'
    });
    assert.equal(sent.realtimeSuppressed, true);
    assert.equal(sent.item.status, 'delivered');
    assert.equal(sent.item.payload.delivery, 'persistent_inbox_no_push');
    assert.equal(repo.inbox.length, 1);
    assert.equal(published.at(-1).audience, 'owner');
});

test('quiet hours suppress durable presence projection even when creator selects available', async () => {
    const repo = new MemoryRepository({
            quiet: true
        }),
        {
            service
        } = makeService(repo);
    await open(service);
    const result = await service.creatorAction('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 1,
        availability: 'available'
    }, 'availability');
    assert.equal(repo.rooms.get(1).availability, 'available');
    assert.deepEqual(result.event.payload, {
        availability: 'offline',
        visibility: 'suppressed'
    });
});

test('server-only safe action paths are persisted for visible quest/game invitations', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    const quest = await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'quest_invite',
        templateKey: 'quest-invite.small-signal',
        referenceId: 'welcome-map-reading'
    });
    assert.equal(quest.item.payload.actionPath, '/quests');
    const game = await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 2,
        itemType: 'game_invite',
        templateKey: 'game-invite.quiz-round',
        referenceId: 'quiz'
    });
    assert.equal(game.item.payload.actionPath, '/quiz');
    assert.throws(() => makeService(new MemoryRepository(), {
        games: [{
            id: 'evil',
            href: 'javascript:alert(1)'
        }]
    }), /internal allowlisted/);
});

test('story intervention requires current version-bound owner node and template membership', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    repo.storyTarget = false;
    await assert.rejects(service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'story_intervention',
        templateKey: 'story-intervention.sealed-compass',
        targetStoryNode: 'quiet-frequency.owner'
    }), error => error.code === 'LIVE_STORY_TARGET_MISMATCH');
    repo.storyTarget = true;
    await assert.rejects(service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'story_intervention',
        templateKey: 'story-intervention.sealed-compass',
        targetStoryNode: 'locked-window.owner'
    }), error => error.code === 'LIVE_STORY_TARGET_MISMATCH');
    const result = await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'story_intervention',
        templateKey: 'story-intervention.sealed-compass',
        targetStoryNode: 'quiet-frequency.owner'
    });
    assert.equal(result.item.targetStoryNode, 'quiet-frequency.owner');
});

test('finalize failure rolls back event, item, room revision, inbox, and audit before fanout', async () => {
    const repo = new MemoryRepository(),
        {
            service,
            published
        } = makeService(repo);
    await open(service);
    const before = repo.events.length;
    await assert.rejects(service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'nudge',
        templateKey: 'nudge.open-window'
    }, {
        finalizeIdempotency: async () => {
            throw new Error('injected finalize failure');
        }
    }), /injected/);
    assert.equal(repo.events.length, before);
    assert.equal(repo.items.size, 0);
    assert.equal(repo.inbox.length, 0);
    assert.equal(repo.rooms.get(1).revision, 1);
    assert.equal(published.length, 1);
});

test('post-commit fanout failure never rolls back durable state or response', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo, {
            publish: async () => {
                throw new Error('bus unavailable');
            }
        });
    const result = await open(service);
    assert.equal(result.success, true);
    assert.equal(repo.rooms.size, 1);
    assert.equal(repo.events.length, 1);
    assert.equal(repo.commands.size, 1);
});

test('concurrent send and creator presence share users-before-room lock order and only one stale revision wins',
async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    repo.lockTrace = [];
    const results = await Promise.allSettled([service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'nudge',
        templateKey: 'nudge.gentle-reset'
    }), service.creatorAction('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 1,
        availability: 'available'
    }, 'availability')]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(results.filter(x => x.status === 'rejected' && x.reason.code === 'LIVE_REVISION_CONFLICT')
        .length, 1);
    const transactions = repo.lockTrace.join(',').split('BEGIN').slice(1);
    for (const trace of transactions)
        if (trace.includes('room')) assert.ok(trace.indexOf('users') < trace.indexOf('room'), trace);
    assert.equal(repo.events.length, 2);
});

test('ack is monotonic, cannot move ahead, and left members retain read-only REST history', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'nudge',
        templateKey: 'nudge.gentle-reset'
    });
    assert.equal((await service.acknowledge('creator', {
        interactionId: 1,
        sequence: 1
    })).highestAckSequence, 1);
    assert.equal((await service.acknowledge('creator', {
        interactionId: 1,
        sequence: 0
    })).highestAckSequence, 1);
    await assert.rejects(service.acknowledge('creator', {
        interactionId: 1,
        sequence: 3
    }), error => error.code === 'LIVE_ACK_AHEAD');
    await service.creatorAction('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 2
    }, 'leave');
    await assert.rejects(service.acknowledge('creator', {
        interactionId: 1,
        sequence: 3
    }), error => error.code === 'LIVE_MEMBERSHIP_REQUIRED');
    const history = await service.catchUp('creator', {
        interactionId: 1,
        afterSequence: 0,
        limit: 100
    });
    assert.equal(history.events.length, 3);
});

test('expired invitation becomes a durable terminal event and cannot be accepted on replay', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    const sent = await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'nudge',
        templateKey: 'nudge.gentle-reset',
        expiresInMinutes: 5
    });
    repo.items.get(sent.item.id).expiresAt = '2026-08-20T11:59:59.000Z';
    const commandId = uuid(),
        input = {
            commandId,
            interactionId: 1,
            expectedRevision: 2,
            itemId: sent.item.id
        };
    const expired = await service.itemAction('creator', input, 'accept');
    assert.equal(expired.success, true);
    assert.equal(expired.expired, true);
    assert.equal(expired.code, 'LIVE_ITEM_EXPIRED');
    assert.equal(repo.items.get(sent.item.id).status, 'expired');
    assert.equal(repo.events.at(-1).eventType, 'interaction.item_expired');
    const replay = await service.itemAction('creator', input, 'accept');
    assert.deepEqual(replay, expired);
    assert.equal(repo.events.length, 3);
});

test('report marks item non-actionable; moderation alone stays blocked until explicit creator reconsent', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    const sent = await service.send('owner', {
        commandId: uuid(),
        creatorUsername: 'creator',
        interactionId: 1,
        expectedRevision: 1,
        itemType: 'nudge',
        templateKey: 'nudge.gentle-reset'
    });
    const reported = await service.report('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 2,
        itemId: sent.item.id,
        reasonCode: 'unwanted_contact',
        detail: 'Please stop'
    });
    assert.equal(repo.items.get(sent.item.id).status, 'reported');
    assert.equal(reported.status, 'reported');
    await assert.rejects(service.open('owner', {
        commandId: uuid(),
        creatorUsername: 'creator'
    }), error => error.code === 'LIVE_PAIR_BLOCKED');
    const moderated = await service.moderate('owner', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 3,
        reportId: 1,
        resolution: 'resolved'
    });
    assert.equal(moderated.status, 'closed');
    await assert.rejects(service.open('owner', {
        commandId: uuid(),
        creatorUsername: 'creator'
    }), error => error.code === 'LIVE_PAIR_BLOCKED');
    await service.reconsent('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 4,
        reportId: 1
    });
    const reopened = await service.open('owner', {
        commandId: uuid(),
        creatorUsername: 'creator'
    });
    assert.equal(reopened.interaction.id, 2);
    assert.equal(repo.rooms.size, 2);
});

test('creator state exposes only safe reconsent projection and never leaks Director templates', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    await service.report('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 1,
        itemId: null,
        reasonCode: 'privacy',
        detail: 'private detail'
    });
    await service.moderate('owner', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 2,
        reportId: 1,
        resolution: 'resolved'
    });
    const state = await service.state('creator', 1);
    assert.deepEqual(state.report, {
        id: 1,
        status: 'resolved',
        reconsented: false
    });
    assert.equal('templates' in state, false);
    assert.doesNotMatch(JSON.stringify(state), /private detail/);
});

test('unreviewed report and a different user cannot reconsent', async () => {
    const repo = new MemoryRepository(),
        {
            service
        } = makeService(repo);
    await open(service);
    await service.report('creator', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 1,
        itemId: null,
        reasonCode: 'privacy',
        detail: ''
    });
    await assert.rejects(service.reconsent('creator', {
            commandId: uuid(),
            interactionId: 1,
            expectedRevision: 2,
            reportId: 1
        }), error => error.code === 'LIVE_REPORT_NOT_FOUND' || error.code ===
        'LIVE_RECONSENT_NOT_ALLOWED');
    repo.accounts.other = {
        id: 3,
        username: 'other',
        is_admin: false,
        timezone: 'UTC',
        live_interaction_opt_in: true
    };
    await assert.rejects(service.reconsent('other', {
        commandId: uuid(),
        interactionId: 1,
        expectedRevision: 2,
        reportId: 1
    }), error => error.code === 'LIVE_REPORT_NOT_FOUND');
});

test('durable envelope stays below PostgreSQL bus limit with outer delivery wrapper', () => {
    const payload = {
        titleZh: '星'.repeat(1000),
        titleEn: 'x'.repeat(1000)
    };
    const row = {
        interaction_id: 1,
        event_id: uuid(),
        sequence: 1,
        event_type: 'interaction.nudge',
        actor_type: 'owner',
        subject_user_id: 2,
        created_at: new Date().toISOString(),
        payload,
        correlation_id: uuid(),
        state_revision: 1
    };
    const event = protocol.envelope(row);
    const bus = JSON.stringify({
        version: 1,
        origin: 'a'.repeat(32),
        type: 'live_interaction',
        payload: {
            event,
            audience: 'both',
            creatorUserId: 2,
            ownerUserId: 1
        }
    });
    assert.ok(Buffer.byteLength(JSON.stringify(event)) <= protocol.MAX_EVENT_BYTES);
    assert.ok(Buffer.byteLength(bus) < 7500);
});

test('socket commands revalidate exact session and disconnect revoked clients before service access', async () => {
    let accessed = 0;
    const handlers = {},
        emitted = [],
        joined = [];
    const socket = {
        authenticatedUser: {
            username: 'creator',
            userId: 2,
            sessionId: 'sid'
        },
        join: room => joined.push(room),
        on: (name, fn) => {
            handlers[name] = fn;
        },
        emit: (name, value) => emitted.push([name, value]),
        disconnect: () => {
            socket.disconnected = true;
        }
    };
    const gateway = new LiveSocketGateway({
        enabled: true,
        authorize: async () => false,
        service: {
            catchUp: async () => {
                accessed++;
            },
            acknowledge: async () => {
                accessed++;
            },
            creatorAction: async () => {
                accessed++;
            }
        }
    });
    gateway.attach(socket);
    let reply;
    await handlers['live:subscribe']({
        interactionId: 1
    }, value => {
        reply = value;
    });
    assert.equal(reply.code, 'SESSION_REVOKED');
    assert.equal(accessed, 0);
    assert.equal(socket.disconnected, true);
    assert.deepEqual(joined, ['live:user:2']);
});

test('socket subscribe uses member-scoped catch-up and joins only after authorization', async () => {
    const handlers = {},
        joined = [],
        service = {
            catchUp: async (username, input) => {
                assert.equal(username, 'creator');
                assert.equal(input.interactionId, 7);
                return {
                    success: true,
                    events: [],
                    lastSequence: 4
                };
            },
            acknowledge: async () => ({
                success: true
            }),
            creatorAction: async () => ({
                success: true
            })
        };
    const socket = {
        authenticatedUser: {
            username: 'creator',
            userId: 2,
            sessionId: 'sid'
        },
        join: room => joined.push(room),
        on: (name, fn) => {
            handlers[name] = fn;
        },
        emit: () => {},
        disconnect: () => {}
    };
    new LiveSocketGateway({
        enabled: true,
        authorize: async () => true,
        service
    }).attach(socket);
    let reply;
    await handlers['live:subscribe']({
        interactionId: 7,
        afterSequence: 4
    }, value => {
        reply = value;
    });
    assert.equal(reply.lastSequence, 4);
    assert.deepEqual(joined, ['live:user:2', 'live:interaction:7']);
});

test('socket command flood is bounded before it reaches durable services', async () => {
    const handlers = {};
    let calls = 0;
    const socket = {
        authenticatedUser: {
            username: 'creator',
            userId: 2,
            sessionId: 'sid'
        },
        join: () => {},
        on: (name, fn) => {
            handlers[name] = fn;
        },
        emit: () => {},
        disconnect: () => {}
    };
    new LiveSocketGateway({
        enabled: true,
        authorize: async () => true,
        service: {
            catchUp: async () => {
                calls++;
                return {
                    events: [],
                    lastSequence: 0
                };
            },
            acknowledge: async () => ({}),
            creatorAction: async () => ({})
        }
    }).attach(socket);
    let last;
    for (let index = 0; index < 31; index++) await handlers['live:subscribe']({
        interactionId: 1,
        afterSequence: 0
    }, value => {
        last = value;
    });
    assert.equal(calls, 30);
    assert.equal(last.code, 'LIVE_RATE_LIMIT');
});

test('existing PostgreSQL event bus fans a live envelope to a second instance and ignores its own notification',
async () => {
    const {
        PostgresEventBus
    } = require('../lib/postgres-event-bus');
    const clients = [];
    const pool = {
        async connect() {
            const handlers = {};
            const client = {
                on: (name, fn) => {
                    handlers[name] = fn;
                },
                query: async () => ({}),
                release: () => {},
                handlers
            };
            clients.push(client);
            return client;
        },
        async query(sql, args) {
            if (/pg_notify/.test(sql)) {
                for (const client of clients) client.handlers.notification?.({
                    channel: 'minimal_games_socket_events',
                    payload: args[1]
                });
            }
            return {
                rows: []
            };
        }
    };
    const receivedA = [],
        receivedB = [];
    const a = new PostgresEventBus(pool, (type, payload) => receivedA.push({
            type,
            payload
        })),
        b = new PostgresEventBus(pool, (type, payload) => receivedB.push({
            type,
            payload
        }));
    await a.start();
    await b.start();
    await a.publish('live_interaction', {
        event: {
            version: 1,
            eventId: 'x'
        }
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(receivedA.length, 0);
    assert.equal(receivedB.length, 1);
    assert.equal(receivedB[0].type, 'live_interaction');
    await a.close();
    await b.close();
});

test('browser replay reducer treats snapshot high-water mark as authoritative and never duplicates old pages', () => {
    const script = source('public/js/live-replay.js');
    const sandbox = {
        globalThis: {}
    };
    sandbox.globalThis.globalThis = sandbox.globalThis;
    vm.runInNewContext(script, sandbox);
    const recent = Array.from({
        length: 30
    }, (_, index) => ({
        version: 1,
        interactionId: 1,
        eventId: `e${index+11}`,
        sequence: index + 11
    }));
    const replay = sandbox.globalThis.LiveReplayState.create({
        interactionId: 1,
        lastSequence: 40,
        recent
    });
    for (let sequence = 1; sequence <= 40; sequence++) assert.equal(replay.apply({
        version: 1,
        interactionId: 1,
        eventId: `e${sequence}`,
        sequence
    }).kind, 'duplicate');
    assert.equal(replay.recent.length, 30);
    assert.equal(replay.lastSequence, 40);
    assert.equal(replay.apply({
        version: 1,
        interactionId: 1,
        eventId: 'e42',
        sequence: 42
    }).kind, 'gap');
    assert.equal(replay.apply({
        version: 1,
        interactionId: 1,
        eventId: 'e41',
        sequence: 41
    }).kind, 'applied');
    assert.equal(replay.lastSequence, 41);
});

test('routes are fixed-path policy entries and creator/admin UIs are safe, bilingual, mobile, and idempotent', () => {
    const paths = ['/api/live/items/accept', '/api/live/items/decline', '/api/live/polls/vote',
        '/api/live/presence', '/api/live/mute', '/api/live/leave', '/api/live/report',
        '/api/live/reconsent', '/api/admin/live/open', '/api/admin/live/send',
        '/api/admin/live/reports/moderate'
    ];
    for (const routePath of paths) {
        const entry = ROUTE_MANIFEST.find(row => row.path === routePath);
        assert.ok(entry, routePath);
        assert.ok(entry.policies.includes('csrf'));
        assert.ok(IDEMPOTENT_WRITE_PATHS.includes(routePath));
    }
    const liveView = source('views/live-room.ejs'),
        directorView = source('views/admin-creator-director.ejs'),
        scripts = source('public/js/live-room.js') + source('public/js/admin-live-director.js');
    assert.doesNotThrow(() => ejs.compile(liveView));
    assert.doesNotThrow(() => ejs.compile(directorView));
    assert.match(liveView, /lang==='zh'/);
    assert.match(directorView, /creator-world\.css/);
    assert.match(directorView, /totalXp/);
    assert.match(directorView, /bilibiliRoomId/);
    assert.match(directorView, /roomRequest/);
    assert.match(directorView, /creator-pagination/);
    assert.doesNotMatch(scripts, /\.innerHTML\s*=/);
    assert.match(scripts, /window\.idempotentFetch/);
    assert.match(scripts, /X-CSRF-Token/);
    assert.match(source('public/live-interactions.css'), /@media\(max-width:760px\)/);
    assert.match(source('public/live-interactions.css'), /min-height:48px/);
});

test('feature-off live registrar returns 404 before reads/writes and expired durable response replays HTTP 200',
async () => {
        const register = require('../routes/live-interactions');
        const registered = [];
        const app = {
            get: (routePath, ...handlers) => registered.push({
                routePath,
                handlers
            }),
            post: (routePath, ...handlers) => registered.push({
                routePath,
                handlers
            })
        };
        const pass = (req, res, next) => next();
        register(app, {
            liveInteractionService: {
                state() {},
                catchUp() {},
                itemAction() {}
            },
            streamerWorldFlags: {
                liveInteractionsEnabled: false
            },
            generateCSRFToken: () => '',
            requireLogin: pass,
            requireAuthorized: pass,
            requireCSRF: pass,
            security: {
                basicRateLimit: pass,
                userActionRateLimit: pass,
                readHeavyRateLimit: pass
            }
        });
        const page = registered.find(row => row.routePath === '/live-room'),
            response = {
                locals: {
                    lang: 'en'
                },
                statusCode: 200,
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                send(value) {
                    this.body = value;
                    return this;
                },
                json(value) {
                    this.body = value;
                    return this;
                }
            };
        page.handlers[3]({
            path: '/live-room'
        }, response, () => {
            throw new Error('must not continue');
        });
        assert.equal(response.statusCode, 404);
        const enabled = [];
        const app2 = {
            get: () => {},
            post: (routePath, ...handlers) => enabled.push({
                routePath,
                handlers
            })
        };
        register(app2, {
            liveInteractionService: {
                state() {},
                catchUp() {},
                async itemAction() {
                    return {
                        success: true,
                        expired: true,
                        code: 'LIVE_ITEM_EXPIRED'
                    };
                }
            },
            streamerWorldFlags: {
                liveInteractionsEnabled: true
            },
            generateCSRFToken: () => '',
            requireLogin: pass,
            requireAuthorized: pass,
            requireCSRF: pass,
            security: {
                basicRateLimit: pass,
                userActionRateLimit: pass,
                readHeavyRateLimit: pass
            }
        });
        const expiredRoute = enabled.find(row => row.routePath === '/api/live/items/accept'),
            res = {
                statusCode: 0,
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                json(value) {
                    this.body = value;
                    return this;
                }
            };
        await expiredRoute.handlers.at(-1)({
            session: {
                user: {
                    username: 'creator'
                }
            },
            body: {},
            requestId: 'request',
            finalizeIdempotency: null
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.expired, true);
        assert.equal(res.body.code, 'LIVE_ITEM_EXPIRED');
    });

test('Director registrar keeps non-owner admins on Phase 1 summary and blocks every live mutation', async () => {
    const register = require('../routes/admin-creator-director');
    const rows = [];
    const app = {
        get: (routePath, ...handlers) => rows.push({
            method: 'GET',
            routePath,
            handlers
        }),
        post: (routePath, ...handlers) => rows.push({
            method: 'POST',
            routePath,
            handlers
        })
    };
    const pass = (req, res, next) => next();
    let liveReads = 0;
    register(app, {
        creatorService: {
            async adminSummaries() {
                return {
                    page: 1,
                    pageSize: 25,
                    creators: []
                };
            }
        },
        liveInteractionService: {
            async director() {
                liveReads++;
                return {};
            },
            open() {},
            send() {},
            moderate() {}
        },
        streamerWorldFlags: {
            creatorFoundationEnabled: true,
            liveInteractionsEnabled: true,
            ownerUsername: 'owner'
        },
        generateCSRFToken: () => '',
        requireLogin: pass,
        requireAdmin: pass,
        requireCSRF: pass,
        security: {
            basicRateLimit: pass,
            userActionRateLimit: pass,
            readHeavyRateLimit: pass
        }
    });
    const page = rows.find(row => row.method === 'GET');
    const req = {
            query: {},
            session: {
                user: {
                    username: 'other-admin'
                }
            }
        },
        res = {
            locals: {
                lang: 'en'
            },
            set() {},
            render(view, model) {
                this.view = view;
                this.model = model;
                return this;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            send() {
                return this;
            }
        };
    for (const handler of page.handlers) {
        let continued = false;
        const returned = handler(req, res, () => {
            continued = true;
        });
        if (returned?.then) await returned;
        if (!continued && res.view) break;
    }
    assert.equal(liveReads, 0);
    assert.equal(res.model.liveEnabled, false);
    assert.deepEqual(res.model.summary.creators, []);
    const send = rows.find(row => row.routePath === '/api/admin/live/send'),
        blocked = {
            statusCode: 0,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                return this;
            }
        };
    let continued = false;
    send.handlers[2]({
        session: {
            user: {
                username: 'other-admin'
            }
        }
    }, blocked, () => {
        continued = true;
    });
    assert.equal(continued, false);
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.body.code, 'LIVE_OWNER_REQUIRED');
});

test('live modules are isolated from points, gift inventory, and provider send boundaries', () => {
    const combined = ['domain/live-interactions/protocol.js', 'domain/live-interactions/engine.js',
        'repositories/live-interaction-repository.js', 'services/live-interaction-service.js',
        'services/live-interaction-participant-commands.js', 'services/live-socket-gateway.js',
        'routes/live-interactions.js', 'routes/admin-creator-director.js'
    ].map(source).join('\n');
    assert.doesNotMatch(combined,
        /BalanceLogger|bilibili_gift_sender|enqueueWishInventorySend|gift_exchanges|wish_inventory|quest_auto_reward/
        );
    assert.doesNotMatch(combined, /UPDATE\s+(?:balance_logs|gift_exchanges|wish_inventory)/i);
});
