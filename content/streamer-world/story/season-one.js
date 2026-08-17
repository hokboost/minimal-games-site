'use strict';

const { compileSeason } = require('../../../domain/story/compiler');

const episodeSpecs = [
    ['quiet-frequency', '静默频率', 'The Quiet Frequency', 'lumen', [
        ['雨幕里的微弱拍点让路灯依次醒来', 'A faint beat in the rain wakes each streetlamp', '先记录不规则停顿', 'record the irregular pauses first', '把接收器转向无人屋顶', 'turn the receiver toward the empty roofs'],
        ['旧电台用三次呼吸拼出你的名字', 'The old radio shapes your name from three breaths', '回答它留下的节奏', 'answer the rhythm it left behind', '保持安静观察回声', 'stay quiet and observe the echo'],
        ['流明把一段破损频谱摊在窗上', 'Lumen spreads a damaged spectrum across the window', '相信最亮的那条线', 'trust the brightest line', '追踪几乎看不见的侧波', 'trace the nearly invisible sideband'],
        ['地下机房的风扇突然同步旋转', 'The basement fans suddenly rotate in sync', '关掉一台寻找差异', 'stop one machine to reveal the difference', '让全部机器继续合唱', 'let every machine continue the chorus'],
        ['黎明前的频道只允许一次回答', 'The predawn channel permits only one reply', '说出我们正在倾听', 'say that we are listening', '发送一段没有署名的旋律', 'send an unsigned melody']
    ]],
    ['name-in-static', '杂音中的名字', 'A Name in the Static', 'sora', [
        ['空良从噪点里辨出一串被擦除的姓氏', 'Sora finds an erased surname inside the static', '修复缺失的辅音', 'restore the missing consonants', '保留空白作为证词', 'preserve the blank as testimony'],
        ['档案机吐出一张温热却无日期的纸', 'The archive machine prints a warm page without a date', '沿纸纤维寻找来源', 'follow the paper fibers to their source', '比较墨迹与昨夜星图', 'compare the ink with last night’s chart'],
        ['走廊扬声器念出两个互相矛盾的履历', 'The corridor speaker recites two contradictory histories', '询问共同出现的细节', 'ask about the detail shared by both', '分别保存两个版本', 'preserve both versions separately'],
        ['一枚旧工牌在扫描器下显示新的头像', 'An old badge reveals a new portrait under the scanner', '相信照片里的目光', 'trust the gaze in the photograph', '相信卡片边缘的磨损', 'trust the wear along the card edge'],
        ['空良问名字究竟属于人还是一段承诺', 'Sora asks whether a name belongs to a person or a promise', '把名字归还给说话者', 'return the name to its speaker', '让名字成为共同暗号', 'make the name our shared cipher']
    ]],
    ['locked-window', '上锁的窗口', 'The Locked Window', 'mika', [
        ['米卡发现窗外的云比室内时钟慢七分钟', 'Mika notices the clouds run seven minutes behind the clock', '校准室内时间', 'calibrate the indoor time', '等待云层追上来', 'wait for the clouds to catch up'],
        ['玻璃上的锁孔映出一座不存在的车站', 'The keyhole in the glass reflects a station that does not exist', '绘下站台的出口', 'sketch the platform exits', '记住列车的灯序', 'memorize the train’s light sequence'],
        ['窗框深处传来有人敲击摩斯码', 'Someone taps Morse code from deep inside the window frame', '用指节回应', 'reply with your knuckles', '用灯光回应', 'reply with a beam of light'],
        ['一只纸鸟衔来写着明天日期的票根', 'A paper bird carries a ticket dated tomorrow', '收好票根等待验证', 'keep the ticket for verification', '折回纸鸟送还消息', 'refold the bird and return a message'],
        ['锁芯要求一段不愿忘记的记忆', 'The lock asks for a memory you refuse to forget', '交出第一次听见信号的瞬间', 'offer the instant we first heard the signal', '交出一起守候天亮的约定', 'offer our promise to wait for dawn together']
    ]],
    ['two-ends-wire', '导线的两端', 'Both Ends of the Wire', 'ori', [
        ['奥里在断桥两端各找到半截铜线', 'Ori finds half a copper wire on each side of the broken bridge', '先固定主播这一端', 'anchor the creator’s end first', '先固定守望者这一端', 'anchor the watcher’s end first'],
        ['电流穿过手套时带来陌生人的笑声', 'A stranger’s laughter travels through the gloves with the current', '降低电压听清笑声', 'lower the voltage to hear the laughter', '提高频率寻找说话者', 'raise the frequency to locate the speaker'],
        ['桥下的雾把每个决定复制成相反版本', 'The fog beneath the bridge copies every decision into its opposite', '标记我们真正选过的路', 'mark the path we truly chose', '让两个版本暂时同行', 'let both versions travel together'],
        ['维修盒只有一枚保险丝却有两处故障', 'The repair box has one fuse and two failures', '保住通信线', 'protect the communication line', '保住桥梁照明', 'protect the bridge lights'],
        ['最后一厘米导线需要两个人同时拉直', 'The final centimeter of wire must be straightened by two people', '由奥里数拍子', 'let Ori count the beat', '由你发出开始信号', 'let you give the starting signal']
    ]],
    ['map-small-lights', '微光地图', 'The Map of Small Lights', 'vale', [
        ['维尔的地图只记录没人注意的小灯', 'Vale’s map records only the small lights nobody notices', '从厨房窗灯开始', 'begin with the kitchen window light', '从河边浮标开始', 'begin with the river buoy'],
        ['一条巷子的灯每晚少亮一盏', 'One alley loses another lamp each night', '走向最后仍亮的灯', 'walk toward the last lamp still glowing', '检查第一盏熄灭的灯', 'inspect the first lamp that went dark'],
        ['地图背面长出一条发光的细路', 'A luminous narrow road grows across the map’s reverse', '沿新路向北', 'follow the new road north', '从旧路绕到它的终点', 'circle to its end by the old road'],
        ['广场中央的灯群模仿人的心跳', 'The plaza lights imitate a human heartbeat', '按共同节奏标注', 'mark their shared rhythm', '记录每盏灯的迟疑', 'record each lamp’s hesitation'],
        ['维尔留出一个空白坐标等待命名', 'Vale leaves one blank coordinate waiting for a name', '命名为归途', 'name it Homeward', '命名为下一站', 'name it Next Station']
    ]],
    ['missing-chime', '遗失的铃声', 'The Missing Chime', 'chime', [
        ['绮音的钟塔到了整点却只落下影子', 'Chime’s clocktower casts only a shadow at the hour', '测量影子的长度', 'measure the shadow’s length', '聆听石阶的震动', 'listen to the vibration in the steps'],
        ['鸽群围着一段听不见的旋律转圈', 'Pigeons circle around a melody no one can hear', '跟随最外层的鸽子', 'follow the outermost pigeon', '站到旋律的中心', 'stand at the melody’s center'],
        ['钟舌上刻着一句被雨磨平的道歉', 'An apology worn smooth by rain is carved on the clapper', '拓印残留笔画', 'take a rubbing of the remaining strokes', '替未知的人补完道歉', 'complete the apology for its unknown writer'],
        ['地下储音室封存着十二种沉默', 'The underground sound vault stores twelve kinds of silence', '打开温柔的沉默', 'open the gentle silence', '打开勇敢的沉默', 'open the courageous silence'],
        ['绮音请你决定新钟声首先为谁而响', 'Chime asks whom the restored bell should ring for first', '为仍在等待的人', 'for those still waiting', '为已经归来的人', 'for those who returned']
    ]],
    ['letter-no-stamp', '没有邮戳的信', 'The Letter Without a Postmark', 'courier', [
        ['信使带来一封边缘沾着星尘的信', 'Courier brings a letter edged with stardust', '先验证封蜡纹章', 'verify the wax seal first', '先辨认折纸手法', 'identify the folding method first'],
        ['信纸在灯下显出两层不同笔迹', 'Two layers of handwriting appear under the lamp', '阅读较早的底稿', 'read the earlier undertext', '阅读后来补上的句子', 'read the later additions'],
        ['回信地址是一段正在移动的坐标', 'The return address is a coordinate still moving', '计算它的下一次停靠', 'calculate its next stop', '向它现在的位置追赶', 'pursue its present position'],
        ['信封里还有一粒不属于本季的种子', 'The envelope contains a seed from no season here', '放进透明培养皿', 'place it in a clear culture dish', '埋进广播塔花园', 'plant it in the broadcast garden'],
        ['信使说真正的收件人由回信内容决定', 'Courier says the reply itself determines the recipient', '写下我们找到的事实', 'write the facts we discovered', '写下我们愿意相信的未来', 'write the future we choose to believe']
    ]],
    ['door-that-waits', '等待的门', 'The Door That Waits', 'patience', [
        ['耐心守着一扇从不催促访客的蓝门', 'Patience guards a blue door that never hurries visitors', '立刻敲三下', 'knock three times now', '坐下等门先开口', 'sit and wait for the door to speak'],
        ['门缝吹出的风带着不同年份的花香', 'Wind beneath the door carries flowers from different years', '选择最熟悉的香气', 'choose the most familiar scent', '选择从未闻过的香气', 'choose the scent never known'],
        ['门把手随每次犹豫变得更温暖', 'The handle warms with every hesitation', '握住温度不再松手', 'hold the warmth without letting go', '先说出迟疑的原因', 'name the reason for hesitating first'],
        ['门后的脚步总在你后退时靠近', 'Footsteps behind the door approach whenever you step back', '后退一步邀请对方靠近', 'step back and invite them closer', '向前一步表明来意', 'step forward and state our purpose'],
        ['耐心递来一把只能使用一次的钥匙', 'Patience offers a key that can be used only once', '现在打开共同的门', 'open the shared door now', '把钥匙留给未来的人', 'save the key for someone in the future']
    ]],
    ['constellation-pieces', '星座碎片', 'Pieces of a Constellation', 'tessera', [
        ['特瑟拉把六块夜空碎片铺在黑桌布上', 'Tessera lays six fragments of night sky on black cloth', '先连接颜色相近的边', 'join edges with similar colors first', '先连接星光延伸的方向', 'join the direction of starlight first'],
        ['一颗碎星坚持自己属于另一幅天空', 'One splintered star insists it belongs to another sky', '为它保留独立位置', 'keep a separate place for it', '寻找能接纳它的新图案', 'find a new pattern that can include it'],
        ['拼图缺口恰好呈现两只牵着的手', 'The puzzle gap resembles two hands held together', '用透明片保留缺口', 'preserve the gap with a clear pane', '用两人的标记填满缺口', 'fill the gap with both our marks'],
        ['旋转后的星图指向城市而不是天空', 'When rotated, the star map points to the city instead of the sky', '去最高的屋顶核对', 'verify it from the highest roof', '去最暗的地下室核对', 'verify it from the darkest basement'],
        ['特瑟拉问完整是否必须没有裂缝', 'Tessera asks whether wholeness requires having no cracks', '让金线照亮裂缝', 'illuminate the cracks with golden thread', '轻轻磨平接缝', 'gently smooth the seams']
    ]],
    ['broadcast-garden', '广播花园', 'The Broadcast Garden', 'flora', [
        ['芙洛拉的向日葵都朝着广播塔而非太阳', 'Flora’s sunflowers face the broadcast tower instead of the sun', '测量塔发出的微光', 'measure the tower’s faint light', '聆听花瓣里的新闻', 'listen to the news inside the petals'],
        ['土壤里埋着未发送完的半句话', 'An unfinished sentence is buried in the soil', '补上温柔的句尾', 'complete it with a gentle ending', '保留停顿等待原作者', 'keep the pause for its original writer'],
        ['藤蔓沿天线编出一座绿色阶梯', 'Vines weave a green staircase along the antenna', '修剪出安全扶手', 'trim a safe handrail', '让藤蔓自由决定路线', 'let the vines choose their own route'],
        ['夜来香只在有人诚实回答时开放', 'The night-blooming flowers open only for an honest answer', '承认我们也会害怕失去信号', 'admit we fear losing the signal', '承认我们期待未知的回应', 'admit we hope for an unknown reply'],
        ['芙洛拉请你挑选第一批要送出的种子', 'Flora asks you to choose the first seeds to send away', '送出耐寒的微光种', 'send the cold-resistant glimmer seeds', '送出需要陪伴的合声种', 'send the chorus seeds that need company']
    ]],
    ['before-first-bell', '第一声铃之前', 'Before the First Bell', 'bell', [
        ['贝尔在清晨前检查每一条沉睡的线路', 'Bell checks every sleeping line before dawn', '从最旧的线路开始', 'begin with the oldest line', '从昨夜新增的线路开始', 'begin with the line added last night'],
        ['控制室倒计时比真实时间快了一拍', 'The control-room countdown runs one beat ahead of real time', '调整倒计时相信钟表', 'adjust the countdown and trust the clock', '保留误差相信人的节奏', 'keep the offset and trust human rhythm'],
        ['首铃的锤子悬在一个未解决的问题上', 'The first-bell hammer hangs over an unanswered question', '先回答我们为何连接', 'answer why we connect first', '先回答我们要守护谁', 'answer whom we protect first'],
        ['所有频道同时传来各自的早安', 'Every channel sends its own good morning at once', '逐一回应每个频道', 'answer every channel in turn', '用一段和声回应全部', 'answer them all with one harmony'],
        ['贝尔把启动按钮交给最晚到达的人', 'Bell gives the start button to the last person to arrive', '等齐所有脚步再按下', 'wait for every footstep before pressing', '为迟到的人留灯后按下', 'leave a light for the latecomer and press']
    ]],
    ['relay-one', '一号中继站', 'Relay One', 'keeper', [
        ['守站人打开保存了整季回声的圆形机房', 'Keeper opens the round hall holding the season’s echoes', '按时间排列回声', 'arrange the echoes by time', '按彼此呼应的关系排列', 'arrange them by how they answer one another'],
        ['中央屏幕显示每次选择留下的微小偏转', 'The central screen shows the small deflection left by every choice', '寻找最一致的方向', 'look for the most consistent direction', '寻找改变最大的瞬间', 'look for the moment of greatest change'],
        ['备用电源只够照亮一组尚未公开的记录', 'Backup power can illuminate only one unreleased record set', '查看人物之间的承诺', 'view the promises between people', '查看信号背后的来历', 'view the origin behind the signal'],
        ['十二位同行者把各自的钥匙放进同一圆环', 'Twelve companions place their keys into one ring', '让钥匙保持各自形状', 'let every key keep its own shape', '把钥匙拼成新的星图', 'assemble the keys into a new star map'],
        ['第一中继站等待你定义下一次广播的意义', 'Relay One waits for you to define the meaning of the next broadcast', '把它定义为彼此信任的灯塔', 'define it as a beacon of mutual trust', '把它定义为继续探索的邀请', 'define it as an invitation to keep exploring']
    ]]
];

