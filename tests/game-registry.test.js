'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const giftConfig = require('../gift-codes.json');
const gameRegistry = require('../domain/games');
const { RECORD_VIEWS } = gameRegistry.presentation;
const { PROVIDERS } = gameRegistry.records;
const {
    RTP_POLICY,
    maximumFlipPolicyEconomics,
    maximumStonePolicyEconomics,
    multiplierRtp,
    optimalFlipEconomics,
    optimalStoneEconomics,
    wishRtp
} = gameRegistry.economics;
const { ROUTE_MANIFEST } = require('../routes/manifest');
const {
    WEIGHT_SCALE,
    pickWeightedOutcome,
    stochasticRoundMoney
} = gameRegistry.random;

const EPSILON = 1e-12;

function assertClose(actual, expected, tolerance = EPSILON) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `expected ${actual} to be within ${tolerance} of ${expected}`
    );
}

function assertRtpInTarget(name, rtp) {
    assert.ok(Number.isFinite(rtp), `${name} RTP must be finite`);
    assert.ok(rtp >= RTP_POLICY.targetMinimum - EPSILON, `${name} RTP is below target`);
    assert.ok(rtp <= RTP_POLICY.maximum + EPSILON, `${name} RTP exceeds maximum`);
}

function assertDeepFrozen(value, path = 'value', seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
    for (const [key, nested] of Object.entries(value)) {
        assertDeepFrozen(nested, `${path}.${key}`, seen);
    }
}

function evaluateFlipPolicy(costs, rewards, continueMask, badReward = 50) {
    function solve(goodCount) {
        if (goodCount === 7) {
            return { expectedCost: 0, expectedPayout: rewards[7] };
        }
        if (goodCount > 0 && (continueMask & (1 << (goodCount - 1))) === 0) {
            return { expectedCost: 0, expectedPayout: rewards[goodCount] || 0 };
        }
        const remaining = 9 - goodCount;
        const goodProbability = (7 - goodCount) / remaining;
        const badProbability = 2 / remaining;
        const next = solve(goodCount + 1);
        return {
            expectedCost: costs[goodCount] + goodProbability * next.expectedCost,
            expectedPayout: goodProbability * next.expectedPayout + badProbability * badReward
        };
    }

    const result = solve(0);
    return {
        ...result,
        rtp: result.expectedPayout / result.expectedCost,
        continueMask
    };
}

function assertNoForbiddenKeys(value, forbiddenKeys, path = 'publicConfig') {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
        assert.equal(forbiddenKeys.has(key), false, `${path}.${key} must not be public`);
        assertNoForbiddenKeys(nested, forbiddenKeys, `${path}.${key}`);
    }
}

test('game registry definitions and configuration are immutable and internally valid', () => {
    assert.doesNotThrow(() => gameRegistry.validateDefinitions());
    assert.doesNotThrow(() => gameRegistry.validateStaticEconomics());

    const ids = gameRegistry.GAME_DEFINITIONS.map((definition) => definition.id);
    const hrefs = gameRegistry.GAME_DEFINITIONS.map((definition) => definition.href);
    const indexes = gameRegistry.GAME_DEFINITIONS.map((definition) => definition.index);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(hrefs).size, hrefs.length);
    assert.equal(new Set(indexes).size, indexes.length);

    for (const [name, config] of Object.entries({
        WISH_CONFIGS: gameRegistry.WISH_CONFIGS,
        BLINDBOX_CONFIG: gameRegistry.BLINDBOX_CONFIG,
        DOUDIZHU_CONFIG: gameRegistry.DOUDIZHU_CONFIG,
        SLOT_CONFIG: gameRegistry.SLOT_CONFIG,
        SCRATCH_CONFIG: gameRegistry.SCRATCH_CONFIG,
        STONE_CONFIG: gameRegistry.STONE_CONFIG,
        FLIP_CONFIG: gameRegistry.FLIP_CONFIG,
        DUEL_CONFIG: gameRegistry.DUEL_CONFIG,
        SPIN_CONFIG: gameRegistry.SPIN_CONFIG,
        QUIZ_CONFIG: gameRegistry.QUIZ_CONFIG,
        GAME_DEFINITIONS: gameRegistry.GAME_DEFINITIONS,
        GAME_GROUPS: gameRegistry.GAME_GROUPS
    })) {
        assertDeepFrozen(config, name);
    }

    const originalWishCost = gameRegistry.WISH_CONFIGS.bobo.cost;
    assert.throws(() => {
        gameRegistry.WISH_CONFIGS.bobo.cost = originalWishCost + 1;
    }, TypeError);
    assert.equal(gameRegistry.WISH_CONFIGS.bobo.cost, originalWishCost);
    assert.equal(gameRegistry.validateDoudizhuConfiguration(), true);
    assert.equal(
        gameRegistry.DOUDIZHU_CONFIG.cardsPerPlayer * gameRegistry.DOUDIZHU_CONFIG.playerCount
            + gameRegistry.DOUDIZHU_CONFIG.bottomCardCount,
        54
    );
});

