'use strict';

const { ADVENTURE_CONFIG, deepFreeze } = require('../configuration');
const HANDCRAFTED_EXPEDITIONS = require('./handcrafted-expeditions');

const n = (id, speaker, text, title = '剧情') => ({ id, kind: 'narrative', title, speaker, text });
const q = (id, title, prompt, options, answer, category, points = 2) => ({
    id, kind: 'quiz', title, prompt, options, answer, category, points
});
const c = (id, title, prompt, code, hint, points = 3) => ({
    id, kind: 'cipher', title, prompt, code, hint, points
});
const m = (id, title, prompt, sequence, tiles, points = 3) => ({
    id, kind: 'memory', title, prompt, sequence, tiles, points
});
const d = (id, title, prompt, choices) => ({ id, kind: 'choice', title, prompt, choices });
const r = (id, title, prompt, choices) => ({ id, kind: 'resource', title, prompt, choices });
const b = (id, title, prompt, options, answer, category, points = 5) => ({
    id, kind: 'boss', title, prompt, options, answer, category, points
});
const u = (id, title, prompt, options, answers, category, points = 4) => ({
    id, kind: 'multi', title, prompt, options, answers, category, points
});
const o = (id, title, prompt, items, sequence, points = 4) => ({
    id, kind: 'order', title, prompt, items, sequence, points
});
const g = (id, title, prompt, left, right, pairs, points = 4) => ({
    id, kind: 'matching', title, prompt, left, right, pairs, points
});
const p = (id, title, prompt, moves, maxSteps, points = 4) => ({
    id, kind: 'path', title, prompt, moves, maxSteps, points
});

