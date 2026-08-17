'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { CreatorProfileService } = require('../services/creator-profile-service');
const { LiveInteractionService } = require('../services/live-interaction-service');
const { TEMPLATES } = require('../content/streamer-world/live-interactions/templates');

const uuid = () => crypto.randomUUID();

const gameIds = [...new Set(Object.values(TEMPLATES)
    .filter(template => template.type === 'game_invite')
    .flatMap(template => template.referenceIds))];
const storyNodeIds = [...new Set(Object.values(TEMPLATES)
    .filter(template => template.type === 'story_intervention')
    .flatMap(template => template.storyNodeIds))];

function liveServiceOptions(overrides = {}) {
    return { ownerUsername: 'owner', gameIds, storyNodeIds, ...overrides };
}

function account(overrides = {}) {
    return {
        id: 2,
        username: 'creator',
        authorized: true,
        deactivated: false,
        account_locked: false,
        live_interaction_opt_in: true,
        timezone: 'UTC',
        ...overrides
    };
}

test('one boundary policy handles overnight Toronto, Shanghai, UTC, and both DST folds', () => {
    const { evaluateCommunicationBoundary } = require(
        '../services/creator-communication-boundary-policy');
    const preferred = [{ weekday: 1, startMinute: 22 * 60, endMinute: 2 * 60,
        mode: 'live', enabled: true }];
    const base = {
        account: account(), preferences: {}, quietHours: [], interactionWindows: preferred,
        room: null, report: null
    };
    for (const [timezone, now] of [
        ['America/Toronto', '2026-08-18T05:30:00.000Z'],
        ['Asia/Shanghai', '2026-08-17T17:30:00.000Z'],
        ['UTC', '2026-08-18T01:30:00.000Z']
    ]) {
        const result = evaluateCommunicationBoundary({
            ...base, account: account({ timezone }), now: new Date(now)
        });
        assert.equal(result.preferred, true, `${timezone} lost the previous weekday overnight window`);
    }

    const dstWindow = [{ weekday: 0, startMinute: 60, endMinute: 4 * 60,
        mode: 'live', enabled: true }];
    for (const now of [
        '2026-03-08T06:45:00.000Z', // 01:45 EST, before the spring gap.
        '2026-03-08T07:15:00.000Z', // 03:15 EDT, after the spring gap.
        '2026-11-01T05:30:00.000Z', // first 01:30 during the fall fold.
        '2026-11-01T06:30:00.000Z' // second 01:30 during the fall fold.
    ]) {
        assert.equal(evaluateCommunicationBoundary({
            ...base,
            account: account({ timezone: 'America/Toronto' }),
            interactionWindows: dstWindow,
            now: new Date(now)
        }).preferred, true, `DST local time ${now} should be inside the authored window`);
    }
});

