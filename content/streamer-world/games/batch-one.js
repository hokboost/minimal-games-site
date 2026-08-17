'use strict';

const mysteryDetails = require('./mystery-details');

function freezePack(pack) {
    const freeze = value => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        for (const nested of Object.values(value)) freeze(nested);
        return Object.freeze(value);
    };
    return freeze(pack);
}

const constellationRows = [
    ['lantern-wharf', '灯港回路', 'Lantern Wharf Circuit', '让潮汐灯塔与归航浮标重新相认。', 'Reconnect the tide lighthouse with the homebound buoy.', 5, 5, 8],
    ['paper-crane-arc', '纸鹤星弧', 'Paper Crane Arc', '绕过折翼区，把两枚纸鹤信标连成弧线。', 'Route around the folded-wing zone and join two crane beacons.', 5, 6, 9],
    ['tea-house-orbit', '茶屋轨道', 'Tea House Orbit', '为夜班茶屋恢复一条安静的环形供能线。', 'Restore a quiet orbital feed for the night-shift tea house.', 6, 6, 10],
    ['rain-bell-crossing', '雨铃交叉口', 'Rain Bell Crossing', '在两股雨声相撞前完成交叉线路。', 'Complete the crossing before two rain fronts collide.', 6, 6, 11],
    ['foxglove-switch', '狐尾草转辙', 'Foxglove Switch', '利用一次转辙把花圃与观测台接通。', 'Use one switch to connect the garden and observatory.', 6, 7, 12],
    ['blue-hour-bridge', '蓝时桥', 'Blue Hour Bridge', '沿暮色边缘铺设不惊动候鸟的线路。', 'Lay a route along dusk without disturbing migrating birds.', 7, 6, 12],
    ['echo-market-grid', '回声集市网', 'Echo Market Grid', '让四条摊位支线共享一段安全主干。', 'Give four market spurs one safe shared trunk.', 7, 7, 13],
    ['copper-kite-route', '铜风筝航路', 'Copper Kite Route', '避开静电云，把风筝牵回控制塔。', 'Guide the kite back to control through static clouds.', 7, 7, 14],
    ['moonwell-lattice', '月井晶格', 'Moonwell Lattice', '修补井口周围断裂的六边形节点。', 'Mend the broken lattice around the moonwell.', 7, 8, 15],
    ['library-comet', '图书馆彗线', 'Library Comet Line', '为移动书库留出一条可逆的彗尾通道。', 'Open a reversible comet-tail lane for the roaming library.', 8, 7, 15],
    ['harbor-choir', '港湾合唱线', 'Harbor Choir Line', '同步三座雾笛站的供能节拍。', 'Synchronize the power route for three foghorn stations.', 8, 8, 16],
    ['plum-rain-spiral', '梅雨螺旋', 'Plum Rain Spiral', '从螺旋外圈进入核心，不能切断排水节点。', 'Enter the spiral core without severing drainage nodes.', 8, 8, 17],
    ['glass-garden', '玻璃花园网', 'Glass Garden Web', '用最少转角绕开脆弱温室穹顶。', 'Use few turns while avoiding the fragile greenhouse dome.', 8, 9, 18],
    ['northwind-braid', '北风编线', 'Northwind Braid', '把两条反向线路编成互不干扰的绳结。', 'Braid opposing routes without interference.', 9, 8, 18],
    ['midnight-tram', '午夜电车星轨', 'Midnight Tram Track', '在末班车抵达前点亮全部换乘节点。', 'Light every transfer node before the last tram arrives.', 9, 9, 19],
    ['whisper-delta', '低语三角洲', 'Whisper Delta', '让支流信号汇合，却不覆盖救援频段。', 'Merge tributary signals without masking rescue traffic.', 9, 9, 20],
    ['aurora-loom', '极光织机', 'Aurora Loom', '按观测员提示织出一条颜色交替的通路。', 'Weave an alternating route from the observer’s clues.', 9, 10, 21],
    ['clocktower-veins', '钟塔脉络', 'Clocktower Veins', '在齿轮间恢复三段错时供能。', 'Restore three offset feeds between the gears.', 10, 9, 21],
    ['cloud-archive', '云档案回廊', 'Cloud Archive Gallery', '连接漂移档案舱并保留两条撤离线。', 'Connect drifting archive pods while preserving two exits.', 10, 10, 22],
    ['home-star-crown', '归星冠冕', 'Home Star Crown', '合上整季最复杂的冠形回路。', 'Close the season’s most intricate crown-shaped circuit.', 10, 10, 24]
];