const HANDCRAFTED_CHAPTERS = [
    {
        id: 'clockwork-library',
        order: 1,
        prerequisiteChapterId: null,
        titleZh: '第一章：停摆的钟楼图书馆',
        titleEn: 'Chapter I: The Clockwork Library',
        summaryZh: '午夜钟声消失，书页里的时间也停止了。找回三枚齿轮，让故事继续前进。',
        summaryEn: 'The midnight bell is gone and time has stopped between the pages. Recover three gears.',
        difficulty: 1,
        reward: 120,
        color: '#5f6fb2',
        icon: '⌛',
        stages: [
            n('library-arrival', '守页人米娅', '你终于来了。钟楼停在 11:57，三枚校时齿轮散落在不同书区。每通过一次试炼，书架就会让出一条路。', '午夜来信'),
            q('library-map', '地图室', '一小时有多少分钟？', ['30', '45', '60', '90'], 2, '常识'),
            d('library-lantern', '岔路的灯', '左侧传来翻书声，右侧有微弱蓝光。你要先调查哪里？', [
                { id: 'books', label: '顺着翻书声走', feedback: '你安抚了受惊的纸鹤，得到「纸羽」。', effects: { item: 'paper-feather', insight: 1 } },
                { id: 'light', label: '追随蓝色微光', feedback: '微光照出墙上的星图，线索值增加。', effects: { energy: 1, insight: 2 } }
            ]),
            c('library-catalogue', '倒序书目', '目录边缘写着：把“3124”按从小到大的顺序排列。', '1234', '四个数字都要保留。'),
            m('library-shelves', '会移动的书架', '记住书架亮起的顺序，然后依次点击。', ['moon', 'key', 'leaf', 'star'], [
                { id: 'star', label: '星星' }, { id: 'leaf', label: '叶片' }, { id: 'moon', label: '月亮' }, { id: 'key', label: '钥匙' }
            ]),
            q('library-language', '语言回廊', '“画蛇添足”最接近下面哪个意思？', ['做了多余的事', '行动很迅速', '互相帮助', '保持安静'], 0, '语文'),
            r('library-bridge', '墨水桥', '桥面需要能量才能显形。你准备怎样通过？', [
                { id: 'steady', label: '消耗 1 点能量稳稳通过', requires: { energy: 1 }, feedback: '桥面完整显形，你安全抵达对岸。', effects: { energy: -1, insight: 2 } },
                { id: 'decode', label: '观察墨迹规律寻找落脚点', feedback: '你踩着重复的标点跳过缺口。', effects: { insight: 1 } }
            ]),
            q('library-science', '自然书库', '植物进行光合作用主要需要哪种能量？', ['声能', '光能', '机械能', '核能'], 1, '科学'),
            c('library-clock', '第一枚齿轮', '钟面提示：午夜用 24 小时制表示为几时？请输入两位数字。', '00', '答案是两位数字。'),
            n('library-gear', '守页人米娅', '齿轮重新咬合，分针向前跳了一格。最深处的年鉴却化成一道黑影，挡住了出口。', '齿轮苏醒'),
            b('library-boss', '年鉴守卫', '闰年通常有多少天？', ['364', '365', '366', '367'], 2, '综合'),
            n('library-finish', '守页人米娅', '钟声重新响起。你带走了第一枚星图碎片，也获得了进入云端站台的通行证。', '章节完成')
        ]
    },
    {
        id: 'cloudline-express',
        order: 2,
        prerequisiteChapterId: 'clockwork-library',
        titleZh: '第二章：云端列车失踪案',
        titleEn: 'Chapter II: Mystery of the Cloudline Express',
        summaryZh: '一列没有终点的列车在云层中循环。追踪车票上的暗号，找到消失的驾驶员。',
        summaryEn: 'A train loops endlessly above the clouds. Follow the ticket cipher and find its missing driver.',
        difficulty: 2,
        reward: 220,
        color: '#2994a5',
        icon: '🚂',
        stages: [
            n('cloudline-platform', '列车员诺亚', '欢迎登上云际 07 号。驾驶员失踪后，列车每七分钟就会回到同一座站台。请别相信所有广播。', '循环站台'),
            q('cloudline-distance', '里程牌', '列车以每小时 60 千米行驶，半小时行驶多少千米？', ['20', '30', '40', '60'], 1, '数学'),
            d('cloudline-passenger', '沉默的乘客', '一个乘客递来两张车票，其中一张印着会变化的日期。你相信哪张？', [
                { id: 'fixed', label: '选择日期固定的车票', feedback: '验票钳留下真实印记，你得到「银色票根」。', effects: { item: 'silver-ticket', insight: 2 } },
                { id: 'changing', label: '选择日期变化的车票', feedback: '票面化成云雾，但你记住了它变化的周期。', effects: { energy: -1, insight: 3 } }
            ]),
            m('cloudline-signals', '信号灯序列', '记住信号灯的安全顺序。', ['green', 'blue', 'white', 'gold', 'green'], [
                { id: 'gold', label: '金' }, { id: 'green', label: '绿' }, { id: 'white', label: '白' }, { id: 'blue', label: '蓝' }
            ]),
            q('cloudline-geography', '车窗之外', '世界上面积最大的海洋是？', ['大西洋', '印度洋', '北冰洋', '太平洋'], 3, '地理'),
            c('cloudline-carriage', '车厢密码', '车厢号依次是 2、4、8、16，下一项是多少？', '32', '每一项都是前一项的两倍。'),
            r('cloudline-engine', '动力舱', '推进器温度过高，你只能先处理一个系统。', [
                { id: 'coolant', label: '投入 2 点能量启动冷却', requires: { energy: 2 }, feedback: '温度快速下降，列车获得稳定动力。', effects: { energy: -2, insight: 3 } },
                { id: 'manual', label: '手动调整四组阀门', feedback: '过程很慢，但你发现了被人为改动的痕迹。', effects: { insight: 2 } }
            ]),
            q('cloudline-physics', '风洞车厢', '声音不能在哪种环境中传播？', ['空气', '水', '钢铁', '真空'], 3, '科学'),
            d('cloudline-radio', '真假广播', '广播要求所有人前往末节车厢，但地图显示那里没有连接。你会怎么做？', [
                { id: 'verify', label: '先核对广播设备编号', feedback: '编号属于废弃设备，你避免了陷阱。', effects: { insight: 3 } },
                { id: 'follow', label: '沿车厢逐节确认', feedback: '你在断开的门前发现驾驶员留下的扳手。', effects: { item: 'driver-wrench', insight: 1 } }
            ]),
            q('cloudline-history', '纪念车厢', '中国古代四大发明中用于辨别方向的是？', ['造纸术', '印刷术', '火药', '指南针'], 3, '历史'),
            c('cloudline-ticket', '票根暗号', '票根写着 A=1、B=2、C=3。请把 CAB 写成数字，不加空格。', '312', '逐个替换三个字母。'),
            m('cloudline-controls', '驾驶台复位', '按记录中的顺序重启控制台。', ['brake', 'power', 'signal', 'route', 'power'], [
                { id: 'route', label: '路线' }, { id: 'signal', label: '信号' }, { id: 'power', label: '动力' }, { id: 'brake', label: '制动' }
            ]),
            b('cloudline-boss', '循环核心', '如果现在是 14:45，再过 35 分钟是几点？', ['15:10', '15:20', '15:30', '14:80'], 1, '综合'),
            n('cloudline-finish', '驾驶员艾琳', '循环核心终于关闭。原来广播黑影把她困在相邻的七分钟里。第二枚星图碎片正在指向海上的灯塔。', '驶出循环')
        ]
    },
    {
        id: 'starlight-lighthouse',
        order: 3,
        prerequisiteChapterId: 'cloudline-express',
        titleZh: '第三章：熄灭的星海灯塔',
        titleEn: 'Chapter III: The Dark Starlight Lighthouse',
        summaryZh: '迷雾吞没星海航道。集齐光谱、重启镜阵，并面对藏在灯塔里的最终谜题。',
        summaryEn: 'Fog swallows the star-sea route. Rebuild the spectrum and face the final riddle in the lighthouse.',
        difficulty: 3,
        reward: 360,
        color: '#9b5ba5',
        icon: '🌌',
        stages: [
            n('lighthouse-shore', '航海家露卡', '灯塔已经熄灭三晚。潮汐带回许多假星星，只有真正的星图碎片能启动顶层镜阵。', '雾海登陆'),
            q('lighthouse-planet', '观星台', '太阳系中体积最大的行星是？', ['地球', '火星', '木星', '金星'], 2, '天文'),
            m('lighthouse-waves', '潮汐石阶', '记住浪花出现的方向顺序。', ['north', 'east', 'east', 'south', 'west', 'north'], [
                { id: 'west', label: '西' }, { id: 'north', label: '北' }, { id: 'south', label: '南' }, { id: 'east', label: '东' }
            ]),
            d('lighthouse-door', '双重门扉', '一扇门温暖明亮，另一扇门安静得听不见海浪。', [
                { id: 'bright', label: '推开明亮的门', feedback: '光只是镜面反射，你识破后收集到「棱镜片」。', effects: { item: 'prism-shard', insight: 2 } },
                { id: 'silent', label: '推开寂静的门', feedback: '门后是真空隔音层，你找到了维护通道。', effects: { energy: 1, insight: 2 } }
            ]),
            c('lighthouse-spectrum', '光谱锁', '红、橙、黄、绿、蓝、靛、紫共多少种颜色？', '7', '输入一个数字。'),
            q('lighthouse-literature', '航海日志', '“海内存知己，天涯若比邻”的作者是？', ['李白', '王勃', '杜甫', '白居易'], 1, '文学'),
            r('lighthouse-generator', '备用发电机', '发电机只能接受一种启动方式。', [
                { id: 'charge', label: '消耗 2 点能量直接点火', requires: { energy: 2 }, feedback: '线圈开始发光，镜阵获得额外稳定度。', effects: { energy: -2, insight: 4 } },
                { id: 'repair', label: '按线路图逐段修复', feedback: '你花了更久，但保留了全部能量。', effects: { insight: 2 } }
            ]),
            q('lighthouse-biology', '生态舱', '人体负责输送血液的器官是？', ['肺', '胃', '心脏', '肝脏'], 2, '科学'),
            m('lighthouse-lenses', '镜阵校准', '按照星图记录旋转六面镜片。', ['violet', 'blue', 'green', 'gold', 'red', 'white'], [
                { id: 'red', label: '红镜' }, { id: 'gold', label: '金镜' }, { id: 'green', label: '绿镜' }, { id: 'blue', label: '蓝镜' }, { id: 'violet', label: '紫镜' }, { id: 'white', label: '白镜' }
            ]),
            q('lighthouse-logic', '守塔人的棋盘', '所有星鸟都会发光，小羽是一只星鸟。可以推出什么？', ['小羽会发光', '所有发光的都是星鸟', '小羽不会飞', '无法得出任何结论'], 0, '逻辑'),
            c('lighthouse-coordinate', '星图坐标', '坐标从 1 开始：STAR 的第 2 个字母和第 4 个字母连起来是什么？', 'TR', '答案是两个大写英文字母。'),
            d('lighthouse-shadow', '黑影的提议', '黑影愿意用一条捷径换走你收集的一件物品。', [
                { id: 'refuse', label: '拒绝交易，坚持完成镜阵', feedback: '三枚碎片互相呼应，黑影的伪装开始崩塌。', effects: { insight: 4 } },
                { id: 'stall', label: '假装考虑，观察它的影子', feedback: '你发现它无法越过真正的星光。', effects: { energy: -1, insight: 3 } }
            ]),
            q('lighthouse-earth', '顶层风暴', '地球自转一周大约需要多长时间？', ['12 小时', '24 小时', '30 天', '365 天'], 1, '地理'),
            b('lighthouse-boss-one', '终局·第一问', '2、3、5、7、11 这一列数的共同特点是什么？', ['都是偶数', '都是质数', '都是平方数', '都是 3 的倍数'], 1, '数学'),
            b('lighthouse-boss-two', '终局·第二问', '要验证一条消息是否可靠，最合理的第一步是？', ['立刻转发', '只看标题', '核对来源与证据', '相信点赞最多的评论'], 2, '信息素养'),
            b('lighthouse-boss-three', '终局·最后一问', '当证据与原先判断冲突时，最好的做法是？', ['忽略证据', '修改判断并继续核实', '责怪提出证据的人', '停止思考'], 1, '逻辑'),
            n('lighthouse-finish', '航海家露卡', '镜阵把三枚碎片合成完整星图，迷雾中的航道重新出现。你的名字被写进守塔人的新一页日志。', '星海重明')
        ]
    },
    {
        id: 'mechanical-forest',
        order: 4,
        prerequisiteChapterId: 'starlight-lighthouse',
        titleZh: '第四章：机械森林的春天',
        titleEn: 'Chapter IV: Spring in the Mechanical Forest',
        summaryZh: '钢铁树木停止生长，动物齿轮陷入沉睡。重建生态循环，唤醒森林之心。',
        summaryEn: 'Steel trees have stopped growing and clockwork animals sleep. Restore the forest cycle.',
        difficulty: 3,
        reward: 480,
        color: '#4d8a62',
        icon: '🌲',
        stages: [
            n('forest-gate', '巡林机器人柯枝', '森林的春季程序没有启动。四条生态链全部断开，而中央主机拒绝接受单一答案。', '生锈的入口'),
            u('forest-needs', '生长条件', '下列哪些是绿色植物正常生长通常需要的条件？（可多选）', ['光照', '水', '适宜温度', '塑料碎片'], [0, 1, 2], '科学'),
            o('forest-cycle', '水循环控制台', '按自然水循环的顺序排列。', [
                { id: 'rain', label: '降水' }, { id: 'evaporation', label: '蒸发' }, { id: 'cloud', label: '凝结成云' }, { id: 'collection', label: '汇入江海' }
            ], ['evaporation', 'cloud', 'rain', 'collection']),
            d('forest-fox', '齿轮狐狸', '一只齿轮狐狸的尾轴被藤蔓卡住，你会怎么处理？', [
                { id: 'careful', label: '停机后慢慢清理藤蔓', feedback: '狐狸安全脱困，送给你一颗「铜松果」。', effects: { item: 'copper-cone', insight: 3 } },
                { id: 'signal', label: '呼叫巡林机器人协作', feedback: '协作很顺利，你记录了标准救援流程。', effects: { energy: 1, insight: 2 } }
            ]),
            g('forest-habitats', '栖息地配对', '把生物与更典型的栖息环境配对。',
                [{ id: 'camel', label: '骆驼' }, { id: 'penguin', label: '企鹅' }, { id: 'frog', label: '青蛙' }],
                [{ id: 'wetland', label: '湿地' }, { id: 'desert', label: '沙漠' }, { id: 'polar', label: '极地' }],
                { camel: 'desert', penguin: 'polar', frog: 'wetland' }),
            q('forest-rings', '年轮档案', '树木年轮通常可以帮助判断什么？', ['树的大致年龄', '当天风速', '土壤颜色', '月球距离'], 0, '科学'),
            p('forest-maze', '树根迷宫', '从入口出发：先向东两步，再向北一步，最后向东一步。', ['east', 'east', 'north', 'east'], 6),
            c('forest-seed', '种子编号', '把单词 SEED 的字母数量乘以 3，密码是多少？', '12', 'SEED 一共有四个字母。'),
            r('forest-power', '光能分配', '剩余电力只能优先启动一套设施。', [
                { id: 'nursery', label: '启动幼苗温室', requires: { energy: 2 }, feedback: '幼苗舒展开叶片，生态稳定度大幅提高。', effects: { energy: -2, insight: 4 } },
                { id: 'pollinator', label: '启动机械蜂群', feedback: '蜂群开始为花朵授粉，森林恢复了声音。', effects: { insight: 3 } }
            ]),
            m('forest-birds', '候鸟信号', '记住机械候鸟的鸣叫灯序。', ['chirp', 'trill', 'chirp', 'whistle', 'hum'], [
                { id: 'hum', label: '嗡' }, { id: 'chirp', label: '啾' }, { id: 'whistle', label: '哨' }, { id: 'trill', label: '颤音' }
            ]),
            b('forest-core', '森林之心', '在一条健康食物链中，植物通常扮演什么角色？', ['生产者', '消费者', '分解者', '捕食者'], 0, '生态'),
            n('forest-finish', '巡林机器人柯枝', '第一片真正的嫩叶从钢铁枝头长出。星图在树冠上投下一条通往深海的光路。', '机械春天')
        ]
    },
    {
        id: 'abyssal-archive',
        order: 5,
        prerequisiteChapterId: 'mechanical-forest',
        titleZh: '第五章：深海档案馆',
        titleEn: 'Chapter V: The Abyssal Archive',
        summaryZh: '沉没的档案馆正被海压撕裂。修复潜航路线，在氧气耗尽前取回潮汐记录。',
        summaryEn: 'A sunken archive is breaking under pressure. Repair the route and recover the tide records.',
        difficulty: 4,
        reward: 620,
        color: '#24718c',
        icon: '🐋',
        stages: [
            n('abyss-dive', '潜航员岚', '这里的每扇门都记录着一次潮汐。别追逐发光的鱼，它们会把潜艇带向错误年代。', '下潜'),
            q('abyss-pressure', '压力舱', '潜水越深，周围水压通常会怎样？', ['减小', '增大', '不变', '先消失'], 1, '科学'),
            g('abyss-tools', '潜航工具', '把工具与主要用途配对。',
                [{ id: 'sonar', label: '声呐' }, { id: 'compass', label: '罗盘' }, { id: 'tank', label: '气瓶' }],
                [{ id: 'direction', label: '辨别方向' }, { id: 'breathing', label: '提供呼吸气体' }, { id: 'detect', label: '探测水下目标' }],
                { sonar: 'detect', compass: 'direction', tank: 'breathing' }),
            m('abyss-jellyfish', '水母灯阵', '记住水母依次亮起的颜色。', ['cyan', 'violet', 'white', 'cyan', 'gold', 'violet'], [
                { id: 'white', label: '白' }, { id: 'gold', label: '金' }, { id: 'cyan', label: '青' }, { id: 'violet', label: '紫' }
            ]),
            u('abyss-safety', '潜水安全', '下列哪些做法有助于安全潜水？（可多选）', ['检查装备', '遵守上升速度', '独自进入未知洞穴', '关注剩余气量'], [0, 1, 3], '安全'),
            p('abyss-current', '暗流路线', '避开漩涡：向南、向东、向东、向北、向东。', ['south', 'east', 'east', 'north', 'east'], 7),
            o('abyss-message', '紧急通信', '把发送求救消息的步骤排成合理顺序。', [
                { id: 'position', label: '报告位置' }, { id: 'listen', label: '等待并听取回复' }, { id: 'call', label: '发出求救呼号' }, { id: 'situation', label: '说明情况' }
            ], ['call', 'position', 'situation', 'listen']),
            c('abyss-tide', '潮汐门', '一天有 24 小时，半天是多少小时？', '12', '输入两位数字也可以。'),
            d('abyss-whale', '鲸歌回声', '远处传来重复的鲸歌，你要怎样判断方向？', [
                { id: 'array', label: '比较多个接收器的到达时间', feedback: '时间差指出鲸群在西北方，也暴露了档案馆入口。', effects: { insight: 4 } },
                { id: 'wait', label: '关闭推进器静静聆听', feedback: '噪声消失后，回声轮廓变得清晰。', effects: { energy: 1, insight: 2 } }
            ]),
            q('abyss-salt', '海水样本', '海水具有咸味，主要因为含有较多什么？', ['溶解的盐类', '糖', '氧气泡', '泥沙'], 0, '科学'),
            b('abyss-guardian', '档案馆守卫', '声呐主要利用哪一种波来探测目标？', ['光波', '声波', '无线电波', '引力波'], 1, '综合'),
            n('abyss-finish', '潜航员岚', '潮汐记录被安全封存。最深的一页标着月面城市的坐标，像是有人从那里操纵整片海洋。', '浮出深蓝')
        ]
    },
    {
        id: 'lunar-city',
        order: 6,
        prerequisiteChapterId: 'abyssal-archive',
        titleZh: '第六章：月面失重城',
        titleEn: 'Chapter VI: The Weightless Lunar City',
        summaryZh: '月面城市的重力系统反复翻转。穿越失重街区，修复被篡改的轨道程序。',
        summaryEn: 'Gravity keeps flipping across the lunar city. Cross the weightless district and repair its orbit code.',
        difficulty: 4,
        reward: 800,
        color: '#6d718a',
        icon: '🌙',
        stages: [
            n('lunar-airlock', '工程师赛拉', '抓紧扶手。每隔九十秒，街道就会变成天花板。有人把重力程序改成了一首循环乐谱。', '月港气闸'),
            q('lunar-gravity', '重力课堂', '与地球相比，月球表面的重力大约是地球的多少？', ['约六分之一', '完全相同', '约六倍', '为零'], 0, '天文'),
            p('lunar-crossing', '失重街区', '沿安全扶手移动：上、上、右、下、右、上。', ['north', 'north', 'east', 'south', 'east', 'north'], 8),
            u('lunar-gear', '舱外装备', '进行舱外活动通常需要哪些关键装备？（可多选）', ['密封航天服', '生命保障系统', '普通雨伞', '通信设备'], [0, 1, 3], '航天'),
            g('lunar-units', '单位校准', '把物理量与常用单位配对。',
                [{ id: 'time', label: '时间' }, { id: 'mass', label: '质量' }, { id: 'length', label: '长度' }],
                [{ id: 'meter', label: '米' }, { id: 'second', label: '秒' }, { id: 'kilogram', label: '千克' }],
                { time: 'second', mass: 'kilogram', length: 'meter' }),
            o('lunar-launch', '发射序列', '按合理顺序排列任务阶段。', [
                { id: 'orbit', label: '进入轨道' }, { id: 'check', label: '系统检查' }, { id: 'launch', label: '点火发射' }, { id: 'deploy', label: '展开设备' }
            ], ['check', 'launch', 'orbit', 'deploy']),
            c('lunar-crater', '环形山编号', '3 的平方加 4 的平方等于多少？', '25', '先分别平方，再相加。'),
            m('lunar-notes', '重力乐谱', '记住控制台的音符顺序。', ['do', 'mi', 'sol', 'mi', 'la', 'do'], [
                { id: 'do', label: 'Do' }, { id: 'mi', label: 'Mi' }, { id: 'sol', label: 'Sol' }, { id: 'la', label: 'La' }
            ]),
            r('lunar-reactor', '反应堆旁路', '两条线路都能恢复重力，但资源消耗不同。', [
                { id: 'shield', label: '消耗 3 点能量启动屏蔽线路', requires: { energy: 3 }, feedback: '线路稳定，城市的上下方向终于固定。', effects: { energy: -3, insight: 5 } },
                { id: 'manual', label: '手动同步十二个继电器', feedback: '同步完成，你发现篡改代码来自镜像剧场。', effects: { insight: 3 } }
            ]),
            q('lunar-orbit', '轨道程序', '地球绕太阳公转一周大约需要多久？', ['一天', '一个月', '一年', '十年'], 2, '天文'),
            b('lunar-core', '失重核心', '宇航员在月球上质量会怎样变化？', ['变为零', '质量基本不变', '变为六倍', '每天变化'], 1, '综合'),
            n('lunar-finish', '工程师赛拉', '城市重新拥有了稳定的地面。篡改者留下的签名不是名字，而是一张通往镜像剧场的双面票。', '重力归位')
        ]
    },
    {
        id: 'mirror-theatre',
        order: 7,
        prerequisiteChapterId: 'lunar-city',
        titleZh: '第七章：镜像剧场',
        titleEn: 'Chapter VII: The Mirror Theatre',
        summaryZh: '每句台词都有真假两个版本。辨认证据、排列演出，找到藏在观众席里的导演。',
        summaryEn: 'Every line has a true and false version. Test the evidence and find the hidden director.',
        difficulty: 5,
        reward: 1000,
        color: '#a14f72',
        icon: '🎭',
        stages: [
            n('theatre-curtain', '提词员鸢尾', '演出已经重复了 999 次。镜中的演员总比真人早说半句，除非你能让剧本回到正确顺序。', '第千场演出'),
            q('theatre-evidence', '真假台词', '判断一条消息是否可靠，最重要的依据通常是？', ['说话音量', '可核实的来源和证据', '转发数量', '文字颜色'], 1, '信息素养'),
            u('theatre-sources', '资料审查', '哪些特征通常能提高资料可信度？（可多选）', ['注明来源', '可重复验证', '只有夸张标题', '数据与结论对应'], [0, 1, 3], '信息素养'),
            g('theatre-roles', '幕后职位', '把剧场职位与职责配对。',
                [{ id: 'director', label: '导演' }, { id: 'actor', label: '演员' }, { id: 'lighting', label: '灯光师' }],
                [{ id: 'perform', label: '表演角色' }, { id: 'lights', label: '控制舞台照明' }, { id: 'vision', label: '统筹创作呈现' }],
                { director: 'vision', actor: 'perform', lighting: 'lights' }),
            o('theatre-story', '叙事顺序', '把一个基本故事结构排列正确。', [
                { id: 'ending', label: '结局' }, { id: 'conflict', label: '冲突发展' }, { id: 'beginning', label: '人物与背景' }, { id: 'turn', label: '关键转折' }
            ], ['beginning', 'conflict', 'turn', 'ending']),
            d('theatre-mask', '两副面具', '一副面具会让人只说事实，另一副会让人只说愿望。', [
                { id: 'observe', label: '先观察两位演员的可验证陈述', feedback: '你用舞台记录核对台词，找到了事实面具。', effects: { insight: 4 } },
                { id: 'question', label: '询问两副面具共同知道的事', feedback: '共同信息排除了夸张的愿望台词。', effects: { energy: 1, insight: 3 } }
            ]),
            p('theatre-backstage', '后台追踪', '沿脚印走：西、北、北、东、北、西。', ['west', 'north', 'north', 'east', 'north', 'west'], 8),
            c('theatre-seat', '座位暗号', '第 2 排第 5 座与第 3 排第 4 座，排数与座号分别相加，连写答案。', '59', '2+3，5+4。'),
            m('theatre-lights', '追光灯', '记住舞台灯光的切换顺序。', ['left', 'center', 'right', 'center', 'left', 'right'], [
                { id: 'left', label: '左侧' }, { id: 'center', label: '中央' }, { id: 'right', label: '右侧' }
            ]),
            q('theatre-logic', '导演的悖论', '“这句话是假的”主要展示了什么问题？', ['测量误差', '自指悖论', '地理坐标', '化学反应'], 1, '逻辑'),
            b('theatre-director', '最后谢幕', '发现自己的推理有漏洞时，最合理的做法是？', ['隐藏漏洞', '重新检查前提和证据', '坚持原答案', '停止收集信息'], 1, '逻辑'),
            n('theatre-finish', '提词员鸢尾', '镜面一块块熄灭，真正的导演席却空无一人。椅背刻着四个字：星核法庭。', '真实谢幕')
        ]
    },
    {
        id: 'star-core-court',
        order: 8,
        prerequisiteChapterId: 'mirror-theatre',
        titleZh: '第八章：星核法庭',
        titleEn: 'Chapter VIII: Court of the Star Core',
        summaryZh: '所有旅程成为证据。完成最终审理，决定星图应由谁保管。',
        summaryEn: 'Every journey becomes evidence. Complete the final hearing and decide who keeps the star map.',
        difficulty: 5,
        reward: 1280,
        color: '#b27d2e',
        icon: '⚖️',
        stages: [
            n('court-arrival', '书记官零', '你被指控擅自改变八个世界的既定结局。法庭不会询问你是否勇敢，只检查每一步是否有理由。', '星核传票'),
            u('court-proof', '证据标准', '哪些属于更可靠的论证方式？（可多选）', ['给出可检查证据', '区分事实和观点', '只重复结论', '考虑反例'], [0, 1, 3], '逻辑'),
            g('court-worlds', '旅程证物', '把章节与取回的关键成果配对。',
                [{ id: 'library', label: '钟楼图书馆' }, { id: 'forest', label: '机械森林' }, { id: 'abyss', label: '深海档案馆' }],
                [{ id: 'spring', label: '生态春季程序' }, { id: 'tide', label: '潮汐记录' }, { id: 'gear', label: '校时齿轮' }],
                { library: 'gear', forest: 'spring', abyss: 'tide' }),
            o('court-argument', '陈述顺序', '把清晰论证的步骤排列正确。', [
                { id: 'conclusion', label: '得出结论' }, { id: 'question', label: '明确问题' }, { id: 'evidence', label: '检查证据' }, { id: 'alternatives', label: '比较其他解释' }
            ], ['question', 'evidence', 'alternatives', 'conclusion']),
            p('court-chambers', '证言长廊', '依次拜访四个证人：东、北、西、北、东、东。', ['east', 'north', 'west', 'north', 'east', 'east'], 8),
            q('court-probability', '概率证人', '掷一枚均匀硬币，出现正面的概率是？', ['0', '1/4', '1/2', '1'], 2, '数学'),
            c('court-seal', '法庭印章', '八个章节分成两组，每组章节数相同，每组有几章？', '4', '8 ÷ 2。'),
            m('court-testimony', '证言回放', '记住证人席亮起的顺序。', ['archive', 'forest', 'moon', 'theatre', 'library', 'ocean', 'court'], [
                { id: 'library', label: '书库' }, { id: 'archive', label: '档案' }, { id: 'forest', label: '森林' }, { id: 'ocean', label: '海洋' }, { id: 'moon', label: '月城' }, { id: 'theatre', label: '剧场' }, { id: 'court', label: '法庭' }
            ]),
            r('court-choice', '星图归属', '法庭允许你先提出一种保管方案。', [
                { id: 'shared', label: '建立公开、可核验的共同档案', feedback: '书记官记录了透明规则，多个世界可以互相监督。', effects: { insight: 5 } },
                { id: 'guardians', label: '由各世界选出轮值守护者', feedback: '轮值降低了权力长期集中的风险。', effects: { energy: -1, insight: 4 } }
            ]),
            b('court-boss-one', '终审·证据', '两个来源说法冲突时，下一步最合理的是？', ['任选喜欢的', '比较原始证据与方法', '两个都转发', '忽略冲突'], 1, '信息素养'),
            b('court-boss-two', '终审·责任', '拥有影响他人的信息时，最负责任的做法是？', ['先核实再传播', '抢先发布', '删除所有异议', '只看是否有趣'], 0, '信息素养'),
            n('court-finish', '书记官零', '法槌落下：无罪。星图不再属于某一个人，而成为所有世界都能核验的共同档案。新的空白航线正在等待下一季。', '第一季终章')
        ]
    }
];

