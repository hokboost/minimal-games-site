'use strict';

const {
    compileAuthoredSeason
} = require('../../../domain/story/authored-season-compiler');
const deepening = require('./season-2-deepening');
const { b, episode, option: o, scene } = require('./authored-helpers');
const source = {
    slug: 'tides-of-return',
    version: 1,
    title: b('我们之间的信号：归潮', 'The Signal Between Us: Returning Tides'),
    episodes: [episode('harbor-after-rain', '雨后港灯', 'Harbor Lights After Rain', 'lumen', 'sora',
        [scene({
            speaker: 'lumen',
            introZh: '退潮后的铁梯露出三层旧呼号；流明只认得最下面那层。',
            introEn: 'The ebb reveals three layers of call signs on an iron ladder; Lumen knows only the lowest.',
            promptZh: '第一束港灯该照向哪一层记录？',
            promptEn: 'Which layer should the first harbor light illuminate?',
            options: [o({
                labelZh: '擦亮最早呼号',
                labelEn: 'Polish the earliest call sign',
                outcomeZh: '锈屑落下，最早的名字仍有清楚笔画。',
                outcomeEn: 'Rust falls away and the earliest name remains legible.',
                resultZh: '流明把来源年份写在灯罩内侧，旧记录不会冒充今天。',
                resultEn: 'Lumen dates the inside of the lamp so an old record cannot impersonate today.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '并列三层拓印',
                labelEn: 'Display all three rubbings',
                outcomeZh: '三张薄纸保留了互相覆盖的边缘。',
                outcomeEn: 'Three thin sheets preserve their overlapping edges.',
                resultZh: '港务簿增加并列页，矛盾不再被整理掉。',
                resultEn: 'The harbor ledger gains parallel pages instead of tidying contradiction away.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '先询问归航者',
                labelEn: 'Ask the returnees first',
                outcomeZh: '渡船乘客辨认出第二层是临时避风名。',
                outcomeEn: 'Ferry passengers identify the middle layer as a temporary storm name.',
                resultZh: '口述来源附在拓印旁，人的记忆与铁锈各自署名。',
                resultEn: 'Oral testimony sits beside the rubbing, with memory and rust separately attributed.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '封住危险踏板',
                labelEn: 'Close the unsafe rung',
                outcomeZh: '警示绳让调查停在承重完好的位置。',
                outcomeEn: 'A warning rope keeps the inspection on sound footing.',
                resultZh: '安全边界成为港口新旗标，谨慎没有被写成退缩。',
                resultEn: 'The safety boundary becomes a harbor flag; caution is not rewritten as retreat.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '留一盏无人认领灯',
                labelEn: 'Leave one lamp unclaimed',
                outcomeZh: '空灯位承认仍有一层呼号无人解释。',
                outcomeEn: 'An empty lamp admits that one call sign remains unexplained.',
                resultZh: '未知被正式登记，后来者可以回答而不必服从猜测。',
                resultEn: 'The unknown enters the record so a later answer need not obey a guess.',
                axis: 'curiosity',
                route: 'archive-route'
            })]
        }), scene({
            speaker: 'sora',
            introZh: '空良在湿地图背面发现一条只在纸张折起时连通的航线。',
            introEn: 'Sora finds a route on the wet chart that connects only when the paper is folded.',
            promptZh: '这张会改变海岸的图应怎样保存？',
            promptEn: 'How should a chart that changes the coast be kept?',
            options: [o({
                labelZh: '固定当前折痕',
                labelEn: 'Fix the present fold',
                outcomeZh: '透明夹板保存了今晚可用的航道。',
                outcomeEn: 'A clear board preserves the route usable tonight.',
                resultZh: '图册标明这是一次性视角，稳定没有取代其他可能。',
                resultEn: 'The atlas marks it as a one-time view, so stability does not erase alternatives.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '展开记录断线',
                labelEn: 'Unfold and record the break',
                outcomeZh: '航线断成两段，缺口的位置变得可测量。',
                outcomeEn: 'The route breaks in two and its gap becomes measurable.',
                resultZh: '流明把断线设为后续任务，而不是偷偷补画。',
                resultEn: 'Lumen makes the gap a future task instead of secretly drawing it closed.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '邀请两人各折一次',
                labelEn: 'Invite two independent folds',
                outcomeZh: '两种折法抵达不同安全湾。',
                outcomeEn: 'Two folds reach different safe coves.',
                resultZh: '地图保留双入口，归航不再只有正确姿势。',
                resultEn: 'The chart keeps both entrances; returning no longer has one correct posture.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '剪下可撤回副本',
                labelEn: 'Cut a reversible copy',
                outcomeZh: '副本承担试航，原图没有被迫冒险。',
                outcomeEn: 'The copy takes the trial voyage while the original is not forced to risk itself.',
                resultZh: '试航失败也不会损伤共同档案，这条原则被长期保存。',
                resultEn: 'A failed trial cannot damage the shared archive; that principle persists.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '把地图交给潮汐',
                labelEn: 'Let the tide hold the chart',
                outcomeZh: '防水匣随水位升降，路线每天重新显现。',
                outcomeEn: 'A waterproof case rises with the tide and reveals the route anew each day.',
                resultZh: '港灯开始记录变化节奏，而非占有唯一答案。',
                resultEn: 'The harbor light begins recording change rather than owning one answer.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], {
            type: 'checkpoint',
            text: b('港灯熄去强光，只留下足够找到退路的亮度。',
                'The harbor lamps dim to the brightness needed for finding a way back.'
                ),
            unlockType: 'achievement',
            unlockKey: 'tides.harbor-witness'
        }, {
            title: b('铁梯上的三层名字', 'Three Names on the Iron Ladder'),
            body: b('你们保存了来源、矛盾和未知；任何一层都没有吞掉另外两层。',
                'You preserved source, contradiction, and unknown; no layer consumed the other two.'
                )
        }, {
            text: b('守望者把备用灯放在岸上，没有把光束转成催促。',
                'The watcher leaves a spare lamp ashore without turning its beam into pressure.'
                ),
            title: b('岸上的备用灯', 'The Spare Lamp Ashore'),
            body: b('如果潮水太急，先停在有栏杆的台阶；这封信不会要求你继续。',
                'If the tide runs hard, stop at the railed step; this letter never asks you to continue.'
                )
        }), episode('ferry-of-echoes', '回声渡轮', 'Ferry of Echoes', 'sora', 'mika', [
        scene({
            speaker: 'sora',
            introZh: '无人渡轮靠岸时带回五句未说完的话，每句都缺少不同的结尾。',
            introEn: 'An empty ferry docks with five unfinished sentences, each missing a different ending.',
            promptZh: '船舱广播先播出哪种处理方式？',
            promptEn: 'Which handling should the cabin broadcast announce first?',
            options: [o({
                labelZh: '按原样播放停顿',
                labelEn: 'Broadcast the pauses intact',
                outcomeZh: '汽笛之间保留说话者停下的位置。',
                outcomeEn: 'The horns preserve where each speaker stopped.',
                resultZh: '乘客听见未完成本身也是信息，渡轮不再擅自收尾。',
                resultEn: 'Passengers hear that incompletion is information; the ferry stops finishing for others.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '征集多个虚构结尾',
                labelEn: 'Collect fictional endings',
                outcomeZh: '甲板贴出五组明确标注为想象的续句。',
                outcomeEn: 'The deck displays five continuations clearly labeled as imagined.',
                resultZh: '想象获得位置却没有冒充原话，档案新增来源标签。',
                resultEn: 'Imagination gains a place without impersonating the original; provenance labels persist.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '只回应求助语气',
                labelEn: 'Answer only the plea',
                outcomeZh: '一封简短回信确认有人听见，却不推断身份。',
                outcomeEn: 'A brief reply confirms someone heard without inferring identity.',
                resultZh: '空良把最低必要回应写进渡轮规则，关心不再要求揭秘。',
                resultEn: 'Sora writes minimum necessary response into ferry rules; care no longer demands disclosure.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '暂时封存全部录音',
                labelEn: 'Seal every recording for now',
                outcomeZh: '船舱恢复安静，封条写明重开条件。',
                outcomeEn: 'The cabin falls quiet and the seal names conditions for reopening.',
                resultZh: '暂停成为可审计选择，而不是把沉默当作遗失。',
                resultEn: 'Pause becomes an auditable choice rather than treating silence as loss.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '让每句选择自己的码头',
                labelEn: 'Give each sentence a dock',
                outcomeZh: '五盏小灯分别亮起，不再争夺同一结尾。',
                outcomeEn: 'Five small lamps glow separately instead of competing for one ending.',
                resultZh: '渡轮建立多港制度，彼此不同的等待期限都被承认。',
                resultEn: 'The ferry adopts multiple docks and recognizes different waiting horizons.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'mika',
            introZh: '米卡发现一张船票写着“返程”，背面却没有出发港。',
            introEn: 'Mika finds a ticket marked return with no departure port on its back.',
            promptZh: '没有起点的返程票该获得什么含义？',
            promptEn: 'What should a return ticket without an origin mean?',
            options: [o({
                labelZh: '登记为开放邀请',
                labelEn: 'Register an open invitation',
                outcomeZh: '票根进入不设期限的邀请册。',
                outcomeEn: 'The stub enters an invitation ledger without a deadline.',
                resultZh: '任何人都可忽略它，拒绝不会改变既有关系。',
                resultEn: 'Anyone may ignore it, and refusal changes no existing relationship.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '追查售票机日志',
                labelEn: 'Inspect the ticket machine log',
                outcomeZh: '墨带显示它由一次断电后的自检打印。',
                outcomeEn: 'The ribbon shows it was printed during a post-outage self-test.',
                resultZh: '错误来源被保留，神秘感不再掩盖可验证事实。',
                resultEn: 'The error source remains preserved; mystery no longer hides verifiable fact.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '写上当前港口',
                labelEn: 'Write the current harbor',
                outcomeZh: '票面终于有了此刻可以确认的位置。',
                outcomeEn: 'The ticket finally carries a location that can be confirmed now.',
                resultZh: '米卡把“从这里开始”记为共同选择，而不是追认过去。',
                resultEn: 'Mika records starting here as a shared choice, not a retroactive history.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '撕开作两张单程票',
                labelEn: 'Split it into two one-way tickets',
                outcomeZh: '两半各有独立退票线，不再互相扣留。',
                outcomeEn: 'Each half has its own cancellation line and cannot hold the other.',
                resultZh: '渡轮承认同行可以结束在不同码头，勇气不等于捆绑。',
                resultEn: 'The ferry accepts that companions may stop at different docks; courage is not binding.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '留白并放回座位',
                labelEn: 'Leave it blank on the seat',
                outcomeZh: '船票等待下一位乘客自行定义。',
                outcomeEn: 'The ticket waits for its next passenger to define it.',
                resultZh: '未知归属没有被管理员代填，空位成为长期边界。',
                resultEn: 'No administrator fills the unknown ownership; the blank becomes a lasting boundary.',
                axis: 'curiosity',
                route: 'archive-route'
            })]
        })
    ], {
        type: 'memory_unlock',
        text: b('渡轮把未完成的话和空白船票分柜保存，航线继续向盐页馆延伸。',
            'The ferry stores unfinished sentences apart from the blank ticket, then continues toward the salt-page library.'
            ),
        unlockType: 'collection',
        unlockKey: 'tides.ferry-ticket'
    }, {
        title: b('没有出发港的返程票', 'A Return Ticket Without an Origin'),
        body: b('它提醒你们：回应可以确认听见，仍不必替陌生声音补写身份。',
            'It reminds you that a reply may confirm hearing without inventing an identity for a strange voice.'
            )
    }), episode('salt-page-library', '盐页图书馆', 'The Salt-Page Library', 'mika', 'ori', [
        scene({
            speaker: 'mika',
            introZh: '盐晶在借阅卡上长成小山，遮住了最后归还日期。',
            introEn: 'Salt crystals form hills over a loan card and hide its due date.',
            promptZh: '馆员应怎样处理这本迟到与否都无法判断的书？',
            promptEn: 'How should the librarian handle a book whose lateness cannot be determined?',
            options: [o({
                labelZh: '免除无法证明的逾期',
                labelEn: 'Waive the unprovable delay',
                outcomeZh: '罚款栏被划去，原因写成证据不足。',
                outcomeEn: 'The fine is struck out with insufficient evidence as the reason.',
                resultZh: '图书馆确立疑义不惩罚规则，之后的读者也受保护。',
                resultEn: 'The library establishes no penalty under uncertainty, protecting later readers too.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '溶解一角读取日期',
                labelEn: 'Dissolve one corner for the date',
                outcomeZh: '淡水只触碰编号边缘，日期重新可见。',
                outcomeEn: 'Fresh water touches only the numbered edge and reveals the date.',
                resultZh: '最小侵入方法进入修复手册，其余盐晶保持原貌。',
                resultEn: 'The least-invasive method enters the repair manual; the remaining crystals stay intact.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '询问借阅者是否愿意说明',
                labelEn: 'Invite the borrower to explain',
                outcomeZh: '说明被明确标为自愿，沉默也能完成归还。',
                outcomeEn: 'The explanation is explicitly optional, and silence can still complete return.',
                resultZh: '米卡记录同意边界，馆员以后不得把解释当作通行证。',
                resultEn: 'Mika records the consent boundary; explanations can no longer become admission tickets.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '建立临时归还架',
                labelEn: 'Create a provisional return shelf',
                outcomeZh: '书先安全归位，争议没有阻塞其他借阅。',
                outcomeEn: 'The book returns safely while the dispute blocks no other loan.',
                resultZh: '临时状态获得清楚标签，暂停不再等于有罪。',
                resultEn: 'The provisional state gains a clear label; pause no longer implies guilt.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '保存盐山作时间证人',
                labelEn: 'Keep the salt hill as witness',
                outcomeZh: '晶体被测量并装入透气盒。',
                outcomeEn: 'The crystals are measured and placed in a breathing case.',
                resultZh: '环境证据加入目录，但馆员没有夸大它能证明的范围。',
                resultEn: 'Environmental evidence joins the catalog without claims beyond what it proves.',
                axis: 'curiosity',
                route: 'archive-route'
            })]
        }), scene({
            speaker: 'ori',
            introZh: '奥里找到两本内容相反却使用同一索书号的航海日记。',
            introEn: 'Ori finds two voyage journals with opposite accounts under one call number.',
            promptZh: '目录只能显示一行时，哪种设计最诚实？',
            promptEn: 'When the catalog has one line, which design is most honest?',
            options: [o({
                labelZh: '显示双标题入口',
                labelEn: 'Show a dual-title entry',
                outcomeZh: '一行拆成两个可独立打开的标签。',
                outcomeEn: 'The line becomes two labels that open independently.',
                resultZh: '读者从入口就看见分歧，系统不再暗选权威版本。',
                resultEn: 'Readers see disagreement at entry; the system stops silently choosing authority.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '按来源年份排序',
                labelEn: 'Order by source year',
                outcomeZh: '两本日志依写作时间排列而非真假排名。',
                outcomeEn: 'The journals sort by writing date rather than a truth ranking.',
                resultZh: '时间顺序保留在目录中，却明确不代表可信度。',
                resultEn: 'Chronology persists in the catalog with an explicit warning that it is not credibility.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '增加矛盾索引',
                labelEn: 'Add a contradiction index',
                outcomeZh: '共同索引指向逐项不一致的段落。',
                outcomeEn: 'A shared index points to passages that disagree item by item.',
                resultZh: '矛盾成为可研究对象，不再被当作系统错误删除。',
                resultEn: 'Contradiction becomes researchable instead of a system error to delete.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '请两位读者分别摘要',
                labelEn: 'Ask two readers for summaries',
                outcomeZh: '摘要署名并列，任何一份都不是官方结论。',
                outcomeEn: 'Signed summaries sit side by side and neither is official.',
                resultZh: '馆藏开始记录阅读视角，关系差异被安全保留。',
                resultEn: 'The collection begins recording reading perspectives and safely preserves difference.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '关闭借阅只开放阅览',
                labelEn: 'Pause loans but allow reading',
                outcomeZh: '原件留在桌面监督区，研究仍能继续。',
                outcomeEn: 'The originals remain in supervised reading while research continues.',
                resultZh: '保护措施有明确复核日，谨慎不会无限冻结内容。',
                resultEn: 'The safeguard receives a review date so caution cannot freeze content forever.',
                axis: 'courage',
                route: 'brave-route'
            })]
        })
    ], {
        type: 'game_launch',
        text: b('盐页馆把矛盾目录交给谜案拼图作为安全练习，不携带真实读者资料。',
            'The salt-page library offers its contradiction index to Mystery Board as a safe exercise without real patron data.'
            ),
        unlockType: 'game',
        unlockKey: 'mystery-board.salt-index'
    }, {
        title: b('并列索书号', 'The Parallel Call Number'),
        body: b('两份相反记录拥有同等可达入口；时间、来源和矛盾都各自可查。',
            'Opposing records have equally reachable entrances, while time, source, and contradiction remain separately searchable.'
            )
    }, {
        text: b('守望者只送来一个空书套，让你决定是否收纳任何内容。',
            'The watcher sends an empty book sleeve and leaves you to decide whether it should hold anything.'
            ),
        title: b('没有指定书名的护套', 'A Sleeve Without a Chosen Title'),
        body: b('它可以保护一本书，也可以保持空置；两种状态都不会影响后面的章节。',
            'It may protect a book or remain empty; neither state changes access to later chapters.'
            )
    }), episode('lighthouse-kitchen', '灯塔厨房', 'The Lighthouse Kitchen', 'ori', 'vale', [
        scene({
            speaker: 'ori',
            introZh: '旋转灯束每经过长桌，就照亮一只写着不同过敏提示的空碗。',
            introEn: 'Each sweep of the lighthouse beam reveals an empty bowl with a different allergy notice.',
            promptZh: '第一锅共享汤应遵循哪条规则？',
            promptEn: 'Which rule should govern the first shared soup?',
            options: [o({
                labelZh: '采用最严格共同配方',
                labelEn: 'Use the strictest shared recipe',
                outcomeZh: '锅里只留下所有人都确认安全的材料。',
                outcomeEn: 'Only ingredients confirmed safe for everyone enter the pot.',
                resultZh: '厨房把共同安全列为默认，丰富度不会高于明确边界。',
                resultEn: 'The kitchen makes shared safety the default; variety cannot outrank explicit boundaries.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '分成独立小锅',
                labelEn: 'Use separate small pots',
                outcomeZh: '五只锅各有颜色编码的勺子。',
                outcomeEn: 'Five pots receive color-coded ladles.',
                resultZh: '个别需要不再被迫向平均值靠拢，分锅地图长期保留。',
                resultEn: 'Individual needs no longer bend toward an average; the pot map persists.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '先端白水与空碗',
                labelEn: 'Begin with water and empty bowls',
                outcomeZh: '每个人自行决定是否加入下一步。',
                outcomeEn: 'Each person decides whether to join the next step.',
                resultZh: '参与顺序改为逐步同意，拒绝一道菜不等于离开餐桌。',
                resultEn: 'Participation becomes incremental consent; declining a dish does not mean leaving the table.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '公开全部配料来源',
                labelEn: 'Publish every ingredient source',
                outcomeZh: '标签写出批次、工具和交叉接触风险。',
                outcomeEn: 'Labels name batches, tools, and cross-contact risks.',
                resultZh: '可验证信息取代“相信厨师”，厨房档案获得追溯链。',
                resultEn: 'Verifiable information replaces trust me; the kitchen archive gains provenance.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '取消共享锅改做面包',
                labelEn: 'Cancel the soup and bake bread',
                outcomeZh: '长桌接受计划改变，没有人因准备落空被责怪。',
                outcomeEn: 'The table accepts a changed plan and blames no one for unused preparation.',
                resultZh: '灯塔把取消记为成功边界事件，而不是失败记录。',
                resultEn: 'The lighthouse records cancellation as a successful boundary event, not a failure.',
                axis: 'courage',
                route: 'brave-route'
            })]
        }), scene({
            speaker: 'vale',
            introZh: '维尔发现食谱要求“等所有人到齐”才能关火，可最后一席选择不来。',
            introEn: 'Vale finds the recipe says to turn off the heat only when everyone arrives, but the final guest opts out.',
            promptZh: '怎样修订这条会惩罚缺席者的指令？',
            promptEn: 'How should an instruction that punishes absence be revised?',
            options: [o({
                labelZh: '改成固定安全时间',
                labelEn: 'Use a fixed safe time',
                outcomeZh: '计时器根据锅温关火，与人数无关。',
                outcomeEn: 'A timer stops the heat by temperature, independent of attendance.',
                resultZh: '缺席不再承担厨房风险，规则从此依赖可测条件。',
                resultEn: 'Absence no longer carries kitchen risk; the rule now uses measurable conditions.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '允许在场者共同决定',
                labelEn: 'Let present guests decide',
                outcomeZh: '在场者投票后选择安全收尾。',
                outcomeEn: 'Present guests vote on a safe close.',
                resultZh: '决策记录注明参与范围，不把未到者写成默许。',
                resultEn: 'The decision records its participant scope and never writes absence as consent.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '保留一份可稍后领取',
                labelEn: 'Reserve a portion for later',
                outcomeZh: '密封碗写明保存期限与丢弃时间。',
                outcomeEn: 'A sealed bowl states its safe window and discard time.',
                resultZh: '等待获得边界，不会变成无限期的情感债务。',
                resultEn: 'Waiting gains limits and cannot become an indefinite emotional debt.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '删除“所有人”条款',
                labelEn: 'Remove the everyone clause',
                outcomeZh: '食谱改用任何愿意参与的人。',
                outcomeEn: 'The recipe now says anyone who chooses to participate.',
                resultZh: '语言修订进入公开版本记录，旧压力不会悄悄回来。',
                resultEn: 'The language revision enters version history so the old pressure cannot quietly return.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '今晚停止营业',
                labelEn: 'Close the kitchen tonight',
                outcomeZh: '炉火安全熄灭，空席仍保留未来邀请。',
                outcomeEn: 'The stove goes safely dark while the empty seat keeps a future invitation.',
                resultZh: '暂停没有降低关系值，维尔把这一点刻在门牌背面。',
                resultEn: 'The pause changes no relationship value; Vale engraves that fact behind the sign.',
                axis: 'courage',
                route: 'brave-route'
            })]
        })
    ], {
        type: 'checkpoint',
        text: b('灯塔厨房保存配料表与同意记录，然后把长桌恢复为空。',
            'The lighthouse kitchen saves ingredients and consent records, then clears the table.'
            ),
        unlockType: 'collection',
        unlockKey: 'tides.lighthouse-ladle'
    }, {
        title: b('不会等待缺席者的炉火', 'A Stove That Does Not Wait on Absence'),
        body: b('安全规则改由温度和时间决定；不参加的人不背负任何风险或关系惩罚。',
            'Safety now depends on temperature and time; nonparticipants carry neither risk nor relationship penalty.'
            )
    }), episode('anchor-garden', '锚链花园', 'The Anchor Garden', 'vale', 'chime', [scene({
        speaker: 'vale',
        introZh: '蓝花沿废弃锚链生长，最粗的一环正压住唯一排水沟。',
        introEn: 'Blue flowers grow along an abandoned anchor chain whose widest link blocks the only drain.',
        promptZh: '花园该先保护花、旧锚还是排水？',
        promptEn: 'Should the garden protect the flowers, old anchor, or drainage first?',
        options: [o({
            labelZh: '支起锚环疏通水道',
            labelEn: 'Brace the link and clear water',
            outcomeZh: '可拆支架抬起铁环，根须仍留在原土。',
            outcomeEn: 'A removable brace lifts the link while roots remain in their soil.',
            resultZh: '排水恢复且改动可逆，花园记录了支架复查日。',
            resultEn: 'Drainage returns through a reversible change with a dated brace review.',
            axis: 'trust',
            route: 'beacon-route'
        }), o({
            labelZh: '移植受压蓝花',
            labelEn: 'Transplant the pressed flowers',
            outcomeZh: '幼苗进入标有原坐标的浮土盆。',
            outcomeEn: 'Seedlings enter floating pots labeled with their original coordinates.',
            resultZh: '迁移保留出处和返回选择，不把救援变成占有。',
            resultEn: 'The move preserves origin and return choice, keeping rescue from becoming ownership.',
            axis: 'harmony',
            route: 'constellation-route'
        }), o({
            labelZh: '切开最危险链节',
            labelEn: 'Cut the dangerous link',
            outcomeZh: '锈蚀处被安全分离并封边。',
            outcomeEn: 'The corroded section is safely separated and sealed.',
            resultZh: '维尔把不可逆理由写入审计石，勇敢决定仍可被追问。',
            resultEn: 'Vale records the irreversible reason in an audit stone, leaving the brave decision open to question.',
            axis: 'courage',
            route: 'brave-route'
        }), o({
            labelZh: '测量一周再处理',
            labelEn: 'Measure for one week',
            outcomeZh: '水位尺收集了七次涨落而不干扰花根。',
            outcomeEn: 'A gauge collects seven rises and falls without disturbing roots.',
            resultZh: '观察期限明确，研究不会借谨慎无限拖延。',
            resultEn: 'The observation has a deadline, so research cannot use caution for endless delay.',
            axis: 'curiosity',
            route: 'archive-route'
        }), o({
            labelZh: '另挖溢流水道',
            labelEn: 'Dig a separate overflow',
            outcomeZh: '浅沟绕过锚链，将暴雨导向砂池。',
            outcomeEn: 'A shallow channel routes storms around the chain into a sand bed.',
            resultZh: '花、锚与排水不再被迫三选一，协作路线写入园图。',
            resultEn: 'Flowers, anchor, and drainage escape a forced choice; the cooperative route enters the map.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'chime',
        introZh: '绮音听见每朵花在风里发出不同音高，管理员想把它们调成整齐和弦。',
        introEn: 'Chime hears each flower produce a different pitch, while the keeper wants one tidy chord.',
        promptZh: '花园音乐应怎样向访客呈现？',
        promptEn: 'How should the garden music meet visitors?',
        options: [o({
            labelZh: '保留未经调音的全景',
            labelEn: 'Keep the untuned soundscape',
            outcomeZh: '录音标注风速与花位，不修正异音。',
            outcomeEn: 'The recording labels wind and flower positions without correcting dissonance.',
            resultZh: '原始声景进入档案，整齐不再冒充真实。',
            resultEn: 'The original soundscape enters the archive; neatness no longer impersonates truth.',
            axis: 'curiosity',
            route: 'archive-route'
        }), o({
            labelZh: '设置可选和声步道',
            labelEn: 'Offer an optional harmony path',
            outcomeZh: '只有踏上彩石的访客会听见配合声部。',
            outcomeEn: 'Only visitors choosing the colored path hear an added harmony.',
            resultZh: '默认声音保持自由，附加体验需要主动进入。',
            resultEn: 'The default sound remains free and the added experience requires opt-in.',
            axis: 'harmony',
            route: 'constellation-route'
        }), o({
            labelZh: '给安静访客无声地图',
            labelEn: 'Provide a silent map',
            outcomeZh: '触觉叶片标出花位，无需播放任何声音。',
            outcomeEn: 'Tactile leaves map flowers without playing sound.',
            resultZh: '可达性成为平行入口，不是音乐体验的次等版本。',
            resultEn: 'Accessibility becomes a parallel entrance rather than a lesser musical experience.',
            axis: 'trust',
            route: 'beacon-route'
        }), o({
            labelZh: '让风决定每日曲目',
            labelEn: 'Let wind choose the daily score',
            outcomeZh: '告示牌只记录天气，不预测主旋律。',
            outcomeEn: 'The sign records weather without promising a melody.',
            resultZh: '不确定性被诚实展示，访客不会收到虚假的演出承诺。',
            resultEn: 'Uncertainty is shown honestly; visitors receive no false performance promise.',
            axis: 'courage',
            route: 'brave-route'
        }), o({
            labelZh: '暂停录音听花园本身',
            labelEn: 'Pause recording and listen',
            outcomeZh: '设备灯熄灭，短暂现场不留下可回放副本。',
            outcomeEn: 'Equipment lights go dark and the moment leaves no replay copy.',
            resultZh: '不记录的权利写进花园章程，记忆不必全部被收藏。',
            resultEn: 'The right not to record enters the garden charter; not every memory must be collected.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    })], {
        type: 'memory_unlock',
        text: b('锚链花园在新水道旁立起一块可修改的声景地图。',
            'The anchor garden installs an editable soundscape map beside its new overflow.'
            ),
        unlockType: 'achievement',
        unlockKey: 'tides.garden-steward'
    }, {
        title: b('蓝花与排水沟的共同地图', 'The Shared Map of Blue Flowers and Drainage'),
        body: b('可逆支架、平行入口和不记录权让旧铁链不再决定所有后来者。',
            'Reversible braces, parallel entrances, and the right not to record keep old iron from deciding for everyone later.'
            )
    }, {
        text: b('守望者送来一包没有种植期限的种子，封口仍保持完整。',
            'The watcher sends seeds with no planting deadline and leaves the seal intact.'
            ),
        title: b('不催促发芽的纸袋', 'The Packet That Does Not Hurry Germination'),
        body: b('种子可以今天入土、明年入土，或一直留在袋中；收藏状态不会改变。',
            'The seeds may be planted today, next year, or never; their collection status will not change.'
            )
    }), episode('room-beneath-pier', '栈桥下的房间', 'The Room Beneath the Pier', 'chime',
        'courier', [scene({
            speaker: 'chime',
            introZh: '浪头每撞一次桥柱，房间就换上一件不同年份的家具。',
            introEn: 'Each wave against the pier replaces one piece of furniture with an item from another year.',
            promptZh: '哪件物品可以作为房间的稳定参照？',
            promptEn: 'Which object may serve as the room’s stable reference?',
            options: [o({
                labelZh: '固定无指针的壁钟',
                labelEn: 'Anchor the handless clock',
                outcomeZh: '钟框留在墙上，却不宣称当前时间。',
                outcomeEn: 'The clock frame stays on the wall without claiming the present hour.',
                resultZh: '房间获得位置参照而非时间权威，变化仍可被观察。',
                resultEn: 'The room gains a spatial reference, not a temporal authority, and change remains observable.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '记录每次家具交换',
                labelEn: 'Log every furniture exchange',
                outcomeZh: '防水簿写下浪高、旧物和新物。',
                outcomeEn: 'A waterproof ledger notes wave height, departing object, and arriving object.',
                resultZh: '变化链变得可追溯，没有一个年份被指定为真正房间。',
                resultEn: 'The change chain becomes traceable without naming one year the true room.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让衣柜保管各年标签',
                labelEn: 'Let the wardrobe hold year tags',
                outcomeZh: '抽屉按来源收纳标签，门始终不上锁。',
                outcomeEn: 'Drawers hold provenance tags and the door remains unlocked.',
                resultZh: '共同保管取代中心裁决，每件家具都能带走自己的记录。',
                resultEn: 'Shared custody replaces central judgment; each object may take its record away.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '在浪间迅速拍下平面图',
                labelEn: 'Sketch between waves',
                outcomeZh: '短暂布局被画成明确标时的快照。',
                outcomeEn: 'The temporary layout becomes a clearly timestamped snapshot.',
                resultZh: '绮音承认快照会过期，却仍勇敢保存当下证据。',
                resultEn: 'Chime admits the snapshot will expire while bravely preserving present evidence.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '不设稳定参照',
                labelEn: 'Choose no fixed reference',
                outcomeZh: '房间继续变化，门口只留下安全出口标识。',
                outcomeEn: 'The room keeps changing with only a safe-exit marker at the door.',
                resultZh: '退出路径稳定而内部保持自由，这一分工写入房契。',
                resultEn: 'The exit remains stable while the interior stays free; the distinction enters the room charter.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'courier',
            introZh: '信使在贝壳抽屉里找到一把钥匙，但每次试锁都会出现新的门。',
            introEn: 'Courier finds a key in a shell-lined drawer, but every attempted lock summons another door.',
            promptZh: '你们该如何测试这把不断改变房间的钥匙？',
            promptEn: 'How should you test a key that keeps changing the room?',
            options: [o({
                labelZh: '只测试标记为出口的门',
                labelEn: 'Test only the marked exit',
                outcomeZh: '钥匙打开通往栈桥的窄梯，没有生成旁门。',
                outcomeEn: 'The key opens a narrow stair to the pier without creating another door.',
                resultZh: '安全用途先被确认，其他能力仍保持未知。',
                resultEn: 'The safe use is confirmed while other abilities remain unknown.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '为每扇新门编号封存',
                labelEn: 'Number and seal each new door',
                outcomeZh: '蜡封写明生成顺序与试锁者。',
                outcomeEn: 'Wax seals record creation order and tester.',
                resultZh: '门的谱系进入档案，后续实验不能抹去失败入口。',
                resultEn: 'The door lineage enters the archive; later tests cannot erase failed entrances.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '两人分别保管钥匙和地图',
                labelEn: 'Split custody of key and map',
                outcomeZh: '任何一次试锁都需要双方明确同意。',
                outcomeEn: 'Every test now requires explicit agreement from both custodians.',
                resultZh: '不对称权力被拆开，信任变成可验证流程。',
                resultEn: 'Asymmetric power is divided and trust becomes a verifiable process.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '把钥匙投入无人门',
                labelEn: 'Use the key on the unclaimed door',
                outcomeZh: '门后是空白平台，边缘有可立即返回的绳梯。',
                outcomeEn: 'An empty platform lies beyond, edged by a ladder for immediate return.',
                resultZh: '一次受控冒险新增路线，却没有关闭原房间。',
                resultEn: 'A controlled risk adds a route without closing the original room.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '把钥匙留在透明盒中',
                labelEn: 'Leave the key in a clear case',
                outcomeZh: '所有人看得见它，没人被要求立刻使用。',
                outcomeEn: 'Everyone can see it and no one must use it now.',
                resultZh: '等待状态获得长期编号，未使用不再被系统视作浪费。',
                resultEn: 'Waiting gains a durable identifier; non-use is no longer treated as waste.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        })], {
            type: 'checkpoint',
            text: b('桥下房间固定出口标识，其余家具继续随潮水自由更换。',
                'The room beneath the pier fixes its exit sign while furniture continues changing with the tide.'
                ),
            unlockType: 'collection',
            unlockKey: 'tides.shell-key-case'
        }, {
            title: b('不断变化房间里的固定出口', 'The Fixed Exit in a Changing Room'),
            body: b('你们没有强迫内部稳定，只让离开始终清楚；钥匙仍在透明盒中等待。',
                'You did not force the interior to stabilize; only leaving stays clear, and the key still waits in its transparent case.'
                )
        }), episode('storm-name-market', '风暴名字集市', 'The Storm-Name Market', 'courier',
        'patience', [scene({
            speaker: 'courier',
            introZh: '摊贩把已经过去的风暴名装进玻璃瓶，却有人兜售仍在海上的名字。',
            introEn: 'Vendors bottle names of past storms, but one stall sells names still at sea.',
            promptZh: '未结束的风暴名应该留在集市吗？',
            promptEn: 'Should the name of an ongoing storm remain for sale?',
            options: [o({
                labelZh: '立刻撤下未完名字',
                labelEn: 'Remove the unfinished name',
                outcomeZh: '瓶子进入只读保管柜，买卖当场停止。',
                outcomeEn: 'The bottle enters read-only custody and trading stops.',
                resultZh: '集市新增在途事件禁售线，现实危险不再成为收藏品。',
                resultEn: 'The market gains an ongoing-event boundary so real danger cannot become merchandise.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '标红并提供避险信息',
                labelEn: 'Mark it red with safety information',
                outcomeZh: '摊位改成无价的公共风暴告示。',
                outcomeEn: 'The stall becomes a free public storm notice.',
                resultZh: '信使把帮助与交易分离，任何提醒都不附带消费要求。',
                resultEn: 'Courier separates help from trade; no warning carries a purchase request.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '核验名字来源',
                labelEn: 'Verify the name source',
                outcomeZh: '气象日志显示瓶签抄错了年份。',
                outcomeEn: 'Weather logs reveal the label copied the wrong year.',
                resultZh: '纠错记录公开保留，摊主不能用新标签覆盖旧失误。',
                resultEn: 'The correction stays public; a new label cannot overwrite the old error.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '封闭整条高风险街',
                labelEn: 'Close the high-risk row',
                outcomeZh: '遮雨棚落下，其他摊位从侧门安全离开。',
                outcomeEn: 'Canopies close and neighboring stalls exit through a safe side gate.',
                resultZh: '临时关闭有明确复查时刻，保护不会变成永久惩罚。',
                resultEn: 'The closure has a review time, so protection cannot become permanent punishment.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '邀请受影响港口决定',
                labelEn: 'Let affected harbors decide',
                outcomeZh: '五个港口分别投下保留、改写或封存票。',
                outcomeEn: 'Five harbors vote separately to keep, revise, or seal it.',
                resultZh: '决定范围与参与者被完整记录，缺席港口不算同意。',
                resultEn: 'Scope and participants are recorded; absent harbors do not count as consent.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'patience',
            introZh: '耐心发现一瓶旧雷暴名被买家改成自己的英雄称号。',
            introEn: 'Patience finds an old thunderstorm name relabeled as a buyer’s heroic title.',
            promptZh: '这次私人改名怎样既被允许又不篡改公共档案？',
            promptEn: 'How can private renaming be allowed without altering the public archive?',
            options: [o({
                labelZh: '保留原签另挂昵称',
                labelEn: 'Keep the label and add a nickname',
                outcomeZh: '细绳把私人称呼挂在瓶颈，原名仍可见。',
                outcomeEn: 'A cord hangs the nickname at the neck while the original remains visible.',
                resultZh: '个人意义和公共来源并列存在，谁也不冒充另一方。',
                resultEn: 'Private meaning and public provenance coexist without impersonation.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '制作不相连的纪念瓶',
                labelEn: 'Make a separate keepsake',
                outcomeZh: '新瓶明确写着虚构纪念，不复制风暴编号。',
                outcomeEn: 'A new bottle says fictional keepsake and copies no storm identifier.',
                resultZh: '创作获得空间，历史记录不承担私人叙事。',
                resultEn: 'Creation gains room while history carries no private narrative.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '请买家写改名理由',
                labelEn: 'Invite a renaming note',
                outcomeZh: '理由自愿存入侧袋，拒绝填写也能离开。',
                outcomeEn: 'An optional note enters a side pocket, and refusal never blocks departure.',
                resultZh: '解释不再是所有权门槛，集市长期保留这一边界。',
                resultEn: 'Explanation ceases to be an ownership gate; the market keeps that boundary.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '把瓶子归还公共架',
                labelEn: 'Return the bottle to public shelves',
                outcomeZh: '交易撤销并留下完整收据链。',
                outcomeEn: 'The sale reverses with a complete receipt trail.',
                resultZh: '耐心承认不可接受的改写，撤销也没有羞辱买家。',
                resultEn: 'Patience rejects the alteration while reversing it without shaming the buyer.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '开放一块可擦写名牌',
                labelEn: 'Offer an erasable nameplate',
                outcomeZh: '访客能暂时命名，离开时名牌恢复空白。',
                outcomeEn: 'Visitors may name it temporarily; the plate clears when they leave.',
                resultZh: '短暂参与不会改变永久藏品，游戏与档案边界清楚。',
                resultEn: 'Temporary play cannot alter the permanent collection; game and archive stay distinct.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], {
            type: 'memory_unlock',
            text: b('风暴集市把在途名字移入公共告示栏，旧瓶继续保存可追溯标签。',
                'The storm market moves ongoing names to a public notice while old bottles keep traceable labels.'
                ),
            unlockType: 'reward_catalog_visibility',
            unlockKey: 'tides.storm-label'
        }, {
            title: b('不出售仍在海上的名字', 'The Name Still at Sea Is Not for Sale'),
            body: b('帮助、纪念与历史被分成不同容器；私人昵称再也不能覆盖公共来源。',
                'Help, remembrance, and history occupy separate containers; private nicknames can no longer overwrite public provenance.'
                )
        }, {
            text: b('守望者从远岸传来气压读数，没有附带任何航行建议。',
                'The watcher sends a pressure reading from the far shore without attaching sailing advice.'
                ),
            title: b('只报告天气的短讯', 'A Note That Only Reports Weather'),
            body: b('读数可以采用、忽略或稍后核验；它不会替任何人决定是否出港。',
                'The reading may be used, ignored, or checked later; it decides no departure.'
                )
        }), episode('island-in-inbox', '收件箱里的岛', 'The Island in the Inbox', 'patience',
        'tessera', [scene({
            speaker: 'patience',
            introZh: '一封未署名邮件展开成沙洲，邮票变成唯一可登陆的木码头。',
            introEn: 'An unsigned message unfolds into a sandbar whose stamp becomes the only landing pier.',
            promptZh: '你们怎样登陆而不把收信等同于同意？',
            promptEn: 'How can you land without treating receipt as consent?',
            options: [o({
                labelZh: '先发送只读回执',
                labelEn: 'Send a read-only receipt',
                outcomeZh: '回执只确认抵达，不请求身份或回答。',
                outcomeEn: 'The receipt confirms arrival and asks for neither identity nor reply.',
                resultZh: '收件箱保存最低回应原则，沉默不会触发追问。',
                resultEn: 'The inbox preserves minimum response; silence triggers no follow-up.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '在码头设置返回按钮',
                labelEn: 'Place a return control on the pier',
                outcomeZh: '访客一触即可折回邮件视图。',
                outcomeEn: 'A single action returns visitors to the message view.',
                resultZh: '退出路径先于探索存在，岛屿不能困住收件人。',
                resultEn: 'Exit exists before exploration, so the island cannot trap its recipient.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '复制沙洲到隔离地图',
                labelEn: 'Copy the sandbar into a sandbox',
                outcomeZh: '副本不连接真实收件箱或联系人。',
                outcomeEn: 'The copy connects to neither the real inbox nor contacts.',
                resultZh: '探索在隔离边界内进行，未知内容无法扩大权限。',
                resultEn: 'Exploration stays sandboxed and unknown content gains no broader permission.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '邀请共同查看但不转发',
                labelEn: 'Invite a joint view without forwarding',
                outcomeZh: '特瑟拉看到同一安全投影，没有获得原信地址。',
                outcomeEn: 'Tessera sees the same safe projection without the original address.',
                resultZh: '协作获得最小信息，隐藏来源仍受保护。',
                resultEn: 'Collaboration gets minimum information while hidden provenance stays protected.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '归档邮件保持岛屿关闭',
                labelEn: 'Archive with the island closed',
                outcomeZh: '沙洲折回信封，邮票仍然完整。',
                outcomeEn: 'The sandbar folds into its envelope and the stamp stays intact.',
                resultZh: '未探索被记作完整决定，不降低任何关系或解锁。',
                resultEn: 'Not exploring counts as a complete decision and reduces no relationship or unlock.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'tessera',
            introZh: '岛中央有一座回信塔，每层都要求比上一层更多的个人资料。',
            introEn: 'A reply tower at the island center asks for more personal data on every floor.',
            promptZh: '哪种方式能让交流继续而不接受递增索取？',
            promptEn: 'What keeps communication possible without accepting escalating requests?',
            options: [o({
                labelZh: '只在底层留虚构便签',
                labelEn: 'Leave a fictional note downstairs',
                outcomeZh: '便签不含真实姓名、位置或联系方式。',
                outcomeEn: 'The note includes no real name, location, or contact detail.',
                resultZh: '安全虚构成为合法回应，塔不能把真实性当作入场费。',
                resultEn: 'Safe fiction becomes a valid reply; the tower cannot charge authenticity as admission.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '逐层拒绝多余字段',
                labelEn: 'Reject each extra field',
                outcomeZh: '表单显示跳过后仍能提交。',
                outcomeEn: 'The form remains submittable after every optional field is skipped.',
                resultZh: '数据最小化被写进塔的永久表单版本。',
                resultEn: 'Data minimization enters the tower’s permanent form version.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '检查字段实际用途',
                labelEn: 'Inspect each field purpose',
                outcomeZh: '说明页暴露三项从未被读取的收集项。',
                outcomeEn: 'The explanation page reveals three collected fields that were never used.',
                resultZh: '无用途字段进入删除清单，调查结果可复核。',
                resultEn: 'Purposeless fields enter a removal list with reviewable findings.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '关闭塔门并举报索取',
                labelEn: 'Close and report the request',
                outcomeZh: '举报只携带字段结构，不复制私人输入。',
                outcomeEn: 'The report carries field structure without copying private input.',
                resultZh: '关闭后的塔不能再发邀请，除非审核与主动重新同意都完成。',
                resultEn: 'The closed tower cannot invite again without review and voluntary renewed consent.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '建立公共问答板',
                labelEn: 'Build a public question board',
                outcomeZh: '问题改写成任何访客都能匿名回答的形式。',
                outcomeEn: 'Questions become forms any visitor may answer anonymously.',
                resultZh: '交流从私人索取转成公共选择，参与不再暴露身份。',
                resultEn: 'Communication shifts from private extraction to public choice without identity exposure.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], {
            type: 'checkpoint',
            text: b('邮件岛保存安全投影并关闭递增索取塔，返回按钮始终可见。',
                'The mail island saves its safe projection, closes the escalating tower, and keeps return visible.'
                ),
            unlockType: 'achievement',
            unlockKey: 'tides.inbox-islander'
        }, {
            title: b('邮票码头的返回按钮', 'The Return Control at Stamp Pier'),
            body: b('收到邀请不等于同意登陆；即使上岛，每一步也可以只提供最低必要信息。',
                'Receiving an invitation is not consent to land; even ashore, every step may provide only necessary information.'
                )
        }), episode('choir-of-foghorns', '雾笛合唱团', 'The Foghorn Choir', 'tessera',
        'flora', [scene({
            speaker: 'tessera',
            introZh: '十二支雾笛各自坚持一个归航音，低潮时三支会互相抵消。',
            introEn: 'Twelve foghorns hold distinct homeward notes, and three cancel one another at low tide.',
            promptZh: '合唱怎样调整才能保留所有港口的可听信号？',
            promptEn: 'How should the choir adjust while keeping every harbor audible?',
            options: [o({
                labelZh: '错开三支雾笛节拍',
                labelEn: 'Stagger the three horns',
                outcomeZh: '相同音量在不同秒数抵达。',
                outcomeEn: 'The same volumes arrive in different seconds.',
                resultZh: '时间分配解决遮蔽，不要求任何港口降低重要性。',
                resultEn: 'Timing resolves masking without asking any harbor to matter less.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '为低潮制作独立谱',
                labelEn: 'Write a low-tide score',
                outcomeZh: '潮位触发另一份明确版本。',
                outcomeEn: 'Tide level activates a distinct, explicit version.',
                resultZh: '环境分支进入版本库，不会偷偷改变常规曲谱。',
                resultEn: 'The environmental branch enters version history instead of silently changing the usual score.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '保留最弱音的优先窗',
                labelEn: 'Reserve a window for the faintest note',
                outcomeZh: '其他雾笛短暂停顿，让远港信号单独通过。',
                outcomeEn: 'Other horns pause briefly so the distant harbor passes alone.',
                resultZh: '可听性最低者获得保障，安静片刻不被算作失误。',
                resultEn: 'The least audible gains protection, and a quiet interval is not counted as error.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '取消今夜联合演奏',
                labelEn: 'Cancel tonight’s ensemble',
                outcomeZh: '各港回到自己的安全呼号。',
                outcomeEn: 'Each harbor returns to its safe individual call.',
                resultZh: '取消没有扣除合唱资格，明夜仍能重新选择。',
                resultEn: 'Cancellation removes no choir eligibility; tomorrow permits a fresh choice.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '增加视觉浮标同步',
                labelEn: 'Add visual buoy cues',
                outcomeZh: '灯色复述节拍但不暴露隐藏港号。',
                outcomeEn: 'Light colors repeat timing without exposing private harbor codes.',
                resultZh: '平行感官入口持久开放，视觉版本不是次等替代。',
                resultEn: 'A parallel sensory entrance remains available and is not a lesser substitute.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'flora',
            introZh: '芙洛拉发现指挥棒会自动放大持棒者的声部。',
            introEn: 'Flora discovers the baton automatically amplifies its holder’s part.',
            promptZh: '谁来指挥才不会让权力伪装成音乐优势？',
            promptEn: 'Who should conduct without power disguising itself as musical advantage?',
            options: [o({
                labelZh: '关闭自动放大功能',
                labelEn: 'Disable automatic amplification',
                outcomeZh: '指挥只发送节拍，不改变音量。',
                outcomeEn: 'Conducting sends timing without changing volume.',
                resultZh: '角色权限缩回最低范围，领导不再天然更响。',
                resultEn: 'Role permission returns to minimum scope; leadership is no longer inherently louder.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '每段轮换指挥者',
                labelEn: 'Rotate conductors each passage',
                outcomeZh: '十二支雾笛都拥有一次起拍权。',
                outcomeEn: 'All twelve horns receive one opening cue.',
                resultZh: '轮换表写入公开谱面，权力变化可预测也可拒绝。',
                resultEn: 'Rotation enters the public score, making power predictable and optional.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '采用无人指挥节拍器',
                labelEn: 'Use a conductorless metronome',
                outcomeZh: '共同节拍来自可检查的机械摆。',
                outcomeEn: 'A reviewable mechanical pendulum supplies shared time.',
                resultZh: '规则取代个人特权，但紧急停止按钮仍由每人拥有。',
                resultEn: 'A rule replaces personal privilege while everyone keeps an emergency stop.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让最远港口指挥',
                labelEn: 'Let the farthest harbor conduct',
                outcomeZh: '微弱信号首次决定全团起点。',
                outcomeEn: 'The faintest signal sets the ensemble’s opening for the first time.',
                resultZh: '一次受控权力反转写入历史，不能被后来的强音抹去。',
                resultEn: 'A controlled reversal enters history and cannot be erased by louder notes later.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '拆成三个自治声部组',
                labelEn: 'Form three autonomous sections',
                outcomeZh: '小组各选节拍，再协商共同停顿。',
                outcomeEn: 'Sections choose local time and negotiate shared rests.',
                resultZh: '协调发生在边界之间，而不是由中央吞并差异。',
                resultEn: 'Coordination happens between boundaries instead of central absorption.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], {
            type: 'memory_unlock',
            text: b('雾笛团封存会放大权力的旧指挥棒，低潮谱与视觉浮标同步启用。',
                'The choir archives the power-amplifying baton and activates its low-tide score with visual buoys.'
                ),
            unlockType: 'game',
            unlockKey: 'signal-duet.foghorn-score'
        }, {
            title: b('不会让指挥者更响的合唱', 'The Choir Where Conductors Are Not Louder'),
            body: b('时间、可听性与停演权被分别保护；远港的微弱音第一次留下了起拍记录。',
                'Timing, audibility, and cancellation are protected separately; the far harbor’s faint note keeps its first downbeat.'
                )
        }, {
            text: b('守望者发来一张空白休止符卡，请合唱团自行决定何时使用。',
                'The watcher sends a blank rest card for the choir to place whenever it chooses.'
                ),
            title: b('由演奏者安放的休止符', 'A Rest Placed by the Performers'),
            body: b('它不是暂停命令，只是一项所有声部都能提出的工具。',
                'It is not an order to pause, only a tool any section may propose.')
        }), episode('reef-of-promises', '承诺珊瑚礁', 'The Reef of Promises', 'flora',
        'bell', [scene({
            speaker: 'flora',
            introZh: '珊瑚把旧承诺长成狭窄拱门，最亮的一扇写着已经无法兑现的日期。',
            introEn: 'Coral grows old promises into narrow arches; the brightest bears a date that can no longer be kept.',
            promptZh: '过期承诺应该怎样留在航道上？',
            promptEn: 'How should an expired promise remain in the channel?',
            options: [o({
                labelZh: '刻明它已经失效',
                labelEn: 'Mark it expired',
                outcomeZh: '石牌保留原句并增加失效日期。',
                outcomeEn: 'A plaque preserves the wording and adds its expiry date.',
                resultZh: '后来者看得见历史，却不会把旧话误认成现行义务。',
                resultEn: 'Later travelers see history without mistaking old words for current duty.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '开辟不穿拱门的水路',
                labelEn: 'Open a route around the arch',
                outcomeZh: '新航道绕开承诺形状而不毁坏珊瑚。',
                outcomeEn: 'A new channel bypasses the promise without destroying coral.',
                resultZh: '选择不再以兑现旧话为通行费，替代路线永久可见。',
                resultEn: 'Keeping an old promise ceases to be a toll; the alternate route stays visible.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '邀请当事人重新协商',
                labelEn: 'Invite a fresh agreement',
                outcomeZh: '新承诺使用另一块石板并允许拒绝。',
                outcomeEn: 'A new agreement uses another stone and permits refusal.',
                resultZh: '两次决定各自署时，更新没有假装过去从未发生。',
                resultEn: 'Both decisions keep their dates; renewal does not pretend the past vanished.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '研究珊瑚生长方向',
                labelEn: 'Study the coral growth',
                outcomeZh: '年轮说明拱门曾被三次海流改变。',
                outcomeEn: 'Growth rings show the arch changed under three currents.',
                resultZh: '环境影响进入档案，责任不再被简化成一个人的意志。',
                resultEn: 'Environmental influence enters the archive; responsibility is no longer reduced to one will.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让拱门自然风化',
                labelEn: 'Let the arch weather naturally',
                outcomeZh: '浮标提醒船只保持距离，不加固也不拆除。',
                outcomeEn: 'Buoys keep vessels away without reinforcement or demolition.',
                resultZh: '结束被允许缓慢发生，礁区不设置遗忘期限。',
                resultEn: 'An ending may happen slowly, and the reef sets no deadline for forgetting.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'bell',
            introZh: '贝尔发现一条新生珊瑚正在复制你们昨天的选择，却把退路封死了。',
            introEn: 'Bell finds new coral copying yesterday’s choice while sealing its retreat.',
            promptZh: '怎样纠正复制品而不否认原选择？',
            promptEn: 'How can the copy be corrected without denying the original choice?',
            options: [o({
                labelZh: '在复制品上凿出出口',
                labelEn: 'Carve an exit in the copy',
                outcomeZh: '窄缝让水流双向通过。',
                outcomeEn: 'A narrow cut restores two-way flow.',
                resultZh: '贝尔把可退出性列为复制前提，原选择仍保留原貌。',
                resultEn: 'Bell makes exit a prerequisite for copying while the original stays intact.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '标注两者条件不同',
                labelEn: 'Label the changed conditions',
                outcomeZh: '潮位与材料差异写在并列浮牌上。',
                outcomeEn: 'Parallel floats name differences in tide and material.',
                resultZh: '相似外形不再自动获得相同意义，比较依据被长期保存。',
                resultEn: 'Similar form no longer receives automatic meaning; comparison grounds persist.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '暂停珊瑚继续生长',
                labelEn: 'Pause further growth',
                outcomeZh: '可移网罩挡住孢子而不伤母体。',
                outcomeEn: 'A removable mesh catches spores without harming the source.',
                resultZh: '暂停具有复核日，保护不会悄悄变成永久控制。',
                resultEn: 'The pause receives a review date so protection cannot quietly become permanent control.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '请另一支流提供形状',
                labelEn: 'Ask another current for a form',
                outcomeZh: '交叉水流长出带侧门的新拱。',
                outcomeEn: 'A crossing current grows a new arch with a side gate.',
                resultZh: '共同设计替代盲目复制，差异成为结构优势。',
                resultEn: 'Co-design replaces imitation and difference becomes structural strength.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拆下复制品作教学样本',
                labelEn: 'Remove the copy for teaching',
                outcomeZh: '样本盒写明它为何危险以及谁作出拆除决定。',
                outcomeEn: 'The case records why it was unsafe and who approved removal.',
                resultZh: '不可逆动作留下完整理由，未来可以审查而不能偷偷重写。',
                resultEn: 'The irreversible act keeps its reasons for future review, not covert rewriting.',
                axis: 'courage',
                route: 'brave-route'
            })]
        })], {
            type: 'checkpoint',
            text: b('承诺礁开放绕行水道，并为每块新石板保留独立日期与退出线。',
                'Promise Reef opens a bypass and gives every new tablet its own date and exit line.'
                ),
            unlockType: 'achievement',
            unlockKey: 'tides.promise-cartographer'
        }, {
            title: b('不把旧话当作通行费的水道', 'A Channel That Charges No Old Promise'),
            body: b('过期、续订、绕行与风化都获得名字；关系无需靠兑现失效日期证明。',
                'Expiry, renewal, bypass, and weathering all gain names; a relationship need not prove itself by honoring a dead date.'
                )
        }), episode('moon-pool-rehearsal', '月池彩排', 'Moon-Pool Rehearsal', 'bell',
        'keeper', [scene({
            speaker: 'bell',
            introZh: '水下舞台的倒影总比演员早一句台词，泄露了尚未选择的回答。',
            introEn: 'Reflections on the submerged stage speak one line ahead, exposing answers not yet chosen.',
            promptZh: '彩排怎样继续而不让未来台词操纵演员？',
            promptEn: 'How can rehearsal continue without future lines manipulating performers?',
            options: [o({
                labelZh: '遮住倒影只听现场声',
                labelEn: 'Mask reflections and keep live sound',
                outcomeZh: '漂浮幕布盖住水面，演员只听当前搭档。',
                outcomeEn: 'A floating curtain covers the water so actors hear only present partners.',
                resultZh: '未来提示退出默认视野，自主表演成为长期规则。',
                resultEn: 'Future cues leave the default view and autonomous performance becomes policy.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '把预示台词标成假设',
                labelEn: 'Label previews as hypotheses',
                outcomeZh: '每句倒影旁亮起不保证发生的字幕。',
                outcomeEn: 'Every reflected line receives a may not happen caption.',
                resultZh: '预测与承诺被分开，演员不会因拒绝预示而受罚。',
                resultEn: 'Prediction separates from promise, and rejecting a preview carries no penalty.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让演员选择是否查看',
                labelEn: 'Let performers opt into viewing',
                outcomeZh: '个人面罩分别控制可见度。',
                outcomeEn: 'Individual masks control visibility separately.',
                resultZh: '信息边界按人保存，同场不再意味着共享全部未来。',
                resultEn: 'Information boundaries persist per person; sharing a stage no longer shares every future.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '即兴改写下一句',
                labelEn: 'Improvise a different next line',
                outcomeZh: '贝尔说出倒影没有准备的回答。',
                outcomeEn: 'Bell speaks an answer the reflection did not prepare.',
                resultZh: '一次安全偏离证明预示不是命令，勇气轴留下新旗标。',
                resultEn: 'A safe deviation proves preview is not command and leaves a courage flag.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '排干月池暂停机制',
                labelEn: 'Drain the pool and pause the device',
                outcomeZh: '舞台恢复普通木板，倒影暂时消失。',
                outcomeEn: 'The stage returns to plain boards and the reflections disappear.',
                resultZh: '技术暂停不取消演出资格，重开必须重新获得同意。',
                resultEn: 'A technical pause cancels no eligibility; reopening requires renewed consent.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'keeper',
            introZh: '守站人发现观众席掌声会改变水位，少数响亮观众能淹没安静评价。',
            introEn: 'Keeper finds applause changes the water level, allowing a loud minority to drown quiet feedback.',
            promptZh: '哪种反馈设计能避免音量成为权重？',
            promptEn: 'Which feedback design prevents volume from becoming weight?',
            options: [o({
                labelZh: '每席一枚等重灯票',
                labelEn: 'Give every seat one equal light',
                outcomeZh: '亮度只表示是否回应，不累计敲击次数。',
                outcomeEn: 'Brightness records response, not repeated tapping.',
                resultZh: '重复动作不能放大一个人，反馈计数保持一人一票。',
                resultEn: 'Repeated actions cannot amplify one person; feedback remains one seat, one signal.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '增加私密文字出口',
                labelEn: 'Add a private text channel',
                outcomeZh: '安静观众可以稍后提交有界短评。',
                outcomeEn: 'Quiet viewers may send bounded notes later.',
                resultZh: '异步意见获得同等审阅，不因离场而失效。',
                resultEn: 'Asynchronous views receive equal review and do not expire on departure.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '公开水位计算规则',
                labelEn: 'Publish the water formula',
                outcomeZh: '舞台边缘显示每类信号的有限权重。',
                outcomeEn: 'The stage edge displays bounded weights for each signal.',
                resultZh: '可检查规则取代神秘热度，操纵空间进入审计范围。',
                resultEn: 'A reviewable rule replaces mysterious popularity and exposes manipulation to audit.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '取消实时水位联动',
                labelEn: 'Disconnect live water changes',
                outcomeZh: '反馈只在散场后生成报告。',
                outcomeEn: 'Feedback produces a report only after the show.',
                resultZh: '演员表演期间不再承受即时群体压力，结束后仍能选择不看。',
                resultEn: 'Performers escape live crowd pressure and may still decline the report afterward.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '保留一段无反馈演出',
                labelEn: 'Reserve a feedback-free passage',
                outcomeZh: '中段音乐不记录掌声、文字或灯票。',
                outcomeEn: 'The middle passage records no applause, text, or lights.',
                resultZh: '不被评价的空间进入节目结构，沉默不再是缺失数据。',
                resultEn: 'A space beyond evaluation enters the program; silence is no longer missing data.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], {
            type: 'game_launch',
            text: b('月池关闭答案倒影，把等重灯票规则交给信号双奏练习。',
                'The moon pool closes answer reflections and lends its equal-light rule to Signal Duet.'
                ),
            unlockType: 'game',
            unlockKey: 'signal-duet.moon-stage'
        }, {
            title: b('没有提前台词的水下舞台', 'The Submerged Stage Without Advance Lines'),
            body: b('演员控制未来提示，观众音量不再改变权重，节目中还保留一段不被评价的空间。',
                'Performers control future cues, audience volume no longer changes weight, and the show keeps a passage beyond evaluation.'
                )
        }, {
            text: b('守望者把提词器调成空白，只留下可由演员按下的求助键。',
                'The watcher clears the prompter and leaves only a help key performers may press.'
                ),
            title: b('由舞台发起的提示', 'A Cue Requested from the Stage'),
            body: b('提示不会自行出现；没有按键也被视为完整的表演选择。',
                'No cue appears on its own, and not pressing the key is a complete performance choice.'
                )
        }), episode('relay-two', '二号中继站', 'Relay Two', 'keeper', 'lumen', [scene({
        speaker: 'keeper',
        introZh: '浮台中继站收到四条归航申请，但接口只能先稳定一条。',
        introEn: 'The floating relay receives four return requests but can stabilize only one interface first.',
        promptZh: '第一条连接应依据什么排序？',
        promptEn: 'What should determine the first connection?',
        options: [o({
            labelZh: '先接通明确求助信号',
            labelEn: 'Connect the explicit distress call',
            outcomeZh: '红色请求获得临时窄带，其余申请保持排队可见。',
            outcomeEn: 'The distress call gets temporary bandwidth while other requests remain visibly queued.',
            resultZh: '紧急优先有范围和期限，不会永久占据中继站。',
            resultEn: 'Emergency priority has scope and expiry, so it cannot own the relay forever.',
            axis: 'trust',
            route: 'beacon-route'
        }), o({
            labelZh: '采用公开轮换序列',
            labelEn: 'Use a public rotation',
            outcomeZh: '四条线路按上次服务时间排列。',
            outcomeEn: 'The lines sort by their last service time.',
            resultZh: '排序依据可复核，管理员不能私下插队。',
            resultEn: 'The ordering is reviewable and administrators cannot secretly jump the queue.',
            axis: 'curiosity',
            route: 'archive-route'
        }), o({
            labelZh: '询问各港可等待程度',
            labelEn: 'Ask each harbor about waiting',
            outcomeZh: '两个港口主动选择稍后，且不会失去位置。',
            outcomeEn: 'Two harbors volunteer to wait without losing their places.',
            resultZh: '主动延期成为有保障状态，合作不再假设人人同样紧急。',
            resultEn: 'Voluntary postponement gains protection; cooperation stops assuming equal urgency.',
            axis: 'harmony',
            route: 'constellation-route'
        }), o({
            labelZh: '启用容量较小的并行桥',
            labelEn: 'Open smaller parallel bridges',
            outcomeZh: '四条低速线同时建立并保留退出按钮。',
            outcomeEn: 'Four slower links open together with exit controls.',
            resultZh: '一次大胆降速换来共同可达，选择记录进入站务日志。',
            resultEn: 'A brave speed tradeoff yields shared access and enters the station log.',
            axis: 'courage',
            route: 'brave-route'
        }), o({
            labelZh: '拒绝在信息不足时排序',
            labelEn: 'Decline to rank incomplete requests',
            outcomeZh: '中继站只回传所缺字段和安全最小值。',
            outcomeEn: 'The relay returns only missing fields and safe minima.',
            resultZh: '未知不会被猜测填平，补充信息也不要求私人资料。',
            resultEn: 'Unknowns are not filled by guesswork, and clarification requests no private data.',
            axis: 'curiosity',
            route: 'archive-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '流明发现新核心会把“保持连接”误解为禁止任何一方离线。',
        introEn: 'Lumen finds the new core interprets stay connected as neither side may go offline.',
        promptZh: '核心的持久在线规则该被怎样替换？',
        promptEn: 'How should the always-online rule be replaced?',
        options: [o({
            labelZh: '改成可恢复会话',
            labelEn: 'Use resumable sessions',
            outcomeZh: '断开后保存序号，回来只补拉缺失事件。',
            outcomeEn: 'Disconnect saves sequence and return fetches only missing events.',
            resultZh: '离线不再清空关系或奖励，恢复协议成为站点基础。',
            resultEn: 'Offline time no longer clears relationship or rewards; recovery becomes infrastructure.',
            axis: 'trust',
            route: 'beacon-route'
        }), o({
            labelZh: '设置双方独立离开键',
            labelEn: 'Give both sides independent leave controls',
            outcomeZh: '任何一方都能退出而不关闭对方档案。',
            outcomeEn: 'Either side may leave without closing the other’s archive.',
            resultZh: '连接状态与内容所有权分离，自主边界长期生效。',
            resultEn: 'Connection state separates from content ownership and autonomy persists.',
            axis: 'harmony',
            route: 'constellation-route'
        }), o({
            labelZh: '记录每次断线原因类别',
            labelEn: 'Record bounded disconnect categories',
            outcomeZh: '日志只写网络、主动退出或会话过期。',
            outcomeEn: 'Logs store only network, voluntary leave, or session expiry.',
            resultZh: '诊断获得足够信息却不收集私人解释。',
            resultEn: 'Diagnostics gain enough information without collecting private explanations.',
            axis: 'curiosity',
            route: 'archive-route'
        }), o({
            labelZh: '让核心经历一次安全断电',
            labelEn: 'Give the core a safe outage test',
            outcomeZh: '备用电池保持账本，连接随后按序恢复。',
            outcomeEn: 'Backup power preserves the ledger and links resume in order.',
            resultZh: '中继站证明恢复路径真实可用，不再依赖永久在线假设。',
            resultEn: 'The relay proves recovery works instead of relying on permanent presence.',
            axis: 'courage',
            route: 'brave-route'
        }), o({
            labelZh: '保留只收信的安静模式',
            labelEn: 'Keep a receive-only quiet mode',
            outcomeZh: '消息持久入箱但不产生在线推送。',
            outcomeEn: 'Messages persist in the inbox without live pushes.',
            resultZh: '安静时间成为正常连接形态，而非降级或关系惩罚。',
            resultEn: 'Quiet hours become a normal connection state, not degradation or relationship penalty.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })], {
        type: 'checkpoint',
        text: b('二号站写入可恢复会话、独立离开键与只收信模式，然后开放五条长期航线。',
            'Relay Two records resumable sessions, independent leave controls, and receive-only mode before opening five lasting routes.'
            ),
        unlockType: 'achievement',
        unlockKey: 'tides.relay-two-complete'
    }, {
        title: b('允许离线的二号中继核心', 'Relay Two’s Offline-Tolerant Core'),
        body: b('连接不再要求持续在场；序号、补拉与安静收件箱让归来成为权利而非义务。',
            'Connection no longer requires constant presence; sequence, catch-up, and quiet inbox make return a right rather than a duty.'
            )
    })],
    endingRouter: b('归潮把十二段港口航迹带到同一片开阔水面，剩余航线由已经留下的关系轴决定。',
        'The returning tide carries twelve harbor routes into open water, where lasting relationship axes choose the remaining course.'
        ),
    endings: [{
        id: 'tides-of-return.ending.constellation',
        key: 'constellation',
        route: 'tides.ending.constellation',
        priority: 50,
        condition: {
            op: 'axis',
            axis: 'harmony',
            minimum: 16
        },
        text: b('多港星座让每条归航线保留自己的码头，同行不再要求同速。',
            'The many-harbor constellation gives every return route its own dock, so companionship no longer requires one speed.'
            )
    }, {
        id: 'tides-of-return.ending.beacon',
        key: 'beacon',
        route: 'tides.ending.beacon',
        priority: 40,
        condition: {
            op: 'axis',
            axis: 'trust',
            minimum: 16
        },
        text: b('岸灯协议只保证可见出口和诚实状态，从不保证谁会在灯下等待。',
            'The shore-light pact guarantees visible exits and honest status, never who must wait beneath the lamp.'
            )
    }, {
        id: 'tides-of-return.ending.archive',
        key: 'archive',
        route: 'tides.ending.archive',
        priority: 30,
        condition: {
            op: 'axis',
            axis: 'curiosity',
            minimum: 16
        },
        text: b('盐页馆打开潮窗，矛盾记录随着天气呼吸，却始终保留来源。',
            'The salt library opens tidal windows so conflicting records may breathe with weather while keeping provenance.'
            )
    }, {
        id: 'tides-of-return.ending.brave',
        key: 'brave',
        route: 'tides.ending.brave',
        priority: 20,
        condition: {
            op: 'axis',
            axis: 'courage',
            minimum: 16
        },
        text: b('浮台航线离开防波堤，每一段冒险旁都有清楚而无惩罚的返程绳。',
            'The floating route leaves the breakwater with a clear, penalty-free return line beside every risk.'
            )
    }, {
        id: 'tides-of-return.ending.hearth',
        key: 'hearth',
        route: 'tides.ending.hearth',
        priority: 1,
        condition: {
            op: 'always'
        },
        text: b('灯塔厨房保存一张空桌；今天不出航也被记作完整的归潮结论。',
            'The lighthouse kitchen keeps an empty table, and not sailing today counts as a complete returning-tide conclusion.'
            )
    }]
};
for (const current of source.episodes) {
    const additions = deepening[current.slug];
    if (!Array.isArray(additions) || additions.length !== 2) {
        throw new TypeError(`Season Two deepening is incomplete for ${current.slug}`);
    }
    current.scenes.push(...additions);
}
module.exports = compileAuthoredSeason(source);
