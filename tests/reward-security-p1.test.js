'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    evaluateRewardAccess
} = require('../domain/rewards/catalog');
const {
    ACHIEVEMENT_PRODUCER_MATRIX,
    validateAchievementProducerMatrix
} = require('../domain/achievements/producer-matrix');
const { ACHIEVEMENTS } = require('../content/streamer-world/achievements/catalog');
const {
    publishedStoryInterventionRegistry
} = require('../domain/story/published-content-registry');
const { RewardGrantDispatcher } = require('../services/reward-grant-dispatcher');
const { RewardGrantIntentError, RewardGrantIntentWriter } = require('../services/reward-grant-intent-writer');
const { RewardCatalogService } = require('../services/reward-catalog-service');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');
const registerCreatorRewardRoutes = require('../routes/creator-rewards');
const giftConfig = require('../gift-codes.json');
const rewardPack = require('../content/streamer-world/rewards/catalog');
const { TEMPLATES } = require('../content/streamer-world/live-interactions/templates');
const { LiveInteractionService } = require('../services/live-interaction-service');
const {
    renderMatrix,
    validateProducerReferences
} = require('../scripts/generate-achievement-producer-matrix');

test('reward multi-account authority uses one global audit-compatible row order', () => {
    const repositorySource = Function.prototype.toString.call(RewardCatalogRepository.prototype.lockAccounts);
    assert.match(repositorySource, /ORDER BY u\.id\s+FOR NO KEY UPDATE OF u/i);
    assert.doesNotMatch(repositorySource, /\bFOR UPDATE\b/i);
});

function item(overrides = {}) {
    return {
        id: 7,
        lifecycle: 'active',
        visibility_type: 'open',
        visibility_key: null,
        visibility_start: null,
        visibility_end: null,
        owner_grant_only: false,
        per_user_limit: 2,
        stock_limit: 10,
        cooldown_hours: 0,
        ...overrides
    };
}

function facts(overrides = {}) {
    return {
        sourceType: 'direct_redemption',
        unlockKeys: new Set(),
        userItemCount: 0,
        stockUsed: 0,
        pendingCount: 0,
        cooldownUntil: null,
        now: new Date('2026-08-17T12:00:00.000Z'),
        ...overrides
    };
}

test('one reward access policy hides locked, owner-only, out-of-season, and retired identities', () => {
    assert.deepEqual(evaluateRewardAccess(item(), facts()), {
        visible: true,
        eligible: true,
        reasonCode: null
    });
    for (const [candidate, candidateFacts] of [
        [item({ visibility_type: 'story_unlock', visibility_key: 'story:key' }), facts()],
        [item({ visibility_type: 'achievement_unlock', visibility_key: 'achievement:first' }), facts()],
        [item({ visibility_type: 'owner_only', owner_grant_only: true }), facts()],
        [item({ visibility_type: 'season_window', visibility_start: '2025-01-01T00:00:00Z',
            visibility_end: '2026-01-01T00:00:00Z' }), facts()],
        [item({ lifecycle: 'retired' }), facts()]
    ]) {
        const access = evaluateRewardAccess(candidate, candidateFacts);
        assert.equal(access.visible, false);
        assert.equal(access.eligible, false);
        assert.equal(access.reasonCode, 'REWARD_ITEM_NOT_FOUND');
    }
});

test('the same policy authorizes matching immutable unlocks and only exposes owner grants to the owner flow', () => {
    const achievement = item({ visibility_type: 'achievement_unlock',
        visibility_key: 'achievement:constellation-first-repair' });
    assert.equal(evaluateRewardAccess(achievement, facts({
        unlockKeys: new Set(['achievement:constellation-first-repair'])
    })).eligible, true);
    const owner = item({ visibility_type: 'owner_only', owner_grant_only: true });
    assert.equal(evaluateRewardAccess(owner, facts({ sourceType: 'owner_grant' })).eligible, true);
    assert.equal(evaluateRewardAccess(item(), facts({ sourceType: 'owner_grant' })).visible, false);
});