test('every Wish tier has exact guaranteed-geometric RTP inside the target band', () => {
    const expected = {
        deepsea_singer: 0.9846172737699349,
        sky_throne: 0.9860409063558393,
        proposal: 0.9854056991936596,
        wonderland: 0.9855755422720103,
        white_bride: 0.9832883449892654,
        crystal_ball: 0.9814781269827044,
        bobo: 0.9833249289092834
    };

    for (const [id, config] of Object.entries(gameRegistry.WISH_CONFIGS)) {
        const rtp = wishRtp(config);
        assertRtpInTarget(`wish:${id}`, rtp);
        assertClose(rtp, expected[id], 1e-14);
        assertClose(gameRegistry.ECONOMICS_REPORT.wish[id], rtp);
    }
});

test('Wish rewards fail closed when provider-backed gift values drift', () => {
    assert.equal(gameRegistry.validateGiftBackedConfiguration(giftConfig), true);

    const mismatchedValue = structuredClone(giftConfig);
    mismatchedValue.礼物池配置['34383'][1] -= 1;
    assert.throws(
        () => gameRegistry.validateGiftBackedConfiguration(mismatchedValue),
        /does not match provider gift/
    );

    const missingGift = structuredClone(giftConfig);
    delete missingGift.礼物池配置['34382'];
    assert.throws(
        () => gameRegistry.validateGiftBackedConfiguration(missingGift),
        /provider gift 34382 is missing/
    );

    const nonIntegerValue = structuredClone(giftConfig);
    nonIntegerValue.礼物池配置['34999'][1] = '5200';
    assert.throws(
        () => gameRegistry.validateGiftBackedConfiguration(nonIntegerValue),
        /invalid integer value/
    );
});

test('Blindbox runtime uses one frozen tier cost and a million-unit weighted pool', () => {
    const runtime = gameRegistry.createBlindboxRuntime(giftConfig);
    const expectedRtp = {
        starmoon: 0.9804,
        heart: 0.9868421052631579,
        supreme: 0.9852197044334976
    };

    assert.deepEqual(runtime.counts, [1, 10, 50]);
    for (const [tierId, tier] of Object.entries(gameRegistry.BLINDBOX_CONFIG.tiers)) {
        const pool = runtime.pools.get(tierId);
        assert.ok(pool, `blindbox:${tierId} must have a runtime pool`);
        assert.equal(pool.reduce((sum, item) => sum + item.weightUnits, 0), 1_000_000);
        assert.equal(runtime.configs[tierId].cost, tier.cost);
        assertRtpInTarget(`blindbox:${tierId}`, runtime.rtp[tierId]);
        assertClose(runtime.rtp[tierId], expectedRtp[tierId]);
    }

    const projectedRewards = gameRegistry.projectBlindboxRewards([
        { giftId: '34999', name: '原地求婚', value: 5200, weightUnits: 200 }
    ]);
    assert.deepEqual(projectedRewards, [{ name: '原地求婚', value: 5200 }]);
    assertDeepFrozen(projectedRewards, 'blindboxResult');
    assert.equal(JSON.stringify(projectedRewards).includes('34999'), false);
    assert.throws(
        () => gameRegistry.projectBlindboxRewards([{ name: '', value: 1 }]),
        /reward is invalid/
    );
});

