'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const protocol = require('../domain/live-interactions/protocol');
const { evaluateCoopConsent } = require('../domain/streamer-games/consent');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { CoopConsentCoordinator } = require('../services/coop-consent-coordinator');
const { LiveEventDelivery } = require('../services/live-event-delivery');
const { LiveInteractionService } = require('../services/live-interaction-service');
const { LiveSocketGateway } = require('../services/live-socket-gateway');
const { TEMPLATES } = require('../content/streamer-world/live-interactions/templates');

function event(audience, overrides = {}) {
    return protocol.envelope({
        interaction_id: 41,
        event_id: crypto.randomUUID(),
        sequence: 7,
        event_type: 'interaction.game_state_changed',
        audience,
        actor_type: 'creator',
        subject_user_id: 2,
        created_at: '2026-08-17T12:00:00.000Z',
        payload: { gameId: 'signal-duet', runId: crypto.randomUUID() },
        correlation_id: crypto.randomUUID(),
        state_revision: 3,
        ...overrides
    });
}

function socket({ username, userId, role, interactionId = 41 }) {
    const emitted = [];
    return {
        authenticatedUser: { username, userId, sessionId: `${username}-session` },
        liveInteractionSubscriptions: new Map([[interactionId, { interactionId, role, userId }]]),
        emit(name, payload) { emitted.push([name, payload]); },
        emitted
    };
}

test('durable live envelopes require an explicit closed audience', () => {
    assert.equal(event('creator').audience, 'creator');
    assert.equal(event('owner').audience, 'owner');
    assert.equal(event('both').audience, 'both');
    assert.equal(event('system').audience, 'system');
    assert.throws(() => event(undefined), error => error.code === 'LIVE_INVALID_EVENT');
    assert.throws(() => event('everyone'), error => error.code === 'LIVE_INVALID_EVENT');
});

test('forward migration backfills only proven audiences and fails old unknown semantics closed', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations',
        'add_streamer_security_live_acl.sql'), 'utf8');
    assert.match(sql, /WHEN event_type IN[\s\S]*'interaction\.opened'[\s\S]*THEN 'both'/);
    assert.match(sql, /'interaction\.reported'[\s\S]*THEN 'creator'/);
    assert.match(sql, /ELSE 'system'/);
    assert.doesNotMatch(sql, /ELSE 'both'/);
    assert.match(sql, /ALTER COLUMN audience DROP DEFAULT/);
    assert.match(sql, /OLD\.member_status = 'left'/);
    assert.match(sql, /streamer_game_trusted_events[\s\S]*response_status/);
});

