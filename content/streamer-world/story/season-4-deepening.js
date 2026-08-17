'use strict';

const {
    option,
    scene
} = require('./authored-helpers');
module.exports = {
    'wild-star-registry': [scene({
        speaker: 'ori',
        introZh: '夜班登记员发现一颗星在三份目录里拥有三个互相矛盾的出生地。',
        introEn: 'A night registrar finds one star with three conflicting birthplaces across three catalogs.',
        promptZh: '怎样保留矛盾而不替星选择故乡？',
        promptEn: 'How should the conflict remain without choosing a home for the star?',
        options: [option({
            labelZh: '并列三份来源',
            labelEn: 'Place all sources side by side',
            outcomeZh: '每项地点都带着原始观测台签名。',
            outcomeEn: 'Each location retains its observatory signature.',
            resultZh: '档案展示分歧，却不把多数票变成事实。',
            resultEn: 'The archive displays disagreement without turning a majority into fact.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '绘制漂移时间线',
            labelEn: 'Chart the recorded drift',
            outcomeZh: '坐标按各自日期排成透明轨迹。',
            outcomeEn: 'Coordinates form a transparent timeline by date.',
            resultZh: '读者能研究变化，同时看见资料缺口。',
            resultEn: 'Readers can study change while seeing the gaps.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '询问邻星见证',
            labelEn: 'Invite neighboring-star testimony',
            outcomeZh: '邻近光源留下不同角度的描述。',
            outcomeEn: 'Nearby lights leave accounts from different angles.',
            resultZh: '关系证词丰富记录，但没有证词获得统治权。',
            resultEn: 'Relational testimony enriches the record without ruling it.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '冻结自动归籍',
            labelEn: 'Freeze automatic origin assignment',
            outcomeZh: '批处理停止覆盖旧字段。',
            outcomeEn: 'The batch process stops overwriting old fields.',
            resultZh: '有害归类在下一颗星受影响前结束。',
            resultEn: 'Harmful classification ends before another star is affected.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '设置故乡未决',
            labelEn: 'Mark home as unresolved',
            outcomeZh: '目录接受长期开放的问号。',
            outcomeEn: 'The catalog accepts a lasting open question.',
            resultZh: '未知成为稳定状态，而非等待清除的错误。',
            resultEn: 'Unknown becomes a stable state rather than an error awaiting removal.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '一台旧扫描仪会给每颗路过的野星刻上永久识别纹。',
        introEn: 'An old scanner burns a permanent identifier into every passing wild star.',
        promptZh: '登记需要怎样摆脱不可逆标记？',
        promptEn: 'How should registration leave irreversible marking behind?',
        options: [option({
            labelZh: '改用远距光谱',
            labelEn: 'Use remote spectra',
            outcomeZh: '望远镜只收集星光，不接触星体。',
            outcomeEn: 'The telescope gathers light without touching the star.',
            resultZh: '可查性来自观测，不再来自刻痕。',
            resultEn: 'Discoverability comes from observation rather than scars.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '发行可撤销别名',
            labelEn: 'Issue revocable aliases',
            outcomeZh: '别名能被星图持有人随时更换。',
            outcomeEn: 'Aliases can be changed by map keepers at any time.',
            resultZh: '识别服务于连接，却不锁死未来身份。',
            resultEn: 'Identification supports connection without fixing future identity.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '保存扫描器校准史',
            labelEn: 'Preserve scanner calibration history',
            outcomeZh: '旧误差进入只读技术档案。',
            outcomeEn: 'Past errors enter a read-only technical archive.',
            resultZh: '调查保留证据，而设备不再继续运行。',
            resultEn: 'Investigation preserves evidence while the device stays retired.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拆除刻印臂',
            labelEn: 'Remove the engraving arm',
            outcomeZh: '机械臂与能源线路彻底分开。',
            outcomeEn: 'The arm is physically separated from its power line.',
            resultZh: '停用不再依赖一枚可能失效的软件开关。',
            resultEn: 'Retirement no longer depends on a software switch that might fail.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让野星拒绝登记',
            labelEn: 'Let wild stars decline registry',
            outcomeZh: '未登记者仍能安全通过航道。',
            outcomeEn: 'Unregistered stars still cross the route safely.',
            resultZh: '拒绝不会降低保护或导航资格。',
            resultEn: 'Declining changes neither protection nor navigation eligibility.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'comet-orchard': [scene({
        speaker: 'vale',
        introZh: '果园地下发现一批被前任园丁藏起的种子，每袋只写着一段天气。',
        introEn: 'The orchard cellar reveals seeds hidden by a former keeper, each bag labeled only with weather.',
        promptZh: '这些没有品种名的种子怎样重新进入花园？',
        promptEn: 'How should seeds without variety names return to the garden?',
        options: [option({
            labelZh: '先种小型试验床',
            labelEn: 'Begin with a small trial bed',
            outcomeZh: '五粒种子在隔离土壤中发芽。',
            outcomeEn: 'Five seeds sprout in isolated soil.',
            resultZh: '谨慎试种保护旧园，也没有浪费整袋可能性。',
            resultEn: 'A cautious trial protects the old orchard without wasting the whole possibility.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '按天气标签分组',
            labelEn: 'Group by weather notes',
            outcomeZh: '雾、霜与暖雨各有独立苗床。',
            outcomeEn: 'Fog, frost, and warm rain receive separate beds.',
            resultZh: '不完整描述仍能支持可逆的第一步。',
            resultEn: 'Incomplete descriptions can still support a reversible first step.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '邀请社区认领照料',
            labelEn: 'Invite community stewardship',
            outcomeZh: '照料者选择一床并共享观察日记。',
            outcomeEn: 'Stewards choose one bed and share observation journals.',
            resultZh: '未知种子成为共同学习，而非争夺稀有物。',
            resultEn: 'Unknown seeds become shared learning rather than scarce prizes.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '拒绝整袋混播',
            labelEn: 'Refuse a mass sowing',
            outcomeZh: '大型播种机保持封存。',
            outcomeEn: 'The mass planter remains sealed.',
            resultZh: '果园避免不可逆扩散，决定仍可稍后重审。',
            resultEn: 'The orchard avoids irreversible spread and keeps review possible.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留未种样本',
            labelEn: 'Keep an unsown reserve',
            outcomeZh: '每袋一半进入恒温种库。',
            outcomeEn: 'Half of each bag enters climate storage.',
            resultZh: '未来方法仍有原始材料可以验证。',
            resultEn: 'Future methods retain original material for verification.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'sora',
        introZh: '彗尾掠过时，果园的授粉灯会把夜行昆虫引离原来的花圃。',
        introEn: 'During comet passage, pollination lamps draw night insects away from their usual beds.',
        promptZh: '观测彗星和保护花圃怎样同时成立？',
        promptEn: 'How can comet observation and bed protection coexist?',
        options: [option({
            labelZh: '调暗靠近花圃的灯',
            labelEn: 'Dim lamps near flower beds',
            outcomeZh: '边缘照明降到不干扰昆虫的亮度。',
            outcomeEn: 'Perimeter light falls below insect-disrupting levels.',
            resultZh: '庆典保留轮廓，而授粉路线得到优先保护。',
            resultEn: 'The celebration keeps its outline while pollination routes take priority.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '改用红色地灯',
            labelEn: 'Switch to red ground lights',
            outcomeZh: '访客沿低位光带移动。',
            outcomeEn: 'Visitors move along low red guides.',
            resultZh: '导航与夜间生态不再争夺同一束光。',
            resultEn: 'Navigation and nocturnal ecology stop competing for one beam.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '测量昆虫回程',
            labelEn: 'Measure insect return paths',
            outcomeZh: '无标记计数器记录恢复时长。',
            outcomeEn: 'Non-tagging counters record recovery time.',
            resultZh: '下次布灯拥有真实而最小化的数据依据。',
            resultEn: 'The next lighting plan gains real, minimal evidence.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '关闭中央探照灯',
            labelEn: 'Shut down the central searchlight',
            outcomeZh: '最强光束在彗星抵达前熄灭。',
            outcomeEn: 'The strongest beam goes dark before the comet arrives.',
            resultZh: '果断停机防止又一夜的迁徙混乱。',
            resultEn: 'A decisive shutdown prevents another night of disrupted movement.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '开放无灯观测坡',
            labelEn: 'Open a lightless viewing hill',
            outcomeZh: '愿意适应黑暗的人获得安静入口。',
            outcomeEn: 'Visitors willing to adapt to darkness gain a quiet entrance.',
            resultZh: '不点亮也成为完整的共同观测方式。',
            resultEn: 'Going unlit becomes a complete way to watch together.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'shadow-testimony': [scene({
        speaker: 'chime',
        introZh: '证词庭收到一段只有影子、没有声音的排练记录。',
        introEn: 'The testimony court receives a rehearsal record containing shadows but no sound.',
        promptZh: '这份局部记录能证明什么？',
        promptEn: 'What can this partial record establish?',
        options: [option({
            labelZh: '只确认人在场',
            labelEn: 'Confirm presence only',
            outcomeZh: '记录注明无法判断说过什么。',
            outcomeEn: 'The record states that speech cannot be determined.',
            resultZh: '有限证据不再被扩写成完整叙述。',
            resultEn: 'Limited evidence is no longer expanded into a complete story.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '邀请当事人补充',
            labelEn: 'Invite optional context',
            outcomeZh: '补充入口允许拒绝且不设期限。',
            outcomeEn: 'The context request permits refusal and has no deadline.',
            resultZh: '解释权回到当事人手中，而沉默保持中性。',
            resultEn: 'Interpretive control returns to the person while silence stays neutral.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比对场地光源',
            labelEn: 'Compare venue lighting',
            outcomeZh: '两盏故障灯解释了影子断裂。',
            outcomeEn: 'Two failed lamps explain broken silhouettes.',
            resultZh: '技术缺口进入证据说明，不被归咎于证人。',
            resultEn: 'The technical gap enters the evidence note instead of blaming a witness.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '驳回声音推断',
            labelEn: 'Reject inferred dialogue',
            outcomeZh: '书记员删除自动生成的台词。',
            outcomeEn: 'The clerk removes machine-generated dialogue.',
            resultZh: '不存在的话不再进入裁决。',
            resultEn: 'Words that never existed leave the ruling.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留无声版本',
            labelEn: 'Preserve the silent version',
            outcomeZh: '原片以缺失声明进入档案。',
            outcomeEn: 'The original enters the archive with a missing-data statement.',
            resultZh: '未来研究能看到边界，而不是伪造的完整性。',
            resultEn: 'Future readers see the boundary rather than fabricated completeness.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'mika',
        introZh: '一名证人的影子比本人早半秒举手，自动系统因此标记欺骗。',
        introEn: 'A witness shadow raises its hand half a second early, so automation flags deception.',
        promptZh: '怎样审理这段时间错位？',
        promptEn: 'How should this timing mismatch be examined?',
        options: [option({
            labelZh: '校正投影延迟',
            labelEn: 'Calibrate projection delay',
            outcomeZh: '同步测试发现镜面缓存反向偏移。',
            outcomeEn: 'A synchronization test finds reverse mirror buffering.',
            resultZh: '技术故障替代了对人格的草率判断。',
            resultEn: 'A technical fault replaces a careless character judgment.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '暂停所有欺骗标签',
            labelEn: 'Suspend every deception label',
            outcomeZh: '同型号设备的旧结论进入复核队列。',
            outcomeEn: 'Prior conclusions from the same device enter review.',
            resultZh: '修复扩展到所有受影响者，而非只救一个案例。',
            resultEn: 'Repair reaches everyone affected rather than one case.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '公开误差区间',
            labelEn: 'Publish the error interval',
            outcomeZh: '时间轴显示正负一秒的不确定带。',
            outcomeEn: 'The timeline shows a one-second uncertainty band.',
            resultZh: '观看者能区分测量精度与真实动作。',
            resultEn: 'Viewers can distinguish measurement precision from actual movement.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤销自动裁决权',
            labelEn: 'Remove automated judgment',
            outcomeZh: '设备只能提示检查，不能下结论。',
            outcomeEn: 'The device may request review but cannot conclude.',
            resultZh: '高影响决定重新需要人类负责。',
            resultEn: 'High-impact decisions again require accountable people.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '向证人发送更正',
            labelEn: 'Send the witness a correction',
            outcomeZh: '通知承认错误且无需回应。',
            outcomeEn: 'The notice admits the error and requires no reply.',
            resultZh: '修复不把额外劳动推回受害者。',
            resultEn: 'Repair does not shift additional labor onto the harmed person.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'paper-moon-workshop': [scene({
        speaker: 'aya',
        introZh: '纸月工坊借来的银纸带着另一场演出的折痕，师傅想把它全部熨平。',
        introEn: 'Silver paper borrowed by the moon workshop carries folds from another performance, and the master wants them ironed flat.',
        promptZh: '旧折痕应该怎样参与新作品？',
        promptEn: 'How should old folds participate in the new work?',
        options: [option({
            labelZh: '围绕折痕裁片',
            labelEn: 'Cut around the folds',
            outcomeZh: '新月把旧线条变成山脊。',
            outcomeEn: 'The new moon turns old lines into ridges.',
            resultZh: '材料历史进入造型，而非被伪装成全新。',
            resultEn: 'Material history enters the form instead of being disguised as new.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保留来源标签',
            labelEn: 'Keep provenance labels',
            outcomeZh: '背面注明上一场演出的剧名。',
            outcomeEn: 'The reverse names the prior production.',
            resultZh: '借用关系继续可追溯，也不会抢走新作者署名。',
            resultEn: 'Borrowing remains traceable without taking new authorship credit.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '邀请前剧组共创',
            labelEn: 'Invite the former troupe',
            outcomeZh: '两组各设计半轮月纹。',
            outcomeEn: 'Each troupe designs half the lunar pattern.',
            resultZh: '再利用成为合作，而非无声占用。',
            resultEn: 'Reuse becomes collaboration rather than silent appropriation.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '拒绝高温熨压',
            labelEn: 'Refuse high-heat pressing',
            outcomeZh: '熨斗换成低压定型框。',
            outcomeEn: 'The iron gives way to a low-pressure frame.',
            resultZh: '不可逆抹平在开始前被阻止。',
            resultEn: 'Irreversible flattening is stopped before it begins.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '留一块原样展片',
            labelEn: 'Keep one untouched panel',
            outcomeZh: '原始折痕与成品并列展示。',
            outcomeEn: 'Original folds appear beside the finished work.',
            resultZh: '变化的起点不会从展示中消失。',
            resultEn: 'The starting point of change does not disappear from display.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'ren',
        introZh: '工坊的月光颜料只在观众鼓掌时发亮，安静观看者看不到完整图案。',
        introEn: 'The workshop pigment glows only during applause, hiding the full pattern from quiet viewers.',
        promptZh: '月光怎样不再要求一种反应？',
        promptEn: 'How should moonlight stop requiring one response?',
        options: [option({
            labelZh: '加入稳定微光层',
            labelEn: 'Add a steady glow layer',
            outcomeZh: '图案在安静中也保持可见。',
            outcomeEn: 'The pattern remains visible in silence.',
            resultZh: '基本体验不再以公开反馈为门票。',
            resultEn: 'The basic experience no longer charges public feedback as admission.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供个人触发灯',
            labelEn: 'Offer private activation lights',
            outcomeZh: '座位按钮不会记录点击者。',
            outcomeEn: 'Seat controls do not record who presses them.',
            resultZh: '参与方式变多，却不制造行为画像。',
            resultEn: 'Participation expands without creating behavioral profiles.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '研究声敏配方',
            labelEn: 'Study the sound-reactive formula',
            outcomeZh: '档案标出亮度与分贝的关系。',
            outcomeEn: 'The archive maps brightness to decibels.',
            resultZh: '效果边界变得清楚，不再冒充普遍可见。',
            resultEn: 'The effect boundary becomes clear instead of posing as universally visible.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用掌声计分',
            labelEn: 'Disable applause scoring',
            outcomeZh: '墙上的音量排行被撤下。',
            outcomeEn: 'The volume leaderboard leaves the wall.',
            resultZh: '观众反应不再生成地位。',
            resultEn: 'Audience response no longer creates status.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '安排无声场次',
            labelEn: 'Schedule a silent showing',
            outcomeZh: '整场演出不期待任何声音。',
            outcomeEn: 'An entire showing expects no sound.',
            resultZh: '安静成为被设计支持的完整选择。',
            resultEn: 'Quiet becomes a fully supported design choice.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'uncharted-zoo': [scene({
        speaker: 'niko',
        introZh: '未绘动物园里，一只迁徙兽每晚都会推翻工作人员画好的边界牌。',
        introEn: 'In the uncharted zoo, a migrating creature topples every boundary sign drawn by staff.',
        promptZh: '地图怎样跟随动物而不是束缚它？',
        promptEn: 'How should the map follow the creature rather than constrain it?',
        options: [option({
            labelZh: '改画移动范围',
            labelEn: 'Map a moving range',
            outcomeZh: '边界用季节色带而非围栏表示。',
            outcomeEn: 'Seasonal bands replace fence lines.',
            resultZh: '地图承认运动，而不把变化写成逃逸。',
            resultEn: 'The map recognizes movement without labeling change as escape.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让巡护员记录足迹',
            labelEn: 'Let stewards record tracks',
            outcomeZh: '观察只留下路径，不追踪个体身份。',
            outcomeEn: 'Observation keeps routes without tracking individual identity.',
            resultZh: '生态知识增长，同时避免永久标记。',
            resultEn: 'Ecological knowledge grows without permanent tagging.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '连接相邻栖息地',
            labelEn: 'Connect neighboring habitats',
            outcomeZh: '两道旧门变成开放廊道。',
            outcomeEn: 'Two old gates become open corridors.',
            resultZh: '照护合作跨过原来的管理边界。',
            resultEn: 'Care collaboration crosses former administrative borders.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '拆除诱捕式路标',
            labelEn: 'Remove trapping signs',
            outcomeZh: '带食物的定位桩被全部收回。',
            outcomeEn: 'Food-baited location posts are removed.',
            resultZh: '制图不再通过操纵动物来获得整齐线条。',
            resultEn: 'Mapping stops manipulating animals to obtain tidy lines.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留空白迁徙区',
            labelEn: 'Keep a blank migration zone',
            outcomeZh: '未知路径在图上获得保护色。',
            outcomeEn: 'Unknown paths receive protected blank space.',
            resultZh: '没有数据的区域不会被默认开放开发。',
            resultEn: 'Areas without data are not assumed open for development.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '游客投票想给一只从未现身的夜兽起一个最受欢迎的名字。',
        introEn: 'Visitors vote to give an unseen nocturnal creature the most popular name.',
        promptZh: '命名活动怎样避免替未知生命定型？',
        promptEn: 'How should naming avoid fixing an unknown life into a public choice?',
        options: [option({
            labelZh: '把投票改成观察提问',
            labelEn: 'Turn voting into observation questions',
            outcomeZh: '票箱收集想了解的事项。',
            outcomeEn: 'The box collects questions people hope to explore.',
            resultZh: '好奇心留下，却不转化成占有式命名。',
            resultEn: 'Curiosity remains without becoming possessive naming.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '使用多个临时称呼',
            labelEn: 'Use several temporary references',
            outcomeZh: '巡护日志按场景选用不同代号。',
            outcomeEn: 'Field logs use different references by context.',
            resultZh: '语言保持可变，未知动物不被一个标签吞没。',
            resultEn: 'Language stays changeable and one label cannot consume the animal.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '查明是否同一只',
            labelEn: 'Determine whether sightings match',
            outcomeZh: '足迹尺寸显示可能有三个个体。',
            outcomeEn: 'Track sizes suggest three individuals.',
            resultZh: '调查阻止了把不同生命合并成一个明星。',
            resultEn: 'Investigation prevents several lives from becoming one mascot.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '取消人气榜',
            labelEn: 'Cancel the popularity board',
            outcomeZh: '得票数字不会进入动物档案。',
            outcomeEn: 'Vote totals never enter animal records.',
            resultZh: '关注度不再决定保护优先级。',
            resultEn: 'Attention no longer decides protection priority.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让名字保持空白',
            labelEn: 'Leave the name blank',
            outcomeZh: '夜间观察牌只描述环境条件。',
            outcomeEn: 'Night signs describe environmental conditions only.',
            resultZh: '没有名字也能获得完整照护。',
            resultEn: 'A nameless life still receives complete care.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'constellation-surgery': [scene({
        speaker: 'mika',
        introZh: '星座手术台发现两条导航线其实只是投影重叠，并未真正相连。',
        introEn: 'The constellation theatre discovers that two navigation lines only overlap in projection and never truly meet.',
        promptZh: '这条假连接应该怎样修正？',
        promptEn: 'How should this false connection be repaired?',
        options: [option({
            labelZh: '标注视角重叠',
            labelEn: 'Mark the viewing overlap',
            outcomeZh: '图层注明观察位置造成的交叉。',
            outcomeEn: 'The layer names the viewpoint that creates the crossing.',
            resultZh: '视觉接近不再冒充结构关系。',
            resultEn: 'Visual proximity no longer impersonates structural relation.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保留两条独立路线',
            labelEn: 'Keep both routes independent',
            outcomeZh: '导航员可分别开关线路。',
            outcomeEn: 'Navigators can toggle each line separately.',
            resultZh: '分离不会抹去任何一方的用途。',
            resultEn: 'Separation erases neither route’s use.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '测量真实距离',
            labelEn: 'Measure actual distance',
            outcomeZh: '深度读数揭示数百光年间隔。',
            outcomeEn: 'Depth readings reveal hundreds of light-years between them.',
            resultZh: '修订依据来自可验证空间，而非平面印象。',
            resultEn: 'Revision follows verifiable space rather than a flat impression.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停止沿假线航行',
            labelEn: 'Stop travel along the false line',
            outcomeZh: '自动导航立刻移除危险捷径。',
            outcomeEn: 'Autopilot removes the dangerous shortcut immediately.',
            resultZh: '行动先保护旅者，研究可以随后继续。',
            resultEn: 'Action protects travelers first while study continues later.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保存旧图作错误案例',
            labelEn: 'Archive the old map as a case',
            outcomeZh: '旧版加上醒目的失效水印。',
            outcomeEn: 'The old version gains a clear invalid watermark.',
            resultZh: '历史留存不会继续误导当前航行。',
            resultEn: 'Preserving history cannot mislead current travel.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'ori',
        introZh: '修复师想移动一颗微弱星来让整幅星座看起来更对称。',
        introEn: 'A repairer wants to move a faint star so the constellation looks more symmetrical.',
        promptZh: '美观要求应该受到什么边界？',
        promptEn: 'What boundary should constrain the aesthetic request?',
        options: [option({
            labelZh: '只调整图纸布局',
            labelEn: 'Adjust the drawing only',
            outcomeZh: '图例重排而星体坐标保持原样。',
            outcomeEn: 'The legend shifts while stellar coordinates remain unchanged.',
            resultZh: '展示可以优化，却不能改写被展示者。',
            resultEn: 'Presentation may improve without rewriting what it presents.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '询问导航使用者',
            labelEn: 'Consult route users',
            outcomeZh: '三条实际航线说明微星位置有价值。',
            outcomeEn: 'Three working routes show the faint star’s location matters.',
            resultZh: '功能经验进入决定，而非只听视觉评审。',
            resultEn: 'Operational experience enters the decision instead of visual review alone.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '模拟移动后果',
            labelEn: 'Simulate the relocation',
            outcomeZh: '模型显示两座灯塔将失去校准点。',
            outcomeEn: 'The model shows two beacons losing calibration.',
            resultZh: '可逆模拟揭示了不可逆动作的代价。',
            resultEn: 'A reversible simulation reveals the cost of irreversible action.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝牵引星体',
            labelEn: 'Refuse to tow the star',
            outcomeZh: '牵引索保持未部署。',
            outcomeEn: 'The towing cable remains undeployed.',
            resultZh: '一项明确拒绝保护微弱存在不被装饰需求搬动。',
            resultEn: 'A clear refusal protects a faint presence from decorative relocation.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供非对称视图',
            labelEn: 'Offer an asymmetric view',
            outcomeZh: '新模式突出真实间距。',
            outcomeEn: 'A new mode emphasizes actual spacing.',
            resultZh: '不规则不再被界面当作缺陷。',
            resultEn: 'Irregularity is no longer treated as a defect by the interface.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'rumor-telescope': [scene({
        speaker: 'ren',
        introZh: '传闻望远镜把一句未经确认的“可能闪烁”复制到每个公共星图。',
        introEn: 'The rumor telescope copies one unconfirmed possible flicker into every public chart.',
        promptZh: '怎样收回扩散中的不确定消息？',
        promptEn: 'How should the spreading uncertainty be recalled?',
        options: [option({
            labelZh: '附上未确认状态',
            labelEn: 'Attach an unconfirmed state',
            outcomeZh: '所有副本同步显示来源与置信度。',
            outcomeEn: 'Every copy shows provenance and confidence.',
            resultZh: '不确定性跟随消息，而不是在转发中消失。',
            resultEn: 'Uncertainty travels with the message instead of vanishing in forwarding.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '通知下游制图者',
            labelEn: 'Notify downstream cartographers',
            outcomeZh: '每个订阅者收到无需回应的更正。',
            outcomeEn: 'Each subscriber receives a correction requiring no response.',
            resultZh: '修复沿原传播路径抵达受影响处。',
            resultEn: 'Repair follows the original distribution path to affected places.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '重做观测',
            labelEn: 'Repeat the observation',
            outcomeZh: '三台独立设备没有发现闪烁。',
            outcomeEn: 'Three independent instruments find no flicker.',
            resultZh: '新证据更新结论，却保留最初误报记录。',
            resultEn: 'New evidence updates the conclusion while retaining the first false report.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂停自动转发',
            labelEn: 'Pause automatic syndication',
            outcomeZh: '望远镜不能继续推送未经审核条目。',
            outcomeEn: 'The telescope can no longer push unreviewed entries.',
            resultZh: '传播速度不再压过验证责任。',
            resultEn: 'Distribution speed no longer outruns verification responsibility.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '公开更正时间线',
            labelEn: 'Publish a correction timeline',
            outcomeZh: '读者能看到传闻怎样被发现与撤回。',
            outcomeEn: 'Readers can see how the rumor arose and was withdrawn.',
            resultZh: '透明更正不把错误偷偷藏进版本历史。',
            resultEn: 'Transparent correction does not hide error inside version history.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'aya',
        introZh: '望远镜的热度镜片会自动追踪被谈论最多的星，冷门区域逐渐没有观测时间。',
        introEn: 'The telescope popularity lens follows the most discussed stars, leaving quiet regions without observation time.',
        promptZh: '观测资源怎样脱离热度循环？',
        promptEn: 'How should observation resources leave the popularity loop?',
        options: [option({
            labelZh: '预留安静天空时段',
            labelEn: 'Reserve quiet-sky sessions',
            outcomeZh: '每周一晚只观测低讨论区域。',
            outcomeEn: 'One night each week observes low-discussion regions only.',
            resultZh: '不受关注不再等于不值得研究。',
            resultEn: 'Lack of attention no longer means lack of research value.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '轮换公共提案',
            labelEn: 'Rotate community proposals',
            outcomeZh: '不同小组轮流选择目标。',
            outcomeEn: 'Different groups take turns choosing targets.',
            resultZh: '选择权被分散，单一热度无法长期占据镜片。',
            resultEn: 'Choice is distributed so one popularity signal cannot hold the lens.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较观测缺口',
            labelEn: 'Map observation gaps',
            outcomeZh: '空白区域按缺失时长着色。',
            outcomeEn: 'Blank regions are shaded by time without observations.',
            resultZh: '资源偏差变得可见且能被后续计划纠正。',
            resultEn: 'Resource bias becomes visible and correctable in later plans.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拆除热度自动转向',
            labelEn: 'Disable popularity steering',
            outcomeZh: '镜架只接受已排期目标。',
            outcomeEn: 'The mount accepts scheduled targets only.',
            resultZh: '算法不再在无人负责时改写公共资源。',
            resultEn: 'An algorithm no longer redirects public resources without accountability.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许私人安静清单',
            labelEn: 'Allow private quiet lists',
            outcomeZh: '观察者可收藏目标而不公开计数。',
            outcomeEn: 'Observers may save targets without public counts.',
            resultZh: '兴趣可以存在而不被变成竞争信号。',
            resultEn: 'Interest can exist without becoming a competitive signal.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'gravity-library': [scene({
        speaker: 'lumen',
        introZh: '重力图书馆把厚重书籍放在最高层，声称重量代表重要性。',
        introEn: 'The gravity library shelves its heaviest books highest, claiming weight represents importance.',
        promptZh: '馆藏怎样摆脱物理重量的等级？',
        promptEn: 'How should the collection escape a hierarchy of physical weight?',
        options: [option({
            labelZh: '按取用安全重排',
            labelEn: 'Reshelve for safe access',
            outcomeZh: '重册移到腰高位置并配推车。',
            outcomeEn: 'Heavy volumes move to waist height with carts.',
            resultZh: '摆放首先回应身体安全，而非象征地位。',
            resultEn: 'Placement answers bodily safety before symbolic rank.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供多种索引',
            labelEn: 'Offer several indexes',
            outcomeZh: '主题、年代与语言各有入口。',
            outcomeEn: 'Topic, era, and language receive separate entrances.',
            resultZh: '读者不必接受一条重要性顺序。',
            resultEn: 'Readers need not accept one order of importance.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审计借阅阻力',
            labelEn: 'Audit borrowing friction',
            outcomeZh: '数据发现高层重册几乎无人能取。',
            outcomeEn: 'Data shows high heavy volumes are nearly unreachable.',
            resultZh: '可用性证据推翻了装饰性的等级设计。',
            resultEn: 'Usability evidence overturns the decorative hierarchy.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤下重量徽章',
            labelEn: 'Remove weight badges',
            outcomeZh: '封面不再显示金色公斤数。',
            outcomeEn: 'Covers no longer display golden kilograms.',
            resultZh: '物理特征停止生成文化价值判断。',
            resultEn: 'A physical trait stops creating cultural value judgments.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留读者自建书架',
            labelEn: 'Keep reader-made shelves',
            outcomeZh: '个人排序不影响公共馆藏。',
            outcomeEn: 'Personal ordering does not alter the public collection.',
            resultZh: '偏好获得空间，却不变成所有人的规则。',
            resultEn: 'Preference gains space without becoming everyone’s rule.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'sora',
        introZh: '一卷失重手稿会在读者松手时漂走，系统因此禁止任何人翻阅。',
        introEn: 'A weightless manuscript drifts when released, so the system forbids all reading.',
        promptZh: '怎样在保护与访问之间找到可逆方案？',
        promptEn: 'How should a reversible balance between care and access be found?',
        options: [option({
            labelZh: '安装透明阅读罩',
            labelEn: 'Install a clear reading hood',
            outcomeZh: '柔和气流把纸页留在桌面。',
            outcomeEn: 'A gentle airflow keeps pages above the table.',
            resultZh: '保护条件支持阅读，而非以封禁替代设计。',
            resultEn: 'Protection supports reading instead of replacing design with prohibition.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '制作高精扫描本',
            labelEn: 'Create a detailed scan',
            outcomeZh: '远端读者能看见纤维与批注。',
            outcomeEn: 'Remote readers can inspect fibers and annotations.',
            resultZh: '副本扩大访问，同时诚实标注不是原件。',
            resultEn: 'A copy expands access while honestly identifying itself as a copy.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '测试不同气压',
            labelEn: 'Test pressure settings',
            outcomeZh: '最低稳定值进入设备配置。',
            outcomeEn: 'The lowest stable value enters the device settings.',
            resultZh: '实验只改变可恢复参数，不碰手稿结构。',
            resultEn: 'The experiment changes recoverable settings rather than the manuscript.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝胶粘固定',
            labelEn: 'Reject adhesive mounting',
            outcomeZh: '永久胶水从修复单删除。',
            outcomeEn: 'Permanent glue leaves the conservation order.',
            resultZh: '便利不会以不可逆损伤换取。',
            resultEn: 'Convenience is not purchased with irreversible harm.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '安排预约阅览',
            labelEn: 'Offer reserved reading sessions',
            outcomeZh: '馆员与读者共同确认操作边界。',
            outcomeEn: 'A librarian and reader confirm handling boundaries together.',
            resultZh: '有限资源通过合作开放，而非按地位分配。',
            resultEn: 'A limited resource opens through cooperation rather than status.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'aurora-bridge': [scene({
        speaker: 'sora',
        introZh: '极光桥只在两岸同时提交相同目的地时出现。',
        introEn: 'The aurora bridge appears only when both shores submit the same destination.',
        promptZh: '意见不一致的人怎样仍能相遇？',
        promptEn: 'How can people with different destinations still meet?',
        options: [option({
            labelZh: '设置中途会合台',
            labelEn: 'Create a midpoint platform',
            outcomeZh: '桥先连接一处不要求终点的圆台。',
            outcomeEn: 'The bridge first connects a circle requiring no shared endpoint.',
            resultZh: '相遇不再以放弃各自行程为条件。',
            resultEn: 'Meeting no longer requires abandoning separate journeys.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许分叉桥面',
            labelEn: 'Allow branching spans',
            outcomeZh: '共同路段之后出现两个出口。',
            outcomeEn: 'Two exits follow a shared segment.',
            resultZh: '同行可以暂时发生而无需永久一致。',
            resultEn: 'Travel together can be temporary without permanent agreement.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '研究同步失败',
            labelEn: 'Study synchronization failure',
            outcomeZh: '记录显示目的地比较忽略了别名。',
            outcomeEn: 'Logs show destination comparison ignored aliases.',
            resultZh: '技术误差与真实分歧得到分别处理。',
            resultEn: 'Technical mismatch and genuine disagreement receive separate treatment.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '关闭强制匹配门',
            labelEn: 'Disable the forced-match gate',
            outcomeZh: '岸边不再显示拒绝通行红灯。',
            outcomeEn: 'The shores no longer show refusal lights.',
            resultZh: '不一致停止被系统惩罚。',
            resultEn: 'Difference stops being punished by the system.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留独行光路',
            labelEn: 'Keep solo light paths',
            outcomeZh: '每岸都能独立到达安全站。',
            outcomeEn: 'Each shore can reach a safe station independently.',
            resultZh: '没有搭档也不失去基本通行。',
            resultEn: 'Lacking a partner no longer removes basic passage.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'niko',
        introZh: '桥面会根据行人的公开掌声数分配更宽的光带。',
        introEn: 'The bridge assigns wider light lanes according to each traveler’s public applause count.',
        promptZh: '桥宽应该依据什么重新分配？',
        promptEn: 'What should determine lane width instead?',
        options: [option({
            labelZh: '按实际通行需要',
            labelEn: 'Use actual access needs',
            outcomeZh: '轮椅与携物者可选择宽道。',
            outcomeEn: 'Wheelchairs and carried items can request wider lanes.',
            resultZh: '空间回应当下需求，而不是人气历史。',
            resultEn: 'Space responds to present need rather than popularity history.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让行人私下选择',
            labelEn: 'Let travelers choose privately',
            outcomeZh: '宽度设置不出现在公共档案。',
            outcomeEn: 'Width choices never appear in public records.',
            resultZh: '支持不要求披露原因或身份。',
            resultEn: 'Support asks for neither reasons nor identity disclosure.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '测量拥堵位置',
            labelEn: 'Measure congestion points',
            outcomeZh: '匿名流量图找出真正瓶颈。',
            outcomeEn: 'Anonymous flow maps reveal actual bottlenecks.',
            resultZh: '工程改进依赖路径证据而非社交分数。',
            resultEn: 'Engineering improvement follows path evidence instead of social score.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除掌声接口',
            labelEn: 'Delete the applause interface',
            outcomeZh: '桥控器不再读取任何热度字段。',
            outcomeEn: 'The bridge controller no longer reads popularity fields.',
            resultZh: '越界数据源从决策链被彻底切断。',
            resultEn: 'The intrusive data source is severed from the decision chain.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '维持最低宽度保障',
            labelEn: 'Guarantee a generous minimum',
            outcomeZh: '最窄光带也允许安全并行。',
            outcomeEn: 'Even the narrowest lane allows safe side-by-side travel.',
            resultZh: '基本安全不会因任何偏好或记录缩减。',
            resultEn: 'Basic safety cannot shrink because of preference or history.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'meteor-shelter': [scene({
        speaker: 'niko',
        introZh: '流星避难所的警报把每一粒尘埃都当作撞击，居民已经不再相信铃声。',
        introEn: 'The meteor shelter alarm treats every dust grain as an impact, and residents no longer trust the bell.',
        promptZh: '怎样恢复可信而不过度安静的预警？',
        promptEn: 'How should warning become trustworthy without becoming silent?',
        options: [option({
            labelZh: '分级显示置信度',
            labelEn: 'Show confidence levels',
            outcomeZh: '低风险尘埃只进入安静面板。',
            outcomeEn: 'Low-risk dust enters a quiet panel only.',
            resultZh: '警报强度终于对应可验证危险。',
            resultEn: 'Alarm intensity finally matches verifiable danger.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让居民选择通知渠道',
            labelEn: 'Let residents choose channels',
            outcomeZh: '灯光、震动与声音可独立开关。',
            outcomeEn: 'Light, vibration, and sound can be toggled separately.',
            resultZh: '安全信息适应不同感官边界。',
            resultEn: 'Safety information adapts to different sensory boundaries.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '回放误报样本',
            labelEn: 'Review false-alarm samples',
            outcomeZh: '模型找到尘埃反光的共同特征。',
            outcomeEn: 'The model finds the shared signature of reflective dust.',
            resultZh: '具体证据支持校准而非凭感觉降低灵敏度。',
            resultEn: 'Specific evidence supports calibration rather than intuitive desensitization.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用失控鸣笛器',
            labelEn: 'Retire the runaway siren',
            outcomeZh: '备用人工确认铃接管高风险通知。',
            outcomeEn: 'A manually confirmed backup bell handles high-risk notices.',
            resultZh: '有害噪声立即停止，保护能力没有消失。',
            resultEn: 'Harmful noise stops while protective capacity remains.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '公布警报后记',
            labelEn: 'Publish alert postmortems',
            outcomeZh: '每次铃声都说明依据与结果。',
            outcomeEn: 'Every alarm later states its basis and outcome.',
            resultZh: '信任通过可审计纠错逐步恢复。',
            resultEn: 'Trust returns through auditable correction.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'chime',
        introZh: '避难所只有一张中央星图，停电时最远房间无法知道安全出口。',
        introEn: 'The shelter has one central star map, leaving distant rooms without exits during outages.',
        promptZh: '导航怎样在断线时继续工作？',
        promptEn: 'How should navigation keep working during disconnection?',
        options: [option({
            labelZh: '分发夜光小图',
            labelEn: 'Distribute luminous pocket maps',
            outcomeZh: '每间房都获得无需供电的出口图。',
            outcomeEn: 'Every room receives an unpowered exit map.',
            resultZh: '基本逃生信息不再依赖中心在线。',
            resultEn: 'Basic escape information no longer depends on the center being online.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '建立邻室引导链',
            labelEn: 'Build neighbor guidance chains',
            outcomeZh: '相邻房间共同确认到达状态。',
            outcomeEn: 'Adjacent rooms confirm arrivals together.',
            resultZh: '本地合作填补中央广播失效。',
            resultEn: 'Local cooperation fills the gap left by central broadcast failure.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '测试最坏断电路线',
            labelEn: 'Test worst-case blackout routes',
            outcomeZh: '演练记录三处容易误转的门。',
            outcomeEn: 'The drill records three easily confused doors.',
            resultZh: '改造优先级来自实际行动证据。',
            resultEn: 'Renovation priority follows real movement evidence.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拆除单点门锁',
            labelEn: 'Remove single-point door locks',
            outcomeZh: '出口机械解锁不再等待服务器。',
            outcomeEn: 'Exit hardware no longer waits for a server.',
            resultZh: '断电无法把安全路径变成权限错误。',
            resultEn: 'An outage cannot turn safety paths into permission errors.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留无障碍替代线',
            labelEn: 'Keep accessible alternate routes',
            outcomeZh: '坡道与安静区在每张图上同等醒目。',
            outcomeEn: 'Ramps and quiet zones remain prominent on every map.',
            resultZh: '恢复能力覆盖不同身体与感官需求。',
            resultEn: 'Recovery capacity includes varied physical and sensory needs.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'star-name-commons': [scene({
        speaker: 'chime',
        introZh: '公共星名墙发现两个社区分别用了同一个名字，却指向不同星体。',
        introEn: 'The common star-name wall finds two communities using one name for different stars.',
        promptZh: '同名冲突怎样不变成争夺？',
        promptEn: 'How should shared naming avoid becoming a contest?',
        options: [option({
            labelZh: '保留带来源的同名',
            labelEn: 'Keep both names with provenance',
            outcomeZh: '每个名字旁标注使用社群与语境。',
            outcomeEn: 'Each name shows its community and context.',
            resultZh: '共同词语容纳差异，不需要判定唯一所有者。',
            resultEn: 'A shared word holds difference without selecting one owner.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许读者选择图层',
            labelEn: 'Let readers choose a layer',
            outcomeZh: '星图按文化图层切换指向。',
            outcomeEn: 'The chart switches references by cultural layer.',
            resultZh: '界面不会强迫所有人使用同一词典。',
            resultEn: 'The interface does not force one dictionary on everyone.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追溯各自历史',
            labelEn: 'Trace both histories',
            outcomeZh: '两条命名时间线互不覆盖。',
            outcomeEn: 'Two naming timelines remain distinct.',
            resultZh: '研究解释相遇，却不把更早使用变成产权。',
            resultEn: 'Research explains the meeting without turning earlier use into property.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤下胜负投票',
            labelEn: 'Remove the winner vote',
            outcomeZh: '墙面不再累计支持数字。',
            outcomeEn: 'The wall stops accumulating support totals.',
            resultZh: '名字的存续不由人气淘汰。',
            resultEn: 'A name’s survival is no longer decided by popularity.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '增加无名导航码',
            labelEn: 'Add a nameless navigation code',
            outcomeZh: '技术坐标与文化称呼并列。',
            outcomeEn: 'A technical coordinate sits beside cultural names.',
            resultZh: '安全定位无需压过任何社群语言。',
            resultEn: 'Safe location requires no cultural language to be displaced.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'vale',
        introZh: '一家公司提出赞助整面星名墙，条件是所有新名字先经过品牌审核。',
        introEn: 'A company offers to fund the star-name wall if every new name passes brand review.',
        promptZh: '公共命名怎样接受资源却保住自治？',
        promptEn: 'How should public naming receive resources without losing autonomy?',
        options: [option({
            labelZh: '只接受无条件维护款',
            labelEn: 'Accept maintenance funds without conditions',
            outcomeZh: '合同明确赞助者没有命名否决权。',
            outcomeEn: 'The contract gives the sponsor no naming veto.',
            resultZh: '资源支持基础设施，却不能购买文化控制。',
            resultEn: 'Resources support infrastructure without purchasing cultural control.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '建立多方维护基金',
            labelEn: 'Create a shared maintenance pool',
            outcomeZh: '许多小额来源替代单一依赖。',
            outcomeEn: 'Many small sources replace one dependency.',
            resultZh: '公共墙不再被一个资金出口绑住。',
            resultEn: 'The commons is no longer bound to one funding exit.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '公开合同差异',
            labelEn: 'Publish contract revisions',
            outcomeZh: '删除的审核条款保留在谈判档案。',
            outcomeEn: 'Removed review clauses remain in negotiation history.',
            resultZh: '访客能看见自治怎样被保护。',
            resultEn: 'Visitors can see how autonomy was protected.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝品牌前置审核',
            labelEn: 'Reject prior brand review',
            outcomeZh: '审核接口从发布流程彻底移除。',
            outcomeEn: 'The review endpoint leaves the publishing flow entirely.',
            resultZh: '明确边界阻止私人标准接管公共语言。',
            resultEn: 'A clear boundary prevents private standards from governing public language.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保障未赞助者同等入口',
            labelEn: 'Guarantee equal unsponsored access',
            outcomeZh: '提交表不询问资金关系。',
            outcomeEn: 'The submission form asks nothing about funding ties.',
            resultZh: '命名资格不随赞助身份改变。',
            resultEn: 'Naming eligibility does not change with sponsorship status.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'relay-four': [scene({
        speaker: 'vale',
        introZh: '第四座中继站收到前三季的记忆包，却缺少一份说明哪些内容可公开。',
        introEn: 'Relay Four receives memory packets from three earlier seasons but lacks a note describing what may be public.',
        promptZh: '怎样在转发前恢复同意边界？',
        promptEn: 'How should consent boundaries be restored before forwarding?',
        options: [option({
            labelZh: '默认全部保持私密',
            labelEn: 'Default every packet to private',
            outcomeZh: '没有明确范围的记忆停止外发。',
            outcomeEn: 'Memories without explicit scope stop at the relay.',
            resultZh: '缺失同意不会被解释成开放许可。',
            resultEn: 'Missing consent is not interpreted as open permission.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '逐包请求新选择',
            labelEn: 'Request fresh choices per packet',
            outcomeZh: '持有人可公开、只共享或继续封存。',
            outcomeEn: 'Holders may publish, share narrowly, or keep sealed.',
            resultZh: '不同记忆获得独立而可撤销的边界。',
            resultEn: 'Each memory gains an independent, revocable boundary.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '核对原始事件来源',
            labelEn: 'Verify original event provenance',
            outcomeZh: '哈希把每份包连回首次解锁。',
            outcomeEn: 'Hashes connect every packet to its first unlock.',
            resultZh: '来源验证阻止伪造记忆混入中继。',
            resultEn: 'Provenance verification keeps fabricated memories out of the relay.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '关闭批量公开开关',
            labelEn: 'Disable bulk publication',
            outcomeZh: '中继台移除一键发布全部功能。',
            outcomeEn: 'The relay removes its publish-all control.',
            resultZh: '一次误触不再能越过许多独立边界。',
            resultEn: 'One mistake can no longer cross many separate boundaries.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留本地可读副本',
            labelEn: 'Keep a locally readable copy',
            outcomeZh: '即使不转发，持有人仍能访问。',
            outcomeEn: 'Holders retain access even when nothing is forwarded.',
            resultZh: '拒绝传播不会导致失去已经获得的记忆。',
            resultEn: 'Declining distribution does not remove an earned memory.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '中继站的终局屏把最常出现的路线自动命名为“真正结局”。',
        introEn: 'The relay finale screen automatically calls the most frequent route the true ending.',
        promptZh: '五条路线怎样获得平等的结论位置？',
        promptEn: 'How should five routes receive equal places as conclusions?',
        options: [option({
            labelZh: '删除真正标签',
            labelEn: 'Remove the true label',
            outcomeZh: '屏幕改写为“本次抵达”。',
            outcomeEn: 'The screen now says this arrival.',
            resultZh: '一次统计不再决定故事正统。',
            resultEn: 'One statistic no longer decides narrative legitimacy.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '并列展示五扇门',
            labelEn: 'Display five doors equally',
            outcomeZh: '所有结局使用相同尺寸与光线。',
            outcomeEn: 'Every ending receives equal size and lighting.',
            resultZh: '视觉层级不再暗示哪条人生更完整。',
            resultEn: 'Visual hierarchy no longer implies which life is complete.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '解释路线计算',
            labelEn: 'Explain route calculation',
            outcomeZh: '读者可以查看哪些选择累积了方向。',
            outcomeEn: 'Readers can inspect which choices accumulated direction.',
            resultZh: '结论有可追溯原因，而非神秘评分。',
            resultEn: 'Conclusions gain traceable reasons instead of mysterious scoring.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用人气加权',
            labelEn: 'Disable popularity weighting',
            outcomeZh: '他人的通关数量退出个人路由。',
            outcomeEn: 'Other players’ completion totals leave personal routing.',
            resultZh: '公共趋势不能改写一人的持久后果。',
            resultEn: 'Public trends cannot rewrite one person’s lasting consequences.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许重访而不覆盖',
            labelEn: 'Allow revisit without overwrite',
            outcomeZh: '新旅程与旧结局并列存档。',
            outcomeEn: 'New journeys archive beside old conclusions.',
            resultZh: '探索别路不会抹去已经抵达的那一条。',
            resultEn: 'Exploring another route does not erase one already reached.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })]
};