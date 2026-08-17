'use strict';

const base = require('./batch-two');
const challengeFlavor = require('./challenge-flavor-horizons');
const { validateChallengeFlavor } = require('../../../domain/streamer-games/challenge-flavor-validator');

validateChallengeFlavor(challengeFlavor, Object.fromEntries(Object.entries(base)
    .map(([gameId, pack]) => [gameId, pack.challenges.map(challenge => challenge.id)])));
const mazeLibrary = require('./phase-8-maze-library');
const safeEventKinds = require('./phase-8-bingo-events');
const authoredPredictionCards = require('./phase-8-prediction-cards');

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

function withFlavor(gameId, challenges) {
    const entries = challengeFlavor[gameId];
    return challenges.map((challenge) => ({
        ...challenge,
        flavor: entries[challenge.id] || null
    }));
}

const meteorMaps = [{
        id: 'reed-delta-watch',
        titleZh: '芦洲三角防线',
        titleEn: 'Reed Delta Watch',
        briefZh: '横风让奇数波次向右偏移一格；每波仍只允许主播加固一次。',
        briefEn: 'Crosswind shifts odd waves one lane right, while the creator still fortifies only once per wave.',
        lanes: 6,
        waves: 14,
        modifier: 'crosswind',
        seed: 14207
    },
    {
        id: 'glass-orchard-escort',
        titleZh: '玻璃果园护航',
        titleEn: 'Glass Orchard Escort',
        briefZh: '脆弱护航波每三次冲击增强一级，需要伙伴提前读出强度。',
        briefEn: 'Fragile escort waves gain one strength every third impact, requiring advance strength calls from the partner.',
        lanes: 6,
        waves: 15,
        modifier: 'escort',
        seed: 14419
    },
    {
        id: 'static-tram-fort',
        titleZh: '静电电车堡',
        titleEn: 'Static Tram Fort',
        briefZh: '连续命中同一航道会追加一点静电伤害，防线必须主动换位。',
        briefEn: 'Consecutive hits on one lane add one static damage, forcing active defense rotation.',
        lanes: 7,
        waves: 15,
        modifier: 'static',
        seed: 14633
    },
    {
        id: 'aurora-beacon-line',
        titleZh: '极光信标线',
        titleEn: 'Aurora Beacon Line',
        briefZh: '伙伴信标吸收三点而非两点，但每波使用后仍会撤回。',
        briefEn: 'Partner beacons absorb three points instead of two and still withdraw after each wave.',
        lanes: 7,
        waves: 16,
        modifier: 'aurora',
        seed: 14851
    },
    {
        id: 'relay-two-finale',
        titleZh: '二号中继最终守望',
        titleEn: 'Relay Two Final Watch',
        briefZh: '最长波次采用周期增强规则，单人后备与双人协作都必须保留撤退边界。',
        briefEn: 'The longest wave set uses periodic strength increases, and both solo fallback and co-op preserve a retreat boundary.',
        lanes: 8,
        waves: 18,
        modifier: 'finale',
        seed: 15061
    }
];

