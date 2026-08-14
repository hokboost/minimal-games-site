'use strict';

const { GAME_DEFINITIONS, GAME_GROUPS } = require('./catalog');
const {
    BLINDBOX_CONFIG,
    DUEL_CONFIG,
    FLIP_CONFIG,
    QUIZ_CONFIG,
    SCRATCH_CONFIG,
    SLOT_CONFIG,
    SPIN_CONFIG,
    STONE_CONFIG,
    WISH_CONFIGS
} = require('./configuration');
const {
    RTP_POLICY,
    assertRtp,
    assertTargetRtp,
    maximumFlipPolicyEconomics,
    maximumStonePolicyEconomics,
    multiplierRtp,
    optimalFlipEconomics,
    optimalStoneEconomics,
    wishRtp
} = require('./economics');
const { assertWeightTable } = require('./random');

const SUPPORTED_ECONOMICS_KINDS = new Set([
    'allowance',
    'daily-capped-skill',
    'dynamic-probability',
    'free',
    'guaranteed-geometric',
    'optimal-stopping',
    'weighted-multiplier',
    'weighted-value'
]);

function validateDefinitions() {
    const ids = new Set();
    const hrefs = new Set();
    const indexes = new Set();
    const actionKeys = new Set();
    const groupIds = new Set(GAME_GROUPS.map((group) => group.key));
    for (const definition of GAME_DEFINITIONS) {
        if (!/^[a-z][a-z0-9-]{1,31}$/.test(definition.id)) {
            throw new Error(`Invalid game id: ${definition.id}`);
        }
        if (ids.has(definition.id) || hrefs.has(definition.href) || indexes.has(definition.index)) {
            throw new Error(`Duplicate game descriptor: ${definition.id}`);
        }
        if (!groupIds.has(definition.group)) throw new Error(`Unknown game group: ${definition.group}`);
        if (!SUPPORTED_ECONOMICS_KINDS.has(definition.economicsKind)) {
            throw new Error(`Unknown economics kind: ${definition.economicsKind}`);
        }
        if (!Array.isArray(definition.actions) || definition.actions.length === 0) {
            throw new Error(`Game has no action descriptors: ${definition.id}`);
        }
        const derivedActionPaths = definition.actions.map((action) => action.path);
        if (derivedActionPaths.length !== definition.actionPaths.length
            || derivedActionPaths.some((path, index) => path !== definition.actionPaths[index])) {
            throw new Error(`Game actionPaths drifted from actions: ${definition.id}`);
        }
        for (const action of definition.actions) {
            const actionKey = `${action.method} ${action.path}`;
            if (action.method !== 'POST' || typeof action.path !== 'string'
                || !action.path.startsWith('/api/')) {
                throw new Error(`Invalid game action descriptor: ${definition.id}:${actionKey}`);
            }
            if (actionKeys.has(actionKey)) throw new Error(`Duplicate game action: ${actionKey}`);
            if (!Array.isArray(action.policies) || action.policies.length === 0
                || new Set(action.policies).size !== action.policies.length
                || action.policies.some((policy) => typeof policy !== 'string' || !policy)) {
                throw new Error(`Invalid game action policies: ${definition.id}:${actionKey}`);
            }
            actionKeys.add(actionKey);
        }
        ids.add(definition.id);
        hrefs.add(definition.href);
        indexes.add(definition.index);
    }
}

function calculateDuelCost(giftType, power) {
    const reward = DUEL_CONFIG.rewards[giftType]?.reward;
    if (!Number.isSafeInteger(reward) || !Number.isInteger(power)
        || power < 1 || power > DUEL_CONFIG.maximumPower) return null;
    const expectedPayout = reward * power / 100;
    const minimumCost = Math.ceil(expectedPayout / RTP_POLICY.maximum);
    const maximumCost = Math.floor(expectedPayout / RTP_POLICY.targetMinimum);
    if (minimumCost > maximumCost) return null;
    return Math.min(
        maximumCost,
        Math.max(minimumCost, Math.round(expectedPayout / DUEL_CONFIG.targetRtp))
    );
}

function duelMinimumPower(giftType) {
    for (let power = 1; power <= DUEL_CONFIG.maximumPower; power += 1) {
        if (calculateDuelCost(giftType, power) !== null) return power;
    }
    return null;
}

