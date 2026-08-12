'use strict';

const crypto = require('crypto');
const { stableStringify } = require('./request-signature');

const MAX_GIFT_ITEMS = 1000;
const MAX_GIFT_COUNT = 1000000;
const MAX_TICKET_COUNT = 100000000;

function normalizeGiftItems(giftIds) {
    if (!Array.isArray(giftIds) || giftIds.length < 1 || giftIds.length > MAX_GIFT_ITEMS) {
        return null;
    }
    const normalized = [];
    let totalCount = 0;
    for (const item of giftIds) {
        const id = String(
            item && typeof item === 'object' && !Array.isArray(item)
                ? item.id ?? item.gift_id ?? item.giftId ?? ''
                : item
        );
        const count = Number(
            item && typeof item === 'object' && !Array.isArray(item)
                ? item.count ?? 1
                : 1
        );
        if (!/^[A-Za-z0-9_-]{1,50}$/.test(id)
            || !Number.isSafeInteger(count) || count < 1 || count > MAX_GIFT_COUNT) {
            return null;
        }
        totalCount += count;
        if (!Number.isSafeInteger(totalCount) || totalCount > MAX_GIFT_COUNT) return null;
        normalized.push({ id, count });
    }
    return normalized;
}

function computeTicketCount(giftIds, giftConfig) {
    const items = normalizeGiftItems(giftIds);
    if (!items) return null;
    const poolConfig = giftConfig?.['礼物池配置'];
    if (!poolConfig || typeof poolConfig !== 'object') return null;

    let total = 0;
    for (const { id, count } of items) {
        if (!Object.hasOwn(poolConfig, id)) return null;
        const entry = poolConfig[id];
        const price = Array.isArray(entry) ? Number(entry[1]) : Number(entry?.value);
        if (!Number.isSafeInteger(price) || price < 0) return null;
        const itemTickets = price * 10 * count;
        if (!Number.isSafeInteger(itemTickets)) return null;
        total += itemTickets;
        if (!Number.isSafeInteger(total) || total > MAX_TICKET_COUNT) return null;
    }
    return total > 0 ? total : null;
}

function createSpendHash({ username, roomId, runnerGeneration, giftIds, ticketCount }) {
    return crypto.createHash('sha256').update(stableStringify({
        username,
        roomId: String(roomId),
        runnerGeneration,
        giftIds: normalizeGiftItems(giftIds),
        ticketCount
    })).digest('hex');
}

module.exports = {
    computeTicketCount,
    createSpendHash,
    normalizeGiftItems
};
