'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    CreatorValidationError,
    validateInteractionWindows,
    validatePreferences,
    validateProfile,
    validateQuietHours,
    validateRoomId
} = require('../domain/creators/profile');
const { projectRelationship } = require('../domain/creators/relationship');
const { CreatorRepository } = require('../repositories/creator-repository');
const { CreatorProfileService } = require('../services/creator-profile-service');
const { FLAG_NAMES, readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const { validateServerEnvironment } = require('../lib/config-validation');
const { ROUTE_MANIFEST, IDEMPOTENT_WRITE_PATHS } = require('../routes/manifest');

const root = path.resolve(__dirname, '..');
const source = (filename) => fs.readFileSync(path.join(root, filename), 'utf8');

function validProfile(overrides = {}) {
    return {
        displayName: 'Star Creator',
        bio: 'Cooperative puzzle streams',
        pronouns: 'they/them',
        timezone: 'Asia/Shanghai',
        interactionTones: ['friend', 'story_partner'],
        difficulty: 'guided',
        storyTone: 'mystery',
        communicationStyle: 'async',
        liveInteractionOptIn: false,
        profileVisibility: 'private',
        evidenceRetention: 'minimum',
        expectedVersion: 0,
        ...overrides
    };
}

test('creator feature switches default off and require both foundation gates', () => {
    const defaults = readStreamerWorldFlags({});
    for (const name of FLAG_NAMES) assert.equal(defaults[name], false, name);
    assert.equal(defaults.creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true' }).creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags({ CREATOR_PROFILE_ENABLED: 'true' }).creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true'
    }).creatorFoundationEnabled, true);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'TRUE',
        CREATOR_PROFILE_ENABLED: 'true'
    }).creatorFoundationEnabled, false, 'runtime reader also fails closed on non-canonical values');
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: 'owner_account' }).ownerUsername, 'owner_account');
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: 'not valid!' }).ownerUsername, null);
});

test('server environment validation keeps streamer flags on strict lowercase boolean contract', () => {
    const configSource = source('lib/config-validation.js');
    for (const name of FLAG_NAMES) assert.match(configSource, new RegExp(`'${name}'`));
    assert.match(configSource, /!\['true', 'false'\]\.includes\(value\)/);
    const example = source('.env.example');
    for (const name of FLAG_NAMES) assert.match(example, new RegExp(`^${name}=false$`, 'm'));
    const previous = process.env.STREAMER_WORLD_ENABLED;
    process.env.STREAMER_WORLD_ENABLED = 'TRUE';
    try {
        assert.throws(() => validateServerEnvironment(), /STREAMER_WORLD_ENABLED must be true or false/);
    } finally {
        if (previous === undefined) delete process.env.STREAMER_WORLD_ENABLED;
        else process.env.STREAMER_WORLD_ENABLED = previous;
    }
    const previousOwner = process.env.STREAMER_WORLD_OWNER_USERNAME;
    process.env.STREAMER_WORLD_OWNER_USERNAME = 'invalid owner!';
    try {
        assert.throws(() => validateServerEnvironment(), /STREAMER_WORLD_OWNER_USERNAME/);
    } finally {
        if (previousOwner === undefined) delete process.env.STREAMER_WORLD_OWNER_USERNAME;
        else process.env.STREAMER_WORLD_OWNER_USERNAME = previousOwner;
    }
});

test('profile validation normalizes bounded data and validates IANA timezones', () => {
    const profile = validateProfile(validProfile({ displayName: '  Ｓｔａｒ  ' }));
    assert.equal(profile.displayName, 'Star');
    assert.deepEqual(profile.interactionTones, ['friend', 'story_partner']);
    assert.equal(profile.liveInteractionOptIn, false);
    assert.throws(() => validateProfile(validProfile({ timezone: 'Moon/Base' })), CreatorValidationError);
    assert.throws(() => validateProfile(validProfile({ interactionTones: ['friend', 'mentor', 'co_creator', 'quiet_support'] })), /interaction tones/);
    assert.throws(() => validateProfile(validProfile({ bio: 'x'.repeat(501) })), /bio/);
    assert.throws(() => validateProfile(validProfile({ expectedVersion: -1 })), /version/);
});

