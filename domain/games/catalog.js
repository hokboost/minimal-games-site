'use strict';

const {
    BLINDBOX_CONFIG,
    FLIP_CONFIG,
    QUIZ_CONFIG,
    SCRATCH_CONFIG,
    SLOT_CONFIG,
    SPIN_CONFIG,
    STONE_CONFIG,
    WISH_CONFIGS,
    deepFreeze
} = require('./configuration');

const minimumWishCost = Math.min(...Object.values(WISH_CONFIGS).map((config) => config.cost));
const minimumBlindboxCost = Math.min(...Object.values(BLINDBOX_CONFIG.tiers).map((config) => config.cost));
const minimumScratchCost = Math.min(...SCRATCH_CONFIG.tiers.map((config) => config.cost));

const GAME_GROUPS = deepFreeze([
    {
        key: 'points',
        titleZh: '积分玩法',
        titleEn: 'Points games',
        descZh: '每局都有明确的积分支出与结算',
        descEn: 'Every round has a clear points cost and settlement'
    },
    {
        key: 'gift',
        titleZh: '礼物背包玩法',
        titleEn: 'Backpack reward games',
        descZh: '奖励是待发送礼物，与积分结算分开',
        descEn: 'Rewards are stored gifts, separate from points settlement'
    },
    {
        key: 'free',
        titleZh: '免费与次数玩法',
        titleEn: 'Free and allowance games',
        descZh: '不使用积分余额',
        descEn: 'Does not use the points balance'
    }
]);

const BASIC_ACTION_POLICIES = deepFreeze([
    'login',
    'authorized',
    'basic-rate-limit',
    'csrf',
    'idempotent'
]);

const USER_ACTION_POLICIES = deepFreeze([
    'login',
    'authorized',
    'basic-rate-limit',
    'action-rate-limit',
    'csrf',
    'idempotent'
]);

const CAPACITY_USER_ACTION_POLICIES = deepFreeze([
    'capacity',
    'login',
    'authorized',
    'basic-rate-limit',
    'action-rate-limit',
    'csrf',
    'idempotent'
]);

const action = (path, policies) => ({ method: 'POST', path, policies });

const defineGame = (definition) => ({
    ...definition,
    actionPaths: definition.actions.map((entry) => entry.path)
});