test('realtime delivery isolates roles, emits both once, and revalidates stale recipients', async () => {
    const creator = socket({ username: 'creator', userId: 2, role: 'creator' });
    const owner = socket({ username: 'owner', userId: 1, role: 'owner' });
    const sockets = new Map([[1, creator], [2, owner]]);
    const denied = new Set();
    const delivery = new LiveEventDelivery({
        sockets: () => sockets.values(),
        loadEvent: async value => value,
        authorizeSession: async auth => !denied.has(auth.username),
        authorizeRecipient: async (stored, subscription, auth, realtimeAudience) => (
            !denied.has(auth.username)
            && stored.interactionId === subscription.interactionId
            && (stored.audience === 'both' || stored.audience === subscription.role)
            && (realtimeAudience === 'both' || realtimeAudience === subscription.role)
        )
    });

    await delivery.deliver({ event: event('creator'), realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 1);
    assert.equal(owner.emitted.length, 0);

    await delivery.deliver({ event: event('owner'), realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 1);
    assert.equal(owner.emitted.length, 1);

    const shared = event('both');
    await delivery.deliver({ event: shared, realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 2);
    assert.equal(owner.emitted.length, 2);
    await delivery.deliver({ event: shared, realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 2);
    assert.equal(owner.emitted.length, 2, 'duplicate bus delivery must not emit twice');

    denied.add('creator');
    await delivery.deliver({ event: event('both'), realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 2, 'stale creator socket must be revalidated before every event');
    assert.equal(owner.emitted.length, 3);

    await delivery.deliver({ event: event('system'), realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 2);
    assert.equal(owner.emitted.length, 3, 'system events must not reach either participant');

    denied.delete('creator');
    creator.liveInteractionSubscriptions.get(41).replayFloorSequence = 50;
    await delivery.deliver({ event: event('creator', { sequence: 49 }), realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 2,
        'a delayed pre-subscription bus notification must not replay an old event');
    await delivery.deliver({ event: event('creator', { sequence: 51 }), realtimeAudience: 'both' });
    assert.equal(creator.emitted.length, 3,
        'an event newer than the recovered cursor remains realtime-visible');
});

test('mixed role pagination over 240 durable events has no gaps, duplicates, or hidden-event loop', async () => {
    const rows = Array.from({ length: 240 }, (_, index) => {
        const audience = ['creator', 'owner', 'both', 'system'][index % 4];
        return {
            interaction_id: 41,
            event_id: crypto.randomUUID(),
            sequence: index + 1,
            protocol_version: 1,
            event_type: audience === 'system' ? 'interaction.closed' : 'interaction.nudge',
            audience,
            actor_type: audience === 'creator' ? 'creator' : audience === 'system' ? 'system' : 'owner',
            subject_user_id: 2,
            created_at: '2026-08-17T12:00:00.000Z',
            payload: {},
            correlation_id: crypto.randomUUID(),
            state_revision: index + 1
        };
    });
    const pool = {
        async connect() {},
        async query(sql, parameters) {
            const role = parameters[3] || parameters[1];
            const visible = rows.filter(row => row.audience === 'both' || row.audience === role);
            if (/MAX\(sequence\)/.test(sql)) {
                return { rows: [{ maximum: visible.at(-1)?.sequence || 0 }] };
            }
            return { rows: visible.filter(row => row.sequence > parameters[1])
                .slice(0, parameters[2]) };
        }
    };
    const repository = new LiveInteractionRepository({ pool });
    repository.readMemberRoom = async (interactionId, username) => ({
        id: interactionId,
        creatorUserId: 2,
        memberRole: username,
        memberStatus: 'active'
    });
    for (const role of ['creator', 'owner']) {
        const events = [];
        let cursor = 0;
        for (let page = 0; page < 20; page += 1) {
            const result = await repository.catchUp(41, role, cursor, 23);
            events.push(...result.events);
            if (!result.hasMore) break;
            assert.ok(result.nextAfter > cursor);
            cursor = result.nextAfter;
        }
        assert.equal(events.length, 120);
        assert.equal(new Set(events.map(value => value.eventId)).size, 120);
        assert.ok(events.every(value => value.audience === role || value.audience === 'both'));
        assert.ok(events.every((value, index) => index === 0 || value.sequence > events[index - 1].sequence));
    }
});

test('REST catch-up and room snapshot revalidate membership after their data reads', async () => {
    const row = {
        interaction_id: 41,
        event_id: crypto.randomUUID(),
        sequence: 1,
        protocol_version: 1,
        event_type: 'interaction.nudge',
        audience: 'both',
        actor_type: 'owner',
        subject_user_id: 2,
        created_at: '2026-08-17T12:00:00.000Z',
        payload: {},
        correlation_id: crypto.randomUUID(),
        state_revision: 1
    };
    const pool = {
        async connect() {},
        async query(sql) {
            if (/MAX\(sequence\)/.test(sql)) return { rows: [{ maximum: 1 }] };
            if (/FROM live_interaction_items/.test(sql)) return { rows: [] };
            return { rows: [row] };
        }
    };
    const repository = new LiveInteractionRepository({ pool });
    const active = { id: 41, memberRole: 'owner', memberStatus: 'active',
        creatorUserId: 2, ownerUserId: 1 };
    let checks = 0;
    repository.readMemberRoom = async () => (++checks === 1 ? active : null);
    assert.equal(await repository.catchUp(41, 'owner', 0, 10), null);

    checks = 0;
    repository.readMemberRoom = async () => (++checks === 1 ? active : null);
    assert.equal(await repository.roomState(41, 'owner'), null);
});

test('continuous coop policy rejects every withdrawal boundary with a stable reason', () => {
    const base = {
        run: { id: 'run', gameId: 'signal-duet', mode: 'coop', status: 'active',
            creatorUserId: 2, ownerUserId: 1, liveInteractionId: 41 },
        creator: { id: 2, username: 'creator', authorized: true, deactivated: false,
            account_locked: false },
        owner: { id: 1, username: 'owner', authorized: true, deactivated: false,
            account_locked: false, is_admin: true },
        room: { id: 41, creatorUserId: 2, ownerUserId: 1, status: 'active',
            creatorMemberStatus: 'active', ownerMemberStatus: 'active',
            liveInteractionOptIn: true, reportStatus: null, creatorReconsentedAt: null,
            mutedUntil: null, allMessagesPreference: 'neutral', gamePreference: 'neutral' },
        ownerUsername: 'owner',
        now: new Date('2026-08-17T12:00:00Z')
    };
    assert.equal(evaluateCoopConsent(base).allowed, true);
    const cases = [
        [value => { value.room.status = 'left'; }, 'live_room_inactive'],
        [value => { value.room.creatorMemberStatus = 'left'; }, 'membership_inactive'],
        [value => { value.room.liveInteractionOptIn = false; }, 'global_opt_out'],
        [value => { value.room.reportStatus = 'open'; }, 'unresolved_report'],
        [value => { value.room.reportStatus = 'resolved'; }, 'unresolved_report'],
        [value => { value.room.mutedUntil = '2026-08-17T12:30:00Z'; }, 'room_muted'],
        [value => { value.room.allMessagesPreference = 'block'; }, 'communication_blocked'],
        [value => { value.room.gamePreference = 'block'; }, 'game_preference_blocked'],
        [value => { value.creator.deactivated = true; }, 'creator_account_inactive'],
        [value => { value.creator.account_locked = true; }, 'account_locked'],
        [value => { value.owner.deactivated = true; }, 'owner_account_inactive'],
        [value => { value.owner.is_admin = false; }, 'owner_role_invalid']
    ];
    for (const [mutate, reason] of cases) {
        const value = structuredClone(base);
        mutate(value);
        assert.equal(evaluateCoopConsent(value).reason, reason);
    }
});

test('consent abandonment is CAS-idempotent and writes one immutable event plus audit reason', async () => {
    const rows = { events: [], audits: [], current: null };
    const gameRepository = {
        async abandonRunForConsent(client, run, state, reason, at) {
            if (rows.current) return null;
            rows.current = { ...run, state, status: 'abandoned', revision: run.revision + 1,
                consentRevokedReason: reason, consentRevokedAt: at };
            return rows.current;
        },
        async appendEvent(client, value) {
            rows.events.push(value);
            return { ...value };
        },
        async insertAudit(client, value) { rows.audits.push(value); }
    };
    const coordinator = new CoopConsentCoordinator({ gameRepository,
        liveRepository: { async lockCoopConsent() {} }, ownerUsername: 'owner',
        clock: () => new Date('2026-08-17T12:00:00Z') });
    const run = { id: crypto.randomUUID(), gameId: 'signal-duet', mode: 'coop', status: 'active',
        revision: 0, score: 0, state: { status: 'active', score: 0, history: [] } };
    const first = await coordinator.abandonLockedRun({}, run, 'global_opt_out',
        { actorUserId: 2, actorUsername: 'creator' });
    const replay = await coordinator.abandonLockedRun({}, run, 'global_opt_out');
    assert.equal(first.run.status, 'abandoned');
    assert.equal(replay, null);
    assert.equal(rows.events.length, 1);
    assert.equal(rows.events[0].actionSummary.reason, 'global_opt_out');
    assert.equal(rows.audits.length, 1);
    assert.equal(rows.audits[0].details.immutableEventId, rows.events[0].eventId);
});

test('two delivery instances sharing authorization state enforce the same audience ACL', async () => {
    const allowed = new Map([['creator', true], ['owner', true]]);
    const creatorA = socket({ username: 'creator', userId: 2, role: 'creator' });
    const ownerA = socket({ username: 'owner', userId: 1, role: 'owner' });
    const creatorB = socket({ username: 'creator', userId: 2, role: 'creator' });
    const ownerB = socket({ username: 'owner', userId: 1, role: 'owner' });
    const createDelivery = localSockets => new LiveEventDelivery({
        sockets: () => localSockets.values(),
        loadEvent: async value => value,
        authorizeSession: async auth => allowed.get(auth.username) === true,
        authorizeRecipient: async (stored, subscription, auth) => allowed.get(auth.username) === true
            && (stored.audience === 'both' || stored.audience === subscription.role)
    });
    const instances = [
        createDelivery(new Map([[1, creatorA], [2, ownerA]])),
        createDelivery(new Map([[1, creatorB], [2, ownerB]]))
    ];

    await Promise.all(instances.map(instance => instance.deliver({ event: event('creator') })));
    assert.deepEqual([creatorA.emitted.length, ownerA.emitted.length, creatorB.emitted.length,
        ownerB.emitted.length], [1, 0, 1, 0]);

    allowed.set('creator', false);
    await Promise.all(instances.map(instance => instance.deliver({ event: event('both') })));
    assert.deepEqual([creatorA.emitted.length, ownerA.emitted.length, creatorB.emitted.length,
        ownerB.emitted.length], [1, 1, 1, 1]);
});

test('socket subscription joins only a precise authenticated role/user room and revalidates coop consent', async () => {
    const handlers = {};
    const joined = [];
    const left = [];
    const socketValue = {
        authenticatedUser: { username: 'creator', userId: 2, sessionId: 'session' },
        join: value => joined.push(value),
        leave: value => left.push(value),
        on: (name, handler) => { handlers[name] = handler; },
        emit: () => {},
        disconnect: () => {}
    };
    let consent = true;
    const gateway = new LiveSocketGateway({
        enabled: true,
        authorize: async () => true,
        authorizeGameSubscription: async () => {
            if (!consent) {
                const error = new Error('Consent revoked');
                error.code = 'GAME_COOP_CONSENT_REVOKED';
                error.status = 403;
                throw error;
            }
            return { role: 'creator', userId: 2 };
        },
        service: {
            catchUp: async () => ({ success: true, events: [], lastSequence: 4,
                subscription: { role: 'creator', userId: 2 } }),
            acknowledge: async () => ({ success: true }),
            creatorAction: async () => ({ success: true })
        }
    });
    gateway.attach(socketValue);
    let first;
    await handlers['live:subscribe']({ interactionId: 41, gameId: 'signal-duet',
        runId: crypto.randomUUID(), afterSequence: 0 }, value => { first = value; });
    assert.equal(first.success, true);
    assert.deepEqual(joined, ['live:interaction:41:creator:user:2']);
    assert.equal(joined.some(value => value === 'live:interaction:41' || value === 'live:user:2'), false);

    consent = false;
    let second;
    await handlers['live:subscribe']({ interactionId: 41, gameId: 'signal-duet',
        runId: crypto.randomUUID(), afterSequence: 0 }, value => { second = value; });
    assert.equal(second.code, 'GAME_COOP_CONSENT_REVOKED');
    assert.deepEqual(left, ['live:interaction:41:creator:user:2']);
});

test('REST state fails closed when consent is withdrawn between room listing and snapshot read', async () => {
    const gameIds = [...new Set(Object.values(TEMPLATES)
        .filter(template => template.type === 'game_invite')
        .flatMap(template => template.referenceIds))];
    const storyNodeIds = [...new Set(Object.values(TEMPLATES)
        .filter(template => template.type === 'story_intervention')
        .flatMap(template => template.storyNodeIds))];
    const repository = {
        pool: { async query() { return { rows: [] }; } },
        async withTransaction(work) { return work({}); },
        async readAccount() {
            return { id: 2, username: 'creator', timezone: 'UTC', live_interaction_opt_in: true };
        },
        async listCreatorRooms() {
            return [{ id: 41, memberRole: 'creator', creatorUserId: 2, ownerUserId: 1 }];
        },
        async roomState() { return null; },
        async latestReportRecovery() { return null; },
        async creatorBoundaries() {
            return { preferences: {}, quietHours: [], interactionWindows: [] };
        }
    };
    const service = new LiveInteractionService({ repository, ownerUsername: 'owner', gameIds,
        storyNodeIds });
    const result = await service.state('creator', 41);
    assert.deepEqual(result, {
        success: true,
        rooms: [],
        interaction: null,
        items: [],
        recent: []
    });
});
