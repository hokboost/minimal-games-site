'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const giftConfig = require('../gift-codes.json');
const pack = require('../content/streamer-world/rewards/catalog');
const domain = require('../domain/rewards/catalog');
const { readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const { RewardCatalogService } = require('../services/reward-catalog-service');
const registerCreatorRewardRoutes = require('../routes/creator-rewards');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const uuid = value => `00000000-0000-4000-a000-${String(value).padStart(12, '0')}`;

function dbItem(item, id) {
    return {
        id, version_id: id, catalog_version: pack.catalogVersion, version: 1, lifecycle: 'active',
        slug: item.slug, kind: item.kind, title_zh: item.titleZh, title_en: item.titleEn,
        description_zh: item.descriptionZh, description_en: item.descriptionEn,
        art_key: item.artKey, points_price: item.pointsPrice, exposure_value: item.exposureValue,
        provider_gift_type: item.providerGiftType || null, stock_limit: item.stockLimit,
        per_user_limit: item.perUserLimit, cooldown_hours: item.cooldownHours,
        approval_policy: item.approval, visibility_type: item.visibility.type,
        visibility_key: item.visibility.key || null,
        visibility_start: item.visibility.startsAt || null, visibility_end: item.visibility.endsAt || null,
        owner_grant_only: item.ownerGrantOnly === true
    };
}

class MemoryRewardRepository {
    constructor() {
        this.accounts = new Map([
            ['creator', { id: 1, username: 'creator', balance: 30000, authorized: true,
                deactivated: false, is_admin: false, live_interaction_opt_in: true, timezone: 'UTC' }],
            ['owner', { id: 2, username: 'owner', balance: 0, authorized: true,
                deactivated: false, is_admin: true, live_interaction_opt_in: true, timezone: 'UTC' }],
            ['reviewer', { id: 3, username: 'reviewer', balance: 0, authorized: true,
                deactivated: false, is_admin: true, live_interaction_opt_in: false, timezone: 'UTC' }]
        ]);
        this.items = new Map(pack.items.map((item, index) => [index + 1, dbItem(item, index + 1)]));
        this.orders = new Map();
        this.commands = new Map();
        this.events = [];
        this.grants = new Map();
        this.inventory = [];
        this.assets = [];
        this.wishlists = [];
        this.audits = [];
        this.inbox = [];
        this.ledger = [];
        this.budgetUsed = 0;
        this.budgetLimit = 50000;
        this.boundaries = { preferences: {}, quietHours: [], interactionWindows: [], room: null, report: null };
        this.tail = Promise.resolve();
    }
    data() {
        return structuredClone({ accounts: this.accounts, orders: this.orders, commands: this.commands,
            events: this.events, grants: this.grants, inventory: this.inventory, assets: this.assets,
            wishlists: this.wishlists, audits: this.audits, inbox: this.inbox,
            ledger: this.ledger, budgetUsed: this.budgetUsed, boundaries: this.boundaries });
    }
    restore(snapshot) { Object.assign(this, snapshot); }
    async withTransaction(work) {
        const before = this.tail;
        let release;
        this.tail = new Promise(resolve => { release = resolve; });
        await before;
        const snapshot = this.data();
        try { return await work(this); } catch (error) { this.restore(snapshot); throw error; } finally { release(); }
    }
    async seedCatalog() {}
    async lockAccounts(client, names) {
        return new Map(names.filter(name => this.accounts.has(name)).map(name => [name, this.accounts.get(name)]));
    }
    async accountIdentity(username) { return this.accounts.get(username) || null; }
    async creatorBoundaries() { return structuredClone(this.boundaries); }
    async listCatalog(username) {
        const user = this.accounts.get(username);
        return [...this.items.values()].map(item => ({ ...item,
            stock_used: [...this.orders.values()].filter(order => order.catalog_version_id === item.id
                && ['approved', 'claimed'].includes(order.status)).length,
            user_item_count: user ? [...this.orders.values()].filter(order => order.user_id === user.id
                && order.catalog_version_id === item.id && ['approved', 'claimed'].includes(order.status)).length : 0,
            cooldown_until: null, has_unlock: true }));
    }
    async lockCatalogVersion(client, id) { return this.items.get(id) || null; }
    async lockCatalogVersionBySlug(client, slug) {
        return [...this.items.values()].find(item => item.slug === slug) || null;
    }
    async eligibilityFacts(client, userId, versionId, excludeOrderId = null) {
        const rows = [...this.orders.values()].filter(order => order.catalog_version_id === versionId
            && order.id !== excludeOrderId);
        const owned = rows.filter(order => order.user_id === userId && ['approved', 'claimed'].includes(order.status));
        return { user_item_count: owned.length,
            pending_count: rows.filter(order => order.user_id === userId
                && ['submitted', 'pending_approval'].includes(order.status)).length,
            stock_used: rows.filter(order => ['approved', 'claimed'].includes(order.status)).length,
            last_approved: owned.at(-1)?.approved_at || null };
    }
    async hasVisibilityUnlock() { return true; }
    async reserveBudgets(client, userId, amount) {
        if (this.budgetUsed + amount > this.budgetLimit) {
            const error = new Error('budget'); error.code = 'REWARD_BUDGET_EXCEEDED'; throw error;
        }
        this.budgetUsed += amount;
    }
    async findCommand(client, actorId, commandId) { return this.commands.get(`${actorId}:${commandId}`) || null; }
    async findSourceOrder(client, userId, sourceType, sourceKey) {
        const row = [...this.orders.values()].find(order => order.user_id === userId
            && order.source_type === sourceType && order.source_key === sourceKey);
        return row ? this.enriched(row) : null;
    }
    async saveCommand(client, value) {
        this.commands.set(`${value.actorUserId}:${value.commandId}`, {
            semantic_hash: value.semanticHash, response_status: value.status, response_body: structuredClone(value.body)
        });
    }
    async createOrder(client, value) {
        if ([...this.orders.values()].some(order => order.user_id === value.userId
            && order.catalog_version_id === value.catalogVersionId
            && ['submitted', 'pending_approval'].includes(order.status))) {
            const error = new Error('pending'); error.code = '23505'; throw error;
        }
        const now = new Date().toISOString();
        const row = { id: value.id, user_id: value.userId, catalog_version_id: value.catalogVersionId,
            source_type: value.sourceType, source_key: value.sourceKey,
            grant_template_key: value.grantTemplateKey || null, created_by_user_id: value.createdByUserId,
            status: value.status, points_cost: value.pointsCost, exposure_value: value.exposureValue,
            semantic_hash: value.semanticHash,
            notification_policy: value.notificationPolicy || 'normal', created_at: now,
            approved_at: value.status === 'approved' ? now : null };
        this.orders.set(row.id, row);
        return row;
    }
    async readOrderIdentity(client, id) {
        const order = this.orders.get(id);
        const account = order && [...this.accounts.values()].find(row => row.id === order.user_id);
        return account ? { username: account.username, created_by_user_id: order.created_by_user_id } : null;
    }
    enriched(order) {
        const item = this.items.get(order.catalog_version_id);
        const account = [...this.accounts.values()].find(row => row.id === order.user_id);
        return { ...item, ...order, version_id: item.id, username: account.username,
            points_price: item.points_price, catalog_exposure_value: item.exposure_value };
    }
    async lockOrder(client, id, username = null) {
        const order = this.orders.get(id);
        if (!order) return null;
        const enriched = this.enriched(order);
        return username && enriched.username !== username ? null : enriched;
    }
    async transitionOrder(client, id, status, reviewer = null) {
        const order = this.orders.get(id);
        const now = new Date().toISOString();
        Object.assign(order, { status, reviewer_user_id: reviewer || order.reviewer_user_id,
            approved_at: status === 'approved' ? now : order.approved_at,
            rejected_at: status === 'rejected' ? now : order.rejected_at,
            claimed_at: status === 'claimed' ? now : order.claimed_at,
            cancelled_at: status === 'cancelled' ? now : order.cancelled_at,
            revoked_at: status === 'revoked' ? now : order.revoked_at });
        return structuredClone(order);
    }
    async appendOrderEvent(client, value) { this.events.push(structuredClone(value)); return this.events.length; }
    async createGrant(client, orderId, userId) {
        const row = { order_id: orderId, user_id: userId, status: 'available' };
        this.grants.set(orderId, row); return row;
    }
    async lockGrant(client, orderId) { return this.grants.get(orderId) || null; }
    async claimProviderGrant(client, values) {
        const id = this.inventory.length + 1;
        this.inventory.push({ id, ...values, status: 'stored', giftExchangeId: null, outbox: false });
        Object.assign(this.grants.get(values.orderId), { status: 'claimed', wish_inventory_id: id });
        return id;
    }
    async claimAsset(client, values) { this.assets.push(values); }
    async revokeGrant(client, orderId) {
        const grant = this.grants.get(orderId);
        if (!grant || grant.status !== 'available') return false;
        grant.status = 'revoked'; return true;
    }
    async upsertWishlist(client, userId, values) {
        const row = { user_id: userId, catalog_version_id: values.catalogVersionId,
            target_quantity: values.targetQuantity, priority: values.priority, revision: 1 };
        this.wishlists.push(row); return row;
    }
    async audit(client, values) { this.audits.push(structuredClone(values)); }
    async appendRewardInbox(client, values) { this.inbox.push(structuredClone(values)); return true; }
    async pendingReview() {
        return [...this.orders.values()].filter(row => row.status === 'pending_approval').map(row => {
            const item = this.items.get(row.catalog_version_id);
            const account = [...this.accounts.values()].find(user => user.id === row.user_id);
            return { ...row, username: account.username, slug: item.slug,
                title_zh: item.title_zh, title_en: item.title_en };
        });
    }
    async state(username) {
        const account = this.accounts.get(username);
        const orders = [...this.orders.values()].filter(row => row.user_id === account.id).map(row => {
            const item = this.items.get(row.catalog_version_id);
            const grant = this.grants.get(row.id);
            const inventory = this.inventory.find(entry => entry.id === grant?.wish_inventory_id);
            return { ...row, slug: item.slug, kind: item.kind, title_zh: item.title_zh, title_en: item.title_en,
                inventory_status: inventory?.status || null, delivery_status: inventory?.deliveryStatus || null };
        });
        return { orders, total: orders.length, wishlist: [], assets: this.assets.map(row => ({
            asset_type: row.kind, asset_key: row.slug, acquired_at: new Date().toISOString()
        })) };
    }
}

function fixture(options = {}) {
    const repository = new MemoryRewardRepository();
    const BalanceLogger = { async updateBalance(options) {
        const account = repository.accounts.get(options.username);
        if (account.balance + options.amount < 0) return { success: false, message: 'insufficient' };
        account.balance += options.amount;
        repository.ledger.push({ username: options.username, amount: options.amount,
            operationType: options.operationType, description: options.description,
            gameData: structuredClone(options.gameData), requestId: options.requestId,
            managedTransaction: options.managedTransaction,
            requireSufficientBalance: options.requireSufficientBalance });
        return { success: true, balance: account.balance };
    } };
    return { repository, service: new RewardCatalogService({ repository, BalanceLogger,
        giftConfig, ownerUsername: 'owner', clock: () => new Date('2026-08-16T12:00:00Z'),
        boundaryPolicy: options.boundaryPolicy,
        publishRewardNotification: options.publishRewardNotification }) };
}

test('catalog is deeply frozen, bilingual, unique, and bound to server gift configuration', () => {
    assert.equal(domain.validateCatalog(pack, giftConfig), true);
    assert.ok(Object.isFrozen(pack.items[0].visibility));
    assert.equal(new Set(pack.items.map(item => item.titleZh)).size, pack.items.length);
    assert.equal(new Set(pack.items.map(item => item.descriptionEn)).size, pack.items.length);
});

test('public catalog projection never exposes provider identifiers or exposure values', async () => {
    const { service } = fixture();
    const result = await service.catalog('creator');
    assert.ok(result.items.length >= 8);
    assert.ok(result.items.every(item => !('providerGiftType' in item) && !('providerGiftId' in item)
        && !('exposureValue' in item)));
    assert.ok(result.items.every(item => !item.slug.startsWith('owner-')));
});

test('reward order and wishlist validators reject unknown fields and unsafe quantities', () => {
    assert.throws(() => domain.validateCreateOrder({ commandId: uuid(1), catalogVersionId: 1, quantity: 1, score: 9 }));
    assert.throws(() => domain.validateWishlist({ commandId: uuid(1), catalogVersionId: 1,
        targetQuantity: 0, priority: 1 }));
    assert.equal(domain.transitionOrder('pending_approval', 'approve'), 'approved');
    assert.throws(() => domain.transitionOrder('claimed', 'revoke'));
});

test('migration freezes history, caps pending approvals, and bridges only to stored inventory', () => {
    const sql = source('migrations/add_streamer_reward_catalog.sql');
    const repository = source('repositories/reward-catalog-repository.js');
    assert.match(sql, /reward_orders_one_pending_item_idx[\s\S]*pending_approval/);
    assert.match(sql, /reward_events_append_only/);
    assert.match(sql, /reward_budget_definition_append_only/);
    assert.match(repository, /INSERT INTO wish_inventory[\s\S]*'stored'/);
    assert.match(repository, /lockCatalogVersion[\s\S]*FOR UPDATE OF version/);
    assert.doesNotMatch(repository, /INSERT INTO delivery_outbox/);
    assert.doesNotMatch(repository, /INSERT INTO gift_exchanges|UPDATE gift_exchanges/);
});

test('reward feature flag requires world and creator foundation and defaults off', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true', CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_REWARD_CATALOG_ENABLED: 'true' }).rewardsEnabled, true);
    assert.equal(readStreamerWorldFlags({ STREAMER_REWARD_CATALOG_ENABLED: 'true' }).rewardsEnabled, false);
    assert.equal(readStreamerWorldFlags({}).rewardsEnabled, false);
});