test('quiet and preferred windows preserve durable delivery while hard boundaries fail closed', () => {
    const { evaluateCommunicationBoundary } = require(
        '../services/creator-communication-boundary-policy');
    const quiet = evaluateCommunicationBoundary({
        account: account(), preferences: {},
        quietHours: [{ weekday: 1, startMinute: 0, endMinute: 1439, enabled: true }],
        interactionWindows: [], room: null, report: null,
        now: new Date('2026-08-17T12:00:00.000Z')
    });
    assert.equal(quiet.allowDurable, true);
    assert.equal(quiet.allowRealtime, false);
    assert.equal(quiet.allowInteractive, false);

    const outsidePreferred = evaluateCommunicationBoundary({
        account: account(), preferences: {}, quietHours: [],
        interactionWindows: [{ weekday: 1, startMinute: 60, endMinute: 120,
            mode: 'live', enabled: true }], room: null, report: null,
        now: new Date('2026-08-17T12:00:00.000Z')
    });
    assert.equal(outsidePreferred.allowDurable, true);
    assert.equal(outsidePreferred.allowRealtime, false);
    assert.equal(outsidePreferred.allowInteractive, false);

    const asyncOnly = evaluateCommunicationBoundary({
        account: account(), preferences: {}, quietHours: [],
        interactionWindows: [{ weekday: 1, startMinute: 0, endMinute: 1439,
            mode: 'async', enabled: true }], room: null, report: null,
        now: new Date('2026-08-17T12:00:00.000Z')
    });
    assert.equal(asyncOnly.allowDurable, true);
    assert.equal(asyncOnly.asyncPreferred, true);
    assert.equal(asyncOnly.allowRealtime, false,
        'an async-only schedule must not silently enable realtime all day');
    const disabledOnly = evaluateCommunicationBoundary({
        account: account(), preferences: {}, quietHours: [],
        interactionWindows: [{ weekday: 1, startMinute: 0, endMinute: 1439,
            mode: 'live', enabled: false }], room: null, report: null,
        now: new Date('2026-08-17T12:00:00.000Z')
    });
    assert.equal(disabledOnly.allowRealtime, true,
        'no enabled schedule retains the documented default availability');

    for (const [input, reason] of [
        [{ preferences: { all_messages: 'block' } }, 'communication_blocked'],
        [{ preferences: { game_invites: 'block' }, itemType: 'game_invite' }, 'item_preference_blocked'],
        [{ preferences: { 'game:signal-duet': 'block' }, gameId: 'signal-duet' },
            'game_preference_blocked'],
        [{ room: { mutedUntil: '2026-08-18T00:00:00.000Z' } }, 'room_muted'],
        [{ report: { status: 'resolved', creatorReconsentedAt: null } }, 'unresolved_report']
    ]) {
        const result = evaluateCommunicationBoundary({
            account: account(), preferences: {}, quietHours: [], interactionWindows: [],
            room: null, report: null, now: new Date('2026-08-17T12:00:00.000Z'), ...input
        });
        assert.equal(result.allowDurable, false);
        assert.equal(result.reason, reason);
    }
});

test('room state computes communication boundary independently for every room', async () => {
    const rooms = [{
        id: 1, key: 'one', status: 'active', revision: 1, nextSequence: 2,
        creatorUserId: 2, ownerUserId: 1, creatorUsername: 'creator', ownerUsername: 'owner',
        availability: 'available', mutedUntil: null, memberRole: 'creator', memberStatus: 'active'
    }, {
        id: 2, key: 'two', status: 'active', revision: 1, nextSequence: 2,
        creatorUserId: 2, ownerUserId: 1, creatorUsername: 'creator', ownerUsername: 'owner',
        availability: 'available', mutedUntil: '2026-08-18T00:00:00.000Z',
        memberRole: 'creator', memberStatus: 'active'
    }];
    const repository = {
        pool: {},
        withTransaction() {},
        async readAccount(username) {
            return username === 'owner'
                ? account({ id: 1, username: 'owner', is_admin: true,
                    live_interaction_opt_in: false }) : account();
        },
        async readAccountsByIds() { return new Map([[2, account()]]); },
        async listCreatorRooms(username) {
            return structuredClone(rooms).map(room => ({ ...room,
                memberRole: username === 'owner' ? 'owner' : 'creator' }));
        },
        async roomState(id) {
            return { room: structuredClone(rooms.find(room => room.id === id)), items: [], recent: [], report: null };
        },
        async creatorBoundaries() {
            return { preferences: {}, quietHours: [], interactionWindows: [] };
        },
        async latestReportRecovery() { return null; }
    };
    const service = new LiveInteractionService(liveServiceOptions({ repository,
        clock: () => new Date('2026-08-17T12:00:00.000Z') }));
    const state = await service.state('creator', 1);
    assert.equal(state.rooms[0].presence, 'available');
    assert.equal(state.rooms[1].mutedUntil, '2026-08-18T00:00:00.000Z');
    assert.equal(state.rooms[1].presence, 'available',
        'creator retains their own presence projection while each room keeps its own mute result');

    const ownerState = await service.state('owner', 1);
    assert.equal(ownerState.rooms[0].presence, 'available');
    assert.equal(ownerState.rooms[1].presence, 'offline');
});