test('preference validation uses closed vocabularies and rejects duplicates', () => {
    const validated = validatePreferences([
        { type: 'quest_category', key: 'story', value: 'allow' },
        { type: 'game', key: 'quiz', value: 'avoid' },
        { type: 'communication', key: 'game_invites', value: 'block' }
    ], { gameIds: ['quiz'] });
    assert.equal(validated.length, 3);
    assert.throws(() => validatePreferences([
        { type: 'game', key: 'unknown-game', value: 'allow' }
    ], { gameIds: ['quiz'] }), /preference/);
    assert.throws(() => validatePreferences([
        { type: 'evidence', key: 'text', value: 'allow' },
        { type: 'evidence', key: 'text', value: 'block' }
    ]), /preference/);
});

test('quiet hours support overnight windows but reject duplicate days and empty windows', () => {
    assert.deepEqual(validateQuietHours([
        { weekday: 1, startMinute: 1320, endMinute: 480, enabled: true }
    ]), [{ weekday: 1, startMinute: 1320, endMinute: 480, enabled: true }]);
    assert.throws(() => validateQuietHours([
        { weekday: 1, startMinute: 600, endMinute: 600 }
    ]), /quiet-hours/);
    assert.throws(() => validateQuietHours([
        { weekday: 1, startMinute: 600, endMinute: 700 },
        { weekday: 1, startMinute: 800, endMinute: 900 }
    ]), /quiet-hours/);
});

test('preferred interaction windows are independently bounded and typed', () => {
    assert.deepEqual(validateInteractionWindows([
        { weekday: 2, startMinute: 1080, endMinute: 1320, mode: 'live' }
    ]), [{ weekday: 2, startMinute: 1080, endMinute: 1320, mode: 'live', enabled: true }]);
    assert.throws(() => validateInteractionWindows([
        { weekday: 2, startMinute: 100, endMinute: 110, mode: 'live' }
    ]), /interaction window/);
    assert.throws(() => validateInteractionWindows([
        { weekday: 2, startMinute: 100, endMinute: 900, mode: 'live' }
    ]), /interaction window/);
    assert.throws(() => validateInteractionWindows([
        { weekday: 2, startMinute: 100, endMinute: 200, mode: 'unbounded' }
    ]), /interaction window/);
});

test('room identifiers are canonical positive decimal strings', () => {
    assert.equal(validateRoomId(' 123456 '), '123456');
    for (const invalid of ['', '0', '0012', '-3', '12a', '1'.repeat(13)]) {
        assert.throws(() => validateRoomId(invalid), /room ID/);
    }
});

test('relationship projection is deterministic and has no negative-XP path', () => {
    assert.deepEqual(projectRelationship(0), {
        totalXp: 0, level: 1, milestone: 'new_signal', nextLevelXp: 50,
        progressToNext: 0, requiredForNext: 50
    });
    assert.equal(projectRelationship(150).milestone, 'trusted_partner');
    assert.equal(projectRelationship(900).nextLevelXp, null);
    assert.throws(() => projectRelationship(-1), /relationship XP/);
});