test('automatic redemption atomically debits the existing ledger and creates an approved order', async () => {
    const { service, repository } = fixture();
    const result = await service.createOrder('creator', { commandId: uuid(1), catalogVersionId: 1, quantity: 1 });
    assert.equal(result.order.status, 'approved');
    assert.equal(result.balance, 29999);
    assert.equal(repository.ledger[0].operationType, 'reward_catalog_redemption');
    assert.equal(repository.ledger[0].managedTransaction, true);
    assert.equal(repository.orders.size, 1);
    assert.equal(repository.grants.size, 1);
    assert.ok(repository.events.some(event => event.eventType === 'order_approved'));
    assert.equal(repository.audits.length, 1);
});

test('response-loss failure rolls back ledger, order, budget, event, audit, and command together', async () => {
    const { service, repository } = fixture();
    await assert.rejects(service.createOrder('creator', { commandId: uuid(2), catalogVersionId: 2, quantity: 1 }, {
        finalizeIdempotency: async () => { throw new Error('response store failed'); }
    }), /response store failed/);
    assert.equal(repository.accounts.get('creator').balance, 30000);
    assert.equal(repository.orders.size, 0);
    assert.equal(repository.budgetUsed, 0);
    assert.equal(repository.events.length, 0);
    assert.equal(repository.audits.length, 0);
    assert.equal(repository.commands.size, 0);
    assert.equal(repository.ledger.length, 0);
});