const listItems = (entries) => entries.map(([id, label]) => ({ id, label }));

function compileHandcraftedChapter(spec, index) {
    const order = index + 9;
    const prefix = `expedition-${String(order).padStart(2, '0')}`;
    const previousId = order === 9 ? 'star-core-court' : HANDCRAFTED_EXPEDITIONS[index - 1].id;
    const [quizTitle, quizPrompt, quizOptions, quizAnswer, quizCategory] = spec.quiz;
    const [multiTitle, multiPrompt, multiOptions, multiAnswers, multiCategory] = spec.multi;
    const [orderTitle, orderItems, orderSequence] = spec.order;
    const [matchingTitle, matchingLeft, matchingRight, matchingPairs] = spec.matching;
    const [cipherTitle, cipherPrompt, cipherCode, cipherHint] = spec.cipher;
    const [memoryTitle, memorySequence, memoryLabels] = spec.memory;
    const [pathTitle, pathMoves] = spec.path;
    const [choiceTitle, choicePrompt, choiceOptions] = spec.choice;
    const [resourceTitle, resourcePrompt, resourceOptions] = spec.resource;
    const [bossTitle, bossPrompt, bossOptions, bossAnswer, bossCategory] = spec.boss;
    const [arrivalTitle, arrivalText] = spec.arrival;
    const [finishTitle, finishText] = spec.finish;

    return {
        id: spec.id,
        order,
        prerequisiteChapterId: previousId,
        titleZh: `第${order}章：${spec.titleZh}`,
        titleEn: `Chapter ${order}: ${spec.titleEn}`,
        summaryZh: spec.summaryZh,
        summaryEn: spec.summaryEn,
        difficulty: Math.min(10, 5 + Math.floor((order - 9) / 7)),
        reward: 1280 + (order - 8) * 120,
        color: spec.color,
        icon: spec.icon,
        authorship: 'handcrafted',
        stages: [
            n(`${prefix}-arrival`, spec.guide, arrivalText, arrivalTitle),
            q(`${prefix}-numbers`, quizTitle, quizPrompt, quizOptions, quizAnswer, quizCategory, 3),
            u(`${prefix}-evidence`, multiTitle, multiPrompt, multiOptions, multiAnswers, multiCategory, 4),
            o(`${prefix}-workflow`, orderTitle, `按剧情线索排列“${orderTitle}”的步骤。`,
                listItems(orderItems), orderSequence, 4),
            g(`${prefix}-tools`, matchingTitle, `完成“${matchingTitle}”的对应关系。`,
                listItems(matchingLeft), listItems(matchingRight), matchingPairs, 4),
            c(`${prefix}-cipher`, cipherTitle, cipherPrompt, cipherCode, cipherHint, 4),
            m(`${prefix}-signals`, memoryTitle, `记住“${memoryTitle}”中出现的顺序。`,
                memorySequence, Object.entries(memoryLabels).map(([id, label]) => ({ id, label })), 4),
            p(`${prefix}-route`, pathTitle, `沿“${pathTitle}”标记的路线前进。`, pathMoves, 8, 4),
            d(`${prefix}-choice`, choiceTitle, choicePrompt, choiceOptions.map(
                ([id, label, feedback, effects]) => ({ id, label, feedback, effects })
            )),
            r(`${prefix}-power`, resourceTitle, resourcePrompt, resourceOptions.map(
                ([id, label, energy, feedback, effects]) => ({
                    id,
                    label,
                    ...(energy > 0 ? { requires: { energy } } : {}),
                    feedback,
                    effects
                })
            )),
            b(`${prefix}-guardian`, bossTitle, bossPrompt, bossOptions, bossAnswer, bossCategory, 6),
            n(`${prefix}-finish`, spec.guide, finishText, finishTitle)
        ]
    };
}

