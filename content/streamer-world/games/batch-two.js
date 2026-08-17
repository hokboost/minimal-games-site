'use strict';

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

const meteorRows = [
    ['harbor-watch', '港湾初巡', 'Harbor First Watch', '守住归航灯列，让最后一班渡船安全靠岸。', 'Hold the homebound lights until the final ferry docks.', 3, 6, 'crosswind'],
    ['glass-orchard', '玻璃果园', 'Glass Orchard', '脆弱穹顶之间只有三条可用防线。', 'Only three defensive lanes remain between fragile domes.', 3, 7, 'fragile'],
    ['tram-rooftops', '电车屋顶线', 'Tram Rooftop Line', '流星沿高架转弯，炮台需要提前换道。', 'Meteors bend along the viaduct, demanding early lane changes.', 4, 7, 'switchback'],
    ['rain-reservoir', '雨库堤岸', 'Rain Reservoir Bank', '溢洪道会周期性削弱中路护盾。', 'The spillway periodically weakens the center shield.', 3, 8, 'flood'],
    ['paper-town', '纸城夜防', 'Paper Town Nightwatch', '不能让任何余火落进纸屋街区。', 'No ember may reach the paper-house district.', 4, 8, 'embers'],
    ['moonwell-ring', '月井环线', 'Moonwell Ring', '环形引力会把威胁推向相邻航道。', 'Ring gravity nudges threats into neighboring lanes.', 4, 9, 'gravity'],
    ['library-caravan', '书库车队', 'Library Caravan', '车队经过第三波后，落星强度会短暂上升。', 'After the caravan passes wave three, meteor strength briefly rises.', 4, 9, 'escort'],
    ['copper-kites', '铜风筝阵', 'Copper Kite Array', '静电云让连续使用同一路线变得危险。', 'Static clouds punish repeated use of one lane.', 5, 9, 'static'],
    ['tea-district', '茶街暖光', 'Tea District Glow', '蒸汽可为相邻防线提供一次缓冲。', 'Steam grants one buffer to neighboring defenses.', 4, 10, 'steam'],
    ['fog-choir', '雾笛合唱防线', 'Foghorn Choir Defense', '每第三波重音会让来袭强度增加一级。', 'Every third accented wave adds one level of incoming strength.', 5, 10, 'rotation'],
    ['north-platform', '北站台护送', 'North Platform Escort', '维修车进入密集站区时，每第三波会承受额外压力。', 'As the repair car enters the dense sector, every third wave gains pressure.', 5, 11, 'escort'],
    ['aurora-farm', '极光农场', 'Aurora Farm', '色带会放大支援信标，却干扰主炮。', 'Aurora bands amplify beacons while disrupting main turrets.', 5, 11, 'aurora'],
    ['clocktower-basin', '钟塔盆地', 'Clocktower Basin', '整点震动会清空尚未使用的临时能量。', 'Hourly tremors erase any unspent temporary energy.', 5, 12, 'tremor'],
    ['whisper-delta', '低语三角洲守望', 'Whisper Delta Watch', '三角洲侧流会让隔波威胁偏移到相邻水道。', 'Delta currents shift every other threat into a neighboring channel.', 5, 12, 'fork'],
    ['cloud-archive', '云档案护盾', 'Cloud Archive Shield', '漂移舱室让目标航道每两波改变一次。', 'Drifting pods move the protected lane every two waves.', 6, 12, 'drift'],
    ['meteor-garden', '流星花圃', 'Meteor Garden', '温室在每第三波更脆弱，需要提前积累防御。', 'The greenhouse is more fragile every third wave, rewarding advance defense.', 5, 13, 'salvage'],
    ['midnight-market', '午夜集市天幕', 'Midnight Market Canopy', '集市深处的周期冲击更强，每波仍只允许一次加固。', 'Periodic impacts deepen inside the market, while each wave still allows one fortification.', 6, 13, 'repair-limit'],
    ['blue-hour-bridge', '蓝时桥头堡', 'Blue Hour Bridgehead', '桥面每第三波放大冲击，有限共享能量必须均衡使用。', 'The bridge amplifies every third impact, so limited shared energy must be balanced.', 6, 14, 'balance'],
    ['constellation-yard', '星图调度场', 'Constellation Yard', '多批威胁会伪装强度，需要站主读出真值。', 'Several threats mask strength, requiring the keeper’s reading.', 6, 14, 'masked'],
    ['dawn-citadel', '黎明守望城', 'Dawn Watch Citadel', '在晨光抵达前完成最长的一次协同防守。', 'Complete the longest joint defense before daylight arrives.', 6, 16, 'finale']
];