test('semantic command replay returns the stored response and altered command fails closed', async () => {
    const { service, repository } = fixture();
    const raw = { commandId: uuid(3), catalogVersionId: 1, quantity: 1 };
    const first = await service.createOrder('creator', raw);
    const replay = await service.createOrder('creator', raw);
    assert.deepEqual(replay, first);
    assert.equal(repository.orders.size, 1);
    await assert.rejects(service.createOrder('creator', { ...raw, catalogVersionId: 2 }),
        error => error.code === 'REWARD_COMMAND_COLLISION');
});

test('concurrent high-value requests serialize on the creator and only one remains pending', async () => {
    const { service, repository } = fixture();
    const outcomes = await Promise.allSettled([
        service.createOrder('creator', { commandId: uuid(4), catalogVersionId: 3, quantity: 1 }),
        service.createOrder('creator', { commandId: uuid(5), catalogVersionId: 3, quantity: 1 })
    ]);
    assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(row => row.status === 'rejected').length, 1);
    assert.equal([...repository.orders.values()].filter(row => row.status === 'pending_approval').length, 1);
    assert.equal(repository.accounts.get('creator').balance, 30000, 'pending review never pre-debits points');
});

test('approval rechecks eligibility and balance, then settles once under an independent admin', async () => {
    const { service, repository } = fixture();
    const pending = await service.createOrder('creator', { commandId: uuid(6), catalogVersionId: 3, quantity: 1 });
    const result = await service.review('reviewer', { commandId: uuid(7), orderId: pending.order.id, decision: 'approve' });
    assert.equal(result.order.status, 'approved');
    assert.equal(repository.accounts.get('creator').balance, 10020);
    assert.equal(repository.ledger.length, 1);
    assert.equal(repository.grants.get(pending.order.id).status, 'available');
    const replay = await service.review('reviewer', { commandId: uuid(7), orderId: pending.order.id, decision: 'approve' });
    assert.deepEqual(replay, result);
    assert.equal(repository.ledger.length, 1);
});