test('Slot and Scratch weighted multiplier tables are exactly 98.5 percent', () => {
    for (const [name, config] of [
        ['slot', gameRegistry.SLOT_CONFIG],
        ['scratch', gameRegistry.SCRATCH_CONFIG]
    ]) {
        assert.equal(
            config.outcomes.reduce((sum, outcome) => sum + outcome.weightUnits, 0),
            1_000_000
        );
        const rtp = multiplierRtp(config.outcomes);
        assertClose(rtp, RTP_POLICY.target);
        assertRtpInTarget(name, rtp);
        assertClose(gameRegistry.ECONOMICS_REPORT[name], rtp);
    }
    assert.deepEqual(
        gameRegistry.SCRATCH_CONFIG.tiers.map((tier) => tier.displayRewards),
        [
            [5, 10, 15, 20, 25, 30, 50],
            [10, 20, 30, 40, 50, 80, 100],
            [100, 200, 300, 500, 800, 1000, 1500]
        ]
    );
});

test('weighted draws and stochastic money rounding preserve exact boundary semantics', () => {
    const outcomes = gameRegistry.SLOT_CONFIG.outcomes;
    const cumulativeBoundaries = [];
    let cursor = 0;
    for (const outcome of outcomes) {
        const start = cursor;
        cursor += outcome.weightUnits;
        cumulativeBoundaries.push({ outcome, start, end: cursor - 1 });
    }
    assert.equal(cursor, WEIGHT_SCALE);

    for (const { outcome, start, end } of cumulativeBoundaries) {
        assert.equal(pickWeightedOutcome(outcomes, () => start), outcome);
        assert.equal(pickWeightedOutcome(outcomes, () => end), outcome);
    }
    assert.equal(pickWeightedOutcome(outcomes, () => 0), outcomes[0]);
    assert.equal(pickWeightedOutcome(outcomes, () => WEIGHT_SCALE - 1), outcomes.at(-1));

    assert.equal(stochasticRoundMoney(1.5, () => 499_999), 2);
    assert.equal(stochasticRoundMoney(1.5, () => 500_000), 1);
    let integerDraws = 0;
    assert.equal(stochasticRoundMoney(2, () => {
        integerDraws += 1;
        return 0;
    }), 2);
    assert.equal(integerDraws, 0, 'integer payouts must not consume another random draw');

    for (let bet = gameRegistry.SLOT_CONFIG.minimumBet;
        bet <= gameRegistry.SLOT_CONFIG.maximumBet;
        bet += 1) {
        const expectedPayout = outcomes.reduce((sum, outcome) => {
            const rawPayout = bet * outcome.multiplier;
            const floor = Math.floor(rawPayout);
            const fractionUnits = Math.round((rawPayout - floor) * WEIGHT_SCALE);
            const expectedRoundedPayout = floor + fractionUnits / WEIGHT_SCALE;
            return sum + (outcome.weightUnits / WEIGHT_SCALE) * expectedRoundedPayout;
        }, 0);
        assertClose(expectedPayout / bet, RTP_POLICY.target, 1e-13);
    }
});