const mazeRows = [
    ['moss-library', '苔藓书库梦', 'Moss Library Dream', '书架会在回头时悄悄交换位置。', 'Shelves quietly trade places whenever you turn back.', 'library'],
    ['rain-station', '雨夜站台梦', 'Rainy Platform Dream', '每张湿车票都指向不同出口。', 'Each rain-soaked ticket points toward another exit.', 'station'],
    ['paper-forest', '纸叶森林梦', 'Paper-Leaf Forest Dream', '折痕比道路更可靠。', 'Fold lines are more reliable than roads.', 'forest'],
    ['moon-kitchen', '月光厨房梦', 'Moonlit Kitchen Dream', '香气能标出刚刚走过的门。', 'Aroma marks the doorway just crossed.', 'kitchen'],
    ['silent-carnival', '无声游园梦', 'Silent Carnival Dream', '旋转木马停下时才会出现楼梯。', 'Stairs appear only when the carousel stops.', 'carnival'],
    ['glass-river', '玻璃河梦', 'Glass River Dream', '透明水面映出尚未抵达的房间。', 'The clear river reflects rooms not yet reached.', 'river'],
    ['clock-orchard', '钟果园梦', 'Clock Orchard Dream', '成熟果实会借出一次额外步伐。', 'Ripe clock-fruit lends one additional step.', 'orchard'],
    ['whale-post', '鲸背邮局梦', 'Whale Post Dream', '未寄出的信会改变潮汐方向。', 'Unsent letters alter the direction of the tide.', 'post'],
    ['copper-snow', '铜雪庭院梦', 'Copper Snow Courtyard', '脚印会在金属雪面保持一整夜。', 'Footprints remain all night in metallic snow.', 'courtyard'],
    ['echo-bakery', '回声面包房梦', 'Echo Bakery Dream', '炉门里的回声提示安全转角。', 'Echoes from the oven hint at safe corners.', 'bakery'],
    ['bluebird-attic', '蓝鸟阁楼梦', 'Bluebird Attic Dream', '只有没有编号的窗户能够打开。', 'Only unnumbered windows will open.', 'attic'],
    ['fog-greenhouse', '雾温室梦', 'Fog Greenhouse Dream', '露珠记录着植物昨夜移动的轨迹。', 'Dew records where the plants moved overnight.', 'greenhouse'],
    ['tram-aquarium', '电车水族梦', 'Tram Aquarium Dream', '车厢与鱼群朝相反方向移动。', 'Carriages and fish move in opposite directions.', 'aquarium'],
    ['lantern-cave', '灯笼洞穴梦', 'Lantern Cave Dream', '熄灭的灯比亮灯更接近出口。', 'Unlit lanterns lie closer to the exit than bright ones.', 'cave'],
    ['star-laundry', '星光洗衣房梦', 'Starlight Laundry Dream', '晾衣绳把远处房门折叠到一起。', 'Clotheslines fold distant doors together.', 'laundry'],
    ['winter-radio', '冬季电台梦', 'Winter Radio Dream', '每次广播只描述一条错误道路。', 'Each broadcast describes exactly one wrong path.', 'radio'],
    ['tea-elevator', '茶香电梯梦', 'Tea Elevator Dream', '楼层按钮随茶温改变顺序。', 'Floor buttons reorder as the tea cools.', 'elevator'],
    ['mirror-harbor', '镜港梦', 'Mirror Harbor Dream', '倒影里的浮标保留真实方位。', 'Buoys in the reflection preserve the true bearing.', 'harbor'],
    ['aurora-workshop', '极光工坊梦', 'Aurora Workshop Dream', '颜色不是线索，工具影子的长度才是。', 'Color is not the clue; the tool shadows are.', 'workshop'],
    ['dawn-room', '黎明房间梦', 'The Dawn Room Dream', '最后一扇门要用沿途留下的安静打开。', 'The final door opens with the quiet gathered along the way.', 'dawn']
];