const axes = ['trust', 'curiosity', 'courage', 'harmony'];
const routes = ['beacon-route', 'archive-route', 'brave-route', 'constellation-route'];
function text(zh, en) { return Object.freeze({ zh, en }); }
// Prompt, left outcome/result, right outcome/result. Every row is authored for its
// scene; identifiers are compiled mechanically, visible prose is not.
const authoredBeats = [
 ['先听停顿还是先追方向，哪一种能让陌生信号感到安全？','Will listening to pauses or following direction make the strange signal feel safer?', '停顿组成一串谨慎的欢迎。','The pauses form a cautious welcome.', '路灯记住了你耐心等待的间隔。','The streetlamps remember the intervals you patiently kept.', '屋顶反射出一条大胆的回路。','The rooftops reflect a daring circuit.', '远处天线因你的主动寻找而转身。','A distant antenna turns because you chose to seek.'],
 ['它已经叫出你的名字，我们该回应还是继续确认？','It has spoken your name; should we answer or keep verifying?', '你的节奏让那三次呼吸放松下来。','Your rhythm lets the three breaths relax.', '电台将“回应”保存为第一次相认。','The radio preserves the reply as a first recognition.', '沉默使第四次呼吸显露出来。','Silence reveals a fourth breath.', '你发现呼唤背后还藏着另一个听众。','You discover another listener behind the call.'],
 ['明亮主线和隐约侧波都在请求信任，流明等你的判断。','Both the bright carrier and faint sideband ask for trust, and Lumen awaits your judgment.', '主线稳住了即将崩散的图形。','The carrier steadies a pattern about to collapse.', '流明把这次果断标为可靠坐标。','Lumen marks your decisiveness as a reliable coordinate.', '侧波带来一段被主线遮住的低语。','The sideband carries a whisper hidden by the carrier.', '流明开始相信你会留意微小声音。','Lumen begins trusting you to notice quiet voices.'],
 ['机器的合唱需要差异，也需要连续；你会保护哪一个？','The machines need difference and continuity; which will you protect?', '停下的风扇暴露了藏在共振里的故障。','The stopped fan exposes a fault hidden in resonance.', '机房留下“敢于打断”的维修原则。','The room records a repair principle: dare to interrupt.', '完整合唱把微弱频率放大到可读。','The full chorus amplifies the faint frequency into legibility.', '连续运转成为你们共同维护的节拍。','Continuous motion becomes a beat you maintain together.'],
 ['一次回答会定义频道此后的语气，你想留下怎样的开端？','One reply will define the channel’s future tone; what beginning should remain?', '直白的倾听承诺穿过雨幕。','A plain promise to listen crosses the rain.', '频道以后用坦率的光回应你。','The channel later answers you with candid light.', '无名旋律为未知者保留了自由。','The unsigned melody leaves freedom to the unknown.', '频道以后用音乐而非姓名辨认你。','The channel later recognizes you by music, not name.'],
 ['被擦除之处也是历史的一部分，我们该修复还是保留？','The erasure is part of history too; should we restore it or preserve it?', '补回的声音使姓氏重新可读。','The restored sound makes the surname legible again.', '空良把修复稿与原始缺口并列存档。','Sora archives the repair beside the original gap.', '空白被框成一块诚实的证据。','The blank is framed as honest evidence.', '档案从此承认不知道也是一种答案。','The archive now accepts uncertainty as an answer.'],
 ['纸张和墨迹讲着不同故事，你愿意先相信哪一种痕迹？','Paper and ink tell different stories; which trace will you trust first?', '纤维把来源指向废弃印刷间。','The fibers point toward an abandoned pressroom.', '一条物质证据链在档案中扎根。','A chain of physical evidence takes root in the archive.', '墨迹与星图共享同一组偏移。','The ink shares a set of offsets with the star chart.', '文字因此被接入更广阔的天象线索。','The writing joins a wider celestial clue.'],
 ['矛盾履历都可能含有真相，该寻找交集还是保护分歧？','Both conflicting histories may hold truth; seek their intersection or protect their difference?', '共同细节勾出一个从未改名的车站。','The shared detail outlines a station never renamed.', '空良获得可继续核验的坚实起点。','Sora gains a firm starting point for verification.', '两份版本被分别封存并获得同等编号。','Both versions are sealed separately with equal standing.', '未来证据可以改变其中之一，而不会抹掉另一份。','Future evidence may change one without erasing the other.'],
 ['照片和磨损各自证明一种生活，你更重视哪份证词？','Portrait and wear each testify to a life; which testimony matters more?', '照片里的目光引你找到旧摄影棚。','The gaze in the portrait leads to an old studio.', '空良记住你相信人的表情。','Sora remembers that you trust human expression.', '磨损揭示工牌曾被反复传递。','The worn edge reveals the badge changed hands often.', '档案新增一条关于物件旅程的支线。','The archive gains a branch about the object’s journey.'],
 ['名字可以被归还，也可以被共同守护；你怎样回答空良？','A name can be returned or jointly guarded; how do you answer Sora?', '说话者接回了被夺走的称呼。','The speaker receives the name once taken away.', '空良把归还写成档案伦理的第一条。','Sora writes restitution as the archive’s first ethic.', '共同暗号只在彼此同意时生效。','The shared cipher works only by mutual consent.', '名字成为一座需要双方开启的小门。','The name becomes a small door opened by both sides.'],
 ['七分钟的差距可能是错误也可能是入口，你选择怎样对待？','The seven-minute gap may be an error or an entrance; how will you treat it?', '校准让房间重新服从同一时刻。','Calibration brings the room back to one moment.', '米卡得到一条稳定却关闭奇迹的时间线。','Mika gains a stable timeline that closes one wonder.', '等待让云层在第七分钟触碰窗沿。','Waiting lets the clouds touch the sill at minute seven.', '一条延迟时间线从窗口安静打开。','A delayed timeline quietly opens through the window.'],
 ['不存在的车站只给一次观察机会，该记录空间还是光？','The impossible station grants one observation; record space or light?', '出口草图保住了可以返回的结构。','The exit sketch preserves a structure we can revisit.', '米卡以后能凭路线重建站台。','Mika can later reconstruct the platform from the route.', '灯序成为一串跨越时间的密码。','The light sequence becomes a cipher across time.', '米卡以后能凭闪烁辨认那班列车。','Mika can later recognize the train by its flicker.'],
 ['敲击者需要知道我们在这里，你想用触觉还是光回应？','The tapper needs to know we are here; answer through touch or light?', '指节的回声从窗框另一端返回。','A knuckle echo returns from the far side of the frame.', '未知敲击者学会了你们的身体节拍。','The unknown tapper learns your physical cadence.', '灯光穿过玻璃留下蓝色短线。','Light crosses the glass and leaves a blue dash.', '窗口将你的光信号保存为通行问候。','The window saves your beam as a greeting of passage.'],
 ['来自明天的票应该成为证据，还是成为对话？','Should tomorrow’s ticket become evidence or conversation?', '票根被封入透明袋等待日期赶上。','The ticket is sealed in a clear sleeve until its date arrives.', '耐心验证成为米卡信任你的理由。','Patient verification becomes Mika’s reason to trust you.', '纸鸟带着回信飞进时间差。','The paper bird carries a reply into the time gap.', '主动联络让未来第一次回望现在。','Active contact makes the future glance back at the present.'],
 ['锁会永久保存交出的记忆，你愿意让哪段经历成为钥匙？','The lock will keep the offered memory forever; which experience becomes the key?', '初次信号化作锁芯里的银齿。','The first signal becomes a silver tooth inside the lock.', '起点记忆为你们保留一条回看之路。','The memory of beginning preserves a path backward.', '守候天亮的约定化作温暖齿轮。','The promise to await dawn becomes a warm gear.', '共同未来为门后世界提供动力。','A shared future powers the world beyond the door.'],
 ['断桥不允许独自完成连接，哪一端应先获得稳定？','The broken bridge cannot be joined alone; which end receives stability first?', '主播一端固定后传来清晰呼吸。','The creator’s anchored end carries clear breathing.', '奥里把安全优先写进维修日志。','Ori writes safety-first into the repair log.', '守望者一端固定后亮起返航标记。','The watcher’s anchored end lights a return marker.', '奥里把互相照应写进线路图。','Ori writes mutual support into the circuit map.'],
 ['笑声可能是求救也可能是记忆，该先听清还是先定位？','The laughter may be distress or memory; hear it clearly or locate it first?', '低电压让笑声变成一句完整问候。','Lower voltage turns laughter into a complete greeting.', '奥里记下温柔可以提高信息质量。','Ori notes that gentleness can improve information.', '高频扫描标出桥下移动的光点。','A high-frequency scan marks a moving light below.', '奥里获得一条需要勇气追踪的坐标。','Ori gains a coordinate that demands courage to follow.'],
 ['相反版本会争夺真实的位置，你想确立原路还是容纳两者？','Opposite versions compete for reality; establish the original or hold both?', '真实路线被铜钉牢牢标记。','The true route is fixed with copper tacks.', '雾无法再替换你们已承认的选择。','The fog can no longer replace the choice you acknowledged.', '两条路线在透明纸上并行延伸。','Both routes extend in parallel on tracing paper.', '矛盾暂时成为可共同研究的材料。','Contradiction becomes material you can study together.'],
 ['一枚保险丝只能守住一种功能，你要保护声音还是光？','One fuse can protect only one function; save voice or light?', '通信线恢复了远方的回答。','The communication line restores a distant answer.', '奥里相信连接比便利更重要。','Ori trusts that connection matters more than convenience.', '桥灯亮起并照出隐藏裂缝。','The bridge lights reveal a hidden fracture.', '奥里相信先看清危险也是照顾。','Ori trusts that revealing danger is also care.'],
 ['最后的校准需要共享节拍，谁来承担领拍的责任？','The final alignment needs a shared beat; who carries the lead?', '奥里的计数使两端同时绷直。','Ori’s count draws both ends straight together.', '你接受同伴引导，线路因此更稳。','You accept a companion’s lead, making the line steadier.', '你的开始信号让奥里毫不迟疑。','Your starting signal removes Ori’s hesitation.', '奥里记住你愿意承担关键时刻。','Ori remembers your willingness to carry a critical moment.'],
 ['地图从不起眼处开始，你想先照顾生活的灯还是航行的灯？','The map begins with overlooked lights; start with a lived light or a navigational one?', '厨房窗灯标出一处有人等待的家。','The kitchen light marks a home where someone waits.', '维尔把日常温暖列为重要坐标。','Vale ranks ordinary warmth as an important coordinate.', '河上浮标划出夜行者的安全边界。','The river buoy draws a safe boundary for night travelers.', '维尔把公共守护列为重要坐标。','Vale ranks public care as an important coordinate.'],
 ['逐渐熄灭的巷子留下两个调查起点，你从哪里进入？','The dimming alley leaves two entry points; where do you begin?', '最后亮灯下聚着等待修复的人。','People awaiting repair gather under the last light.', '维尔学会先听仍在坚持的声音。','Vale learns to hear voices still holding on.', '第一处黑暗藏着被剪断的旧线。','The first darkness hides an old severed wire.', '维尔学会从最初伤口追查原因。','Vale learns to trace causes from the earliest wound.'],
 ['新路诱人而旧路可靠，你会怎样验证地图的邀请？','The new road tempts while the old road reassures; how will you test the invitation?', '向北的细路带你穿过会呼吸的墙。','The northward path leads through a breathing wall.', '维尔的地图获得一层勇敢的透明页。','Vale’s map gains a transparent page of courage.', '旧路让你从终点看见新路的全貌。','The old road shows the new route whole from its end.', '维尔的地图获得一条审慎的校验线。','Vale’s map gains a careful line of verification.'],
 ['这些灯既是一群也有各自迟疑，地图该记录哪一种真实？','These lights are a group and individual hesitations; which truth belongs on the map?', '共同节奏化成广场中央的圆环。','The shared rhythm becomes a ring at the plaza center.', '维尔标出人群能够协作的证据。','Vale marks evidence that a crowd can cooperate.', '每盏迟疑被画成不同长度的短线。','Each hesitation is drawn as a line of different length.', '维尔保住了群体中不应消失的差异。','Vale preserves differences that should not vanish in a group.'],
 ['空白坐标将影响以后所有路线，你想把它指向哪里？','The blank coordinate will shape every later route; where should it point?', '“归途”让附近小灯都朝中心靠拢。','Homeward draws nearby lights toward the center.', '地图承认返回也是一种前进。','The map accepts returning as a form of progress.', '“下一站”让空白向纸外延伸。','Next Station extends the blank beyond the page.', '地图承认未知也值得被邀请。','The map accepts that the unknown deserves invitation.'],
 ['无声整点留下影子和震动，你先读取哪一种余波？','The silent hour leaves shadow and vibration; which aftereffect do you read first?', '影长换算出钟声被拿走的时刻。','The shadow length calculates when the chime was taken.', '绮音得到一条精确的失踪时间。','Chime gains an exact time of disappearance.', '石阶震动指向塔下封闭的房间。','The stair vibration points to a sealed room below.', '绮音得到一处可以继续倾听的地点。','Chime gains a place where listening can continue.'],
 ['听不见的旋律有边缘也有中心，你从哪里接近它？','The unheard melody has an edge and a center; where do you approach?', '最外层鸽子带回一片失落音符。','The outermost pigeon returns a lost note.', '绮音看见旋律如何影响周围世界。','Chime sees how melody changes its surroundings.', '中心位置让心跳暂时与无声旋律同步。','At the center, your heartbeat syncs with the silent tune.', '绮音知道你愿意亲身进入谜团。','Chime knows you will step bodily into a mystery.'],
 ['被磨平的道歉应尽量还原，还是由现在的人承担？','Should the worn apology be restored faithfully or carried by someone now?', '拓印保住三个尚可辨认的字。','The rubbing saves three still-legible characters.', '绮音选择让证据限制自己的想象。','Chime lets evidence restrain imagination.', '补写的道歉在钟舌上发出微光。','The completed apology glows on the clapper.', '绮音选择让善意先抵达未知对象。','Chime lets goodwill reach an unknown recipient first.'],
 ['十二种沉默都不是空白，你准备打开哪一种力量？','None of the twelve silences is empty; which power will you open?', '温柔沉默包住尖锐回声。','Gentle silence wraps the sharp echoes.', '储音室学会不必每次都立即回答。','The vault learns it need not answer immediately.', '勇敢沉默为下一声钟腾出空间。','Courageous silence clears room for the next chime.', '储音室学会暂停也能表达决心。','The vault learns a pause can express resolve.'],
 ['新钟声只能先抵达一群人，你希望它承认哪种等待？','The new chime can reach one group first; which waiting should it honor?', '声音越过屋顶寻找仍未放弃的人。','The sound crosses roofs toward those who have not given up.', '绮音把希望交给尚未结束的旅程。','Chime gives hope to journeys not yet ended.', '声音落在已经打开的家门前。','The sound settles before doors already opened.', '绮音把庆祝交给艰难完成的归来。','Chime gives celebration to hard-won returns.'],
 ['星尘与折痕分别指向远方和手掌，你先追哪条来源？','Stardust and folds point to distance and hands; which origin comes first?', '封蜡证明信来自废弃观测站。','The seal proves the letter came from an abandoned observatory.', '信使获得一条可以公开核验的出处。','Courier gains a provenance that can be publicly checked.', '折法暴露写信人左手不便。','The folds reveal the writer had limited use of one hand.', '信使获得一条应谨慎保护的人物线索。','Courier gains a personal clue that deserves protection.'],
 ['两层笔迹都想被听见，你愿意先进入哪一个时间？','Both handwritings want to be heard; which time do you enter first?', '底稿讲述写信前尚未解决的恐惧。','The undertext tells of fear unresolved before writing.', '信使理解这封信为何迟迟没有寄出。','Courier understands why the letter was never sent.', '补句讲述写信后终于做出的决定。','The additions tell of a decision finally made afterward.', '信使理解这封信为何现在必须抵达。','Courier understands why the letter must arrive now.'],
 ['移动地址既能预测也能追赶，你选择准备还是行动？','A moving address can be predicted or pursued; choose preparation or action?', '下一停靠点落在三日后的潮汐站。','The next stop falls at a tide station three days away.', '信使得到从容准备会面的时间。','Courier gains time to prepare the meeting carefully.', '追赶路线穿过不断改名的街区。','The pursuit crosses streets that keep changing names.', '信使得到一条冒险但及时的捷径。','Courier gains a risky but timely shortcut.'],
 ['异季种子需要观察或归属，你想先给它哪一种照顾？','The out-of-season seed needs observation or belonging; which care comes first?', '培养皿记录它在月光下展开的根。','The dish records roots unfolding under moonlight.', '信使保住了理解陌生生命的资料。','Courier preserves knowledge needed to understand a strange life.', '花园土壤接纳它并长出银色芽。','Garden soil accepts it and raises a silver shoot.', '信使保住了陌生生命立即生长的机会。','Courier preserves the chance for strange life to grow now.'],
 ['回信会选择它的读者，你愿意用事实还是愿景开门？','The reply will choose its reader; will fact or vision open the door?', '事实清单让地址停止漂移。','The list of facts makes the address stop drifting.', '收件人因你们的诚实而清晰出现。','The recipient appears clearly because of your honesty.', '未来愿景让信封长出新的星纹。','The vision of the future grows new star patterns on the envelope.', '收件人因你们的希望而主动回应。','The recipient answers because of your hope.'],
 ['这扇门尊重不同速度，你想先行动还是先倾听？','This door respects different speeds; act first or listen first?', '三次敲击得到三种不同材质的回音。','Three knocks return echoes of three materials.', '耐心知道你愿意清楚表达来意。','Patience knows you will state your intent clearly.', '门先说出一句已经等了很久的话。','The door first speaks a sentence long held back.', '耐心知道你愿意给对方主动空间。','Patience knows you will grant the other side agency.'],
 ['熟悉与陌生的花香通向不同年份，你愿意进入哪段时间？','Familiar and unknown flowers lead to different years; which time do you enter?', '熟悉香气打开一间保存旧照片的房间。','The familiar scent opens a room of old photographs.', '耐心陪你重新理解曾经发生的事。','Patience accompanies you in reinterpreting what happened.', '陌生香气打开一片尚未命名的庭院。','The unknown scent opens an unnamed courtyard.', '耐心陪你面对没有前例的可能。','Patience accompanies you into possibility without precedent.'],
 ['温度回应了你的犹豫，你会用触碰还是坦白继续？','Warmth has answered your hesitation; continue through touch or candor?', '稳定的握持让锁舌慢慢退开。','A steady hold draws the bolt back slowly.', '耐心记住你能在不确定里坚持。','Patience remembers you can persist through uncertainty.', '说出的迟疑让门把手不再灼热。','Naming hesitation cools the handle.', '耐心记住诚实能够改变阻力。','Patience remembers honesty can change resistance.'],
 ['门后的陌生人会回应距离，你选择邀请还是表态？','The stranger responds to distance; choose invitation or declaration?', '后退留下足够空间让脚步靠近。','Stepping back leaves room for the footsteps to approach.', '耐心看到你用空间表达欢迎。','Patience sees you express welcome through space.', '向前让门后的人听清你的目的。','Stepping forward lets the person hear your purpose.', '耐心看到你用明确表达安全。','Patience sees you create safety through clarity.'],
 ['一次性钥匙既能兑现现在，也能保护未来，你把机会给谁？','The one-use key can serve now or protect later; who receives the chance?', '共同转动使蓝门向两边同时打开。','Turning together opens the blue door both ways.', '耐心与你共享门后的第一束光。','Patience shares the first light beyond the door with you.', '钥匙被封进写给未来访客的盒子。','The key is sealed in a box for a future visitor.', '耐心与你共享一份尚未使用的信任。','Patience shares with you a trust not yet spent.'],
 ['相似颜色与光的方向提出两套完整方法，你选哪种秩序？','Similar colors and starlight offer two complete methods; which order do you choose?', '颜色相接处形成温和的渐变边界。','Color-matched edges form gentle gradients.', '特瑟拉记住你先寻找相容之处。','Tessera remembers you seek compatibility first.', '光线相接处形成跨越裂缝的长轨。','Aligned rays form long paths across cracks.', '特瑟拉记住你先寻找共同方向。','Tessera remembers you seek shared direction first.'],
 ['不合群的碎星请求被看见，你想保护独立还是寻找归属？','The mismatched star asks to be seen; protect independence or seek belonging?', '独立底座让碎星拥有自己的小天空。','A separate mount gives the splinter its own small sky.', '特瑟拉承认完整不等于合并。','Tessera accepts that wholeness need not mean merging.', '新图案围绕碎星生长出开放边缘。','A new pattern grows an open edge around the splinter.', '特瑟拉承认归属可以改变整体形状。','Tessera accepts belonging can reshape the whole.'],
 ['手形缺口可以被保留或被共同填入，你怎样理解缺失？','The hand-shaped gap can remain or be jointly filled; how do you understand absence?', '透明片让缺口继续透出后方星光。','A clear pane lets background stars shine through the gap.', '特瑟拉把缺失保存为故事的一部分。','Tessera preserves absence as part of the story.', '两枚标记在缺口中央并肩发亮。','Two marks glow side by side inside the gap.', '特瑟拉把共同参与保存为修复的一部分。','Tessera preserves participation as part of repair.'],
 ['城市上空与地下都可能对应星图，你先去哪里求证？','Both rooftop and basement may correspond to the chart; where do you verify first?', '屋顶风把星线投向真实天际。','Rooftop wind projects the lines onto the real horizon.', '特瑟拉获得一条公开可见的验证。','Tessera gains verification visible to everyone.', '地下黑暗使墙里的微光显形。','Basement darkness reveals faint lights in the wall.', '特瑟拉获得一条只有耐心才能发现的验证。','Tessera gains verification visible only through patience.'],
 ['裂缝可以发光也可以变得平滑，你希望完整保留什么？','Cracks can shine or smooth away; what should wholeness preserve?', '金线让每次破裂都成为可读历史。','Gold thread makes every break a readable history.', '特瑟拉把修复过程置于完成结果之前。','Tessera values the repair journey before the finished result.', '磨平接缝让星光没有阻碍地流动。','Smoothed seams let starlight move without obstruction.', '特瑟拉把共同流动置于旧边界之前。','Tessera values shared flow before old boundaries.'],
 ['花朵朝塔转身的原因可能在光里也可能在声音里，你先问谁？','The flowers turn toward the tower for light or sound; what do you ask first?', '微光读数显示塔在夜间模拟月相。','The light reading shows the tower mimics moon phases at night.', '芙洛拉得到植物追光的新解释。','Flora gains a new explanation for the plants’ turning.', '花瓣新闻讲述一场尚未发生的雨。','Petal news describes a rainstorm not yet arrived.', '芙洛拉得到植物倾听的新解释。','Flora gains a new explanation for the plants’ listening.'],
 ['半句话等待结尾，也可能需要保留沉默；你如何尊重它？','The half-sentence awaits an ending, or perhaps its silence; how do you respect it?', '温柔句尾让土壤冒出细小蓝花。','A gentle ending raises tiny blue flowers from the soil.', '芙洛拉看到回应能帮助未完之物生长。','Flora sees that response can help unfinished things grow.', '保留停顿让原句在夜里自己续写。','Keeping the pause lets the sentence continue itself at night.', '芙洛拉看到等待能保护原作者声音。','Flora sees that waiting can protect the original voice.'],
 ['绿色阶梯需要安全也需要生命自己的方向，你选择哪种维护？','The green staircase needs safety and its own direction; what maintenance do you choose?', '修剪后的扶手让更多人能够攀登。','The trimmed rail lets more people climb.', '芙洛拉把可抵达性写进花园规则。','Flora writes accessibility into the garden rules.', '自由藤蔓绕开天线最脆弱的接口。','The free vine avoids the antenna’s weakest joint.', '芙洛拉把生命的判断写进花园规则。','Flora writes living judgment into the garden rules.'],
 ['花朵要求诚实，但两种坦白都真实；你愿意暴露哪一面？','The flowers ask for honesty, and both confessions are true; which side will you reveal?', '承认害怕后，夜来香围成保护圈。','After fear is admitted, the flowers form a protective ring.', '芙洛拉与你共享脆弱而不急着修正。','Flora shares vulnerability without rushing to fix it.', '承认期待后，夜来香向远方散播香气。','After hope is admitted, the flowers send fragrance afar.', '芙洛拉与你共享期待而不保证结果。','Flora shares hope without promising an outcome.'],
 ['第一批种子会定义花园与外界的关系，你想送出坚韧还是陪伴？','The first seeds define the garden’s relation to the world; send resilience or companionship?', '微光种在冷风中独自保持亮度。','Glimmer seeds hold their light alone in cold wind.', '芙洛拉为远行者准备无需照料的礼物。','Flora prepares a low-demand gift for distant travelers.', '合声种只有靠近彼此才开始发芽。','Chorus seeds sprout only when placed near one another.', '芙洛拉为新邻居准备需要共建的礼物。','Flora prepares a gift new neighbors must build together.'],
 ['旧线路和新线路代表两种责任，贝尔该先唤醒哪一端？','Old and new lines represent different duties; which should Bell wake first?', '旧线在清理灰尘后传回熟悉呼号。','The old line returns a familiar call after dust is cleared.', '贝尔确认长久连接没有被新鲜感遗忘。','Bell confirms lasting bonds were not forgotten for novelty.', '新线在检查接点后收到第一次回应。','The new line receives its first reply after inspection.', '贝尔确认新连接从开始就获得认真照顾。','Bell confirms new bonds receive care from the beginning.'],
 ['提前一拍可能是故障也可能是人的节奏，你让什么成为标准？','The extra beat may be error or human rhythm; what becomes the standard?', '校准后的数字与塔钟严丝合缝。','The calibrated digits align perfectly with the tower clock.', '贝尔获得可预测且共同认可的启动时刻。','Bell gains a predictable start everyone can share.', '保留的偏差正好接住最慢的呼吸。','The retained offset catches the slowest breath exactly.', '贝尔获得包容个体节奏的启动时刻。','Bell gains a start that includes individual rhythms.'],
 ['第一声铃需要一个理由，你想先确定目的还是对象？','The first bell needs a reason; define purpose or people first?', '连接的理由被写成“让回应有路可走”。','The reason for connection is written: give replies a path.', '贝尔用这句话校准所有发送器。','Bell calibrates every transmitter with that sentence.', '守护的对象被写成“任何愿意求助的人”。','The protected group is written: anyone willing to ask.', '贝尔用这句话校准所有接收器。','Bell calibrates every receiver with that sentence.'],
 ['许多早安同时抵达，你想维护个别回应还是共同和声？','Many good mornings arrive together; preserve individual replies or shared harmony?', '逐一回应让每个频道确认自己被听见。','Answering one by one lets each channel know it was heard.', '贝尔把耐心列为广播站的晨间礼仪。','Bell makes patience part of the station’s morning practice.', '共同和声让不同问候彼此听见。','The shared harmony lets different greetings hear one another.', '贝尔把连接列为广播站的晨间礼仪。','Bell makes connection part of the station’s morning practice.'],
 ['迟到者与准时者都在等待启动，你怎样安排第一束光？','Late and timely arrivals both await the start; how do you place the first light?', '所有脚步到齐时按钮温柔地亮起。','The button glows gently when every footstep arrives.', '贝尔把不遗落任何人写入启动记录。','Bell writes leaving no one behind into the launch record.', '走廊留灯后，广播按计划穿过清晨。','With a corridor light left on, the broadcast crosses dawn on time.', '贝尔把兼顾等待与前进写入启动记录。','Bell writes balancing waiting and movement into the launch record.'],
 ['整季回声可以按先后或关系理解，守站人请你选择阅读方式。','The season’s echoes can be read by order or relation; Keeper asks you to choose.', '时间顺序显出每次选择如何改变下一次选择。','Chronology shows how each choice altered the next.', '守站人保存了一条清晰的成长轨迹。','Keeper preserves a clear trajectory of growth.', '呼应关系显出相隔很远的声音如何互相支撑。','Relations show how distant voices supported each other.', '守站人保存了一张彼此影响的网络。','Keeper preserves a network of mutual influence.'],
 ['偏转图既有长期方向也有关键转折，你想读哪种力量？','The deflection chart holds long direction and pivotal turns; which force do you read?', '一致方向勾出你反复维护的价值。','The consistent direction outlines the value you repeatedly protected.', '中继站将它设为未来决策的稳定基线。','The relay sets it as a stable baseline for future decisions.', '最大转折标出你曾改变自己的时刻。','The greatest turn marks the moment you changed yourself.', '中继站将改变能力设为未来决策的资源。','The relay sets capacity for change as a future resource.'],
 ['有限电力只能公开一组记录，你愿意先照亮承诺还是来历？','Limited power can reveal one record set; illuminate promises or origins?', '人物承诺在圆屏上连成温暖的线。','Promises between people connect as warm lines on the round screen.', '守站人确认关系本身就是可保存的成果。','Keeper confirms relationships themselves are preservable outcomes.', '信号来历在圆屏上展开遥远航道。','The signal’s origins unfold as distant routes on the screen.', '守站人确认真相探索仍会继续。','Keeper confirms the search for truth will continue.'],
 ['十二把钥匙可以保持差异或形成新图案，你怎样定义共同体？','Twelve keys can keep differences or form a new pattern; how do you define community?', '各自形状围成一个留有入口的圆。','Distinct shapes form a circle with an open entrance.', '守站人记录共同体不要求成员相同。','Keeper records that community does not require sameness.', '拼合钥匙投出一幅从未出现的星图。','Joined keys project a star map never seen before.', '守站人记录共同创造可以超越单独部分。','Keeper records that co-creation can exceed separate parts.'],
 ['下一次广播将继承整季选择，你希望它成为守望还是邀请？','The next broadcast inherits the season’s choices; should it become watch or invitation?', '信任灯塔为所有已知频道保持稳定亮度。','The beacon of trust holds steady for every known channel.', '第一中继站选择先让连接可以依靠。','Relay One chooses to make connection dependable first.', '探索邀请向未标记区域发送开放问句。','The invitation sends an open question into uncharted space.', '第一中继站选择让未知拥有回答机会。','Relay One chooses to give the unknown a chance to answer.']
];
function makeMoment(tuple, episodeIndex, momentIndex) {
    const [sceneZh, sceneEn, leftZh, leftEn, rightZh, rightEn] = tuple;
    const authored = authoredBeats[episodeIndex * 5 + momentIndex];
    if (!authored) throw new Error('Missing authored story beat');
    const leftAxis = axes[(episodeIndex + momentIndex) % axes.length];
    const rightAxis = axes[(episodeIndex + momentIndex + 1) % axes.length];
    return Object.freeze({
        intro: text(sceneZh, sceneEn),
        prompt: text(authored[0], authored[1]),
        left: {
            label: text(leftZh, leftEn), outcome: text(authored[2], authored[3]), result: text(authored[4], authored[5]),
            axis: leftAxis, amount: 2, relationship: 2, route: routes[axes.indexOf(leftAxis)]
        },
        right: {
            label: text(rightZh, rightEn), outcome: text(authored[6], authored[7]), result: text(authored[8], authored[9]),
            axis: rightAxis, amount: 2, relationship: 1, route: routes[axes.indexOf(rightAxis)]
        }
    });
}