test('owner-authored high-value grant cannot be approved by that owner', async () => {
    const { service } = fixture();
    const pending = await service.ownerGrant('owner', { commandId: uuid(8), creatorUsername: 'creator',
        catalogVersionId: 12, templateKey: 'story-route-milestone' });
    await assert.rejects(service.review('owner', { commandId: uuid(9), orderId: pending.order.id,
        decision: 'approve' }), error => error.code === 'REWARD_INDEPENDENT_REVIEW_REQUIRED');
});

test('owner grant honors opt-in, communication mute, and quiet hours without relationship penalties', async () => {
    const { service, repository } = fixture();
    repository.boundaries.preferences.celebrations = 'block';
    await assert.rejects(service.ownerGrant('owner', { commandId: uuid(10), creatorUsername: 'creator',
        catalogVersionId: 11, templateKey: 'quest-chain-celebration' }), error => error.code === 'REWARD_GRANT_MUTED');
    assert.equal(repository.orders.size, 0);
    delete repository.boundaries.preferences.celebrations;
    repository.boundaries.quietHours = [{ weekday: 0, startMinute: 0, endMinute: 1439, enabled: true }];
    const result = await service.ownerGrant('owner', { commandId: uuid(11), creatorUsername: 'creator',
        catalogVersionId: 11, templateKey: 'quest-chain-celebration' });
    assert.equal(result.order.notificationPolicy, 'quiet_suppressed');
    assert.equal(repository.inbox.length, 1, 'quiet suppresses realtime only, never durable inbox storage');
    assert.equal(repository.grants.size, 1);
});