test('Director locks and revalidates the configured owner while reading and auditing one snapshot',
    async () => {
        const client = { transaction: true };
        const audits = [];
        let transactions = 0;
        const repository = {
            pool: { outsideTransaction: true },
            async withTransaction(work) {
                transactions++;
                return work(client);
            },
            async readAccount(username, queryable, options) {
                assert.equal(username, 'owner');
                assert.equal(queryable, client);
                assert.equal(options.lock, true);
                return { id: 1, username: 'owner', is_admin: true, authorized: true,
                    deactivated: false, account_locked: false };
            },
            async directorSummary(queryable, page) {
                assert.equal(queryable, client);
                assert.equal(page, 2);
                return { page: 2, pageSize: 25, creators: [{
                    userId: 2, username: 'creator', displayName: 'Private creator',
                    profileVisibility: 'owner', liveInteractionOptIn: true,
                    boundaryTimezone: 'UTC', interaction: null
                }] };
            },
            async creatorBoundaries(queryable) {
                assert.equal(queryable, client);
                return { preferences: {}, quietHours: [], interactionWindows: [], report: null };
            },
            async listReports(queryable, options) {
                assert.equal(queryable, client);
                assert.equal(options.includeEvidence, false);
                return [];
            },
            async appendSensitiveReadAudit(queryable, value) {
                assert.equal(queryable, client);
                audits.push(value);
            }
        };
        const service = new LiveInteractionService(liveServiceOptions({ repository }));
        const result = await service.director('owner', 2, { requestId: 'one-snapshot' });
        assert.equal(result.creators[0].displayName, 'Private creator');
        assert.equal(transactions, 1);
        assert.deepEqual(audits.map(value => [value.accessKind, value.targetUserId, value.decision]), [
            ['owner_profile', 2, 'granted']
        ]);
    });

test('Director recent history SQL exposes only owner and shared durable audiences', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'repositories',
        'live-interaction-repository.js'), 'utf8');
    const director = source.slice(source.indexOf('async directorSummary('),
        source.indexOf('async listReports(', source.indexOf('async directorSummary(')));
    assert.match(director, /audience\s+IN\s*\(\s*'both'\s*,\s*'owner'\s*\)/i);
    assert.doesNotMatch(director, /WHERE lie\.interaction_id=room\.id ORDER BY/,
        'Director history must never aggregate creator/system events before filtering');
});

test('configured-owner Director route uses the one audited Live snapshot without a duplicate foundation read',
    async () => {
        const register = require('../routes/admin-creator-director');
        const routes = [];
        const pass = (req, res, next) => next();
        let foundationReads = 0;
        let directorReads = 0;
        register({
            get(pathname, ...handlers) { routes.push({ pathname, handlers }); },
            post() {}
        }, {
            creatorService: {
                async adminSummaries() { foundationReads++; return { creators: [] }; }
            },
            liveInteractionService: {
                async director() {
                    directorReads++;
                    return { page: 1, pageSize: 25, creators: [], reports: [], templates: [] };
                },
                async moderationQueue() { return { reports: [], templates: [] }; },
                open() {}, send() {}, moderate() {}
            },
            streamerWorldFlags: {
                creatorFoundationEnabled: true,
                liveInteractionsEnabled: true,
                ownerUsername: 'owner',
                rewardsEnabled: false
            },
            generateCSRFToken: () => 'csrf',
            requireLogin: pass, requireAdmin: pass, requireCSRF: pass,
            security: {
                readHeavyRateLimit: pass, basicRateLimit: pass, userActionRateLimit: pass
            }
        });
        const route = routes.find(value => value.pathname === '/admin/creator-director');
        const req = { query: {}, requestId: 'route-snapshot',
            session: { user: { username: 'owner' } } };
        const res = {
            locals: { lang: 'en' }, set() {},
            render(view, model) { this.view = view; this.model = model; },
            status(code) { this.statusCode = code; return this; }, send() { return this; }
        };
        for (const handler of route.handlers) {
            let continued = false;
            const returned = handler(req, res, () => { continued = true; });
            if (returned?.then) await returned;
            if (!continued && res.view) break;
        }
        assert.equal(res.view, 'admin-creator-director');
        assert.equal(directorReads, 1);
        assert.equal(foundationReads, 0,
            'the configured owner must not create a second profile snapshot or duplicate audit');
    });