const signalRows = [
    ['window-rain', '窗边雨点', 'Rain at the Window', '稀疏雨点留下宽阔呼吸间隔。', 'Sparse raindrops leave generous breathing space.', 72, 8],
    ['tram-chime', '电车铃', 'Tram Chime', '短短长的铃声适合练习交替接拍。', 'Short-short-long chimes teach alternating entries.', 78, 10],
    ['tea-kettle', '茶壶微鸣', 'Kettle Murmur', '渐密节拍像水温缓缓上升。', 'The pattern tightens like warming water.', 82, 12],
    ['paper-fan', '纸扇开合', 'Paper Fan', '轻拍与停顿组成对称小节。', 'Soft taps and rests form a mirrored measure.', 86, 12],
    ['harbor-lamps', '港灯轮值', 'Harbor Lamp Watch', '两侧灯塔用错拍回答彼此。', 'Twin lamps answer each other off the beat.', 90, 14],
    ['bamboo-shadow', '竹影拍', 'Bamboo Shadow', '切分节拍像风穿过竹叶。', 'Syncopation moves like wind through bamboo.', 94, 14],
    ['snow-postcard', '雪夜明信片', 'Snowy Postcard', '长音之间藏着三次轻触。', 'Three soft taps hide between sustained tones.', 98, 16],
    ['copper-clock', '铜钟摆', 'Copper Pendulum', '稳定拍点中穿插一次提前回应。', 'A steady pulse contains one early reply.', 102, 16],
    ['cloud-stairs', '云阶上行', 'Cloud Stair Ascent', '每组节拍都比上一组多一步。', 'Each phrase climbs one step beyond the last.', 106, 18],
    ['night-ferry', '夜渡信号', 'Night Ferry Signal', '低频引导，高频负责回声确认。', 'Low tones guide while high tones confirm.', 110, 18],
    ['firefly-canon', '萤火轮唱', 'Firefly Canon', '两位演奏者相隔一拍追逐旋律。', 'Two players chase the phrase one beat apart.', 114, 20],
    ['windmill-code', '风车报码', 'Windmill Code', '旋翼节奏每四拍改变重音。', 'The rotor shifts its accent every four beats.', 118, 20],
    ['bluebird-call', '蓝鸟问答', 'Bluebird Call', '短促问句需要一段完整回应。', 'A clipped call asks for a complete answer.', 122, 22],
    ['meteor-telegraph', '流星电报码', 'Meteor Telegraph', '高速点划仍保留清晰轮次。', 'Fast dots and dashes keep distinct turns.', 126, 22],
    ['garden-waltz', '花园三拍', 'Garden Waltz', '三拍循环里第二拍悄悄换手。', 'The second beat quietly changes hands.', 132, 24],
    ['mirror-drum', '镜面鼓点', 'Mirror Drum', '后半段严格倒放前半段节奏。', 'The second half mirrors the first in reverse.', 138, 24],
    ['aurora-pulse', '极光脉冲', 'Aurora Pulse', '色带变化提示不同强弱拍。', 'Color bands signal changing accents.', 144, 26],
    ['station-finale', '车站终曲', 'Station Finale', '进站广播、钟声与脚步形成三层节奏。', 'Announcements, bells, and footsteps form three layers.', 150, 28],
    ['starlit-fugue', '星夜赋格', 'Starlit Fugue', '两条独立声部在末尾精确汇合。', 'Independent lines meet exactly at the close.', 156, 30],
    ['dawn-duet', '黎明双奏', 'Dawn Duet', '从微弱心跳铺展成完整晨光合奏。', 'A faint heartbeat opens into a full dawn duet.', 164, 32]
];