test('all sixty published achievements have a machine-checked trusted producer and integration test', () => {
    assert.equal(ACHIEVEMENTS.length, 60);
    assert.equal(ACHIEVEMENT_PRODUCER_MATRIX.length, 60);
    assert.equal(validateAchievementProducerMatrix(ACHIEVEMENTS, ACHIEVEMENT_PRODUCER_MATRIX), true);
    assert.equal(validateProducerReferences(ACHIEVEMENT_PRODUCER_MATRIX), true);
    assert.equal((renderMatrix().match(/^\| [a-z0-9-]+ \|/gm) || []).length, 60);
    for (const row of ACHIEVEMENT_PRODUCER_MATRIX) {
        assert.match(row.producer, /#[A-Za-z][A-Za-z0-9]+$/);
        assert.match(row.integrationTest, /^tests\//);
        assert.ok(row.sourceIdentity.length >= 8);
    }
});

test('published story intervention registry binds authored nodes across all five immutable season versions', () => {
    assert.equal(publishedStoryInterventionRegistry.seasons.length, 5);
    assert.ok(publishedStoryInterventionRegistry.nodes.length >= 30);
    assert.equal(new Set(publishedStoryInterventionRegistry.nodes.map(row => row.bindingKey)).size,
        publishedStoryInterventionRegistry.nodes.length);
    assert.deepEqual(new Set(publishedStoryInterventionRegistry.seasons.map(row => row.season)),
        new Set(['signal-between-us', 'tides-of-return', 'city-of-borrowed-hours',
            'archive-of-wild-stars', 'homeward-constellation']));
    const covered = new Set(Object.values(TEMPLATES)
        .filter(template => template.type === 'story_intervention')
        .flatMap(template => template.storyNodeIds));
    assert.ok(publishedStoryInterventionRegistry.nodeIds.every(nodeId => covered.has(nodeId)));
});

test('story interventions authorize the creator current node against its exact published season version', async () => {
    const season = publishedStoryInterventionRegistry.seasons[1];
    const binding = publishedStoryInterventionRegistry.nodes.find(row => row.season === season.season);
    const template = Object.values(TEMPLATES).find(item => item.type === 'story_intervention'
        && item.storyNodeIds.includes(binding.nodeId));
    let contentVersion = binding.version;
    const repository = {
        async withTransaction(work) { return work({}); },
        async validateStoryTarget() {
            return { runId: 7, nodeId: binding.nodeId, revision: 3,
                seasonSlug: binding.season, contentVersion };
        }
    };
    const service = new LiveInteractionService({
        repository,
        ownerUsername: 'owner',
        gameIds: ['doudizhu', 'adventure', 'quiz'],
        storyInterventionRegistry: publishedStoryInterventionRegistry,
        storyEnabled: true
    });
    const command = { itemType: 'story_intervention', referenceId: null,
        targetStoryNode: binding.nodeId };
    await service.validateReference({}, { id: 5 }, command, template);
    contentVersion += 1;
    await assert.rejects(service.validateReference({}, { id: 5 }, command, template),
        error => error.code === 'LIVE_STORY_TARGET_MISMATCH' && error.status === 409);
});

test('reward intent writer detects semantic identity collisions inside the source transaction', async () => {
    const rows = new Map();
    const client = { async query(sql, values) {
        if (sql.includes('INSERT INTO reward_grant_intents')) {
            const key = `${values[1]}:${values[2]}`;
            if (rows.has(key)) return { rowCount: 0, rows: [] };
            const row = { id: values[0], source_type: values[1], source_event_id: values[2],
                user_id: values[3], catalog_slug: values[4], semantic_hash: values[5],
                payload: JSON.parse(values[6]), status: 'pending' };
            rows.set(key, row);
            return { rowCount: 1, rows: [row] };
        }
        if (sql.includes('FROM reward_grant_intents')) {
            return { rowCount: 1, rows: [rows.get(`${values[0]}:${values[1]}`)] };
        }
        if (sql.includes('INSERT INTO reward_grant_intent_events')) return { rowCount: 1, rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
    } };
    const writer = new RewardGrantIntentWriter();
    const source = { sourceType: 'game', sourceEventId: 'game-run:one-completed', userId: 4,
        catalogSlug: 'starlight-studio-badge', payload: { runId: 'one' } };
    const first = await writer.enqueue(client, source);
    const replay = await writer.enqueue(client, source);
    assert.equal(first.inserted, true);
    assert.equal(replay.inserted, false);
    await assert.rejects(writer.enqueue(client, { ...source, catalogSlug: 'dream-compass-key' }),
        error => error instanceof RewardGrantIntentError && error.code === 'REWARD_GRANT_INTENT_COLLISION');
});

test('dispatcher retries response loss without duplicating settlement and exposes terminal dead letters', async () => {
    const repository = {
        batches: [[{ id: 'intent-1' }], [{ id: 'intent-2' }], []],
        failed: [],
        async claimBatch() { return this.batches.shift(); },
        async failClaim(intent, workerId, error) { this.failed.push({ intent, workerId, error });
            return { status: intent.id === 'intent-2' ? 'dead_letter' : 'pending' }; },
        async listDeadLetters() { return [{ id: 'intent-2', status: 'dead_letter' }]; }
    };
    const settlements = new Set();
    const rewardService = { async dispatchClaimedIntent(intent) {
        if (intent.id === 'intent-2') throw Object.assign(new Error('budget unavailable'), { code: 'REWARD_BUDGET_EXCEEDED' });
        settlements.add(intent.id);
        throw Object.assign(new Error('commit response lost'), { committed: true });
    } };
    const dispatcher = new RewardGrantDispatcher({ repository, rewardService, workerId: 'reward-worker-test' });
    const first = await dispatcher.dispatchBatch();
    const second = await dispatcher.dispatchBatch();
    assert.equal(settlements.size, 1);
    assert.equal(first.committedAfterResponseLoss, 1);
    assert.equal(second.deadLettered, 1);
    assert.equal((await repository.listDeadLetters()).length, 1);
});

test('order event allocation owns the parent lock and rejects a missing order before sequence allocation',
    async () => {
        const calls = [];
        const repository = new RewardCatalogRepository({
            pool: { connect() {}, query() {} }
        });
        const client = { async query(sql) {
            calls.push(sql);
            if (calls.length === 1) return { rowCount: 1, rows: [{ id: 'order' }] };
            if (calls.length === 2) return { rowCount: 1, rows: [{ sequence: 4 }] };
            return { rowCount: 1, rows: [] };
        } };
        assert.equal(await repository.appendOrderEvent(client, {
            eventId: 'event', orderId: 'order', eventType: 'order_approved', details: {}
        }), 4);
        assert.match(calls[0], /SELECT id FROM reward_orders[\s\S]*FOR UPDATE/);
        assert.match(calls[1], /MAX\(sequence\)/);
        assert.match(calls[2], /INSERT INTO reward_order_events/);

        const missingClient = { async query() { return { rowCount: 0, rows: [] }; } };
        await assert.rejects(repository.appendOrderEvent(missingClient, {
            eventId: 'event', orderId: 'missing', eventType: 'order_submitted', details: {}
        }), error => error?.code === 'REWARD_ORDER_NOT_FOUND');
    });

function catalogRow(id, overrides = {}) {
    return {
        id, version_id: id, catalog_version: rewardPack.catalogVersion, version: 1,
        lifecycle: 'active', slug: `security-item-${id}`, kind: 'cosmetic',
        title_zh: `安全奖励 ${id}`, title_en: `Security reward ${id}`,
        description_zh: `仅用于奖励可见性行为测试 ${id}`,
        description_en: `Reward visibility behavior test item ${id}`,
        art_key: `security-${id}`, points_price: 0, exposure_value: 0,
        provider_gift_type: null, stock_limit: 10, per_user_limit: 2,
        cooldown_hours: 0, approval_policy: 'automatic', visibility_type: 'open',
        visibility_key: null, visibility_start: null, visibility_end: null,
        owner_grant_only: false, ...overrides
    };
}

class VisibilityRepository {
    constructor() {
        this.account = { id: 8, username: 'creator', balance: 100, authorized: true,
            deactivated: false, account_locked: false };
        this.unlocks = new Set();
        this.items = new Map([
            [101, catalogRow(101, { visibility_type: 'story_unlock', visibility_key: 'story:reward-one' })],
            [102, catalogRow(102, { visibility_type: 'achievement_unlock',
                visibility_key: 'achievement:constellation-first-repair' })],
            [103, catalogRow(103, { visibility_type: 'owner_only', owner_grant_only: true })],
            [104, catalogRow(104, { visibility_type: 'season_window',
                visibility_start: '2027-01-01T00:00:00Z', visibility_end: '2028-01-01T00:00:00Z' })],
            [105, catalogRow(105, { lifecycle: 'retired' })],
            [106, catalogRow(106)]
        ]);
        this.commands = new Map();
        this.wishlistRows = [];
    }
    async withTransaction(work) { return work(this); }
    async lockAccounts() { return new Map([['creator', this.account]]); }
    async listCatalog() { return [...this.items.values()].map(row => ({ ...row,
        stock_used: 0, user_item_count: 0, pending_count: 0, cooldown_until: null,
        has_unlock: !row.visibility_key || this.unlocks.has(row.visibility_key) })); }
    async lockCatalogVersion(client, id) { return this.items.get(Number(id)) || null; }
    async eligibilityFacts() { return { stock_used: 0, user_item_count: 0,
        pending_count: 0, last_approved: null }; }
    async hasVisibilityUnlock(client, userId, type, key) { return !key || this.unlocks.has(key); }
    async findCommand(client, userId, commandId) { return this.commands.get(`${userId}:${commandId}`) || null; }
    async upsertWishlist(client, userId, command) {
        const row = { user_id: userId, catalog_version_id: command.catalogVersionId,
            target_quantity: command.targetQuantity, priority: command.priority, revision: 0 };
        this.wishlistRows.push(row);
        return row;
    }
    async saveCommand(client, value) { this.commands.set(`${value.actorUserId}:${value.commandId}`,
        { semantic_hash: value.semanticHash, response_status: value.status, response_body: value.body }); }
    async audit() {}
}

function visibilityService(repository = new VisibilityRepository()) {
    return { repository, service: new RewardCatalogService({ repository,
        BalanceLogger: { async updateBalance() { return { success: true, balance: 100 }; } },
        giftConfig, clock: () => new Date('2026-08-17T12:00:00Z') }) };
}

test('catalog, detail, wishlist, redemption policy, and hidden enumeration share generic authorization', async () => {
    const { repository, service } = visibilityService();
    assert.deepEqual((await service.catalog('creator')).items.map(row => row.id), [106]);
    const hiddenErrors = [];
    for (const id of [101, 102, 103, 104, 105, 999]) {
        await assert.rejects(service.itemDetail('creator', id), error => {
            hiddenErrors.push({ status: error.status, code: error.code, message: error.message });
            return true;
        });
    }
    assert.equal(new Set(hiddenErrors.map(error => JSON.stringify(error))).size, 1);
    assert.deepEqual(hiddenErrors[0], { status: 404, code: 'REWARD_ITEM_NOT_FOUND',
        message: 'Reward item not found' });
    await assert.rejects(service.wishlist('creator', { commandId: '00000000-0000-4000-a000-000000000101',
        catalogVersionId: 101, targetQuantity: 1, priority: 1 }),
    error => error.code === 'REWARD_ITEM_NOT_FOUND' && error.status === 404);
    repository.unlocks.add('story:reward-one');
    repository.unlocks.add('achievement:constellation-first-repair');
    assert.deepEqual((await service.catalog('creator')).items.map(row => row.id), [101, 102, 106]);
    assert.equal((await service.itemDetail('creator', 102)).item.id, 102);
    assert.equal((await service.wishlist('creator', {
        commandId: '00000000-0000-4000-a000-000000000102', catalogVersionId: 101,
        targetQuantity: 1, priority: 1 })).wishlist.catalogVersionId, 101);
});

test('hidden and unknown catalog IDs have the same authenticated API 404 response', async () => {
    const { service } = visibilityService();
    const routes = new Map();
    const app = {
        get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
        post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); }
    };
    const pass = (req, res, next) => next();
    registerCreatorRewardRoutes(app, {
        rewardCatalogService: service,
        streamerWorldFlags: { rewardsEnabled: true },
        generateCSRFToken: () => 'csrf',
        requireLogin: pass,
        requireAuthorized: pass,
        requireAdmin: pass,
        requireCSRF: pass,
        security: { basicRateLimit: pass, userActionRateLimit: pass, readHeavyRateLimit: pass },
        paidActionConcurrencyGuard: pass
    });
    const handler = routes.get('GET /api/creator-rewards/catalog/:catalogVersionId');
    async function request(id) {
        const output = { status: 200, body: null };
        const res = {
            set() {},
            status(value) { output.status = value; return this; },
            json(value) { output.body = value; return value; }
        };
        await handler({ params: { catalogVersionId: String(id) },
            session: { user: { username: 'creator' } } }, res);
        return output;
    }
    const hidden = await request(101);
    const unknown = await request(999999);
    assert.deepEqual(hidden, unknown);
    assert.deepEqual(hidden, { status: 404, body: {
        success: false, code: 'REWARD_ITEM_NOT_FOUND', message: 'Reward item not found'
    } });
});

test('creator reward page is authorization-gated and its rendered catalog omits hidden identities', async () => {
    const { service } = visibilityService();
    service.state = async () => ({ success: true, orders: [], wishlist: [], assets: [] });
    const routes = new Map();
    const app = {
        get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
        post() {}
    };
    const pass = (req, res, next) => next();
    const requireLogin = (req, res, next) => req.session?.user ? next()
        : res.status(401).send('login required');
    const requireAuthorized = (req, res, next) => req.session?.user?.authorized === true ? next()
        : res.status(403).send('not authorized');
    registerCreatorRewardRoutes(app, {
        rewardCatalogService: service,
        streamerWorldFlags: { rewardsEnabled: true },
        generateCSRFToken: () => 'csrf',
        requireLogin,
        requireAuthorized,
        requireAdmin: pass,
        requireCSRF: pass,
        security: { basicRateLimit: pass, userActionRateLimit: pass, readHeavyRateLimit: pass },
        paidActionConcurrencyGuard: pass
    });
    async function execute(session) {
        const output = { status: 200, sent: null, rendered: null };
        const req = { path: '/creator-rewards', session };
        const res = {
            locals: { lang: 'en' },
            set() {},
            status(value) { output.status = value; return this; },
            send(value) { output.sent = value; return value; },
            render(view, model) { output.rendered = { view, model }; return model; }
        };
        const handlers = routes.get('GET /creator-rewards');
        let index = 0;
        const next = async () => handlers[index++]?.(req, res, next);
        await next();
        return output;
    }
    assert.deepEqual(await execute({}), { status: 401, sent: 'login required', rendered: null });
    assert.deepEqual(await execute({ user: { username: 'creator', authorized: false, balance: 100 } }),
        { status: 403, sent: 'not authorized', rendered: null });
    const rendered = await execute({ user: { username: 'creator', authorized: true, balance: 100 } });
    assert.equal(rendered.status, 200);
    assert.equal(rendered.rendered.view, 'creator-rewards');
    assert.deepEqual(rendered.rendered.model.catalog.items.map(row => row.id), [106]);
});