const bingoThemes = [
    ['warm-opening', '温柔开场', 'Warm Opening', '从问候、设备确认和安全暖场开始。', 'Begin with greetings, equipment checks, and a safe warm-up.'],
    ['music-practice', '练歌时刻', 'Music Practice', '记录经过确认的练习、复盘与休息节点。', 'Track confirmed practice, reflection, and rest moments.'],
    ['game-night', '游戏之夜', 'Game Night', '只记录站内确认的对局与协作事件。', 'Use only confirmed on-site match and co-op events.'],
    ['story-evening', '故事晚间', 'Story Evening', '让剧情选择与章节完成填满卡面。', 'Fill the card with story choices and episode clears.'],
    ['creative-desk', '创作书桌', 'Creative Desk', '收集安全创作流程里的小里程碑。', 'Collect small milestones from a safe creative process.'],
    ['community-care', '社区关照', 'Community Care', '确认礼貌提醒、感谢和健康暂停。', 'Confirm kind reminders, thanks, and healthy pauses.'],
    ['quiet-focus', '安静专注', 'Quiet Focus', '用可观察的站内专注行为组成一局。', 'Build a card from observable on-site focus actions.'],
    ['collab-lanterns', '协作灯列', 'Collaboration Lanterns', '记录接受邀请、轮流行动和共同完成。', 'Record accepted invitations, alternating turns, and joint clears.'],
    ['archive-search', '档案寻踪', 'Archive Search', '以谜案、线索和记忆解锁为主题。', 'Center the card on cases, clues, and memory unlocks.'],
    ['daily-rhythm', '每日节奏', 'Daily Rhythm', '登录、日迷宫与短练习形成轻量节奏。', 'Login, daily maze, and short practice create a gentle rhythm.'],
    ['season-watch', '季节守望', 'Season Watch', '追踪非货币季节进度与收藏发现。', 'Track non-monetary seasonal progress and collection finds.'],
    ['learning-loop', '学习循环', 'Learning Loop', '把尝试、提示、纠正和完成串起来。', 'Connect attempts, hints, corrections, and completions.'],
    ['kind-competition', '友好竞技', 'Kind Competition', '只使用无惩罚、无消费压力的挑战事件。', 'Use challenge events without punishment or spending pressure.'],
    ['studio-night', '工坊夜班', 'Studio Night', '材料、制作与布置事件组成工坊卡。', 'Materials, crafting, and placement form a studio card.'],
    ['memory-relay', '记忆接力', 'Memory Relay', '记录学习线索、交接与正确回声。', 'Record clue study, handoffs, and correct echoes.'],
    ['prediction-table', '猜心桌', 'Prediction Table', '使用虚构题卡的选择与揭晓事件。', 'Use choices and reveals from fictional prompt cards.'],
    ['meteor-shift', '流星轮班', 'Meteor Shift', '记录防线、支援与安全清场。', 'Track defenses, support, and safe wave clears.'],
    ['maze-notebook', '迷宫手账', 'Maze Notebook', '提示、资源与出口发现组成路线记录。', 'Hints, resources, and exit discoveries form the route.'],
    ['weekend-mix', '周末混合场', 'Weekend Mix', '从多种站内玩法抽取确认事件。', 'Draw confirmed events from several on-site activities.'],
    ['closing-lights', '收灯时刻', 'Closing Lights', '用总结、感谢、保存进度和正常结束收尾。', 'Close with recaps, thanks, saved progress, and a healthy finish.']
];