const mysteryRows = [
    ['missing-lantern', '失踪的引航灯', 'The Missing Beacon', '码头灯在无风夜自行离位，三份值班记录互相矛盾。', 'A harbor lamp moved on a still night, and three watch logs disagree.'],
    ['silent-greenhouse', '无声温室', 'The Silent Greenhouse', '温室警铃没有响，但珍稀花粉出现在北门。', 'The greenhouse alarm stayed silent, yet rare pollen appeared at the north gate.'],
    ['borrowed-melody', '借来的旋律', 'The Borrowed Melody', '一段未发表旋律同时出现在两台离线终端。', 'An unpublished melody appeared on two offline terminals.'],
    ['clockwork-letter', '钟表匣来信', 'Letter in the Clockwork Box', '封存多年的钟表匣每天正午吐出新纸条。', 'A sealed clockwork box produces a fresh note every noon.'],
    ['ferry-without-shadow', '没有影子的渡船', 'The Shadowless Ferry', '监控拍到渡船靠岸，水位记录却说航道封闭。', 'Cameras show a ferry docking while tide logs say the channel was closed.'],
    ['blue-ink-footprints', '蓝墨脚印', 'Blue-Ink Footprints', '脚印从档案室中央开始，没有入口方向。', 'Footprints begin in the archive center with no path inside.'],
    ['vanishing-applause', '消失的掌声', 'The Vanishing Applause', '空剧场传出掌声，录音中却只有一次翻页。', 'Applause fills an empty theatre, but the recording holds one page turn.'],
    ['wrong-moon-map', '错月星图', 'The Wrong Moon Map', '新绘星图准确预测潮汐，却标着不存在的月相。', 'A new chart predicts tides while showing an impossible moon phase.'],
    ['sealed-tea-room', '封闭茶室', 'The Sealed Tea Room', '门窗封签完好，一杯热茶却在桌上逐渐变凉。', 'Every seal is intact, yet a hot cup cools on the table.'],
    ['radio-in-snow', '雪里的电台', 'Radio in the Snow', '废弃电台只在降雪时播报明日天气。', 'An abandoned radio predicts tomorrow only when snow falls.'],
    ['mirror-passenger', '镜中乘客', 'The Mirror Passenger', '列车员记得一位旅客，所有座位传感器都否认其存在。', 'The conductor recalls a passenger whom every seat sensor denies.'],
    ['orchard-key', '果园里的钥匙', 'The Orchard Key', '钥匙能打开仓库，却比那把锁早铸造五十年。', 'A key opens the storehouse despite predating its lock by fifty years.'],
    ['torn-weather-flag', '撕裂的风旗', 'The Torn Weather Flag', '风旗向东撕裂，当夜所有仪器记录西风。', 'The flag tore eastward while every instrument recorded a west wind.'],
    ['library-tide', '图书馆潮线', 'The Library Tide', '高层书页留下海水盐线，地下室却完全干燥。', 'Upper-floor books carry a salt line while the basement is dry.'],
    ['empty-bell-tower', '空钟塔', 'The Empty Bell Tower', '拆除钟锤后，钟声仍按旧班表响起。', 'The bell keeps its old schedule after the clapper is removed.'],
    ['double-booking', '重叠的预约', 'The Double Booking', '同一间工作室被两组人使用，双方都没见过对方。', 'Two groups used one studio at once without seeing each other.'],
    ['amber-message', '琥珀里的留言', 'Message in Amber', '新鲜语音被困在一块百年琥珀中。', 'A fresh voice message is trapped in century-old amber.'],
    ['north-platform', '北站台末班车', 'Last Train at North Platform', '车票显示列车准点，站钟却少走了七分钟。', 'The ticket says on time while the station clock lost seven minutes.'],
    ['paper-constellation', '纸上星座', 'The Paper Constellation', '孩子的涂鸦提前画出了尚未发现的星群。', 'A child’s drawing maps a cluster not yet discovered.'],
    ['archive-at-dawn', '黎明档案室', 'The Archive at Dawn', '所有旧案线索在日出时指向同一个未登记房间。', 'At sunrise, every cold-case clue points to one unregistered room.']
];