test('quiet reward grant persists inbox but suppresses realtime, while normal grant fans out after commit', async () => {
    const notifications = [];
    const { service, repository } = fixture({
        publishRewardNotification: async value => notifications.push(structuredClone(value))
    });
    repository.boundaries.quietHours = [{ weekday: 0, startMinute: 0, endMinute: 1439, enabled: true }];
    await service.ownerGrant('owner', { commandId: uuid(110), creatorUsername: 'creator',
        catalogVersionId: 11, templateKey: 'quest-chain-celebration' });
    assert.equal(repository.inbox.length, 1);
    assert.equal(notifications.length, 0);
    repository.boundaries.quietHours = [];
    await service.ownerGrant('owner', { commandId: uuid(111), creatorUsername: 'creator',
        catalogVersionId: 12, templateKey: 'story-route-milestone' });
    assert.equal(repository.inbox.length, 2);
    assert.equal(notifications.length, 1);
});

test('outside preferred reward window stays durable without realtime and hard boundaries reject before storage',
    async () => {
        const notifications = [];
        const { service, repository } = fixture({
            publishRewardNotification: async value => notifications.push(structuredClone(value))
        });
        repository.boundaries.interactionWindows = [{ weekday: 0, startMinute: 60, endMinute: 120,
            mode: 'live', enabled: true }];
        const durable = await service.ownerGrant('owner', { commandId: uuid(112), creatorUsername: 'creator',
            catalogVersionId: 11, templateKey: 'quest-chain-celebration' });
        assert.equal(durable.order.notificationPolicy, 'quiet_suppressed');
        assert.equal(repository.inbox.length, 1, 'preferred windows never discard the durable reward inbox');
        assert.equal(notifications.length, 0, 'outside the preferred window realtime must stay suppressed');

        repository.boundaries.interactionWindows = [];
        repository.boundaries.report = { status: 'resolved', creatorReconsentedAt: null };
        await assert.rejects(service.ownerGrant('owner', { commandId: uuid(113), creatorUsername: 'creator',
            catalogVersionId: 12, templateKey: 'story-route-milestone' }),
        error => error.code === 'REWARD_GRANT_MUTED');
        assert.equal(repository.inbox.length, 1, 'unreconsented reports fail before durable grant storage');

        repository.boundaries.report = null;
        repository.boundaries.room = { mutedUntil: '2026-08-17T00:00:00.000Z' };
        await assert.rejects(service.ownerGrant('owner', { commandId: uuid(114), creatorUsername: 'creator',
            catalogVersionId: 12, templateKey: 'story-route-milestone' }),
        error => error.code === 'REWARD_GRANT_MUTED');
        assert.equal(repository.inbox.length, 1, 'an active creator mute fails before durable grant storage');
    });

