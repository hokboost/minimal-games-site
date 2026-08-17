'use strict';

const motifs = [
    ['library', [
        ['moss-index', '苔索引厅', 'Moss Index Hall', '潮湿卡片只记录已经走过的门。',
            'Damp cards record only doors already crossed.'
        ],
        ['ladder-atrium', '梯井中庭', 'Ladderwell Atrium', '四架短梯通向高度相同的回廊。',
            'Four short ladders reach galleries at the same height.'
        ],
        ['rain-reading-room', '雨读室', 'Rain Reading Room', '窗雨遮住远墙，却不改变相邻出口。',
            'Window rain hides the far wall without changing adjacent exits.'
        ],
        ['book-cart-turn', '书车转角', 'Book-Cart Corner', '停住的书车标记一条已经验证的死路。',
            'A parked book cart marks a dead end already tested.'
        ],
        ['quiet-return-desk', '安静归还台', 'Quiet Return Desk', '归还槽旁的灯只照亮来时方向。',
            'A lamp beside the return slot lights only the arrival direction.'
        ]
    ]],
    ['station', [
        ['ticket-arch', '票根拱廊', 'Ticket-Stub Arcade', '拱顶车票各缺一个站名。',
            'Every ticket on the arch lacks one station name.'
        ],
        ['platform-clock-room', '站钟室', 'Platform Clock Room', '三面钟显示不同时间，却共享同一出口。',
            'Three clocks disagree while sharing one exit.'
        ],
        ['umbrella-bench', '伞架候车间', 'Umbrella Bench', '空伞架留下可触摸的方向刻痕。',
            'An empty umbrella rack carries tactile direction marks.'
        ],
        ['signal-cabin', '信号小屋', 'Signal Cabin', '拉杆只复述本地开放出口。',
            'The lever repeats only locally open exits.'
        ],
        ['last-tram-loop', '末班环廊', 'Last-Tram Loop', '轨道声从刚刚离开的房间返回。',
            'Rail sounds return from the room just left.'
        ]
    ]],
    ['forest', [
        ['folded-oak', '折角橡树间', 'Folded Oak Room', '树皮折痕形成两条无高低之分的岔路。',
            'Bark folds form two branches with no ranked choice.'
        ],
        ['paper-leaf-clearing', '纸叶空地', 'Paper-Leaf Clearing', '落叶覆盖未走过的地面，但不指向终点。',
            'Leaves cover unvisited ground without pointing to the goal.'
        ],
        ['ink-root-bridge', '墨根桥', 'Ink-Root Bridge', '黑根横跨一条开放通道。',
            'Dark roots span one open passage.'
        ],
        ['windless-grove', '无风树丛', 'Windless Grove', '静止枝条让脚步回声更清楚。',
            'Still branches make footsteps easier to hear.'
        ],
        ['crane-nest-turn', '鹤巢转角', 'Crane-Nest Turn', '纸鹤只朝向上一个检查点。',
            'Paper cranes face only the previous checkpoint.'
        ]
    ]],
    ['kitchen', [
        ['moon-stove', '月灶间', 'Moon Stove Room', '冷灶的四个旋钮对应本地四面墙。',
            'Four cold stove knobs correspond to the local walls.'
        ],
        ['spice-drawer', '香料抽屉廊', 'Spice Drawer Hall', '抽屉气味标记已访问房间而非正确路线。',
            'Drawer scents mark visited rooms, not the correct route.'
        ],
        ['copper-sink', '铜水槽室', 'Copper Sink Room', '滴水数目等于可用出口数量。',
            'The number of drips equals the count of open exits.'
        ],
        ['empty-bowl-table', '空碗长桌', 'Empty-Bowl Table', '碗沿缺口指向来路。',
            'A notch in each bowl points back toward arrival.'
        ],
        ['pantry-lantern', '储藏灯间', 'Pantry Lantern Room', '低灯让墙上触觉箭头容易找到。',
            'Low light makes tactile wall arrows easy to find.'
        ]
    ]],
    ['carnival', [
        ['silent-carousel', '无声旋转厅', 'Silent Carousel Hall', '木马停下后露出相邻门框。',
            'The stopped carousel reveals adjacent doorframes.'
        ],
        ['paper-ticket-booth', '纸票亭', 'Paper Ticket Booth', '票卷只计算已经尝试的出口。',
            'The ticket roll counts exits already attempted.'
        ],
        ['mirror-tent-corner', '镜帐转角', 'Mirror-Tent Corner', '镜子复制房间却不复制通道。',
            'Mirrors duplicate the room but never its passages.'
        ],
        ['prize-shelf', '奖品架间', 'Prize Shelf Room', '玩具位置记录访问顺序。',
            'Toy positions record visitation order.'
        ],
        ['quiet-ferris-landing', '静默摩天轮台', 'Quiet Ferris Landing', '空轿厢停在一条开放路径旁。',
            'An empty cabin rests beside one open path.'
        ]
    ]],
    ['river', [
        ['glass-bank', '玻璃河岸', 'Glass Riverbank', '透明水下能看见来路的脚印。',
            'The clear water shows footprints from the arrival route.'
        ],
        ['reed-island', '芦苇小岛', 'Reed Island', '芦束数量表示本地岔路数。',
            'Reed bundles indicate the local branch count.'
        ],
        ['stillwater-bridge', '静水桥室', 'Stillwater Bridge Room', '桥面没有箭头，只保留开放边界。',
            'The bridge has no arrows, only open boundaries.'
        ],
        ['pebble-ford', '卵石浅滩', 'Pebble Ford', '翻过的石头标记已检查的死路。',
            'Turned stones mark dead ends already checked.'
        ],
        ['tide-step', '潮阶间', 'Tide-Step Room', '水线记录上一次进入方向。',
            'The tide line records the last entry direction.'
        ]
    ]],
    ['orchard', [
        ['clockfruit-row', '钟果列间', 'Clockfruit Row', '成熟果实按访问次数轻响。',
            'Ripe fruit chimes according to visit count.'
        ],
        ['pruning-gate', '修枝门', 'Pruning Gate', '剪枝口清楚显示当前开放出口。',
            'Pruned openings clearly show current exits.'
        ],
        ['dew-ladder', '露水梯间', 'Dew Ladder Room', '露珠只停在尚未触碰的栏杆上。',
            'Dew remains only on rails not yet touched.'
        ],
        ['windfall-circle', '落果环厅', 'Windfall Circle', '落果围成来路的轮廓。',
            'Fallen fruit outlines the arrival path.'
        ],
        ['grafting-bench', '嫁接长凳', 'Grafting Bench', '标签记下相邻房间的主题而非距离终点。',
            'Labels name adjacent room motifs, not goal distance.'
        ]
    ]],
    ['post', [
        ['whale-stamp-room', '鲸邮戳室', 'Whale Stamp Room', '浪峰邮戳表示已经访问的位置。',
            'Crest-shaped stamps indicate visited positions.'
        ],
        ['unsent-letter-hall', '未寄信廊', 'Unsent Letter Hall', '封口方向只标记来路。',
            'Envelope seals indicate only the arrival path.'
        ],
        ['parcel-scale', '包裹秤间', 'Parcel Scale Room', '秤盘数目等于开放出口。',
            'The number of scale pans equals open exits.'
        ],
        ['blue-mailbox-turn', '蓝信箱转角', 'Blue Mailbox Turn', '打开的信箱面对刚发现的通道。',
            'Open mailboxes face newly discovered passages.'
        ],
        ['tide-post-dock', '潮邮码头', 'Tide-Post Dock', '系缆柱保存检查点编号。',
            'Mooring posts preserve the checkpoint number.'
        ]
    ]],
    ['courtyard', [
        ['copper-snow-yard', '铜雪方庭', 'Copper-Snow Court', '金属雪保留每次折返的脚印。',
            'Metallic snow preserves every backtrack.'
        ],
        ['frost-bell-arch', '霜铃拱', 'Frost-Bell Arch', '铃数表示当前房间的出口数量。',
            'Bell count represents exits from the current room.'
        ],
        ['warm-stone-seat', '暖石座间', 'Warm-Stone Seat', '暖石是可停留的检查点，不提供答案。',
            'The warm stone is a checkpoint, not an answer.'
        ],
        ['snowmelt-channel', '融雪水道', 'Snowmelt Channel', '水流朝向来时房间。',
            'The meltwater flows toward the room just left.'
        ],
        ['bronze-gate-corner', '青铜门角', 'Bronze Gate Corner', '门上凹槽让开放方向可触辨。',
            'Grooves make open directions tactile.'
        ]
    ]],
    ['bakery', [
        ['echo-oven', '回声烤炉间', 'Echo Oven Room', '炉门回声复述上一动作。',
            'The oven echo repeats the previous move.'
        ],
        ['flour-step-hall', '面粉脚印廊', 'Flour-Step Hall', '脚印只显示已经走过的格子。',
            'Flour prints show only visited cells.'
        ],
        ['cooling-rack-turn', '冷却架转角', 'Cooling-Rack Corner', '空架之间露出合法通道。',
            'Legal passages appear between empty racks.'
        ],
        ['yeast-clock-room', '酵母钟室', 'Yeast Clock Room', '发酵计时不影响地图，只提示停留时间。',
            'Fermentation timing does not alter the map; it shows dwell time only.'
        ],
        ['bread-bell-door', '面包铃门', 'Bread-Bell Door', '门铃在相邻出口开放时轻响。',
            'The doorbell sounds when an adjacent exit is open.'
        ]
    ]],
    ['attic', [
        ['bluebird-beam', '蓝鸟梁间', 'Bluebird Beam Room', '梁上鸟影标记检查过的方向。',
            'Bird shadows mark inspected directions.'
        ],
        ['unnumbered-window', '无编号窗室', 'Unnumbered Window Room', '可开的窗只通向相邻房间。',
            'Openable windows lead only to adjacent rooms.'
        ],
        ['trunk-corner', '旧箱转角', 'Old-Trunk Corner', '箱盖内刻着来路而非捷径。',
            'The trunk lid records arrival, not a shortcut.'
        ],
        ['dust-map-floor', '尘图地板', 'Dust-Map Floor', '擦开的区域对应已访问房间。',
            'Cleared dust corresponds to visited rooms.'
        ],
        ['rafters-checkpoint', '椽木检查点', 'Rafter Checkpoint', '绳结保存最近一次安全位置。',
            'A rope knot preserves the latest safe position.'
        ]
    ]],
    ['greenhouse', [
        ['dew-orchid-room', '露兰室', 'Dew Orchid Room', '露珠排列显示本地出口数量。',
            'Dew arrangement shows the count of local exits.'
        ],
        ['fogglass-turn', '雾玻璃转角', 'Fogglass Corner', '擦开的玻璃只展示相邻走廊。',
            'Cleared glass reveals adjacent corridors only.'
        ],
        ['root-lattice', '根系晶格间', 'Root Lattice Room', '根网记录已尝试的方向。',
            'The root lattice records attempted directions.'
        ],
        ['watering-bench', '浇水长凳', 'Watering Bench', '空壶朝向上个房间。',
            'The empty can points toward the previous room.'
        ],
        ['seedling-gate', '幼苗门', 'Seedling Gate', '门边幼苗不遮挡触觉标记。',
            'Seedlings leave tactile markers unobstructed.'
        ]
    ]],
    ['aquarium', [
        ['tram-tank', '电车水箱厅', 'Tram Tank Hall', '车厢影子与鱼群反向移动。',
            'Carriage shadows move opposite the fish.'
        ],
        ['bubble-platform', '气泡站台', 'Bubble Platform', '气泡列数等于开放出口。',
            'Bubble columns equal the number of open exits.'
        ],
        ['coral-ticket-gate', '珊瑚检票门', 'Coral Ticket Gate', '珊瑚纹理区分来路与未访路径。',
            'Coral texture distinguishes arrival from unvisited paths.'
        ],
        ['glass-tunnel-turn', '玻璃隧道角', 'Glass Tunnel Turn', '透明墙不透露远处地图。',
            'Transparent walls reveal no distant map.'
        ],
        ['tide-carriage', '潮汐车厢', 'Tide Carriage', '座位灯保存检查点状态。',
            'Seat lights preserve checkpoint state.'
        ]
    ]],
    ['cave', [
        ['unlit-lantern-room', '熄灯洞室', 'Unlit Lantern Room', '暗灯旁的刻痕清楚标出出口。',
            'Marks beside unlit lamps clearly indicate exits.'
        ],
        ['echo-stalactite', '回声钟乳间', 'Echo Stalactite Room', '回声次数对应本地分支数。',
            'Echo count corresponds to local branches.'
        ],
        ['rope-bridge-pocket', '绳桥洞袋', 'Rope-Bridge Pocket', '绳结记录来路和检查点。',
            'Rope knots record arrival and checkpoint.'
        ],
        ['mineral-turn', '矿纹转角', 'Mineral Turn', '矿纹只区分已访与未访墙面。',
            'Mineral patterns distinguish visited from unvisited walls.'
        ],
        ['quiet-exit-bell', '静出口铃', 'Quiet Exit Bell', '铃声确认通道开放，却不判断是否通向终点。',
            'A bell confirms an open passage without judging whether it reaches the goal.'
        ]
    ]],
    ['laundry', [
        ['starline-room', '星晾线室', 'Star Clothesline Room', '晾线连接相邻门框而非远处捷径。',
            'Clotheslines join adjacent doors, never distant shortcuts.'
        ],
        ['button-basket', '纽扣篮间', 'Button Basket Room', '纽扣数表示已访问次数。',
            'Button count represents visit count.'
        ],
        ['folding-table-turn', '叠衣桌角', 'Folding-Table Corner', '折痕箭头指向来路。',
            'Fold arrows point toward arrival.'
        ],
        ['steam-window', '蒸汽窗室', 'Steam Window Room', '擦出的方格显示本地开放边界。',
            'Cleared squares show local open boundaries.'
        ],
        ['quiet-dryer-checkpoint', '静音烘衣检查点', 'Quiet Dryer Checkpoint', '停转滚筒保存最近安全状态。',
            'The stopped drum preserves the latest safe state.'
        ]
    ]],
    ['radio', [
        ['wrong-road-studio', '错误道路播音室', 'Wrong-Road Studio', '广播只排除一条本地通道。',
            'The broadcast excludes one local passage only.'
        ],
        ['dial-corridor', '调频走廊', 'Tuning-Dial Corridor', '刻度保存访问顺序。',
            'Dial marks preserve visitation order.'
        ],
        ['snow-antenna-room', '雪天线室', 'Snow Antenna Room', '天线数量对应出口数。',
            'Antenna count corresponds to exits.'
        ],
        ['recording-booth-turn', '录音亭转角', 'Recording-Booth Corner', '回放上一动作而不预测下一步。',
            'Playback repeats the last action without predicting the next.'
        ],
        ['signoff-checkpoint', '收播检查点', 'Signoff Checkpoint', '收播灯保存当前坐标。',
            'The signoff lamp preserves the current coordinate.'
        ]
    ]],
    ['elevator', [
        ['tea-button-room', '茶钮室', 'Tea Button Room', '按钮顺序改变外观，不改变迷宫结构。',
            'Button order changes appearance, not maze structure.'
        ],
        ['steam-floor-hall', '蒸汽楼层厅', 'Steam-Floor Hall', '蒸汽窗显示相邻出口。',
            'Steam windows show adjacent exits.'
        ],
        ['cup-tray-turn', '杯盘转角', 'Cup-Tray Corner', '空杯朝向来路。',
            'Empty cups face the arrival direction.'
        ],
        ['cooling-landing', '降温平台', 'Cooling Landing', '温度刻度只表示停留回合。',
            'The temperature scale indicates dwell turns only.'
        ],
        ['last-floor-checkpoint', '末层检查点', 'Last-Floor Checkpoint', '楼层牌记录最近安全位置。',
            'The floor sign records the latest safe position.'
        ]
    ]],
    ['harbor', [
        ['mirror-buoy-room', '镜浮标室', 'Mirror Buoy Room', '倒影保留本地真实方向。',
            'Reflections preserve true local bearings.'
        ],
        ['tideglass-pier', '潮玻璃码头', 'Tideglass Pier', '玻璃边线标出开放通道。',
            'Glass edge lines mark open passages.'
        ],
        ['fogrope-turn', '雾绳转角', 'Fog-Rope Corner', '绳结区分来路和未访方向。',
            'Rope knots distinguish arrival from unvisited directions.'
        ],
        ['anchor-checkpoint', '锚形检查点', 'Anchor Checkpoint', '小锚保存当前位置。',
            'A small anchor preserves the current position.'
        ],
        ['quiet-foghorn-room', '静雾笛室', 'Quiet Foghorn Room', '低频次数表示出口数。',
            'Low-tone count indicates the number of exits.'
        ]
    ]],
    ['workshop', [
        ['shadow-tool-room', '影工具室', 'Shadow Tool Room', '工具影长短对应本地四向标记。',
            'Tool-shadow lengths correspond to local direction marks.'
        ],
        ['aurora-bench', '极光长凳', 'Aurora Bench', '色彩只是装饰，凹槽承担导航。',
            'Color is decorative while grooves carry navigation.'
        ],
        ['gear-corner', '齿轮转角', 'Gear Corner', '停住齿轮标记已测试死路。',
            'Stopped gears mark tested dead ends.'
        ],
        ['pattern-drawer', '纹样抽屉间', 'Pattern Drawer Room', '抽屉图形显示相邻房间主题。',
            'Drawer shapes show adjacent room motifs.'
        ],
        ['maker-checkpoint', '制作者检查点', 'Maker Checkpoint', '工具箱锁扣保存最近坐标。',
            'A toolbox clasp preserves the latest coordinate.'
        ]
    ]],
    ['dawn', [
        ['first-light-room', '初光室', 'First-Light Room', '晨光只照亮当前开放门。',
            'First light illuminates currently open doors only.'
        ],
        ['quiet-kept-hall', '留静走廊', 'Quiet-Kept Hall', '墙面刻痕保存已经走过的安静。',
            'Wall marks preserve quiet gathered along the route.'
        ],
        ['return-window', '归返窗室', 'Return Window Room', '窗台脚印指向最近检查点。',
            'Sill prints point toward the latest checkpoint.'
        ],
        ['unhurried-turn', '不催促转角', 'Unhurried Corner', '转角没有倒计时，所有出口保持稳定。',
            'The corner has no timer and every exit remains stable.'
        ],
        ['dawn-door', '黎明门厅', 'Dawn Door Hall', '门框确认终点相邻，却不自动替玩家移动。',
            'The frame confirms goal adjacency without moving for the player.'
        ]
    ]]
];