const echoChallenges = [
    ['reed-knots', '芦结序列', 'Reed-Knot Sequence', '芦绳奇数结交给主播，偶数结交给伙伴，完整次序直到回忆阶段才合并。',
        'Odd reed knots go to the creator and even knots to the partner; the full order joins only during recall.'
    ],
    ['porcelain-drops', '瓷盘雨点', 'Porcelain Raindrops', '不同形状的雨点落在瓷盘边缘，颜色不会承担答案。',
        'Differently shaped drops land on porcelain rims, and color never carries the answer.'
    ],
    ['lighthouse-steps', '灯塔阶数', 'Lighthouse Steps', '螺旋台阶编号分在两侧，玩家必须轮流复原上升顺序。',
        'Spiral stair numbers split between sides and must be rebuilt through alternating recall.'
    ],
    ['tram-window-signs', '电车窗标', 'Tram Window Signs', '站名轮廓与开门方向分别由两位玩家保管。',
        'Station silhouettes and door directions are held by separate players.'
    ],
    ['moss-index-cards', '苔索引卡', 'Moss Index Cards', '一侧记卡片纹理，另一侧记抽屉位置。',
        'One side remembers card textures while the other keeps drawer positions.'
    ],
    ['paper-umbrella-turns', '纸伞转向', 'Paper Umbrella Turns', '伞面形状与转向顺序被拆成两份不完整线索。',
        'Canopy shapes and turning order split into two incomplete clues.'
    ],
    ['harbor-rope-calls', '港绳呼号', 'Harbor Rope Calls', '主播看见绳结，伙伴看见对应虚构呼号。',
        'The creator sees knots while the partner sees their fictional call signs.'
    ],
    ['clockfruit-chimes', '钟果鸣序', 'Clockfruit Chime Order', '成熟度与鸣声位置交错分配，任何一侧都无法单独还原。',
        'Ripeness and chime position alternate between players, preventing solo reconstruction.'
    ],
    ['glass-leaf-veins', '玻璃叶脉', 'Glass-Leaf Veins', '叶脉方向用纹理呈现，破损边缘另交给伙伴记忆。',
        'Vein directions use texture while damaged edges belong to the partner’s memory.'
    ],
    ['moon-ferry-seats', '月渡座次', 'Moon-Ferry Seats', '座位形状与停靠顺序被隔板分开。',
        'Seat shapes and docking order are separated by the clue divider.'
    ],
    ['copper-snow-tracks', '铜雪足迹', 'Copper-Snow Tracks', '左右脚印和步次编号分别显现。',
        'Left-right footprints and step numbers appear to different players.'
    ],
    ['quiet-carousel', '静默木马', 'Silent Carousel', '木马轮廓与停位刻痕构成两套互补记忆。',
        'Carousel silhouettes and stopping grooves form complementary memories.'
    ],
    ['archive-seal-order', '档案印序', 'Archive Seal Order', '印章图形由主播记，来源年份由伙伴记。',
        'The creator remembers seal shapes and the partner remembers source years.'
    ],
    ['aurora-tool-shadows', '极光工具影序', 'Aurora Tool-Shadow Order', '工具类别与影子长短各在一侧显示，完全不依赖色彩。',
        'Tool type and shadow length appear on separate sides without color dependence.'
    ],
    ['tea-button-floors', '茶钮楼层', 'Tea-Button Floors', '杯形按钮与楼层次序需要在揭晓前保持分离。',
        'Cup-shaped buttons and floor order remain separate until reveal.'
    ],
    ['garden-stone-rhythm', '花园石步', 'Garden Stone Steps', '石板纹理保存奇数步，铃声次数保存偶数步。',
        'Stone textures keep odd steps and bell counts keep even steps.'
    ],
    ['whale-post-stamps', '鲸邮印列', 'Whale-Post Stamp Row', '浪峰邮戳与浪谷邮戳由两侧各记一半。',
        'Crest and trough postmarks split evenly between the two sides.'
    ],
    ['winter-radio-bands', '冬季频段', 'Winter Radio Bands', '奇数频段显示符号，偶数频段只播放原创短音。',
        'Odd bands show symbols while even bands play original short tones.'
    ],
    ['folded-map-corners', '折图角序', 'Folded-Map Corners', '地图角形与折叠次序分开呈现。',
        'Map-corner shapes and folding order are presented separately.'
    ],
    ['rainbarrel-echoes', '雨桶回声', 'Rain-Barrel Echoes', '桶沿位置与回声次数需要交替回答。',
        'Rim positions and echo counts require alternating answers.'
    ],
    ['bluebird-window-code', '蓝鸟窗码', 'Bluebird Window Code', '鸟影和窗格编号分别落在两位玩家视图。',
        'Bird shadows and window numbers land in separate player views.'
    ],
    ['meteor-lane-memory', '流星航道记忆', 'Meteor Lane Memory', '航道编号与威胁形状分开短暂显示。',
        'Lane numbers and threat shapes appear briefly on opposite sides.'
    ],
    ['story-thread-colorsafe', '故事线纹', 'Story-Thread Texture', '故事线只用结形与粗细编码，不使用纯颜色差异。',
        'Story threads use knot shape and thickness, never color alone.'
    ],
    ['bingo-corner-symbols', '宾果角符', 'Bingo Corner Symbols', '卡角符号与格位序号在揭晓前保持非对称。',
        'Corner symbols and square positions remain asymmetric until reveal.'
    ],
    ['constellation-node-calls', '星图节点呼号', 'Constellation Node Calls', '节点形状和虚构呼号分别交给两位修复者。',
        'Node shapes and fictional call signs go to different repairers.'
    ],
    ['craft-material-order', '工坊材料序', 'Workshop Material Order', '材料纹理与取用次序在两侧交替显示。',
        'Material texture and gathering order alternate between sides.'
    ],
    ['fogharbor-buoys', '雾港浮标', 'Fog-Harbor Buoys', '浮标轮廓与鸣笛次数组成互补线索。',
        'Buoy outlines and horn counts form complementary clues.'
    ],
    ['dawn-door-marks', '黎明门痕', 'Dawn Door Marks', '门框凹槽与开启次序分开保存到最后一轮。',
        'Doorframe grooves and opening order stay split through the final round.'
    ],
    ['relay-sequence-long', '中继长序', 'Relay Long Sequence', '最长序列把位置、符号和回声分配成两套有界线索。',
        'The longest sequence divides position, symbol, and echo into two bounded clue sets.'
    ],
    ['homeward-footsteps', '归航脚步', 'Homeward Footsteps', '归途脚印逐个淡去，双方必须轮流补全完整路径。',
        'Homeward prints fade one by one, requiring partners to alternate the full reconstruction.'
    ]
].map(([id, titleZh, titleEn, briefZh, briefEn], index) => ({
    id,
    titleZh,
    titleEn,
    briefZh,
    briefEn,
    seed: 15271 + index * 223
}));