test('relationship source identity replays only when semantics match', async () => {
    const event = {
        userId: 7,
        eventType: 'creator.profile.created',
        xpDelta: 10,
        sourceType: 'creator_profile',
        sourceId: 'onboarding-v1',
        summaryZh: '创建主播世界资料',
        summaryEn: 'Created a Creator World profile',
        metadata: { beta: { y: 2, x: 1 }, alpha: true }
    };
    const matchingClient = {
        calls: 0,
        async query() {
            this.calls += 1;
            if (this.calls === 1) return { rowCount: 0, rows: [] };
            return { rows: [{
                event_type: event.eventType,
                xp_delta: event.xpDelta,
                summary_zh: event.summaryZh,
                summary_en: event.summaryEn,
                metadata: { alpha: true, beta: { x: 1, y: 2 } }
            }] };
        }
    };
    assert.equal(await CreatorRepository.prototype.appendRelationshipEvent.call({}, matchingClient, event), false);
    const conflictingClient = {
        calls: 0,
        async query() {
            this.calls += 1;
            if (this.calls === 1) return { rowCount: 0, rows: [] };
            return { rows: [{
                event_type: event.eventType,
                xp_delta: 999,
                summary_zh: event.summaryZh,
                summary_en: event.summaryEn,
                metadata: { alpha: true, beta: { x: 1, y: 3 } }
            }] };
        }
    };
    await assert.rejects(
        CreatorRepository.prototype.appendRelationshipEvent.call({}, conflictingClient, event),
        (error) => error.code === 'RELATIONSHIP_EVENT_IDENTITY_CONFLICT'
    );
});

class MemoryCreatorRepository {
    constructor() {
        this.user = { id: 4, username: 'creator', bilibili_room_id: null };
        this.profile = null;
        this.preferences = [];
        this.quietHours = [];
        this.interactionWindows = [];
        this.roomRequest = null;
        this.relationship = { totalXp: 0, level: 1, milestone: 'new_signal', version: 0 };
        this.events = new Map();
        this.consent = [];
        this.welcomeMemory = false;
        this.welcomeInbox = false;
        this.finalizedInsideTransaction = false;
        this.inTransaction = false;
        this.transactionTail = Promise.resolve();
        this.failAt = null;
    }

    async withTransaction(work) {
        const previous = this.transactionTail;
        let release;
        this.transactionTail = new Promise((resolve) => { release = resolve; });
        await previous;
        const snapshot = structuredClone({
            profile: this.profile,
            preferences: this.preferences,
            quietHours: this.quietHours,
            interactionWindows: this.interactionWindows,
            roomRequest: this.roomRequest,
            relationship: this.relationship,
            events: this.events,
            consent: this.consent,
            welcomeMemory: this.welcomeMemory,
            welcomeInbox: this.welcomeInbox
        });
        this.inTransaction = true;
        try {
            return await work({});
        } catch (error) {
            Object.assign(this, snapshot);
            throw error;
        } finally {
            this.inTransaction = false;
            release();
        }
    }
    async lockUser() { return this.user; }
    async getProfile() { return this.profile ? structuredClone(this.profile) : null; }
    async saveProfile(client, userId, profile) {
        this.profile = { ...profile, userId, version: (this.profile?.version || 0) + 1 };
        return structuredClone(this.profile);
    }
    async appendConsentEvent(client, event) {
        if (this.failAt === 'consent') throw new Error('consent write failed');
        this.consent.push(structuredClone(event));
    }
    async appendRelationshipEvent(client, event) {
        if (this.failAt === 'relationship') throw new Error('relationship write failed');
        const key = `${event.sourceType}:${event.sourceId}`;
        if (this.events.has(key)) return false;
        this.events.set(key, event);
        return true;
    }
    async lockRelationship() { return this.relationship; }
    async saveRelationship(client, userId, projection) {
        this.relationship = { ...projection, version: this.relationship.version + 1 };
        return this.relationship;
    }
    async ensureWelcomeMemory() { this.welcomeMemory = true; }
    async ensureWelcomeInbox() { this.welcomeInbox = true; }
    async listPreferences() { return structuredClone(this.preferences); }
    async replacePreferences(client, userId, preferences) { this.preferences = structuredClone(preferences); }
    async listQuietHours() { return structuredClone(this.quietHours); }
    async replaceQuietHours(client, userId, windows) { this.quietHours = structuredClone(windows); }
    async listInteractionWindows() { return structuredClone(this.interactionWindows); }
    async replaceInteractionWindows(client, userId, windows) { this.interactionWindows = structuredClone(windows); }
    async getActiveRoomRequest() { return this.roomRequest; }
    async createRoomRequest(client, user, roomId, note) {
        this.roomRequest = { id: 8, requestedRoomId: roomId, status: 'requested', requestNote: note };
        return this.roomRequest;
    }
    async cancelRoomRequest(client, userId, requestId) {
        if (!this.roomRequest || requestId !== this.roomRequest.id) return null;
        this.roomRequest = { ...this.roomRequest, status: 'cancelled' };
        return this.roomRequest;
    }
    async loadDashboard() {
        return {
            account: { username: this.user.username, bilibiliRoomId: this.user.bilibili_room_id },
            profile: this.profile,
            preferences: this.preferences,
            quietHours: this.quietHours,
            interactionWindows: this.interactionWindows,
            roomRequest: this.roomRequest,
            relationship: this.relationship,
            memories: [],
            inbox: []
        };
    }
    async listAdminSummaries() { return []; }
    async exportCreatorData() {
        return {
            account: { username: this.user.username, bilibiliRoomId: this.user.bilibili_room_id },
            profile: this.profile,
            preferences: this.preferences,
            quietHours: this.quietHours,
            interactionWindows: this.interactionWindows,
            relationship: this.relationship,
            memories: [],
            inbox: [],
            consentEvents: this.consent
        };
    }
}

