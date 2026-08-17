'use strict';

const {
    compileAuthoredSeason
} = require('../../../domain/story/authored-season-compiler');
const {
    b,
    episode,
    option: o,
    scene
} = require('./authored-helpers');
const deepening = require('./season-3-deepening');

function ep(slug, zh, en, character, cameo, scenes, archiveZh, archiveEn, memoryTitleZh,
    memoryTitleEn, memoryZh, memoryEn, owner = null) {
    return episode(slug, zh, en, character, cameo, scenes, {
        type: 'checkpoint',
        text: b(archiveZh, archiveEn),
        unlockType: 'achievement',
        unlockKey: `hours.${slug}`
    }, {
        title: b(memoryTitleZh, memoryTitleEn),
        body: b(memoryZh, memoryEn)
    }, owner);
}
const source = {
    slug: 'city-of-borrowed-hours',
    version: 1,
    title: b('我们之间的信号：借来的时光', 'The Signal Between Us: Borrowed Hours'),
    episodes: [ep('clockwork-arcade', '发条游乐街', 'Clockwork Arcade', 'lumen', 'mika', [scene({
            speaker: 'lumen',
            introZh: '街机用遗失的五分钟换取一次慢动作重播。',
            introEn: 'Arcade cabinets trade five lost minutes for one slow-motion replay.',
            promptZh: '第一枚时间代币应投入哪里？',
            promptEn: 'Where should the first time token go?',
            options: [o({
                labelZh: '退回未说明的五分钟',
                labelEn: 'Return the undisclosed minutes',
                outcomeZh: '投币口亮起退款灯。',
                outcomeEn: 'The slot lights for refund.',
                resultZh: '默认交易改成先说明再同意。',
                resultEn: 'The default now requires explanation before consent.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '查看机器计时日志',
                labelEn: 'Inspect the cabinet clock',
                outcomeZh: '日志暴露两次重复扣时。',
                outcomeEn: 'The log reveals two duplicate charges.',
                resultZh: '重复时间债被永久注销。',
                resultEn: 'Duplicate time debts are permanently voided.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '把重播分享给搭档',
                labelEn: 'Share the replay with a partner',
                outcomeZh: '两人看到相同安全画面。',
                outcomeEn: 'Both see the same safe replay.',
                resultZh: '共享不再复制额外扣款。',
                resultEn: 'Sharing no longer creates another charge.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拒绝交易直接试玩',
                labelEn: 'Decline and play normally',
                outcomeZh: '普通按钮仍然可用。',
                outcomeEn: 'The ordinary controls remain available.',
                resultZh: '付费捷径不再封锁基本入口。',
                resultEn: 'The paid shortcut no longer blocks basic access.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '把代币存进透明盒',
                labelEn: 'Store the token in a clear case',
                outcomeZh: '代币保持未使用状态。',
                outcomeEn: 'The token remains unused.',
                resultZh: '未消费被记为完整选择。',
                resultEn: 'Not spending is recorded as a complete choice.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'mika',
            introZh: '最高分榜把暂停次数误写成作弊次数。',
            introEn: 'The high-score board mislabels pauses as cheating.',
            promptZh: '怎样修复这份伤害休息者的排行？',
            promptEn: 'How should a ranking that harms people who pause be repaired?',
            options: [o({
                labelZh: '删除暂停惩罚列',
                labelEn: 'Remove the pause penalty',
                outcomeZh: '旧分数按原表现重算。',
                outcomeEn: 'Old scores recalculate from play alone.',
                resultZh: '休息从此不降低名次。',
                resultEn: 'Rest no longer lowers rank.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '公开两种独立榜单',
                labelEn: 'Publish separate boards',
                outcomeZh: '速度与探索各有入口。',
                outcomeEn: 'Speed and exploration get separate entries.',
                resultZh: '不同玩法不再被压成一条轴。',
                resultEn: 'Different play styles no longer collapse into one axis.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '保留错误版本供审计',
                labelEn: 'Archive the faulty board',
                outcomeZh: '旧算法进入只读展柜。',
                outcomeEn: 'The old algorithm enters a read-only case.',
                resultZh: '修正没有抹去受影响历史。',
                resultEn: 'The fix does not erase the harmed history.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '暂停全部排名',
                labelEn: 'Pause all rankings',
                outcomeZh: '街机只显示个人记录。',
                outcomeEn: 'Cabinets show personal records only.',
                resultZh: '一次果断停榜阻止继续伤害。',
                resultEn: 'A decisive pause prevents further harm.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许玩家隐藏成绩',
                labelEn: 'Let players hide scores',
                outcomeZh: '隐私开关立即生效。',
                outcomeEn: 'The privacy switch takes effect immediately.',
                resultZh: '可见性改由每位玩家决定。',
                resultEn: 'Visibility now belongs to each player.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '游乐街返还重复扣除的时间，并把暂停从作弊栏移除。',
        'The arcade returns duplicate time and removes pauses from the cheating column.',
        '未投入的发条代币', 'The Unspent Clockwork Token', '它证明捷径、排名和重播都不能把休息变成债务。',
        'It proves shortcuts, rankings, and replays cannot turn rest into debt.', {
            text: b('守望者关掉排行榜霓虹，只保留出口的常亮箭头。',
                'The watcher switches off ranking neon and leaves the exit arrow lit.'
                ),
            title: b('不计分的五分钟', 'Five Minutes Without Scoring'),
            body: b('这段时间可以休息、离开或什么都不做；机器不会追讨。',
                'Use this time to rest, leave, or do nothing; the machine will not reclaim it.'
                )
        }), ep('museum-of-tomorrow', '明日博物馆', 'Museum of Tomorrow', 'sora', 'ori', [
            scene({
                speaker: 'sora',
                introZh: '展柜收藏尚未发生的普通日子，标签却使用确定语气。',
                introEn: 'Cases hold ordinary days not yet lived, while labels speak with certainty.',
                promptZh: '第一张说明牌应怎样改写？',
                promptEn: 'How should the first label be rewritten?',
                options: [o({
                    labelZh: '改用可能发生',
                    labelEn: 'Replace will with may',
                    outcomeZh: '刻字获得可擦除边框。',
                    outcomeEn: 'The inscription gains an erasable border.',
                    resultZh: '预测不再冒充承诺。',
                    resultEn: 'Prediction no longer impersonates promise.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '列出预测依据',
                    labelEn: 'List the forecast sources',
                    outcomeZh: '气象、日历与猜测分栏。',
                    outcomeEn: 'Weather, calendar, and guesses separate.',
                    resultZh: '来源差异进入未来档案。',
                    resultEn: 'Source differences enter the future archive.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '请参观者写另一版本',
                    labelEn: 'Invite another future',
                    outcomeZh: '空卡收下互不相同的明天。',
                    outcomeEn: 'Blank cards receive different tomorrows.',
                    resultZh: '单一路线失去垄断地位。',
                    resultEn: 'One route loses its monopoly.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '关闭过度确定的展柜',
                    labelEn: 'Close the certain case',
                    outcomeZh: '柜门显示复核原因。',
                    outcomeEn: 'The door shows why review is needed.',
                    resultZh: '暂停展出不等于删除未来。',
                    resultEn: 'Pausing display does not delete the future.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '保留一只完全空柜',
                    labelEn: 'Keep one case empty',
                    outcomeZh: '空玻璃不附任何解释。',
                    outcomeEn: 'The empty glass carries no explanation.',
                    resultZh: '未知获得不被填满的权利。',
                    resultEn: 'The unknown gains a right to remain unfilled.',
                    axis: 'curiosity',
                    route: 'archive-route'
                })]
            }), scene({
                speaker: 'ori',
                introZh: '一把尚未旧化的钥匙声称能打开你明年的房间。',
                introEn: 'An unworn key claims it opens your room next year.',
                promptZh: '博物馆该允许谁测试它？',
                promptEn: 'Whom should the museum allow to test it?',
                options: [o({
                    labelZh: '只在模型门上试用',
                    labelEn: 'Use a model door only',
                    outcomeZh: '钥匙没有接触真实住处。',
                    outcomeEn: 'The key touches no real home.',
                    resultZh: '实验边界阻止权限外溢。',
                    resultEn: 'The test boundary prevents permission spill.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '让未来房间保持虚构',
                    labelEn: 'Keep the room fictional',
                    outcomeZh: '舞台布景替代私人地址。',
                    outcomeEn: 'A stage set replaces any private address.',
                    resultZh: '故事不再索取真实空间。',
                    resultEn: 'The story stops requesting real space.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '测量齿纹而不转锁',
                    labelEn: 'Measure teeth without turning',
                    outcomeZh: '扫描只保存几何摘要。',
                    outcomeEn: 'The scan stores geometry only.',
                    resultZh: '研究获得证据但不执行能力。',
                    resultEn: 'Research gains evidence without exercising power.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '熔掉钥匙危险齿',
                    labelEn: 'Remove dangerous teeth',
                    outcomeZh: '钥匙成为无功能纪念物。',
                    outcomeEn: 'The key becomes a harmless keepsake.',
                    resultZh: '不可逆修改留下公开理由。',
                    resultEn: 'The irreversible change keeps a public reason.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '拒绝验证预言',
                    labelEn: 'Decline to verify the prophecy',
                    outcomeZh: '钥匙回到未测试展架。',
                    outcomeEn: 'The key returns to an untested stand.',
                    resultZh: '不验证不会失去后续入口。',
                    resultEn: 'Declining verification loses no later access.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            })
        ], '博物馆把确定句改成可撤回假设，并将未来钥匙限制在模型门。',
        'The museum rewrites certainty as revocable hypotheses and limits the future key to a model door.',
        '空展柜里的明天', 'Tomorrow in the Empty Case', '你们保存了一个不必预测、不必证明也不必发生的未来。',
        'You preserved a future that need not be predicted, proven, or lived.'), ep(
        'tram-at-1259', '十二点五十九分电车', 'The 12:59 Tram', 'mika', 'vale', [scene({
            speaker: 'mika',
            introZh: '电车每站都停在午夜前一分钟，乘客无法抵达“明天”。',
            introEn: 'The tram stops one minute before midnight at every station, preventing arrival at tomorrow.',
            promptZh: '列车长怎样结束这个循环？',
            promptEn: 'How should the conductor end the loop?',
            options: [o({
                labelZh: '允许一站跨过午夜',
                labelEn: 'Let one stop cross midnight',
                outcomeZh: '日期牌安静翻到新页。',
                outcomeEn: 'The date board turns quietly.',
                resultZh: '改变发生且没有抹除昨天。',
                resultEn: 'Change occurs without erasing yesterday.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '让乘客自行选择下车日',
                labelEn: 'Let riders choose their day',
                outcomeZh: '每张票获得独立日期。',
                outcomeEn: 'Each ticket gains its own date.',
                resultZh: '同行不再要求同步跨越。',
                resultEn: 'Companionship no longer requires synchronized crossing.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '检查卡住的分针',
                labelEn: 'Inspect the stuck minute hand',
                outcomeZh: '轴承里找到旧检票章。',
                outcomeEn: 'An old ticket stamp jams the bearing.',
                resultZh: '循环原因进入维修档案。',
                resultEn: 'The loop cause enters repair history.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '开门让人步行离站',
                labelEn: 'Open doors for walking exits',
                outcomeZh: '站台灯照出普通街道。',
                outcomeEn: 'Platform lights reveal an ordinary street.',
                resultZh: '退出不必等待系统修好。',
                resultEn: 'Leaving need not wait for system repair.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '保留一节不换日车厢',
                labelEn: 'Keep a dateless carriage',
                outcomeZh: '自愿乘客仍可停在旧页。',
                outcomeEn: 'Volunteers may remain on the old page.',
                resultZh: '前进不再吞掉停留权。',
                resultEn: 'Moving forward no longer consumes the right to stay.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'vale',
            introZh: '末班票要求乘客承诺永不返回上一站。',
            introEn: 'The last ticket demands a promise never to revisit the prior stop.',
            promptZh: '这条单向条款应怎样处理？',
            promptEn: 'What should happen to this one-way clause?',
            options: [o({
                labelZh: '删除永久禁止',
                labelEn: 'Delete the permanent ban',
                outcomeZh: '票背出现可重访标记。',
                outcomeEn: 'A revisit mark appears on the ticket.',
                resultZh: '改变主意成为正式权利。',
                resultEn: 'Changing one’s mind becomes a formal right.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '记录重访不重置进度',
                labelEn: 'Preserve progress on return',
                outcomeZh: '旧行李与解锁保持原位。',
                outcomeEn: 'Old luggage and unlocks remain.',
                resultZh: '返程不再惩罚已得成果。',
                resultEn: 'Returning no longer punishes earned progress.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '比较条款三个旧版本',
                labelEn: 'Compare three clause versions',
                outcomeZh: '删改轨迹显示谁加了禁令。',
                outcomeEn: 'Revision history reveals who added the ban.',
                resultZh: '权力来源变得可追溯。',
                resultEn: 'The source of power becomes traceable.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '撕掉整张强制车票',
                labelEn: 'Tear up the coercive ticket',
                outcomeZh: '闸机开放无票出口。',
                outcomeEn: 'The gate opens a ticketless exit.',
                resultZh: '拒绝契约不会困住乘客。',
                resultEn: 'Refusing the contract cannot trap a rider.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '改成可选单程纪念票',
                labelEn: 'Make it an optional keepsake',
                outcomeZh: '收藏票不控制实际路线。',
                outcomeEn: 'The keepsake controls no real route.',
                resultZh: '象征与权限被永久分开。',
                resultEn: 'Symbol and permission remain separate.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        })], '电车终于跨过午夜，同时保留可重访站台与自愿停留车厢。',
        'The tram crosses midnight while keeping revisitable platforms and a voluntary dateless carriage.',
        '翻页但不封路的车票', 'The Ticket That Turns a Page Without Closing a Route',
        '新日期出现后，旧站仍可到达；时间不再用前进换取遗忘。',
        'After the new date arrives, old stations stay reachable; time no longer trades progress for forgetting.', {
            text: b('守望者在站钟旁放下一把不会锁门的发条钥匙。',
                'The watcher leaves a winding key beside the station clock that locks no door.'
                ),
            title: b('只推动分针的钥匙', 'A Key That Moves Only the Minute Hand'),
            body: b('你可以转动它，也可以让这一分钟继续停留；车门保持开放。',
                'Turn it or let this minute remain; the doors stay open.')
        }), ep('tailor-of-pauses', '停顿裁缝铺', 'The Tailor of Pauses', 'ori', 'chime', [
            scene({
                speaker: 'ori',
                introZh: '裁缝把谈话里的停顿缝进衣领，让穿着者多一点思考时间。',
                introEn: 'A tailor sews conversational pauses into collars, giving wearers more time to think.',
                promptZh: '第一件停顿外套该为谁制作？',
                promptEn: 'Who should receive the first pause coat?',
                options: [o({
                    labelZh: '给总被打断的人',
                    labelEn: 'Give it to the interrupted speaker',
                    outcomeZh: '衣领亮起尚未说完。',
                    outcomeEn: 'The collar signals not finished.',
                    resultZh: '发言边界获得可见保护。',
                    resultEn: 'Speaking boundaries gain visible protection.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '做成公共借用款',
                    labelEn: 'Make a shared loan coat',
                    outcomeZh: '任何人都能无理由取用。',
                    outcomeEn: 'Anyone may borrow it without explanation.',
                    resultZh: '思考时间不再需要资格证明。',
                    resultEn: 'Thinking time no longer needs qualification.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '测试不同停顿长度',
                    labelEn: 'Test several pause lengths',
                    outcomeZh: '袖口保存三种可选节奏。',
                    outcomeEn: 'Cuffs store three optional tempos.',
                    resultZh: '差异被保留而非平均。',
                    resultEn: 'Differences remain instead of being averaged.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '拆掉自动催促铃',
                    labelEn: 'Remove the reminder bell',
                    outcomeZh: '衣领不会替旁人催答。',
                    outcomeEn: 'The collar no longer prompts an answer.',
                    resultZh: '沉默不再触发系统压力。',
                    resultEn: 'Silence no longer triggers system pressure.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许随时脱下外套',
                    labelEn: 'Allow immediate removal',
                    outcomeZh: '一枚大扣完成退出。',
                    outcomeEn: 'One large clasp completes exit.',
                    resultZh: '辅助工具不会变成新约束。',
                    resultEn: 'The aid cannot become a new constraint.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            }), scene({
                speaker: 'chime',
                introZh: '一卷慢针线会延长所有对话，包括明确的拒绝。',
                introEn: 'A spool of slow thread extends every conversation, including explicit refusals.',
                promptZh: '怎样避免停顿技术拖延边界？',
                promptEn: 'How can pause technology avoid delaying boundaries?',
                options: [o({
                    labelZh: '拒绝语立即生效',
                    labelEn: 'Make refusal immediate',
                    outcomeZh: '红线绕过延时缝法。',
                    outcomeEn: 'Red thread bypasses delay stitching.',
                    resultZh: '边界优先于讨论节奏。',
                    resultEn: 'Boundaries outrank discussion tempo.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '分别设置思考与结束',
                    labelEn: 'Separate think and end controls',
                    outcomeZh: '两个扣子拥有不同形状。',
                    outcomeEn: 'Two clasps have distinct shapes.',
                    resultZh: '暂停和退出不再被混淆。',
                    resultEn: 'Pause and exit are no longer confused.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '公开线材行为表',
                    labelEn: 'Publish thread behavior',
                    outcomeZh: '每种延时写在布样旁。',
                    outcomeEn: 'Every delay appears beside its swatch.',
                    resultZh: '隐藏机制进入可审查目录。',
                    resultEn: 'Hidden behavior enters a reviewable catalog.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '销毁会拖延拒绝的线',
                    labelEn: 'Destroy the coercive spool',
                    outcomeZh: '问题线材被剪断并计数。',
                    outcomeEn: 'The harmful thread is cut and counted.',
                    resultZh: '不可接受的能力不会作为彩蛋保留。',
                    resultEn: 'The unacceptable power is not kept as an Easter egg.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '改织成无功能围巾',
                    labelEn: 'Weave a harmless scarf',
                    outcomeZh: '花纹留下历史但没有延时。',
                    outcomeEn: 'The pattern keeps history without delay.',
                    resultZh: '记忆与危险功能成功分离。',
                    resultEn: 'Memory separates from dangerous function.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '裁缝铺把思考、拒绝与退出缝成三个独立扣子。',
        'The tailor shop gives thinking, refusal, and leaving three independent clasps.',
        '不会拖慢拒绝的红线', 'The Red Thread That Never Delays No', '停顿获得尊重，同时明确边界永远即时生效。',
        'Pauses receive respect while explicit boundaries always take effect immediately.'
        ), ep('rain-check-bank', '改日券银行', 'The Rain-Check Bank', 'vale', 'courier', [
            scene({
                speaker: 'vale',
                introZh: '银行把延期邀请包装成会累积利息的欠条。',
                introEn: 'The bank packages postponed invitations as debts that accumulate interest.',
                promptZh: '第一张改日券应如何赎回？',
                promptEn: 'How should the first rain check be redeemed?',
                options: [o({
                    labelZh: '清零全部延期利息',
                    labelEn: 'Erase postponement interest',
                    outcomeZh: '欠条数字归零。',
                    outcomeEn: 'The debt counter reaches zero.',
                    resultZh: '稍后再说不再产生义务。',
                    resultEn: 'Maybe later creates no obligation.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '改成无期可选邀请',
                    labelEn: 'Make an undated option',
                    outcomeZh: '券面不再显示倒计时。',
                    outcomeEn: 'The voucher loses its countdown.',
                    resultZh: '机会存在但不会制造紧迫感。',
                    resultEn: 'Opportunity remains without urgency.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '审计利息来源',
                    labelEn: 'Audit the interest rule',
                    outcomeZh: '账本显示规则未经同意上线。',
                    outcomeEn: 'The ledger shows an unapproved rule launch.',
                    resultZh: '违规版本被完整冻结。',
                    resultEn: 'The unauthorized version is frozen intact.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '拒付并关闭账户',
                    labelEn: 'Refuse payment and close',
                    outcomeZh: '出口不要求结清虚构债务。',
                    outcomeEn: 'Exit requires no settlement of invented debt.',
                    resultZh: '离开权胜过银行条款。',
                    resultEn: 'The right to leave outranks bank terms.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '把券赠给公共池',
                    labelEn: 'Donate to an open pool',
                    outcomeZh: '赠予不暴露原持有人。',
                    outcomeEn: 'Donation reveals no prior holder.',
                    resultZh: '机会脱离私人追索链。',
                    resultEn: 'The opportunity leaves its private claim chain.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            }), scene({
                speaker: 'courier',
                introZh: '柜台要求说明延期原因，空白理由会被自动拒绝。',
                introEn: 'The counter demands a reason for delay and rejects blank explanations.',
                promptZh: '哪项改动能保护无需解释的延期？',
                promptEn: 'Which change protects postponement without explanation?',
                options: [o({
                    labelZh: '增加不便说明选项',
                    labelEn: 'Add prefer not to say',
                    outcomeZh: '空白成为有效值。',
                    outcomeEn: 'Blank becomes a valid value.',
                    resultZh: '隐私不再阻塞状态转移。',
                    resultEn: 'Privacy no longer blocks the transition.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '彻底删除原因字段',
                    labelEn: 'Delete the reason field',
                    outcomeZh: '表单只保留新日期或无日期。',
                    outcomeEn: 'The form keeps only a new date or none.',
                    resultZh: '系统停止收集无必要信息。',
                    resultEn: 'The system stops collecting unnecessary data.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '由持有人选择可见范围',
                    labelEn: 'Let holders choose visibility',
                    outcomeZh: '理由可私密、共享或不保存。',
                    outcomeEn: 'Reasons may be private, shared, or unsaved.',
                    resultZh: '每张券拥有独立披露边界。',
                    resultEn: 'Each voucher gains its own disclosure boundary.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '举报强迫说明的柜台',
                    labelEn: 'Report the coercive desk',
                    outcomeZh: '审查期间柜台停止服务。',
                    outcomeEn: 'The desk closes during review.',
                    resultZh: '举报不会取消持有人的券。',
                    resultEn: 'Reporting does not cancel the holder’s voucher.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许一键永久放弃',
                    labelEn: 'Allow permanent release',
                    outcomeZh: '券被归档而非标为失败。',
                    outcomeEn: 'The voucher archives instead of failing.',
                    resultZh: '不再计划也成为中性结局。',
                    resultEn: 'No longer planning becomes a neutral conclusion.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            })
        ], '改日券银行注销利息、理由字段和强制倒计时。',
        'The rain-check bank removes interest, reason fields, and forced countdowns.',
        '没有利息的改日券', 'The Rain Check Without Interest', '延期、放弃与无理由空白都被保存为中性选择。',
        'Postponement, release, and unexplained blanks all persist as neutral choices.', {
            text: b('守望者寄来一张没有日期栏的邀请卡，信封也无需回寄。',
                'The watcher sends an invitation with no date field and no return envelope.'
                ),
            title: b('无需答复的邀请', 'The Invitation That Needs No Reply'),
            body: b('它可以留在抽屉、进入日历或被归档；三种处理都不会改变关系。',
                'Keep it in a drawer, add it to a calendar, or archive it; none changes the relationship.'
                )
        }), ep('hourglass-greenhouse', '沙漏温室', 'The Hourglass Greenhouse', 'chime',
        'patience', [scene({
            speaker: 'chime',
            introZh: '温室用植物剩余寿命给灌溉排队，幼苗永远排在老树之后。',
            introEn: 'The greenhouse queues water by remaining lifespan, leaving seedlings behind old trees.',
            promptZh: '供水顺序应怎样重排？',
            promptEn: 'How should watering be reordered?',
            options: [o({
                labelZh: '按即时缺水程度',
                labelEn: 'Use present thirst',
                outcomeZh: '湿度最低的花盆先接水。',
                outcomeEn: 'The driest soil receives water first.',
                resultZh: '可测需要取代年龄偏见。',
                resultEn: 'Measured need replaces age bias.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '划分独立滴灌区',
                labelEn: 'Create separate drip zones',
                outcomeZh: '树与幼苗各有流量上限。',
                outcomeEn: 'Trees and seedlings gain bounded flows.',
                resultZh: '不同尺度不再争夺单一阀门。',
                resultEn: 'Different scales stop competing for one valve.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '记录一周土壤数据',
                labelEn: 'Record a soil week',
                outcomeZh: '图表暴露午后失水高峰。',
                outcomeEn: 'Charts reveal afternoon drying peaks.',
                resultZh: '供水规则建立在可复核证据上。',
                resultEn: 'Water policy rests on reviewable evidence.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '手动救援枯萎幼苗',
                labelEn: 'Rescue the wilting seedling',
                outcomeZh: '应急壶越过错误队列。',
                outcomeEn: 'An emergency can bypasses the faulty queue.',
                resultZh: '果断干预留下原因和限次。',
                resultEn: 'The intervention keeps its reason and limit.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '让植物选择休眠',
                labelEn: 'Permit dormancy',
                outcomeZh: '休眠盆暂停用水且不被移除。',
                outcomeEn: 'Dormant pots pause water without removal.',
                resultZh: '不生长不再失去温室位置。',
                resultEn: 'Not growing no longer loses greenhouse space.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'patience',
            introZh: '沙漏管理员想加速所有开花，以便在同一天举办展览。',
            introEn: 'The hourglass keeper wants every plant blooming on one exhibition day.',
            promptZh: '温室该如何回应同步开花计划？',
            promptEn: 'How should the greenhouse answer synchronized bloom?',
            options: [o({
                labelZh: '拒绝统一花期',
                labelEn: 'Reject one bloom date',
                outcomeZh: '每株植物保留自己的季节牌。',
                outcomeEn: 'Each plant keeps its season marker.',
                resultZh: '差异不会被活动日程抹平。',
                resultEn: 'An event schedule cannot flatten difference.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '改办持续开放展',
                labelEn: 'Hold a rolling exhibition',
                outcomeZh: '访客每周看到不同花期。',
                outcomeEn: 'Visitors meet different blooms each week.',
                resultZh: '庆祝不再制造一次性错过。',
                resultEn: 'Celebration no longer creates a one-time miss.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '公布催花风险',
                labelEn: 'Publish forcing risks',
                outcomeZh: '说明牌列出温度与光照代价。',
                outcomeEn: 'The sign lists temperature and light costs.',
                resultZh: '决定前先看到真实后果。',
                resultEn: 'Real consequences appear before decisions.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '拆除全棚加速器',
                labelEn: 'Remove the greenhouse accelerator',
                outcomeZh: '总开关进入封存箱。',
                outcomeEn: 'The master switch enters sealed storage.',
                resultZh: '危险便利不被保留为隐藏功能。',
                resultEn: 'Dangerous convenience is not kept hidden.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '只为自愿盆栽提供灯',
                labelEn: 'Offer lamps by opt-in',
                outcomeZh: '独立灯罩不影响邻盆。',
                outcomeEn: 'Individual shades spare neighboring pots.',
                resultZh: '同意按盆保存且随时可撤回。',
                resultEn: 'Consent persists per pot and remains revocable.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '温室改用湿度供水，并把单日花展改成持续开放。',
        'The greenhouse waters by moisture and replaces its one-day show with rolling access.',
        '不同季节的共同温室', 'The Shared Greenhouse of Different Seasons',
        '幼苗、老树与休眠盆不必同步生长，也不会因错过一天失去庆祝。',
        'Seedlings, old trees, and dormant pots need not grow together or lose celebration by missing one day.'
        ), ep('timezone-orchard', '时区果园', 'The Time-Zone Orchard', 'patience', 'sora', [
            scene({
                speaker: 'patience',
                introZh: '果园按总部正午采摘，远区果实总在夜里被叫醒。',
                introEn: 'The orchard harvests at headquarters noon, waking distant fruit at night.',
                promptZh: '采摘钟该怎样尊重不同地方时间？',
                promptEn: 'How should the harvest clock respect local time?',
                options: [o({
                    labelZh: '由每片果林设定时段',
                    labelEn: 'Use local grove windows',
                    outcomeZh: '十二片林地各有自己的绿灯。',
                    outcomeEn: 'Twelve groves gain their own green lights.',
                    resultZh: '中心时间不再覆盖本地边界。',
                    resultEn: 'Central time no longer overwrites local boundaries.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '先保护夜间安静期',
                    labelEn: 'Protect nighttime first',
                    outcomeZh: '夜林自动拒绝采摘车。',
                    outcomeEn: 'Night groves automatically refuse harvest carts.',
                    resultZh: '安静规则优先于产量目标。',
                    resultEn: 'Quiet rules outrank production targets.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '比较成熟度而非钟点',
                    labelEn: 'Measure ripeness, not hours',
                    outcomeZh: '颜色传感器发现三片早熟区。',
                    outcomeEn: 'Color sensors reveal three early groves.',
                    resultZh: '可测需要取代统一日程。',
                    resultEn: 'Measured need replaces a uniform schedule.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '停止本轮错误采摘',
                    labelEn: 'Stop the faulty harvest',
                    outcomeZh: '运输带安全停在空篮处。',
                    outcomeEn: 'The belt stops safely at an empty basket.',
                    resultZh: '果断暂停避免更多夜间打扰。',
                    resultEn: 'A decisive pause prevents more nighttime disturbance.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许果实留在枝头',
                    labelEn: 'Permit fruit to remain',
                    outcomeZh: '未采果不会失去园籍。',
                    outcomeEn: 'Unpicked fruit keeps its orchard place.',
                    resultZh: '不参与不再被写成浪费。',
                    resultEn: 'Nonparticipation is no longer labeled waste.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            }), scene({
                speaker: 'sora',
                introZh: '一只跨区礼篮要求收件人在发件地日落前确认。',
                introEn: 'A cross-zone basket demands confirmation before sunset in the sender’s zone.',
                promptZh: '怎样移除这个隐形倒计时？',
                promptEn: 'How should this hidden countdown be removed?',
                options: [o({
                    labelZh: '显示收件人本地时间',
                    labelEn: 'Show recipient local time',
                    outcomeZh: '期限转换不再隐藏。',
                    outcomeEn: 'The deadline conversion becomes visible.',
                    resultZh: '时区差异进入清楚投影。',
                    resultEn: 'Time-zone difference enters the clear projection.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '取消确认期限',
                    labelEn: 'Remove confirmation expiry',
                    outcomeZh: '礼篮保持可领取状态。',
                    outcomeEn: 'The basket remains claimable.',
                    resultZh: '礼物不会因睡眠而消失。',
                    resultEn: 'A gift cannot disappear because someone slept.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '允许无答复自动归档',
                    labelEn: 'Allow silent archival',
                    outcomeZh: '未确认不会触发追问。',
                    outcomeEn: 'No confirmation triggers no follow-up.',
                    resultZh: '沉默处理成为中性结果。',
                    resultEn: 'Silent handling becomes a neutral result.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '拒绝跨区强制条款',
                    labelEn: 'Reject the cross-zone clause',
                    outcomeZh: '问题批次停止发出。',
                    outcomeEn: 'The affected batch stops shipping.',
                    resultZh: '错误规则不能继续扩散。',
                    resultEn: 'The faulty rule cannot spread further.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '改成随时可重开的卡片',
                    labelEn: 'Use an anytime card',
                    outcomeZh: '卡片没有失效字段。',
                    outcomeEn: 'The card carries no expiry field.',
                    resultZh: '邀请可以以后再看。',
                    resultEn: 'The invitation may be revisited later.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '时区果园采用本地采摘窗，并移除礼篮的发件地倒计时。',
        'The orchard adopts local harvest windows and removes sender-zone countdowns from baskets.',
        '在自己清晨成熟的果实', 'Fruit That Ripens in Its Own Morning',
        '每片果林保留自己的安静期；睡眠、延迟和未采摘都不损失资格。',
        'Each grove keeps its quiet period; sleep, delay, and remaining unpicked lose no eligibility.'
        ), ep('midnight-lost-found', '午夜失物站', 'Midnight Lost and Found', 'courier',
        'tessera', [scene({
            speaker: 'courier',
            introZh: '失物站把未领取物品的记忆当作所有权证明。',
            introEn: 'The lost-and-found treats memories of an item as proof of ownership.',
            promptZh: '如何核验又不索取私人回忆？',
            promptEn: 'How can ownership be checked without demanding private memories?',
            options: [o({
                labelZh: '使用非敏感外观细节',
                labelEn: 'Use nonsensitive appearance',
                outcomeZh: '尺寸与磨损足以匹配。',
                outcomeEn: 'Size and wear provide a match.',
                resultZh: '核验不再依赖情感披露。',
                resultEn: 'Verification no longer depends on emotional disclosure.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '提供多个安全问题',
                labelEn: 'Offer several safe checks',
                outcomeZh: '领取者可跳过任何一题。',
                outcomeEn: 'Claimants may skip any question.',
                resultZh: '证明路径不再只有一个入口。',
                resultEn: 'Proof gains more than one entrance.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '查入库时间与地点',
                labelEn: 'Check intake metadata',
                outcomeZh: '柜台记录吻合公开行程。',
                outcomeEn: 'Desk records match a public route.',
                resultZh: '系统证据减少个人叙述负担。',
                resultEn: 'System evidence reduces personal narrative burden.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '拒绝可疑领取并给申诉',
                labelEn: 'Deny with an appeal path',
                outcomeZh: '物品保持锁定且决定可复核。',
                outcomeEn: 'The item stays locked and the decision remains reviewable.',
                resultZh: '谨慎不会成为无出口拒绝。',
                resultEn: 'Caution does not become refusal without exit.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '转成匿名保管箱',
                labelEn: 'Use anonymous custody',
                outcomeZh: '随机凭证替代身份资料。',
                outcomeEn: 'A random token replaces identity data.',
                resultZh: '暂存不再建立个人画像。',
                resultEn: 'Temporary custody stops building personal profiles.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'tessera',
            introZh: '一只旧围巾被两人同时认领，磨损细节都能对上。',
            introEn: 'Two people claim an old scarf and both know its wear marks.',
            promptZh: '站员应如何处理双重有效主张？',
            promptEn: 'How should the desk handle two valid claims?',
            options: [o({
                labelZh: '暂停交付保留双方状态',
                labelEn: 'Pause delivery and preserve both',
                outcomeZh: '两张申请都进入审查。',
                outcomeEn: 'Both claims enter review.',
                resultZh: '先到不再自动吞掉后来证据。',
                resultEn: 'Arrival order no longer swallows later evidence.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '查找可分离的共同历史',
                labelEn: 'Seek separable shared history',
                outcomeZh: '旧照片显示围巾曾共同使用。',
                outcomeEn: 'An old photo shows shared use.',
                resultZh: '所有权可能性从单人扩展到共同。',
                resultEn: 'Ownership can expand beyond one person.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '邀请双方协商保管',
                labelEn: 'Invite a custody agreement',
                outcomeZh: '轮换、赠予与放弃都可选。',
                outcomeEn: 'Rotation, gift, and release remain options.',
                resultZh: '协议必须双方明确接受。',
                resultEn: 'The agreement requires explicit acceptance from both.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '保持封存直到证据增加',
                labelEn: 'Keep it sealed for now',
                outcomeZh: '围巾不会被站员处置。',
                outcomeEn: 'The desk cannot dispose of the scarf.',
                resultZh: '延迟有复核日且不偏向任何人。',
                resultEn: 'Delay gains a review date and favors neither claimant.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '承认无法确定',
                labelEn: 'Record unresolved ownership',
                outcomeZh: '标签写明未知而非遗弃。',
                outcomeEn: 'The label says unresolved, not abandoned.',
                resultZh: '不确定性获得稳定合法状态。',
                resultEn: 'Uncertainty gains a stable lawful state.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '午夜站改用安全细节与系统记录核验，并给双重主张保留未知状态。',
        'Midnight Lost and Found verifies with safe details and system records while preserving unresolved dual claims.',
        '没有被写成遗弃的围巾', 'The Scarf Not Written as Abandoned',
        '两份可信主张可以同时存在，柜台不替任何人编造确定答案。',
        'Two credible claims may coexist; the desk invents certainty for neither.'), ep(
        'calendar-observatory', '日历天文台', 'Calendar Observatory', 'tessera', 'flora', [
            scene({
                speaker: 'tessera',
                introZh: '望远镜只显示日程最满的人，把空白日误判为没有生活。',
                introEn: 'The telescope shows only crowded calendars and mistakes blank days for no life.',
                promptZh: '观测图应该怎样修正？',
                promptEn: 'How should the observatory correct its chart?',
                options: [o({
                    labelZh: '把空白日标成受保护',
                    labelEn: 'Mark blank days protected',
                    outcomeZh: '空格获得不公开图层。',
                    outcomeEn: 'Blank cells gain a protected layer.',
                    resultZh: '没有安排不再等于缺失。',
                    resultEn: 'No schedule no longer means missing life.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '让用户选择显示密度',
                    labelEn: 'Let users choose density',
                    outcomeZh: '望远镜按人保存可见范围。',
                    outcomeEn: 'The telescope stores visibility per person.',
                    resultZh: '日历共享不再默认全部。',
                    resultEn: 'Calendar sharing no longer defaults to all.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '审计拥挤度算法',
                    labelEn: 'Audit crowding logic',
                    outcomeZh: '算法把重复提醒算成事件。',
                    outcomeEn: 'The algorithm counts reminders as events.',
                    resultZh: '错误指标被版本化修正。',
                    resultEn: 'The faulty metric receives a versioned fix.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '关闭比较星图',
                    labelEn: 'Disable comparison charts',
                    outcomeZh: '个人轨道仍然可用。',
                    outcomeEn: 'Personal orbits remain available.',
                    resultZh: '拒绝排名不影响规划功能。',
                    resultEn: 'Rejecting rank does not affect planning.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '增加无计划轨道',
                    labelEn: 'Add an unplanned orbit',
                    outcomeZh: '自由时间拥有自己的图例。',
                    outcomeEn: 'Open time receives its own legend.',
                    resultZh: '休息不再被系统隐形。',
                    resultEn: 'Rest is no longer invisible to the system.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            }), scene({
                speaker: 'flora',
                introZh: '流星预报要求每个人提前承诺观看，错过会失去收藏章。',
                introEn: 'A meteor forecast demands viewing commitments and removes a badge if missed.',
                promptZh: '怎样改造这场不会等人的观测？',
                promptEn: 'How should this unforgiving observation be redesigned?',
                options: [o({
                    labelZh: '取消错过惩罚',
                    labelEn: 'Remove missed-view penalties',
                    outcomeZh: '收藏章不再回收。',
                    outcomeEn: 'The badge can no longer be reclaimed.',
                    resultZh: '已得内容永远保留。',
                    resultEn: 'Earned content remains forever.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '提供长期回放星图',
                    labelEn: 'Keep a lasting replay chart',
                    outcomeZh: '轨迹没有过期时间。',
                    outcomeEn: 'The trajectory has no expiry.',
                    resultZh: '观看不再受一次时刻绑架。',
                    resultEn: 'Viewing is no longer hostage to one moment.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '公布预测误差范围',
                    labelEn: 'Publish forecast uncertainty',
                    outcomeZh: '云层和时间偏差清楚显示。',
                    outcomeEn: 'Cloud and timing margins appear clearly.',
                    resultZh: '宣传不再承诺必见流星。',
                    resultEn: 'Promotion stops promising a guaranteed meteor.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '拒绝收集观看承诺',
                    labelEn: 'Decline attendance tracking',
                    outcomeZh: '报名表从页面移除。',
                    outcomeEn: 'The signup form leaves the page.',
                    resultZh: '观测不再建立出席画像。',
                    resultEn: 'Observation stops building attendance profiles.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许任何日子补做纪念',
                    labelEn: 'Allow anytime remembrance',
                    outcomeZh: '空白星卡随时可填写。',
                    outcomeEn: 'Blank star cards remain writable anytime.',
                    resultZh: '庆祝不再制造错过恐惧。',
                    resultEn: 'Celebration stops producing fear of missing out.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '天文台保护空白日、关闭强制比较，并让流星纪念永久可回看。',
        'The observatory protects blank days, closes forced comparison, and keeps meteor remembrance permanently available.',
        '不需要出席证明的流星卡', 'The Meteor Card Without Attendance Proof',
        '错过天空不会失去已得收藏，也不会被系统写成缺席者。',
        'Missing the sky removes no earned collection and creates no absence profile.', {
            text: b('守望者将望远镜盖好，留下一张可以任何夜晚打开的星图。',
                'The watcher covers the telescope and leaves a chart that may open on any night.'
                ),
            title: b('没有最后观看日的星图', 'The Chart Without a Last Viewing Day'),
            body: b('云散时看、以后回看或保持折叠都同样有效。',
                'Watch after clouds, revisit later, or keep it folded; all are equally valid.'
                )
        }), ep('secondhand-sunrise', '二手日出店', 'The Secondhand Sunrise Shop', 'flora',
        'bell', [scene({
            speaker: 'flora',
            introZh: '商店出售别人放弃的日出，却把原观者的名字印在光里。',
            introEn: 'The shop sells abandoned sunrises with former viewers’ names printed in the light.',
            promptZh: '怎样让日出再利用而不泄露来源者？',
            promptEn: 'How can a sunrise be reused without exposing its former viewer?',
            options: [o({
                labelZh: '移除私人署名层',
                labelEn: 'Remove the private name layer',
                outcomeZh: '光线只保留天气与色温。',
                outcomeEn: 'The light keeps weather and color temperature only.',
                resultZh: '再利用不再携带身份。',
                resultEn: 'Reuse no longer carries identity.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '征得原观者明确同意',
                labelEn: 'Request explicit permission',
                outcomeZh: '授权范围写明一次展出。',
                outcomeEn: 'Permission names one display scope.',
                resultZh: '同意不能被无限复制。',
                resultEn: 'Consent cannot be copied indefinitely.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '查清光线来源链',
                labelEn: 'Trace the light provenance',
                outcomeZh: '转售记录暴露一次无授权复制。',
                outcomeEn: 'Resale history reveals an unauthorized copy.',
                resultZh: '来源碰撞被封存并调查。',
                resultEn: 'The provenance collision is frozen and investigated.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '销毁泄露身份的副本',
                labelEn: 'Destroy the revealing copy',
                outcomeZh: '问题光片进入不可恢复熔炉。',
                outcomeEn: 'The harmful light plate enters irreversible melting.',
                resultZh: '隐私优先于收藏完整。',
                resultEn: 'Privacy outranks collection completeness.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '制作全新虚构日出',
                labelEn: 'Create a fictional sunrise',
                outcomeZh: '画布不对应任何真实清晨。',
                outcomeEn: 'The canvas matches no real morning.',
                resultZh: '创作替代对私人记忆的索取。',
                resultEn: 'Creation replaces extraction from private memory.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'bell',
            introZh: '一名顾客想退回日出，因为它没有让坏心情立刻消失。',
            introEn: 'A customer returns a sunrise because it did not erase a bad mood immediately.',
            promptZh: '店员该如何回应这项不可能承诺？',
            promptEn: 'How should the clerk answer an impossible promise?',
            options: [o({
                labelZh: '承认商品说明夸大',
                labelEn: 'Acknowledge the false claim',
                outcomeZh: '广告删除疗愈保证。',
                outcomeEn: 'The advertisement loses its healing guarantee.',
                resultZh: '情绪不再被商品化承诺操纵。',
                resultEn: 'Emotion is no longer manipulated by product promises.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '无条件接受退货',
                labelEn: 'Accept the return freely',
                outcomeZh: '顾客不必描述私人感受。',
                outcomeEn: 'The customer need not describe private feelings.',
                resultZh: '退款路径不收集健康信息。',
                resultEn: 'The return path collects no health information.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '审查全部宣传版本',
                labelEn: 'Review every advertisement',
                outcomeZh: '三处同类话术被发现。',
                outcomeEn: 'Three similar claims are found.',
                resultZh: '纠正覆盖完整来源而非单张海报。',
                resultEn: 'The correction covers provenance, not one poster.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '暂停销售问题系列',
                labelEn: 'Pause the product line',
                outcomeZh: '货架显示安全审查中。',
                outcomeEn: 'The shelf states safety review.',
                resultZh: '果断暂停阻止更多误导。',
                resultEn: 'A decisive pause prevents further deception.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '改成无效果收藏卡',
                labelEn: 'Offer a no-effect keepsake',
                outcomeZh: '卡片只描述颜色与构图。',
                outcomeEn: 'The card describes color and composition only.',
                resultZh: '审美价值与情绪保证被分开。',
                resultEn: 'Aesthetic value separates from mood guarantees.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '日出店移除私人署名与情绪疗效承诺，只保留可追溯的光色收藏。',
        'The sunrise shop removes private names and mood claims, keeping only traceable light and color.',
        '不保证心情的日出', 'The Sunrise That Promises No Mood', '它可以美丽、普通或不合时宜；任何感受都不影响退货与关系。',
        'It may feel beautiful, ordinary, or mistimed; no feeling affects returns or relationships.'
        ), ep('city-wide-snooze', '全城稍后提醒', 'The Citywide Snooze', 'bell', 'keeper', [
            scene({
                speaker: 'bell',
                introZh: '全城提醒器每被推迟一次就提高音量，最终穿透安静时段。',
                introEn: 'The city reminder grows louder after every snooze until it pierces quiet hours.',
                promptZh: '怎样修复会报复延期的提醒器？',
                promptEn: 'How should a reminder that retaliates against delay be repaired?',
                options: [o({
                    labelZh: '推迟不改变音量',
                    labelEn: 'Keep snooze volume stable',
                    outcomeZh: '下一次提示保持原级。',
                    outcomeEn: 'The next cue keeps its level.',
                    resultZh: '延期不再触发惩罚升级。',
                    resultEn: 'Delay no longer triggers punitive escalation.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '按人保存安静时段',
                    labelEn: 'Honor individual quiet hours',
                    outcomeZh: '提示进入收件箱而不推送。',
                    outcomeEn: 'The cue enters inbox without a push.',
                    resultZh: '安静边界覆盖全城默认。',
                    resultEn: 'Quiet boundaries override the city default.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '公开提醒状态机',
                    labelEn: 'Publish the reminder states',
                    outcomeZh: '每次转换与原因可查。',
                    outcomeEn: 'Every transition and reason is visible.',
                    resultZh: '隐藏升级逻辑进入审计。',
                    resultEn: 'Hidden escalation enters audit.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '提供永久关闭按钮',
                    labelEn: 'Add permanent disable',
                    outcomeZh: '关闭无需确认第二次。',
                    outcomeEn: 'Disabling needs no second confirmation.',
                    resultZh: '退出不再面对挽留流程。',
                    resultEn: 'Exit no longer faces a retention flow.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '改为用户主动查看板',
                    labelEn: 'Use a pull-only notice board',
                    outcomeZh: '系统不再主动发声。',
                    outcomeEn: 'The system stops making unsolicited sound.',
                    resultZh: '注意力由居民自己分配。',
                    resultEn: 'Residents regain control of attention.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            }), scene({
                speaker: 'keeper',
                introZh: '维护员提议用关系等级决定谁能关闭全城提醒。',
                introEn: 'A maintainer proposes relationship level determine who may silence city reminders.',
                promptZh: '权限应依据什么而不是亲密度？',
                promptEn: 'What should permission use instead of intimacy?',
                options: [o({
                    labelZh: '每人只控制自己的提醒',
                    labelEn: 'Use personal scope only',
                    outcomeZh: '账户无法修改他人设置。',
                    outcomeEn: 'Accounts cannot alter others’ settings.',
                    resultZh: '权限回到最小所有权。',
                    resultEn: 'Permission returns to minimal ownership.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '公共警报需多人确认',
                    labelEn: 'Require quorum for public alerts',
                    outcomeZh: '两类角色共同签署变更。',
                    outcomeEn: 'Two roles sign public changes.',
                    resultZh: '共享权力获得明确制衡。',
                    resultEn: 'Shared power gains explicit checks.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '审计旧管理员操作',
                    labelEn: 'Audit prior admin actions',
                    outcomeZh: '日志显示一次越权静音。',
                    outcomeEn: 'Logs reveal one unauthorized mute.',
                    resultZh: '越权事件保留且触发复核。',
                    resultEn: 'The overreach persists and triggers review.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '撤销亲密度权限映射',
                    labelEn: 'Remove the intimacy mapping',
                    outcomeZh: '关系轴不再进入授权查询。',
                    outcomeEn: 'Relationship axes leave authorization queries.',
                    resultZh: '情感数据与安全权限永久分离。',
                    resultEn: 'Emotional data separates permanently from security permission.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许居民举报公共噪声',
                    labelEn: 'Permit public-noise reports',
                    outcomeZh: '举报不降低关系或资格。',
                    outcomeEn: 'Reports reduce no relationship or eligibility.',
                    resultZh: '监督成为中性安全行为。',
                    resultEn: 'Oversight becomes a neutral safety action.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            })
        ], '全城提醒改为个人范围、安静入箱和可永久关闭，关系等级退出权限系统。',
        'The city reminder adopts personal scope, quiet inbox delivery, and permanent disable while relationship level leaves authorization.',
        '不会因稍后而变响的提醒', 'The Reminder That Never Gets Louder After Snooze',
        '延期、静音、关闭和举报都成为无惩罚状态，居民重新拥有注意力。',
        'Delay, mute, disable, and report become penalty-free states, returning attention to residents.', {
            text: b('守望者将自己的提醒设成只读收件箱，并公开这项设置。',
                'The watcher moves their own reminder to inbox-only and publishes that setting.'
                ),
            title: b('先约束自己的铃', 'Silencing One’s Own Bell First'),
            body: b('这不是要求全城跟随，只证明安静模式可以正常工作。',
                'This asks no one to follow; it only proves quiet mode works.')
        }), ep('borrowed-hour-court', '借时法庭', 'The Court of Borrowed Hours', 'keeper',
        'lumen', [scene({
            speaker: 'keeper',
            introZh: '法庭审理谁欠了谁的时间，却把未回复消息自动算成债务。',
            introEn: 'The court tries time debts and automatically counts unanswered messages as owed time.',
            promptZh: '第一项判例应如何推翻？',
            promptEn: 'How should the first precedent be overturned?',
            options: [o({
                labelZh: '宣布未回复不构成债',
                labelEn: 'Rule silence creates no debt',
                outcomeZh: '旧案获得统一撤销标记。',
                outcomeEn: 'Old cases receive reversal markers.',
                resultZh: '沉默不再产生赔偿义务。',
                resultEn: 'Silence no longer creates compensation duties.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '逐案恢复被扣时间',
                labelEn: 'Restore deducted time per case',
                outcomeZh: '受影响账本按来源返还。',
                outcomeEn: 'Affected ledgers restore by provenance.',
                resultZh: '修复保持可追溯且不重复。',
                resultEn: 'Repair stays traceable and nonduplicative.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '邀请双方选择是否调解',
                labelEn: 'Offer optional mediation',
                outcomeZh: '拒绝调解不会影响裁定。',
                outcomeEn: 'Declining mediation does not affect judgment.',
                resultZh: '合作不再成为正义门票。',
                resultEn: 'Cooperation is no longer a ticket to justice.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '暂停自动债务引擎',
                labelEn: 'Suspend the debt engine',
                outcomeZh: '所有新案转为人工只读审查。',
                outcomeEn: 'New cases enter read-only human review.',
                resultZh: '果断停机阻止继续扣除。',
                resultEn: 'A decisive shutdown prevents further deductions.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '删除情绪关系证据',
                labelEn: 'Exclude intimacy evidence',
                outcomeZh: '关系等级不再出现在卷宗。',
                outcomeEn: 'Relationship level leaves case files.',
                resultZh: '亲密度不能改变权利。',
                resultEn: 'Intimacy can no longer alter rights.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'lumen',
            introZh: '最后一案要求用未来陪伴抵偿过去等待。',
            introEn: 'The final case demands future companionship as payment for past waiting.',
            promptZh: '法庭应留下什么长期结论？',
            promptEn: 'What lasting conclusion should the court enter?',
            options: [o({
                labelZh: '禁止以陪伴结算',
                labelEn: 'Ban companionship settlement',
                outcomeZh: '判决删除未来在场条款。',
                outcomeEn: 'The judgment deletes future-presence terms.',
                resultZh: '关系不能成为可执行抵押。',
                resultEn: 'Relationship cannot become enforceable collateral.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '承认等待者的感受',
                labelEn: 'Acknowledge feelings without debt',
                outcomeZh: '记录区分感受与权利。',
                outcomeEn: 'The record separates feelings from rights.',
                resultZh: '被听见不再等于获得控制。',
                resultEn: 'Being heard no longer grants control.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '保存条款来源供教育',
                labelEn: 'Archive the clause provenance',
                outcomeZh: '旧范本进入封闭教学库。',
                outcomeEn: 'The old template enters a closed teaching archive.',
                resultZh: '危险历史可研究但不可复用。',
                resultEn: 'Dangerous history remains researchable but unusable.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '当庭释放所有相关人',
                labelEn: 'Release every bound party',
                outcomeZh: '门禁立即撤销案件限制。',
                outcomeEn: 'Access controls immediately remove case restrictions.',
                resultZh: '自由不等待季终审批。',
                resultEn: 'Freedom does not wait for season-end approval.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '建立无债时间宪章',
                labelEn: 'Adopt a debt-free time charter',
                outcomeZh: '十二区共同签署自愿原则。',
                outcomeEn: 'Twelve districts sign voluntary-time principles.',
                resultZh: '全城获得可审计新基线。',
                resultEn: 'The city gains a reviewable new baseline.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '借时法庭撤销沉默债务，返还被扣时间，并禁止用未来陪伴抵偿等待。',
        'The court reverses silence debts, restores deducted time, and bans future companionship as payment for waiting.',
        '无债时间宪章', 'The Debt-Free Time Charter', '回应、等待和陪伴重新成为自愿行为；关系轴从司法权利中彻底移除。',
        'Replying, waiting, and companionship become voluntary again, and relationship axes leave legal rights entirely.', {
            text: b('守望者在旁听席交出自己的优先通行证，让判决不受身份影响。',
                'The watcher surrenders their priority pass in the gallery so status cannot influence judgment.'
                ),
            title: b('交回法庭的优先证', 'The Priority Pass Returned to Court'),
            body: b('这张证件只作为权力被撤回的审计记录，不再打开任何门。',
                'The pass remains only as an audit of withdrawn power and opens no door.'
                )
        })],
    endingRouter: b('借来的时光回到各自持有人手中，城市依照已建立的边界选择五种长期节奏。',
        'Borrowed hours return to their holders, and the city chooses among five lasting rhythms shaped by established boundaries.'
        ),
    endings: [{
        id: 'city-of-borrowed-hours.ending.constellation',
        key: 'constellation',
        route: 'hours.ending.constellation',
        priority: 50,
        condition: {
            op: 'axis',
            axis: 'harmony',
            minimum: 16
        },
        text: b('多时区广场允许同行者在不同日历里保持联系，不要求同时抵达。',
            'The many-clock plaza keeps companions connected across calendars without requiring simultaneous arrival.'
            )
    }, {
        id: 'city-of-borrowed-hours.ending.beacon',
        key: 'beacon',
        route: 'hours.ending.beacon',
        priority: 40,
        condition: {
            op: 'axis',
            axis: 'trust',
            minimum: 16
        },
        text: b('稳定钟塔只报告真实状态，从不把稍后、静音或离线写成失约。',
            'The steady clock tower reports honest state and never calls delay, mute, or offline a broken promise.'
            )
    }, {
        id: 'city-of-borrowed-hours.ending.archive',
        key: 'archive',
        route: 'hours.ending.archive',
        priority: 30,
        condition: {
            op: 'axis',
            axis: 'curiosity',
            minimum: 16
        },
        text: b('明日馆保留可擦写标签，未来版本能被研究却不能冒充命令。',
            'Tomorrow Museum keeps erasable labels so future versions may be studied but never impersonate commands.'
            )
    }, {
        id: 'city-of-borrowed-hours.ending.brave',
        key: 'brave',
        route: 'hours.ending.brave',
        priority: 20,
        condition: {
            op: 'axis',
            axis: 'courage',
            minimum: 16
        },
        text: b('午夜电车跨过旧循环，同时为每位乘客保留无惩罚返程。',
            'The midnight tram crosses its old loop while keeping a penalty-free return for every rider.'
            )
    }, {
        id: 'city-of-borrowed-hours.ending.hearth',
        key: 'hearth',
        route: 'hours.ending.hearth',
        priority: 1,
        condition: {
            op: 'always'
        },
        text: b('温室关闭总沙漏，让休眠、停留与未安排的一天成为完整生活。',
            'The greenhouse closes its master hourglass, making dormancy, staying, and an unscheduled day complete life.'
            )
    }]
};
for (const current of source.episodes) {
    const additions = deepening[current.slug];
    if (!Array.isArray(additions) || additions.length !== 2) {
        throw new TypeError(`Season Three deepening is incomplete for ${current.slug}`);
    }
    current.scenes.push(...additions);
}
module.exports = compileAuthoredSeason(source);