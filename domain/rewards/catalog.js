'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../lib/idempotency');

const ITEM_KINDS = Object.freeze(['provider_gift', 'cosmetic', 'story_key']);
const APPROVALS = Object.freeze(['automatic', 'manual']);
const ORDER_STATES = Object.freeze(['submitted', 'pending_approval', 'approved', 'rejected', 'claimed', 'cancelled', 'revoked']);
const GRANT_TEMPLATES = new Set(['quest-chain-celebration', 'story-route-milestone',
    'co-op-mastery-thanks', 'season-contribution-thanks']);
const TRUSTED_REWARD_SOURCES = new Set(['quest', 'story', 'game', 'achievement', 'season']);

function contentHash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
    return value;
}

function assertKeys(value, allowed, label) {
    assertPlainObject(value, label);
    const unknown = Object.keys(value).find(key => !allowed.includes(key));
    if (unknown) throw new TypeError(`Unexpected ${label} field: ${unknown}`);
    return value;
}

function assertToken(value, label, maximum = 120) {
    if (typeof value !== 'string' || value.length > maximum || !/^[a-z][a-z0-9._-]{1,119}$/.test(value)) {
        throw new TypeError(`Invalid ${label}`);
    }
    return value;
}

function assertUuid(value, label) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw new TypeError(`Invalid ${label}`);
    }
    return value;
}

function assertVisibilityKey(value) {
    if (typeof value !== 'string' || value.length < 3 || value.length > 120
        || !/^[a-z][a-z0-9:._-]{2,119}$/.test(value)) throw new TypeError('Invalid visibility key');
    return value;
}

function safeInteger(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`Invalid ${label}`);
    return value;
}

function validateVisibility(rule) {
    const keyed = ['story_unlock', 'achievement_unlock'].includes(rule?.type);
    const seasonal = rule?.type === 'season_window';
    assertKeys(rule, keyed ? ['type', 'key'] : seasonal ? ['type', 'startsAt', 'endsAt'] : ['type'], 'visibility rule');
    if (!['open', 'owner_only', 'story_unlock', 'achievement_unlock', 'season_window'].includes(rule.type)) {
        throw new TypeError('Unknown visibility rule');
    }
    if (keyed) assertVisibilityKey(rule.key);
    if (seasonal) {
        const starts = new Date(rule.startsAt);
        const ends = new Date(rule.endsAt);
        if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || starts >= ends) {
            throw new TypeError('Invalid season visibility window');
        }
    }
    return rule;
}

function validateCatalog(pack, giftConfig) {
    assertPlainObject(pack, 'reward catalog');
    assertToken(pack.catalogVersion, 'catalog version');
    if (!Array.isArray(pack.items) || pack.items.length < 10 || !Array.isArray(pack.budgets)
        || !Array.isArray(pack.grantTemplates)) throw new TypeError('Incomplete reward catalog');
    const slugs = new Set();
    const prose = new Set();
    for (const item of pack.items) {
        assertToken(item.slug, 'item slug');
        if (slugs.has(item.slug)) throw new TypeError('Duplicate reward item slug');
        slugs.add(item.slug);
        if (!ITEM_KINDS.includes(item.kind) || !APPROVALS.includes(item.approval)) throw new TypeError('Invalid reward item policy');
        for (const field of ['titleZh', 'titleEn', 'descriptionZh', 'descriptionEn']) {
            if (typeof item[field] !== 'string' || item[field].length < 4 || item[field].length > 500
                || prose.has(item[field])) throw new TypeError('Invalid or duplicate reward prose');
            prose.add(item[field]);
        }
        for (const [field, minimum, maximum] of [['pointsPrice', 0, 100000000], ['exposureValue', 0, 100000000],
            ['stockLimit', 1, 1000000], ['perUserLimit', 1, 1000], ['cooldownHours', 0, 87600]]) {
            safeInteger(item[field], minimum, maximum, field);
        }
        validateVisibility(item.visibility);
        if (item.kind === 'provider_gift') {
            const configured = giftConfig?.礼物映射?.[item.providerGiftType];
            if (!configured || typeof configured.名称 !== 'string' || !/^[0-9]{1,20}$/.test(String(configured.bilibili_id))) {
                throw new TypeError('Reward provider mapping is unavailable');
            }
            if (!item.ownerGrantOnly && Number(configured.电币成本) !== item.pointsPrice) {
                throw new TypeError('Reward point price differs from existing server gift price');
            }
        } else if (item.providerGiftType !== undefined || item.exposureValue !== 0) {
            throw new TypeError('Non-provider rewards cannot carry provider value');
        }
    }
    for (const template of pack.grantTemplates) {
        if (!GRANT_TEMPLATES.has(template.key) || !template.titleZh || !template.titleEn) throw new TypeError('Invalid grant template');
    }
    return true;
}