test('trusted quest, story, game, achievement, and season sources create replay-safe entitlements only', async () => {
    const { service, repository } = fixture();
    const slugs = ['quiet-orbit-frame', 'starlight-studio-badge', 'dream-compass-key',
        'constellation-archive-key', 'memory-book-cover'];
    for (const [index, sourceType] of ['quest', 'story', 'game', 'achievement', 'season'].entries()) {
        const raw = { sourceType, sourceEventId: `trusted:event:${index}:complete`, username: 'creator',
            catalogSlug: slugs[index] };
        const first = await service.grantFromTrustedSource(raw);
        const replay = await service.grantFromTrustedSource(raw);
        assert.equal(first.order.sourceType, sourceType);
        assert.equal(replay.replayed, true);
    }
    assert.equal(repository.orders.size, 5);
    await assert.rejects(service.grantFromTrustedSource({ sourceType: 'quest',
        sourceEventId: 'trusted:event:0:complete', username: 'creator', catalogSlug: 'dream-compass-key' }),
    error => error.code === 'REWARD_SOURCE_COLLISION');
    assert.throws(() => domain.validateTrustedGrant({ sourceType: 'browser', sourceEventId: 'trusted:event:x',
        username: 'creator', catalogSlug: 'quiet-orbit-frame' }));
});