const weaverRows = [
    ['umbrella-station', '留在站台的红伞', 'The Red Umbrella Left Behind', '从一把无人认领的红伞开始，写出一次迟到的重逢。', 'Begin with an unclaimed red umbrella and build a belated reunion.'],
    ['moon-teashop', '月亮茶铺歇业日', 'The Moon Teashop’s Day Off', '解释月亮休息一天时，夜班城市如何互相照亮。', 'Explain how the night city lights itself when the moon takes a day off.'],
    ['whale-post', '鲸背邮局', 'Post Office on a Whale', '让一封无法投递的信改变鲸群的航线。', 'Let an undeliverable letter change the whales’ route.'],
    ['borrowed-shadow', '借来的影子', 'A Borrowed Shadow', '主人公必须在日落前把影子还给陌生人。', 'The protagonist must return a borrowed shadow before sunset.'],
    ['rain-museum', '雨滴博物馆', 'Museum of Raindrops', '一滴被错误标注的雨水揭开城市旧秘密。', 'A mislabeled raindrop uncovers an old city secret.'],
    ['last-paper-boat', '最后一只纸船', 'The Last Paper Boat', '纸船只能载走一句没有说出口的话。', 'A paper boat can carry away only one unspoken sentence.'],
    ['clock-seed', '钟表种子', 'Clockwork Seed', '一枚种子发芽后结出不同时间的果实。', 'A seed sprouts fruit from different moments in time.'],
    ['quiet-carnival', '安静的游园会', 'The Quiet Carnival', '所有游戏都没有声音，奖品却能唱出回忆。', 'Every attraction is silent, but the prizes sing memories.'],
    ['star-tailor', '星光裁缝店', 'Starlight Tailor', '裁缝用星光补好一件不愿被遗忘的旧外套。', 'A tailor mends a coat that refuses to be forgotten with starlight.'],
    ['river-elevator', '河流电梯', 'The River Elevator', '电梯每层停靠一条不同方向的河。', 'Each floor opens onto a river flowing another way.'],
    ['winter-radio', '冬季收音机', 'Winter Radio', '收音机只播放听众未来会错过的声音。', 'The radio plays only sounds its listener will someday miss.'],
    ['glass-bird', '玻璃鸟迁徙', 'Migration of Glass Birds', '脆弱鸟群要穿过一场不会停的冰雹。', 'A fragile flock must cross hail that never stops.'],
    ['midnight-gardener', '午夜园丁', 'The Midnight Gardener', '园丁种下秘密，清晨却收获别人的梦。', 'A gardener plants secrets and harvests strangers’ dreams.'],
    ['forgotten-platform', '被忘记的站台', 'The Forgotten Platform', '只有真心告别的人才能看见这座站台。', 'Only people saying a sincere goodbye can see this platform.'],
    ['cloud-librarian', '云层图书管理员', 'The Cloud Librarian', '管理员必须在暴雨前归还一本天气预报。', 'A librarian must return a forecast before the storm begins.'],
    ['copper-forest', '铜叶森林', 'The Copper Forest', '风吹过金属树叶时会重播失落的对话。', 'Metal leaves replay lost conversations when the wind moves through them.'],
    ['sleeping-lighthouse', '沉睡灯塔', 'The Sleeping Lighthouse', '唤醒灯塔会救一艘船，也会结束一场美梦。', 'Waking the lighthouse saves a ship but ends a beautiful dream.'],
    ['echo-baker', '回声面包师', 'The Echo Baker', '面包出炉时会说出揉面者最需要听的话。', 'Fresh bread speaks the words its maker most needs.'],
    ['map-without-north', '没有北方的地图', 'The Map Without North', '旅伴必须选择相信地图、星星或彼此。', 'Travelers must trust the map, the stars, or each other.'],
    ['dawn-workshop', '黎明工坊', 'Workshop at Dawn', '两位创作者用整夜留下的碎片造出第一束晨光。', 'Two makers assemble the first dawn from scraps left by the night.']
];