const safeEventKinds = deepFreeze([
    ['session.opened', '安全开场已确认', 'Safe opening confirmed'],
    ['session.break_taken', '完成一次健康暂停', 'Healthy break completed'],
    ['quest.step_completed', '任务步骤已由服务器确认', 'Quest step confirmed by the server'],
    ['story.choice_committed', '剧情选择已提交', 'Story choice committed'],
    ['story.episode_completed', '剧情章节已完成', 'Story episode completed'],
    ['game.run_completed', '站内对局已完成', 'On-site game run completed'],
    ['game.coop_turn', '协作回合已确认', 'Co-op turn confirmed'],
    ['game.hint_used', '安全提示已使用', 'Safe hint used'],
    ['collection.item_unlocked', '非货币收藏已解锁', 'Non-monetary collectible unlocked'],
    ['creator.thanks_shared', '感谢时刻已确认', 'Thank-you moment confirmed'],
    ['session.recap_saved', '本场总结已保存', 'Session recap saved'],
    ['session.closed_safely', '直播已正常结束', 'Session closed safely']
]);

const echoNames = [
    ['rain-chimes', '雨铃回声', 'Rain Chime Echo'], ['paper-stars', '纸星回声', 'Paper Star Echo'],
    ['tram-lights', '电车灯回声', 'Tram Light Echo'], ['tea-steam', '茶雾回声', 'Tea Steam Echo'],
    ['harbor-flags', '港旗回声', 'Harbor Flag Echo'], ['garden-steps', '花圃脚步', 'Garden Footsteps'],
    ['clock-birds', '钟鸟回声', 'Clockbird Echo'], ['cloud-books', '云书回声', 'Cloud Book Echo'],
    ['moon-shells', '月贝回声', 'Moon Shell Echo'], ['copper-leaves', '铜叶回声', 'Copper Leaf Echo'],
    ['snow-letters', '雪信回声', 'Snow Letter Echo'], ['ferry-bells', '渡船铃回声', 'Ferry Bell Echo'],
    ['aurora-tools', '极光工具影', 'Aurora Tool Shadows'], ['window-drops', '窗雨回声', 'Window Rain Echo'],
    ['library-keys', '书库钥匙声', 'Library Key Echo'], ['market-lanterns', '集市灯语', 'Market Lantern Echo'],
    ['orchard-clocks', '果园钟果', 'Orchard Clockfruit'], ['radio-sparks', '电台火花', 'Radio Spark Echo'],
    ['whale-postmarks', '鲸邮戳记', 'Whale Postmark Echo'], ['dawn-footprints', '黎明足迹', 'Dawn Footprint Echo']
];

const echoBriefs = [
    ['雨点击中六枚风铃后，编号只会留在主播一侧。', 'Rain strikes six chimes while their numbers remain only with the creator.'],
    ['折纸星沿两条轨道闪烁，伙伴各自保存一半顺序。', 'Paper stars blink on two tracks, leaving each partner half the order.'],
    ['电车窗灯用形状和站序交替传话。', 'Tram windows alternate shape and station order to carry the message.'],
    ['茶雾先遮住图案，再让另一侧读出边缘。', 'Tea steam hides each symbol before the other side reads its outline.'],
    ['港旗的颜色退去，只剩交错的轮廓需要共同复原。', 'Harbor flags lose their colors, leaving alternating silhouettes to rebuild together.'],
    ['花圃石板把奇数脚步与偶数脚步分给不同守望者。', 'Garden stones divide odd and even footsteps between the keepers.'],
    ['钟鸟在整点交换鸣声位置，记忆必须轮流接续。', 'Clockbirds swap call positions on the hour, demanding alternating recall.'],
    ['云书翻页时，一侧看到页角，另一侧看到符号。', 'As cloud books turn, one side sees corners and the other sees symbols.'],
    ['月贝开合形成短序列，潮声会掩去伙伴那一半。', 'Moon shells form a short sequence while the tide masks the partner half.'],
    ['铜叶落地的纹路与编号必须在两段记忆中拼合。', 'Copper-leaf veins and numbers must be joined from two memories.'],
    ['雪信上的印章隔行显现，不能由单方看到完整排列。', 'Stamps appear on alternating snow-letter lines, never as one complete view.'],
    ['渡船铃从两岸应答，每位玩家只听见自己岸边。', 'Ferry bells answer across the banks; each player hears only one shore.'],
    ['极光工具的影子按长短交错，颜色不会提供答案。', 'Aurora tools alternate long and short shadows; color gives no answer.'],
    ['窗雨把符号分进相邻水痕，刷新后仍保持同一序列。', 'Window rain splits symbols into neighboring trails that persist after refresh.'],
    ['书库钥匙先按齿形再按编号出现，双方分别守住一种线索。', 'Library keys appear by teeth then number, with each partner guarding one clue type.'],
    ['集市灯语穿过两条街巷，只有轮流复述才能完整返回。', 'Market lanterns cross two alleys and return only through alternating recall.'],
    ['果园钟果用成熟度替代颜色，顺序藏在两侧刻度中。', 'Orchard clockfruit uses ripeness instead of color, with order split across two scales.'],
    ['电台火花一闪即逝，奇偶频段分别交给两名守望者。', 'Radio sparks vanish instantly, assigning odd and even bands to separate keepers.'],
    ['鲸邮戳在浪峰与浪谷出现，伙伴各记住一套位置。', 'Whale postmarks surface on crests and troughs, giving each partner one set of positions.'],
    ['黎明足迹逐步褪色，最后一局要求最长的交替复原。', 'Dawn footprints fade one by one in the longest alternating reconstruction.']
];