test('owner-visible profile fields are available only to configured owner and every admin read is audited',
    async () => {
        const audits = [];
        const repository = {
            async loadDashboard() { return { profile: { displayName: 'Self' } }; },
            async withTransaction(work) { return work({}); },
            async readAdminAccount(client, username) {
                const values = {
                    owner: { id: 1, is_admin: true, authorized: true },
                    'other-admin': { id: 3, is_admin: true, authorized: true },
                    deactivated: { id: 4, is_admin: true, authorized: true, deactivated: true },
                    locked: { id: 5, is_admin: true, authorized: true, account_locked: true },
                    unauthorized: { id: 6, is_admin: true, authorized: false }
                }[username];
                return values ? { username, deactivated: false, account_locked: false, ...values } : null;
            },
            async listAdminSummaries(client, options) {
                return [{ username: 'creator', displayName: options.includeOwnerPrivate ? 'Private name' : null,
                    timezone: options.includeOwnerPrivate ? 'Asia/Shanghai' : null,
                    bilibiliRoomId: options.includeOwnerPrivate ? '123' : null,
                    liveInteractionOptIn: options.includeOwnerPrivate ? true : null,
                    profileVisibility: 'owner' }];
            },
            async appendSensitiveReadAudit(client, value) { audits.push(value); }
        };
        const service = new CreatorProfileService({ repository, ownerUsername: 'owner' });
        const owner = await service.adminSummaries('owner', 1, { requestId: 'owner-read' });
        const unrelated = await service.adminSummaries('other-admin', 1, { requestId: 'admin-read' });
        assert.equal(owner.creators[0].displayName, 'Private name');
        assert.equal(unrelated.creators[0].displayName, null);
        assert.equal(unrelated.creators[0].timezone, null);
        assert.equal(unrelated.creators[0].bilibiliRoomId, null);
        assert.deepEqual(audits.map(value => [value.actorUsername, value.decision]), [
            ['owner', 'granted'], ['other-admin', 'redacted']
        ]);
        for (const username of ['deactivated', 'locked', 'unauthorized', 'missing']) {
            await assert.rejects(service.adminSummaries(username, 1),
                error => error.code === 'CREATOR_PROFILE_READ_FORBIDDEN');
        }
        const withoutConfiguredOwner = new CreatorProfileService({ repository });
        const noOwner = await withoutConfiguredOwner.adminSummaries('owner', 1,
            { requestId: 'missing-owner-read' });
        assert.equal(noOwner.creators[0].displayName, null,
            'owner-only fields fail closed when no configured owner exists');
        assert.equal((await service.dashboard('creator')).profile.displayName, 'Self');
    });

class ModerationRepository {
    constructor() {
        this.report = { id: 7, interaction_id: 11, reporter_user_id: 2,
            reason_code: 'harassment', detail: 'private evidence', status: 'open' };
        this.room = { id: 11, key: 'reported', status: 'reported', revision: 2, nextSequence: 3,
            creatorUserId: 2, ownerUserId: 1, creatorUsername: 'creator', ownerUsername: 'owner',
            memberRole: 'owner', memberStatus: 'active', highestAckSequence: 0 };
        this.audits = [];
        this.commands = new Map();
    }
    async withTransaction(work) { return work({}); }
    async lockModerationContext(client, values) {
        const moderator = values.moderatorUsername === 'moderator'
            ? { id: 3, username: 'moderator', is_admin: true, authorized: true,
                deactivated: false, account_locked: false }
            : { id: 1, username: 'owner', is_admin: true, authorized: true,
                deactivated: false, account_locked: false };
        return { room: structuredClone(this.room), report: structuredClone(this.report), moderator,
            owner: { id: 1, username: 'owner', is_admin: true } };
    }
    // Legacy owner path: proves the pre-fix implementation permits self-moderation.
    async readRoomIdentity() { return { creator_username: 'creator', owner_username: 'owner' }; }
    async lockAccounts() {
        return { creator: account(), owner: { id: 1, username: 'owner', is_admin: true } };
    }
    async lockMemberRoom() { return structuredClone(this.room); }
    async findCommand(client, roomId, actorId, commandId) {
        return this.commands.get(`${actorId}:${commandId}`) || null;
    }
    async resolveReport(client, reportId, reviewerId, status) {
        if (reportId !== this.report.id || this.report.status !== 'open') return null;
        this.report.status = status;
        this.report.reviewer_user_id = reviewerId;
        this.room.status = 'closed';
        this.room.revision += 1;
        return { report: structuredClone(this.report), room: structuredClone(this.room) };
    }
    async appendEvent(client, event) { return { ...event, sequence: 3, protocolVersion: 1,
        createdAt: '2026-08-17T12:00:00.000Z' }; }
    async saveCommand(client, command) {
        this.commands.set(`${command.actorUserId}:${command.commandId}`, {
            semantic_hash: command.semanticHash, response_body: command.body
        });
    }
    async insertAudit(client, audit) { this.audits.push(audit); }
    async appendSensitiveReadAudit(client, audit) { this.audits.push(audit); }
}

