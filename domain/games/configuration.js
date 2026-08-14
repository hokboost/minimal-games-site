'use strict';

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const nested of Object.values(value)) deepFreeze(nested);
    return Object.freeze(value);
}

const QUIZ_CONFIG = deepFreeze({
    questionCount: 15,
    roundCost: 10,
    rewardPerCorrect: 2,
    dailyRewardCap: 5
});

const WISH_CONFIGS = deepFreeze({
    deepsea_singer: {
        giftType: 'deepsea_singer',
        name: '梦幻游乐园',
        nameEn: 'Dreamland Park',
        bilibiliGiftId: '34383',
        cost: 487,
        successRate: 0.014,
        guaranteeCount: 148,
        rewardValue: 30000
    },
    sky_throne: {
        giftType: 'sky_throne',
        name: '飞天转椅',
        nameEn: 'Sky Throne',
        bilibiliGiftId: '34382',
        cost: 251,
        successRate: 0.0202,
        guaranteeCount: 83,
        rewardValue: 10000
    },
    proposal: {
        giftType: 'proposal',
        name: '原地求婚',
        nameEn: 'On-the-Spot Proposal',
        bilibiliGiftId: '34999',
        cost: 209,
        successRate: 0.0325,
        guaranteeCount: 52,
        rewardValue: 5200
    },
    wonderland: {
        giftType: 'wonderland',
        name: '梦游仙境',
        nameEn: 'Wonderland Dream',
        bilibiliGiftId: '31932',
        cost: 151,
        successRate: 0.0405,
        guaranteeCount: 41,
        rewardValue: 3000
    },
    white_bride: {
        giftType: 'white_bride',
        name: '纯白花嫁',
        nameEn: 'Pure White Bride',
        bilibiliGiftId: '34428',
        cost: 77,
        successRate: 0.046,
        guaranteeCount: 34,
        rewardValue: 1314
    },
    crystal_ball: {
        giftType: 'crystal_ball',
        name: '水晶球',
        nameEn: 'Crystal Ball',
        bilibiliGiftId: '31122',
        cost: 67,
        successRate: 0.055,
        guaranteeCount: 32,
        rewardValue: 1000
    },
    bobo: {
        giftType: 'bobo',
        name: '啵啵',
        nameEn: 'Bubbles',
        bilibiliGiftId: '33668',
        cost: 51,
        successRate: 0.104,
        guaranteeCount: 16,
        rewardValue: 399
    }
});

const SLOT_CONFIG = deepFreeze({
    minimumBet: 1,
    maximumBet: 1000,
    outcomes: [
        { id: 'break_even', type: '不亏不赚', multiplier: 1, weightUnits: 200_000 },
        { id: 'double', type: '×2', multiplier: 2, weightUnits: 192_500 },
        { id: 'zero', type: '归零', multiplier: 0, weightUnits: 207_500 },
        { id: 'one_and_half', type: '×1.5', multiplier: 1.5, weightUnits: 200_000 },
        { id: 'half', type: '×0.5', multiplier: 0.5, weightUnits: 200_000 }
    ]
});

const SCRATCH_CONFIG = deepFreeze({
    tiers: [
        { cost: 5, winCount: 5, userCount: 5, displayRewards: [5, 10, 15, 20, 25, 30, 50] },
        { cost: 10, winCount: 5, userCount: 10, displayRewards: [10, 20, 30, 40, 50, 80, 100] },
        { cost: 100, winCount: 5, userCount: 20, displayRewards: [100, 200, 300, 500, 800, 1000, 1500] }
    ],
    outcomes: [
        { id: 'win', label: '中奖', multiplier: 1, weightUnits: 500_000 },
        { id: 'major', label: '大奖', multiplier: 2, weightUnits: 222_500 },
        { id: 'super', label: '超级大奖', multiplier: 4, weightUnits: 10_000 },
        { id: 'none', label: '未中奖', multiplier: 0, weightUnits: 267_500 }
    ]
});