test('first profile save atomically creates consent, relationship, memory, inbox, and idempotency record', async () => {
    const repository = new MemoryCreatorRepository();
    const service = new CreatorProfileService({ repository, gameIds: ['quiz'] });
    let finalBody;
    const result = await service.updateProfile('creator', validProfile(), {
        requestId: 'request-one',
        async finalizeIdempotency(client, status, body) {
            assert.equal(repository.inTransaction, true);
            assert.equal(status, 200);
            finalBody = body;
        }
    });
    assert.equal(result.profile.version, 1);
    assert.equal(finalBody.profile.displayName, 'Star Creator');
    assert.equal(repository.relationship.totalXp, 10);
    assert.equal(repository.consent[0].eventType, 'creator.profile.created');
    assert.equal(repository.welcomeMemory, true);
    assert.equal(repository.welcomeInbox, true);
});

test('profile optimistic version rejects stale writes before mutation', async () => {
    const repository = new MemoryCreatorRepository();
    const service = new CreatorProfileService({ repository });
    await service.updateProfile('creator', validProfile());
    await assert.rejects(
        service.updateProfile('creator', validProfile({ displayName: 'Stale', expectedVersion: 0 })),
        (error) => error.code === 'CREATOR_PROFILE_VERSION_CONFLICT' && error.status === 409
    );
    assert.equal(repository.profile.displayName, 'Star Creator');
});

