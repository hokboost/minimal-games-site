'use strict';

const { ADVENTURE_CONFIG, deepFreeze } = require('../configuration');

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

const CHAPTERS = deepFreeze([
    {
        id: 'clockwork-library',
        order: 1,
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
    }
]);

function validateContent(chapters = CHAPTERS) {
    const chapterIds = new Set();
    const stageIds = new Set();
    for (const chapter of chapters) {
        if (!/^[a-z][a-z0-9-]{2,48}$/.test(chapter.id) || chapterIds.has(chapter.id)) {
            throw new Error(`Invalid adventure chapter: ${chapter.id}`);
        }
        if (!Number.isSafeInteger(chapter.reward) || chapter.reward < 0 || chapter.reward > 10_000
            || !Array.isArray(chapter.stages) || chapter.stages.length < 6) {
            throw new Error(`Invalid adventure chapter configuration: ${chapter.id}`);
        }
        chapterIds.add(chapter.id);
        for (const stage of chapter.stages) {
            if (!/^[a-z][a-z0-9-]{2,64}$/.test(stage.id) || stageIds.has(stage.id)) {
                throw new Error(`Invalid adventure stage: ${stage.id}`);
            }
            if (!['narrative', 'quiz', 'cipher', 'memory', 'choice', 'resource', 'boss'].includes(stage.kind)) {
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
            stageIds.add(stage.id);
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