test('Flip profit-optimal policy and all 64 stopping policies satisfy their contracts', () => {
    const { costs, cashoutRewards } = gameRegistry.FLIP_CONFIG;
    const profitOptimal = optimalFlipEconomics(costs, cashoutRewards);
    const allPolicies = Array.from(
        { length: 1 << 6 },
        (_, continueMask) => evaluateFlipPolicy(costs, cashoutRewards, continueMask)
    );
    const independentMaximum = allPolicies.reduce((maximum, policy) => (
        policy.rtp > maximum.rtp ? policy : maximum
    ));
    const implementationMaximum = maximumFlipPolicyEconomics(costs, cashoutRewards);

    assert.equal(allPolicies.length, 64);
    assertRtpInTarget('flip:profit-optimal', profitOptimal.rtp);
    assertClose(profitOptimal.rtp, 0.9884185303514376);
    assert.equal(independentMaximum.continueMask, 63);
    assertClose(independentMaximum.rtp, 0.9896515179851596);
    assert.ok(allPolicies.every((policy) => policy.rtp <= RTP_POLICY.maximum + EPSILON));
    assertClose(implementationMaximum.rtp, independentMaximum.rtp);
    assert.equal(implementationMaximum.continueMask, independentMaximum.continueMask);
});

test('Stone profit policy, ratio-optimal policy, and 353/354 replacement boundary are enforced', () => {
    const base = {
        initialCost: gameRegistry.STONE_CONFIG.initialCost,
        rewards: gameRegistry.STONE_CONFIG.rewards,
        replaceCosts: gameRegistry.STONE_CONFIG.replaceCosts,
        slotCount: gameRegistry.STONE_CONFIG.slotCount,
        colorCount: gameRegistry.STONE_CONFIG.colors.length
    };
    const profitOptimal = optimalStoneEconomics(base);
    const maximumPolicy = maximumStonePolicyEconomics(base);

    assertRtpInTarget('stone:profit-optimal', profitOptimal.rtp);
    assertClose(profitOptimal.rtp, 0.9862996473509318, 1e-11);
    assert.ok(maximumPolicy.rtp <= RTP_POLICY.maximum + EPSILON);
    assertClose(maximumPolicy.rtp, 0.9898184332472796, 1e-11);
    assertClose(maximumPolicy.expectedPayout, 30_000, 1e-8);
    assertClose(maximumPolicy.expectedCost, 30_308.58892128265, 1e-8);

    const unsafe = maximumStonePolicyEconomics({
        ...base,
        replaceCosts: { ...base.replaceCosts, 4: 353 }
    });
    const safe = maximumStonePolicyEconomics({
        ...base,
        replaceCosts: { ...base.replaceCosts, 4: 354 }
    });
    assert.ok(unsafe.rtp > RTP_POLICY.maximum, 'replace cost 353 must remain a failing boundary');
    assertClose(unsafe.rtp, 0.9900465886769538, 1e-11);
    assert.ok(safe.rtp <= RTP_POLICY.maximum + EPSILON);
    assertClose(safe.rtp, maximumPolicy.rtp, 1e-11);
});

test('Duel quotes every and only policy-compliant tier/power combination', () => {
    const expectedMinimumPower = {
        crown: 1,
        dragon: 1,
        phoenix: 1,
        jade: 5,
        bronze: 10,
        iron: 25
    };

    for (const [tierId, tier] of Object.entries(gameRegistry.DUEL_CONFIG.rewards)) {
        const minimumPower = gameRegistry.duelMinimumPower(tierId);
        assert.equal(minimumPower, expectedMinimumPower[tierId]);

        for (let power = 1; power <= gameRegistry.DUEL_CONFIG.maximumPower; power += 1) {
            const cost = gameRegistry.calculateDuelCost(tierId, power);
            if (power < minimumPower) {
                assert.equal(cost, null, `${tierId}:${power} must be unavailable`);
                continue;
            }
            assert.ok(Number.isSafeInteger(cost) && cost > 0, `${tierId}:${power} needs a cost`);
            const rtp = (tier.reward * power / 100) / cost;
            assertRtpInTarget(`duel:${tierId}:${power}`, rtp);
        }
    }

    assert.equal(gameRegistry.calculateDuelCost('unknown', 50), null);
    assert.equal(gameRegistry.calculateDuelCost('crown', 0), null);
    assert.equal(gameRegistry.calculateDuelCost('crown', 81), null);
    assert.equal(gameRegistry.calculateDuelCost('crown', 1.5), null);
});