const BLINDBOX_CONFIG = deepFreeze({
    counts: [1, 10, 50],
    tiers: {
        starmoon: {
            key: 'starmoon',
            nameZh: '星月盲盒',
            nameEn: 'Star Moon Box',
            cost: 51,
            items: [
                { giftId: '34999', name: '原地求婚', weightUnits: 200 },
                { giftId: '31122', name: '水晶球', weightUnits: 500 },
                { giftId: '33668', name: '啵啵', weightUnits: 3_000 },
                { giftId: '31053', name: '告白花束', weightUnits: 5_000 },
                { giftId: '34315', name: '喜欢你', weightUnits: 66_400 },
                { giftId: '31044', name: '情书', weightUnits: 724_900 },
                { giftId: '34500', name: '你真好看', weightUnits: 200_000 }
            ]
        },
        heart: {
            key: 'heart',
            nameZh: '心动盲盒',
            nameEn: 'Heart Box',
            cost: 152,
            items: [
                { giftId: '31028', name: '探索者启航', weightUnits: 400 },
                { giftId: '31122', name: '水晶球', weightUnits: 20_000 },
                { giftId: '33668', name: '啵啵', weightUnits: 50_000 },
                { giftId: '31053', name: '告白花束', weightUnits: 184_876 },
                { giftId: '34315', name: '喜欢你', weightUnits: 544_724 },
                { giftId: '31044', name: '情书', weightUnits: 200_000 }
            ]
        },
        supreme: {
            key: 'supreme',
            nameZh: '至尊盲盒',
            nameEn: 'Supreme Box',
            cost: 1015,
            items: [
                { giftId: '34998', name: '小电视飞船', weightUnits: 3_000 },
                { giftId: '34381', name: '飞屋环游', weightUnits: 85_000 },
                { giftId: '31122', name: '水晶球', weightUnits: 300_000 },
                { giftId: '33668', name: '啵啵', weightUnits: 316_200 },
                { giftId: '31053', name: '告白花束', weightUnits: 295_800 }
            ]
        }
    }
});

const STONE_CONFIG = deepFreeze({
    colors: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'],
    slotCount: 6,
    initialCost: 35,
    replaceCosts: { 1: 28, 2: 28, 3: 78, 4: 354, 5: 3860 },
    rewards: { 1: 50, 2: 120, 3: 250, 4: 800, 5: 3000, 6: 30000 }
});

const FLIP_CONFIG = deepFreeze({
    costs: [52, 112, 185, 316, 620, 1025, 2033],
    cashoutRewards: { 1: 50, 2: 200, 3: 500, 4: 1200, 5: 3000, 6: 8000, 7: 30000 }
});

const DUEL_CONFIG = deepFreeze({
    targetRtp: 0.985,
    maximumPower: 80,
    rewards: {
        crown: { name: '至尊奖', nameEn: 'Crown Prize', reward: 30000 },
        dragon: { name: '龙魂奖', nameEn: 'Dragon Prize', reward: 13140 },
        phoenix: { name: '凤羽奖', nameEn: 'Phoenix Prize', reward: 5000 },
        jade: { name: '玉阶奖', nameEn: 'Jade Prize', reward: 1000 },
        bronze: { name: '青铜奖', nameEn: 'Bronze Prize', reward: 500 },
        iron: { name: '铁心奖', nameEn: 'Iron Prize', reward: 200 }
    }
});