function validateStaticEconomics() {
    assertWeightTable('slot', SLOT_CONFIG.outcomes);
    assertWeightTable('scratch', SCRATCH_CONFIG.outcomes);
    const scratchCosts = new Set();
    for (const tier of SCRATCH_CONFIG.tiers) {
        if (!Number.isSafeInteger(tier.cost) || tier.cost < 1
            || !Number.isSafeInteger(tier.winCount) || tier.winCount < 1
            || !Number.isSafeInteger(tier.userCount) || tier.userCount < 1
            || !Array.isArray(tier.displayRewards)
            || tier.displayRewards.length === 0
            || tier.displayRewards.some(
                (reward) => !Number.isSafeInteger(reward) || reward < 1
            )
            || scratchCosts.has(tier.cost)) {
            throw new Error(`Invalid scratch tier: ${tier.cost}`);
        }
        scratchCosts.add(tier.cost);
    }
    const spinIds = new Set();
    for (const challenge of SPIN_CONFIG.challenges) {
        if (!/^[a-z][a-z0-9-]{1,49}$/.test(challenge.id)
            || spinIds.has(challenge.id)
            || typeof challenge.labelZh !== 'string' || !challenge.labelZh.trim()
            || typeof challenge.labelEn !== 'string' || !challenge.labelEn.trim()
            || typeof challenge.detailZh !== 'string' || !challenge.detailZh.trim()
            || typeof challenge.detailEn !== 'string' || !challenge.detailEn.trim()
            || !Number.isSafeInteger(challenge.weight) || challenge.weight < 1
            || (challenge.countdownSeconds !== undefined
                && (!Number.isSafeInteger(challenge.countdownSeconds)
                    || challenge.countdownSeconds < 1
                    || challenge.countdownSeconds > 60 * 60))) {
            throw new Error(`Invalid spin challenge: ${challenge.id}`);
        }
        spinIds.add(challenge.id);
    }
    if (spinIds.size < 2) throw new Error('Spin requires at least two challenges');
    const report = {
        policy: RTP_POLICY,
        wish: Object.fromEntries(Object.entries(WISH_CONFIGS).map(([id, config]) => [
            id,
            assertTargetRtp(`wish:${id}`, wishRtp(config))
        ])),
        slot: assertTargetRtp('slot', multiplierRtp(SLOT_CONFIG.outcomes)),
        scratch: assertTargetRtp('scratch', multiplierRtp(SCRATCH_CONFIG.outcomes))
    };
    const flipProfit = optimalFlipEconomics(FLIP_CONFIG.costs, FLIP_CONFIG.cashoutRewards);
    const flipMaximum = maximumFlipPolicyEconomics(FLIP_CONFIG.costs, FLIP_CONFIG.cashoutRewards);
    assertTargetRtp('flip:profit-optimal-policy', flipProfit.rtp);
    assertRtp('flip:maximum-policy', flipMaximum.rtp);
    report.flip = Object.freeze({ profitOptimal: flipProfit.rtp, maximumPolicy: flipMaximum.rtp });
    const stone = optimalStoneEconomics({
        initialCost: STONE_CONFIG.initialCost,
        rewards: STONE_CONFIG.rewards,
        replaceCosts: STONE_CONFIG.replaceCosts,
        slotCount: STONE_CONFIG.slotCount,
        colorCount: STONE_CONFIG.colors.length
    });
    assertTargetRtp('stone:profit-optimal-policy', stone.rtp);
    const stoneMaximum = maximumStonePolicyEconomics({
        initialCost: STONE_CONFIG.initialCost,
        rewards: STONE_CONFIG.rewards,
        replaceCosts: STONE_CONFIG.replaceCosts,
        slotCount: STONE_CONFIG.slotCount,
        colorCount: STONE_CONFIG.colors.length
    });
    assertRtp('stone:maximum-policy', stoneMaximum.rtp);
    report.stone = Object.freeze({
        profitOptimal: stone.rtp,
        maximumPolicy: stoneMaximum.rtp
    });
    report.duel = Object.fromEntries(Object.entries(DUEL_CONFIG.rewards).map(([id, reward]) => {
        const minimumPower = duelMinimumPower(id);
        if (minimumPower === null) throw new Error(`Duel tier has no policy-compliant power: ${id}`);
        let maximumRtp = 0;
        for (let power = minimumPower; power <= DUEL_CONFIG.maximumPower; power += 1) {
            const cost = calculateDuelCost(id, power);
            if (cost === null) continue;
            const rtp = (reward.reward * power / 100) / cost;
            assertTargetRtp(`duel:${id}:${power}`, rtp);
            maximumRtp = Math.max(maximumRtp, rtp);
        }
        return [id, Object.freeze({ minimumPower, maximumRtp })];
    }));
    return Object.freeze(report);
}

validateDefinitions();
const ECONOMICS_REPORT = validateStaticEconomics();
const definitionById = new Map(GAME_DEFINITIONS.map((definition) => [definition.id, definition]));

function getGameDefinition(id) {
    return typeof id === 'string' ? definitionById.get(id) || null : null;
}

function getWishConfig(giftType) {
    return typeof giftType === 'string' && Object.hasOwn(WISH_CONFIGS, giftType)
        ? WISH_CONFIGS[giftType]
        : null;
}