const craftingRows = [
    ['paper-moon-lamp', '纸月灯', 'Paper Moon Lamp', '折纸', 'folded-paper', '微光线', 'soft-light', '把柔光藏进可替换的月相灯罩。', 'A replaceable moon-phase shade holds a gentle light.'],
    ['harbor-windbell', '港风铃', 'Harbor Windbell', '铜片', 'copper-leaf', '潮线', 'tide-thread', '风铃会用不同音色提醒天气变化。', 'The chime changes tone when the weather shifts.'],
    ['tea-star-shelf', '茶星搁板', 'Tea-Star Shelf', '旧木', 'reclaimed-wood', '星钉', 'star-nail', '一块能稳稳收好夜班茶杯的小搁板。', 'A small shelf that keeps night-shift teacups secure.'],
    ['cloud-cushion', '云层坐垫', 'Cloud Cushion', '软棉', 'soft-cotton', '雾绒', 'mist-fiber', '坐下时会留下短暂云纹。', 'Sitting leaves a brief cloud pattern.'],
    ['constellation-mobile', '星座挂饰', 'Constellation Mobile', '银线', 'silver-thread', '玻璃星', 'glass-star', '挂饰会按房间里的脚步轻轻旋转。', 'The mobile turns gently with footsteps in the room.'],
    ['rain-window', '雨声窗', 'Rain-Sound Window', '玻璃片', 'glass-pane', '雨籽', 'rain-seed', '不下雨时也能保留一小段窗边雨声。', 'It preserves a little window rain on clear days.'],
    ['tram-clock', '电车钟', 'Tram Clock', '铜齿轮', 'copper-gear', '站牌木', 'station-wood', '钟面按末班车时刻温柔报时。', 'The clock chimes softly by the last-tram schedule.'],
    ['memory-frame', '回忆相框', 'Memory Frame', '旧木', 'reclaimed-wood', '回声砂', 'echo-sand', '相框不展示照片，只保存一句描述。', 'The frame keeps one description instead of a photograph.'],
    ['aurora-curtain', '极光帘', 'Aurora Curtain', '雾绒', 'mist-fiber', '彩光线', 'aurora-thread', '拉开时会把晨光分成安静色带。', 'Morning light separates into quiet bands when opened.'],
    ['book-nook', '星夜书角', 'Starlit Book Nook', '旧木', 'reclaimed-wood', '微光线', 'soft-light', '给一本正在读的书留一处温暖角落。', 'A warm corner for the book currently being read.'],
    ['ferry-model', '渡船模型', 'Ferry Model', '站牌木', 'station-wood', '潮线', 'tide-thread', '小船会沿桌面的木纹缓慢转向。', 'The little ferry turns slowly with the grain of the table.'],
    ['firefly-jar', '萤火罐', 'Firefly Jar', '玻璃片', 'glass-pane', '微光线', 'soft-light', '光点只在房间安静时出现。', 'Lights appear only when the room becomes quiet.'],
    ['garden-sign', '夜花圃标牌', 'Night Garden Sign', '站牌木', 'station-wood', '雨籽', 'rain-seed', '湿润时会显出植物的双语名字。', 'Plant names appear bilingually when the sign is damp.'],
    ['echo-rug', '回声地毯', 'Echo Rug', '软棉', 'soft-cotton', '回声砂', 'echo-sand', '地毯会把急促脚步变成舒缓节奏。', 'The rug turns hurried footsteps into a calmer rhythm.'],
    ['meteor-hooks', '流星挂钩', 'Meteor Hooks', '铜片', 'copper-leaf', '星钉', 'star-nail', '一排适合挂小工具的弧形亮钩。', 'A bright curved row for small tools.'],
    ['weather-vane', '桌面风向仪', 'Desk Weather Vane', '铜齿轮', 'copper-gear', '玻璃星', 'glass-star', '它指向房间里最需要通风的角落。', 'It points toward the corner most in need of fresh air.'],
    ['story-board', '接龙故事板', 'Story-Weaver Board', '折纸', 'folded-paper', '站牌木', 'station-wood', '卡槽能保存尚未决定的故事分支。', 'Card slots preserve story branches not yet chosen.'],
    ['duet-stand', '双奏谱架', 'Duet Music Stand', '银线', 'silver-thread', '铜片', 'copper-leaf', '两侧谱页都能看到自己的节拍提示。', 'Each side shows its own rhythm cues.'],
    ['mystery-cabinet', '谜案抽屉柜', 'Mystery Cabinet', '旧木', 'reclaimed-wood', '玻璃片', 'glass-pane', '透明抽屉让线索分类保持清楚。', 'Clear drawers keep evidence categories visible.'],
    ['home-constellation', '归家星图墙', 'Home Constellation Wall', '彩光线', 'aurora-thread', '星钉', 'star-nail', '完成的协作路线会变成墙上的柔光轨迹。', 'Completed co-op routes become soft trails on the wall.']
];