const specialTypes = ['puzzle', 'quest_gate', 'game_launch', 'inventory_gate', 'relationship_gate', 'achievement_gate', 'owner_intervention', 'timed_wait', 'message_delivery', 'memory_unlock', 'checkpoint', 'owner_intervention'];
const specialProse = [
 ['第三拍在雨水间显出隐藏的完整频率。','The third beat reveals a complete frequency between raindrops.','正确节拍让流明找回耐心频率。','The correct beat restores Lumen’s patient frequency.','错误节拍没有关闭频道，反而留下重试的诚实记号。','The wrong beat does not close the channel; it leaves an honest mark for retrying.'],
 ['空良在档案门前核对你是否走过信任航迹。','At the archive door, Sora checks whether you traveled the route of trust.','门承认你的信任记录并展示原始底稿。','The door recognizes your trust record and reveals the original draft.','门保留底稿，却送来一份可继续调查的抄本。','The door keeps the draft but offers a copy for continued inquiry.'],
 ['米卡把合作修图的安全邀请放进待解锁清单。','Mika places a safe co-repair invitation on the unlock list.','尚未开放的玩法只形成可见意向，不会自行执行。','The unavailable game becomes only a visible intent and never runs itself.','游戏意向等待功能开关与双方同意。','The game intent waits for its feature flag and mutual consent.'],
 ['奥里检查你是否已在旅途中取得中继钥匙。','Ori checks whether you obtained the relay key during the journey.','钥匙开启维修箱，露出保存完好的备用线圈。','The key opens the repair case and reveals a preserved spare coil.','没有钥匙时，奥里改用外部接线并记住这次绕行。','Without the key, Ori uses an external lead and records the detour.'],
 ['维尔把关系刻度与地图上的窄桥对齐。','Vale aligns your relationship measure with a narrow bridge on the map.','积累的信任使两人能并肩通过窄桥。','Accumulated trust lets both of you cross the narrow bridge side by side.','尚浅的关系让你们选择分两次安全通过。','A newer bond leads you to cross safely in separate turns.'],
 ['绮音寻找“耐心倾听者”的安全解锁记录。','Chime looks for a safe unlock record for Patient Listener.','记录存在时，钟塔开放一层共鸣回廊。','With the record present, the tower opens a resonant gallery.','记录尚未形成，钟塔先提供一段练习回声。','Without the record, the tower offers a practice echo first.'],
 ['守望者把不替代选择的短笺放在信使包外侧。','The watcher places a note outside Courier’s bag without replacing your choice.','短笺只提供陪伴，并把决定权留在你手中。','The note offers company and leaves the decision with you.','即使稍后阅读，短笺也不会改变你的资格。','Reading it later will not change your eligibility.'],
 ['等待的门用一秒钟证明暂停也是故事动作。','The waiting door uses one second to prove a pause is also a story action.','时间抵达后，门按原承诺继续开启。','When time arrives, the door continues opening as promised.','尚未抵达时，门保持原状而不惩罚催促。','Before then, the door stays still without punishing impatience.'],
 ['特瑟拉收到一封解释缺失星片来历的延迟信。','Tessera receives a delayed letter explaining the missing star fragment.','信件进入持久收件箱，可在以后重新阅读。','The letter enters the persistent inbox for later rereading.','安静时段只延后打扰，不会吞掉这封信。','Quiet hours delay interruption but never swallow the letter.'],
 ['芙洛拉把广播花园的共同选择封存成一枚记忆种子。','Flora seals the garden’s shared choice into a memory seed.','记忆在个人故事与共享记忆中保留同一来源。','The memory keeps one provenance across story and shared memory.','重玩只能重看，不会重复制造首通记忆。','Replay can revisit it but cannot mint a first-clear memory twice.'],
 ['贝尔在首铃后保存可恢复的完整检查点。','Bell saves a complete resumable checkpoint after the first chime.','断线归来会从已提交节点继续，而非猜测客户端画面。','Reconnect resumes from the committed node instead of guessing client state.','旧页面提交会遇到版本冲突，不会覆盖新进度。','A stale page receives a version conflict instead of overwriting progress.'],
 ['守站人送来季终前最后一封不带命令的陪伴信。','Keeper brings one final companion letter without commands before the finale.','信中庆祝共同完成，但不授予货币或礼物。','The letter celebrates completion without granting currency or gifts.','它只照亮已有路线，不替你选择结局。','It illuminates existing routes without choosing an ending for you.']
];
function makeSpecial(slug, index, nextSlug) {
    const type = specialTypes[index];
    const next = nextSlug ? `${nextSlug}.m1.intro` : 'season-one.ending-router';
    const prose = specialProse[index];
    const base = { type, text: text(prose[0], prose[1]), successText: text(prose[2], prose[3]), failureText: text(prose[4], prose[5]), effects: [{ type: 'unlock_memory', key: `${slug}.memory` }, { type: 'deliver_message', key: `${slug}.letter` }], successResultEffects: [{ type: 'set_flag', key: `${slug}.gate-open`, value: true }], failureResultEffects: [{ type: 'set_flag', key: `${slug}.gate-detour`, value: true }] };
    if (type === 'puzzle') return { ...base, answerKey: 'quiet-beat-b', answerOptions: [{ id: 'quiet-beat-a', label: text('第二个节拍', 'Second beat') }, { id: 'quiet-beat-b', label: text('第三个节拍', 'Third beat') }], successNext: next, failureNext: next, successEffects: [{ type: 'add_clue', key: 'patient-frequency' }], failureEffects: [{ type: 'set_flag', key: 'quiet-puzzle-missed', value: true }] };
    if (['quest_gate', 'inventory_gate', 'relationship_gate', 'achievement_gate'].includes(type)) {
        const conditions = {
            quest_gate: { op: 'route', key: 'beacon-route' }, inventory_gate: { op: 'item', key: 'relay-key' },
            relationship_gate: { op: 'character_relationship', character: 'vale', minimum: 1 }, achievement_gate: { op: 'achievement', key: 'patient-listener' }
        };
        return { ...base, condition: conditions[type], successNext: next, failureNext: next };
    }
    if (type === 'game_launch') base.effects.push({ type: 'unlock', unlockType: 'game', key: 'star-map-repair' });
    if (type === 'timed_wait') base.waitSeconds = 1;
    if (type === 'memory_unlock') base.effects.push({ type: 'unlock', unlockType: 'collection', key: 'season-one-echoes' });
    if (type === 'checkpoint') base.effects.push({ type: 'add_item', key: 'relay-key' });
    return { ...base, next };
}