const predictionScenes = [
    ['sky-library', '天空图书馆', 'Sky Library', '漂浮书库只允许带走一种故事。', 'A floating library lets you carry away one kind of story.', ['地图册', '诗集', '谜案簿'], ['atlas', 'poetry', 'mystery']],
    ['clockwork-picnic', '发条野餐', 'Clockwork Picnic', '三种发条点心会改变下午的天气。', 'Three clockwork snacks alter the afternoon weather.', ['云朵饼', '雨铃糖', '晴光茶'], ['cloud biscuit', 'rain candy', 'sun tea']],
    ['moon-tram', '月面电车', 'Moon Tram', '末班电车停在三座虚构车站。', 'The last tram stops at three fictional stations.', ['环形港', '静默园', '纸鹤台'], ['Ring Harbor', 'Quiet Garden', 'Crane Platform']],
    ['dragon-workshop', '小龙工坊', 'Little Dragon Workshop', '一只友善小龙请你挑选修理策略。', 'A friendly little dragon asks you to choose a repair strategy.', ['先画图', '先试装', '先问伙伴'], ['draw first', 'prototype first', 'ask a partner']],
    ['undersea-radio', '海底电台', 'Undersea Radio', '电台只能播出一种虚构节目。', 'The station can air one fictional program.', ['鲸歌天气', '珊瑚故事', '潜艇谜语'], ['whale weather', 'coral stories', 'submarine riddles']],
    ['star-bakery', '星星面包房', 'Star Bakery', '烤箱里出现三种不会真实食用的魔法香气。', 'The oven offers three imaginary aromas, with no real eating task.', ['晨雾', '松木', '雨后石板'], ['morning mist', 'pine wood', 'rainy stone']],
    ['mirror-quest', '镜中任务', 'Mirror Quest', '镜中向导给出三条游戏路线。', 'A mirror guide offers three game routes.', ['谨慎搜集', '快速探索', '合作解谜'], ['careful collecting', 'quick exploring', 'co-op solving']],
    ['cloud-tailor', '云朵裁缝店', 'Cloud Tailor', '只能给虚构角色选择一种披风功能。', 'Choose one cloak ability for a fictional character.', ['夜间发光', '雨中漂浮', '记录回声'], ['glow at night', 'float in rain', 'record echoes']],
    ['garden-robot', '花园机器人', 'Garden Robot', '机器人需要一种不伤害植物的巡逻方式。', 'A robot needs a plant-safe patrol style.', ['沿石路', '跟随风铃', '等待露水'], ['follow stones', 'follow chimes', 'wait for dew']],
    ['comet-post', '彗星邮局', 'Comet Post', '一封虚构来信可以送往三处。', 'A fictional letter can travel to one of three places.', ['旧日自己', '未来城市', '未知朋友'], ['past self', 'future city', 'unknown friend']],
    ['lantern-stage', '灯笼舞台', 'Lantern Stage', '舞台结尾需要一种创作选择。', 'The stage finale needs one creative choice.', ['安静谢幕', '共同合唱', '留开放结局'], ['quiet bow', 'shared chorus', 'open ending']],
    ['maze-camp', '迷宫营地', 'Maze Camp', '休整时只能升级一种虚构工具。', 'At camp, upgrade one fictional tool.', ['回声罗盘', '折叠绳', '记忆灯'], ['echo compass', 'folding rope', 'memory lamp']],
    ['meteor-command', '流星指挥台', 'Meteor Command', '下一波来临前选择一种战术。', 'Choose a tactic before the next wave.', ['加固中路', '保存能量', '请求支援'], ['fortify center', 'save energy', 'request support']],
    ['archive-door', '档案门', 'Archive Door', '三枚虚构印章会打开不同档案。', 'Three fictional seals open different archives.', ['勇气', '好奇', '信任'], ['courage', 'curiosity', 'trust']],
    ['winter-observatory', '冬季观测台', 'Winter Observatory', '今晚只观测一种想象天象。', 'Observe one imaginary sky event tonight.', ['纸星雨', '蓝色日出', '倒流极光'], ['paper-star rain', 'blue sunrise', 'reversed aurora']],
    ['tea-house-game', '茶屋棋局', 'Tea House Game', '虚构棋盘给出三种开局风格。', 'A fictional board offers three opening styles.', ['守住角落', '交换线索', '抢占中心'], ['hold corners', 'trade clues', 'take center']],
    ['whisper-bridge', '低语桥', 'Whisper Bridge', '过桥前选择一句安全的故事口令。', 'Choose a safe story password before crossing.', ['灯还亮着', '我们慢慢走', '先听风声'], ['the lamp remains', 'we can go slowly', 'listen to the wind']],
    ['paper-cinema', '纸幕影院', 'Paper Cinema', '今晚播放一种虚构短片。', 'Tonight screens one fictional short film.', ['失物喜剧', '星图悬疑', '云海纪录'], ['lost-item comedy', 'star-map mystery', 'cloud documentary']],
    ['aurora-ferry', '极光渡船', 'Aurora Ferry', '船票允许一种旅途节奏。', 'The ticket allows one travel rhythm.', ['一路聊天', '安静看景', '轮流讲故事'], ['talk throughout', 'watch quietly', 'trade stories']],
    ['dawn-studio', '黎明工作室', 'Dawn Studio', '天亮前保留一种创作成果。', 'Keep one creative result before dawn.', ['草图', '旋律', '角色信件'], ['sketch', 'melody', 'character letter']]
];