function projectItem(row, eligibility) {
    return {
        id: Number(row.version_id || row.id),
        slug: row.slug,
        catalogVersion: row.catalog_version,
        version: Number(row.version),
        kind: row.kind,
        titleZh: row.title_zh,
        titleEn: row.title_en,
        descriptionZh: row.description_zh,
        descriptionEn: row.description_en,
        artKey: row.art_key,
        pointsPrice: Number(row.points_price),
        stockRemaining: Math.max(0, Number(row.stock_limit) - Number(row.stock_used || 0)),
        cooldownHours: Number(row.cooldown_hours),
        requiresApproval: row.approval_policy === 'manual',
        eligible: eligibility.eligible,
        reasonCode: eligibility.reasonCode
    };
}

function evaluateRewardAccess(item, facts) {
    const hidden = Object.freeze({ visible: false, eligible: false, reasonCode: 'REWARD_ITEM_NOT_FOUND' });
    if (!item || item.lifecycle !== 'active') return hidden;
    const sourceType = facts?.sourceType;
    const ownerFlow = sourceType === 'owner_grant';
    if (ownerFlow ? item.owner_grant_only !== true : item.owner_grant_only === true) return hidden;
    if (item.visibility_type === 'owner_only' && !ownerFlow) return hidden;
    if (item.visibility_type === 'owner_only' && item.owner_grant_only !== true) return hidden;
    const unlockKeys = facts?.unlockKeys instanceof Set ? facts.unlockKeys : new Set();
    if (['story_unlock', 'achievement_unlock'].includes(item.visibility_type)
        && !unlockKeys.has(item.visibility_key)) return hidden;
    const now = facts?.now instanceof Date ? facts.now : new Date(facts?.now || Date.now());
    if (item.visibility_type === 'season_window'
        && (now < new Date(item.visibility_start) || now >= new Date(item.visibility_end))) return hidden;
    if (Number(facts?.userItemCount || 0) >= Number(item.per_user_limit)) {
        return Object.freeze({ visible: true, eligible: false, reasonCode: 'USER_LIMIT_REACHED' });
    }
    if (Number(facts?.stockUsed || 0) >= Number(item.stock_limit)) {
        return Object.freeze({ visible: true, eligible: false, reasonCode: 'OUT_OF_STOCK' });
    }
    if (Number(facts?.pendingCount || 0) > 0) {
        return Object.freeze({ visible: true, eligible: false, reasonCode: 'REWARD_PENDING_ORDER_EXISTS' });
    }
    if (facts?.cooldownUntil && new Date(facts.cooldownUntil) > now) {
        return Object.freeze({ visible: true, eligible: false, reasonCode: 'COOLDOWN_ACTIVE' });
    }
    return Object.freeze({ visible: true, eligible: true, reasonCode: null });
}

function evaluateEligibility(item, facts) {
    const result = evaluateRewardAccess(item, facts);
    return { eligible: result.eligible, reasonCode: result.reasonCode };
}

function transitionOrder(state, action) {
    if (!ORDER_STATES.includes(state)) throw new TypeError('Unknown reward order state');
    const transitions = {
        submitted: { require_approval: 'pending_approval', auto_approve: 'approved', cancel: 'cancelled' },
        pending_approval: { approve: 'approved', reject: 'rejected', cancel: 'cancelled', revoke: 'revoked' },
        approved: { claim: 'claimed', revoke: 'revoked' }
    };
    const next = transitions[state]?.[action];
    if (!next) throw new TypeError(`Invalid reward transition: ${state}/${action}`);
    return next;
}