const SPIN_CONFIG = deepFreeze({
    challenges: [
        {
            id: 'food-budget',
            labelZh: '2 加币买吃的',
            labelEn: 'CAD 2 for food',
            detailZh: '线下挑战；网站不会自动增减积分。',
            detailEn: 'Offline challenge; the site does not change points.',
            weight: 1
        },
        {
            id: 'quiz',
            labelZh: '知识问答',
            labelEn: 'Quiz',
            detailZh: '前往知识问答完成一局，仅由该游戏自己的规则结算。',
            detailEn: 'Play one Quiz round; only that game applies its own settlement.',
            weight: 1
        },
        {
            id: 'scratch',
            labelZh: '刮刮乐',
            labelEn: 'Scratch',
            detailZh: '前往刮刮乐完成一局，仅由该游戏自己的规则结算。',
            detailEn: 'Play one Scratch round; only that game applies its own settlement.',
            weight: 1
        },
        {
            id: 'slot',
            labelZh: '老虎机',
            labelEn: 'Slot',
            detailZh: '前往老虎机完成一局，仅由该游戏自己的规则结算。',
            detailEn: 'Play one Slot round; only that game applies its own settlement.',
            weight: 1
        },
        {
            id: 'squats-10',
            labelZh: '10 个深蹲',
            labelEn: '10 squats',
            detailZh: '线下体能挑战；网站不会自动增减积分。',
            detailEn: 'Offline fitness challenge; the site does not change points.',
            weight: 1
        },
        {
            id: 'dance-1-minute',
            labelZh: '热舞 1 分钟',
            labelEn: 'Dance for 1 minute',
            detailZh: '线下体能挑战；网站不会自动增减积分。',
            detailEn: 'Offline fitness challenge; the site does not change points.',
            weight: 1
        },
        {
            id: 'pushups-10',
            labelZh: '10 个俯卧撑',
            labelEn: '10 push-ups',
            detailZh: '线下体能挑战；网站不会自动增减积分。',
            detailEn: 'Offline fitness challenge; the site does not change points.',
            weight: 1
        },
        {
            id: 'spin-twice',
            labelZh: '再转两次',
            labelEn: 'Spin two more times',
            detailZh: '可免费再转两次，不修改账户积分或次数。',
            detailEn: 'Take two free spins; account points and allowances are unchanged.',
            weight: 1
        },
        {
            id: 'walk-backwards-3-minutes',
            labelZh: '反方向走 3 分钟',
            labelEn: 'Walk backwards for 3 minutes',
            detailZh: '线下挑战；请在安全场地完成，网站不会自动增减积分。',
            detailEn: 'Offline challenge; use a safe area. The site does not change points.',
            weight: 1
        },
        {
            id: 'carry-weight',
            labelZh: '负重前行',
            labelEn: 'Carry a weight',
            detailZh: '线下体能挑战；网站不会自动增减积分。',
            detailEn: 'Offline fitness challenge; the site does not change points.',
            weight: 1
        },
        {
            id: 'forbidden-pronouns-3-minutes',
            labelZh: '3 分钟不能说你我他',
            labelEn: 'Avoid “you/I/he” for 3 minutes',
            detailZh: '线下口头挑战；网站不会自动增减积分。',
            detailEn: 'Offline verbal challenge; the site does not change points.',
            weight: 1
        },
        {
            id: 'cola-20-seconds',
            labelZh: '20 秒喝完一瓶可乐',
            labelEn: 'Finish a cola in 20 seconds',
            detailZh: '线下挑战；量力而行，网站不会自动增减积分。',
            detailEn: 'Offline challenge; know your limits. The site does not change points.',
            weight: 1
        },
        {
            id: 'browser-history',
            labelZh: '浏览器记录',
            labelEn: 'Browser history',
            detailZh: '线下趣味挑战；不要展示隐私信息，网站不会自动增减积分。',
            detailEn: 'Offline challenge; do not reveal private data. The site does not change points.',
            weight: 1
        },
        {
            id: 'trash-cleaner',
            labelZh: '垃圾清洁工',
            labelEn: 'Trash cleaner',
            detailZh: '在接下来 5 分钟内安全地捡起沿途垃圾；网站不会自动增减积分。',
            detailEn: 'Safely pick up litter you see for 5 minutes; the site does not change points.',
            countdownSeconds: 300,
            weight: 1
        }
    ]
});

module.exports = {
    BLINDBOX_CONFIG,
    DUEL_CONFIG,
    FLIP_CONFIG,
    QUIZ_CONFIG,
    SCRATCH_CONFIG,
    SLOT_CONFIG,
    SPIN_CONFIG,
    STONE_CONFIG,
    WISH_CONFIGS,
    deepFreeze
};
