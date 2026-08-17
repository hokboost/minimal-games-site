'use strict';

const base = require('./batch-one');
const challengeFlavor = require('./challenge-flavor-foundations');
const { validateChallengeFlavor } = require('../../../domain/streamer-games/challenge-flavor-validator');

validateChallengeFlavor(challengeFlavor, Object.fromEntries(Object.entries(base)
    .map(([gameId, pack]) => [gameId, pack.challenges.map(challenge => challenge.id)])));

function withFlavor(gameId, challenges) {
    const entries = challengeFlavor[gameId];
    return challenges.map((challenge) => ({
        ...challenge,
        flavor: entries[challenge.id] || null
    }));
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

const constellationMaps = [{
        id: 'reed-moon-switchyard',
        titleZh: '芦月转辙场',
        titleEn: 'Reed-Moon Switchyard',
        briefZh: '两条潮湿支线共享一个转辙心，转角必须避开候鸟休息格。',
        briefEn: 'Two damp branches share one switch core, and every turn must avoid the resting-bird cells.',
        width: 10,
        height: 9,
        budget: 22,
        seed: 4307
    },
    {
        id: 'porcelain-tide-ring',
        titleZh: '瓷潮环线',
        titleEn: 'Porcelain Tide Ring',
        briefZh: '易碎瓷节点只允许线路擦边经过，不能成为承重转角。',
        briefEn: 'Fragile porcelain nodes may be skirted but can never carry a route corner.',
        width: 9,
        height: 10,
        budget: 23,
        seed: 4513
    },
    {
        id: 'migrating-clock-grid',
        titleZh: '迁徙钟格',
        titleEn: 'Migrating Clock Grid',
        briefZh: '钟面阻断会随奇偶列交替，双方需要分别保管时间与方向线索。',
        briefEn: 'Clock-face blockers alternate by column parity, splitting time and direction clues between partners.',
        width: 10,
        height: 10,
        budget: 24,
        seed: 4721
    },
    {
        id: 'willow-signal-braid',
        titleZh: '柳梢信号辫',
        titleEn: 'Willow Signal Braid',
        briefZh: '三股细线要在风口前换位，却不能共享同一枚脆弱节点。',
        briefEn: 'Three fine routes must trade positions before the wind gap without sharing a fragile node.',
        width: 10,
        height: 10,
        budget: 24,
        seed: 4933
    },
    {
        id: 'sunken-post-office',
        titleZh: '沉没邮局回路',
        titleEn: 'Sunken Post Office Circuit',
        briefZh: '水下信箱形成不可穿越的岛群，唯一短路需要一次反向折返。',
        briefEn: 'Submerged mailboxes form impassable islands, and the only short route requires one reverse bend.',
        width: 11,
        height: 9,
        budget: 25,
        seed: 5147
    },
    {
        id: 'winter-orchard-lattice',
        titleZh: '冬果园晶格',
        titleEn: 'Winter Orchard Lattice',
        briefZh: '休眠枝条留下狭窄窗口，线路每跨越一次霜带就增加转向代价。',
        briefEn: 'Dormant branches leave narrow windows, and every frost-band crossing increases the turn cost.',
        width: 10,
        height: 11,
        budget: 26,
        seed: 5351
    },
    {
        id: 'inkstone-observatory',
        titleZh: '砚台观测网',
        titleEn: 'Inkstone Observatory Web',
        briefZh: '墨池会吞掉连续直线，安全路径必须在三座观测台之间改变节奏。',
        briefEn: 'Ink pools swallow long straight runs, so the safe route changes cadence between three observatories.',
        width: 11,
        height: 10,
        budget: 27,
        seed: 5563
    },
    {
        id: 'blueglass-estuary',
        titleZh: '蓝玻璃河口',
        titleEn: 'Blueglass Estuary',
        briefZh: '透明阻断只在伙伴视图里显形，主播负责决定每次试探是否值得。',
        briefEn: 'Transparent blockers appear only to the partner, while the creator decides whether each probe is worth its turn.',
        width: 11,
        height: 11,
        budget: 27,
        seed: 5779
    },
    {
        id: 'thunder-teahouse-crown',
        titleZh: '雷茶屋冠线',
        titleEn: 'Thunder Teahouse Crown',
        briefZh: '屋檐接地格分割冠形主线，最后三步必须保留两条合法次序。',
        briefEn: 'Grounded eave cells divide the crown route, and the final three moves must preserve two legal orders.',
        width: 12,
        height: 10,
        budget: 28,
        seed: 5981
    },
    {
        id: 'homeward-aurora-vault',
        titleZh: '归航极光穹顶',
        titleEn: 'Homeward Aurora Vault',
        briefZh: '四片极光区各有不同转角上限，完整线路需要双方交换全部隐藏约束。',
        briefEn: 'Four aurora sectors impose different turn ceilings, and completion requires both partners to exchange every hidden constraint.',
        width: 12,
        height: 12,
        budget: 30,
        seed: 6197
    }
];

const signalPatterns = [{
        id: 'porch-sparrow',
        titleZh: '檐下麻雀拍',
        titleEn: 'Porch Sparrow Pulse',
        briefZh: '两次轻跳后留出一拍空檐，适合练习不抢答。',
        briefEn: 'Two light hops leave one empty eave, rewarding a deliberate non-entry.',
        bpm: 76,
        beats: 12,
        seed: 7207
    },
    {
        id: 'frosted-window-code',
        titleZh: '霜窗报码',
        titleEn: 'Frosted Window Code',
        briefZh: '短拍写轮廓，长拍擦出窗口，双方轮流完成同一图案。',
        briefEn: 'Short beats draw an outline and long beats clear the pane as partners alternate one image.',
        bpm: 84,
        beats: 14,
        seed: 7411
    },
    {
        id: 'reed-flute-answer',
        titleZh: '芦笛问答',
        titleEn: 'Reed Flute Answer',
        briefZh: '主播保管上行问句，伙伴用下行三音作答。',
        briefEn: 'The creator holds the rising call while the partner answers in three descending tones.',
        bpm: 88,
        beats: 16,
        seed: 7621
    },
    {
        id: 'lantern-elevator',
        titleZh: '灯笼电梯拍',
        titleEn: 'Lantern Elevator Beat',
        briefZh: '节拍逐层上升，却在每次开门时回到共同基音。',
        briefEn: 'The pulse climbs floor by floor and returns to a shared root whenever the doors open.',
        bpm: 92,
        beats: 16,
        seed: 7837
    },
    {
        id: 'salt-page-rhythm',
        titleZh: '盐页翻拍',
        titleEn: 'Salt-Page Rhythm',
        briefZh: '翻页噪声形成弱拍，真正提示藏在两次停顿之间。',
        briefEn: 'Page noise occupies the weak beats while the real cue sits between two rests.',
        bpm: 96,
        beats: 18,
        seed: 8053
    },
    {
        id: 'harbor-rope-song',
        titleZh: '港绳号子',
        titleEn: 'Harbor Rope Song',
        briefZh: '一侧拉紧长拍，另一侧只在绳结标记处落点。',
        briefEn: 'One side sustains the pull while the other lands only at knot markers.',
        bpm: 100,
        beats: 18,
        seed: 8263
    },
    {
        id: 'glasswing-canon',
        titleZh: '玻璃翼轮唱',
        titleEn: 'Glasswing Canon',
        briefZh: '透明翅拍相隔两格追逐，任何提前输入都会打乱合流。',
        briefEn: 'Transparent wingbeats chase two slots apart, and an early entry disrupts their meeting.',
        bpm: 104,
        beats: 20,
        seed: 8477
    },
    {
        id: 'market-shutter',
        titleZh: '集市卷帘拍',
        titleEn: 'Market Shutter Beat',
        briefZh: '三家店铺用不同长度的卷帘声组成同一闭市节奏。',
        briefEn: 'Three shops combine differently sized shutter sounds into one closing rhythm.',
        bpm: 108,
        beats: 20,
        seed: 8689
    },
    {
        id: 'cloud-loom-meter',
        titleZh: '云织机拍号',
        titleEn: 'Cloud Loom Meter',
        briefZh: '四拍经线与五拍纬线短暂重合，合拍只出现两次。',
        briefEn: 'A four-beat warp and five-beat weft overlap briefly, producing only two shared entries.',
        bpm: 112,
        beats: 22,
        seed: 8903
    },
    {
        id: 'midnight-buoy',
        titleZh: '午夜浮标答拍',
        titleEn: 'Midnight Buoy Response',
        briefZh: '远近浮标交替闪烁，静默的第三座只负责分隔段落。',
        briefEn: 'Near and far buoys alternate while a silent third marker separates phrases.',
        bpm: 116,
        beats: 22,
        seed: 9119
    },
    {
        id: 'copper-rain-canon',
        titleZh: '铜雨轮奏',
        titleEn: 'Copper Rain Canon',
        briefZh: '铜檐上的雨点从左移到右，伙伴必须在中线交棒。',
        briefEn: 'Rain travels across a copper eave and partners hand off exactly at its center.',
        bpm: 120,
        beats: 24,
        seed: 9323
    },
    {
        id: 'paper-comet-fugue',
        titleZh: '纸彗赋格',
        titleEn: 'Paper Comet Fugue',
        briefZh: '两条纸尾各有独立重音，最后折进同一个长拍。',
        briefEn: 'Two paper tails carry separate accents before folding into one sustained close.',
        bpm: 124,
        beats: 24,
        seed: 9539
    },
    {
        id: 'station-umbrella',
        titleZh: '站台伞阵拍',
        titleEn: 'Platform Umbrella Pattern',
        briefZh: '开伞是强拍，收伞是弱拍，空位代表等待而不是漏拍。',
        briefEn: 'Opening marks the accent, closing marks the weak beat, and an empty slot means waiting rather than a miss.',
        bpm: 128,
        beats: 26,
        seed: 9749
    },
    {
        id: 'orchard-pendulum',
        titleZh: '果园钟摆曲',
        titleEn: 'Orchard Pendulum',
        briefZh: '成熟钟果每三拍换边，要求双方同步调整自己的声部。',
        briefEn: 'Ripe clockfruit changes side every three beats, requiring both parts to adjust together.',
        bpm: 132,
        beats: 26,
        seed: 9967
    },
    {
        id: 'aurora-step-sequence',
        titleZh: '极光踏步序',
        titleEn: 'Aurora Step Sequence',
        briefZh: '强弱拍不依赖颜色，只由长短条带和位置提示。',
        briefEn: 'Accents never rely on color; stripe length and position carry every cue.',
        bpm: 136,
        beats: 28,
        seed: 10181
    },
    {
        id: 'whale-mail-duet',
        titleZh: '鲸邮双奏',
        titleEn: 'Whale-Mail Duet',
        briefZh: '浪峰投递短拍，浪谷收回长拍，双方隔岸应答。',
        briefEn: 'Crests deliver short beats and troughs retrieve long ones in a cross-shore exchange.',
        bpm: 140,
        beats: 28,
        seed: 10391
    },
    {
        id: 'mirror-tram-finale',
        titleZh: '镜面电车终拍',
        titleEn: 'Mirror Tram Finale',
        briefZh: '后半程按站序倒放前半程，但换手位置保持不变。',
        briefEn: 'The return trip reverses station order while preserving every handoff point.',
        bpm: 146,
        beats: 30,
        seed: 10607
    },
    {
        id: 'stormglass-polyrhythm',
        titleZh: '风暴玻璃复拍',
        titleEn: 'Stormglass Polyrhythm',
        briefZh: '三拍警报穿过四拍基础线，安全窗口由两人共同数出。',
        briefEn: 'A three-beat warning crosses a four-beat ground line, and partners count the safe windows together.',
        bpm: 152,
        beats: 30,
        seed: 10831
    },
    {
        id: 'relay-heartbeat',
        titleZh: '中继心跳',
        titleEn: 'Relay Heartbeat',
        briefZh: '节奏从单点心跳扩成双轨传输，再在末尾恢复安静。',
        briefEn: 'A single heartbeat opens into twin relay tracks and settles back into quiet at the close.',
        bpm: 158,
        beats: 32,
        seed: 11047
    },
    {
        id: 'first-light-chorus',
        titleZh: '第一束光合奏',
        titleEn: 'First-Light Chorus',
        briefZh: '四段原创提示音轮流领奏，最终小节要求同步而非竞速。',
        briefEn: 'Four original cue phrases trade the lead, and the final measure values synchronization over speed.',
        bpm: 166,
        beats: 36,
        seed: 11261
    }
];

const weaverPrompts = [{
        id: 'door-that-kept-weather',
        titleZh: '收藏天气的门',
        titleEn: 'The Door That Kept Weather',
        briefZh: '一扇旧门保存每位访客带来的天气，直到有人请求归还晴天。',
        briefEn: 'An old door stores each visitor’s weather until someone asks for the sunshine back.',
        turns: 6,
        seed: 12101
    },
    {
        id: 'train-of-unfinished-maps',
        titleZh: '未完成地图列车',
        titleEn: 'Train of Unfinished Maps',
        briefZh: '每节车厢都是一张缺角地图，旅伴只能用故事补上一处。',
        briefEn: 'Every carriage is a map with one missing corner, and each traveler may repair only one with a story.',
        turns: 7,
        seed: 12323
    },
    {
        id: 'garden-of-patient-machines',
        titleZh: '耐心机器花园',
        titleEn: 'Garden of Patient Machines',
        briefZh: '停摆机器在花圃学习等待，最老的那台却收到一封紧急邀请。',
        briefEn: 'Idle machines learn patience in a garden until the oldest receives an urgent invitation.',
        turns: 6,
        seed: 12547
    },
    {
        id: 'borrowed-morning',
        titleZh: '借来的清晨',
        titleEn: 'A Borrowed Morning',
        briefZh: '城市借来一个额外清晨，却必须决定把它留给谁而不制造竞赛。',
        briefEn: 'A city borrows one extra morning and must share it without turning time into a contest.',
        turns: 7,
        seed: 12763
    },
    {
        id: 'umbrella-constellation',
        titleZh: '雨伞星座',
        titleEn: 'Umbrella Constellation',
        briefZh: '遗失雨伞在屋顶排成星图，指向一段无人认领的共同记忆。',
        briefEn: 'Lost umbrellas form a rooftop constellation pointing toward an unclaimed shared memory.',
        turns: 8,
        seed: 12979
    },
    {
        id: 'quietest-drum',
        titleZh: '最安静的鼓',
        titleEn: 'The Quietest Drum',
        briefZh: '一面从不发声的鼓能改变游行方向，但只有拒绝敲击的人看得懂。',
        briefEn: 'A silent drum can redirect a parade, but only someone who declines to strike it understands how.',
        turns: 7,
        seed: 13187
    },
    {
        id: 'river-wearing-coat',
        titleZh: '穿外套的河',
        titleEn: 'The River in a Coat',
        briefZh: '冬河穿上旧外套后开始收集纽扣，每颗都记着不同码头。',
        briefEn: 'A winter river dons an old coat and gathers buttons that remember different docks.',
        turns: 8,
        seed: 13403
    },
    {
        id: 'museum-of-small-pauses',
        titleZh: '微小停顿博物馆',
        titleEn: 'Museum of Small Pauses',
        briefZh: '馆藏不是物件，而是人们在做决定前留下的短暂停顿。',
        briefEn: 'The museum holds no objects, only the brief pauses people leave before decisions.',
        turns: 8,
        seed: 13619
    },
    {
        id: 'lighthouse-under-stage',
        titleZh: '舞台下的灯塔',
        titleEn: 'The Lighthouse Beneath the Stage',
        briefZh: '每次谢幕都会点亮地下一层，直到演员发现那里也有观众。',
        briefEn: 'Every curtain call lights another basement level until the cast discovers an audience below.',
        turns: 9,
        seed: 13829
    },
    {
        id: 'letter-that-chose-silence',
        titleZh: '选择沉默的信',
        titleEn: 'The Letter That Chose Silence',
        briefZh: '一封会说话的信决定不读出正文，只带收信人走到安全出口。',
        briefEn: 'A speaking letter refuses to read its contents and instead guides the recipient to a safe exit.',
        turns: 9,
        seed: 14051
    }
];

const recipeRows = [
    ['tideglass-desk-lamp', '潮玻璃桌灯', 'Tideglass Desk Lamp', '潮玻璃会把刺眼反光收进灯座。',
        'Tideglass gathers harsh reflections into the lamp base.', 'shore-lighting',
        'tide-glass', 'soft-light'
    ],
    ['reedshade-floor-lamp', '芦影落地灯', 'Reedshade Floor Lamp', '交叠芦影形成不依赖颜色的亮度刻度。',
        'Layered reed shadows form a brightness scale without relying on color.',
        'shore-lighting', 'reed-fiber', 'soft-light'
    ],
    ['foghorn-reading-sconce', '雾笛阅读壁灯', 'Foghorn Reading Sconce', '壁灯在提示音后缓慢增亮，不用突然闪烁。',
        'The sconce brightens gradually after a cue instead of flashing.', 'shore-lighting',
        'copper-leaf', 'soft-light'
    ],
    ['moonwell-night-marker', '月井夜间标记灯', 'Moonwell Night Marker', '低位标记只照亮出口边缘。',
        'A low marker illuminates only the edge of the exit.', 'shore-lighting', 'glass-pane',
        'rain-seed'
    ],
    ['harbor-dawn-prism', '港湾晨光棱镜', 'Harbor Dawn Prism', '棱镜把晨光分成位置不同的柔和条带。',
        'The prism separates dawn into softly positioned bands.', 'shore-lighting',
        'glass-star', 'aurora-thread'
    ],
    ['platform-tea-tray', '站台茶盘', 'Platform Tea Tray', '防滑茶盘为杯子留下清晰触觉边界。',
        'A non-slip tray gives every cup a clear tactile boundary.', 'night-shift-table',
        'station-wood', 'soft-cotton'
    ],
    ['clockfruit-coaster-set', '钟果杯垫组', 'Clockfruit Coaster Set', '四枚杯垫以纹理区分，不要求辨色。',
        'Four coasters use texture rather than color for distinction.', 'night-shift-table',
        'reclaimed-wood', 'echo-sand'
    ],
    ['rainbreak-kettle-mat', '雨歇壶垫', 'Rainbreak Kettle Mat', '壶垫在温度安全后才显出星形纹路。',
        'A star pattern appears only after the kettle reaches a safe temperature.',
        'night-shift-table', 'soft-cotton', 'rain-seed'
    ],
    ['quiet-spoon-rest', '安静匙托', 'Quiet Spoon Rest', '匙托吸收碰撞声，却保留触觉定位。',
        'The rest softens clatter while preserving tactile location.', 'night-shift-table',
        'mist-fiber', 'copper-leaf'
    ],
    ['shared-recipe-stand', '共享食谱架', 'Shared Recipe Stand', '双面支架让两位制作者各看一页。',
        'A two-sided stand gives each maker an independent page.', 'night-shift-table',
        'station-wood', 'silver-thread'
    ],
    ['saltpage-index-box', '盐页索引盒', 'Salt-Page Index Box', '透气卡槽按来源保存互相矛盾的索引。',
        'Breathing slots preserve conflicting indexes by provenance.', 'archive-tools',
        'reclaimed-wood', 'tide-thread'
    ],
    ['blue-ink-label-press', '蓝墨标签压印器', 'Blue-Ink Label Press', '压印器只接受固定安全字段。',
        'The press accepts only fixed, safe label fields.', 'archive-tools', 'copper-gear',
        'echo-sand'
    ],
    ['parallel-ledger-rack', '并列账页架', 'Parallel Ledger Rack', '两份记录可以并排打开而不互相覆盖。',
        'Two records can open side by side without covering each other.', 'archive-tools',
        'station-wood', 'silver-thread'
    ],
    ['weatherproof-card-sleeve', '防潮卡套', 'Weatherproof Card Sleeve', '卡套保留内容哈希与可读标题。',
        'The sleeve preserves both content hash and readable title.', 'archive-tools',
        'glass-pane', 'tide-thread'
    ],
    ['contradiction-thread-board', '矛盾线板', 'Contradiction Thread Board', '线板标出冲突，却不会宣布未经验证的结论。',
        'The board marks contradictions without declaring an unverified conclusion.',
        'archive-tools', 'soft-cotton', 'star-nail'
    ],
    ['tram-window-planter', '电车窗花槽', 'Tram Window Planter', '窄花槽在转弯时锁住土壤盒。',
        'The narrow planter secures its soil box on turns.', 'moving-garden', 'station-wood',
        'reed-fiber'
    ],
    ['dewclock-watering-ring', '露钟浇水环', 'Dewclock Watering Ring', '刻度环用触点提示下一次浇水窗口。',
        'Raised marks indicate the next watering window.', 'moving-garden', 'copper-gear',
        'rain-seed'
    ],
    ['night-pollen-screen', '夜花粉隔网', 'Night Pollen Screen', '可拆隔网明确标注清洁与更换日期。',
        'A removable screen clearly marks cleaning and replacement dates.', 'moving-garden',
        'mist-fiber', 'silver-thread'
    ],
    ['seed-ticket-drawer', '种票抽屉', 'Seed-Ticket Drawer', '每格种票都保留来源和虚构故事名。',
        'Each seed ticket keeps provenance and a fictional story name.', 'moving-garden',
        'reclaimed-wood', 'folded-paper'
    ],
    ['migrating-herb-cart', '迁徙香草车', 'Migrating Herb Cart', '小车只沿室内标记轨道移动。',
        'The cart moves only along its marked indoor track.', 'moving-garden', 'station-wood',
        'copper-gear'
    ],
    ['duet-latency-dial', '双奏延迟刻度盘', 'Duet Latency Dial', '刻度盘保存本地校准，不影响他人得分。',
        'The dial stores local calibration without changing another player’s score.',
        'music-corner', 'copper-gear', 'glass-star'
    ],
    ['visual-pulse-ribbon', '视觉节拍带', 'Visual Pulse Ribbon', '长短纹理替代闪烁颜色提示。',
        'Long and short textures replace flashing color cues.', 'music-corner', 'aurora-thread',
        'soft-cotton'
    ],
    ['two-page-score-clip', '双页谱夹', 'Two-Page Score Clip', '谱夹让轮流声部保持各自位置。',
        'The clip keeps alternating parts on their own pages.', 'music-corner', 'silver-thread',
        'star-nail'
    ],
    ['quiet-metronome-case', '静音节拍器盒', 'Quiet Metronome Case', '外壳提供可触摸拍点与可关闭提示音。',
        'The case provides tactile beats and optional audio.', 'music-corner', 'reclaimed-wood',
        'echo-sand'
    ],
    ['original-tone-chime', '原创提示音钟', 'Original-Tone Chime', '三枚原创音程钟不引用任何歌曲。',
        'Three original interval chimes reference no existing song.', 'music-corner',
        'copper-leaf', 'silver-thread'
    ],
    ['checkpoint-compass', '检查点罗盘', 'Checkpoint Compass', '罗盘只指向已到达的安全检查点。',
        'The compass points only to safe checkpoints already reached.', 'maze-kit',
        'copper-gear', 'glass-star'
    ],
    ['visited-room-stamp', '已访房间印', 'Visited-Room Stamp', '印章记录走过的房间，不泄露终点路线。',
        'The stamp records visited rooms without revealing the route to the goal.', 'maze-kit',
        'folded-paper', 'echo-sand'
    ],
    ['limited-hint-token-box', '限量提示匣', 'Limited Hint Token Box', '三格匣让剩余提示数量始终可见。',
        'A three-slot box keeps the remaining hint count visible.', 'maze-kit',
        'reclaimed-wood', 'glass-pane'
    ],
    ['dead-end-chalk', '回头路粉笔', 'Dead-End Chalk', '可擦标记帮助辨认已验证的死路。',
        'Erasable marks identify dead ends already tested.', 'maze-kit', 'rain-seed',
        'soft-cotton'
    ],
    ['dream-exit-bell', '梦境出口铃', 'Dream Exit Bell', '铃只在相邻出口真实开放时响起。',
        'The bell rings only when an adjacent exit is truly open.', 'maze-kit', 'copper-leaf',
        'mist-fiber'
    ],
    ['meteor-lane-marker', '流星航道标', 'Meteor Lane Marker', '凸起数字让主防线无需依赖颜色。',
        'Raised numerals keep the primary defense independent of color.', 'defense-desk',
        'station-wood', 'star-nail'
    ],
    ['support-beacon-stand', '支援信标座', 'Support Beacon Stand', '底座清楚显示每波仅一次支援。',
        'The stand clearly shows one support placement per wave.', 'defense-desk',
        'copper-gear', 'glass-star'
    ],
    ['wave-strength-abacus', '波强算盘', 'Wave Strength Abacus', '滑珠记录服务器确认的威胁强度。',
        'Sliding beads track server-confirmed threat strength.', 'defense-desk',
        'reclaimed-wood', 'copper-leaf'
    ],
    ['solo-fallback-switch', '单人后备开关', 'Solo Fallback Switch', '伙伴离线时开关提供有界自动支援。',
        'The switch supplies bounded automatic support when a partner is offline.',
        'defense-desk', 'copper-gear', 'soft-light'
    ],
    ['safe-retreat-flag', '安全撤离旗', 'Safe Retreat Flag', '撤离不会扣除既得收藏或关系进度。',
        'Retreat never removes earned collection or relationship progress.', 'defense-desk',
        'soft-cotton', 'tide-thread'
    ],
    ['mystery-evidence-tray', '谜案证据盘', 'Mystery Evidence Tray', '分区盘只展示当前已解锁线索。',
        'Divided trays display only currently unlocked evidence.', 'investigation-room',
        'reclaimed-wood', 'glass-pane'
    ],
    ['contradiction-toggle-pin', '矛盾切换针', 'Contradiction Toggle Pin', '针脚能撤销错误连线而不污染隐藏答案。',
        'The pin removes a wrong link without exposing hidden answers.', 'investigation-room',
        'copper-leaf', 'silver-thread'
    ],
    ['theory-card-screen', '推理卡遮板', 'Theory Card Screen', '遮板在提交前隐藏正确性。',
        'The screen hides correctness until submission.', 'investigation-room', 'folded-paper',
        'mist-fiber'
    ],
    ['owner-clue-envelope', '伙伴线索封', 'Owner Clue Envelope', '信封只装服务器允许的结构化提示。',
        'The envelope holds only server-allowlisted structured hints.', 'investigation-room',
        'folded-paper', 'star-nail'
    ],
    ['case-archive-seal', '案卷归档印', 'Case Archive Seal', '结案印保留所选路线而非宣称唯一真相。',
        'The seal preserves the chosen theory without claiming a single truth.',
        'investigation-room', 'echo-sand', 'copper-gear'
    ],
    ['weaver-motif-wheel', '接龙母题轮', 'Weaver Motif Wheel', '转轮从安全封闭母题中选择约束。',
        'The wheel selects constraints from a closed safe motif set.', 'writing-table',
        'reclaimed-wood', 'silver-thread'
    ],
    ['branch-vote-box', '分支投票匣', 'Branch Vote Box', '票匣允许跳过，弃权不会影响关系。',
        'The box allows a skip, and abstaining never affects relationship state.',
        'writing-table', 'station-wood', 'folded-paper'
    ],
    ['bounded-passage-frame', '有界段落框', 'Bounded Passage Frame', '框架只容纳预写双语片段。',
        'The frame accepts only preauthored bilingual fragments.', 'writing-table',
        'reclaimed-wood', 'glass-pane'
    ],
    ['ending-thread-spool', '结局线轴', 'Ending Thread Spool', '不同结局线保持分开直到明确选择。',
        'Ending threads remain separate until an explicit choice.', 'writing-table',
        'tide-thread', 'aurora-thread'
    ],
    ['memory-excerpt-clasp', '记忆摘录夹', 'Memory Excerpt Clasp', '夹子保存已同意公开的短摘录。',
        'The clasp preserves only excerpts approved for display.', 'writing-table',
        'copper-leaf', 'folded-paper'
    ],
    ['quiet-hours-door-sign', '安静时段门牌', 'Quiet-Hours Door Sign', '门牌说明消息会入箱但不实时推送。',
        'The sign explains that messages persist without live push.', 'boundary-tools',
        'station-wood', 'soft-light'
    ],
    ['neutral-decline-token', '中性拒绝牌', 'Neutral Decline Token', '翻到拒绝面不会减少任何关系值。',
        'Turning the token to decline reduces no relationship value.', 'boundary-tools',
        'reclaimed-wood', 'silver-thread'
    ],
    ['mute-window-timer', '静音窗口计时器', 'Mute-Window Timer', '本地计时器显示静音结束点且可提前解除。',
        'A local timer shows the mute end and permits early release.', 'boundary-tools',
        'copper-gear', 'glass-pane'
    ],
    ['consent-category-board', '同意类别板', 'Consent Category Board', '固定分类开关阻止自由文本绕过边界。',
        'Fixed category switches prevent free text from bypassing boundaries.',
        'boundary-tools', 'station-wood', 'star-nail'
    ],
    ['report-path-lantern', '举报路径灯', 'Report-Path Lantern', '灯列依次显示举报、审核与自愿恢复。',
        'The lantern path shows report, moderation, and voluntary recovery in order.',
        'boundary-tools', 'soft-light', 'tide-thread'
    ],
    ['bingo-confirmation-frame', '宾果确认框', 'Bingo Confirmation Frame', '只有已确认的安全事件能进入格子。',
        'Only confirmed safe events can enter a square.', 'broadcast-desk', 'reclaimed-wood',
        'glass-pane'
    ],
    ['break-reminder-flag', '休息提醒旗', 'Break Reminder Flag', '提示可跳过，不把休息变成强制任务。',
        'The optional reminder never turns a break into a compulsory task.', 'broadcast-desk',
        'soft-cotton', 'star-nail'
    ],
    ['recap-card-holder', '总结卡座', 'Recap Card Holder', '卡座保存一条服务器确认的场次总结。',
        'The holder keeps one server-confirmed session recap.', 'broadcast-desk',
        'station-wood', 'folded-paper'
    ],
    ['safe-event-counter', '安全事件计数器', 'Safe Event Counter', '计数器拒绝浏览器自报与未知事件名。',
        'The counter rejects browser self-reports and unknown event names.', 'broadcast-desk',
        'copper-gear', 'echo-sand'
    ],
    ['closing-light-switch', '收灯开关', 'Closing-Light Switch', '保存进度后开关才进入柔和结束状态。',
        'The switch enters a gentle close only after progress is saved.', 'broadcast-desk',
        'copper-leaf', 'soft-light'
    ],
    ['echo-clue-divider', '回声线索隔板', 'Echo Clue Divider', '隔板确保双方不会看到完整序列。',
        'The divider ensures neither partner sees the full sequence.', 'memory-shelf',
        'reclaimed-wood', 'mist-fiber'
    ],
    ['alternating-recall-beads', '交替回忆珠', 'Alternating Recall Beads', '奇偶珠分别交给不同玩家。',
        'Odd and even beads go to different players.', 'memory-shelf', 'glass-star',
        'silver-thread'
    ],
    ['reduced-motion-cover', '减弱动效罩', 'Reduced-Motion Cover', '罩面把动画替换为静态位置变化。',
        'The cover replaces animation with static positional changes.', 'memory-shelf',
        'soft-cotton', 'glass-pane'
    ],
    ['tactile-symbol-card', '触觉符号卡', 'Tactile Symbol Card', '形状和纹理共同编码，不使用纯颜色答案。',
        'Shape and texture encode every answer without color-only cues.', 'memory-shelf',
        'folded-paper', 'echo-sand'
    ],
    ['shared-reveal-drawer', '共同揭晓抽屉', 'Shared Reveal Drawer', '双方提交后抽屉才显示完整回声。',
        'The drawer reveals the complete echo only after both submissions.', 'memory-shelf',
        'station-wood', 'copper-gear'
    ],
    ['fictional-choice-carousel', '虚构选项转盘', 'Fictional Choice Carousel', '转盘只含世界观、玩法与创作偏好。',
        'The carousel contains only fictional-world, gameplay, and creative preferences.',
        'prediction-parlor', 'reclaimed-wood', 'aurora-thread'
    ],
    ['sealed-prediction-cup', '封存预测杯', 'Sealed Prediction Cup', '双方提交前杯盖不会显示另一侧选择。',
        'The cup stays sealed until both sides submit.', 'prediction-parlor', 'copper-leaf',
        'glass-pane'
    ],
    ['no-sensitive-topic-plaque', '非敏感主题牌', 'No-Sensitive-Topic Plaque', '门牌明确排除健康、财务、位置与私人关系。',
        'The plaque excludes health, finances, location, and private relationships.',
        'prediction-parlor', 'station-wood', 'star-nail'
    ],
    ['playful-score-ribbon', '友好计分带', 'Playful Score Ribbon', '分数只记录虚构默契，不改变奖励资格。',
        'The score records fictional rapport and changes no reward eligibility.',
        'prediction-parlor', 'soft-cotton', 'silver-thread'
    ],
    ['conversation-exit-card', '对话退出卡', 'Conversation Exit Card', '任何回合都能无惩罚结束或转为单人。',
        'Any round may end without penalty or switch to solo.', 'prediction-parlor',
        'folded-paper', 'tide-thread'
    ]
];

const recipes = recipeRows.map((row, index) => {
    const [id, titleZh, titleEn, briefZh, briefEn, collectionId, materialA, materialB] = row
    ;
    return {
        id,
        titleZh,
        titleEn,
        briefZh,
        briefEn,
        collectionId,
        recipe: {
            [materialA]: 2 + index % 2,
            [materialB]: 1
        },
        materialLabels: {
            [materialA]: materialA.replaceAll('-', ' '),
            [materialB]: materialB.replaceAll('-', ' ')
        }
    };
});

const packs = {
    'constellation-repair': {
        ...base['constellation-repair'],
        version: 'constellation-v2',
        challenges: withFlavor('constellation-repair', [...base['constellation-repair'].challenges, ...constellationMaps])
    },
    'signal-duet': {
        ...base['signal-duet'],
        version: 'signal-v2',
        challenges: withFlavor('signal-duet', [...base['signal-duet'].challenges, ...signalPatterns])
    },
    'mystery-board': {
        ...base['mystery-board'],
        version: 'mystery-v2',
        challenges: withFlavor('mystery-board', base['mystery-board'].challenges)
    },
    'story-weaver': {
        ...base['story-weaver'],
        version: 'weaver-v2',
        challenges: withFlavor('story-weaver', [...base['story-weaver'].challenges, ...weaverPrompts])
    },
    'studio-crafting': {
        ...base['studio-crafting'],
        version: 'crafting-v2',
        challenges: withFlavor('studio-crafting', [...base['studio-crafting'].challenges, ...recipes]),
        collections: [
            'shore-lighting', 'night-shift-table', 'archive-tools', 'moving-garden',
            'music-corner', 'maze-kit', 'defense-desk', 'investigation-room',
            'writing-table', 'boundary-tools', 'broadcast-desk', 'memory-shelf',
            'prediction-parlor'
        ]
    }
};

module.exports = deepFreeze(packs);
