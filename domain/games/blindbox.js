'use strict';

const { assertTargetRtp, weightedRtp } = require('./economics');
const { BLINDBOX_CONFIG } = require('./configuration');
const { assertWeightTable, pickWeightedOutcome } = require('./random');

function loadGiftValues(giftConfig) {
    const configuredPool = giftConfig?.礼物池配置 || {};
    const values = new Map();
    for (const [giftId, raw] of Object.entries(configuredPool)) {
        const name = Array.isArray(raw) ? raw[0] : raw?.name;
        const value = Number(Array.isArray(raw) ? raw[1] : raw?.value);
        if (!/^\d+$/.test(giftId) || typeof name !== 'string' || !name.trim()
            || !Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Invalid blindbox gift configuration: ${giftId}`);
        }
        values.set(giftId, { name: name.trim(), value });
    }
    if (values.size === 0) throw new Error('Blindbox gift pool configuration is empty');
    return values;
}

function createBlindboxRuntime(giftConfig) {
    const gifts = loadGiftValues(giftConfig);
    const pools = new Map();
    const rtp = Object.create(null);
    const publicConfigs = Object.create(null);
    for (const [tierKey, tier] of Object.entries(BLINDBOX_CONFIG.tiers)) {
        const seen = new Set();
        const outcomes = tier.items.map((item) => {
            const gift = gifts.get(item.giftId);
            if (!gift) throw new Error(`Blindbox reward is missing from gift pool: ${item.giftId}`);
            if (seen.has(item.giftId)) throw new Error(`Duplicate blindbox reward: ${item.giftId}`);
            seen.add(item.giftId);
            return Object.freeze({
                giftId: item.giftId,
                name: item.name || gift.name,
                value: gift.value,
                weightUnits: item.weightUnits,
                weight: item.weightUnits / 1_000_000
            });
        });
        assertWeightTable(`blindbox:${tierKey}`, outcomes);
        rtp[tierKey] = assertTargetRtp(`blindbox:${tierKey}`, weightedRtp(tier.cost, outcomes));
        pools.set(tierKey, Object.freeze(outcomes));
        publicConfigs[tierKey] = Object.freeze({
            key: tier.key,
            nameZh: tier.nameZh,
            nameEn: tier.nameEn,
            cost: tier.cost,
            items: Object.freeze(outcomes.map((outcome) => Object.freeze({
                name: outcome.name,
                weight: outcome.weight
            })))
        });
    }
    return Object.freeze({
        counts: BLINDBOX_CONFIG.counts,
        tiers: Object.values(BLINDBOX_CONFIG.tiers),
        configs: Object.freeze(publicConfigs),
        pools,
        rtp: Object.freeze(rtp),
        pick(tierKey, randomInt) {
            const pool = pools.get(tierKey);
            if (!pool) return null;
            return pickWeightedOutcome(pool, randomInt);
        }
    });
}

function projectBlindboxRewards(rewards) {
    if (!Array.isArray(rewards)) throw new TypeError('Blindbox rewards must be an array');
    return Object.freeze(rewards.map((reward) => {
        if (typeof reward?.name !== 'string' || !reward.name.trim()
            || !Number.isSafeInteger(reward.value) || reward.value < 0) {
            throw new TypeError('Blindbox reward is invalid');
        }
        return Object.freeze({ name: reward.name, value: reward.value });
    }));
}

module.exports = { createBlindboxRuntime, loadGiftValues, projectBlindboxRewards };