test('route manifest covers every registered game action path with the required policies', () => {
    const manifestByKey = new Map();
    for (const entry of ROUTE_MANIFEST) {
        manifestByKey.set(`${entry.method} ${entry.path}`, entry);
    }

    const basicPolicies = ['login', 'authorized', 'basic-rate-limit', 'csrf', 'idempotent'];
    const userActionPolicies = [
        'login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent'
    ];
    const capacityUserActionPolicies = [
        'capacity', 'login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent'
    ];
    const basicOnlyPaths = new Set(['/api/quiz/next', '/api/quiz/submit']);
    const actionWithoutCapacityPaths = new Set(['/api/spin']);
    const actionPaths = [];
    for (const definition of gameRegistry.GAME_DEFINITIONS) {
        assert.deepEqual(
            definition.actionPaths,
            definition.actions.map((action) => action.path),
            `${definition.id} compatibility actionPaths must be derived from actions`
        );
        for (const action of definition.actions) {
            actionPaths.push(action.path);
            const entry = manifestByKey.get(`${action.method} ${action.path}`);
            assert.ok(entry, `${action.method} ${action.path} needs a manifest entry`);
            assert.deepEqual(entry.policies, action.policies);

            const expectedPolicies = basicOnlyPaths.has(action.path)
                ? basicPolicies
                : (actionWithoutCapacityPaths.has(action.path)
                    ? userActionPolicies
                    : capacityUserActionPolicies);
            assert.deepEqual(action.policies, expectedPolicies, `${action.path} policy parity drifted`);
        }
    }
    assert.equal(new Set(actionPaths).size, actionPaths.length, 'game action paths must be unique');
});

