'use strict';

const crypto = require('node:crypto');
const pack = require('../content/streamer-world/rewards/catalog');
const { stableStringify } = require('../lib/idempotency');
const {
    contentHash,
    evaluateEligibility,
    evaluateRewardAccess,
    projectItem,
    transitionOrder,
    validateCatalog,
    validateCreateOrder,
    validateOrderCommand,
    validateOwnerGrant,
    validateReview,
    validateTrustedGrant,
    validateWishlist
} = require('../domain/rewards/catalog');
const {
    evaluateCommunicationBoundary
} = require('./creator-communication-boundary-policy');

class RewardCatalogServiceError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'RewardCatalogServiceError';
        this.code = code;
        this.status = status;
    }
}

function semanticHash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function dateKey(date) {
    return date.toISOString().slice(0, 10);
}

function cooldownUntil(lastApproved, hours) {
    if (!lastApproved || !hours) return null;
    return new Date(new Date(lastApproved).getTime() + Number(hours) * 3600000);
}

function accountAvailable(account) {
    return Boolean(account && account.authorized === true && account.deactivated !== true
        && account.account_locked !== true);
}

class RewardCatalogService {
    constructor({ repository, BalanceLogger, giftConfig, ownerUsername = null, clock = () => new Date(),
        boundaryPolicy = evaluateCommunicationBoundary, publishRewardNotification = async () => {},
        grantIntentRepository = null }) {
        if (!repository?.withTransaction || !BalanceLogger?.updateBalance) {
            throw new TypeError('RewardCatalogService requires repository and BalanceLogger');
        }
        if (typeof boundaryPolicy !== 'function') {
            throw new TypeError('RewardCatalogService requires a communication boundary policy');
        }
        validateCatalog(pack, giftConfig);
        this.repository = repository;
        this.BalanceLogger = BalanceLogger;
        this.giftConfig = giftConfig;
        this.ownerUsername = ownerUsername;
        this.clock = clock;
        this.boundaryPolicy = boundaryPolicy;
        this.publishRewardNotification = publishRewardNotification;
        this.grantIntentRepository = grantIntentRepository;
        this.pack = pack;
        this.grantTemplates = new Map(pack.grantTemplates.map(template => [template.key, template]));
    }

    async initialize() {
        const hashes = new Map(this.pack.items.map(item => [item.slug, contentHash(item)]));
        await this.repository.withTransaction(client => this.repository.seedCatalog(client, this.pack, hashes));
    }

    replay(existing, hash) {
        if (!existing) return null;
        if (existing.semantic_hash !== hash) {
            throw new RewardCatalogServiceError('REWARD_COMMAND_COLLISION', 409,
                'Command identity was reused with different reward semantics');
        }
        return existing.response_body;
    }

    async finalize(client, context, body, status = 200) {
        await context.finalizeIdempotency?.(client, status, body);
    }

    itemFacts(item, facts, sourceType) {
        const unlockKeys = facts.hasUnlock ? new Set([item.visibility_key]) : new Set();
        return {
            sourceType,
            userItemCount: Number(facts.user_item_count || 0),
            stockUsed: Number(facts.stock_used || 0),
            pendingCount: Number(facts.pending_count || 0),
            cooldownUntil: cooldownUntil(facts.last_approved, item.cooldown_hours),
            unlockKeys,
            now: this.clock()
        };
    }

    notFound() {
        return new RewardCatalogServiceError('REWARD_ITEM_NOT_FOUND', 404, 'Reward item not found');
    }

    async access(client, account, item, sourceType, excludeOrderId = null) {
        if (!item) throw this.notFound();
        const facts = await this.repository.eligibilityFacts(client, account.id, item.id, excludeOrderId);
        facts.hasUnlock = await this.repository.hasVisibilityUnlock(client, account.id,
            item.visibility_type, ['story_unlock', 'achievement_unlock'].includes(item.visibility_type)
                ? item.visibility_key : null);
        return { facts, result: evaluateRewardAccess(item, this.itemFacts(item, facts, sourceType)) };
    }