const memoryProse = [
 ['雨中第一次相认','Recognition in the Rain','路灯曾按我们的停顿依次醒来；流明仍记得那不是命令，而是一句谨慎的欢迎。','Streetlamps once woke to our pauses; Lumen remembers it as a cautious welcome, not a command.'],
 ['并列的两个名字','Two Names Side by Side','空良没有覆盖矛盾档案。两个版本仍并列保存，等待未来证据公平地靠近。','Sora never overwrote the conflicting records. Both remain side by side for future evidence.'],
 ['慢七分钟的云','Clouds Seven Minutes Late','那扇窗教会米卡：误差有时不是需要消灭的故障，而是另一个时间发来的邀请。','The window taught Mika that an offset may be an invitation from another time, not a fault to erase.'],
 ['桥上的共同节拍','A Shared Beat on the Bridge','铜线最终被两双手拉直。谁领拍已经不重要，重要的是另一端确实有人回应。','Two pairs of hands straightened the wire. The lead mattered less than the answer from the other end.'],
 ['地图上的空白坐标','The Blank Coordinate','维尔保留了我们命名的坐标，小灯会依照那次决定指向归途或下一站。','Vale kept the coordinate we named; small lights still point homeward or onward because of it.'],
 ['先为谁响的钟','Whom the Bell Reached First','修好的钟保存了第一位听众的方向，也保存了绮音做出选择时短暂而认真的沉默。','The restored bell keeps the first listener’s direction and Chime’s brief, earnest silence before choosing.'],
 ['星尘信封里的种子','The Seed in the Stardust Envelope','异季种子已经被观察或种下；信使承诺不会把另一条未选路线假装成从未存在。','The out-of-season seed was studied or planted; Courier will not pretend the unchosen route never existed.'],
 ['没有催促的蓝门','The Blue Door Without Hurry','耐心让门尊重我们的速度。钥匙如何使用，已经成为以后每次等待都会回想的先例。','Patience let the door respect our pace. How the key was used became a precedent for every later wait.'],
 ['裂缝仍可读的星图','A Star Map with Readable Cracks','特瑟拉保存了拼合方式；金线、平滑接缝或透明缺口都继续影响星图的含义。','Tessera preserved how we assembled it; gold seams, smooth joins, or clear gaps still shape its meaning.'],
 ['会听广播的花园','The Garden That Listens','芙洛拉记得哪种坦白让夜花开放，也记得第一批种子带着怎样的关系离开。','Flora remembers which confession opened the night flowers and what bond the first seeds carried away.'],
 ['第一声铃的理由','The Reason for the First Bell','贝尔把我们的理由写进启动记录，因此下一次清晨不会只剩倒计时，还会记得要等待谁。','Bell wrote our reason into the launch record, so the next dawn remembers whom to wait for.'],
 ['圆形机房的十二把钥匙','Twelve Keys in the Round Hall','守站人没有把整季压成一个答案；每次偏转仍能在中继站里找到自己的光。','Keeper did not compress the season into one answer; every turn still finds its own light in the relay.']
];
const memories = Object.fromEntries(episodeSpecs.map(([slug], index) => [`${slug}.memory`, {
    title: text(memoryProse[index][0], memoryProse[index][1]),
    body: text(memoryProse[index][2], memoryProse[index][3]),
    episode: slug, ordinal: index + 1
}]));
const letterProse = [
 ['频道没有关闭','The Channel Stayed Open','流明说雨停后仍能听见你留下的节拍；不必马上回来，频率会安静保存。','Lumen says your beat remains after the rain. There is no need to hurry back; the frequency will keep.'],
 ['档案接受未知','The Archive Accepts the Unknown','空良为缺口加了保护页。它不再被当成错误，而被标记为等待证据的诚实位置。','Sora protected the gap. It is no longer treated as error, but as an honest place awaiting evidence.'],
 ['票根的日期到了','The Ticket Date Arrived','米卡核对了那张来自明天的票。无论你如何处理纸鸟，窗口都承认你曾认真回应。','Mika checked the ticket from tomorrow. However you handled the bird, the window honors your careful reply.'],
 ['另一端仍有电流','Current Remains at the Far End','奥里完成了桥面绝缘。那段共同拉直的铜线现在可以安全承载新的声音。','Ori finished insulating the bridge. The wire you straightened together can safely carry new voices.'],
 ['小灯没有被遗漏','No Small Light Was Omitted','维尔补上了巷口的灯。地图仍保留你的命名，因为方向应由走路的人共同决定。','Vale restored the alley lamp. The map keeps your name because direction belongs to those who travel.'],
 ['钟塔练习新的整点','The Tower Practices a New Hour','绮音每天让钟先轻响一次，确认不会惊扰任何人，再把真正的声音送向你选择的方向。','Chime tests a gentle note daily before sending the full sound toward the direction you chose.'],
 ['回信找到了读者','The Reply Found Its Reader','信使只报告一件事：信封已经打开。收件人的身份仍属于故事以后愿意揭示的部分。','Courier reports one fact: the envelope was opened. The recipient’s identity remains for a later story.'],
 ['钥匙盒保持完整','The Key Box Remains Whole','耐心擦亮了蓝门把手。门会记得你是立即进入，还是为未来访客保留了机会。','Patience polished the blue handle. The door remembers whether you entered or saved a chance for another.'],
 ['碎星有了位置','The Splintered Star Has a Place','特瑟拉调整了展示架，让独立的碎片与共同图案都能被看见，没有一种完整需要假装。','Tessera adjusted the display so both separate fragment and shared pattern can be seen without pretense.'],
 ['银芽发出微光','The Silver Shoot Glows','芙洛拉说第一片叶子已经展开。它朝向的不是塔，也不是太阳，而是最近的一段回应。','Flora says the first leaf opened toward neither tower nor sun, but toward the nearest reply.'],
 ['清晨已经启动','Dawn Has Started','贝尔留下了一盏走廊灯，也完成了广播。等待与前进这次没有互相取消。','Bell left a corridor light on and completed the broadcast. Waiting and moving did not cancel each other.'],
 ['中继站保存全部偏转','The Relay Keeps Every Turn','守站人确认季终结论不会覆盖路径。你以后重看时，仍能辨认每次关系变化的来处。','Keeper confirms the ending will not overwrite the path; every relationship change remains traceable.']
];
const ownerProse = [
 ['雨幕外的一盏灯','A Lamp Beyond the Rain','我会在频道外守着，不猜你的答案；需要停下时，沉默也算有效回应。','I will keep watch outside the channel without guessing your answer; silence is valid when you need to pause.'],
 ['窗口旁的铅笔记号','A Pencil Mark Beside the Window','如果时间差让你不安，我们可以只记录已经确认的部分，未来不需要今天替它作证。','If the time gap feels uneasy, we can record only what is known; today need not testify for tomorrow.'],
 ['地图折角里的提醒','A Note in the Map Fold','小灯不必争谁更重要。你选择从哪里开始，我就从另一端帮你保持道路清楚。','Small lights need not compete. Start where you choose, and I will keep the other end clear.'],
 ['信使包外的短笺','A Note Outside the Courier Bag','信的内容属于你决定。我只确认回程路线安全，并尊重任何不寄出的选择。','The reply is yours. I will only keep the return route safe and respect a choice not to send it.'],
 ['星片盒下的软布','Soft Cloth Beneath the Star Pieces','裂缝不用藏起来才值得珍惜。我会托住桌面，让你按自己的方式拼合。','Cracks need not be hidden to matter. I will steady the table while you assemble them your way.'],
 ['首铃前的备用灯','A Spare Lamp Before the First Bell','无论按钮何时按下，我会为还在路上的人留灯，也不会替已经到场的人决定等待多久。','Whenever the button is pressed, I will leave a light for travelers without deciding how long others wait.']
];
const messages = Object.fromEntries(episodeSpecs.flatMap(([slug], index) => {
    const entries = [[`${slug}.letter`, { title: text(letterProse[index][0], letterProse[index][1]), body: text(letterProse[index][2], letterProse[index][3]) }]];
    if (index % 2 === 0) entries.push([`${slug}.owner-note`, { title: text(ownerProse[index / 2][0], ownerProse[index / 2][1]), body: text(ownerProse[index / 2][2], ownerProse[index / 2][3]) }]);
    return entries;
}));