const rooms = motifs.flatMap(([motif, entries]) => entries.map(([id, titleZh, titleEn,
    descriptionZh, descriptionEn
]) => Object.freeze({
    id,
    motif,
    titleZh,
    titleEn,
    descriptionZh,
    descriptionEn
})));

const events = [
    ['borrowed-step', '借来一步', 'Borrowed Step', '下一次合法移动不消耗普通步数预算。',
        'The next legal move does not consume the ordinary move budget.'
    ],
    ['echoed-corner', '回声转角', 'Echoed Corner', '系统重复上一房间的出口数量。',
        'The system repeats the prior room’s exit count.'
    ],
    ['quiet-checkpoint', '安静检查点', 'Quiet Checkpoint', '当前位置被保存为安全恢复点。',
        'The current location becomes a safe recovery point.'
    ],
    ['chalk-return', '粉笔回返', 'Chalk Return', '一个已验证死路获得可见标记。',
        'One verified dead end receives a visible mark.'
    ],
    ['mist-lift', '雾幕升起', 'Mist Lift', '当前房间的触觉方向标签变得清楚。',
        'Tactile direction labels become clear in the current room.'
    ],
    ['lantern-rest', '提灯休息', 'Lantern Rest', '提示资源不变，界面短暂显示本地摘要。',
        'Hint resources stay unchanged while a local summary appears.'
    ],
    ['map-fold', '地图折角', 'Map Fold', '已访问格按行列重新排列显示，不改变结构。',
        'Visited cells change display order without changing structure.'
    ],
    ['bell-count', '铃声计数', 'Bell Count', '铃声确认当前开放出口数量。',
        'A bell confirms the number of currently open exits.'
    ],
    ['safe-backtrack', '安全折返', 'Safe Backtrack', '来路获得明确返回标签。',
        'The arrival path receives an explicit return label.'
    ],
    ['window-rain', '窗雨掠过', 'Window Rain', '远景被遮住，本地出口保持可见。',
        'Distant scenery hides while local exits remain visible.'
    ],
    ['page-marker', '书页标记', 'Page Marker', '访问顺序写入只读路线日志。',
        'Visit order enters the read-only route log.'
    ],
    ['tide-line', '潮线升降', 'Tide Line', '水线展示当前位置与起点的曼哈顿距离，不指示方向。',
        'A tide line shows Manhattan distance from start without indicating direction.'
    ],
    ['warm-stone', '暖石停留', 'Warm Stone Pause', '本回合只保存状态，不触发惩罚。',
        'This turn saves state without penalty.'
    ],
    ['bird-call', '鸟鸣应答', 'Birdcall Answer', '鸟鸣复述已走过的最后两个方向。',
        'A birdcall repeats the last two traveled directions.'
    ],
    ['ticket-stamp', '车票盖章', 'Ticket Stamp', '当前主题写入梦境日志。',
        'The current motif enters the dream log.'
    ],
    ['tool-shadow', '工具影子', 'Tool Shadow', '影长对应一个本地开放方向。',
        'A shadow length corresponds to one locally open direction.'
    ],
    ['dew-note', '露珠便签', 'Dew Note', '一条已访问支路获得注记。', 'One visited branch receives a note.'],
    ['clockfruit-rest', '钟果停拍', 'Clockfruit Rest', '计时展示暂停，服务器时钟仍保持权威。',
        'The display timer pauses while server time remains authoritative.'
    ],
    ['paper-crane', '纸鹤回望', 'Paper Crane Lookback', '纸鹤朝向上个检查点。',
        'A paper crane faces the previous checkpoint.'
    ],
    ['soft-foghorn', '柔雾笛', 'Soft Foghorn', '低声确认是否存在多个出口。',
        'A soft tone confirms whether multiple exits exist.'
    ],
    ['empty-envelope', '空信封', 'Empty Envelope', '界面提供一次不改变状态的回顾。',
        'The interface offers one state-neutral recap.'
    ],
    ['rail-vibration', '轨道轻震', 'Rail Vibration', '振动次数对应已访问相邻房间数。',
        'Vibration count equals visited adjacent rooms.'
    ],
    ['glass-reflection', '玻璃倒影', 'Glass Reflection', '倒影显示来路坐标。',
        'The reflection shows the arrival coordinate.'
    ],
    ['folded-rope', '折叠绳结', 'Folded Rope Knot', '最近三次合法移动被压缩成短日志。',
        'The last three legal moves become a compact log.'
    ],
    ['quiet-radio', '安静电台', 'Quiet Radio', '广播排除一条当前死路。',
        'The radio rules out one current dead end.'
    ],
    ['seedling-sign', '幼苗标牌', 'Seedling Sign', '标牌显示本地房间标题与说明。',
        'A sign displays the local room title and description.'
    ],
    ['snowprint', '铜雪脚印', 'Copper-Snow Print', '脚印确认当前格曾访问次数。',
        'A footprint confirms the current cell’s visit count.'
    ],
    ['oven-echo', '烤炉回声', 'Oven Echo', '回声复述上一次动作是否合法。',
        'An oven echo repeats whether the prior action was legal.'
    ],
    ['aurora-groove', '极光凹槽', 'Aurora Groove', '静态纹理突出全部合法方向。',
        'Static texture emphasizes every legal direction.'
    ],
    ['dawn-breath', '黎明呼吸', 'Dawn Breath', '抵近终点时显示无方向的距离提示。',
        'Near the goal, a directionless distance cue appears.'
    ]
].map(([id, titleZh, titleEn, descriptionZh, descriptionEn]) => Object.freeze({
    id,
    titleZh,
    titleEn,
    descriptionZh,
    descriptionEn
}));

if (rooms.length !== 100 || events.length !== 30) throw new TypeError(
    'Dream Maze requires 100 rooms and 30 events');

module.exports = Object.freeze({
    rooms: Object.freeze(rooms),
    events: Object.freeze(events)
});