    async requireEligible(client, account, item, sourceType, excludeOrderId = null) {
        const { facts, result } = await this.access(client, account, item, sourceType, excludeOrderId);
        if (!result.visible) throw this.notFound();
        if (!result.eligible) {
            throw new RewardCatalogServiceError(result.reasonCode, 409, 'Reward is not currently eligible');
        }
        return facts;
    }

    async catalog(username) {
        const rows = await this.repository.listCatalog(username);
        return {
            success: true,
            catalogVersion: this.pack.catalogVersion,
            items: rows.map(row => {
                const access = evaluateRewardAccess(row, {
                    sourceType: 'direct_redemption',
                    userItemCount: Number(row.user_item_count),
                    stockUsed: Number(row.stock_used),
                    pendingCount: Number(row.pending_count || 0),
                    cooldownUntil: row.cooldown_until,
                    unlockKeys: row.has_unlock ? new Set([row.visibility_key]) : new Set(),
                    now: this.clock()
                });
                return { row, access };
            }).filter(entry => entry.access.visible)
                .map(entry => projectItem(entry.row, entry.access))
        };
    }

    async itemDetail(username, catalogVersionId) {
        const id = Number(catalogVersionId);
        if (!Number.isSafeInteger(id) || id < 1) throw this.notFound();
        const result = await this.repository.withTransaction(async client => {
            const account = (await this.repository.lockAccounts(client, [username])).get(username);
            if (!accountAvailable(account)) {
                throw new RewardCatalogServiceError('REWARD_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
            }
            const item = await this.repository.lockCatalogVersion(client, id);
            const { result } = await this.access(client, account, item, 'direct_redemption');
            if (!result.visible) throw this.notFound();
            return { success: true, item: projectItem(item, result) };
        });
        return result;
    }

    orderProjection(order, item = order) {
        return {
            id: order.id,
            slug: item.slug,
            kind: item.kind,
            status: order.status,
            pointsCost: Number(order.points_cost),
            requiresApproval: order.status === 'pending_approval',
            sourceType: order.source_type,
            notificationPolicy: order.notification_policy,
            createdAt: order.created_at,
            approvedAt: order.approved_at || null,
            claimedAt: order.claimed_at || null
        };
    }

    async debitPoints(client, account, item, orderId, context) {
        if (Number(item.points_price) === 0) return { balance: Number(account.balance) };
        const result = await this.BalanceLogger.updateBalance({
            username: account.username,
            amount: -Number(item.points_price),
            operationType: 'reward_catalog_redemption',
            description: `Reward catalog redemption: ${item.slug}`,
            gameData: { rewardOrderId: orderId, catalogVersionId: Number(item.id), itemSlug: item.slug },
            ipAddress: context.ipAddress || null,
            userAgent: context.userAgent || null,
            requestId: context.requestId || orderId,
            requireSufficientBalance: true,
            client,
            managedTransaction: true
        });
        if (!result.success) {
            throw new RewardCatalogServiceError('REWARD_BALANCE_INSUFFICIENT', 402,
                result.message || 'Insufficient point balance');
        }
        return result;
    }

    async approveValue(client, account, item, orderId, context) {
        await this.repository.reserveBudgets(client, account.id, Number(item.exposure_value), dateKey(this.clock()));
        return this.debitPoints(client, account, item, orderId, context);
    }

    async appendEvent(client, orderId, eventType, actorUserId, details = {}) {
        return this.repository.appendOrderEvent(client, {
            eventId: crypto.randomUUID(), orderId, eventType, actorUserId, details
        });
    }

    async createOrder(username, raw, context = {}) {
        const command = validateCreateOrder(raw);
        const hash = semanticHash({ action: 'create', username, ...command });
        return this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, [username]);
            const account = accounts.get(username);
            if (!accountAvailable(account)) {
                throw new RewardCatalogServiceError('REWARD_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
            }
            const existing = await this.repository.findCommand(client, account.id, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) {
                await this.finalize(client, context, replay, existing.response_status);
                return replay;
            }
            const item = await this.repository.lockCatalogVersion(client, command.catalogVersionId);
            await this.requireEligible(client, account, item, 'direct_redemption');
            const orderId = crypto.randomUUID();
            const status = item.approval_policy === 'manual' ? 'pending_approval' : 'approved';
            let balance = Number(account.balance);
            if (status === 'approved') {
                balance = Number((await this.approveValue(client, account, item, orderId, context)).balance);
            }
            const order = await this.repository.createOrder(client, {
                id: orderId, userId: account.id, catalogVersionId: item.id,
                sourceType: 'direct_redemption', sourceKey: `direct:${command.commandId}`,
                createdByUserId: account.id, status, pointsCost: Number(item.points_price),
                exposureValue: Number(item.exposure_value), semanticHash: hash
            });
            await this.appendEvent(client, orderId, 'order_submitted', account.id,
                { catalogVersionId: Number(item.id), pointsCost: Number(item.points_price) });
            if (status === 'pending_approval') {
                await this.appendEvent(client, orderId, 'approval_requested', account.id);
            } else {
                await this.appendEvent(client, orderId, 'order_approved', account.id, { automatic: true });
                if (item.kind === 'provider_gift') {
                    await this.repository.createGrant(client, orderId, account.id);
                    await this.appendEvent(client, orderId, 'grant_available', account.id);
                }
            }
            const body = { success: true, order: this.orderProjection(order, item), balance };
            await this.repository.saveCommand(client, { actorUserId: account.id, commandId: command.commandId,
                commandType: 'reward.order.create', semanticHash: hash, status: 201, body });
            await this.repository.audit(client, { orderId, actorUserId: account.id,
                action: 'reward.order.created', requestId: context.requestId,
                details: { itemSlug: item.slug, status, sourceType: 'direct_redemption' } });
            await this.finalize(client, context, body, 201);
            return body;
        });
    }

    async ownerGrant(ownerUsername, raw, context = {}) {
        const command = validateOwnerGrant(raw);
        const hash = semanticHash({ action: 'owner_grant', ownerUsername, ...command });
        const result = await this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, [ownerUsername, command.creatorUsername]);
            const owner = accounts.get(ownerUsername);
            const creator = accounts.get(command.creatorUsername);
            if (!this.ownerUsername || ownerUsername !== this.ownerUsername || !accountAvailable(owner)
                || owner.is_admin !== true) {
                throw new RewardCatalogServiceError('REWARD_OWNER_REQUIRED', 403, 'Configured owner required');
            }
            if (!accountAvailable(creator)
                || creator.live_interaction_opt_in !== true) {
                throw new RewardCatalogServiceError('REWARD_GRANT_CONSENT_REQUIRED', 403,
                    'Creator has not opted into owner interactions');
            }
            const existing = await this.repository.findCommand(client, owner.id, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) {
                await this.finalize(client, context, replay, existing.response_status);
                return { body: replay, realtime: null };
            }
            const boundaries = await this.repository.creatorBoundaries(client, creator.id, owner.id);
            const boundary = this.boundaryPolicy({
                account: creator,
                preferences: boundaries.preferences,
                quietHours: boundaries.quietHours,
                interactionWindows: boundaries.interactionWindows,
                room: boundaries.room,
                report: boundaries.report,
                itemType: 'reward_grant',
                now: this.clock()
            });
            if (boundary?.allowDurable !== true) {
                throw new RewardCatalogServiceError('REWARD_GRANT_MUTED', 403,
                    'Creator has muted or blocked owner reward grants');
            }
            const item = await this.repository.lockCatalogVersion(client, command.catalogVersionId);
            await this.requireEligible(client, creator, item, 'owner_grant');
            const orderId = crypto.randomUUID();
            const status = item.approval_policy === 'manual' ? 'pending_approval' : 'approved';
            if (status === 'approved') {
                await this.repository.reserveBudgets(client, creator.id, Number(item.exposure_value), dateKey(this.clock()));
            }
            const order = await this.repository.createOrder(client, {
                id: orderId, userId: creator.id, catalogVersionId: item.id, sourceType: 'owner_grant',
                sourceKey: `owner:${command.commandId}`, grantTemplateKey: command.templateKey,
                createdByUserId: owner.id, status, pointsCost: 0,
                exposureValue: Number(item.exposure_value), semanticHash: hash,
                notificationPolicy: boundary.allowRealtime ? 'normal' : 'quiet_suppressed'
            });
            await this.appendEvent(client, orderId, 'order_submitted', owner.id,
                { templateKey: command.templateKey, creatorUsername: command.creatorUsername });
            if (status === 'pending_approval') await this.appendEvent(client, orderId, 'approval_requested', owner.id);
            else {
                await this.appendEvent(client, orderId, 'order_approved', owner.id, { automatic: true });
                await this.repository.createGrant(client, orderId, creator.id);
                await this.appendEvent(client, orderId, 'grant_available', owner.id);
            }
            const template = this.grantTemplates.get(command.templateKey);
            await this.repository.appendRewardInbox(client, { userId: creator.id, ownerUsername,
                orderId, templateKey: command.templateKey, titleZh: template.titleZh,
                titleEn: template.titleEn, bodyZh: item.description_zh, bodyEn: item.description_en });
            const body = { success: true, order: this.orderProjection(order, item) };
            await this.repository.saveCommand(client, { actorUserId: owner.id, commandId: command.commandId,
                commandType: 'reward.owner.grant', semanticHash: hash, status: 201, body });
            await this.repository.audit(client, { orderId, actorUserId: owner.id,
                action: 'reward.owner.grant', requestId: context.requestId,
                details: { creatorUsername: command.creatorUsername, itemSlug: item.slug,
                    templateKey: command.templateKey, notificationPolicy: order.notification_policy } });
            await this.finalize(client, context, body, 201);
            return { body, realtime: boundary.allowRealtime ? {
                username: creator.username, orderId, templateKey: command.templateKey
            } : null };
        });
        if (result.realtime) {
            try { await this.publishRewardNotification(result.realtime); } catch {
                // Durable inbox storage is authoritative; realtime is best-effort only.
            }
        }
        return result.body;
    }

    async grantFromTrustedSource(raw) {
        const command = validateTrustedGrant(raw);
        return this.repository.withTransaction(client => this.grantTrustedInTransaction(client, command));
    }

    async grantTrustedInTransaction(client, command) {
        const sourceKey = `${command.sourceType}:${command.sourceEventId}`;
        const hash = semanticHash({ action: 'trusted_grant', ...command });
        const accounts = await this.repository.lockAccounts(client, [command.username]);
        const account = accounts.get(command.username);
        if (!accountAvailable(account)) {
            throw new RewardCatalogServiceError('REWARD_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
        }
        const existing = await this.repository.findSourceOrder(client, account.id, command.sourceType, sourceKey);
        if (existing) {
            if (existing.semantic_hash !== hash) throw new RewardCatalogServiceError(
                'REWARD_SOURCE_COLLISION', 409, 'Trusted reward source identity changed semantics');
            return { success: true, replayed: true, order: this.orderProjection(existing) };
        }
        const item = await this.repository.lockCatalogVersionBySlug(client, command.catalogSlug);
        await this.requireEligible(client, account, item, command.sourceType);
        const orderId = crypto.randomUUID();
        const status = item.approval_policy === 'manual' ? 'pending_approval' : 'approved';
        if (status === 'approved') {
            await this.repository.reserveBudgets(client, account.id, Number(item.exposure_value), dateKey(this.clock()));
        }
        const order = await this.repository.createOrder(client, {
            id: orderId, userId: account.id, catalogVersionId: item.id,
            sourceType: command.sourceType, sourceKey, createdByUserId: null, status,
            pointsCost: 0, exposureValue: Number(item.exposure_value), semanticHash: hash
        });
        await this.appendEvent(client, orderId, 'order_submitted', null,
            { sourceType: command.sourceType, sourceEventId: command.sourceEventId });
        if (status === 'pending_approval') {
            await this.appendEvent(client, orderId, 'approval_requested', null);
        } else {
            await this.appendEvent(client, orderId, 'order_approved', null, { automatic: true });
            if (item.kind === 'provider_gift') {
                await this.repository.createGrant(client, orderId, account.id);
                await this.appendEvent(client, orderId, 'grant_available', null);
            }
        }
        await this.repository.audit(client, { orderId, action: 'reward.trusted.grant',
            details: { sourceType: command.sourceType, sourceEventId: command.sourceEventId,
                itemSlug: item.slug, status } });
        return { success: true, replayed: false, order: this.orderProjection(order, item) };
    }

    async dispatchClaimedIntent(intent, workerId) {
        if (!this.grantIntentRepository?.lockClaim || !this.grantIntentRepository?.completeClaim) {
            throw new RewardCatalogServiceError('REWARD_GRANT_DISPATCH_UNAVAILABLE', 503,
                'Trusted reward dispatcher is unavailable');
        }
        return this.repository.withTransaction(async client => {
            const claimed = await this.grantIntentRepository.lockClaim(client, intent.id, workerId);
            if (!claimed) throw new RewardCatalogServiceError('REWARD_GRANT_LEASE_LOST', 409,
                'Trusted reward grant lease is no longer active');
            const command = validateTrustedGrant({ sourceType: claimed.source_type,
                sourceEventId: claimed.source_event_id, username: claimed.username,
                catalogSlug: claimed.catalog_slug });
            const response = await this.grantTrustedInTransaction(client, command);
            await this.grantIntentRepository.completeClaim(client, claimed, workerId,
                response.order.id, response);
            return response;
        });
    }

    async review(adminUsername, raw, context = {}) {
        const command = validateReview(raw);
        const hash = semanticHash({ action: 'review', adminUsername, ...command });
        return this.repository.withTransaction(async client => {
            const identity = await this.repository.readOrderIdentity(client, command.orderId);
            if (!identity) throw new RewardCatalogServiceError('REWARD_ORDER_NOT_FOUND', 404, 'Reward order not found');
            const accounts = await this.repository.lockAccounts(client, [adminUsername, identity.username]);
            const admin = accounts.get(adminUsername);
            const creator = accounts.get(identity.username);
            if (!accountAvailable(admin) || admin.is_admin !== true) {
                throw new RewardCatalogServiceError('REWARD_ADMIN_REQUIRED', 403, 'Active administrator required');
            }
            const existing = await this.repository.findCommand(client, admin.id, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) {
                await this.finalize(client, context, replay, existing.response_status);
                return replay;
            }
            const order = await this.repository.lockOrder(client, command.orderId);
            if (!order || order.status !== 'pending_approval') {
                throw new RewardCatalogServiceError('REWARD_REVIEW_STATE_INVALID', 409, 'Order is not awaiting review');
            }
            if (order.source_type === 'owner_grant' && Number(order.created_by_user_id) === Number(admin.id)) {
                throw new RewardCatalogServiceError('REWARD_INDEPENDENT_REVIEW_REQUIRED', 403,
                    'Owner grant requires a different administrator for high-value review');
            }
            let next;
            let balance = Number(creator.balance);
            if (command.decision === 'approve') {
                if (!accountAvailable(creator)) {
                    throw new RewardCatalogServiceError('REWARD_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
                }
                const lockedVersion = await this.repository.lockCatalogVersion(client, order.catalog_version_id);
                const item = { ...lockedVersion, id: Number(order.catalog_version_id),
                    points_price: order.points_cost, exposure_value: order.exposure_value };
                await this.requireEligible(client, creator, item, order.source_type, order.id);
                balance = Number((await this.approveValue(client, creator, {
                    ...item, points_price: order.points_cost
                }, order.id, context)).balance);
                next = await this.repository.transitionOrder(client, order.id,
                    transitionOrder(order.status, 'approve'), admin.id);
                await this.appendEvent(client, order.id, 'order_approved', admin.id, { manual: true });
                if (order.kind === 'provider_gift') {
                    await this.repository.createGrant(client, order.id, creator.id);
                    await this.appendEvent(client, order.id, 'grant_available', admin.id);
                }
            } else {
                next = await this.repository.transitionOrder(client, order.id,
                    transitionOrder(order.status, 'reject'), admin.id);
                await this.appendEvent(client, order.id, 'order_rejected', admin.id);
            }
            const body = { success: true, order: this.orderProjection(next, order), balance };
            await this.repository.saveCommand(client, { actorUserId: admin.id, commandId: command.commandId,
                commandType: `reward.review.${command.decision}`, semanticHash: hash, status: 200, body });
            await this.repository.audit(client, { orderId: order.id, actorUserId: admin.id,
                action: `reward.review.${command.decision}`, requestId: context.requestId,
                details: { sourceType: order.source_type, itemSlug: order.slug } });
            await this.finalize(client, context, body);
            return body;
        });
    }

    async claim(username, raw, context = {}) {
        const command = validateOrderCommand(raw, 'claim');
        const hash = semanticHash({ action: 'claim', username, ...command });
        return this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, [username]);
            const account = accounts.get(username);
            if (!accountAvailable(account)) {
                throw new RewardCatalogServiceError('REWARD_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
            }
            const existing = await this.repository.findCommand(client, account.id, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) {
                await this.finalize(client, context, replay, existing.response_status);
                return replay;
            }
            const order = await this.repository.lockOrder(client, command.orderId, username);
            if (!order || order.status !== 'approved') {
                throw new RewardCatalogServiceError('REWARD_CLAIM_STATE_INVALID', 409, 'Reward is not claimable');
            }
            let inventoryId = null;
            if (order.kind === 'provider_gift') {
                const grant = await this.repository.lockGrant(client, order.id);
                if (!grant || grant.status !== 'available') throw new RewardCatalogServiceError(
                    'REWARD_GRANT_UNAVAILABLE', 409, 'Gift entitlement unavailable');
                const mapping = this.giftConfig.礼物映射[order.provider_gift_type];
                inventoryId = await this.repository.claimProviderGrant(client, {
                    orderId: order.id, username, giftType: order.provider_gift_type,
                    giftName: mapping.名称, providerGiftId: String(mapping.bilibili_id),
                    exposureValue: Number(order.exposure_value)
                });
            } else {
                await this.repository.claimAsset(client, { userId: account.id, kind: order.kind,
                    slug: order.slug, orderId: order.id });
            }
            const next = await this.repository.transitionOrder(client, order.id,
                transitionOrder(order.status, 'claim'), account.id);
            await this.appendEvent(client, order.id, 'order_claimed', account.id,
                { inventoryCreated: inventoryId !== null, assetType: order.kind,
                    deliveryBoundary: inventoryId === null ? 'not_applicable' : 'stored_backpack_only' });
            const body = { success: true, order: this.orderProjection(next, order), inventoryId };
            await this.repository.saveCommand(client, { actorUserId: account.id, commandId: command.commandId,
                commandType: 'reward.order.claim', semanticHash: hash, status: 200, body });
            await this.repository.audit(client, { orderId: order.id, actorUserId: account.id,
                action: 'reward.order.claimed', requestId: context.requestId,
                details: { itemSlug: order.slug, kind: order.kind, inventoryId } });
            await this.finalize(client, context, body);
            return body;
        });
    }

    async cancel(username, raw, context = {}) {
        return this.simpleTerminalCommand(username, raw, 'cancel', context);
    }

    async revoke(ownerUsername, raw, context = {}) {
        return this.simpleTerminalCommand(ownerUsername, raw, 'revoke', context, true);
    }

    async simpleTerminalCommand(username, raw, action, context, ownerAction = false) {
        const command = validateOrderCommand(raw, action);
        const hash = semanticHash({ action, username, ...command });
        return this.repository.withTransaction(async client => {
            const identity = await this.repository.readOrderIdentity(client, command.orderId);
            if (!identity) throw new RewardCatalogServiceError('REWARD_ORDER_NOT_FOUND', 404, 'Reward order not found');
            const accounts = await this.repository.lockAccounts(client, ownerAction ? [username, identity.username] : [username]);
            const actor = accounts.get(username);
            if (!accountAvailable(actor)
                || (ownerAction && (username !== this.ownerUsername || actor.is_admin !== true))) {
                throw new RewardCatalogServiceError(ownerAction ? 'REWARD_OWNER_REQUIRED' : 'REWARD_ACCOUNT_UNAVAILABLE',
                    403, 'Reward actor unavailable');
            }
            const existing = await this.repository.findCommand(client, actor.id, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) {
                await this.finalize(client, context, replay, existing.response_status);
                return replay;
            }
            const order = await this.repository.lockOrder(client, command.orderId, ownerAction ? null : username);
            if (!order || (ownerAction && order.source_type !== 'owner_grant')) {
                throw new RewardCatalogServiceError('REWARD_ORDER_NOT_FOUND', 404, 'Reward order not found');
            }
            let transition;
            try {
                transition = transitionOrder(order.status, action);
            } catch {
                throw new RewardCatalogServiceError('REWARD_TRANSITION_INVALID', 409, 'Reward transition is not allowed');
            }
            if (action === 'revoke' && Number(order.points_cost) !== 0) {
                throw new RewardCatalogServiceError('REWARD_VALUE_REVOCATION_FORBIDDEN', 409,
                    'A paid reward cannot be revoked');
            }
            if (action === 'revoke' && order.status === 'approved'
                && !await this.repository.revokeGrant(client, order.id)) {
                throw new RewardCatalogServiceError('REWARD_GRANT_UNAVAILABLE', 409, 'Grant already claimed');
            }
            const next = await this.repository.transitionOrder(client, order.id, transition, actor.id);
            await this.appendEvent(client, order.id,
                action === 'revoke' ? 'grant_revoked' : 'order_cancelled', actor.id);
            const body = { success: true, order: this.orderProjection(next, order) };
            await this.repository.saveCommand(client, { actorUserId: actor.id, commandId: command.commandId,
                commandType: `reward.order.${action}`, semanticHash: hash, status: 200, body });
            await this.repository.audit(client, { orderId: order.id, actorUserId: actor.id,
                action: `reward.order.${action}`, requestId: context.requestId,
                details: { sourceType: order.source_type, itemSlug: order.slug } });
            await this.finalize(client, context, body);
            return body;
        });
    }

    async wishlist(username, raw, context = {}) {
        const command = validateWishlist(raw);
        const hash = semanticHash({ action: 'wishlist', username, ...command });
        return this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, [username]);
            const account = accounts.get(username);
            if (!accountAvailable(account)) {
                throw new RewardCatalogServiceError('REWARD_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
            }
            const existing = await this.repository.findCommand(client, account.id, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) {
                await this.finalize(client, context, replay, existing.response_status);
                return replay;
            }
            const item = await this.repository.lockCatalogVersion(client, command.catalogVersionId);
            await this.requireEligible(client, account, item, 'direct_redemption');
            const row = await this.repository.upsertWishlist(client, account.id, command);
            const body = { success: true, wishlist: { catalogVersionId: Number(row.catalog_version_id),
                targetQuantity: Number(row.target_quantity), priority: Number(row.priority),
                revision: Number(row.revision) } };
            await this.repository.saveCommand(client, { actorUserId: account.id, commandId: command.commandId,
                commandType: 'reward.wishlist.update', semanticHash: hash, status: 200, body });
            await this.repository.audit(client, { actorUserId: account.id, action: 'reward.wishlist.updated',
                requestId: context.requestId, details: { itemSlug: item.slug, priority: command.priority } });
            await this.finalize(client, context, body);
            return body;
        });
    }

    async state(username, page = 1) {
        const safePage = Number.isSafeInteger(page) && page >= 1 && page <= 500 ? page : 1;
        const result = await this.repository.state(username, { limit: 30, offset: (safePage - 1) * 30 });
        return {
            success: true,
            orders: result.orders.map(row => ({
                id: row.id, slug: row.slug, kind: row.kind, sourceType: row.source_type,
                status: row.status, pointsCost: Number(row.points_cost),
                notificationPolicy: row.notification_policy,
                titleZh: row.title_zh, titleEn: row.title_en,
                inventoryStatus: row.inventory_status || null,
                deliveryStatus: row.delivery_status || null,
                needsReconciliation: row.delivery_status === 'uncertain',
                deliveryMessageCode: row.delivery_status === 'uncertain' ? 'DELIVERY_AWAITING_RECONCILIATION'
                    : row.delivery_status === 'failed' ? 'DELIVERY_FAILED' : null,
                createdAt: row.created_at, approvedAt: row.approved_at, claimedAt: row.claimed_at
            })),
            wishlist: result.wishlist.map(row => ({ row, access: evaluateRewardAccess(row, {
                sourceType: 'direct_redemption', userItemCount: Number(row.user_item_count || 0),
                stockUsed: Number(row.stock_used || 0), pendingCount: Number(row.pending_count || 0),
                cooldownUntil: row.cooldown_until,
                unlockKeys: row.has_unlock ? new Set([row.visibility_key]) : new Set(), now: this.clock()
            }) })).filter(entry => entry.access.visible).map(({ row }) => ({
                catalogVersionId: Number(row.catalog_version_id), slug: row.slug,
                titleZh: row.title_zh, titleEn: row.title_en,
                targetQuantity: Number(row.target_quantity), priority: Number(row.priority),
                revision: Number(row.revision) })),
            assets: result.assets.map(row => ({ type: row.asset_type, key: row.asset_key, acquiredAt: row.acquired_at })),
            pagination: { page: safePage, limit: 30, total: result.total,
                pages: Math.max(1, Math.ceil(result.total / 30)) }
        };
    }

    async adminState(adminUsername) {
        const admin = await this.repository.accountIdentity(adminUsername);
        if (!accountAvailable(admin) || admin.is_admin !== true) {
            throw new RewardCatalogServiceError('REWARD_ADMIN_REQUIRED', 403, 'Active administrator required');
        }
        const canGrant = Boolean(this.ownerUsername && adminUsername === this.ownerUsername
            && accountAvailable(admin));
        const rows = await this.repository.pendingReview(50);
        const deadLetters = this.grantIntentRepository?.listDeadLetters
            ? await this.grantIntentRepository.listDeadLetters(50) : [];
        return { success: true, caller: adminUsername, pending: rows.map(row => ({
            id: row.id, creatorUsername: row.username, slug: row.slug,
            titleZh: row.title_zh, titleEn: row.title_en, sourceType: row.source_type,
            templateKey: row.grant_template_key, pointsCost: Number(row.points_cost),
            exposureValue: Number(row.exposure_value), createdAt: row.created_at
        })), canGrant,
        grantItems: canGrant ? (await this.repository.listCatalog(adminUsername)).filter(row => evaluateRewardAccess(row, {
            sourceType: 'owner_grant', userItemCount: Number(row.user_item_count || 0),
            stockUsed: Number(row.stock_used || 0), pendingCount: Number(row.pending_count || 0),
            cooldownUntil: row.cooldown_until,
            unlockKeys: row.has_unlock ? new Set([row.visibility_key]) : new Set(), now: this.clock()
        }).visible).map(row => ({ id: Number(row.id), slug: row.slug, titleZh: row.title_zh,
                titleEn: row.title_en, requiresApproval: row.approval_policy === 'manual' })) : [],
        grantTemplates: canGrant ? this.pack.grantTemplates : [],
        deadLetters: deadLetters.map(row => ({ id: row.id, sourceType: row.source_type,
            sourceEventId: row.source_event_id, creatorUsername: row.username,
            catalogSlug: row.catalog_slug, attempts: Number(row.attempts),
            errorCode: row.last_error_code, errorDetail: row.last_error_detail,
            deadLetteredAt: row.dead_lettered_at })) };
    }
}

module.exports = { RewardCatalogService, RewardCatalogServiceError, accountAvailable, cooldownUntil,
    dateKey, semanticHash };