const existingPromptCards = base['keeper-prediction'].challenges.map((challenge) => ({
    id: `legacy-${challenge.id}`,
    promptZh: challenge.briefZh,
    promptEn: challenge.briefEn,
    choicesZh: challenge.choicesZh,
    choicesEn: challenge.choicesEn
}));

const bingoChallenges = base['broadcast-bingo'].challenges.map((challenge, index) => ({
    ...challenge,
    eventKeys: Array.from({
        length: 12
    }, (_, offset) => safeEventKinds[(index * 6 + offset) % safeEventKinds
        .length][0])
}));

const packs = {
    'meteor-defense': {
        ...base['meteor-defense'],
        version: 'meteor-v2',
        challenges: withFlavor('meteor-defense', [...base['meteor-defense'].challenges, ...meteorMaps])
    },
    'dream-maze': {
        ...base['dream-maze'],
        version: 'maze-v2',
        challenges: withFlavor('dream-maze', base['dream-maze'].challenges),
        roomLibrary: mazeLibrary.rooms,
        eventDefinitions: mazeLibrary.events
    },
    'broadcast-bingo': {
        ...base['broadcast-bingo'],
        version: 'bingo-v2',
        challenges: withFlavor('broadcast-bingo', bingoChallenges),
        safeEventKinds
    },
    'echo-memory': {
        ...base['echo-memory'],
        version: 'echo-v2',
        challenges: withFlavor('echo-memory', [...base['echo-memory'].challenges, ...echoChallenges])
    },
    'keeper-prediction': {
        ...base['keeper-prediction'],
        version: 'prediction-v2',
        challenges: withFlavor('keeper-prediction', base['keeper-prediction'].challenges),
        promptCards: [...existingPromptCards, ...authoredPredictionCards]
    }
};

module.exports = deepFreeze(packs);