function pack(gameId, version, challenges, extras = {}) {
    return deepFreeze({ gameId, version, challenges, ...extras });
}

const meteor = meteorRows.map(([id, titleZh, titleEn, briefZh, briefEn, lanes, waves, modifier], index) => ({
    id, titleZh, titleEn, briefZh, briefEn, lanes, waves, modifier, seed: 6101 + index * 173
}));
const maze = mazeRows.map(([id, titleZh, titleEn, briefZh, briefEn, motif], index) => ({
    id, titleZh, titleEn, briefZh, briefEn, motif, seed: 7103 + index * 181
}));
const bingo = bingoThemes.map(([id, titleZh, titleEn, briefZh, briefEn], index) => ({
    id, titleZh, titleEn, briefZh, briefEn,
    eventKeys: Array.from({ length: 12 }, (_, offset) => safeEventKinds[(index * 5 + offset) % safeEventKinds.length][0])
}));
const echo = echoNames.map(([id, titleZh, titleEn], index) => ({
    id, titleZh, titleEn,
    briefZh: echoBriefs[index][0],
    briefEn: echoBriefs[index][1],
    seed: 9109 + index * 193
}));
const prediction = predictionScenes.map(([id, titleZh, titleEn, briefZh, briefEn, choicesZh, choicesEn], index) => ({
    id, titleZh, titleEn, briefZh, briefEn, choicesZh, choicesEn, seed: 10111 + index * 197
}));

module.exports = deepFreeze({
    'meteor-defense': pack('meteor-defense', 'meteor-v1', meteor),
    'dream-maze': pack('dream-maze', 'maze-v1', maze),
    'broadcast-bingo': pack('broadcast-bingo', 'bingo-v1', bingo, { safeEventKinds }),
    'echo-memory': pack('echo-memory', 'echo-v1', echo),
    'keeper-prediction': pack('keeper-prediction', 'prediction-v1', prediction)
});