test('creator claim stores server-mapped gift in existing backpack without send, exchange, or outbox', async () => {
    const { service, repository } = fixture();
    const approved = await service.createOrder('creator', { commandId: uuid(12), catalogVersionId: 1, quantity: 1 });
    const result = await service.claim('creator', { commandId: uuid(13), orderId: approved.order.id });
    const inventory = repository.inventory[0];
    assert.equal(result.order.status, 'claimed');
    assert.equal(inventory.status, 'stored');
    assert.equal(inventory.giftType, 'fanlight');
    assert.equal(inventory.giftName, giftConfig.礼物映射.fanlight.名称);
    assert.equal(inventory.providerGiftId, String(giftConfig.礼物映射.fanlight.bilibili_id));
    assert.equal(inventory.giftExchangeId, null);
    assert.equal(inventory.outbox, false);
});

test('claimed or provider-started grants cannot be revoked or automatically resent/refunded', async () => {
    const { service, repository } = fixture();
    const granted = await service.ownerGrant('owner', { commandId: uuid(14), creatorUsername: 'creator',
        catalogVersionId: 11, templateKey: 'co-op-mastery-thanks' });
    await service.claim('creator', { commandId: uuid(15), orderId: granted.order.id });
    await assert.rejects(service.revoke('owner', { commandId: uuid(16), orderId: granted.order.id }),
        error => error.code === 'REWARD_TRANSITION_INVALID');
    repository.inventory[0].status = 'queued';
    repository.inventory[0].deliveryStatus = 'uncertain';
    const state = await service.state('creator');
    assert.equal(state.orders[0].needsReconciliation, true);
    assert.equal(state.orders[0].deliveryMessageCode, 'DELIVERY_AWAITING_RECONCILIATION');
});

test('delivery history retains the reward-order backlink while existing reconciliation owns uncertain state', () => {
    const repository = source('repositories/reward-catalog-repository.js');
    const server = source('server.js');
    assert.match(repository, /reward_inventory_grants grant ON grant\.order_id=orders\.id/);
    assert.match(repository, /wish_inventory inventory ON inventory\.id=grant\.wish_inventory_id/);
    assert.match(repository, /gift_exchanges exchange ON exchange\.id=inventory\.gift_exchange_id/);
    assert.match(server, /async function enqueueWishInventorySend/);
    assert.match(server, /delivery_status IN \('pending', 'claimed', 'processing', 'uncertain'\)/);
});

test('budget lock rejects an over-cap approval and rolls back every settlement effect', async () => {
    const { service, repository } = fixture();
    repository.budgetLimit = 100;
    const pending = await service.createOrder('creator', { commandId: uuid(17), catalogVersionId: 3, quantity: 1 });
    await assert.rejects(service.review('reviewer', { commandId: uuid(18), orderId: pending.order.id,
        decision: 'approve' }), error => error.code === 'REWARD_BUDGET_EXCEEDED');
    assert.equal(repository.orders.get(pending.order.id).status, 'pending_approval');
    assert.equal(repository.accounts.get('creator').balance, 30000);
    assert.equal(repository.ledger.length, 0);
});

test('route, manifest, and provider boundary remain fixed and auditable', () => {
    const routes = source('routes/creator-rewards.js');
    const manifest = source('routes/manifest.js');
    const service = source('services/reward-catalog-service.js');
    for (const route of ['/orders/create', '/orders/claim', '/orders/cancel', '/wishlist/update',
        '/reward-grants/create', '/reviews/decide', '/grants/revoke']) assert.match(routes, new RegExp(route));
    assert.match(manifest, /creator-rewards\/orders\/claim[\s\S]*idempotent/);
    assert.doesNotMatch(service, /bilibili-gift-sender|sendGift|enqueueWishInventorySend|gift_exchanges|delivery_outbox/);
    assert.doesNotMatch(source('repositories/reward-catalog-repository.js'), /delivery_status\s*=\s*'uncertain'|refund|resend/i);
});