test('configured owner cannot inspect or resolve a report against them; independent moderator can', async () => {
    const repository = new ModerationRepository();
    const service = new LiveInteractionService(liveServiceOptions({ repository,
        clock: () => new Date('2026-08-17T12:00:00.000Z') }));
    const base = { interactionId: 11, reportId: 7, expectedRevision: 2,
        resolution: 'resolved' };
    await assert.rejects(service.moderate('owner', { ...base, commandId: uuid() }),
        error => error.code === 'LIVE_INDEPENDENT_MODERATOR_REQUIRED');
    const resolved = await service.moderate('moderator', { ...base, commandId: uuid() });
    assert.equal(resolved.reportStatus, 'resolved');
    assert.equal(repository.report.reviewer_user_id, 3);
    assert.equal(repository.audits.at(-1).actorType, 'moderator');
});

test('report evidence reads lock and revalidate the administrator in the audited transaction', async () => {
    const readAudits = [];
    let evidenceQueries = 0;
    const client = { transaction: true };
    const repository = {
        pool: {},
        async withTransaction(work) { return work(client); },
        async readAccount(username, queryable, options) {
            assert.equal(queryable, client);
            assert.equal(options.lock, true);
            if (['deactivated', 'locked', 'unauthorized'].includes(username)) return null;
            return { id: username === 'owner' ? 1 : 3, username, is_admin: true,
                authorized: true, deactivated: false, account_locked: false };
        },
        async listReports(queryable, { includeEvidence }) {
            assert.equal(queryable, client);
            evidenceQueries++;
            return [{ id: 7, interactionId: 11, reasonCode: includeEvidence ? 'harassment' : null,
                detail: includeEvidence ? 'private evidence' : null,
                evidenceRedacted: !includeEvidence }];
        },
        async appendSensitiveReadAudit(queryable, value) {
            assert.equal(queryable, client);
            readAudits.push(value);
        }
    };
    const service = new LiveInteractionService(liveServiceOptions({ repository }));
    const owner = await service.reportsForActor('owner', { includeEvidence: false },
        { requestId: 'owner-report-read' });
    assert.equal(owner[0].detail, null);
    assert.equal(owner[0].evidenceRedacted, true);
    const moderator = await service.reportsForActor('moderator', { includeEvidence: true },
        { requestId: 'moderator-report-read' });
    assert.equal(moderator[0].detail, 'private evidence');
    assert.deepEqual(readAudits.map(value => value.decision), ['redacted', 'granted']);
    for (const username of ['deactivated', 'locked', 'unauthorized']) {
        await assert.rejects(service.reportsForActor(username, { includeEvidence: true }),
            error => error.code === 'LIVE_INDEPENDENT_MODERATOR_REQUIRED');
    }
    assert.equal(evidenceQueries, 2,
        'revoked administrators fail before evidence is selected or audited as granted');
});

test('privacy migration is forward-only, makes moderator provenance explicit, and protects read audits', () => {
    const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations',
        'add_streamer_security_communication_privacy.sql'), 'utf8');
    assert.match(migration, /creator_sensitive_read_audit/);
    assert.match(migration, /moderator/);
    assert.match(migration, /append-only/i);
    assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE/i);
    const profileClient = fs.readFileSync(path.join(__dirname, '..', 'public', 'js',
        'creator-profile.js'), 'utf8');
    assert.match(profileClient,
        /event\.currentTarget\.querySelectorAll\('\.creator-quiet-row'\)/,
        'quiet-hour submit must not read preferred-window rows that share layout classes');
});
