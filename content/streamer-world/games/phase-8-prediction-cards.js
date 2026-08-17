'use strict';

const groups = [{
        choicesZh: ['守门', '探路', '记录'],
        choicesEn: ['guard', 'scout', 'record'],
        cards: [
            ['lantern-ruins-role', '进入灯笼遗迹时，你先承担哪种队伍职责？',
                'Which team role do you take first inside the lantern ruins?'
            ],
            ['rain-citadel-role', '雨城警报响起后，哪种职责最适合第一回合？',
                'Which role best fits the first turn after the rain-citadel alarm?'
            ],
            ['cloud-vault-role', '云端保险库开门时，你会选哪份虚构工作？',
                'Which fictional job do you choose when the cloud vault opens?'
            ]
        ]
    },
    {
        choicesZh: ['木桥', '渡船', '缆车'],
        choicesEn: ['wood bridge', 'ferry', 'cable car'],
        cards: [
            ['moss-river-crossing', '苔河没有危险，只是很慢；你选哪种过河方式？',
                'The moss river is safe but slow; how do you cross?'
            ],
            ['moon-canal-crossing', '月面运河提供三条同样安全的路线，你偏向哪条？',
                'The lunar canal offers three equally safe routes; which do you prefer?'
            ],
            ['paper-gorge-crossing', '纸峡谷会在黄昏折起，你从哪里通过？',
                'The paper gorge folds at dusk; how do you pass through?'
            ]
        ]
    },
    {
        choicesZh: ['地图', '口令', '工具'],
        choicesEn: ['map', 'password', 'tool'],
        cards: [
            ['archive-keepsake', '离开虚构档案馆时，只能带走哪类纪念品？',
                'Which kind of keepsake do you take from the fictional archive?'
            ],
            ['tram-lost-found', '末班电车失物处允许认领一种游戏道具，你选什么？',
                'The last-tram lost-and-found offers one game prop; what do you claim?'
            ],
            ['island-cache', '安全岛屿的宝箱里，哪件物品最吸引你？',
                'Which item most interests you in the safe island cache?'
            ]
        ]
    },
    {
        choicesZh: ['先观察', '先询问', '先试一次'],
        choicesEn: ['observe first', 'ask first', 'try once'],
        cards: [
            ['clockwork-puzzle-opening', '面对发条谜盒，你会怎样开始？',
                'How do you begin with a clockwork puzzle box?'
            ],
            ['friendly-dragon-repair', '友善小龙递来损坏风筝时，你先做什么？',
                'What do you do first when a friendly dragon brings a broken kite?'
            ],
            ['silent-console-opening', '无声控制台亮起三枚按钮时，你采用哪种开局？',
                'Which opening do you use when three buttons light on a silent console?'
            ]
        ]
    },
    {
        choicesZh: ['晨雾', '松针', '雨石'],
        choicesEn: ['morning mist', 'pine needles', 'rainy stone'],
        cards: [
            ['imaginary-bakery-scent', '星星面包房可以保留一种虚构香气，你选哪种？',
                'Which imaginary aroma should the star bakery preserve?'
            ],
            ['memory-bottle-scent', '记忆瓶不记录真人，只装一种故事气味；你选什么？',
                'The memory bottle stores no real person, only a story scent; which one?'
            ],
            ['forest-radio-scent', '森林电台用气味标记频道，你希望自己的频道是哪种？',
                'The forest radio labels channels by scent; which marks yours?'
            ]
        ]
    },
    {
        choicesZh: ['短喜剧', '谜案剧', '旅行纪录'],
        choicesEn: ['short comedy', 'mystery', 'travel documentary'],
        cards: [
            ['paper-cinema-program', '纸幕影院今晚只放一部虚构短片，你选哪类？',
                'The paper cinema screens one fictional short tonight; which genre?'
            ],
            ['cloud-projector-program', '云投影仪还有一格电量，你播放什么？',
                'The cloud projector has one charge left; what do you screen?'
            ],
            ['tram-tunnel-program', '长隧道里可以看一种车窗故事，你挑哪种？',
                'Which window story do you watch during the long tram tunnel?'
            ]
        ]
    },
    {
        choicesZh: ['安静谢幕', '共同谢幕', '开放结尾'],
        choicesEn: ['quiet bow', 'shared bow', 'open ending'],
        cards: [
            ['lantern-stage-ending', '灯笼舞台的最后一幕怎样结束？',
                'How should the final scene on the lantern stage end?'
            ],
            ['whale-theatre-ending', '鲸背剧场到港前需要一个结尾，你选哪种？',
                'The whale theatre needs an ending before docking; which one?'
            ],
            ['winter-puppet-ending', '冬季木偶剧留下三种收尾，你希望保留什么？',
                'The winter puppet show offers three closings; which remains?'
            ]
        ]
    },
    {
        choicesZh: ['角落', '中心', '移动边线'],
        choicesEn: ['corner', 'center', 'moving edge'],
        cards: [
            ['tea-board-opening', '茶屋棋盘的虚构对局从哪里开局？',
                'Where do you open a fictional match on the tea-house board?'
            ],
            ['meteor-table-opening', '流星战术桌允许一种起始站位，你选哪处？',
                'Which starting position do you choose on the meteor tactics table?'
            ],
            ['garden-grid-opening', '花园网格里没有输家，你最想从哪里开始探索？',
                'The garden grid has no loser; where do you begin exploring?'
            ]
        ]
    },
    {
        choicesZh: ['纸星', '玻璃叶', '铜羽'],
        choicesEn: ['paper star', 'glass leaf', 'copper feather'],
        cards: [
            ['festival-badge', '虚构节庆给每位旅客一枚徽记，你要哪种？',
                'A fictional festival gives every traveler one badge; which do you take?'
            ],
            ['relay-token', '中继站纪念牌有三种安全材质，你喜欢哪枚？',
                'The relay souvenir comes in three safe materials; which do you like?'
            ],
            ['story-seal', '故事护照需要一枚印章，你选什么图案？',
                'A story passport needs one seal; which design do you choose?'
            ]
        ]
    },
    {
        choicesZh: ['慢慢走', '边走边聊', '轮流领路'],
        choicesEn: ['walk slowly', 'talk while walking', 'trade the lead'],
        cards: [
            ['aurora-ferry-pace', '极光渡船横越平静水面时，你喜欢哪种旅途节奏？',
                'Which travel rhythm suits a calm aurora ferry crossing?'
            ],
            ['orchard-path-pace', '钟果园的长路没有时限，你怎样前进？',
                'The clock-orchard path has no deadline; how do you travel?'
            ],
            ['cloud-stair-pace', '云阶会耐心等待，你选择哪种同行方式？',
                'The cloud stairs wait patiently; how do you climb together?'
            ]
        ]
    },
    {
        choicesZh: ['灯还亮着', '先听风声', '我们可暂停'],
        choicesEn: ['the lamp remains', 'listen to the wind', 'we may pause'],
        cards: [
            ['whisper-bridge-password', '低语桥需要一句安全故事口令，你选哪句？',
                'The whisper bridge needs a safe story password; which phrase?'
            ],
            ['fog-door-password', '雾门只接受不催促人的口令，你会说什么？',
                'The fog door accepts only a pressure-free password; what do you say?'
            ],
            ['quiet-vault-password', '安静金库要求一句允许退出的话，哪句最合适？',
                'The quiet vault asks for a phrase that permits leaving; which fits?'
            ]
        ]
    },
    {
        choicesZh: ['回声罗盘', '折叠绳', '记忆灯'],
        choicesEn: ['echo compass', 'folding rope', 'memory lamp'],
        cards: [
            ['maze-camp-upgrade', '梦迷宫营地能升级一种虚构工具，你选什么？',
                'Dream-maze camp can upgrade one fictional tool; which one?'
            ],
            ['archive-expedition-tool', '档案远足前，你会借用哪件安全道具？',
                'Which safe prop do you borrow before the archive expedition?'
            ],
            ['cloud-cave-tool', '云洞探险没有真实风险，你仍想带哪件工具？',
                'The cloud-cave trip has no real danger; which tool do you still bring?'
            ]
        ]
    },
    {
        choicesZh: ['加固中路', '保存能量', '放置信标'],
        choicesEn: ['fortify center', 'save energy', 'place beacon'],
        cards: [
            ['meteor-next-wave', '虚构流星下一波抵达前，你偏好哪种战术？',
                'Which tactic do you prefer before the next fictional meteor wave?'
            ],
            ['garden-defense-turn', '纸花园防守回合开始，你先安排什么？',
                'What do you arrange first in a paper-garden defense turn?'
            ],
            ['lantern-wall-plan', '灯墙模拟器给出三种安全计划，你选择哪种？',
                'The lantern-wall simulator offers three safe plans; which do you choose?'
            ]
        ]
    },
    {
        choicesZh: ['勇气', '好奇', '信任'],
        choicesEn: ['courage', 'curiosity', 'trust'],
        cards: [
            ['archive-seal-choice', '三枚虚构印章会开启不同档案，你按下哪枚？',
                'Three fictional seals open different archives; which do you press?'
            ],
            ['constellation-axis-choice', '星图需要一种关系轴作为标题，你选什么？',
                'A constellation needs one relationship axis as its title; which one?'
            ],
            ['storybook-compass-choice', '故事罗盘用三种品质指路，你愿意跟随哪种？',
                'A story compass follows one of three qualities; which guides you?'
            ]
        ]
    },
    {
        choicesZh: ['纸星雨', '蓝日出', '倒流极光'],
        choicesEn: ['paper-star rain', 'blue sunrise', 'reversed aurora'],
        cards: [
            ['winter-sky-watch', '冬季观测台今晚看哪种想象天象？',
                'Which imaginary sky event does the winter observatory watch tonight?'
            ],
            ['tram-roof-sky', '电车天窗将模拟一种天象，你选择什么？',
                'The tram skylight simulates one sky event; which do you choose?'
            ],
            ['garden-night-sky', '夜花园的灯群可以扮演哪种天空？',
                'Which sky should the night-garden lights portray?'
            ]
        ]
    },
    {
        choicesZh: ['草图', '旋律', '角色信'],
        choicesEn: ['sketch', 'melody', 'character letter'],
        cards: [
            ['dawn-studio-keepsake', '天亮前只能保存一种创作成果，你留下什么？',
                'You may save one creative result before dawn; which one?'
            ],
            ['paper-archive-keepsake', '纸档案柜还有一格，你放入哪种作品？',
                'One slot remains in the paper archive; what work do you store?'
            ],
            ['cloud-workshop-keepsake', '云工坊闭门时允许带走一种成果，你选什么？',
                'The cloud workshop lets you carry out one result at closing; which?'
            ]
        ]
    },
    {
        choicesZh: ['发光', '漂浮', '记录回声'],
        choicesEn: ['glow', 'float', 'record echoes'],
        cards: [
            ['fictional-cloak-power', '给虚构角色的披风选择一种能力，你选什么？',
                'Choose one power for a fictional character’s cloak.'
            ],
            ['paper-boat-power', '纸船能获得一种无害能力，你会赋予哪种？',
                'Which harmless ability do you give a paper boat?'
            ],
            ['garden-umbrella-power', '花园雨伞可以有一种魔法功能，你选哪项？',
                'Which magical function should a garden umbrella have?'
            ]
        ]
    },
    {
        choicesZh: ['沿石路', '跟风铃', '等待露水'],
        choicesEn: ['follow stones', 'follow chimes', 'wait for dew'],
        cards: [
            ['garden-robot-route', '花园机器人采用哪种不伤植物的巡逻方式？',
                'Which plant-safe patrol does the garden robot use?'
            ],
            ['moon-cat-route', '虚构月猫要穿过温室，你为它选哪条路线？',
                'Which route do you choose for a fictional moon cat crossing the greenhouse?'
            ],
            ['tiny-tram-route', '玩具电车驶过花圃时该遵循哪种导航？',
                'Which navigation should a toy tram follow through the garden?'
            ]
        ]
    },
    {
        choicesZh: ['旧日自己', '未来城市', '未知朋友'],
        choicesEn: ['past self', 'future city', 'unknown friend'],
        cards: [
            ['comet-letter-destination', '彗星邮局的一封虚构信寄往哪里？',
                'Where should one fictional comet-post letter go?'
            ],
            ['whale-post-destination', '鲸背邮局允许选择一个故事收件地，你选哪里？',
                'Which story destination do you choose at the whale post?'
            ],
            ['clock-letter-destination', '时钟信箱能把一封想象来信送到何处？',
                'Where should the clock mailbox send an imaginary letter?'
            ]
        ]
    },
    {
        choicesZh: ['鲸歌天气', '珊瑚故事', '潜艇谜语'],
        choicesEn: ['whale weather', 'coral stories', 'submarine riddles'],
        cards: [
            ['undersea-radio-show', '海底电台今晚播哪档虚构节目？',
                'Which fictional show airs on the undersea radio tonight?'
            ],
            ['rainbarrel-radio-show', '雨桶收音机只接收一个频道，你调到哪档？',
                'The rain-barrel radio receives one channel; which do you tune in?'
            ],
            ['moonpool-radio-show', '月池广播站需要一份夜间节目，你选择什么？',
                'The moonpool station needs a night program; which do you choose?'
            ]
        ]
    },
    {
        choicesZh: ['地图册', '诗集', '谜案簿'],
        choicesEn: ['atlas', 'poetry', 'casebook'],
        cards: [
            ['sky-library-book', '天空图书馆允许借走一种书，你选哪类？',
                'The sky library lets you borrow one kind of book; which?'
            ],
            ['tram-shelf-book', '末班电车书架上只剩三个分类，你读什么？',
                'Three categories remain on the last-tram shelf; what do you read?'
            ],
            ['lighthouse-night-book', '灯塔夜班有一段安静阅读时间，你拿哪本？',
                'The lighthouse night shift includes quiet reading; which book do you take?'
            ]
        ]
    },
    {
        choicesZh: ['云饼', '雨铃糖', '晴光茶'],
        choicesEn: ['cloud biscuit', 'rain-bell candy', 'sunlight tea'],
        cards: [
            ['clockwork-picnic-snack', '发条野餐提供三种完全虚构的点心，你选什么？',
                'A clockwork picnic offers three entirely fictional treats; which do you choose?'
            ],
            ['star-cafe-snack', '星光咖啡馆的故事菜单上，你点哪份？',
                'Which story-menu item do you order at the starlight café?'
            ],
            ['tram-lunchbox-snack', '玩具电车餐盒里，你最想打开哪格？',
                'Which compartment do you open in the toy-tram lunchbox?'
            ]
        ]
    },
    {
        choicesZh: ['环形港', '静默园', '纸鹤台'],
        choicesEn: ['Ring Harbor', 'Quiet Garden', 'Crane Platform'],
        cards: [
            ['moon-tram-stop', '月面电车末班车停在哪座虚构车站？',
                'Which fictional station should the last moon tram visit?'
            ],
            ['cloud-bus-stop', '云公交可以增设一个站名，你选择哪里？',
            'Which stop should the cloud bus add?'],
            ['paper-rail-stop', '纸轨列车给你一张自由下车票，你在哪里下车？',
                'Where do you use a free-stop ticket on the paper railway?'
            ]
        ]
    },
    {
        choicesZh: ['先画图', '先试装', '先问伙伴'],
        choicesEn: ['draw first', 'prototype first', 'ask a partner'],
        cards: [
            ['dragon-kite-repair', '友善小龙的风筝坏了，你怎样开始修？',
                'A friendly dragon’s kite is broken; how do you begin repairing it?'
            ],
            ['tram-clock-repair', '玩具电车钟停摆后，你的第一步是什么？',
                'What is your first step when the toy-tram clock stops?'
            ],
            ['weather-vane-repair', '虚构风向仪卡住时，你偏好哪种开局？',
                'Which opening do you prefer when a fictional weather vane jams?'
            ]
        ]
    },
    {
        choicesZh: ['谨慎搜集', '快速探索', '合作解谜'],
        choicesEn: ['careful collecting', 'quick exploration', 'co-op solving'],
        cards: [
            ['mirror-quest-route', '镜中向导提供三条游戏路线，你走哪条？',
                'A mirror guide offers three game routes; which do you take?'
            ],
            ['archive-game-route', '档案模拟关有三种通关风格，你选什么？',
                'Which play style do you choose for an archive simulation?'
            ],
            ['cloud-dungeon-route', '无战斗云地城开放三种玩法，你偏好哪种？',
                'A combat-free cloud dungeon offers three styles; which do you prefer?'
            ]
        ]
    },
    {
        choicesZh: ['守灯', '绘图', '传信'],
        choicesEn: ['keep the lamp', 'draw maps', 'carry messages'],
        cards: [
            ['floating-town-job', '浮空小镇请你体验一份虚构工作，你选什么？',
                'Which fictional job do you try in a floating town?'
            ],
            ['night-harbor-job', '夜港庆典需要志愿角色，你想做哪种？',
                'Which volunteer role do you take at the night-harbor festival?'
            ],
            ['paper-city-job', '纸城的一日通行证附带一份工作，你选择什么？',
                'A paper-city day pass includes one job; which do you choose?'
            ]
        ]
    },
    {
        choicesZh: ['圆窗房', '屋顶帐篷', '移动车厢'],
        choicesEn: ['round-window room', 'rooftop tent', 'moving carriage'],
        cards: [
            ['imaginary-inn-room', '虚构旅店三间客房都安全，你住哪间？',
                'All three rooms at the imaginary inn are safe; which do you choose?'
            ],
            ['cloud-hostel-room', '云旅舍提供三种故事住宿，你选哪种？',
                'Which story lodging do you choose at the cloud hostel?'
            ],
            ['moon-camp-room', '月面营地今晚让你选择哪处休息点？',
                'Which resting place do you choose at the moon camp?'
            ]
        ]
    },
    {
        choicesZh: ['风铃', '水轮', '纸翼'],
        choicesEn: ['wind chimes', 'waterwheel', 'paper wings'],
        cards: [
            ['tiny-power-source', '玩具村庄用哪种虚构装置发电？',
                'Which fictional device powers the toy village?'
            ],
            ['garden-fountain-source', '花园喷泉需要一种温和动力，你挑什么？',
                'Which gentle power source should run the garden fountain?'
            ],
            ['lantern-boat-source', '灯船模型采用哪种推进方式？',
                'Which propulsion should the lantern-boat model use?'
            ]
        ]
    },
    {
        choicesZh: ['直线', '螺旋', '跳格'],
        choicesEn: ['straight', 'spiral', 'skip-step'],
        cards: [
            ['constellation-drawing-style', '画一张虚构星图时，你采用哪种连线风格？',
                'Which line style do you use for a fictional constellation?'
            ],
            ['sand-garden-pattern', '沙盘花园留下一种路径，你画什么？',
                'Which path do you draw in the sand garden?'
            ],
            ['window-rain-pattern', '窗雨游戏让你选择一种落点规律，你选什么？',
                'Which falling pattern do you choose in the window-rain game?'
            ]
        ]
    },
    {
        choicesZh: ['轮流', '同步', '自由接入'],
        choicesEn: ['alternate', 'synchronize', 'join freely'],
        cards: [
            ['duet-entry-style', '原创双奏的第二声部怎样加入？',
                'How should the second part enter an original duet?'
            ],
            ['relay-dialogue-style', '中继对话的三种节奏里，你偏好哪种？',
                'Which rhythm do you prefer for a relay dialogue?'
            ],
            ['coauthor-turn-style', '共同创作时，你选择哪种轮次方式？',
                'Which turn style do you choose for co-creation?'
            ]
        ]
    },
    {
        choicesZh: ['暖黄纹', '银白点', '蓝灰线'],
        choicesEn: ['warm-gold texture', 'silver dots', 'blue-gray lines'],
        cards: [
            ['fictional-room-palette', '不依赖纯颜色作答时，你偏好哪种房间纹理？',
                'Which room texture do you prefer when color is never the only cue?'
            ],
            ['story-banner-palette', '故事旗帜使用哪种带形状的配色？',
                'Which shape-backed palette should a story banner use?'
            ],
            ['tram-seat-palette', '玩具电车座椅选择哪种可触辨图案？',
                'Which tactile pattern should the toy-tram seats use?'
            ]
        ]
    },
    {
        choicesZh: ['早晨开放', '黄昏开放', '随到随开'],
        choicesEn: ['open at dawn', 'open at dusk', 'open on arrival'],
        cards: [
            ['fictional-shop-hours', '虚构小店采用哪种营业节奏？',
                'Which opening rhythm should a fictional shop keep?'
            ],
            ['cloud-library-hours', '云图书馆何时打开最有故事感？',
                'When should the cloud library open for the best story feeling?'
            ],
            ['moon-garden-hours', '月花园采用哪种不催促人的开放方式？',
                'Which pressure-free opening style suits the moon garden?'
            ]
        ]
    },
    {
        choicesZh: ['留原样', '修一角', '做副本'],
        choicesEn: ['leave intact', 'repair one corner', 'make a copy'],
        cards: [
            ['old-map-treatment', '遇到破旧虚构地图时，你怎样处理？',
                'How do you treat an old fictional map?'
            ],
            ['weathered-poster-treatment', '故事海报褪色后，你会选择哪种保存方式？',
                'How do you preserve a faded story poster?'
            ],
            ['paper-star-treatment', '纸星出现裂痕时，你愿意怎样修复？',
                'How would you mend a cracked paper star?'
            ]
        ]
    },
    {
        choicesZh: ['一盏灯', '一张椅', '一盆植物'],
        choicesEn: ['one lamp', 'one chair', 'one plant'],
        cards: [
            ['empty-room-first-item', '空房间只能先放一件虚构家具，你选什么？',
                'An empty room gets one fictional furnishing first; which?'
            ],
            ['studio-corner-first-item', '工作室角落留出一个位置，你放什么？',
                'One place remains in the studio corner; what do you put there?'
            ],
            ['tram-waiting-room-item', '电车候车室需要一件温和物品，你挑哪件？',
                'Which gentle item should enter the tram waiting room?'
            ]
        ]
    },
    {
        choicesZh: ['感谢', '提示', '庆祝'],
        choicesEn: ['thanks', 'clue', 'celebration'],
        cards: [
            ['inbox-message-kind', '结构化收件箱里，你最想先打开哪类虚构消息？',
                'Which fictional structured message do you open first?'
            ],
            ['relay-envelope-kind', '中继站送来三只预写信封，你选哪只？',
                'Which prewritten envelope do you choose at the relay station?'
            ],
            ['story-postcard-kind', '故事明信片可以承载一种内容，你选择什么？',
                'Which content should a story postcard carry?'
            ]
        ]
    },
    {
        choicesZh: ['保存进度', '写总结', '安静离开'],
        choicesEn: ['save progress', 'write recap', 'leave quietly'],
        cards: [
            ['session-closing-step', '一段虚构直播结束前，你优先做什么？',
                'What do you prioritize before a fictional broadcast closes?'
            ],
            ['game-night-closing-step', '游戏夜准备收灯时，你选择哪种结尾动作？',
                'Which closing action do you choose as game night winds down?'
            ],
            ['studio-closing-step', '工坊准备关门，你先完成哪件事？',
                'What do you finish first as the workshop closes?'
            ]
        ]
    },
    {
        choicesZh: ['一条长线', '三段短线', '点状路径'],
        choicesEn: ['one long line', 'three short lines', 'dotted path'],
        cards: [
            ['map-route-drawing', '给虚构岛屿画航路时，你偏爱哪种形状？',
                'Which route shape do you prefer on a fictional island map?'
            ],
            ['meteor-trail-drawing', '为无害流星画轨迹时，你选择什么形式？',
                'Which form do you choose for a harmless meteor trail?'
            ],
            ['garden-border-drawing', '花圃边界需要清楚可见，你怎样标记？',
                'How do you mark a clearly visible garden boundary?'
            ]
        ]
    },
    {
        choicesZh: ['纸页', '木牌', '玻璃片'],
        choicesEn: ['paper page', 'wooden sign', 'glass pane'],
        cards: [
            ['story-medium-choice', '短篇虚构故事写在哪种媒介上？',
                'Which medium holds a short fictional story?'
            ],
            ['archive-label-medium', '安全档案标签采用哪种材料？',
                'Which material should a safe archive label use?'
            ],
            ['quest-note-medium', '游戏任务提示刻在哪种道具上？', 'Which prop carries a game quest hint?']
        ]
    },
    {
        choicesZh: ['先左后右', '先近后远', '先低后高'],
        choicesEn: ['left then right', 'near then far', 'low then high'],
        cards: [
            ['fictional-sorting-rule', '虚构收藏架采用哪种简单排序？',
                'Which simple order should a fictional collection shelf use?'
            ],
            ['lantern-lighting-order', '灯群按什么次序亮起最舒服？',
                'Which order should the lantern group light in?'
            ],
            ['archive-tour-order', '档案参观路线采用哪种顺序？',
                'Which order should an archive tour follow?'
            ]
        ]
    },
    {
        choicesZh: ['单独完成', '邀请伙伴', '留待下次'],
        choicesEn: ['finish solo', 'invite partner', 'save for later'],
        cards: [
            ['optional-puzzle-plan', '遇到可选谜题时，你偏好哪种处理？',
                'How do you approach an optional puzzle?'
            ],
            ['crafting-project-plan', '虚构制作项目剩最后一步，你选择什么？',
                'A fictional craft has one step left; what do you choose?'
            ],
            ['story-sidepath-plan', '故事支线在旁边亮起时，你怎样决定？',
                'What do you do when a story side path appears?'
            ]
        ]
    },
    {
        choicesZh: ['轻提示', '完整示例', '再试一次'],
        choicesEn: ['small hint', 'full example', 'try again'],
        cards: [
            ['learning-support-choice', '学习原创节拍时，你偏好哪种支持？',
                'Which support do you prefer while learning an original rhythm?'
            ],
            ['maze-support-choice', '迷宫转角让你犹豫时，你选择什么帮助？',
                'Which help do you choose when a maze corner gives you pause?'
            ],
            ['craft-support-choice', '制作规则不清楚时，你想先获得什么？',
                'What do you want first when a crafting rule is unclear?'
            ]
        ]
    },
    {
        choicesZh: ['屋顶', '水边', '书架旁'],
        choicesEn: ['rooftop', 'waterside', 'beside shelves'],
        cards: [
            ['fictional-picnic-place', '故事野餐安排在哪里？',
                'Where should a story picnic take place?'
            ],
            ['quiet-conversation-place', '虚构角色在哪处进行安静谈话？',
                'Where should fictional characters hold a quiet conversation?'
            ],
            ['lantern-reading-place', '提灯阅读会选择哪处场地？',
                'Which place suits a lantern reading session?'
            ]
        ]
    },
    {
        choicesZh: ['风声', '钟声', '翻页声'],
        choicesEn: ['wind', 'bells', 'page turns'],
        cards: [
            ['ambient-sound-choice', '虚构房间保留哪种环境声音？',
                'Which ambient sound stays in a fictional room?'
            ],
            ['tram-sleep-sound', '玩具夜车使用哪种轻柔背景声？',
                'Which gentle background sound suits the toy night train?'
            ],
            ['cloud-garden-sound', '云花园的声音主题是什么？',
                'Which sound theme belongs in the cloud garden?'
            ]
        ]
    },
    {
        choicesZh: ['圆形', '拱形', '折线形'],
        choicesEn: ['round', 'arched', 'zigzag'],
        cards: [
            ['fictional-door-shape', '故事房间安装哪种门框？',
                'Which doorway shape belongs in a story room?'
            ],
            ['bridge-window-shape', '虚构桥塔采用哪种窗形？',
                'Which window shape suits a fictional bridge tower?'
            ],
            ['lantern-frame-shape', '手作灯笼选择哪种骨架？',
                'Which frame shape should a crafted lantern use?'
            ]
        ]
    },
    {
        choicesZh: ['一颗大星', '三颗小星', '一圈暗星'],
        choicesEn: ['one large star', 'three small stars', 'a ring of dim stars'],
        cards: [
            ['constellation-center-choice', '新星图的中心采用哪种构图？',
                'Which composition anchors a new constellation?'
            ],
            ['room-ceiling-choice', '虚构房间天花板放置哪种星群？',
                'Which star group belongs on a fictional room ceiling?'
            ],
            ['festival-sky-choice', '节庆纸幕上画哪种星形？',
                'Which star design goes on the festival paper screen?'
            ]
        ]
    },
    {
        choicesZh: ['先建入口', '先建出口', '先建休息点'],
        choicesEn: ['build entrance first', 'build exit first', 'build rest point first'],
        cards: [
            ['maze-design-priority', '设计安全迷宫时，你先放置什么？',
                'What do you place first when designing a safe maze?'
            ],
            ['story-map-priority', '画故事地图时，你优先确定什么？',
                'What do you establish first on a story map?'
            ],
            ['garden-path-priority', '规划虚构花园路径时，你先建哪处？',
                'Which place comes first in a fictional garden path plan?'
            ]
        ]
    },
    {
        choicesZh: ['星形扣', '叶形扣', '波纹扣'],
        choicesEn: ['star clasp', 'leaf clasp', 'wave clasp'],
        cards: [
            ['fictional-bag-clasp', '故事旅行包使用哪种搭扣？',
                'Which clasp should a story travel bag use?'
            ],
            ['archive-box-clasp', '档案盒选择哪种明显可触的扣件？',
                'Which tactile clasp belongs on an archive box?'
            ],
            ['craft-case-clasp', '制作工具盒最后装上哪种扣？', 'Which clasp finishes the crafting case?']
        ]
    },
    {
        choicesZh: ['写下来源', '写下感受', '保留空白'],
        choicesEn: ['record source', 'record feeling', 'leave blank'],
        cards: [
            ['memory-card-field', '虚构记忆卡只填一栏，你选择哪栏？',
                'A fictional memory card gets one field; which do you fill?'
            ],
            ['museum-label-field', '故事博物馆标签保留哪类信息？',
                'Which information stays on a story museum label?'
            ],
            ['letter-margin-field', '想象来信的页边可以加什么？',
                'What goes in the margin of an imaginary letter?'
            ]
        ]
    },
    {
        choicesZh: ['慢速教程', '普通挑战', '高难谜题'],
        choicesEn: ['gentle tutorial', 'standard challenge', 'expert puzzle'],
        cards: [
            ['fictional-game-mode', '今晚的虚构小游戏选择哪种难度？',
                'Which difficulty suits tonight’s fictional mini-game?'
            ],
            ['archive-simulation-mode', '档案模拟器以哪种模式启动？',
                'Which mode starts the archive simulator?'
            ],
            ['constellation-practice-mode', '星图练习采用哪种挑战强度？',
                'Which challenge level suits constellation practice?'
            ]
        ]
    },
    {
        choicesZh: ['共享一半', '各自保留', '完成后交换'],
        choicesEn: ['share half', 'keep separate', 'exchange after completion'],
        cards: [
            ['clue-sharing-style', '非对称谜题的线索怎样分配？',
                'How should clues be distributed in an asymmetric puzzle?'
            ],
            ['story-note-sharing-style', '共同故事笔记采用哪种共享方式？',
                'Which sharing style suits coauthored story notes?'
            ],
            ['map-fragment-sharing-style', '两张地图碎片什么时候交换？',
                'When should two map fragments be exchanged?'
            ]
        ]
    },
    {
        choicesZh: ['风筝', '小船', '纸鸟'],
        choicesEn: ['kite', 'little boat', 'paper bird'],
        cards: [
            ['fictional-messenger-choice', '故事消息由哪种道具传递？',
                'Which prop carries a story message?'
            ],
            ['festival-symbol-choice', '虚构节庆选择哪种移动标志？',
                'Which moving emblem suits a fictional festival?'
            ],
            ['weather-game-piece', '天气桌游使用哪种棋子？',
                'Which piece belongs in a weather board game?'
            ]
        ]
    },
    {
        choicesZh: ['开放参观', '预约参观', '只看副本'],
        choicesEn: ['open visit', 'scheduled visit', 'copies only'],
        cards: [
            ['fictional-archive-access', '故事档案馆采用哪种访问方式？',
                'Which access style suits a fictional archive?'
            ],
            ['mystery-exhibit-access', '谜案展柜如何让访客查看？',
                'How should visitors view the mystery exhibit?'
            ],
            ['star-map-room-access', '星图室采用哪种温和开放规则？',
                'Which gentle access rule belongs in the star-map room?'
            ]
        ]
    },
    {
        choicesZh: ['一小时后', '下一场景后', '由玩家决定'],
        choicesEn: ['after one hour', 'after next scene', 'player decides'],
        cards: [
            ['fictional-reminder-timing', '可选故事提醒何时再次出现？',
                'When should an optional story reminder return?'
            ],
            ['quest-postpone-timing', '虚构任务延期到何时最合适？',
                'When should a fictional quest postponement end?'
            ],
            ['game-invite-timing', '游戏邀请被暂缓后何时重现？',
                'When should a postponed game invitation reappear?'
            ]
        ]
    },
    {
        choicesZh: ['收藏展示', '故事解锁', '房间装饰'],
        choicesEn: ['collection display', 'story unlock', 'room decoration'],
        cards: [
            ['craft-output-purpose', '虚构制作成品优先用于什么？',
                'What is the first purpose of a fictional crafted item?'
            ],
            ['achievement-keepsake-purpose', '成就纪念物放在哪种非货币用途？',
                'Which non-monetary use suits an achievement keepsake?'
            ],
            ['game-token-purpose', '小游戏纪念牌应当用于什么？',
                'What should a mini-game token be used for?'
            ]
        ]
    },
    {
        choicesZh: ['先读标题', '先看图形', '先听摘要'],
        choicesEn: ['read title', 'inspect shape', 'hear summary'],
        cards: [
            ['story-entry-style', '进入新故事章节时，你先接收哪种线索？',
                'Which clue do you receive first in a new story episode?'
            ],
            ['mystery-card-entry', '打开谜案卡时，你先看什么？',
                'What do you inspect first on a mystery card?'
            ],
            ['collection-entry-style', '发现新收藏时，你先了解哪部分？',
                'What do you learn first about a new collectible?'
            ]
        ]
    },
    {
        choicesZh: ['保留分歧', '投票决定', '并列结局'],
        choicesEn: ['preserve disagreement', 'vote', 'parallel endings'],
        cards: [
            ['coauthor-disagreement', '共同创作出现分歧时，你偏好哪种安全处理？',
                'Which safe response do you prefer when coauthors disagree?'
            ],
            ['mystery-theory-disagreement', '两条推理路线都合理时，你怎样保留它们？',
                'How do you keep two plausible mystery theories?'
            ],
            ['map-route-disagreement', '伙伴选择不同路线时，系统该怎样处理？',
                'How should the system handle partners choosing different routes?'
            ]
        ]
    },
    {
        choicesZh: ['立刻显示', '回合后显示', '结束时显示'],
        choicesEn: ['show now', 'show after turn', 'show at end'],
        cards: [
            ['fictional-score-timing', '无奖励资格影响的友好分数何时显示？',
                'When should a harmless friendly score appear?'
            ],
            ['prediction-reveal-timing', '虚构猜心选择何时揭晓？',
                'When should fictional predictions be revealed?'
            ],
            ['duet-feedback-timing', '双奏节拍反馈在何时出现最舒服？',
                'When should duet timing feedback appear?'
            ]
        ]
    },
    {
        choicesZh: ['轻声提示', '视觉提示', '触觉提示'],
        choicesEn: ['soft audio cue', 'visual cue', 'tactile cue'],
        cards: [
            ['accessibility-cue-choice', '原创小游戏默认采用哪种可选提示？',
                'Which optional cue should an original mini-game offer by default?'
            ],
            ['maze-turn-cue-choice', '迷宫转角用哪种提示更适合你？',
                'Which cue suits a maze turn for you?'
            ],
            ['broadcast-event-cue', '宾果安全事件到达时，你希望怎样提示？',
                'How should a safe bingo event announce itself?'
            ]
        ]
    },
    {
        choicesZh: ['只看今天', '看本周', '查看归档'],
        choicesEn: ['today only', 'this week', 'archive'],
        cards: [
            ['journal-view-choice', '虚构任务日志首先打开哪个视图？',
                'Which view opens first in a fictional quest journal?'
            ],
            ['story-history-view', '故事历史默认展示哪个范围？',
                'Which range should story history show by default?'
            ],
            ['game-history-view', '小游戏历史页先显示什么？',
                'What should a mini-game history page show first?'
            ]
        ]
    },
    {
        choicesZh: ['自己保管', '伙伴保管', '共同封存'],
        choicesEn: ['keep it', 'partner keeps it', 'seal together'],
        cards: [
            ['fictional-key-custody', '故事钥匙由谁保管最有趣？',
                'Who should keep a fictional story key?'
            ],
            ['map-half-custody', '完整地图拼好后怎样保管？',
                'How should a completed fictional map be held?'
            ],
            ['memory-token-custody', '共同记忆牌解锁后放在哪里？',
                'Where should an unlocked shared-memory token remain?'
            ]
        ]
    },
    {
        choicesZh: ['清晨', '雨后', '深夜'],
        choicesEn: ['dawn', 'after rain', 'late night'],
        cards: [
            ['fictional-city-mood', '虚构城市在哪个时刻最吸引你？',
                'When is a fictional city most appealing?'
            ],
            ['story-harbor-mood', '故事港口采用哪种时间氛围？', 'Which time mood suits a story harbor?'],
            ['cloud-station-mood', '云站台的场景发生在何时？',
                'When should a scene at the cloud station occur?'
            ]
        ]
    },
    {
        choicesZh: ['保留脚印', '擦去脚印', '只留路标'],
        choicesEn: ['keep footprints', 'erase footprints', 'keep signs only'],
        cards: [
            ['dream-maze-trace', '梦迷宫该怎样记录走过的路线？',
                'How should a dream maze record the route traveled?'
            ],
            ['snow-garden-trace', '雪花园的虚构脚印如何处理？',
                'What should happen to fictional footprints in a snow garden?'
            ],
            ['archive-tour-trace', '档案参观结束后保留哪种路线信息？',
                'Which route information remains after an archive tour?'
            ]
        ]
    },
    {
        choicesZh: ['圆点', '短线', '空拍'],
        choicesEn: ['dot', 'dash', 'rest'],
        cards: [
            ['signal-cue-favorite', '原创信号谱中，你最喜欢哪种基本提示？',
                'Which basic cue do you prefer in an original signal score?'
            ],
            ['meteor-console-symbol', '流星控制台用哪种符号标记等待？',
                'Which symbol should mark waiting on a meteor console?'
            ],
            ['tram-code-symbol', '电车报码里，哪种符号最适合分隔？',
                'Which symbol best separates a tram code?'
            ]
        ]
    },
    {
        choicesZh: ['一人一句', '一人一段', '自由接续'],
        choicesEn: ['one sentence each', 'one paragraph each', 'free continuation'],
        cards: [
            ['story-weaver-turns', '结构化接龙采用哪种轮流方式？',
                'Which turn style should a structured story weave use?'
            ],
            ['letter-coauthor-turns', '共同写虚构来信时怎样轮流？',
                'How should partners alternate on a fictional letter?'
            ],
            ['radio-script-turns', '原创广播脚本采用哪种接写方式？',
                'Which continuation style suits an original radio script?'
            ]
        ]
    },
    {
        choicesZh: ['窗边', '门旁', '房间中央'],
        choicesEn: ['by window', 'beside door', 'room center'],
        cards: [
            ['crafted-lamp-placement', '手作灯最适合放在虚构房间哪里？',
                'Where should a crafted lamp go in a fictional room?'
            ],
            ['memory-frame-placement', '记忆相框摆在哪处最合适？',
                'Where should a fictional memory frame be placed?'
            ],
            ['quiet-sign-placement', '安静时段门牌安装在哪里最清楚？',
                'Where should a quiet-hours sign be placed?'
            ]
        ]
    },
    {
        choicesZh: ['保留名称', '改成昵称', '只留图标'],
        choicesEn: ['keep name', 'use nickname', 'icon only'],
        cards: [
            ['fictional-vehicle-label', '故事交通工具采用哪种标签？',
                'Which label style suits a story vehicle?'
            ],
            ['collection-card-label', '收藏卡片怎样显示虚构角色？',
                'How should a collection card label a fictional character?'
            ],
            ['map-station-label', '地图站点采用哪种命名方式？',
                'Which naming style belongs on map stations?'
            ]
        ]
    },
    {
        choicesZh: ['接受', '中性拒绝', '稍后决定'],
        choicesEn: ['accept', 'neutral decline', 'decide later'],
        cards: [
            ['fictional-game-invite', '收到无奖励惩罚的虚构游戏邀请时，你倾向什么？',
                'What do you prefer for a fictional game invite with no reward penalty?'
            ],
            ['story-letter-invite', '故事来信邀请你进入支线，你会怎么回应？',
                'How do you answer a story letter inviting you into a side route?'
            ],
            ['coauthor-invite', '接龙伙伴发来可选邀请时，你选什么？',
                'What do you choose for an optional coauthor invitation?'
            ]
        ]
    },
    {
        choicesZh: ['今天完成', '保存检查点', '结束本局'],
        choicesEn: ['finish today', 'save checkpoint', 'end run'],
        cards: [
            ['long-puzzle-boundary', '虚构长谜题进行到一半，你选择什么边界？',
                'A long fictional puzzle is halfway done; which boundary do you choose?'
            ],
            ['late-game-boundary', '小游戏时间变晚时，你偏好哪种处理？',
                'What do you prefer when a mini-game runs late?'
            ],
            ['story-session-boundary', '一段故事比预期更长，你如何收尾？',
                'How do you close a story session that runs longer than expected?'
            ]
        ]
    },
    {
        choicesZh: ['查看来源', '查看版本', '查看结果'],
        choicesEn: ['view source', 'view version', 'view result'],
        cards: [
            ['audit-detail-choice', '虚构审计记录中，你最先查看哪类字段？',
                'Which field do you inspect first in a fictional audit record?'
            ],
            ['content-history-choice', '内容历史页首先打开哪项信息？',
                'Which information opens first on a content history page?'
            ],
            ['reward-history-choice', '不涉及provider秘密的奖励历史先看什么？',
                'What do you inspect first in a provider-safe reward history?'
            ]
        ]
    },
    {
        choicesZh: ['并排展示', '轮流展示', '折叠收藏'],
        choicesEn: ['side by side', 'take turns', 'collapse into collection'],
        cards: [
            ['two-ending-display', '两个已获得故事结局怎样展示？',
                'How should two earned story endings be displayed?'
            ],
            ['craft-set-display', '一组手作收藏采用哪种展示方式？',
                'Which display style suits a crafted collection set?'
            ],
            ['duet-results-display', '双奏双方结果怎样呈现最公平？',
                'How should duet results be presented fairly?'
            ]
        ]
    },
    {
        choicesZh: ['不改变', '轻微变化', '完全重排'],
        choicesEn: ['unchanged', 'small variation', 'full rearrangement'],
        cards: [
            ['daily-maze-variation', '下一天的梦迷宫应该变化多少？',
                'How much should the next daily dream maze change?'
            ],
            ['season-board-variation', '下一周任务板采用哪种变化幅度？',
                'How much should next week’s quest board vary?'
            ],
            ['fictional-weather-variation', '故事天气在下一幕变化多少？',
                'How much should story weather change in the next scene?'
            ]
        ]
    },
    {
        choicesZh: ['一封信', '一枚徽章', '一个房间物件'],
        choicesEn: ['letter', 'badge', 'room object'],
        cards: [
            ['nonmoney-celebration', '完成虚构路线后，你喜欢哪种非货币庆祝？',
                'Which non-monetary celebration do you prefer after a fictional route?'
            ],
            ['co-op-keepsake', '共同通关后保留哪种纪念物？',
                'Which keepsake should remain after a co-op clear?'
            ],
            ['season-archive-keepsake', '季节归档时保存哪种固定收藏？',
                'Which fixed collectible belongs in a season archive?'
            ]
        ]
    }
];

const promptCards = groups.flatMap((group) => group.cards.map(([id, promptZh, promptEn]) => Object
    .freeze({
        id,
        promptZh,
        promptEn,
        choicesZh: Object.freeze([...group.choicesZh]),
        choicesEn: Object.freeze([...group.choicesEn])
    })));

if (promptCards.length < 180) throw new TypeError(
    `Expected at least 180 authored prediction cards, received ${promptCards.length}`);
if (new Set(promptCards.map((card) => card.promptZh)).size !== promptCards.length ||
    new Set(promptCards.map((card) => card.promptEn)).size !== promptCards.length) {
    throw new TypeError('Prediction prompts must be independently authored');
}

module.exports = Object.freeze(promptCards);