function validateGiftBackedConfiguration(giftConfig) {
    const giftPool = giftConfig?.礼物池配置;
    if (!giftPool || typeof giftPool !== 'object' || Array.isArray(giftPool)) {
        throw new Error('Wish gift pool configuration is missing');
    }

    const seenProviderIds = new Set();
    for (const [giftType, config] of Object.entries(WISH_CONFIGS)) {
        const providerId = config.bilibiliGiftId;
        if (!/^\d+$/.test(providerId) || seenProviderIds.has(providerId)) {
            throw new Error(`Wish ${giftType} has an invalid or duplicate provider gift id`);
        }
        seenProviderIds.add(providerId);
        if (!Object.hasOwn(giftPool, providerId)) {
            throw new Error(`Wish ${giftType} provider gift ${providerId} is missing`);
        }

        const rawGift = giftPool[providerId];
        const configuredValue = Array.isArray(rawGift) ? rawGift[1] : rawGift?.value;
        if (!Number.isSafeInteger(configuredValue) || configuredValue < 0) {
            throw new Error(`Wish ${giftType} provider gift ${providerId} has an invalid integer value`);
        }
        if (configuredValue !== config.rewardValue) {
            throw new Error(
                `Wish ${giftType} reward value ${config.rewardValue} does not match provider gift ${providerId} value ${configuredValue}`
            );
        }
    }
    return true;
}

function getPublicWishConfigs() {
    return Object.freeze(Object.fromEntries(Object.entries(WISH_CONFIGS).map(([id, config]) => {
        const expectedAttempts = (1 - ((1 - config.successRate) ** config.guaranteeCount))
            / config.successRate;
        return [id, Object.freeze({
            giftType: config.giftType,
            nameZh: config.name,
            nameEn: config.nameEn,
            cost: config.cost,
            guaranteeCount: config.guaranteeCount,
            rewardValue: config.rewardValue,
            overallRate: 1 / expectedAttempts
        })];
    })));
}

function getPublicDuelConfig() {
    return Object.freeze({
        maximumPower: DUEL_CONFIG.maximumPower,
        rewards: Object.freeze(Object.fromEntries(Object.entries(DUEL_CONFIG.rewards).map(([id, reward]) => {
            const minimumPower = duelMinimumPower(id);
            return [id, Object.freeze({
                nameZh: reward.name,
                nameEn: reward.nameEn,
                reward: reward.reward,
                minimumPower,
                costs: Object.freeze(Array.from(
                    { length: DUEL_CONFIG.maximumPower + 1 },
                    (_, power) => calculateDuelCost(id, power)
                ))
            })];
        })))
    });
}

function getPublicQuizConfig() {
    return QUIZ_CONFIG;
}

function getPublicSlotConfig() {
    return Object.freeze({
        minimumBet: SLOT_CONFIG.minimumBet,
        maximumBet: SLOT_CONFIG.maximumBet
    });
}

function getPublicScratchConfig() {
    return Object.freeze({
        tiers: Object.freeze(SCRATCH_CONFIG.tiers.map((tier) => Object.freeze({
            cost: tier.cost,
            winCount: tier.winCount,
            userCount: tier.userCount
        })))
    });
}

function getPublicStoneConfig() {
    return Object.freeze({
        initialCost: STONE_CONFIG.initialCost,
        slotCount: STONE_CONFIG.slotCount
    });
}

function getPublicSpinConfig() {
    return Object.freeze({
        challenges: Object.freeze(SPIN_CONFIG.challenges.map((challenge) => Object.freeze({
            id: challenge.id,
            labelZh: challenge.labelZh,
            labelEn: challenge.labelEn,
            detailZh: challenge.detailZh,
            detailEn: challenge.detailEn,
            countdownSeconds: challenge.countdownSeconds || null
        })))
    });
}

module.exports = {
    BLINDBOX_CONFIG,
    DUEL_CONFIG,
    ECONOMICS_REPORT,
    FLIP_CONFIG,
    GAME_DEFINITIONS,
    GAME_GROUPS,
    QUIZ_CONFIG,
    RTP_POLICY,
    SCRATCH_CONFIG,
    SLOT_CONFIG,
    SPIN_CONFIG,
    STONE_CONFIG,
    WISH_CONFIGS,
    calculateDuelCost,
    duelMinimumPower,
    getGameDefinition,
    getPublicDuelConfig,
    getPublicQuizConfig,
    getPublicScratchConfig,
    getPublicSlotConfig,
    getPublicSpinConfig,
    getPublicStoneConfig,
    getPublicWishConfigs,
    getWishConfig,
    validateGiftBackedConfiguration,
    validateDefinitions,
    validateStaticEconomics
};