const episodes = episodeSpecs.map(([slug, titleZh, titleEn, character, moments], index) => ({
    slug, title: text(titleZh, titleEn), character, cameo: episodeSpecs[(index + 11) % episodeSpecs.length][3],
    moments: moments.map((moment, momentIndex) => makeMoment(moment, index, momentIndex)),
    ownerIntervention: index % 2 === 0 ? text(ownerProse[index / 2][2], ownerProse[index / 2][3]) : null,
    special: makeSpecial(slug, index, episodeSpecs[index + 1]?.[0])
}));

const source = {
    slug: 'signal-between-us', version: 1, title: text('我们之间的信号：第一季', 'The Signal Between Us: Season One'),
    episodes, memories, messages,
    endingRouterText: text('所有长期选择在一号中继站汇合，但它们没有被抹平；最强的航迹正在打开自己的结局。', 'Every lasting choice meets at Relay One without being flattened; the strongest route is opening its own conclusion.'),
    endings: [
        { id: 'season-one.ending.constellation', key: 'constellation', priority: 50, condition: { op: 'axis', axis: 'harmony', minimum: 15 }, text: text('群星合奏：不同声音保持各自形状，并组成一幅可以继续扩展的星图。', 'Constellation Chorus: distinct voices keep their shapes and form a chart that can keep growing.'), effects: [{ type: 'add_route', key: 'ending-constellation' }] },
        { id: 'season-one.ending.beacon', key: 'beacon', priority: 40, condition: { op: 'axis', axis: 'trust', minimum: 15 }, text: text('共同灯塔：你们把中继站变成一束允许人安全靠近的光。', 'Shared Beacon: you turn the relay into a light people can approach safely.'), effects: [{ type: 'add_route', key: 'ending-beacon' }] },
        { id: 'season-one.ending.archive', key: 'archive', priority: 30, condition: { op: 'axis', axis: 'curiosity', minimum: 15 }, text: text('活档案：没有答案被封死，每条疑问都成为下一季可进入的门。', 'Living Archive: no answer is sealed; every question becomes a door into the next season.'), effects: [{ type: 'add_route', key: 'ending-archive' }] },
        { id: 'season-one.ending.brave', key: 'brave', priority: 20, condition: { op: 'axis', axis: 'courage', minimum: 15 }, text: text('破晓远征：中继站向未知区域发送第一束不退缩的探测波。', 'Dawn Expedition: the relay sends its first unwavering probe into the unknown.'), effects: [{ type: 'add_route', key: 'ending-brave' }] },
        { id: 'season-one.ending.hearth', key: 'hearth', priority: 1, condition: { op: 'always' }, text: text('守夜炉火：你们选择先守住已经建立的连接，让温暖成为继续出发的基础。', 'Nightwatch Hearth: you protect the bond already built, making warmth the ground for what comes next.'), effects: [{ type: 'add_route', key: 'ending-hearth' }] }
    ]
};

module.exports = compileSeason(source);