const GAME_DEFINITIONS = deepFreeze([
    defineGame({
        id: 'quiz',
        index: '01',
        group: 'points',
        href: '/quiz',
        actions: [
            action('/api/quiz/start', CAPACITY_USER_ACTION_POLICIES),
            action('/api/quiz/next', BASIC_ACTION_POLICIES),
            action('/api/quiz/submit', BASIC_ACTION_POLICIES)
        ],
        assetKind: 'points',
        category: 'brain',
        economicsKind: 'daily-capped-skill',
        recordView: 'quiz',
        titleZh: '知识问答',
        titleEn: 'Quiz Sprint',
        descZh: '15 道随机题，在 30 秒里完成一次知识冲刺。',
        descEn: 'A 15-question knowledge sprint against a 30-second clock.',
        costZh: `${QUIZ_CONFIG.roundCost} 积分`,
        costEn: `${QUIZ_CONFIG.roundCost} points`,
        metaZh: '每日奖励封顶',
        metaEn: 'Daily reward cap'
    }),
    defineGame({
        id: 'dictation',
        index: '02',
        group: 'free',
        href: '/dictation',
        actions: [
            action('/api/dictation/start', CAPACITY_USER_ACTION_POLICIES),
            action('/api/dictation/retry', CAPACITY_USER_ACTION_POLICIES),
            action('/api/dictation/submit', CAPACITY_USER_ACTION_POLICIES)
        ],
        assetKind: 'allowance',
        category: 'brain',
        economicsKind: 'allowance',
        recordView: null,
        titleZh: '汉字听写',
        titleEn: 'Chinese Dictation',
        descZh: '听读音、辨同音字，连续完成三关练习。',
        descEn: 'Listen, identify homophones, and clear three focused stages.',
        costZh: '需听写机会',
        costEn: 'Attempt required',
        metaZh: '管理员发放',
        metaEn: 'Admin granted'
    }),
    defineGame({
        id: 'slot',
        index: '03',
        group: 'points',
        href: '/slot',
        actions: [action('/api/slot/play', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'points',
        category: 'chance',
        economicsKind: 'weighted-multiplier',
        recordView: 'slot',
        titleZh: '幸运老虎机',
        titleEn: 'Lucky Reels',
        descZh: '设定自己的下注金额，等待三格数字停下。',
        descEn: 'Set your stake and watch all three number reels settle.',
        costZh: `${SLOT_CONFIG.minimumBet} - ${SLOT_CONFIG.maximumBet} 积分`,
        costEn: `${SLOT_CONFIG.minimumBet} - ${SLOT_CONFIG.maximumBet} points`,
        metaZh: '自由下注',
        metaEn: 'Flexible stake'
    }),
    defineGame({
        id: 'scratch',
        index: '04',
        group: 'points',
        href: '/scratch',
        actions: [action('/api/scratch/play', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'points',
        category: 'chance',
        economicsKind: 'weighted-multiplier',
        recordView: 'scratch',
        titleZh: '刮刮乐',
        titleEn: 'Scratch Card',
        descZh: '选择奖券档位，亲手刮开藏在涂层下的号码。',
        descEn: 'Choose a ticket tier and reveal the numbers by hand.',
        costZh: `${minimumScratchCost} 积分起`,
        costEn: `From ${minimumScratchCost} points`,
        metaZh: '三档奖券',
        metaEn: '3 ticket tiers'
    }),
    defineGame({
        id: 'wish',
        index: '05',
        group: 'gift',
        href: '/wish',
        actions: [
            action('/api/wish/play', CAPACITY_USER_ACTION_POLICIES),
            action('/api/wish-batch', CAPACITY_USER_ACTION_POLICIES),
            action('/api/wish/backpack/send', CAPACITY_USER_ACTION_POLICIES)
        ],
        assetKind: 'gift-value',
        category: 'chance',
        economicsKind: 'guaranteed-geometric',
        recordView: 'wish',
        titleZh: '幸运祈愿',
        titleEn: 'Lucky Wish',
        descZh: '七种礼物奖池，支持单抽、十连与独立保底。',
        descEn: 'Seven gift pools with single pulls, ten-pulls, and pity.',
        costZh: `${minimumWishCost} 积分起`,
        costEn: `From ${minimumWishCost} points`,
        metaZh: '奖励进入背包',
        metaEn: 'Rewards enter backpack'
    }),
    defineGame({
        id: 'blindbox',
        index: '06',
        group: 'gift',
        href: '/blindbox',
        actions: [action('/api/blindbox/open', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'gift-value',
        category: 'chance',
        economicsKind: 'weighted-value',
        recordView: 'blindbox',
        titleZh: '惊喜盲盒',
        titleEn: 'Surprise Boxes',
        descZh: '选好档位和数量，一次开启最多 50 盒。',
        descEn: 'Pick a tier and open up to 50 surprise boxes at once.',
        costZh: `${minimumBlindboxCost} 积分起`,
        costEn: `From ${minimumBlindboxCost} points`,
        metaZh: '奖励进入背包',
        metaEn: 'Rewards enter backpack'
    }),
    defineGame({
        id: 'stone',
        index: '07',
        group: 'points',
        href: '/stone',
        actions: [
            action('/api/stone/add', CAPACITY_USER_ACTION_POLICIES),
            action('/api/stone/fill', CAPACITY_USER_ACTION_POLICIES),
            action('/api/stone/replace', CAPACITY_USER_ACTION_POLICIES),
            action('/api/stone/redeem', CAPACITY_USER_ACTION_POLICIES)
        ],
        assetKind: 'points',
        category: 'strategy',
        economicsKind: 'optimal-stopping',
        recordView: 'stone',
        titleZh: '合石头',
        titleEn: 'Stone Match',
        descZh: '填满六个槽位，用同色组合换取更高奖励。',
        descEn: 'Fill six slots and build color matches for bigger rewards.',
        costZh: `${STONE_CONFIG.initialCost} 积分 / 颗`,
        costEn: `${STONE_CONFIG.initialCost} points / stone`,
        metaZh: '六槽配色',
        metaEn: '6-slot board'
    }),
    defineGame({
        id: 'flip',
        index: '08',
        group: 'points',
        href: '/flip',
        actions: [
            action('/api/flip/start', CAPACITY_USER_ACTION_POLICIES),
            action('/api/flip/flip', CAPACITY_USER_ACTION_POLICIES),
            action('/api/flip/cashout', CAPACITY_USER_ACTION_POLICIES)
        ],
        assetKind: 'points',
        category: 'strategy',
        economicsKind: 'optimal-stopping',
        recordView: 'flip',
        titleZh: '翻卡牌',
        titleEn: 'Card Flip',
        descZh: '避开坏牌，继续加注，或在合适的时候收手。',
        descEn: 'Avoid bad cards, keep going, or cash out at the right time.',
        costZh: `${FLIP_CONFIG.costs[0]} 积分起`,
        costEn: `From ${FLIP_CONFIG.costs[0]} points`,
        metaZh: '随时收手',
        metaEn: 'Cash out anytime'
    }),
    defineGame({
        id: 'duel',
        index: '09',
        group: 'points',
        href: '/duel',
        actions: [action('/api/duel/play', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'points',
        category: 'challenge',
        economicsKind: 'dynamic-probability',
        recordView: 'duel',
        titleZh: '决斗挑战',
        titleEn: 'Duel Challenge',
        descZh: '调整功力，在成本、胜率和奖励之间做选择。',
        descEn: 'Balance your power level against cost, odds, and reward.',
        costZh: '动态成本',
        costEn: 'Dynamic cost',
        metaZh: '六档奖励',
        metaEn: '6 reward tiers'
    }),
    defineGame({
        id: 'spin',
        index: '10',
        group: 'free',
        href: '/spin',
        actions: [action('/api/spin', USER_ACTION_POLICIES)],
        assetKind: 'free',
        category: 'challenge',
        economicsKind: 'free',
        recordView: null,
        titleZh: '挑战转盘',
        titleEn: 'Challenge Wheel',
        descZh: `从 ${SPIN_CONFIG.challenges.length} 项直播、体能和趣味任务中随机抽取一个。`,
        descEn: `Draw one of ${SPIN_CONFIG.challenges.length} live, fitness, and playful challenges.`,
        costZh: '免费',
        costEn: 'Free',
        metaZh: `${SPIN_CONFIG.challenges.length} 项任务`,
        metaEn: `${SPIN_CONFIG.challenges.length} challenges`
    })
]);

module.exports = { GAME_DEFINITIONS, GAME_GROUPS };
