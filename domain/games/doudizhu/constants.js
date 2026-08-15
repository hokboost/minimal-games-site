'use strict';

function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const nested of Object.values(value)) deepFreeze(nested, seen);
    return Object.freeze(value);
}

const RANKS = [
    { key: '3', labelZh: '3', labelEn: '3' },
    { key: '4', labelZh: '4', labelEn: '4' },
    { key: '5', labelZh: '5', labelEn: '5' },
    { key: '6', labelZh: '6', labelEn: '6' },
    { key: '7', labelZh: '7', labelEn: '7' },
    { key: '8', labelZh: '8', labelEn: '8' },
    { key: '9', labelZh: '9', labelEn: '9' },
    { key: '10', labelZh: '10', labelEn: '10' },
    { key: 'J', labelZh: 'J', labelEn: 'J' },
    { key: 'Q', labelZh: 'Q', labelEn: 'Q' },
    { key: 'K', labelZh: 'K', labelEn: 'K' },
    { key: 'A', labelZh: 'A', labelEn: 'A' },
    { key: '2', labelZh: '2', labelEn: '2' },
    { key: 'LJ', labelZh: '小王', labelEn: 'Small Joker' },
    { key: 'BJ', labelZh: '大王', labelEn: 'Big Joker' }
];

const COMBINATION_TYPES = {
    SINGLE: 'single',
    PAIR: 'pair',
    TRIPLE: 'triple',
    TRIPLE_SINGLE: 'triple-single',
    TRIPLE_PAIR: 'triple-pair',
    STRAIGHT: 'straight',
    PAIR_STRAIGHT: 'pair-straight',
    TRIPLE_STRAIGHT: 'triple-straight',
    PLANE_SINGLE: 'plane-single',
    PLANE_PAIR: 'plane-pair',
    FOUR_TWO_SINGLE: 'four-two-single',
    FOUR_TWO_PAIR: 'four-two-pair',
    BOMB: 'bomb',
    ROCKET: 'rocket'
};

const RULE_PROFILE = deepFreeze({
    id: 'classic-jj-v1',
    version: 'classic-jj-v1',
    playerCount: 3,
    cardsPerPlayer: 17,
    bottomCardCount: 3,
    maximumBid: 3,
    maximumSelectedCards: 20,
    playDirection: 'counter-clockwise',
    ranks: RANKS,
    sequenceMaximumRank: 'A',
    minimumStraightLength: 5,
    minimumPairStraightLength: 3,
    minimumTripleStraightLength: 2,
    attachments: {
        pairMaySplitIntoSingleWings: true,
        maximumSingleWingRankMultiplicity: 2,
        pairWingsMustHaveDistinctRanks: true,
        bodyRanksMayNotBeWings: true,
        triplesAndBombsMayNotSplitIntoSingleWings: true
    },
    scoring: {
        eachBombDoubles: true,
        rocketCountsAsBomb: true,
        springDoubles: true,
        antiSpringDoubles: true
    },
    ai: {
        defaultMaxNodes: 2500,
        hardMaxNodes: 50000,
        defaultDeadlineMs: 60,
        hardDeadlineMs: 1000,
        defaultMaxBotActions: 96,
        hardMaxBotActions: 256,
        exactEndgameCardLimit: 12
    }
});

module.exports = {
    COMBINATION_TYPES: deepFreeze(COMBINATION_TYPES),
    MAX_SEQUENCE_RANK: 11,
    RANKS: RULE_PROFILE.ranks,
    RULE_PROFILE,
    deepFreeze
};