function constellationChallenge(row, index) {
    const [id, titleZh, titleEn, briefZh, briefEn, width, height, budget] = row;
    return { id, titleZh, titleEn, briefZh, briefEn, width, height, budget, seed: 1103 + index * 97 };
}

function signalChallenge(row, index) {
    const [id, titleZh, titleEn, briefZh, briefEn, bpm, beats] = row;
    return { id, titleZh, titleEn, briefZh, briefEn, bpm, beats, seed: 2207 + index * 131 };
}

function mysteryChallenge(row, index) {
    const [id, titleZh, titleEn, briefZh, briefEn] = row;
    return { id, titleZh, titleEn, briefZh, briefEn, ...mysteryDetails[id], seed: 3301 + index * 149 };
}

function weaverChallenge(row, index) {
    const [id, titleZh, titleEn, briefZh, briefEn] = row;
    return { id, titleZh, titleEn, briefZh, briefEn, turns: 5 + index % 3, seed: 4409 + index * 157 };
}

function craftingChallenge(row, index) {
    const [id, titleZh, titleEn, materialAZh, materialA, materialBZh, materialB, briefZh, briefEn] = row;
    return { id, titleZh, titleEn, briefZh, briefEn, recipe: { [materialA]: 2 + index % 2, [materialB]: 1 }, materialLabels: { [materialA]: materialAZh, [materialB]: materialBZh } };
}

const packs = Object.freeze({
    'constellation-repair': freezePack({ gameId: 'constellation-repair', version: 'constellation-v1', challenges: constellationRows.map(constellationChallenge) }),
    'signal-duet': freezePack({ gameId: 'signal-duet', version: 'signal-v1', challenges: signalRows.map(signalChallenge) }),
    'mystery-board': freezePack({ gameId: 'mystery-board', version: 'mystery-v1', challenges: mysteryRows.map(mysteryChallenge) }),
    'story-weaver': freezePack({ gameId: 'story-weaver', version: 'weaver-v1', challenges: weaverRows.map(weaverChallenge) }),
    'studio-crafting': freezePack({ gameId: 'studio-crafting', version: 'crafting-v1', challenges: craftingRows.map(craftingChallenge) })
});

module.exports = packs;