test('successful direct redemption synchronizes the authenticated session balance', async () => {
    const registrations = new Map();
    const app = {
        get(pathname, ...handlers) { registrations.set(`GET ${pathname}`, handlers); },
        post(pathname, ...handlers) { registrations.set(`POST ${pathname}`, handlers); }
    };
    const pass = (req, res, next) => next?.();
    registerCreatorRewardRoutes(app, {
        rewardCatalogService: {
            catalog: async () => ({ items: [] }), state: async () => ({ orders: [], assets: [] }),
            createOrder: async () => ({ success: true, balance: 812, order: { id: uuid(40) } }),
            claim: async () => ({ success: true }), cancel: async () => ({ success: true }),
            wishlist: async () => ({ success: true }), ownerGrant: async () => ({ success: true }),
            review: async () => ({ success: true }), revoke: async () => ({ success: true }),
            adminState: async () => ({ pending: [], grantItems: [], grantTemplates: [] })
        },
        streamerWorldFlags: { rewardsEnabled: true }, generateCSRFToken: () => 'token',
        requireLogin: pass, requireAuthorized: pass, requireAdmin: pass, requireCSRF: pass,
        security: { basicRateLimit: pass, userActionRateLimit: pass, readHeavyRateLimit: pass },
        paidActionConcurrencyGuard: pass
    });
    const handler = registrations.get('POST /api/creator-rewards/orders/create').at(-1);
    let sessionSaved = false;
    const req = { session: { user: { username: 'creator', balance: 999 }, save(callback) {
        sessionSaved = true; callback();
    } }, body: {}, requestId: 'r',
        ip: '127.0.0.1', get: () => 'test', finalizeIdempotency: async () => {} };
    const response = {};
    const res = { status(value) { response.status = value; return this; }, json(value) { response.body = value; return value; } };
    await handler(req, res);
    assert.equal(req.session.user.balance, 812);
    assert.equal(sessionSaved, true);
    assert.equal(response.status, 201);
});

test('browser reward UI preserves rule-disabled controls and reuses recovery helper', async () => {
    const listeners = {};
    const buttons = [{ disabled: true, dataset: { rewardAction: 'create' } },
        { disabled: false, dataset: { rewardAction: 'wishlist' } }];
    const document = {
        body: { dataset: { csrfToken: 'token', lang: 'en' } },
        getElementById: () => ({ textContent: '' }),
        querySelectorAll: selector => selector.includes('disabled') ? [buttons[0]] : buttons,
        addEventListener: (type, callback) => { listeners[type] = callback; }
    };
    const context = { document, window: {}, crypto: { randomUUID: () => uuid(30) },
        Headers, FormData, location: { reload() {} }, console };
    context.window.idempotentFetch = async () => ({ ok: true, json: async () => ({ success: true }) });
    vm.runInNewContext(source('public/js/creator-rewards.js'), context);
    context.window.CreatorRewardsUI.setBusy(true);
    context.window.CreatorRewardsUI.setBusy(false);
    assert.equal(buttons[0].disabled, true);
    assert.equal(buttons[1].disabled, false);
    assert.equal(typeof context.window.CreatorRewardsUI.mutate, 'function');
});

test('browser response-loss retry reuses the same semantic command identity', async () => {
    const document = { body: { dataset: { csrfToken: 'token', lang: 'en' } },
        getElementById: () => ({ textContent: '' }), querySelectorAll: () => [], addEventListener() {} };
    const bodies = [];
    let attempts = 0;
    const context = { document, window: {}, crypto: { randomUUID: () => uuid(++attempts) },
        Headers, FormData, location: { reload() {} }, console };
    context.window.idempotentFetch = async (url, options) => {
        bodies.push(options.body);
        if (bodies.length === 1) throw new Error('connection lost');
        return { ok: true, json: async () => ({ success: true }) };
    };
    vm.runInNewContext(source('public/js/creator-rewards.js'), context);
    const body = { catalogVersionId: 1, quantity: 1 };
    await assert.rejects(context.window.CreatorRewardsUI.mutate('/api/creator-rewards/orders/create', body), /lost/);
    await context.window.CreatorRewardsUI.mutate('/api/creator-rewards/orders/create', body);
    assert.equal(bodies[0], bodies[1]);
});
