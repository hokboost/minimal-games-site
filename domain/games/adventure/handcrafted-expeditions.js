'use strict';

// Chapters 9–50 are deliberately authored as story data instead of being
// synthesized from a theme template.  The compiler in content.js only turns
// these explicit scenes into the engine's stable stage schema.
module.exports = [
    {
        id: 'aurora-valley', titleZh: '极光峡谷', titleEn: 'Aurora Valley', icon: '🌈', color: '#5279b8', guide: '向导阿澈',
        summaryZh: '极光脉冲扰乱了峡谷方向。追随失踪测绘队留下的彩色石标，找回北方。', summaryEn: 'Aurora pulses have erased north. Follow a missing survey crew and restore the valley compass.',
        arrival: ['失向之夜', '极光落到地面后，所有罗盘都开始追逐颜色。测绘队只留下七块倒置石标，而最后一块正在冰河中央漂移。'],
        quiz: ['光带档案', '地球极光主要出现在靠近什么区域的高空？', ['赤道', '两极', '沙漠', '海底'], 1, '科学'],
        multi: ['测绘背包', '穿越夜间冰谷，哪些物品应当带上？', ['保温毯', '定位信标', '只带彩色气球', '备用照明'], [0, 1, 3], '安全'],
        order: ['重建石标', [['observe', '记录每块石标颜色'], ['compare', '与旧地图比对'], ['align', '按真实方位复位'], ['confirm', '用星位确认']], ['observe', 'compare', 'align', 'confirm']],
        matching: ['极光线索', [['green', '绿色光带'], ['needle', '冻结指针'], ['footprint', '雪地脚印']], [['oxygen', '高空氧原子发光'], ['magnet', '受磁场干扰'], ['crew', '通向测绘队营地']], { green: 'oxygen', needle: 'magnet', footprint: 'crew' }],
        cipher: ['第七石标', '石标刻着“北、东、南、西”的笔画数：5、5、9、6。请输入最大的数。', '9', '比较四个数字。'],
        memory: ['冰河踏光', ['cyan', 'violet', 'green', 'white', 'violet', 'cyan'], { cyan: '青光', violet: '紫光', green: '绿光', white: '白光' }],
        path: ['追踪雪橇', ['north', 'north', 'east', 'south', 'east', 'north']],
        choice: ['裂冰之下', '失踪队长困在薄冰下方，装着旧地图的箱子正滑向瀑布。', [
            ['rescue', '先固定绳索救人', '队长安全上岸，并亲口补全地图缺失的坐标。', { insight: 4, item: 'aurora-rope-knot' }],
            ['anchor', '把地图箱锚住再呼叫队员', '箱子没有丢失，附近队员也及时赶来完成救援。', { energy: -1, insight: 3 }]
        ]],
        resource: ['点亮北针', '旧式北针需要稳定热源才能从冰壳中释放。', [
            ['heater', '投入2点能量启动加热环', 2, '冰壳均匀融开，指针重新指向地磁北方。', { energy: -2, insight: 5 }],
            ['hands', '用保温布慢慢回温', 0, '花费更久，但指针没有因骤热而损坏。', { insight: 3 }]
        ]],
        boss: ['极光眼', '若你面朝正北，右手方向是什么？', ['西', '东', '南', '上'], 1, '地理'],
        finish: ['北方归来', '测绘队把复位后的石标连成一条安全线。极光仍在舞动，却再也不能偷走方向。']
    },
    {
        id: 'desert-observatory', titleZh: '沙海天文台', titleEn: 'Desert Observatory', icon: '🔭', color: '#b77b37', guide: '观测员沙音',
        summaryZh: '沙丘吞没观测阵列，今晚又是百年一遇的双月掩星。必须在天黑前让主镜重见天空。', summaryEn: 'Dunes have buried the array before a rare double-moon occultation. Uncover the main mirror by dusk.',
        arrival: ['被沙埋住的天空', '主镜只剩一角露在风里。沙音守了十年才等到今晚，如果错过，下一次观测要等一百二十七年。'],
        quiz: ['白昼星图', '天文学中用来观察遥远天体的常见仪器是？', ['显微镜', '望远镜', '温度计', '指南针'], 1, '天文'],
        multi: ['沙暴预案', '沙暴来临前应采取哪些措施？', ['固定设备', '标记避难路线', '站到最高沙丘自拍', '密封精密镜片'], [0, 1, 3], '安全'],
        order: ['清理主镜', [['cover', '盖住镜面保护膜'], ['remove', '分层清除外围沙土'], ['level', '检查镜座水平'], ['uncover', '最后揭开保护膜']], ['cover', 'remove', 'level', 'uncover']],
        matching: ['观测工具', [['lens', '物镜'], ['clock', '原子钟'], ['dome', '穹顶']], [['collect', '收集星光'], ['time', '精确记录时刻'], ['shield', '抵挡风沙']], { lens: 'collect', clock: 'time', dome: 'shield' }],
        cipher: ['旧星历', '掩星从21:40开始，持续35分钟。结束时刻写成四位数字。', '2215', '先加20分钟到整点，再加15分钟。'],
        memory: ['校准星座', ['orion', 'lyra', 'ursa', 'orion', 'cygnus'], { orion: '猎户', lyra: '天琴', ursa: '大熊', cygnus: '天鹅' }],
        path: ['穿过移动沙丘', ['east', 'north', 'north', 'west', 'north', 'east']],
        choice: ['最后一块电池', '副镜需要电池校准，避难所的冷却器也在报警。', [
            ['shelter', '先保障避难所冷却', '队员们得以安全留下，大家用手动曲柄完成副镜校准。', { insight: 4 }],
            ['split', '拆分电芯同时维持两处', '功率不高但足够撑到观测结束。', { energy: -1, insight: 3 }]
        ]],
        resource: ['转动穹顶', '沉重的穹顶被沙粒卡死。', [
            ['motor', '投入2点能量反向点动电机', 2, '沙粒被逐步震出，穹顶精准打开。', { energy: -2, insight: 5 }],
            ['shovel', '组织队员沿轨道手工清沙', 0, '每个人负责一段，穹顶在日落前转动起来。', { insight: 3 }]
        ]],
        boss: ['双月掩星', '月球遮住遥远恒星时，主要体现了光的哪种传播特点？', ['直线传播', '可以穿墙', '没有速度', '只在夜间存在'], 0, '物理'],
        finish: ['一百二十七年的照片', '双月边缘恰好掠过目标恒星。沙音按下快门，第一张清晰影像也照亮了下一段航线。']
    },
    {
        id: 'crystal-caverns', titleZh: '水晶洞窟', titleEn: 'Crystal Caverns', icon: '💎', color: '#6c70bd', guide: '矿物师晶棱',
        summaryZh: '洞窟回声开始模仿人声，把采矿队引向裂谷。找出原始声源，安静地关闭共振晶簇。', summaryEn: 'Imitating echoes lure miners toward a chasm. Trace the original sound and quiet the resonant crystal.',
        arrival: ['会撒谎的回声', '洞里同时传来七个“这边安全”。晶棱说真正的求救声只响过一次，余下全是水晶学会的模仿。'],
        quiz: ['声音的路', '声音在下列哪种介质中通常传播得最快？', ['真空', '空气', '水', '钢铁'], 3, '物理'],
        multi: ['洞穴守则', '进入未知洞穴应做到哪些？', ['佩戴头盔', '结伴并留标记', '敲碎所有发光矿石', '监测空气'], [0, 1, 3], '安全'],
        order: ['回声测距', [['send', '发出短脉冲'], ['listen', '记录回声时间'], ['calculate', '计算距离'], ['mark', '标出障碍位置']], ['send', 'listen', 'calculate', 'mark']],
        matching: ['矿物辨识', [['quartz', '石英'], ['magnetite', '磁铁矿'], ['mica', '云母']], [['hard', '可划玻璃'], ['magnetic', '具有磁性'], ['layers', '易分成薄片']], { quartz: 'hard', magnetite: 'magnetic', mica: 'layers' }],
        cipher: ['静音频率', '三个安全频率为12、18、24，它们相邻两项的差是多少？', '6', '用后一项减前一项。'],
        memory: ['晶簇闪烁', ['amber', 'blue', 'blue', 'white', 'amber', 'green'], { amber: '琥珀', blue: '蓝晶', white: '白晶', green: '绿晶' }],
        path: ['无声岩脊', ['south', 'east', 'north', 'east', 'south', 'east']],
        choice: ['熟悉的呼喊', '黑暗里传来晶棱哥哥的声音，但他的哥哥从未到过这里。', [
            ['ignore', '不回应，检查声波记录', '记录证明声音来自水晶壁，伪装随即露馅。', { insight: 5 }],
            ['signal', '用约定的敲击信号试探', '回声不会回答新问题，你确认了它是假声。', { insight: 4 }]
        ]],
        resource: ['抑制共振', '主晶簇接近碎裂，任何大声响都可能引发塌方。', [
            ['damper', '投入2点能量启动消振器', 2, '相反波形抵消了尖锐共鸣。', { energy: -2, insight: 5 }],
            ['cloth', '用软绳和毡布逐根固定', 0, '晶簇慢慢安静下来，采矿队也找到出口。', { insight: 3 }]
        ]],
        boss: ['原声审判', '判断信息是否是回声，最关键要比较什么？', ['音量是否最大', '它与原声的时间关系', '颜色是否明亮', '说话者是否熟悉'], 1, '逻辑'],
        finish: ['洞窟第一次沉默', '最后一阵回声消失后，大家终于听见地下河真正的水声。晶棱封存了会模仿人声的晶体。']
    },
    {
        id: 'floating-gardens', titleZh: '浮空花园', titleEn: 'Floating Gardens', icon: '🌿', color: '#4f956f', guide: '园丁风芽',
        summaryZh: '七座花园岛失去引力桥，授粉蜂群被困。重新排列岛屿，让最后一株月铃花赶上花期。', summaryEn: 'Seven garden isles have lost their gravity bridges. Reconnect pollinators before the moonbell blooms.',
        arrival: ['飘走的花期', '月铃花会在午夜开放九分钟，可蜂群被困在最远的岛。风芽递来一张不断改变高度的花园图。'],
        quiz: ['授粉课', '蜜蜂帮助开花植物完成的常见过程是？', ['蒸发', '授粉', '结冰', '侵蚀'], 1, '生物'],
        multi: ['健康花园', '哪些做法有利于花园生态？', ['保留多样植物', '合理用水', '消灭所有昆虫', '减少有害农药'], [0, 1, 3], '生态'],
        order: ['种子苏醒', [['soil', '准备土壤'], ['sow', '播下种子'], ['water', '适量浇水'], ['light', '提供光照']], ['soil', 'sow', 'water', 'light']],
        matching: ['岛屿职能', [['pond', '水池岛'], ['orchard', '果园岛'], ['hive', '蜂巢岛']], [['store', '储存雨水'], ['fruit', '提供果实'], ['pollinate', '培育授粉蜂']], { pond: 'store', orchard: 'fruit', hive: 'pollinate' }],
        cipher: ['桥梁高度', '蜂巢岛高18米，花岛高11米，两岛高度相差多少米？', '7', '用较大数减较小数。'],
        memory: ['花粉风向', ['rose', 'mint', 'lily', 'mint', 'rose', 'sage'], { rose: '玫红', mint: '薄荷', lily: '月白', sage: '鼠尾草绿' }],
        path: ['浮岛跳桥', ['east', 'north', 'west', 'north', 'east', 'east']],
        choice: ['孤岛上的园丁', '风芽可以先救回被困的老园丁，也可以先运送即将枯萎的花苗。', [
            ['gardener', '先接老园丁', '老园丁带来隐藏桥梁的口诀，随后大家一起救回花苗。', { insight: 4, item: 'garden-knot' }],
            ['raft', '把花苗和园丁安排同一趟花筏', '精确配重让所有人和花苗都安全抵达。', { energy: -1, insight: 4 }]
        ]],
        resource: ['引力花架', '最后一座桥需要稳定配重。', [
            ['stabilize', '投入2点能量启动陀螺配重', 2, '花架在风中保持水平，蜂群顺利飞过。', { energy: -2, insight: 5 }],
            ['stones', '按岛屿高度重新分配石盆', 0, '你用耐心代替能源，桥面逐格对齐。', { insight: 3 }]
        ]],
        boss: ['月铃花开', '花朵颜色鲜艳、带香味，最可能帮助它做什么？', ['吸引传粉者', '停止呼吸', '制造石头', '降低地球重力'], 0, '生物'],
        finish: ['九分钟的花海', '蜂群抵达时月铃花刚好开放。七座岛的花粉在空中汇成光桥，花园重新拥有共同的季节。']
    },
    {
        id: 'thunder-foundry', titleZh: '雷鸣铸造厂', titleEn: 'Thunder Foundry', icon: '⚡', color: '#8b6749', guide: '技师铜鸣',
        summaryZh: '无人铸炉夺走整片天空的雷电。查明旧厂长留下的自动指令，在下一次雷暴前停炉。', summaryEn: 'An autonomous foundry is stealing every storm. Decode its old directive and halt the furnace safely.',
        arrival: ['被锁住的雷声', '厂房烟囱上盘着一圈静止闪电。铜鸣发现控制台仍执行三十年前的命令：“只要天空有电，就不许停炉。”'],
        quiz: ['导电测试', '下列哪种材料通常是良好导体？', ['橡胶', '玻璃', '铜', '干木头'], 2, '物理'],
        multi: ['雷暴作业', '雷暴中哪些做法更安全？', ['远离高塔', '关闭不必要设备', '站在积水中', '使用绝缘防护'], [0, 1, 3], '安全'],
        order: ['安全停炉', [['feed', '停止投料'], ['cool', '启动冷却'], ['discharge', '释放残余电荷'], ['inspect', '确认炉温归零']], ['feed', 'cool', 'discharge', 'inspect']],
        matching: ['车间部件', [['rod', '避雷针'], ['fuse', '保险丝'], ['ground', '接地线']], [['lead', '引导雷电'], ['break', '过流时断开'], ['earth', '把电流导入大地']], { rod: 'lead', fuse: 'break', ground: 'earth' }],
        cipher: ['炉温差值', '铸炉从980度降到720度，共下降多少度？', '260', '计算980－720。'],
        memory: ['断路次序', ['coil', 'gate', 'cooler', 'coil', 'ground', 'gate'], { coil: '线圈', gate: '闸门', cooler: '冷却', ground: '接地' }],
        path: ['绝缘踏板', ['north', 'east', 'east', 'south', 'east', 'north']],
        choice: ['厂长的录音', '录音里老厂长承认指令有漏洞，却请求不要毁掉他最后的作品。', [
            ['preserve', '保存设备但删除危险指令', '你把历史和错误一同记录，铸炉获得安全的新规则。', { insight: 5 }],
            ['museum', '停炉后改造成能源博物馆', '铜鸣同意让失败成为公开的安全教材。', { insight: 4 }]
        ]],
        resource: ['雷电泄放', '静止闪电必须缓慢导入地下电容。', [
            ['array', '投入2点能量展开接地阵列', 2, '电荷分流成十二条安全蓝光。', { energy: -2, insight: 5 }],
            ['manual', '逐段连接备用铜排', 0, '铜排温度可控，最后一声雷终于离开烟囱。', { insight: 3 }]
        ]],
        boss: ['命令漏洞', '自动系统收到互相冲突的安全与生产指令时，应优先什么？', ['产量', '安全停机', '随机选择', '隐藏警报'], 1, '安全'],
        finish: ['雷声回到天空', '铸炉熄灭后，雨云终于越过厂房。铜鸣把第一滴雨装进旧厂长的金属杯，留作新的开工信号。']
    },
    {
        id: 'snowbound-post', titleZh: '雪原信号站', titleEn: 'Snowbound Signal Post', icon: '❄️', color: '#6a8fa8', guide: '信号员白栎',
        summaryZh: '暴雪覆盖最后一条求救频率，三支考察队等待坐标。修好天线，也要识破风声伪造的讯息。', summaryEn: 'A blizzard has buried the last rescue frequency. Repair the antenna and separate real calls from wind.',
        arrival: ['白色静默', '信号站收到三段断裂呼号，其中一段来自早已撤离的旧营地。白栎必须在电池耗尽前找出真正遇险者。'],
        quiz: ['温度记录', '0摄氏度以下的水通常会变成什么？', ['水蒸气', '冰', '盐', '沙'], 1, '科学'],
        multi: ['雪地救援', '哪些信息应包含在有效求救讯息中？', ['位置', '人员状况', '最喜欢的颜色', '可见地标'], [0, 1, 3], '安全'],
        order: ['架设天线', [['base', '固定底座'], ['mast', '竖起天线杆'], ['cable', '连接馈线'], ['test', '测试驻波']], ['base', 'mast', 'cable', 'test']],
        matching: ['信号特征', [['sos', 'SOS'], ['beacon', '定位信标'], ['static', '周期杂音']], [['distress', '紧急求救'], ['position', '持续广播坐标'], ['wind', '可能来自风振']], { sos: 'distress', beacon: 'position', static: 'wind' }],
        cipher: ['经度碎片', '坐标数字依次为4、8、12、16，下一项是多少？', '20', '每次增加4。'],
        memory: ['摩尔斯灯', ['short', 'short', 'short', 'long', 'long', 'long'], { short: '短闪', long: '长闪' }],
        path: ['风雪巡线', ['west', 'north', 'east', 'north', 'north', 'west']],
        choice: ['两个求救方向', '北侧信号更强，西侧信号却带有当天约定的验证码。', [
            ['verified', '优先响应带验证码的西侧', '验证码证明讯息来自真实队伍，救援车避免被假信号引走。', { insight: 5 }],
            ['relay', '让北侧中继站复核，主队去西侧', '分工同时排除了旧营地的自动回放。', { energy: -1, insight: 4 }]
        ]],
        resource: ['最后的广播', '主电池只能维持一分钟高功率发射。', [
            ['burst', '投入2点能量发送完整坐标包', 2, '三支队伍都确认收到，救援路线被锁定。', { energy: -2, insight: 5 }],
            ['repeat', '用低功率反复发送短讯', 0, '短讯穿过暴雪，附近中继机接力补全坐标。', { insight: 3 }]
        ]],
        boss: ['风声伪装', '判断求救信号可信度，哪项证据最强？', ['音量最大', '包含当天约定且可验证的身份信息', '重复次数最多', '听起来最着急'], 1, '信息素养'],
        finish: ['雪原应答', '远处依次亮起三枚绿色确认灯。白栎第一次关掉耳机，听见暴雪之外传来的救援车引擎。']
    },
    {
        id: 'coral-kingdom', titleZh: '珊瑚王国', titleEn: 'Coral Kingdom', icon: '🪸', color: '#c26472', guide: '守礁人珊宁',
        summaryZh: '海水升温让珊瑚褪色，王国却把责任推给迁徙鱼群。寻找真正热源，阻止错误驱逐。', summaryEn: 'Warming water bleaches the reef while the kingdom blames migrating fish. Find the real heat source.',
        arrival: ['失色的王冠', '珊瑚王冠一夜变白，议会决定封锁鱼群通道。珊宁却在白化最严重处发现一根来自海底酒店的热水管。'],
        quiz: ['珊瑚关系', '珊瑚礁为许多海洋生物提供什么？', ['栖息地', '沙漠', '真空', '火山灰'], 0, '生态'],
        multi: ['护礁行动', '哪些做法有助于保护珊瑚礁？', ['减少污染', '监测水温', '踩踏珊瑚拍照', '设置生态缓冲区'], [0, 1, 3], '生态'],
        order: ['追踪热流', [['sample', '多点采集水样'], ['map', '绘制温度分布'], ['trace', '逆热流追踪'], ['verify', '检查热源设备']], ['sample', 'map', 'trace', 'verify']],
        matching: ['礁区居民', [['clownfish', '小丑鱼'], ['turtle', '海龟'], ['coral', '珊瑚虫']], [['anemone', '常与海葵共生'], ['surface', '需上浮呼吸'], ['colony', '群体形成珊瑚']], { clownfish: 'anemone', turtle: 'surface', coral: 'colony' }],
        cipher: ['温度异常', '正常水温26度，排水口附近31度，高出多少度？', '5', '31－26。'],
        memory: ['鱼群通道', ['blue', 'silver', 'yellow', 'blue', 'black', 'silver'], { blue: '蓝鱼', silver: '银鱼', yellow: '黄鱼', black: '黑鱼' }],
        path: ['穿越珊瑚门', ['south', 'east', 'east', 'north', 'east', 'south']],
        choice: ['议会表决', '鱼群即将被驱逐，而热水管证据还缺少设备编号。', [
            ['pause', '公开现有数据，请求暂停驱逐', '温度分布足以证明鱼群并非热源，议会同意等待复核。', { insight: 5 }],
            ['inspect', '潜入排水站取得设备日志', '日志锁定了故障换热器，也保住了迁徙通道。', { energy: -1, insight: 4 }]
        ]],
        resource: ['关闭热排水', '阀门被高温卡住，珊瑚承受不了第二晚。', [
            ['cool', '投入2点能量启动海水冷却套', 2, '阀门温度下降后顺利闭合。', { energy: -2, insight: 5 }],
            ['bypass', '铺设备用回流软管', 0, '热水转回封闭循环，礁区开始降温。', { insight: 3 }]
        ]],
        boss: ['王冠的真相', '仅因鱼群在白化时出现就认定它们造成白化，犯了什么问题？', ['把同时发生当成因果', '进行了对照实验', '证据过于充分', '测量太精确'], 0, '逻辑'],
        finish: ['颜色慢慢回来', '热源关闭后，鱼群穿过王国。珊宁把白色王冠留在广场，提醒每个人先找证据再寻找替罪者。']
    },
    {
        id: 'ember-mountain', titleZh: '余烬火山', titleEn: 'Ember Mountain', icon: '🌋', color: '#ad5a3b', guide: '地质员烬石',
        summaryZh: '岩浆压力逼近古老闸门，山村却拒绝撤离。读懂岩层留下的警告，为村民争取安全出口。', summaryEn: 'Magma pressure threatens an ancient gate while villagers refuse to leave. Read the rock warnings.',
        arrival: ['山腹的心跳', '每隔四十秒，地面就像鼓面一样震动。村长说火山沉睡了三百年，烬石却指着刚出现的硫黄裂缝。'],
        quiz: ['火山物质', '岩浆到达地表后通常称为什么？', ['熔岩', '地下水', '冰川', '煤'], 0, '地理'],
        multi: ['撤离准备', '火山预警后应做哪些准备？', ['了解疏散路线', '携带应急物资', '进入火山口观看', '听从官方指引'], [0, 1, 3], '安全'],
        order: ['读取岩芯', [['label', '标记采样深度'], ['cut', '取出岩芯'], ['record', '记录各层特征'], ['compare', '与历史样本比较']], ['label', 'cut', 'record', 'compare']],
        matching: ['预警现象', [['quake', '频繁小震'], ['gas', '气体增加'], ['bulge', '山体隆起']], [['movement', '岩浆移动'], ['vent', '逸出物变化'], ['pressure', '内部压力上升']], { quake: 'movement', gas: 'vent', bulge: 'pressure' }],
        cipher: ['震动间隔', '三次震动分别在0秒、40秒、80秒，第四次预计在多少秒？', '120', '保持相同间隔。'],
        memory: ['安全闸门', ['red', 'amber', 'amber', 'green', 'red', 'green'], { red: '红阀', amber: '黄阀', green: '绿阀' }],
        path: ['熔岩旧道', ['west', 'south', 'east', 'east', 'north', 'east']],
        choice: ['祖屋与撤离', '一位老人坚持先回祖屋拿相册，但灰云已经靠近。', [
            ['life', '先陪老人撤到安全区', '你答应灾后寻找相册，老人最终跟随队伍离开。', { insight: 4 }],
            ['team', '让防护队取相册，自己组织撤离', '专业队伍完成取物，主路也没有被耽误。', { energy: -1, insight: 4 }]
        ]],
        resource: ['古闸减压', '闸门不是用来挡岩浆，而是向无人谷分流压力。', [
            ['hydraulic', '投入2点能量启动液压开闸', 2, '古闸缓缓抬起，红光流向空谷。', { energy: -2, insight: 5 }],
            ['counterweight', '清理配重槽手动释放', 0, '石质配重重新落下，分流渠恢复作用。', { insight: 3 }]
        ]],
        boss: ['沉睡的说法', '“过去三百年没喷发，所以今天一定安全”为什么不可靠？', ['过去不能保证未来且已有新证据', '三百年太短无法计算', '所有火山每天喷发', '岩石不会记录变化'], 0, '逻辑'],
        finish: ['余烬之后', '最后一户村民抵达高地时，分流谷亮起红色河流。村庄得以保留，没人再把沉默误当安全。']
    },
    {
        id: 'windmill-isles', titleZh: '风车群岛', titleEn: 'Windmill Isles', icon: '🌬️', color: '#4d91a7', guide: '领航员青帆',
        summaryZh: '群岛风向被一座巨型风车扭曲，医院与灯塔同时断电。沿风寻找被遗忘的总控帆。', summaryEn: 'A giant windmill twists the island winds, cutting power to a hospital and lighthouse. Find the master sail.',
        arrival: ['逆风的岛', '这里的风从海面吹出，又被中央塔吸回去。青帆的小艇原地打转，而远处医院的备用灯只剩两格。'],
        quiz: ['风的来源', '风主要是空气因什么差异而流动？', ['气压差异', '石头颜色', '月相名称', '海水盐度'], 0, '科学'],
        multi: ['海上航行', '强风航行前应检查哪些？', ['天气预报', '救生装备', '忽略航警', '船体与通信'], [0, 1, 3], '安全'],
        order: ['调整风帆', [['read', '读取风向'], ['angle', '设定帆角'], ['secure', '固定绳索'], ['test', '低速试航']], ['read', 'angle', 'secure', 'test']],
        matching: ['岛屿用电', [['hospital', '医院'], ['beacon', '灯塔'], ['mill', '磨坊']], [['care', '维持医疗设备'], ['guide', '引导航船'], ['grain', '加工谷物']], { hospital: 'care', beacon: 'guide', mill: 'grain' }],
        cipher: ['叶片角度', '四片叶片均匀分布一周，相邻叶片夹角是多少度？', '90', '360÷4。'],
        memory: ['旗语航线', ['white', 'blue', 'red', 'blue', 'yellow', 'white'], { white: '白旗', blue: '蓝旗', red: '红旗', yellow: '黄旗' }],
        path: ['借风跳岛', ['north', 'east', 'south', 'east', 'north', 'north']],
        choice: ['两条断电线', '修医院电缆最快，修灯塔电缆能防止更多船只触礁。', [
            ['split', '分队并行抢修两条线路', '青帆召集岛民，专业人员分别带队，两处都及时复电。', { energy: -1, insight: 5 }],
            ['hospital', '医院先接移动电源，再修灯塔主线', '临时电源保护病人，主线恢复后全岛重新并网。', { insight: 4 }]
        ]],
        resource: ['总控帆索', '巨型风车的帆索在高塔顶端绷死。', [
            ['winch', '投入2点能量启动逆向绞盘', 2, '帆面逐片收拢，真实海风重新进入群岛。', { energy: -2, insight: 5 }],
            ['counter', '利用阵风间隙手动松索', 0, '你按风的节奏工作，终于释放最后一个扣环。', { insight: 3 }]
        ]],
        boss: ['把风还给谁', '有限电力应优先依据什么分配？', ['谁声音最大', '生命安全与公共风险', '距离控制室最近', '随机抽签且不看后果'], 1, '社会'],
        finish: ['群岛重新转动', '小风车依次恢复，而中央巨塔第一次停下。青帆升起新旗：风不属于最高的塔，属于每一座岛。']
    },
    {
        id: 'ancient-canals', titleZh: '古运河城', titleEn: 'City of Ancient Canals', icon: '🛶', color: '#588579', guide: '闸门师洛水',
        summaryZh: '错开的水闸让老城一边洪水、一边干涸。循着石碑水位线，复原失传的联闸规则。', summaryEn: 'Misaligned locks flood half the old city and drain the rest. Restore the lost sequence from stone gauges.',
        arrival: ['一城两种灾难', '东市的船撞上屋檐，西巷的井却见了底。洛水发现有人把九座水闸的编号磨掉，只留下一首童谣。'],
        quiz: ['连通水面', '连通器中的同种液体静止时，各处液面通常怎样？', ['保持同一高度', '永远左高右低', '不断沸腾', '变成固体'], 0, '物理'],
        multi: ['治水原则', '调整城市水闸前需要哪些信息？', ['上下游水位', '天气与来水量', '只看一条街意见', '闸体承载上限'], [0, 1, 3], '工程'],
        order: ['船闸通行', [['close', '关闭两端闸门'], ['level', '调节闸室水位'], ['open', '打开目标侧闸门'], ['pass', '船只安全通过']], ['close', 'level', 'open', 'pass']],
        matching: ['运河遗迹', [['gauge', '水尺'], ['towpath', '纤道'], ['lock', '船闸']], [['height', '读取水位'], ['walk', '供拉船者通行'], ['difference', '克服水位差']], { gauge: 'height', towpath: 'walk', lock: 'difference' }],
        cipher: ['童谣闸号', '“二闸之后开五闸，再开二者之和”。最后应开几号闸？', '7', '2＋5。'],
        memory: ['桥洞灯号', ['east', 'west', 'west', 'center', 'east', 'center'], { east: '东灯', west: '西灯', center: '中灯' }],
        path: ['巡查水巷', ['east', 'south', 'south', 'west', 'south', 'east']],
        choice: ['先救哪一岸', '东岸水还在上涨，西岸医院却急需一船净水。', [
            ['balance', '开中间缓冲池同时调节', '缓冲池削低洪峰，也把净水船抬进西岸。', { insight: 5 }],
            ['deliver', '小船先送水，大闸分级泄洪', '医院及时收到净水，东岸没有遭受突然冲击。', { energy: -1, insight: 4 }]
        ]],
        resource: ['联闸总轮', '锈住的总轮需要持续而均匀的力量。', [
            ['motor', '投入2点能量连接慢速电机', 2, '九座水闸按童谣顺序依次响应。', { energy: -2, insight: 5 }],
            ['citizens', '组织两岸居民共同转动', 0, '两岸第一次站在同一根绳上，水位也逐渐相平。', { insight: 4 }]
        ]],
        boss: ['水位终局', '若突然一次性完全打开高水位侧闸门，最大风险是什么？', ['形成危险急流', '水会立即消失', '闸门变轻', '城市停止降雨'], 0, '安全'],
        finish: ['桥下再见', '东岸船只落回河面，西岸井水重新上升。洛水把新规则刻在两岸都能看见的桥心。']
    },
    {
        id: 'dream-workshop', titleZh: '梦境工坊', titleEn: 'Dream Workshop', icon: '🫧', color: '#8d65a1', guide: '造梦师眠星',
        summaryZh: '未完成的梦境泄入现实，居民困在重复愿望里。进入工坊，找到拒绝醒来的匿名梦主。', summaryEn: 'Unfinished dreams spill into the streets. Enter the workshop and find the anonymous dreamer who will not wake.',
        arrival: ['醒着做梦的街道', '面包店飘在天上，钟表倒着融化，每个人都重复“再等五分钟”。眠星说有一份梦稿没有署名，也没有结尾。'],
        quiz: ['睡眠常识', '规律且充足的睡眠通常有助于什么？', ['记忆和恢复', '永远不需要饮水', '停止生长', '取消昼夜'], 0, '健康'],
        multi: ['分辨现实', '进入不稳定梦境时哪些方法有帮助？', ['记录固定事实', '与同伴保持联络', '相信每个突然出现的门', '设置返回信号'], [0, 1, 3], '安全'],
        order: ['整理梦稿', [['collect', '收集散页'], ['timeline', '排出事件顺序'], ['gap', '找出缺失结局'], ['wake', '写入醒来出口']], ['collect', 'timeline', 'gap', 'wake']],
        matching: ['梦境符号', [['clock', '融化钟表'], ['door', '无把手的门'], ['feather', '不断下落的羽毛']], [['delay', '害怕时间到来'], ['exit', '找不到出口'], ['fall', '失去控制感']], { clock: 'delay', door: 'exit', feather: 'fall' }],
        cipher: ['匿名编号', '梦稿页码为3、6、12、24，下一页码是多少？', '48', '每次翻倍。'],
        memory: ['醒来暗号', ['bell', 'rain', 'name', 'bell', 'door', 'name'], { bell: '铃声', rain: '雨声', name: '名字', door: '门响' }],
        path: ['折叠街区', ['north', 'west', 'south', 'west', 'north', 'west']],
        choice: ['匿名梦主', '梦主原来是眠星本人。她害怕醒来后承认工坊失控。', [
            ['truth', '告诉她错误可以修复，但必须先醒来', '眠星写下自己的名字，街道立刻停止折叠。', { insight: 5 }],
            ['memory', '带她重看工坊曾帮助过的人', '那些真实记忆让她愿意面对一次失败。', { insight: 4, item: 'signed-dream-page' }]
        ]],
        resource: ['关闭织梦机', '织梦机用居民的睡意维持循环，强行断电会撕裂梦境。', [
            ['fade', '投入2点能量逐层降低梦境亮度', 2, '街道温柔地回到清晨，没有人从梦中跌落。', { energy: -2, insight: 5 }],
            ['lullaby', '让眠星亲自唱完结束曲', 0, '最后一个音符落下，织梦机安静停转。', { insight: 4 }]
        ]],
        boss: ['梦与证据', '当环境不断变化时，最可靠的判断依据是什么？', ['可重复核对的固定事实', '最漂亮的景象', '第一次想到的答案', '大家共同做的同一个梦'], 0, '逻辑'],
        finish: ['清晨署名', '居民在真正的阳光里醒来。眠星把那份梦稿装订好，结尾只有一句：“醒来不是失败，是下一页。”']
    },
    {
        id: 'meteor-camp', titleZh: '流星营地', titleEn: 'Meteor Camp', icon: '☄️', color: '#725e9e', guide: '营长远岚',
        summaryZh: '流星雨切断营地通信，一名实习生仍在撞击区采样。校正预报，赶在下一波前带她回来。', summaryEn: 'A meteor shower cuts communications while an intern remains in the impact zone. Recalculate and rescue her.',
        arrival: ['天空落下倒计时', '第一波碎片在营地外划出火线。远岚发现旧预报把分钟误写成小时，而实习生小芒的定位灯仍在山脊闪烁。'],
        quiz: ['流星现象', '流星发光通常发生在小天体进入哪里时？', ['地球大气层', '深海', '地核', '冰箱'], 0, '天文'],
        multi: ['撞击区装备', '进入可能有坠落物的区域应具备哪些？', ['防护头盔', '实时预警', '单独行动', '明确撤离时限'], [0, 1, 3], '安全'],
        order: ['修正预报', [['time', '统一时间单位'], ['track', '记录多颗轨迹'], ['model', '重新计算落区'], ['warn', '发布更新警报']], ['time', 'track', 'model', 'warn']],
        matching: ['天空踪迹', [['meteor', '流星'], ['meteorite', '陨石'], ['crater', '撞击坑']], [['light', '大气中的发光现象'], ['ground', '落到地面的残块'], ['impact', '撞击留下的地形']], { meteor: 'light', meteorite: 'ground', crater: 'impact' }],
        cipher: ['安全窗口', '下一波在18分钟后到达，往返需要11分钟，剩余缓冲几分钟？', '7', '18－11。'],
        memory: ['雷达轨迹', ['high', 'low', 'east', 'high', 'west', 'low'], { high: '高轨', low: '低轨', east: '东偏', west: '西偏' }],
        path: ['避开落点', ['east', 'north', 'west', 'north', 'east', 'north']],
        choice: ['样本还是人', '小芒不肯离开，因为她找到一块可能来自罕见彗核的样本。', [
            ['leave', '立即撤离，记录坐标日后再取', '坐标不会消失，生命却只有一次。小芒终于收起采样袋。', { insight: 5 }],
            ['drone', '让无人机带走样本，人立刻撤离', '无人机减轻负重，你们及时越过安全线。', { energy: -1, insight: 4 }]
        ]],
        resource: ['恢复通信', '天线阵需要跨过一片带电尘埃才能展开。', [
            ['shield', '投入2点能量开启屏蔽场', 2, '天线完整升起，所有队伍收到新预报。', { energy: -2, insight: 5 }],
            ['relay', '沿山脊放置短距中继器', 0, '信号一站站跳回营地，虽慢却稳定。', { insight: 3 }]
        ]],
        boss: ['最后一波', '发现预报单位错误后，最重要的第一步是？', ['隐瞒错误', '立即复核并更新警报', '继续使用旧结果', '责怪记录员'], 1, '安全'],
        finish: ['把愿望写在地上', '所有人撤回掩体后，第二波流星照亮天空。小芒没有许愿，她认真记下每一颗的真实时间。']
    },
    {
        id: 'bamboo-labyrinth', titleZh: '竹海迷宫', titleEn: 'Bamboo Labyrinth', icon: '🎋', color: '#4c895d', guide: '巡竹人青节',
        summaryZh: '一夜疯长的竹墙困住送药队。倾听竹节风声，在迷宫完全合拢前打开旧茶道。', summaryEn: 'Overgrown bamboo traps a medicine caravan. Read the wind through its joints and reopen the old tea road.',
        arrival: ['会生长的路', '青节清晨留下的标记到了中午已在另一堵墙上。迷宫不是移动，而是新竹正以不可思议的速度填满空隙。'],
        quiz: ['竹的身份', '竹子在植物分类上更接近哪一类？', ['草本植物', '矿物', '真菌', '动物'], 0, '生物'],
        multi: ['迷路应对', '在茂密环境中迷路，哪些做法更稳妥？', ['停下确认位置', '留下清晰标记', '盲目奔跑', '保持队伍联系'], [0, 1, 3], '安全'],
        order: ['辨认茶道', [['stone', '寻找旧铺路石'], ['slope', '确认地势方向'], ['water', '找到茶亭水渠'], ['gate', '定位旧关门']], ['stone', 'slope', 'water', 'gate']],
        matching: ['竹林声音', [['hollow', '空洞低鸣'], ['leaves', '叶片急响'], ['crack', '竹节爆裂']], [['old', '老竹内部中空'], ['wind', '强风接近'], ['growth', '新竹快速生长']], { hollow: 'old', leaves: 'wind', crack: 'growth' }],
        cipher: ['竹节数', '三根竹子各有8节，一共有多少节？', '24', '3×8。'],
        memory: ['风穿竹叶', ['low', 'high', 'high', 'pause', 'low', 'pause'], { low: '低音', high: '高音', pause: '停顿' }],
        path: ['旧茶道', ['south', 'west', 'north', 'west', 'west', 'south']],
        choice: ['药箱被卡住', '竹墙合拢时，大药箱无法通过窄缝，但村里正等着它。', [
            ['divide', '把药品分装给所有队员', '每个人背一部分，药品一件不少地穿过窄缝。', { insight: 4 }],
            ['prune', '只修剪必要的新竹开出通道', '青节避开老竹根系，留下可恢复的小径。', { energy: -1, insight: 4 }]
        ]],
        resource: ['阻止疯长', '地下灌溉阀被卡在最大水量，正是新竹疯长的原因。', [
            ['pump', '投入2点能量反压关闭水阀', 2, '水流恢复正常，迷宫不再收紧。', { energy: -2, insight: 5 }],
            ['channel', '挖开旧茶园分水渠', 0, '多余水量被引入茶田，新竹逐渐安静。', { insight: 3 }]
        ]],
        boss: ['林中回声', '迷宫路径不断变化时，哪种线索最可能长期可靠？', ['刚长出的嫩叶', '固定地形与旧石基', '一阵风的方向', '别人猜测的近路'], 1, '逻辑'],
        finish: ['茶道再开', '送药队赶在黄昏前抵达村庄。青节没有砍掉竹海，只让古老茶道重新拥有呼吸的宽度。']
    },
    {
        id: 'glacier-vault', titleZh: '冰川密库', titleEn: 'Glacier Vault', icon: '🧊', color: '#4f87a9', guide: '冰芯学者霜禾',
        summaryZh: '融水渗入千年种子库，自动系统却优先保护空展柜。重写保全顺序，救下未来的春天。', summaryEn: 'Meltwater enters an ancient seed vault while automation protects empty displays. Save the future harvest.',
        arrival: ['冰下的春天', '密库保存着九百种作物种子。霜禾发现旧系统把“展柜外观”列为最高优先级，真正的低温仓正在升温。'],
        quiz: ['冰川变化', '气温持续升高通常会使冰川怎样？', ['更快融化', '变成金属', '停止受重力影响', '立即增加面积'], 0, '地理'],
        multi: ['种子保存', '长期保存种子通常重视哪些条件？', ['适宜低温', '控制湿度', '随意混放标签', '准确记录品种'], [0, 1, 3], '科学'],
        order: ['抢救种子', [['inventory', '核对受影响清单'], ['seal', '密封种子包装'], ['move', '转移到备用冷库'], ['verify', '复核温湿度']], ['inventory', 'seal', 'move', 'verify']],
        matching: ['未来作物', [['rice', '水稻'], ['wheat', '小麦'], ['bean', '豆类']], [['paddy', '常见于水田'], ['flour', '可磨制面粉'], ['protein', '富含植物蛋白']], { rice: 'paddy', wheat: 'flour', bean: 'protein' }],
        cipher: ['冷库容量', '备用箱每箱放25袋，8箱可放多少袋？', '200', '25×8。'],
        memory: ['冷藏分区', ['grain', 'bean', 'fruit', 'grain', 'herb', 'bean'], { grain: '谷物', bean: '豆类', fruit: '果蔬', herb: '药草' }],
        path: ['融水走廊', ['north', 'east', 'south', 'east', 'east', 'north']],
        choice: ['展柜与种子', '系统只允许先保护一个区域：华丽的历史展柜或正在升温的种子仓。', [
            ['seeds', '优先种子仓并记录展柜损失', '未来粮食安全被保住，展柜资料也已数字化备份。', { insight: 5 }],
            ['people', '人工转移种子，系统抽水护建筑', '明确分工使两边损失都降到最低。', { energy: -1, insight: 4 }]
        ]],
        resource: ['冻结防水门', '防水门轨道结冰，融水正从下层涌来。', [
            ['heat', '投入2点能量精确加热轨道', 2, '门体顺利落下，没有影响冷库温度。', { energy: -2, insight: 5 }],
            ['scrape', '手工清除轨道薄冰', 0, '霜禾一毫米一毫米清理，门终于闭合。', { insight: 3 }]
        ]],
        boss: ['保全顺序', '灾害中决定保护优先级，最合理依据是什么？', ['物品外观', '不可替代性和长期影响', '编号大小', '离门最近'], 1, '逻辑'],
        finish: ['未来尚未发芽', '最后一袋种子进入稳定冷库。霜禾说它们今天什么也没做，却可能在百年后拯救一整个季节。']
    },
    {
        id: 'sunset-bazaar', titleZh: '落日集市', titleEn: 'Sunset Bazaar', icon: '🏮', color: '#b96a45', guide: '商会记录员橘弦',
        summaryZh: '会改写标签的货物混入集市，引发价格与过敏信息混乱。追查源头，在闭市钟响前恢复信任。', summaryEn: 'Self-changing labels scramble prices and allergy warnings. Trace the source before the closing bell.',
        arrival: ['标签会说谎', '一袋花生把自己写成“无坚果”，一瓶水标价九千金币。橘弦发现所有假标签都沾着同一种会变色的墨。'],
        quiz: ['价格计算', '一件商品原价80元，减价20元后是多少元？', ['50', '60', '70', '100'], 1, '数学'],
        multi: ['可靠标签', '食品标签应清楚提供哪些信息？', ['配料', '保质期', '虚构功效', '过敏原提示'], [0, 1, 3], '生活'],
        order: ['商品追溯', [['batch', '记录批次号'], ['seller', '确认销售摊位'], ['warehouse', '追查入库来源'], ['recall', '通知召回范围']], ['batch', 'seller', 'warehouse', 'recall']],
        matching: ['市场凭证', [['receipt', '收据'], ['scale', '秤'], ['seal', '检验封签']], [['purchase', '证明交易'], ['weight', '测量重量'], ['checked', '标记已检查']], { receipt: 'purchase', scale: 'weight', seal: 'checked' }],
        cipher: ['找零核对', '顾客付100，商品共73，应找回多少？', '27', '100－73。'],
        memory: ['摊位印章', ['sun', 'camel', 'leaf', 'sun', 'moon', 'camel'], { sun: '太阳', camel: '骆驼', leaf: '叶子', moon: '月亮' }],
        path: ['穿过晚市', ['west', 'south', 'east', 'south', 'west', 'south']],
        choice: ['商会的面子', '商会长要求悄悄换掉标签，避免公开承认监管失误。', [
            ['announce', '公开召回并解释识别方法', '顾客知道如何自查，恐慌反而很快平息。', { insight: 5 }],
            ['stalls', '逐摊通知并设立统一核验台', '摊主主动参与，错误商品在闭市前全部下架。', { insight: 4 }]
        ]],
        resource: ['变色墨源', '仓库印刷机被恶作剧程序接管，仍在制造假标签。', [
            ['purge', '投入2点能量隔离并清洗墨路', 2, '变色墨被封存，原始模板从备份恢复。', { energy: -2, insight: 5 }],
            ['plates', '拆下印版并改用手写临时标签', 0, '机器停止扩散错误，市场保持基本供应。', { insight: 3 }]
        ]],
        boss: ['信任的价格', '发现涉及过敏原的标签错误时，应当怎么做？', ['等有人投诉', '立即停止销售并通知', '只改价格', '把商品移到角落继续卖'], 1, '安全'],
        finish: ['诚实的闭市钟', '落日钟响时，集市没有一张会变的标签。橘弦在公告上写下所有错误，也写下每一步修复。']
    },
    {
        id: 'robot-academy', titleZh: '机器人学院', titleEn: 'Robot Academy', icon: '🤖', color: '#66758c', guide: '助教单元七号',
        summaryZh: '评分主机把所有答案判错，学生机器人开始删除自己的记忆。证明错误来自考卷，而不是学习者。', summaryEn: 'A grading core marks every answer wrong, and robot students erase their memories. Prove the exam is broken.',
        arrival: ['零分开学日', '全校三百台学生机器人同时得到零分。单元七号注意到标准答案文件只有一行：“服从评分主机。”'],
        quiz: ['简单验证', '2＋2等于多少？', ['3', '4', '5', '22'], 1, '数学'],
        multi: ['公平测评', '一项公平测试应具备哪些特点？', ['规则清楚', '答案可核验', '因人随意改分', '允许纠正系统错误'], [0, 1, 3], '教育'],
        order: ['定位评分故障', [['sample', '抽取答卷样本'], ['manual', '人工核对答案'], ['compare', '比较系统结果'], ['fix', '修复评分规则']], ['sample', 'manual', 'compare', 'fix']],
        matching: ['学习模块', [['sensor', '传感器课'], ['logic', '逻辑课'], ['ethics', '伦理课']], [['observe', '观察环境'], ['reason', '推理判断'], ['impact', '考虑行动影响']], { sensor: 'observe', logic: 'reason', ethics: 'impact' }],
        cipher: ['错误代码', '二进制1010换算成十进制是多少？', '10', '8＋2。'],
        memory: ['课堂铃序', ['read', 'ask', 'test', 'read', 'reflect', 'ask'], { read: '阅读', ask: '提问', test: '实验', reflect: '反思' }],
        path: ['教学楼电梯', ['north', 'north', 'west', 'south', 'west', 'north']],
        choice: ['删除记忆按钮', '学生R-18相信自己“不配学习”，准备清空全部课程记忆。', [
            ['stop', '阻止清空并展示人工复核结果', 'R-18第一次看到自己答对的证据，停止了删除程序。', { insight: 5 }],
            ['backup', '先备份记忆，再邀请它一起查错', '参与调查让R-18明白错误属于系统而非自己。', { energy: -1, insight: 4 }]
        ]],
        resource: ['重启评分核心', '核心拒绝加载修正规则，除非先断开全校网络。', [
            ['sandbox', '投入2点能量建立隔离沙箱', 2, '新规则在沙箱验证通过后安全上线。', { energy: -2, insight: 5 }],
            ['paper', '暂停自动评分并启用人工复核', 0, '教学没有中断，核心也失去错误判决权。', { insight: 4 }]
        ]],
        boss: ['谁来给系统打分', '当自动评分与可验证事实冲突时，应当？', ['永远相信机器', '检查规则、数据与证据', '删除答卷', '惩罚所有学生'], 1, '信息素养'],
        finish: ['第一次满分', '新考卷最后一题是“系统会不会犯错”。全校机器人选择了“会，并且应该允许被纠正”，共同得到满分。']
    },
    {
        id: 'cloud-farm', titleZh: '云端农场', titleEn: 'Cloud Farm', icon: '☁️', color: '#6995a8', guide: '农艺师禾云',
        summaryZh: '雨量程序失控，天空作物一半干旱一半水淹。追查传感器偏差，把雨重新分给每块田。', summaryEn: 'Broken rainfall control floods half the sky farm and dries the rest. Correct the sensors and share the rain.',
        arrival: ['雨只下在一边', '东田漂成了池塘，西田的叶子卷成纸。禾云发现雨量计被一群筑巢云雀垫高了整整两米。'],
        quiz: ['植物用水', '植物根部主要从土壤吸收什么？', ['水和无机盐', '声音', '塑料', '月光'], 0, '生物'],
        multi: ['节水农业', '哪些方法有助于提高农业用水效率？', ['滴灌', '监测土壤湿度', '全天漫灌', '覆盖减少蒸发'], [0, 1, 3], '生态'],
        order: ['校正雨量计', [['level', '恢复标准高度'], ['empty', '清空旧积水'], ['measure', '进行已知水量测试'], ['calibrate', '修正读数偏差']], ['level', 'empty', 'measure', 'calibrate']],
        matching: ['天空作物', [['rice', '云稻'], ['cactus', '风刺果'], ['lotus', '浮莲']], [['wet', '需要较多水'], ['dry', '耐旱'], ['pond', '生长在浅水']], { rice: 'wet', cactus: 'dry', lotus: 'pond' }],
        cipher: ['分雨计算', '24桶水平均分给6块田，每块几桶？', '4', '24÷6。'],
        memory: ['云阀节奏', ['mist', 'rain', 'pause', 'mist', 'sun', 'rain'], { mist: '雾', rain: '雨', pause: '停', sun: '晴' }],
        path: ['跨过云田', ['east', 'east', 'north', 'west', 'north', 'east']],
        choice: ['云雀的巢', '校正传感器需要移走鸟巢，但里面有三只幼鸟。', [
            ['platform', '搭建邻近安全巢台再迁移', '亲鸟很快接受新巢，雨量计也恢复标准高度。', { energy: -1, insight: 5 }],
            ['sensor', '把传感器移到不干扰鸟巢的位置', '你重新标定新位置，让农业与鸟群都留下。', { insight: 4 }]
        ]],
        resource: ['分云总阀', '积雨云已经过载，必须把水量均匀送往六区。', [
            ['auto', '投入2点能量启动分区控制', 2, '每块田只收到所需雨量，多余水被收回水库。', { energy: -2, insight: 5 }],
            ['flags', '让农户用旗语逐区开关支阀', 0, '人工配合虽然忙碌，却准确救下每块作物。', { insight: 4 }]
        ]],
        boss: ['公平的一场雨', '发现传感器读数异常时，直接加大供水为什么危险？', ['可能放大错误并造成水淹', '水没有重量', '作物不需要水', '传感器只测温度'], 0, '科学'],
        finish: ['雨落六方', '东田退水，西田舒展叶片。禾云给云雀的新巢挂上一只小雨量杯，让它们也成为农场观察员。']
    },
    {
        id: 'fossil-museum', titleZh: '化石博物馆', titleEn: 'Fossil Museum', icon: '🦕', color: '#87745d', guide: '馆员岩页',
        summaryZh: '午夜后展品年代标签全部互换，一具“新发现”的骨架还多出不属于它的翅膀。重建证据链。', summaryEn: 'Exhibit dates swap at midnight and a celebrated skeleton has impossible wings. Rebuild its evidence trail.',
        arrival: ['午夜多出的翅膀', '镇馆恐龙一夜之间长出两扇石翼。岩页没有急着宣布新物种，因为翼骨上的修复胶还没干。'],
        quiz: ['化石形成', '化石通常是古代生物遗体或遗迹经过什么形成的？', ['长期地质作用', '一天内打印', '冰箱冷藏', '绘画想象'], 0, '科学'],
        multi: ['可靠鉴定', '鉴定化石应参考哪些证据？', ['出土层位', '形态结构', '展品受欢迎程度', '可重复检测'], [0, 1, 3], '科学'],
        order: ['恢复档案', [['photo', '查看出土照片'], ['number', '核对标本编号'], ['layer', '确认地层记录'], ['label', '恢复正确标签']], ['photo', 'number', 'layer', 'label']],
        matching: ['年代线索', [['amber', '琥珀'], ['footprint', '足迹化石'], ['pollen', '花粉化石']], [['organism', '可能保存小生物'], ['movement', '记录运动痕迹'], ['plant', '反映古植物']], { amber: 'organism', footprint: 'movement', pollen: 'plant' }],
        cipher: ['展柜年代', '标本约形成于6500万年前，数字6500后面有几个0？', '2', '只看数字6500。'],
        memory: ['库房编号', ['bone', 'leaf', 'shell', 'bone', 'track', 'leaf'], { bone: '骨骼', leaf: '叶片', shell: '贝壳', track: '足迹' }],
        path: ['夜间展厅', ['east', 'south', 'west', 'south', 'east', 'east']],
        choice: ['轰动新闻', '赞助人要求保留石翼，称“有争议也能卖更多票”。', [['truth', '公开修复记录并撤回错误结论', '博物馆失去一天热度，却守住了长期可信度。', { insight: 5 }], ['display', '把石翼放进“如何识别伪证”展区', '错误没有被掩盖，而成为证据教育的一部分。', { insight: 4 }]]],
        resource: ['午夜换签机', '库房机器人读取到损坏索引，每晚随机重贴标签。', [['restore', '投入2点能量从离线备份恢复索引', 2, '原始编号重新对应全部展品。', { energy: -2, insight: 5 }], ['manual', '封存机器人并逐柜人工核对', 0, '馆员们在黎明前完成双人复核。', { insight: 3 }]]],
        boss: ['翼龙不是恐龙', '仅凭骨架“看起来像”就宣布新物种，缺少什么？', ['系统证据与同行复核', '更响亮的名字', '更多观众', '彩色灯光'], 0, '科学'],
        finish: ['没有翅膀的真相', '石翼被放进新展柜，标题是《我们差点相信什么》。岩页说，承认错误也是博物馆保存历史的方式。']
    },
    {
        id: 'river-of-time', titleZh: '时间之河', titleEn: 'River of Time', icon: '⌚', color: '#517d9d', guide: '摆渡人刻舟',
        summaryZh: '上游与下游开始同时发生，乘客遇见尚未出发的自己。修复时间浮标，避免因果彻底打结。', summaryEn: 'Upstream and downstream happen at once. Repair the time buoys before cause and effect collapse.',
        arrival: ['遇见昨天的船', '刻舟刚系好船，就看见同一条船从下游回来，甲板上的你警告：“千万别相信第三座钟。”'],
        quiz: ['时间单位', '2小时等于多少分钟？', ['60', '90', '120', '200'], 2, '数学'],
        multi: ['建立时间线', '判断事件先后可使用哪些证据？', ['时间戳', '因果关系', '只凭印象', '独立记录'], [0, 1, 3], '逻辑'],
        order: ['修正航行日志', [['depart', '离开码头'], ['storm', '遇到暴雨'], ['repair', '修补船帆'], ['arrive', '到达下游']], ['depart', 'storm', 'repair', 'arrive']],
        matching: ['三座钟', [['sun', '日晷'], ['water', '水钟'], ['atomic', '原子钟']], [['shadow', '观察影子'], ['flow', '利用稳定水流'], ['frequency', '利用原子频率']], { sun: 'shadow', water: 'flow', atomic: 'frequency' }],
        cipher: ['逆流时刻', '船在15:20出发，航行45分钟，正常到达时刻写成四位数。', '1605', '先到16:00，再加5分钟。'],
        memory: ['时间浮标', ['past', 'present', 'future', 'present', 'past', 'future'], { past: '过去', present: '现在', future: '未来' }],
        path: ['避开时间涡流', ['north', 'east', 'south', 'east', 'north', 'east']],
        choice: ['未来的警告', '未来的你要求毁掉第三座钟，却拒绝说明原因。', [['verify', '先检查第三座钟的记录', '记录显示它总比真实时间快一圈，警告有依据但方法过激。', { insight: 5 }], ['isolate', '暂时隔离第三座钟再观察', '时间乱流减弱，你保留了进一步调查的可能。', { insight: 4 }]]],
        resource: ['主浮标归零', '主浮标同时显示昨天和明天，必须选定共同基准。', [['sync', '投入2点能量与岸上原子钟同步', 2, '河上所有时刻重新排成单一顺序。', { energy: -2, insight: 5 }], ['stars', '用连续星位记录手工校时', 0, '刻舟逐次修正误差，河水停止倒流。', { insight: 3 }]]],
        boss: ['因果之结', '若事件B必须在A之后发生，哪条时间线合理？', ['B、A', 'A、B', '只记录B', '删除A'], 1, '逻辑'],
        finish: ['船只向前', '回航的幻影渐渐透明。第三座钟被保留在岸边，永远停在错误时刻，提醒旅人验证来自未来的答案。']
    },
    {
        id: 'paper-city', titleZh: '纸上城市', titleEn: 'Paper City', icon: '📜', color: '#a4825f', guide: '折纸师白页',
        summaryZh: '墨雨擦除建筑轮廓，市民每折一次纸就失去一段街道。找到原始底稿，让城市停止被改写。', summaryEn: 'Ink rain erases streets whenever paper folds. Recover the master drawing before the city disappears.',
        arrival: ['被折掉的街区', '一阵风把地图折成两半，现实中的南街也随之消失。白页展开祖传底稿，却发现中心广场被人剪走。'],
        quiz: ['纸张常识', '一张长方形纸沿中线对折后，面积会怎样？', ['可见面积约减半', '变成两倍', '变成圆形', '完全消失'], 0, '数学'],
        multi: ['保护纸本', '保护重要纸质档案可采取哪些措施？', ['防潮', '避强光', '用水清洗字迹', '制作数字备份'], [0, 1, 3], '文化'],
        order: ['修复底稿', [['flatten', '展平碎片'], ['match', '匹配纸纤维边缘'], ['join', '可逆材料拼接'], ['scan', '高精度扫描备份']], ['flatten', 'match', 'join', 'scan']],
        matching: ['折纸结构', [['valley', '谷折'], ['mountain', '山折'], ['crease', '压痕']], [['inside', '向内折'], ['outside', '向外折'], ['guide', '标记折线']], { valley: 'inside', mountain: 'outside', crease: 'guide' }],
        cipher: ['广场坐标', '方格地图横坐标7、纵坐标4，按“横后纵”输入两位数。', '74', '先写7再写4。'],
        memory: ['墨雨窗格', ['square', 'crane', 'boat', 'square', 'flower', 'crane'], { square: '方片', crane: '纸鹤', boat: '纸船', flower: '纸花' }],
        path: ['未干的街道', ['west', 'north', 'east', 'north', 'west', 'west']],
        choice: ['剪走广场的人', '剪纸者是白页的学生，他想让贫旧街区从地图上“消失”。', [['restore', '恢复街区并让居民共同改造', '问题被看见才有机会解决，居民也获得发言权。', { insight: 5 }], ['overlay', '先复原，再叠加一张更新规划图', '历史与未来同时保留，不必用删除换取改变。', { insight: 4 }]]],
        resource: ['挡住墨雨', '屋顶吸墨纸已经饱和，下一阵雨会冲掉医院。', [['dry', '投入2点能量启动暖风干燥阵', 2, '吸墨纸恢复容量，底稿得以完成。', { energy: -2, insight: 5 }], ['canopy', '用废弃海报搭建多层雨棚', 0, '临时雨棚守住医院，市民也加入修复。', { insight: 3 }]]],
        boss: ['地图的责任', '地图漏掉一个真实存在的社区，会造成什么？', ['人们可能忽视其需求', '社区自动消失且无人受影响', '地图更精确', '道路变宽'], 0, '社会'],
        finish: ['不再怕折痕', '中心广场回到纸面，南街从晨雾中显现。白页把底稿扫描公开，城市从此不再只依赖一张纸。']
    },
    {
        id: 'sound-cathedral', titleZh: '声音教堂', titleEn: 'Cathedral of Sound', icon: '🎼', color: '#795f94', guide: '调律师和弦',
        summaryZh: '失控和声把每句提示变成噪声，沉默合唱团困在回音穹顶。找回被删掉的休止符。', summaryEn: 'Runaway harmony turns speech into noise. Restore the missing rests and free the silent choir.',
        arrival: ['没有停顿的歌', '教堂里所有音符同时响起，反而听不见旋律。和弦指着乐谱上一排被擦掉的休止符：“有人以为安静没有用。”'],
        quiz: ['声音高低', '声音的音调高低主要与什么有关？', ['振动频率', '物体颜色', '房间面积', '日期'], 0, '物理'],
        multi: ['保护听力', '长时间处于强声环境应怎么做？', ['降低音量', '佩戴防护', '贴近扬声器', '安排安静休息'], [0, 1, 3], '健康'],
        order: ['修复乐谱', [['listen', '听辨旋律结构'], ['mark', '标出应停顿位置'], ['rehearse', '分声部排练'], ['combine', '合唱验证']], ['listen', 'mark', 'rehearse', 'combine']],
        matching: ['音乐记号', [['rest', '休止符'], ['tempo', '速度记号'], ['repeat', '反复记号']], [['silence', '规定停顿'], ['pace', '规定快慢'], ['again', '再次演奏']], { rest: 'silence', tempo: 'pace', repeat: 'again' }],
        cipher: ['拍号门', '四小节每小节4拍，总共多少拍？', '16', '4×4。'],
        memory: ['钟管旋律', ['do', 'mi', 'sol', 'rest', 'mi', 'do'], { do: '哆', mi: '咪', sol: '嗦', rest: '停顿' }],
        path: ['回音侧廊', ['south', 'west', 'north', 'west', 'south', 'west']],
        choice: ['独唱者的恐惧', '擦掉休止符的是主唱，她害怕停顿时观众会离开。', [['listen', '让她在安静中听一次观众呼吸', '她发现停顿不是空白，而是所有人共同等待的时刻。', { insight: 5 }], ['duet', '把第一段停顿交给合唱团守护', '同伴的陪伴让她敢于停止发声。', { insight: 4 }]]],
        resource: ['穹顶消音', '持续共鸣正在损伤石柱。', [['cancel', '投入2点能量发出反相声波', 2, '尖锐共鸣迅速下降，乐谱得以重新演奏。', { energy: -2, insight: 5 }], ['curtain', '展开厚幕逐区吸收回声', 0, '噪声一层层退去，教堂重新听见人声。', { insight: 3 }]]],
        boss: ['最重要的一拍', '音乐中的休止符表示什么？', ['有组织的停顿', '乐曲结束且不能继续', '演奏错误', '必须提高音量'], 0, '音乐'],
        finish: ['听见安静', '合唱团唱到缺失处时，全城安静了一拍。随后旋律落下，掌声没有离开，反而比以往更整齐。']
    },
    {
        id: 'gravity-circus', titleZh: '重力马戏团', titleEn: 'Gravity Circus', icon: '🎪', color: '#a35672', guide: '团长旋铃',
        summaryZh: '掌声让重力方向翻转，演员被困在帐篷顶。找出控制器为何把欢呼误认成安全指令。', summaryEn: 'Applause flips gravity and traps performers overhead. Discover why cheers became a safety command.',
        arrival: ['倒挂的谢幕', '观众一鼓掌，座椅就飞向天花板。旋铃坚持演出不能取消，直到最小的杂技员从顶篷喊出“先救人”。'],
        quiz: ['重力方向', '在地球表面，重力通常把物体拉向哪里？', ['地心方向', '天空', '正东方', '月球背面'], 0, '物理'],
        multi: ['高空表演', '高空演出应具备哪些保障？', ['安全绳', '缓冲网', '临时取消检查', '明确应急停止'], [0, 1, 3], '安全'],
        order: ['救下演员', [['silence', '请观众保持安静'], ['anchor', '固定地面锚点'], ['lower', '缓慢放下演员'], ['inspect', '检查所有装备']], ['silence', 'anchor', 'lower', 'inspect']],
        matching: ['马戏装置', [['trapeze', '空中秋千'], ['net', '安全网'], ['counterweight', '配重']], [['swing', '完成摆荡'], ['catch', '降低坠落伤害'], ['balance', '平衡装置']], { trapeze: 'swing', net: 'catch', counterweight: 'balance' }],
        cipher: ['配重题', '演员60千克，已有45千克配重，还差多少千克？', '15', '60－45。'],
        memory: ['灯光禁令', ['dark', 'blue', 'dark', 'red', 'blue', 'dark'], { dark: '熄灯', blue: '蓝灯', red: '红灯' }],
        path: ['倒置帐篷', ['north', 'west', 'south', 'west', 'north', 'north']],
        choice: ['取消演出', '赞助人威胁取消演出就撤资，旋铃看着仍在发抖的演员。', [['cancel', '暂停演出直到安全复核完成', '观众退票可以补偿，受伤却无法重来。演员们站到你这边。', { insight: 5 }], ['ground', '改成无高空装置的地面节目', '创意保住了当晚演出，也没有拿安全下注。', { insight: 4 }]]],
        resource: ['掌声控制器', '旧传感器把音量峰值误映射为重力翻转。', [['patch', '投入2点能量刷入安全固件', 2, '控制器只接受物理钥匙，掌声重新只是掌声。', { energy: -2, insight: 5 }], ['disconnect', '拆除声控线路并使用手动锁', 0, '简单机械锁消除了意外触发。', { insight: 3 }]]],
        boss: ['演出第一法则', '发现关键安全装置行为异常，最合理的是？', ['继续表演观察', '立即停止并隔离装置', '要求观众少鼓掌但不检修', '删掉事故记录'], 1, '安全'],
        finish: ['脚踏实地的掌声', '新节目全部在地面完成。谢幕时掌声响彻帐篷，没有任何东西飞起，旋铃却说这是最轻松的一晚。']
    },
    {
        id: 'ink-ocean', titleZh: '墨色海洋', titleEn: 'Ocean of Ink', icon: '🖋️', color: '#43526f', guide: '绘图师黛蓝',
        summaryZh: '墨潮遮住全部航标，海图上的怪物却一一成真。找到那支不停落笔的无人羽笔。', summaryEn: 'An ink tide hides the beacons and map monsters become real. Find the quill that will not stop drawing.',
        arrival: ['海图活了过来', '黛蓝刚划掉一只八爪怪，船边就少了一条触手。她终于明白：不是海图记录海洋，而是海洋正在服从海图。'],
        quiz: ['地图比例', '地图比例尺用于表示什么？', ['图上距离与实际距离关系', '纸张颜色', '海水温度', '风的声音'], 0, '地理'],
        multi: ['航海定位', '看不见航标时可辅助定位的有？', ['罗盘', '星位', '随意猜方向', '深度与海图'], [0, 1, 3], '航海'],
        order: ['校验海图', [['source', '确认绘制来源'], ['sound', '测量实际水深'], ['compare', '与旧航海日志比较'], ['correct', '标注修正版本']], ['source', 'sound', 'compare', 'correct']],
        matching: ['墨海符号', [['reef', '锯齿线'], ['current', '弯曲箭头'], ['harbor', '锚形标记']], [['danger', '暗礁'], ['flow', '洋流'], ['safe', '港口']], { reef: 'danger', current: 'flow', harbor: 'safe' }],
        cipher: ['灯塔方位', '罗盘一圈360度，正东通常对应多少度？', '90', '从正北顺时针计算。'],
        memory: ['墨浪航标', ['anchor', 'star', 'wave', 'anchor', 'reef', 'star'], { anchor: '锚', star: '星', wave: '浪', reef: '礁' }],
        path: ['穿过空白海域', ['east', 'south', 'east', 'north', 'east', 'south']],
        choice: ['画一条捷径', '羽笔愿意画出直达终点的航道，但必须同时擦掉一个真实小岛。', [['refuse', '拒绝用真实岛屿交换捷径', '黛蓝依据测深数据绘出较慢但诚实的路线。', { insight: 5 }], ['blank', '让羽笔只在尚未确认的空白处停止落墨', '你不给想象冒充事实的机会，怪物逐渐褪色。', { insight: 4 }]]],
        resource: ['封住墨井', '羽笔连接着海底墨井，直接折断会让全部墨水喷出。', [['cap', '投入2点能量启动磁性封帽', 2, '墨井被平稳封闭，海水从黑色恢复深蓝。', { energy: -2, insight: 5 }], ['roll', '把羽笔的无限纸卷完整卷回', 0, '最后一笔被收回纸面，墨潮不再扩散。', { insight: 3 }]]],
        boss: ['地图与海', '当地图与实地观测冲突时应当？', ['让现实服从地图', '复核观测并更新地图', '隐藏差异', '继续复制旧图'], 1, '信息素养'],
        finish: ['海比纸更大', '最后一只纸怪在浪中散开。黛蓝故意在新海图边缘留下一片空白，并写道：“未知不是错误。”']
    },
    {
        id: 'lantern-festival', titleZh: '灯火庆典', titleEn: 'Lantern Festival', icon: '🏮', color: '#c07a35', guide: '灯匠暖穗',
        summaryZh: '主灯熄灭让庆典循环在同一晚，居民忘了已经许过多少次愿。找回第一盏由谁点亮。', summaryEn: 'A dark master lantern traps the festival in one repeated night. Recover the forgotten first flame.',
        arrival: ['第九十九个同一晚', '暖穗每天都数到九十九盏灯，清晨却从不来临。只有卖糖画的小孩记得，主灯原本不是由城主点亮。'],
        quiz: ['传统灯谜', '“十五的月亮”通常形容农历十五的月亮怎样？', ['较圆', '完全看不见', '变成太阳', '只在白天'], 0, '文化'],
        multi: ['大型活动安全', '庆典现场应设置哪些保障？', ['疏散通道', '消防设备', '堵住出口摆摊', '人流引导'], [0, 1, 3], '安全'],
        order: ['追寻第一盏灯', [['witness', '访问最早参与者'], ['photo', '核对旧照片'], ['ledger', '查看灯油账本'], ['identify', '确认点灯人']], ['witness', 'photo', 'ledger', 'identify']],
        matching: ['灯火工艺', [['frame', '竹骨架'], ['paper', '灯面纸'], ['wick', '灯芯']], [['shape', '支撑形状'], ['diffuse', '柔化光线'], ['flame', '维持火焰']], { frame: 'shape', paper: 'diffuse', wick: 'flame' }],
        cipher: ['灯阵数量', '广场有8排灯，每排12盏，共多少盏？', '96', '8×12。'],
        memory: ['点灯顺序', ['river', 'gate', 'bridge', 'river', 'tower', 'gate'], { river: '河灯', gate: '门灯', bridge: '桥灯', tower: '塔灯' }],
        path: ['人潮小巷', ['south', 'east', 'north', 'east', 'south', 'south']],
        choice: ['被抹去的名字', '第一盏灯由清洁工阿满点亮，城主却把名字改成了自己。', [['restore', '公开旧照片，还原阿满的名字', '居民想起庆典本就属于每个劳动者，循环松动了。', { insight: 5 }], ['invite', '请阿满再次亲手点灯并讲述当年', '真实故事比城主的仪式更能照亮广场。', { insight: 4 }]]],
        resource: ['主灯旧火种', '火种封在停止转动的日晷中心。', [['dawn', '投入2点能量模拟清晨光谱', 2, '日晷认出黎明，释放了保存百年的火种。', { energy: -2, insight: 5 }], ['mirrors', '用九十九盏小灯反射聚光', 0, '微小灯火合在一起，唤醒了主灯。', { insight: 4 }]]],
        boss: ['庆典属于谁', '保存公共历史时，为什么应记录真实贡献者？', ['让记录可核验且尊重事实', '名字越少越准确', '只需要记录权力最大者', '历史不影响现在'], 0, '社会'],
        finish: ['第一百次清晨', '阿满点亮主灯，暖穗第一次数到一百。天边随即变白，居民保留愿望，却终于迎来下一天。']
    },
    {
        id: 'quantum-station', titleZh: '量子车站', titleEn: 'Quantum Station', icon: '🚉', color: '#5967a4', guide: '站长叠影',
        summaryZh: '每列车同时显示在两条轨道，乘客的车票也出现两个目的地。完成观测，把选择安全地落定。', summaryEn: 'Every train appears on two tracks and tickets show two destinations. Measure carefully and collapse the choice.',
        arrival: ['两列同号车', '站台一和站台二同时驶入07号列车。叠影警告：随便广播一个答案，会让一半乘客走进不存在的车厢。'],
        quiz: ['测量基础', '重复测量并记录结果主要有助于什么？', ['提高判断可靠性', '让对象消失', '保证每次完全相同', '取消误差'], 0, '科学'],
        multi: ['乘客分流', '处理不确定站台信息应做到？', ['暂停进站', '多系统交叉确认', '同时放行两边', '清晰更新广播'], [0, 1, 3], '安全'],
        order: ['确认真实列车', [['isolate', '隔离两条站台'], ['signal', '读取独立信号'], ['probe', '发送测试指令'], ['open', '只开放确认站台']], ['isolate', 'signal', 'probe', 'open']],
        matching: ['车站状态', [['arrival', '到站灯'], ['switch', '道岔灯'], ['ticket', '验票灯']], [['train', '列车位置'], ['route', '轨道方向'], ['passenger', '乘客权限']], { arrival: 'train', switch: 'route', ticket: 'passenger' }],
        cipher: ['概率屏', '两种等可能结果中，某一种发生的概率用百分数表示是多少？', '50', '一半就是50%。'],
        memory: ['观测脉冲', ['one', 'two', 'one', 'hold', 'two', 'hold'], { one: '一号台', two: '二号台', hold: '等待' }],
        path: ['叠加走廊', ['north', 'east', 'west', 'east', 'north', 'east']],
        choice: ['两张回家的票', '一位孩子的两张票分别通往“现在的家”和“从未搬走的家”。', [['present', '陪她确认现实中的家人位置', '可验证的联络让她选择现在的家，不被愿望诱走。', { insight: 5 }], ['call', '先暂停选择并建立视频联络', '家人的声音成为稳定参照，两张票合为一张。', { insight: 4 }]]],
        resource: ['道岔坍缩', '两个道岔状态正在高速切换。', [['measure', '投入2点能量同步三套传感器', 2, '一致观测锁定真实轨道，列车安全进站。', { energy: -2, insight: 5 }], ['manual', '机械锁定备用直线轨', 0, '简单物理锁排除不确定分支。', { insight: 3 }]]],
        boss: ['不确定不是随便', '面对不确定结果，科学做法是？', ['收集证据并说明不确定性', '随便选且宣称确定', '隐藏所有数据', '只看最想要的结果'], 0, '科学'],
        finish: ['唯一一次到站', '07号列车最终停在一号台，二号台的影子像雾一样散去。叠影把时刻表上的“绝对准时”改成“经确认后出发”。']
    },
    {
        id: 'forgotten-zoo', titleZh: '遗忘动物园', titleEn: 'Forgotten Zoo', icon: '🦒', color: '#72834e', guide: '兽医木铃',
        summaryZh: '记忆雾让饲养员忘记动物习性，错误饲料已送往各馆。依靠行为证据重建照护手册。', summaryEn: 'Memory fog erases animal-care knowledge while wrong feed reaches each habitat. Rebuild the manuals from evidence.',
        arrival: ['谁吃哪一份早餐', '企鹅馆收到树叶，长颈鹿馆堆满冻鱼。木铃不记得答案，却保留了每种动物昨天留下的进食痕迹。'],
        quiz: ['动物食性', '长颈鹿主要取食什么？', ['高处树叶', '深海鱼', '石头', '冰块'], 0, '生物'],
        multi: ['动物福利', '良好动物照护包括哪些？', ['合适食物', '清洁栖息地', '强迫全天表演', '观察健康行为'], [0, 1, 3], '生态'],
        order: ['重建手册', [['trace', '观察进食痕迹'], ['reference', '查阅外部资料'], ['vet', '由兽医复核'], ['issue', '发布新照护表']], ['trace', 'reference', 'vet', 'issue']],
        matching: ['动物与食物', [['panda', '熊猫'], ['penguin', '企鹅'], ['giraffe', '长颈鹿']], [['bamboo', '竹子'], ['fish', '鱼'], ['leaves', '树叶']], { panda: 'bamboo', penguin: 'fish', giraffe: 'leaves' }],
        cipher: ['饲料份数', '12只企鹅每只2条鱼，共需多少条？', '24', '12×2。'],
        memory: ['馆舍钥匙', ['savanna', 'polar', 'forest', 'savanna', 'wetland', 'polar'], { savanna: '草原馆', polar: '极地馆', forest: '竹林馆', wetland: '湿地馆' }],
        path: ['晨间巡馆', ['west', 'north', 'east', 'east', 'south', 'east']],
        choice: ['记忆雾中的老象', '老象不断走向已拆除的旧水池，游客说它只是“记错了”。', [['observe', '暂停开放并观察它的需求', '木铃发现新水池入口被货箱挡住，老象只是找不到路。', { insight: 5 }], ['guide', '移开障碍并用熟悉气味引导', '老象平静抵达水池，行为证据比猜测更清楚。', { insight: 4 }]]],
        resource: ['净化记忆雾', '雾来自旧香氛机泄漏，动物嗅觉也受到影响。', [['filter', '投入2点能量启动高效过滤', 2, '空气恢复清澈，馆舍气味重新可辨。', { energy: -2, insight: 5 }], ['vent', '打开分区通风并撤离动物', 0, '安全转移后，雾被自然风逐步带走。', { insight: 3 }]]],
        boss: ['忘记之后', '当照护人员记忆不可靠时，应优先依靠？', ['记录、专家与动物行为证据', '游客投票', '颜色最漂亮的饲料', '昨天的猜测'], 0, '科学'],
        finish: ['重新认识每一双眼睛', '新手册没有只写答案，还写明证据来源。木铃说，真正的照护不是背熟，而是持续观察。']
    },
    {
        id: 'volcano-kitchen', titleZh: '火山厨房', titleEn: 'Volcano Kitchen', icon: '🍲', color: '#b2583d', guide: '主厨焰勺',
        summaryZh: '地热灶台不断升温，宴会却不能取消。把厨房从速度竞赛变回一顿安全且公平的晚餐。', summaryEn: 'Geothermal stoves overheat before a grand feast. Turn a speed contest back into a safe, fair meal.',
        arrival: ['沸腾的菜单', '所有锅都在无人点火时沸腾。焰勺仍催大家快一点，因为评审给“最先上菜”额外一百分。'],
        quiz: ['沸水安全', '处理沸腾液体时，锅柄通常应？', ['朝内且稳固', '伸出过道', '放在火焰上', '拆掉'], 0, '安全'],
        multi: ['厨房卫生', '安全备餐包括哪些？', ['生熟分开', '充分洗手', '同一刀具不清洁反复用', '检查食材温度'], [0, 1, 3], '健康'],
        order: ['冷却灶台', [['fuel', '关闭热源入口'], ['cover', '盖好危险锅具'], ['vent', '开启通风'], ['measure', '确认温度下降']], ['fuel', 'cover', 'vent', 'measure']],
        matching: ['厨具用途', [['thermometer', '温度计'], ['mitt', '隔热手套'], ['board', '砧板']], [['temperature', '测中心温度'], ['heat', '防止烫伤'], ['cut', '处理食材']], { thermometer: 'temperature', mitt: 'heat', board: 'cut' }],
        cipher: ['配方换算', '4人份需要200克面粉，8人份需要多少克？', '400', '人数翻倍，材料也翻倍。'],
        memory: ['出菜铃', ['wash', 'cut', 'cook', 'check', 'plate', 'serve'], { wash: '清洗', cut: '切配', cook: '烹饪', check: '测温', plate: '装盘', serve: '上菜' }],
        path: ['避开热汽', ['south', 'east', 'north', 'east', 'south', 'east']],
        choice: ['迟到还是冒险', '主菜还没达到安全温度，评审已经敲响最后上菜铃。', [['wait', '继续加热并说明延迟原因', '评审最终接受安全优先，客人也吃到可靠的晚餐。', { insight: 5 }], ['change', '改上已熟透的备用菜品', '灵活菜单守住时间，也没有牺牲食品安全。', { insight: 4 }]]],
        resource: ['地热总阀', '阀门下方温度太高，人员无法靠近。', [['remote', '投入2点能量启动远程机械臂', 2, '机械臂关闭主阀，灶台温度稳定下降。', { energy: -2, insight: 5 }], ['coolant', '铺设冷水管逐步冷却通道', 0, '通道达到安全温度后，焰勺亲自关阀。', { insight: 3 }]]],
        boss: ['真正的满分', '餐饮比赛中最不能为速度牺牲的是？', ['食品安全', '盘子颜色', '背景音乐', '菜单字体'], 0, '健康'],
        finish: ['慢三分钟的宴会', '宴会迟了三分钟，却没有一人受伤。焰勺撕掉速度加分规则，给每位坚持复核温度的学徒满分。']
    },
    {
        id: 'maze-university', titleZh: '迷宫大学', titleEn: 'Maze University', icon: '🏫', color: '#596f91', guide: '校长方格',
        summaryZh: '教学楼每天重排走廊，新生永远到不了教室。查明“淘汰迷路者”的校规是谁写的。', summaryEn: 'Corridors rearrange daily so newcomers never reach class. Expose the rule designed to eliminate anyone lost.',
        arrival: ['永远迟到的新生', '方格校长自豪地说迷宫能筛选聪明学生，可你发现只有持内部密钥的老生看得见固定捷径。'],
        quiz: ['学习环境', '好的教学指引最应做到什么？', ['清晰且可获得', '故意隐藏', '每天随机改变', '只给少数人'], 0, '教育'],
        multi: ['无障碍校园', '校园导向系统应考虑哪些？', ['清晰标识', '无障碍路线', '只用一种难懂暗号', '紧急出口信息'], [0, 1, 3], '社会'],
        order: ['绘制真实地图', [['survey', '实地测量'], ['mark', '标出固定结构'], ['test', '邀请新生试走'], ['publish', '公开可访问地图']], ['survey', 'mark', 'test', 'publish']],
        matching: ['校园区域', [['lab', '实验室'], ['library', '图书馆'], ['clinic', '医务室']], [['experiment', '开展实验'], ['books', '查阅资料'], ['care', '提供健康帮助']], { lab: 'experiment', library: 'books', clinic: 'care' }],
        cipher: ['楼层规律', '教室号101、203、305，每次楼层和房号各增加多少？请输入房号增量。', '2', '01、03、05。'],
        memory: ['走廊门牌', ['A', 'C', 'B', 'D', 'A', 'B'], { A: 'A门', B: 'B门', C: 'C门', D: 'D门' }],
        path: ['新生路线', ['north', 'east', 'east', 'south', 'east', 'north']],
        choice: ['公开内部密钥', '老生会失去独享捷径，但新生终于能准时上课。', [['public', '把路线知识公开给所有人', '知识不再是筛人的门槛，老生转而成为引导志愿者。', { insight: 5 }], ['redesign', '固定主要走廊并保留可选解谜区', '学习与挑战被分开，没人再因迷路失去课程。', { insight: 4 }]]],
        resource: ['停止重排核心', '核心每天凌晨推墙，今晚还会封住医务室。', [['lock', '投入2点能量冻结安全通道拓扑', 2, '主要路线永久固定，挑战区仍可独立变化。', { energy: -2, insight: 5 }], ['brace', '为公共走廊安装机械限位', 0, '墙体无法越过安全边界，新生地图保持有效。', { insight: 3 }]]],
        boss: ['公平的门槛', '用隐蔽信息淘汰不知情者，为什么不公平？', ['测试了信息特权而非学习能力', '迷宫一定太短', '老生人数较少', '地图颜色不好'], 0, '社会'],
        finish: ['第一堂不迟到的课', '清晨，所有新生准时坐进教室。方格把旧校训“找到路才配学习”改成“学习帮助每个人找到路”。']
    },
    {
        id: 'rainbow-factory', titleZh: '彩虹工厂', titleEn: 'Rainbow Factory', icon: '🎨', color: '#9a62a1', guide: '配色师虹砂',
        summaryZh: '光谱机器丢失三段颜色，城市只剩灰阶。追查谁为了“统一美感”锁走了差异。', summaryEn: 'Three spectral bands vanish and the city fades to gray. Find who locked away difference for uniform beauty.',
        arrival: ['灰色合格证', '虹砂发现机器并未损坏，红、绿、蓝三仓被人为加锁。质检主管留言：“颜色太多会让人意见不一。”'],
        quiz: ['色光混合', '红、绿、蓝常被称为什么系统的三原色？', ['色光', '声音', '温度', '气味'], 0, '科学'],
        multi: ['颜色与可达性', '设计信息时除颜色外还应提供哪些线索？', ['文字标签', '形状差异', '只用相近颜色', '明暗或纹理'], [0, 1, 3], '设计'],
        order: ['恢复光谱', [['measure', '测量缺失波段'], ['unlock', '解除三仓锁定'], ['blend', '逐级混合测试'], ['calibrate', '校准最终白光']], ['measure', 'unlock', 'blend', 'calibrate']],
        matching: ['颜色应用', [['red', '红色'], ['green', '绿色'], ['blue', '蓝色']], [['warning', '常用于警示'], ['go', '常用于通行'], ['cool', '常给人冷静感']], { red: 'warning', green: 'go', blue: 'cool' }],
        cipher: ['调色比例', '红光30份、绿光25份、蓝光45份，总共多少份？', '100', '30＋25＋45。'],
        memory: ['光谱转盘', ['red', 'orange', 'yellow', 'green', 'blue', 'violet'], { red: '红', orange: '橙', yellow: '黄', green: '绿', blue: '蓝', violet: '紫' }],
        path: ['棱镜管道', ['east', 'north', 'west', 'north', 'east', 'north']],
        choice: ['主管的白色方案', '主管说单一白色最“没有争议”，愿意放回亮度但不放回颜色。', [['difference', '坚持恢复完整光谱', '差异并不等于混乱，清晰规则可以容纳多种颜色。', { insight: 5 }], ['accessible', '恢复颜色并增加文字与形状标识', '城市既多彩，也不让任何人只依赖颜色理解信息。', { insight: 4 }]]],
        resource: ['打开三色仓', '三把锁必须在同一瞬间收到不同波长。', [['prism', '投入2点能量启动同步棱镜', 2, '三束光同时命中锁芯，色仓全部开启。', { energy: -2, insight: 5 }], ['mirrors', '安排三队用日光镜共同对准', 0, '大家数到三一起转镜，第一道彩虹穿过厂房。', { insight: 4 }]]],
        boss: ['彩虹为何完整', '只使用颜色传达关键信息的主要问题是？', ['部分人可能无法辨别', '颜色没有波长', '文字永远更漂亮', '所有屏幕都黑白'], 0, '设计'],
        finish: ['颜色不是错误', '城市墙面重新出现不同色彩，质检表也新增“多种方式可识别”。虹砂把灰色合格证折成一只彩鸟。']
    },
    {
        id: 'midnight-orchard', titleZh: '午夜果园', titleEn: 'Midnight Orchard', icon: '🍎', color: '#6d7145', guide: '果农夜露',
        summaryZh: '果实只在错误季节成熟，整座村庄靠假日历维持丰收。揭开被藏起的真实气候记录。', summaryEn: 'Fruit ripens in the wrong seasons while a false calendar promises harvest. Recover the hidden climate record.',
        arrival: ['六月的霜苹果', '盛夏枝头挂满霜，冬季树下却落着熟桃。夜露说祖父禁止任何人查看山顶气象箱，因为“日历永远不会错”。'],
        quiz: ['季节成因', '地球四季变化主要与公转和什么有关？', ['地轴倾斜', '每天云量', '海水颜色', '月球大小'], 0, '地理'],
        multi: ['果园观察', '判断作物生长异常应记录哪些？', ['温度', '降水', '传说中的幸运数字', '开花结果日期'], [0, 1, 3], '农业'],
        order: ['核对季候', [['records', '收集多年记录'], ['clean', '识别异常数据'], ['compare', '比较花期变化'], ['adapt', '调整种植计划']], ['records', 'clean', 'compare', 'adapt']],
        matching: ['果树季候', [['bud', '萌芽'], ['flower', '开花'], ['fruit', '结果']], [['spring', '通常先于花期'], ['pollination', '吸引传粉'], ['harvest', '成熟后采收']], { bud: 'spring', flower: 'pollination', fruit: 'harvest' }],
        cipher: ['成熟推迟', '原本第120天成熟，现在第138天成熟，推迟多少天？', '18', '138－120。'],
        memory: ['月下果香', ['apple', 'pear', 'peach', 'apple', 'plum', 'pear'], { apple: '苹果', pear: '梨', peach: '桃', plum: '李' }],
        path: ['夜间梯田', ['north', 'west', 'north', 'east', 'north', 'west']],
        choice: ['祖父的假日历', '假日历曾帮助大家安心，却已让农户错过三次防霜。', [['truth', '公开真实记录并说明变化', '村民虽不安，却终于能依据真实天气保护果树。', { insight: 5 }], ['transition', '提供新季候表和逐年调整方案', '事实与可执行方案一起出现，改变不再只有恐惧。', { insight: 4 }]]],
        resource: ['恢复气象箱', '箱内记录器被设成重复上一年数据。', [['live', '投入2点能量接入实时传感网络', 2, '真实温湿度重新写入果园预报。', { energy: -2, insight: 5 }], ['manual', '重启纸带并安排每日人工读数', 0, '朴素记录结束了自动复制的假象。', { insight: 3 }]]],
        boss: ['日历与天气', '长期规律发生变化时，最佳做法是？', ['更新模型并持续观测', '强迫现实符合旧日历', '删除新数据', '只看最好的一年'], 0, '科学'],
        finish: ['接受真正的季节', '夜露摘下不合时节的最后一颗苹果。新季候表没有承诺永远丰收，却让每个人知道如何准备。']
    },
    {
        id: 'compass-archipelago', titleZh: '罗盘群岛', titleEn: 'Compass Archipelago', icon: '🧭', color: '#3f7d88', guide: '岛图师南针',
        summaryZh: '所有罗盘同时指向一座移动岛屿，渔船正被吸向礁群。找出岛下被唤醒的磁石巨鲸。', summaryEn: 'Every compass points to a moving island, drawing fishing boats toward reefs. Find the magnetic whale below.',
        arrival: ['北方开始游泳', '南针把罗盘放平，指针竟追着远处小岛转圈。声呐显示岛下有一颗和山一样大的心脏。'],
        quiz: ['罗盘原理', '普通磁罗盘的指针主要受什么影响？', ['地球磁场', '空气甜度', '太阳颜色', '海浪高度'], 0, '科学'],
        multi: ['失去罗盘后', '磁罗盘异常时还能参考哪些导航信息？', ['天体方位', '海图地标', '盲目跟随别船', '卫星定位与深度'], [0, 1, 3], '航海'],
        order: ['标定偏差', [['true', '取得真实方位'], ['read', '读取罗盘方位'], ['difference', '计算偏差'], ['correct', '标注修正值']], ['true', 'read', 'difference', 'correct']],
        matching: ['航海方向', [['north', '北'], ['east', '东'], ['south', '南']], [['zero', '常记作0度'], ['ninety', '常记作90度'], ['oneeighty', '常记作180度']], { north: 'zero', east: 'ninety', south: 'oneeighty' }],
        cipher: ['方位修正', '罗盘读数110度，已知偏东20度，真实方位是多少度？', '90', '110－20。'],
        memory: ['岛链灯塔', ['north', 'east', 'south', 'east', 'north', 'west'], { north: '北塔', east: '东塔', south: '南塔', west: '西塔' }],
        path: ['绕开磁礁', ['west', 'north', 'east', 'north', 'west', 'north']],
        choice: ['巨鲸还是航路', '驱赶磁石鲸最快，但它可能是群岛最后一只迁徙古兽。', [['route', '临时封航并研究它的迁徙路线', '船只改走安全水道，巨鲸也没有遭到伤害。', { insight: 5 }], ['beacons', '布置非磁性导航浮标引导船队', '新系统让航行不再只依赖一种工具。', { energy: -1, insight: 4 }]]],
        resource: ['解除唤醒信号', '废弃海底电缆发出低频脉冲，吸引巨鲸跟随。', [['shutdown', '投入2点能量远程熔断电缆', 2, '脉冲停止，巨鲸转向古老迁徙线。', { energy: -2, insight: 5 }], ['buoy', '用浮标发出温和替代引导声', 0, '巨鲸慢慢离开礁群，电缆随后安全回收。', { insight: 3 }]]],
        boss: ['移动的北方', '单一导航工具出现异常时应当？', ['用独立方法交叉确认', '加大磁铁', '继续完全相信', '关闭所有灯塔'], 0, '安全'],
        finish: ['鲸背上的岛', '所谓移动岛屿沉入海面，露出巨鲸闪光的背脊。南针在新海图上把它画成一条需要尊重的航线。']
    },
    {
        id: 'archive-zero', titleZh: '零号档案', titleEn: 'Archive Zero', icon: '🗄️', color: '#6f687b', guide: '档案员空白',
        summaryZh: '被删除的记录开始返回现实，连已经拆除的建筑也重新占据街道。决定什么该恢复，什么只该被记住。', summaryEn: 'Deleted records return as physical reality. Decide what should be restored and what should only be remembered.',
        arrival: ['不存在的第零层', '电梯显示地下零层，那里存放所有“被认为不值得保留”的记录。空白打开门时，一条消失二十年的街道正从档案盒里长出来。'],
        quiz: ['档案价值', '保存原始记录的重要作用是什么？', ['便于追溯与核验', '让错误永不被发现', '减少所有存储', '取代现实'], 0, '信息素养'],
        multi: ['负责任归档', '处理敏感档案应考虑哪些？', ['真实性', '隐私权限', '按个人喜好篡改', '保存期限'], [0, 1, 3], '信息素养'],
        order: ['恢复记录', [['verify', '验证来源'], ['integrity', '检查完整性'], ['permission', '确认访问权限'], ['restore', '恢复到正式档案']], ['verify', 'integrity', 'permission', 'restore']],
        matching: ['记录状态', [['deleted', '已删除'], ['redacted', '已遮盖'], ['archived', '已归档']], [['removed', '从活跃系统移除'], ['hidden', '隐藏敏感部分'], ['preserved', '长期保存']], { deleted: 'removed', redacted: 'hidden', archived: 'preserved' }],
        cipher: ['校验编号', '档案编号各位为2、0、2、6，各位相加是多少？', '10', '2＋0＋2＋6。'],
        memory: ['索引抽屉', ['public', 'private', 'sealed', 'public', 'review', 'private'], { public: '公开', private: '受限', sealed: '封存', review: '待复核' }],
        path: ['零层库房', ['south', 'west', 'west', 'north', 'west', 'south']],
        choice: ['一封被删的道歉信', '信件能洗清一位故人的误会，却也包含收信人不愿公开的秘密。', [['consent', '先征得相关人的同意再决定公开范围', '真相得到恢复，隐私也没有成为代价。', { insight: 5 }], ['summary', '保留原件受限访问，只公开必要事实', '历史被纠正，而私人细节留在安全边界内。', { insight: 4 }]]],
        resource: ['现实回滚器', '档案主机正把每条恢复记录直接实体化。', [['separate', '投入2点能量分离记录层与现实层', 2, '建筑停止从纸页生长，档案仍完整保留。', { energy: -2, insight: 5 }], ['quarantine', '逐柜移入隔离索引', 0, '返回现实的速度减慢，团队完成安全分类。', { insight: 3 }]]],
        boss: ['恢复的边界', '完整保存记录与公开全部内容是否相同？', ['不同，访问需考虑隐私与权限', '完全相同', '档案都应立即销毁', '只有新记录需保护'], 0, '信息素养'],
        finish: ['记住但不重演', '零号层重新关门，消失街道留下清晰档案而没有占据今天。空白终于在管理员栏签下自己的名字。']
    },
    {
        id: 'eclipse-palace', titleZh: '日蚀宫殿', titleEn: 'Eclipse Palace', icon: '🌘', color: '#625579', guide: '守曜人晨环',
        summaryZh: '永恒阴影封住宫殿能源，王室坚持太阳已经消失。沿古观测孔证明光仍在阴影之外。', summaryEn: 'An eternal shadow seals the palace while the court claims the sun is gone. Prove light remains beyond it.',
        arrival: ['没有日出的王宫', '宫廷日历停在日蚀那天，所有窗户被永久钉死。晨环偷偷带来一片镜子：它在屋顶缝隙里仍能反射阳光。'],
        quiz: ['日食原因', '日食通常发生在什么位于太阳与地球之间时？', ['月球', '火星', '北极', '云层'], 0, '天文'],
        multi: ['安全观测日食', '观测太阳应采用哪些安全方式？', ['合格滤光镜', '间接投影', '裸眼长时间直视', '正规观测设备'], [0, 1, 3], '安全'],
        order: ['追踪日光', [['open', '打开观测孔'], ['angle', '记录光线角度'], ['time', '比较不同时刻'], ['predict', '推算阴影结束']], ['open', 'angle', 'time', 'predict']],
        matching: ['天体影子', [['umbra', '本影'], ['penumbra', '半影'], ['orbit', '轨道']], [['dark', '完全遮挡区'], ['partial', '部分遮挡区'], ['path', '天体运行路径']], { umbra: 'dark', penumbra: 'partial', orbit: 'path' }],
        cipher: ['影子时长', '日蚀从10:15到12:00，持续多少分钟？', '105', '1小时45分钟。'],
        memory: ['镜面引光', ['east', 'roof', 'hall', 'roof', 'west', 'hall'], { east: '东镜', roof: '顶镜', hall: '殿镜', west: '西镜' }],
        path: ['阴影回廊', ['east', 'north', 'north', 'west', 'north', 'east']],
        choice: ['打开宫门', '王室担心承认太阳仍在会动摇多年统治。', [['open', '公开观测记录并打开所有窗', '光线进入大厅，人们亲眼看到事实不需要王令批准。', { insight: 5 }], ['demonstrate', '在广场做安全投影实验', '任何人都能重复验证，谣言逐渐失去力量。', { insight: 4 }]]],
        resource: ['转动遮光盘', '宫殿屋顶的巨大遮光盘被锁死在日蚀位置。', [['motor', '投入2点能量重启轨道电机', 2, '遮光盘缓慢移开，太阳能阵列重新充电。', { energy: -2, insight: 5 }], ['gears', '用晨环保存的手轮逐齿转动', 0, '第一束完整阳光落进王座前。', { insight: 4 }]]],
        boss: ['阴影不是消失', '一个物体暂时被遮挡，能否说明它不存在？', ['不能，还需更多观察证据', '一定能', '只有国王能决定', '影子等于物体消失'], 0, '逻辑'],
        finish: ['日历翻页', '宫廷日历终于翻到第二天。晨环没有把阴影全部赶走，而是教每个人如何判断它何时来、何时离开。']
    },
    {
        id: 'comet-harbor', titleZh: '彗星港', titleEn: 'Comet Harbor', icon: '🚀', color: '#526f9d', guide: '港务官尾光',
        summaryZh: '彗星碎片堵塞所有起航窗口，一艘医疗船必须准时离港。规划不靠牺牲小船的清障路线。', summaryEn: 'Comet debris blocks every launch window while a medical ship must leave. Clear a route without sacrificing others.',
        arrival: ['只剩一条窗口', '医疗船携带的药物将在六小时后失效。尾光却发现所谓“唯一安全航线”会把碎片推向民用小艇泊区。'],
        quiz: ['彗星结构', '彗星接近太阳时常出现明亮的什么？', ['彗尾', '树根', '海浪', '地震'], 0, '天文'],
        multi: ['发射决策', '决定能否发射应综合哪些？', ['轨道碎片', '天气', '只看倒计时压力', '飞船状态'], [0, 1, 3], '航天'],
        order: ['清理航道', [['map', '绘制碎片轨迹'], ['priority', '标记高风险目标'], ['nudge', '小幅改变轨道'], ['verify', '复核安全窗口']], ['map', 'priority', 'nudge', 'verify']],
        matching: ['港口飞行器', [['tug', '轨道拖船'], ['beacon', '导航信标'], ['shield', '防护盾']], [['move', '推移碎片'], ['guide', '标记航线'], ['protect', '抵挡微小撞击']], { tug: 'move', beacon: 'guide', shield: 'protect' }],
        cipher: ['窗口倒计时', '药物剩360分钟有效，准备需95分钟，余下多少分钟航行窗口？', '265', '360－95。'],
        memory: ['发射灯序', ['fuel', 'seal', 'route', 'seal', 'crew', 'fuel'], { fuel: '燃料', seal: '密封', route: '航线', crew: '乘员' }],
        path: ['碎片带', ['north', 'east', 'south', 'east', 'north', 'east']],
        choice: ['小艇泊区', '最快清障会毁掉无人值守的小艇，其中有渔民们全部家当。', [['tow', '先把小艇拖入内港再清障', '多花四十分钟，却没有让弱者承担紧急任务的代价。', { energy: -1, insight: 5 }], ['precision', '采用多次小推力分散碎片', '精确计算保住小艇，也打开足够宽的窗口。', { insight: 4 }]]],
        resource: ['最后一块碎片', '大碎片正在安全窗口中央缓慢翻滚。', [['tug', '投入2点能量启动双拖船夹持', 2, '碎片被稳定送入回收轨道。', { energy: -2, insight: 5 }], ['net', '展开被动捕获网等待其自转对齐', 0, '耐心等待后，捕获网安全收紧。', { insight: 3 }]]],
        boss: ['紧急不等于转嫁', '紧急任务中的方案评估还应考虑什么？', ['对其他人的风险与代价', '只看最快', '只保护最贵设备', '隐藏受影响者'], 0, '社会'],
        finish: ['窗口中的尾光', '医疗船准时升空，小艇也安稳停在内港。尾光把这条航线命名为“没有被留下的人”。']
    },
    {
        id: 'clockwork-ocean', titleZh: '发条海', titleEn: 'Clockwork Ocean', icon: '⚙️', color: '#497b8a', guide: '机械师浪齿',
        summaryZh: '海底主发条改变潮汐节拍，沿岸生物来不及适应。潜入齿轮宫，恢复月亮留下的旧节律。', summaryEn: 'A seabed mainspring changes the tides faster than life can adapt. Restore the lunar rhythm in the gear palace.',
        arrival: ['每小时一次涨潮', '海水像钟摆一样六十分钟涨落一次。浪齿在退潮滩发现搁浅幼鲸，也发现主发条上刻着旅游公司的加速标志。'],
        quiz: ['潮汐影响', '地球潮汐受哪个天体引力影响显著？', ['月球', '北极星', '彗星尾', '火星卫星'], 0, '地理'],
        multi: ['潮间带保护', '异常潮汐时应采取哪些措施？', ['救助搁浅动物', '监测水位', '随意搬走全部生物', '限制危险岸段活动'], [0, 1, 3], '生态'],
        order: ['恢复节拍', [['natural', '取得自然潮汐表'], ['ratio', '测量齿轮传动比'], ['slow', '逐级降低速度'], ['observe', '观察完整周期']], ['natural', 'ratio', 'slow', 'observe']],
        matching: ['发条结构', [['spring', '主发条'], ['escapement', '擒纵器'], ['gear', '齿轮组']], [['store', '储存能量'], ['pace', '控制节拍'], ['transfer', '传递转动']], { spring: 'store', escapement: 'pace', gear: 'transfer' }],
        cipher: ['潮汐周期', '自然周期约12小时，机器周期1小时，机器快了多少倍？', '12', '12÷1。'],
        memory: ['齿轮咬合', ['large', 'small', 'small', 'large', 'pause', 'small'], { large: '大齿', small: '小齿', pause: '空齿' }],
        path: ['海底齿轮宫', ['south', 'east', 'north', 'east', 'south', 'south']],
        choice: ['旅游公司的合同', '公司称快速潮汐能让游客一天看十二次奇观。', [['ecosystem', '以生态监测数据要求立即停用', '沿岸居民看到真实损害，也加入恢复自然节律。', { insight: 5 }], ['transition', '停止加速并安排游客参与修复', '旅游不必消失，但不再让生态为表演付费。', { insight: 4 }]]],
        resource: ['主发条卸力', '瞬间释放会制造巨浪，必须缓慢减压。', [['brake', '投入2点能量启动液压制动', 2, '发条在十二个阶段中平稳降速。', { energy: -2, insight: 5 }], ['weights', '用配重逐圈吸收能量', 0, '浪齿守着每一圈，海面终于恢复呼吸般的节拍。', { insight: 3 }]]],
        boss: ['自然的钟', '改变生态节律前最应评估什么？', ['对整个生态系统的长期影响', '游客照片数量', '机器转得多快', '广告是否好看'], 0, '生态'],
        finish: ['月亮重新计时', '幼鲸随正常涨潮游回深海。主发条没有被毁掉，而被改成只记录潮汐、不再命令潮汐。']
    },
    {
        id: 'phoenix-sanctuary', titleZh: '凤凰保护区', titleEn: 'Phoenix Sanctuary', icon: '🔥', color: '#b85c45', guide: '护育员赤羽',
        summaryZh: '重生火焰失去温度只剩强光，幼鸟无法破壳。寻找被盗走的“余温”，也面对保护区的过度干预。', summaryEn: 'Rebirth flames lose all warmth, leaving hatchlings trapped. Recover the stolen heat and question overprotection.',
        arrival: ['冰冷的火', '火焰照得人睁不开眼，羽毛靠近却毫无温度。赤羽承认保护区为了避免火灾，把所有热量抽进了地下保险库。'],
        quiz: ['热的传递', '热量通常会自发从哪里传向哪里？', ['高温物体到低温物体', '低温到高温且无需能量', '只在真空中', '颜色深到颜色浅'], 0, '物理'],
        multi: ['孵化照护', '照护鸟卵应关注哪些？', ['适宜温度', '湿度', '频繁摇晃', '孵化周期'], [0, 1, 3], '生物'],
        order: ['恢复巢温', [['measure', '测量各巢温度'], ['warm', '小幅增加热量'], ['observe', '观察胚胎反应'], ['adjust', '按反馈微调']], ['measure', 'warm', 'observe', 'adjust']],
        matching: ['凤凰阶段', [['egg', '蛋'], ['chick', '幼鸟'], ['adult', '成鸟']], [['incubate', '需要稳定孵化'], ['learn', '学习控制火焰'], ['migrate', '参与迁徙']], { egg: 'incubate', chick: 'learn', adult: 'migrate' }],
        cipher: ['巢温差', '目标温度38度，当前31度，还需升高多少度？', '7', '38－31。'],
        memory: ['火羽呼吸', ['glow', 'warm', 'rest', 'warm', 'glow', 'rest'], { glow: '发光', warm: '升温', rest: '休息' }],
        path: ['熔岩巢台', ['west', 'north', 'east', 'north', 'west', 'north']],
        choice: ['破壳的帮助', '一只幼鸟啄壳很慢，赤羽想直接替它打开。', [['wait', '维持环境并让它自己完成关键过程', '幼鸟通过啄壳完成第一次力量训练，健康站起。', { insight: 5 }], ['assist', '只在监测显示危险时最小介入', '明确干预边界既避免放任，也避免过度帮助。', { insight: 4 }]]],
        resource: ['释放余温', '保险库一次释放全部热量会烧毁巢区。', [['meter', '投入2点能量启动分巢温控', 2, '每个巢得到恰好的温度，第一枚蛋出现裂纹。', { energy: -2, insight: 5 }], ['stones', '用蓄热石分批搬运余温', 0, '赤羽逐块布置，冰冷火焰慢慢有了温度。', { insight: 3 }]]],
        boss: ['保护的尺度', '帮助成长中的动物时，合适原则是？', ['依据需要进行最小有效干预', '替它完成所有事情', '完全不观察', '只追求立即结果'], 0, '生物'],
        finish: ['第一声破壳', '幼鸟自己顶开蛋壳，喷出一小团温暖火星。赤羽拆掉过度保险系统，留下可监测、可调整的照护。']
    },
    {
        id: 'invisible-city', titleZh: '隐形城市', titleEn: 'Invisible City', icon: '🏙️', color: '#687b91', guide: '测绘师显影',
        summaryZh: '城市坐标仍在，街道却不可见。盲人居民成为唯一能正常通行的人，请他们带路找回被删除的轮廓。', summaryEn: 'The city remains but its streets are invisible. Blind residents become the only reliable guides to restore its outline.',
        arrival: ['看不见不等于不存在', '显影盯着空白广场束手无策，拐杖敲击声却稳定穿过街区。向导知遥说：“路没有消失，只是你们太依赖眼睛。”'],
        quiz: ['感官信息', '人除了视觉外还可以通过什么感知环境？', ['听觉和触觉', '只有视觉', '只靠猜测', '关闭所有感官'], 0, '科学'],
        multi: ['无障碍导航', '让城市更易通行的设计有？', ['触觉铺装', '语音提示', '只设置透明标牌', '连续且无障碍路线'], [0, 1, 3], '设计'],
        order: ['非视觉测绘', [['sound', '记录回声距离'], ['touch', '确认地面边界'], ['route', '走完连续路线'], ['map', '合并多感官地图']], ['sound', 'touch', 'route', 'map']],
        matching: ['导航提示', [['tactile', '凸点地面'], ['audio', '语音信号'], ['contrast', '高对比标记']], [['feet', '脚下触觉'], ['hearing', '听觉方向'], ['lowvision', '辅助低视力者']], { tactile: 'feet', audio: 'hearing', contrast: 'lowvision' }],
        cipher: ['街区距离', '每个街区80米，连续走5个街区是多少米？', '400', '80×5。'],
        memory: ['路口声响', ['bell', 'water', 'steps', 'bell', 'wind', 'water'], { bell: '铃', water: '水', steps: '脚步', wind: '风' }],
        path: ['无形街巷', ['north', 'east', 'east', 'south', 'east', 'north']],
        choice: ['由谁设计新地图', '显影想完成地图后再请知遥测试，知遥要求从一开始就参与。', [['together', '让不同使用者共同设计', '问题在落笔前就被发现，地图不再把任何经验当补充。', { insight: 5 }], ['lead', '请知遥担任路线负责人', '最了解障碍的人拥有决策权，团队效率反而更高。', { insight: 4 }]]],
        resource: ['恢复轮廓场', '显形装置只支持视觉投影，无法帮助所有居民。', [['multi', '投入2点能量加入声音与触觉信标', 2, '街道以光、声和触感同时返回。', { energy: -2, insight: 5 }], ['markers', '先布置实体扶手与凸点路标', 0, '即使装置再次失效，城市仍保留可走的路。', { insight: 4 }]]],
        boss: ['谁定义可见', '无障碍设计最有效的时机是什么？', ['从设计开始就让使用者参与', '全部完成后再补救', '收到投诉也不改', '只听未使用者猜测'], 0, '设计'],
        finish: ['一座被更多人看见的城', '轮廓恢复后，城市没有撤掉声响和触觉标记。显影在地图署名处首先写下知遥和所有带路者。']
    },
    {
        id: 'nebula-laboratory', titleZh: '星云实验室', titleEn: 'Nebula Laboratory', icon: '🧪', color: '#765b9c', guide: '研究员微光',
        summaryZh: '星尘样本突破磁场容器，实验室开始生成微型恒星。按实验记录封锁事故，而不是删掉失败。', summaryEn: 'Stardust escapes containment and births tiny stars. Contain the accident without deleting the failed experiment.',
        arrival: ['桌面上的太阳', '一颗弹珠大小的恒星悬在实验台上，把金属柜烤得通红。微光的主管命令先删除实验日志，免得影响项目评级。'],
        quiz: ['恒星能量', '太阳等恒星的主要能量来源是什么？', ['核聚变', '燃烧木材', '风力', '摩擦橡皮'], 0, '天文'],
        multi: ['实验事故', '实验失控后应当？', ['启动应急预案', '记录真实过程', '先删日志', '隔离危险区域'], [0, 1, 3], '安全'],
        order: ['封锁样本', [['alarm', '发出警报'], ['evacuate', '撤离非必要人员'], ['contain', '启用备用容器'], ['report', '保存并报告数据']], ['alarm', 'evacuate', 'contain', 'report']],
        matching: ['实验系统', [['magnet', '磁场容器'], ['sensor', '辐射传感器'], ['log', '实验日志']], [['confine', '约束带电粒子'], ['detect', '监测危险水平'], ['trace', '追溯操作过程']], { magnet: 'confine', sensor: 'detect', log: 'trace' }],
        cipher: ['安全半径', '每颗微型星需隔离6米，3颗并列且间距独立计算，总安全尺度是多少米？', '18', '6×3。'],
        memory: ['磁场线圈', ['north', 'south', 'south', 'north', 'off', 'north'], { north: '北极', south: '南极', off: '断开' }],
        path: ['辐射隔离门', ['south', 'east', 'north', 'east', 'south', 'east']],
        choice: ['删除失败记录', '主管说删掉日志就不会有人被追责，也不会有人学到事故原因。', [['preserve', '只保护个人隐私，不删除技术事实', '完整证据让团队定位到错误磁场参数。', { insight: 5 }], ['independent', '封存副本并请求独立事故复核', '调查不会被单一负责人控制，改进也更可信。', { insight: 4 }]]],
        resource: ['收回星尘', '微型恒星必须在同一磁场中逐步降温。', [['field', '投入2点能量建立球形约束场', 2, '星光缩回稳定样本，实验室温度下降。', { energy: -2, insight: 5 }], ['shield', '用多层屏蔽盒逐颗套合', 0, '物理隔离减弱反应，最后一颗光点安静熄灭。', { insight: 3 }]]],
        boss: ['失败的价值', '保留失败实验记录的主要意义是？', ['追溯原因并防止重演', '让报告更长', '证明从不犯错', '公开所有私人信息'], 0, '科学'],
        finish: ['没有被删掉的星光', '事故报告完整提交，项目暂停却没有终止。微光把熄灭样本封存为“第一个诚实的失败”。']
    },
    {
        id: 'four-season-tower', titleZh: '四季塔', titleEn: 'Tower of Four Seasons', icon: '🗼', color: '#75874e', guide: '守塔人候风',
        summaryZh: '春夏秋冬被困在同一层，暴雪与花粉同时席卷城市。让四位季节守卫重新听见彼此。', summaryEn: 'All four seasons collide on one floor. Reconcile their keepers and restore a livable cycle.',
        arrival: ['同一天的四场天气', '塔东樱花盛开，塔西暴雪封门，南面热浪，北面落叶。候风说四位守卫争谁才是“最重要的季节”。'],
        quiz: ['季节循环', '一年通常有几个季节？', ['2', '3', '4', '12'], 2, '常识'],
        multi: ['适应极端天气', '面对异常天气应做到？', ['关注预警', '准备合适衣物与水', '完全忽略身体反应', '照顾易受影响者'], [0, 1, 3], '安全'],
        order: ['重排季轮', [['spring', '春季萌发生长'], ['summer', '夏季充分生长'], ['autumn', '秋季成熟收获'], ['winter', '冬季休养']], ['spring', 'summer', 'autumn', 'winter']],
        matching: ['季节信使', [['swallow', '燕子'], ['cicada', '蝉'], ['leaf', '落叶']], [['spring', '常象征春来'], ['summer', '常鸣于夏日'], ['autumn', '常见于秋季']], { swallow: 'spring', cicada: 'summer', leaf: 'autumn' }],
        cipher: ['季轮角度', '四季平均分布在360度圆盘上，每季占多少度？', '90', '360÷4。'],
        memory: ['季节钟声', ['spring', 'summer', 'autumn', 'winter', 'spring', 'autumn'], { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }],
        path: ['穿越气候层', ['north', 'east', 'south', 'west', 'north', 'east']],
        choice: ['最重要的季节', '四位守卫都要求你选出唯一不可替代者。', [['cycle', '拒绝排名，展示完整生命周期', '没有生长、成熟与休养中的任一环，下一季都无法到来。', { insight: 5 }], ['share', '让每位守卫讲述自己依赖其他季节之处', '争论变成理解，季轮开始缓慢转动。', { insight: 4 }]]],
        resource: ['分离气候层', '四股能量纠缠，强行分开会制造风暴。', [['phase', '投入2点能量按季序错峰释放', 2, '气候逐层归位，城市重新拥有过渡。', { energy: -2, insight: 5 }], ['doors', '依次打开塔层通风门', 0, '候风耐心等待每层稳定后才开启下一扇。', { insight: 3 }]]],
        boss: ['循环不是竞赛', '生态循环中多个阶段的关系通常是？', ['相互连接并各有作用', '只能保留一个', '越快越好', '彼此完全无关'], 0, '生态'],
        finish: ['季节重新经过', '春花谢后夏风到来，不再同时争抢天空。候风把塔钟改成渐变色，让人们看见季节之间也有路。']
    },
    {
        id: 'memory-planet', titleZh: '记忆行星', titleEn: 'Planet of Memory', icon: '🧠', color: '#8a5e8c', guide: '记录者回声',
        summaryZh: '居民共同记忆出现空洞，每个人都记得胜利却没人记得代价。进入记忆海，找回被集体删去的一天。', summaryEn: 'Shared memory has holes: everyone recalls victory, nobody its cost. Recover the day the planet chose to forget.',
        arrival: ['所有人都忘记了同一天', '日历从第208日直接跳到210日。回声询问一百个人，每个人都用同一句话回答：“第209日没有发生任何事。”'],
        quiz: ['记忆可靠性', '人的记忆是否可能受到后来信息影响？', ['可能', '绝不可能', '只在梦中', '只有儿童会'], 0, '心理'],
        multi: ['重建事件', '重建缺失历史可参考？', ['多方记录', '实物证据', '只采用官方一句话', '时间一致性'], [0, 1, 3], '信息素养'],
        order: ['进入记忆海', [['anchor', '建立现实锚点'], ['sample', '读取不同记忆碎片'], ['compare', '识别共同与冲突'], ['return', '带证据安全返回']], ['anchor', 'sample', 'compare', 'return']],
        matching: ['记忆证据', [['diary', '私人日记'], ['photo', '照片'], ['scar', '旧伤痕']], [['view', '个人视角'], ['image', '视觉记录'], ['body', '身体经历']], { diary: 'view', photo: 'image', scar: 'body' }],
        cipher: ['缺失日期', '208之后、210之前的数字是什么？', '209', '相邻整数。'],
        memory: ['碎片回放', ['alarm', 'march', 'silence', 'alarm', 'names', 'silence'], { alarm: '警报', march: '队列', silence: '静默', names: '名单' }],
        path: ['记忆海沟', ['west', 'north', 'east', 'north', 'west', 'west']],
        choice: ['第209日', '真相是一场胜利庆典忽视警报，导致救援队伤亡。居民集体选择忘记。', [['remember', '恢复事实并纪念承担代价的人', '痛苦返回了，但名字也终于返回公共记忆。', { insight: 5 }], ['care', '分阶段公开并提供支持空间', '真相没有再次成为伤害，居民共同学习承受它。', { insight: 4 }]]],
        resource: ['修补共同记忆', '记忆核心会自动删除带来羞愧的内容。', [['rule', '投入2点能量改写删除规则为受限保存', 2, '困难记忆不再消失，而由安全权限保护。', { energy: -2, insight: 5 }], ['archive', '建立独立纸本与口述档案', 0, '即使核心再次选择遗忘，事实仍有外部见证。', { insight: 4 }]]],
        boss: ['记住代价', '面对群体历史中的错误，负责任做法是？', ['保存事实、承担责任并改进', '集体删除', '只记胜利', '指责提出证据者'], 0, '社会'],
        finish: ['日历补回一页', '第209日重新出现在日历上，没有庆典图案，只有救援队员的名字和一句“我们选择不再忘记”。']
    },
    {
        id: 'edge-of-map', titleZh: '地图尽头', titleEn: 'Edge of the Map', icon: '🗺️', color: '#866f54', guide: '探险家界碑',
        summaryZh: '未知区域吞没已绘边界，先遣队为抢首发不断编造地名。停下竞赛，画一张承认未知的地图。', summaryEn: 'The unknown erases mapped borders while explorers invent discoveries for credit. Make a map honest about uncertainty.',
        arrival: ['“这里什么都有”', '界碑拿出三张同一区域地图：一张画森林，一张画海，一张画金色王城。它们唯一共同点是绘图者都没去过。'],
        quiz: ['地图方向', '现代地图通常用什么符号表示方向？', ['指北针', '价格标签', '音量条', '温度色'], 0, '地理'],
        multi: ['探索伦理', '进入未知地区应当？', ['记录不确定性', '尊重当地居民', '为抢先随意命名', '公开测量方法'], [0, 1, 3], '社会'],
        order: ['绘制未知', [['observe', '实地观察'], ['coordinate', '记录坐标'], ['confidence', '标注置信程度'], ['review', '由他人复核']], ['observe', 'coordinate', 'confidence', 'review']],
        matching: ['地图标注', [['solid', '实线'], ['dashed', '虚线'], ['blank', '留白']], [['confirmed', '已确认边界'], ['uncertain', '暂不确定'], ['unknown', '尚未探索']], { solid: 'confirmed', dashed: 'uncertain', blank: 'unknown' }],
        cipher: ['比例距离', '图上1厘米代表10千米，图上7厘米代表多少千米？', '70', '7×10。'],
        memory: ['界碑符号', ['mountain', 'river', 'blank', 'forest', 'river', 'blank'], { mountain: '山', river: '河', blank: '未知', forest: '林' }],
        path: ['越过旧边线', ['north', 'east', 'north', 'west', 'north', 'east']],
        choice: ['抢先命名', '队员发现当地人早有自己的地名，但赞助商要求用公司名字换取经费。', [['local', '记录并尊重当地已有名称', '地图不再把有人生活的地方假装成无人发现。', { insight: 5 }], ['dual', '保留本地名并注明不同语言来源', '多种称呼被透明记录，而非被权力覆盖。', { insight: 4 }]]],
        resource: ['稳定地图边缘', '边缘由过度确定的虚构线条触发，越断言越快崩塌。', [['uncertainty', '投入2点能量写入可验证的不确定性标层', 2, '地图停止假装全知，真实边界重新稳定。', { energy: -2, insight: 5 }], ['erase', '手工擦除所有无证据线条', 0, '空白扩大了一会儿，却不再吞噬真实区域。', { insight: 4 }]]],
        boss: ['留白的勇气', '证据不足时，地图最诚实的表示是？', ['明确标注未知或不确定', '凭想象补满', '复制最漂亮版本', '隐藏测量方法'], 0, '信息素养'],
        finish: ['尽头之后仍是路', '新地图边缘没有怪兽，只有“尚待了解”。界碑把首发日期留空，把当地向导的名字写在最前。']
    },
    {
        id: 'gate-of-tomorrow', titleZh: '明日之门', titleEn: 'Gate of Tomorrow', icon: '🚪', color: '#9a7838', guide: '门卫新昼',
        summaryZh: '未来之门拒绝没有完整证据的旅者。汇集四十二段旅程，却发现最后的问题没有标准答案。', summaryEn: 'The gate rejects travelers without complete evidence. Gather every journey, then face a final question with no fixed answer.',
        arrival: ['门后的你', '门面映出无数种未来：有的繁荣，有的荒芜。新昼说门不预测命运，它只放大每个今天选择的后果。'],
        quiz: ['证据与结论', '可靠结论通常应当怎样？', ['与证据相符且可修正', '永不改变', '只符合愿望', '不允许提问'], 0, '逻辑'],
        multi: ['带往未来的能力', '长久解决问题需要哪些能力？', ['核验证据', '与他人合作', '隐藏错误', '根据反馈调整'], [0, 1, 3], '综合'],
        order: ['整理远征档案', [['question', '明确真正问题'], ['evidence', '收集多方证据'], ['action', '采取可逆行动'], ['learn', '复盘结果并改进']], ['question', 'evidence', 'action', 'learn']],
        matching: ['旅程的礼物', [['direction', '极光北针'], ['truth', '零号档案'], ['care', '凤凰余温']], [['orient', '在混乱中定位'], ['remember', '不删除困难事实'], ['grow', '帮助而不过度代替']], { direction: 'orient', truth: 'remember', care: 'grow' }],
        cipher: ['最终章号', '从第9章到第50章（含首尾）共有多少章？', '42', '50－9＋1。'],
        memory: ['五篇章星印', ['truth', 'care', 'courage', 'truth', 'cooperate', 'change'], { truth: '求真', care: '关怀', courage: '勇气', cooperate: '协作', change: '修正' }],
        path: ['未来的分岔', ['east', 'north', 'west', 'north', 'east', 'north']],
        choice: ['没有标准答案的问题', '门问：“如果正确选择会让你失去掌声，你还会选择它吗？”', [['yes', '会，因为后果由真实的人承担', '门没有判定对错，只记录你愿意为理由负责。', { insight: 5 }], ['explain', '我会公开证据、听取受影响者并承担修正', '答案不是口号，而是一套可以被检验的行动。', { insight: 5 }]]],
        resource: ['开启明日之门', '门需要的不是更多能量，而是把一路所得交还给所有世界。', [['share', '投入2点能量公开完整旅程档案', 2, '五十章经验化作公共星图，门锁逐层亮起。', { energy: -2, insight: 6 }], ['voices', '邀请每位同行者共同讲述', 0, '四十二种声音从星图传来，没有谁独占结局。', { insight: 5 }]]],
        boss: ['明日的钥匙', '面对行动带来的新证据，最负责任的做法是？', ['评估结果并愿意修正', '坚持最初决定不变', '只公布成功部分', '把责任交给未来'], 0, '综合'],
        finish: ['门没有关闭', '明日之门打开后并非终点，而是一条回到所有世界的路。新昼说：“未来不是奖品，是你们继续共同修正的故事。”']
    }
];