function validateCreateOrder(raw) {
    const value = assertKeys(raw, ['commandId', 'catalogVersionId', 'quantity'], 'reward order');
    return { commandId: assertUuid(value.commandId, 'commandId'),
        catalogVersionId: safeInteger(value.catalogVersionId, 1, Number.MAX_SAFE_INTEGER, 'catalogVersionId'),
        quantity: safeInteger(value.quantity, 1, 1, 'quantity') };
}

function validateOrderCommand(raw, action) {
    const value = assertKeys(raw, ['commandId', 'orderId'], `${action} command`);
    return { commandId: assertUuid(value.commandId, 'commandId'), orderId: assertUuid(value.orderId, 'orderId') };
}

function validateWishlist(raw) {
    const value = assertKeys(raw, ['commandId', 'catalogVersionId', 'targetQuantity', 'priority'], 'wishlist command');
    return { commandId: assertUuid(value.commandId, 'commandId'),
        catalogVersionId: safeInteger(value.catalogVersionId, 1, Number.MAX_SAFE_INTEGER, 'catalogVersionId'),
        targetQuantity: safeInteger(value.targetQuantity, 1, 10, 'targetQuantity'),
        priority: safeInteger(value.priority, 1, 5, 'priority') };
}

function validateOwnerGrant(raw) {
    const value = assertKeys(raw, ['commandId', 'creatorUsername', 'catalogVersionId', 'templateKey'], 'owner grant');
    if (typeof value.creatorUsername !== 'string' || !/^[\p{L}\p{N}_-]{3,32}$/u.test(value.creatorUsername)) {
        throw new TypeError('Invalid creatorUsername');
    }
    if (!GRANT_TEMPLATES.has(value.templateKey)) throw new TypeError('Unknown grant template');
    return { commandId: assertUuid(value.commandId, 'commandId'), creatorUsername: value.creatorUsername,
        catalogVersionId: safeInteger(value.catalogVersionId, 1, Number.MAX_SAFE_INTEGER, 'catalogVersionId'),
        templateKey: value.templateKey };
}

function validateReview(raw) {
    const value = assertKeys(raw, ['commandId', 'orderId', 'decision'], 'reward review');
    if (!['approve', 'reject'].includes(value.decision)) throw new TypeError('Invalid review decision');
    return { commandId: assertUuid(value.commandId, 'commandId'),
        orderId: assertUuid(value.orderId, 'orderId'), decision: value.decision };
}

function validateTrustedGrant(raw) {
    const value = assertKeys(raw, ['sourceType', 'sourceEventId', 'username', 'catalogSlug'], 'trusted reward grant');
    if (!TRUSTED_REWARD_SOURCES.has(value.sourceType)) throw new TypeError('Unknown trusted reward source');
    if (typeof value.sourceEventId !== 'string' || value.sourceEventId.length < 8 || value.sourceEventId.length > 120
        || !/^[A-Za-z0-9:_.-]+$/.test(value.sourceEventId)) throw new TypeError('Invalid reward source identity');
    if (typeof value.username !== 'string' || !/^[\p{L}\p{N}_-]{3,32}$/u.test(value.username)) {
        throw new TypeError('Invalid reward recipient');
    }
    return { sourceType: value.sourceType, sourceEventId: value.sourceEventId,
        username: value.username, catalogSlug: assertToken(value.catalogSlug, 'catalogSlug') };
}

module.exports = { APPROVALS, GRANT_TEMPLATES, ITEM_KINDS, ORDER_STATES, assertKeys, contentHash,
    evaluateEligibility, evaluateRewardAccess, projectItem, transitionOrder, validateCatalog, validateCreateOrder,
    validateOrderCommand, validateOwnerGrant, validateReview, validateTrustedGrant,
    validateVisibility, validateWishlist };
