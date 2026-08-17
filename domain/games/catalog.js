'use strict';

const {
    ADVENTURE_CONFIG,
    BLINDBOX_CONFIG,
    DOUDIZHU_CONFIG,
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
    }),
    defineGame({
        id: 'doudizhu',
        index: '11',
        group: 'free',
        href: '/doudizhu',
        actions: [
            action('/api/doudizhu/start', CAPACITY_USER_ACTION_POLICIES),
            action('/api/doudizhu/action', CAPACITY_USER_ACTION_POLICIES),
            action('/api/doudizhu/hint', CAPACITY_USER_ACTION_POLICIES)
        ],
        assetKind: 'free',
        category: 'strategy',
        economicsKind: 'competitive-skill',
        recordView: null,
        titleZh: '欢乐斗地主',
        titleEn: 'Fight the Landlord',
        descZh: '随机入座，叫分争地主，与两位公平人机完整对局。',
        descEn: 'Take a random seat, bid for landlord, and play a full match against two fair bots.',
        costZh: '免费',
        costEn: 'Free',
        metaZh: `${DOUDIZHU_CONFIG.playerCount} 人经典叫分`,
        metaEn: `${DOUDIZHU_CONFIG.playerCount}-player classic bidding`
    }),
    defineGame({
        id: 'adventure',
        index: '12',
        group: 'points',
        href: '/adventure',
        actions: [
            action('/api/adventure/start', CAPACITY_USER_ACTION_POLICIES),
            action('/api/adventure/action', CAPACITY_USER_ACTION_POLICIES),
            action('/api/adventure/abandon', CAPACITY_USER_ACTION_POLICIES)
        ],
        assetKind: 'points',
        category: 'challenge',
        economicsKind: 'progression-reward',
        recordView: null,
        titleZh: '星图闯关',
        titleEn: 'Star Map Adventure',
        descZh: '领取章节任务，在剧情、答题、密码、记忆与策略挑战中推进冒险。',
        descEn: 'Claim a chapter and advance through story, trivia, ciphers, memory, and strategy trials.',
        costZh: '免费领取',
        costEn: 'Free to claim',
        metaZh: `${ADVENTURE_CONFIG.contentVersion} 剧情季`,
        metaEn: `${ADVENTURE_CONFIG.contentVersion} story season`
    }),
    defineGame({
        id: 'constellation-repair', index: '13', group: 'free', href: '/constellation-repair',
        actions: [action('/api/constellation-repair/start', CAPACITY_USER_ACTION_POLICIES), action('/api/constellation-repair/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'coop', economicsKind: 'free', recordView: null,
        titleZh: '星图协修', titleEn: 'Constellation Repair',
        descZh: '你与站主掌握不同线索，轮流修复星路；也可使用单人双视角模式。',
        descEn: 'Repair star routes with asymmetric clues from the owner, or use the solo dual-view fallback.',
        costZh: '免费', costEn: 'Free', metaZh: '20 张协作星图', metaEn: '20 co-op charts'
    }),
    defineGame({
        id: 'signal-duet', index: '14', group: 'free', href: '/signal-duet',
        actions: [action('/api/signal-duet/start', CAPACITY_USER_ACTION_POLICIES), action('/api/signal-duet/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'rhythm', economicsKind: 'free', recordView: null,
        titleZh: '信号双奏', titleEn: 'Signal Duet',
        descZh: '跟随原创视觉脉冲轮流接拍，服务器时钟负责判定，也支持单人练习。',
        descEn: 'Trade original visual pulses against server timing, with a complete solo practice mode.',
        costZh: '免费', costEn: 'Free', metaZh: '20 首原创节拍', metaEn: '20 original patterns'
    }),
    defineGame({
        id: 'mystery-board', index: '15', group: 'free', href: '/mystery-board',
        actions: [action('/api/mystery-board/start', CAPACITY_USER_ACTION_POLICIES), action('/api/mystery-board/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'brain', economicsKind: 'free', recordView: null,
        titleZh: '谜案拼图', titleEn: 'Mystery Board',
        descZh: '连接手写证据、识别矛盾，再选择能够解释全部事实的结论。',
        descEn: 'Link authored evidence, identify contradictions, and choose the conclusion that explains every fact.',
        costZh: '免费', costEn: 'Free', metaZh: '20 宗原创谜案', metaEn: '20 authored cases'
    }),
    defineGame({
        id: 'story-weaver', index: '16', group: 'free', href: '/story-weaver',
        actions: [action('/api/story-weaver/start', CAPACITY_USER_ACTION_POLICIES), action('/api/story-weaver/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'creative', economicsKind: 'free', recordView: null,
        titleZh: '故事接龙工坊', titleEn: 'Story Weaver',
        descZh: '使用安全的双语段落卡异步续写，在主题呼应与交接中完成故事。',
        descEn: 'Build an asynchronous story from safe bilingual passage cards and thematic handoffs.',
        costZh: '免费', costEn: 'Free', metaZh: '20 个故事开端', metaEn: '20 story openings'
    }),
    defineGame({
        id: 'studio-crafting', index: '17', group: 'free', href: '/studio-crafting',
        actions: [action('/api/studio-crafting/start', CAPACITY_USER_ACTION_POLICIES), action('/api/studio-crafting/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'collection', category: 'creative', economicsKind: 'free', recordView: null,
        titleZh: '星光工坊', titleEn: 'Studio Crafting',
        descZh: '按确定性配方收集材料、制作摆件并布置自己的六格工作室。',
        descEn: 'Gather deterministic materials, craft keepsakes, and arrange a six-slot personal studio.',
        costZh: '免费', costEn: 'Free', metaZh: '20 件可收藏摆件', metaEn: '20 collectible decorations'
    }),
    defineGame({
        id: 'meteor-defense', index: '18', group: 'free', href: '/meteor-defense',
        actions: [action('/api/meteor-defense/start', CAPACITY_USER_ACTION_POLICIES), action('/api/meteor-defense/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'coop', economicsKind: 'free', recordView: null,
        titleZh: '流星守望', titleEn: 'Meteor Defense',
        descZh: '主播加固主防线，站主用隐藏强度线索放置信标；单人模式提供完整回退。',
        descEn: 'The creator holds the line while the owner places strength-informed beacons, with full solo fallback.',
        costZh: '免费', costEn: 'Free', metaZh: '20 张手写防线图', metaEn: '20 authored defense maps'
    }),
    defineGame({
        id: 'dream-maze', index: '19', group: 'free', href: '/dream-maze',
        actions: [action('/api/dream-maze/start', CAPACITY_USER_ACTION_POLICIES), action('/api/dream-maze/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'brain', economicsKind: 'free', recordView: null,
        titleZh: '梦境迷航', titleEn: 'Dream Maze',
        descZh: '服务器按用户与日期生成确定迷宫，地图保持隐藏，并提供严格有限的安全提示。',
        descEn: 'A deterministic daily maze stays server-hidden and offers a strictly limited hint supply.',
        costZh: '免费', costEn: 'Free', metaZh: '20 个梦境区域', metaEn: '20 dream regions'
    }),
    defineGame({
        id: 'broadcast-bingo', index: '20', group: 'free', href: '/broadcast-bingo',
        actions: [action('/api/broadcast-bingo/start', CAPACITY_USER_ACTION_POLICIES), action('/api/broadcast-bingo/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'live', economicsKind: 'free', recordView: null,
        titleZh: '直播宾果', titleEn: 'Broadcast Bingo',
        descZh: '卡片只响应站内已确认的安全直播事件，浏览器无法自行声明完成。',
        descEn: 'Cards respond only to confirmed safe server events; browsers cannot self-report squares.',
        costZh: '免费', costEn: 'Free', metaZh: '20 套安全主题卡', metaEn: '20 safe themed cards'
    }),
    defineGame({
        id: 'echo-memory', index: '21', group: 'free', href: '/echo-memory',
        actions: [action('/api/echo-memory/start', CAPACITY_USER_ACTION_POLICIES), action('/api/echo-memory/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'brain', economicsKind: 'free', recordView: null,
        titleZh: '回声默契', titleEn: 'Echo Memory',
        descZh: '双方只看见交错序列的一半，轮流复原；单人模式可查看完整学习线索。',
        descEn: 'Partners study alternating halves and rebuild the sequence; solo study exposes the whole clue.',
        costZh: '免费', costEn: 'Free', metaZh: '20 组非对称回声', metaEn: '20 asymmetric echoes'
    }),
    defineGame({
        id: 'keeper-prediction', index: '22', group: 'free', href: '/keeper-prediction',
        actions: [action('/api/keeper-prediction/start', CAPACITY_USER_ACTION_POLICIES), action('/api/keeper-prediction/action', CAPACITY_USER_ACTION_POLICIES)],
        assetKind: 'free', category: 'creative', economicsKind: 'free', recordView: null,
        titleZh: '守望者猜心局', titleEn: 'Keeper Prediction',
        descZh: '双方封存对虚构场景的游戏选择并预测伙伴答案，不读取任何真实敏感画像。',
        descEn: 'Seal fictional game choices and predict a partner without reading real sensitive profiles.',
        costZh: '免费', costEn: 'Free', metaZh: '20 个虚构选择场景', metaEn: '20 fictional choice scenes'
    })
]);

module.exports = { GAME_DEFINITIONS, GAME_GROUPS };