test('concurrent profile creation serializes on account ownership and only one stale version wins', async () => {
    const repository = new MemoryCreatorRepository();
    const service = new CreatorProfileService({ repository });
    const outcomes = await Promise.allSettled([
        service.updateProfile('creator', validProfile({ displayName: 'First contender' })),
        service.updateProfile('creator', validProfile({ displayName: 'Second contender' }))
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.equal(rejected.reason.code, 'CREATOR_PROFILE_VERSION_CONFLICT');
    assert.equal(repository.profile.version, 1);
    assert.equal(repository.relationship.totalXp, 10);
    assert.equal(repository.events.size, 1);
    assert.equal(repository.consent.length, 1);
});

for (const failurePoint of ['consent', 'relationship', 'finalize']) {
    test(`profile transaction rolls back every projection when ${failurePoint} fails`, async () => {
        const repository = new MemoryCreatorRepository();
        const service = new CreatorProfileService({ repository });
        if (failurePoint !== 'finalize') repository.failAt = failurePoint;
        await assert.rejects(service.updateProfile('creator', validProfile(), {
            async finalizeIdempotency() {
                if (failurePoint === 'finalize') throw new Error('idempotency finalize failed');
            }
        }));
        assert.equal(repository.profile, null);
        assert.equal(repository.relationship.totalXp, 0);
        assert.equal(repository.events.size, 0);
        assert.equal(repository.consent.length, 0);
        assert.equal(repository.welcomeMemory, false);
        assert.equal(repository.welcomeInbox, false);
    });
}

test('concurrent relationship source inserts yield one write and one semantic replay', async () => {
    const event = {
        userId: 7,
        eventType: 'creator.profile.created',
        xpDelta: 10,
        sourceType: 'creator_profile',
        sourceId: 'onboarding-concurrent-v1',
        summaryZh: '创建主播世界资料',
        summaryEn: 'Created a Creator World profile',
        metadata: { version: 1 }
    };
    let inserted = false;
    const row = {
        event_type: event.eventType,
        xp_delta: event.xpDelta,
        summary_zh: event.summaryZh,
        summary_en: event.summaryEn,
        metadata: event.metadata
    };
    const client = {
        async query(sql) {
            if (/INSERT INTO relationship_events/.test(sql)) {
                await Promise.resolve();
                if (inserted) return { rowCount: 0, rows: [] };
                inserted = true;
                return { rowCount: 1, rows: [{ id: 1 }] };
            }
            return { rowCount: 1, rows: [row] };
        }
    };
    const results = await Promise.all([
        CreatorRepository.prototype.appendRelationshipEvent.call({}, client, event),
        CreatorRepository.prototype.appendRelationshipEvent.call({}, client, event)
    ]);
    assert.deepEqual(results.sort(), [false, true]);
});

test('preference and quiet-hours replacement append consent without relationship penalties', async () => {
    const repository = new MemoryCreatorRepository();
    const service = new CreatorProfileService({ repository, gameIds: ['quiz'] });
    await service.updatePreferences('creator', { preferences: [
        { type: 'communication', key: 'game_invites', value: 'block' },
        { type: 'game', key: 'quiz', value: 'avoid' }
    ] });
    await service.updateQuietHours('creator', { quietHours: [
        { weekday: 5, startMinute: 1320, endMinute: 480 }
    ] });
    assert.equal(repository.relationship.totalXp, 0);
    assert.deepEqual(repository.consent.map((event) => event.eventType), [
        'creator.preferences.replaced', 'creator.quiet_hours.replaced'
    ]);
    assert.equal(repository.preferences[0].value, 'block');
});

test('preferred interaction windows require profile timezone and remain separate from quiet hours', async () => {
    const repository = new MemoryCreatorRepository();
    const service = new CreatorProfileService({ repository });
    await assert.rejects(
        service.updateInteractionWindows('creator', { interactionWindows: [] }),
        (error) => error.code === 'CREATOR_PROFILE_REQUIRED'
    );
    await service.updateProfile('creator', validProfile({ timezone: 'America/Toronto' }));
    const result = await service.updateInteractionWindows('creator', { interactionWindows: [
        { weekday: 6, startMinute: 1080, endMinute: 1320, mode: 'either' }
    ] });
    assert.equal(result.timezone, 'America/Toronto');
    assert.equal(repository.quietHours.length, 0);
    assert.equal(repository.interactionWindows[0].mode, 'either');
    assert.equal(repository.consent.at(-1).eventType, 'creator.interaction_windows.replaced');
});

test('room request workflow records intent and never mutates the bound room', async () => {
    const repository = new MemoryCreatorRepository();
    const service = new CreatorProfileService({ repository });
    const created = await service.requestRoomBinding('creator', { roomId: '987654', note: 'Main room' });
    assert.equal(created.request.status, 'requested');
    assert.equal(repository.user.bilibili_room_id, null);
    await assert.rejects(
        service.requestRoomBinding('creator', { roomId: '123456' }),
        (error) => error.code === 'ROOM_REQUEST_ACTIVE'
    );
    const cancelled = await service.cancelRoomBindingRequest('creator', 8);
    assert.equal(cancelled.request.status, 'cancelled');
    assert.equal(repository.user.bilibili_room_id, null);
});

test('existing secure bind resolves matching requests and rejects superseded ones with consent events', async () => {
    const consent = [];
    const repository = {
        appendConsentEvent: async (client, event) => consent.push(event)
    };
    const client = {
        async query(sql, values) {
            assert.match(sql, /UPDATE creator_room_binding_requests/);
            assert.deepEqual(values, [4, '2222', 'owner']);
            return { rows: [
                { id: '10', requested_room_id: '2222', status: 'approved' },
                { id: '11', requested_room_id: '3333', status: 'rejected' }
            ] };
        }
    };
    const rows = await CreatorRepository.prototype.resolveRoomRequestsOnExistingBind.call(
        repository,
        client,
        { userId: 4, roomId: '2222', reviewerUsername: 'owner', requestId: 'bind-key' }
    );
    assert.deepEqual(rows.map((row) => row.status), ['approved', 'rejected']);
    assert.deepEqual(consent.map((event) => event.eventType), [
        'creator.room_binding.approved', 'creator.room_binding.rejected'
    ]);
    assert.ok(consent.every((event) => event.actorType === 'admin'));
});

test('creator export is owner-scoped and excludes balance and provider payloads', async () => {
    const repository = new MemoryCreatorRepository();
    const service = new CreatorProfileService({ repository });
    await service.updateProfile('creator', validProfile());
    const exported = await service.exportData('creator');
    assert.equal(exported.account.username, 'creator');
    assert.equal(exported.profile.displayName, 'Star Creator');
    assert.equal(Object.hasOwn(exported.account, 'balance'), false);
    assert.equal(JSON.stringify(exported).includes('provider'), false);
});

test('creator mutations use literal paths protected by exact idempotency matching', () => {
    const expected = [
        'PUT /api/creator/profile',
        'PUT /api/creator/preferences',
        'PUT /api/creator/quiet-hours',
        'PUT /api/creator/interaction-windows',
        'POST /api/creator/room-binding-requests',
        'POST /api/creator/room-binding-requests/cancel',
        'PATCH /api/creator/memories',
        'POST /api/creator/inbox/read',
        'POST /api/creator/inbox/archive'
    ];
    const declared = ROUTE_MANIFEST
        .filter((entry) => entry.path.startsWith('/api/creator/'))
        .map((entry) => `${entry.method} ${entry.path}`);
    assert.deepEqual(declared, expected);
    for (const entry of ROUTE_MANIFEST.filter((item) => item.path.startsWith('/api/creator/'))) {
        assert.equal(entry.path.includes(':'), false);
        assert.equal(entry.policies.includes('idempotent'), true);
        assert.equal(IDEMPOTENT_WRITE_PATHS.includes(entry.path), true);
        assert.deepEqual(entry.policies.slice(0, 5), [
            'login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf'
        ]);
    }
});

test('creator migration is append-only, bounded, and does not touch financial or provider tables', () => {
    const sql = source('migrations/add_creator_foundation.sql');
    for (const table of [
        'creator_profiles', 'creator_preferences', 'creator_quiet_hours', 'creator_interaction_windows',
        'creator_room_binding_requests', 'creator_consent_events', 'relationship_events',
        'relationship_profiles', 'shared_memories', 'creator_inbox_messages'
    ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    assert.match(sql, /creator_reject_append_only_mutation/);
    assert.match(sql, /BEFORE UPDATE OR DELETE ON creator_consent_events/);
    assert.match(sql, /BEFORE UPDATE OR DELETE ON relationship_events/);
    assert.match(sql, /shared memory provenance is immutable/);
    assert.match(sql, /creator inbox content is immutable/);
    assert.match(sql, /'owner_note', 'quest_invitation', 'story_letter'/);
    assert.match(sql, /WHERE status IN \('requested', 'verifying'\)/);
    assert.doesNotMatch(sql, /UPDATE\s+(?:users|gift_exchanges|wish_inventory|balance_logs)\b/i);
    assert.match(source('lib/database-migrations.js'), /'add_creator_foundation\.sql'/);
});

test('creator UI is bilingual, accessible, mobile-ready, and uses safe DOM APIs', () => {
    const pages = [
        source('views/creator-home.ejs'),
        source('views/creator-profile.ejs'),
        source('views/admin-creator-director.ejs')
    ];
    for (const page of pages) {
        assert.match(page, /lang === 'zh'/);
        assert.match(page, /viewport/);
        assert.match(page, /creator-world\.css/);
    }
    const ejs = require('ejs');
    for (const page of pages) assert.doesNotThrow(() => ejs.compile(page));
    const scripts = source('public/js/creator-home.js') + source('public/js/creator-profile.js');
    assert.doesNotMatch(scripts, /\.innerHTML\s*=/);
    assert.match(scripts, /window\.idempotentFetch/);
    assert.match(scripts, /X-CSRF-Token/);
    assert.match(source('public/creator-world.css'), /@media \(max-width: 760px\)/);
    assert.match(source('public/creator-world.css'), /min-height: 48px/);
});

test('Creator Director keeps room binding outside creator modules while Phase 4 adds isolated live mutations', () => {
    const adminRoute = source('routes/admin-creator-director.js');
    assert.match(adminRoute, /app\.get\('\/admin\/creator-director'/);
    assert.match(adminRoute, /app\.post\('\/api\/admin\/live\/send'/);
    assert.match(adminRoute, /requireConfiguredOwner/);
    const combined = [
        source('routes/creators.js'),
        source('services/creator-profile-service.js'),
        source('repositories/creator-repository.js')
    ].join('\n');
    assert.doesNotMatch(combined, /bilibili_gift_sender|enqueueWishInventorySend|gift_exchanges|wish_inventory|BalanceLogger/);
    assert.doesNotMatch(combined, /UPDATE\s+users\s+SET\s+bilibili_room_id/i);
    const adminSource = source('routes/admin.js');
    assert.match(adminSource, /creatorRepository\.resolveRoomRequestsOnExistingBind/);
    assert.match(adminSource, /prepareExternalWorkForAccountTransition/);
});

test('disabled feature middleware returns a clean 404 before creator handlers', () => {
    const registerCreatorRoutes = require('../routes/creators');
    const registrations = [];
    const app = {};
    for (const method of ['get', 'put', 'post', 'patch']) {
        app[method] = (routePath, ...handlers) => registrations.push({ method, routePath, handlers });
    }
    const requireLogin = (req, res, next) => next();
    const requireAuthorized = (req, res, next) => next();
    const requireCSRF = (req, res, next) => next();
    const basicRateLimit = (req, res, next) => next();
    const userActionRateLimit = (req, res, next) => next();
    const readHeavyRateLimit = (req, res, next) => next();
    registerCreatorRoutes(app, {
        creatorService: { dashboard() {} },
        streamerWorldFlags: { creatorFoundationEnabled: false },
        generateCSRFToken() { return 'token'; },
        requireLogin,
        requireAuthorized,
        requireCSRF,
        security: { basicRateLimit, userActionRateLimit, readHeavyRateLimit }
    });
    assert.equal(registrations.length, 13);
    const page = registrations.find((entry) => entry.routePath === '/creator');
    const response = {
        locals: { lang: 'en' },
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        send(body) { this.body = body; return this; }
    };
    let continued = false;
    page.handlers[3]({ path: '/creator' }, response, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(response.statusCode, 404);
    assert.equal(response.body, 'Creator World is not available');
    const write = registrations.find((entry) => entry.routePath === '/api/creator/profile');
    assert.deepEqual(write.handlers.slice(0, 5), [
        requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, requireCSRF
    ]);
    const apiResponse = {
        locals: { lang: 'en' },
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };
    write.handlers[5]({ path: '/api/creator/profile' }, apiResponse, () => {});
    assert.equal(apiResponse.statusCode, 404);
    assert.equal(apiResponse.payload.code, 'FEATURE_DISABLED');
});