const CHAPTERS = deepFreeze([
    ...HANDCRAFTED_CHAPTERS,
    ...HANDCRAFTED_EXPEDITIONS.map(compileHandcraftedChapter)
]);
function validateContent(chapters = CHAPTERS) {
    const chapterIds = new Set();
    const chapterOrders = new Set();
    const stageIds = new Set();
    const authoredSummaries = new Set();
    const authoredArrivals = new Set();
    const authoredFinales = new Set();
    const authoredStageTitles = new Set();
    const authoredStagePrompts = new Set();
    for (const chapter of chapters) {
        if (!/^[a-z][a-z0-9-]{2,48}$/.test(chapter.id) || chapterIds.has(chapter.id)) {
            throw new Error(`Invalid adventure chapter: ${chapter.id}`);
        }
        if (!Number.isSafeInteger(chapter.order) || chapter.order < 1 || chapterOrders.has(chapter.order)
            || !Number.isSafeInteger(chapter.reward) || chapter.reward < 0 || chapter.reward > 10_000
            || !Array.isArray(chapter.stages) || chapter.stages.length < 6) {
            throw new Error(`Invalid adventure chapter configuration: ${chapter.id}`);
        }
        chapterIds.add(chapter.id);
        chapterOrders.add(chapter.order);
        if (chapter.order >= 9) {
            const arrival = chapter.stages[0];
            const finale = chapter.stages.at(-1);
            if (chapter.authorship !== 'handcrafted'
                || chapter.stages.length !== 12
                || arrival?.kind !== 'narrative'
                || finale?.kind !== 'narrative'
                || authoredSummaries.has(chapter.summaryZh)
                || authoredArrivals.has(arrival.text)
                || authoredFinales.has(finale.text)) {
                throw new Error(`Adventure chapter is not independently authored: ${chapter.id}`);
            }
            authoredSummaries.add(chapter.summaryZh);
            authoredArrivals.add(arrival.text);
            authoredFinales.add(finale.text);
        }
        for (const stage of chapter.stages) {
            if (!/^[a-z][a-z0-9-]{2,64}$/.test(stage.id) || stageIds.has(stage.id)) {
                throw new Error(`Invalid adventure stage: ${stage.id}`);
            }
            if (!['narrative', 'quiz', 'cipher', 'memory', 'choice', 'resource', 'boss', 'multi', 'order', 'matching', 'path'].includes(stage.kind)) {
                throw new Error(`Unknown adventure stage kind: ${stage.kind}`);
            }
            if ((stage.kind === 'quiz' || stage.kind === 'boss')
                && (!Array.isArray(stage.options) || stage.options.length < 2
                    || !Number.isInteger(stage.answer) || !stage.options[stage.answer])) {
                throw new Error(`Invalid adventure quiz: ${stage.id}`);
            }
            if (stage.kind === 'cipher' && (typeof stage.code !== 'string' || !stage.code)) {
                throw new Error(`Invalid adventure cipher: ${stage.id}`);
            }
            if (stage.kind === 'memory'
                && (!Array.isArray(stage.sequence) || stage.sequence.length < 3
                    || stage.sequence.length > ADVENTURE_CONFIG.maximumSequenceLength
                    || stage.sequence.some((entry) => !stage.tiles.some((tile) => tile.id === entry)))) {
                throw new Error(`Invalid adventure memory trial: ${stage.id}`);
            }
            if (stage.kind === 'multi'
                && (!Array.isArray(stage.options) || stage.options.length < 3
                    || !Array.isArray(stage.answers) || stage.answers.length < 2
                    || stage.answers.some((answer) => !Number.isInteger(answer) || !stage.options[answer])
                    || new Set(stage.answers).size !== stage.answers.length)) {
                throw new Error(`Invalid adventure multi-select trial: ${stage.id}`);
            }
            if (stage.kind === 'order'
                && (!Array.isArray(stage.items) || stage.items.length < 3
                    || !Array.isArray(stage.sequence) || stage.sequence.length !== stage.items.length
                    || new Set(stage.sequence).size !== stage.items.length
                    || stage.sequence.some((id) => !stage.items.some((item) => item.id === id)))) {
                throw new Error(`Invalid adventure ordering trial: ${stage.id}`);
            }
            if (stage.kind === 'matching'
                && (!Array.isArray(stage.left) || stage.left.length < 2
                    || !Array.isArray(stage.right) || stage.right.length !== stage.left.length
                    || !stage.pairs || Object.keys(stage.pairs).length !== stage.left.length
                    || stage.left.some((item) => !stage.right.some((right) => right.id === stage.pairs[item.id])))) {
                throw new Error(`Invalid adventure matching trial: ${stage.id}`);
            }
            if (stage.kind === 'path'
                && (!Array.isArray(stage.moves) || stage.moves.length < 3
                    || stage.moves.length > ADVENTURE_CONFIG.maximumSequenceLength
                    || stage.moves.some((move) => !['north', 'east', 'south', 'west'].includes(move))
                    || !Number.isSafeInteger(stage.maxSteps) || stage.maxSteps < stage.moves.length
                    || stage.maxSteps > ADVENTURE_CONFIG.maximumSequenceLength)) {
                throw new Error(`Invalid adventure path trial: ${stage.id}`);
            }
            if (chapter.order >= 9
                && (authoredStageTitles.has(stage.title)
                    || (stage.prompt && authoredStagePrompts.has(stage.prompt)))) {
                throw new Error(`Adventure stage content is duplicated: ${stage.id}`);
            }
            if (chapter.order >= 9) {
                authoredStageTitles.add(stage.title);
                if (stage.prompt) authoredStagePrompts.add(stage.prompt);
            }
            stageIds.add(stage.id);
        }
    }
    if (chapters.length !== 50
        || chapters.some((chapter, index) => chapter.order !== index + 1)) {
        throw new Error('Adventure chapters must form a contiguous 50-chapter campaign');
    }
    for (const chapter of chapters) {
        if (chapter.prerequisiteChapterId !== null) {
            const prerequisite = chapters.find((candidate) => candidate.id === chapter.prerequisiteChapterId);
            if (!prerequisite || prerequisite.order >= chapter.order) {
                throw new Error(`Invalid adventure prerequisite: ${chapter.id}`);
            }
        }
    }
    return true;
}

validateContent();

const chapterById = new Map(CHAPTERS.map((chapter) => [chapter.id, chapter]));

function getChapter(id) {
    return typeof id === 'string' ? chapterById.get(id) || null : null;
}

function getMissionCatalog() {
    return CHAPTERS.map((chapter) => ({
        id: chapter.id,
        order: chapter.order,
        season: Math.ceil(chapter.order / 10),
        seasonChapter: ((chapter.order - 1) % 10) + 1,
        prerequisiteChapterId: chapter.prerequisiteChapterId,
        titleZh: chapter.titleZh,
        titleEn: chapter.titleEn,
        summaryZh: chapter.summaryZh,
        summaryEn: chapter.summaryEn,
        difficulty: chapter.difficulty,
        reward: chapter.reward,
        color: chapter.color,
        icon: chapter.icon,
        stageCount: chapter.stages.length,
        gameModes: [...new Set(chapter.stages.map((stage) => stage.kind))]
    }));
}

module.exports = {
    CHAPTERS,
    getChapter,
    getMissionCatalog,
    validateContent
};