test('public game projections omit server-only probability and settlement fields', () => {
    const publicWish = gameRegistry.getPublicWishConfigs();
    const publicDuel = gameRegistry.getPublicDuelConfig();
    const publicBlindbox = gameRegistry.createBlindboxRuntime(giftConfig).configs;
    const publicQuiz = gameRegistry.getPublicQuizConfig();
    const publicSlot = gameRegistry.getPublicSlotConfig();
    const publicScratch = gameRegistry.getPublicScratchConfig();
    const publicStone = gameRegistry.getPublicStoneConfig();
    const publicSpin = gameRegistry.getPublicSpinConfig();
    const publicDoudizhu = gameRegistry.getPublicDoudizhuConfig();
    const forbidden = new Set([
        'bilibiliGiftId',
        'giftId',
        'successRate',
        'targetRtp',
        'weightUnits',
        'expectedPayout',
        'expectedCost'
    ]);

    assertNoForbiddenKeys(publicWish, forbidden, 'wish');
    assertNoForbiddenKeys(publicDuel, forbidden, 'duel');
    assertNoForbiddenKeys(publicBlindbox, forbidden, 'blindbox');
    assertNoForbiddenKeys(publicQuiz, forbidden, 'quiz');
    assertNoForbiddenKeys(publicSlot, forbidden, 'slot');
    assertNoForbiddenKeys(publicScratch, forbidden, 'scratch');
    assertNoForbiddenKeys(publicStone, forbidden, 'stone');
    assertNoForbiddenKeys(publicSpin, forbidden, 'spin');
    assertNoForbiddenKeys(publicDoudizhu, forbidden, 'doudizhu');

    for (const [name, projection] of Object.entries({
        publicWish,
        publicDuel,
        publicBlindbox,
        publicQuiz,
        publicSlot,
        publicScratch,
        publicStone,
        publicSpin,
        publicDoudizhu
    })) {
        assertDeepFrozen(projection, name);
    }

    for (const [id, config] of Object.entries(publicWish)) {
        assert.deepEqual(Object.keys(config).sort(), [
            'cost',
            'giftType',
            'guaranteeCount',
            'nameEn',
            'nameZh',
            'overallRate',
            'rewardValue'
        ]);
        assert.equal(config.giftType, id);
    }
    for (const reward of Object.values(publicDuel.rewards)) {
        assert.equal(reward.costs.length, gameRegistry.DUEL_CONFIG.maximumPower + 1);
        assert.equal(reward.costs[0], null);
    }
    for (const config of Object.values(publicBlindbox)) {
        for (const item of config.items) {
            assert.deepEqual(Object.keys(item).sort(), ['name', 'weight']);
        }
    }
    assert.equal(publicSpin.challenges.length, gameRegistry.SPIN_CONFIG.challenges.length);
    assert.deepEqual(
        publicSpin.challenges.map((challenge) => challenge.id),
        gameRegistry.SPIN_CONFIG.challenges.map((challenge) => challenge.id)
    );
    for (const challenge of publicSpin.challenges) {
        assert.deepEqual(Object.keys(challenge).sort(), [
            'countdownSeconds',
            'detailEn',
            'detailZh',
            'id',
            'labelEn',
            'labelZh'
        ]);
    }
    assert.deepEqual(Object.keys(publicQuiz).sort(), [
        'dailyRewardCap',
        'questionCount',
        'rewardPerCorrect',
        'roundCost'
    ]);
    assert.deepEqual(Object.keys(publicSlot).sort(), ['maximumBet', 'minimumBet']);
    assert.deepEqual(Object.keys(publicScratch), ['tiers']);
    for (const tier of publicScratch.tiers) {
        assert.deepEqual(Object.keys(tier).sort(), ['cost', 'userCount', 'winCount']);
    }
    assert.deepEqual(Object.keys(publicStone).sort(), ['initialCost', 'slotCount']);
    assert.deepEqual(Object.keys(publicDoudizhu).sort(), [
        'bottomCardCount',
        'cardsPerPlayer',
        'maximumBid',
        'maximumSelectedCards',
        'playerCount',
        'rulesVersion'
    ]);
    assert.equal(publicDoudizhu.rulesVersion, 'classic-jj-v1');
    assert.equal(Object.hasOwn(publicDoudizhu, 'aiNodeBudget'), false);
    assert.equal(Object.hasOwn(publicDoudizhu, 'aiDeadlineMs'), false);
});

test('every record-enabled game has presentation and query providers with no orphans', () => {
    const expectedRecordViews = gameRegistry.GAME_DEFINITIONS
        .filter((definition) => definition.recordView !== null)
        .map((definition) => definition.recordView)
        .sort();

    assert.deepEqual(Object.keys(RECORD_VIEWS).sort(), expectedRecordViews);
    assert.deepEqual(Object.keys(PROVIDERS).sort(), expectedRecordViews);

    for (const definition of gameRegistry.GAME_DEFINITIONS) {
        if (definition.recordView === null) continue;
        const view = RECORD_VIEWS[definition.recordView];
        const provider = PROVIDERS[definition.recordView];
        assert.ok(view, `${definition.id} lacks record presentation`);
        assert.ok(provider, `${definition.id} lacks record provider`);
        assert.equal(view.headersZh.length, view.headersEn.length);
        assert.ok(view.headersZh.length > 0);
        assert.deepEqual(
            view.headersZh,
            provider.profile.columns.map((column) => column.labelZh)
        );
        assert.deepEqual(
            view.headersEn,
            provider.profile.columns.map((column) => column.labelEn)
        );
        assert.equal(typeof provider.profile.mapRow, 'function');
        assert.match(provider.listSql, /WHERE username = \$1/);
        assert.match(provider.countSql, /WHERE username = \$1/);
        assert.match(provider.summarySql, /WHERE username = \$1/);
        assert.equal(typeof provider.mapSummary, 'function');
    }
});
