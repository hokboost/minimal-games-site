'use strict';

const {
    option,
    scene
} = require('./authored-helpers');
module.exports = {
    'harbor-after-rain': [scene({
        speaker: 'lumen',
        introZh: '旧防波堤下浮出一排没有登记年份的铜铃，每只铃只在不同潮位发声。',
        introEn: 'A row of undated copper bells surfaces beneath the old breakwater, each sounding at a different tide.',
        promptZh: '这些没有年代的声音该怎样进入港口档案？',
        promptEn: 'How should these undated voices enter the harbor archive?',
        options: [option({
            labelZh: '按潮位记录',
            labelEn: 'Catalog by tide level',
            outcomeZh: '测杆为每次铃声留下水位刻度。',
            outcomeEn: 'A gauge gives every chime a water-level mark.',
            resultZh: '档案先保存可测条件，不把潮位擅写成年份。',
            resultEn: 'The archive keeps measurable conditions without inventing a year from the tide.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '邀请旧船工辨音',
            labelEn: 'Invite retired boatkeepers',
            outcomeZh: '三人给出不同年代，且都署上姓名。',
            outcomeEn: 'Three people offer different eras and sign their accounts.',
            resultZh: '相互冲突的口述并列保留，没有一份被系统升为唯一答案。',
            resultEn: 'Conflicting testimony remains side by side, with none promoted as the sole answer.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '取样铜锈层',
            labelEn: 'Sample the patina',
            outcomeZh: '极小碎屑只确认铃铸于旧工艺时期。',
            outcomeEn: 'A tiny sample confirms only an older casting method.',
            resultZh: '实验结论被限制在能证明的范围，未知年代继续保持未知。',
            resultEn: 'The finding stays within what it proves, and the unknown date remains unknown.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂缓打捞',
            labelEn: 'Delay recovery',
            outcomeZh: '铃列留在原位，航道旁新增安全浮标。',
            outcomeEn: 'The bells stay in place while a safety buoy marks the channel.',
            resultZh: '不确定的文物没有被仓促移动，暂停也得到明确复核日期。',
            resultEn: 'The uncertain artifacts avoid a rushed move, and the pause receives a review date.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '制作无声拓片',
            labelEn: 'Make silent rubbings',
            outcomeZh: '纸面留下纹样，却不要求铃再次受力。',
            outcomeEn: 'Paper keeps the patterns without asking the bells to bear another strike.',
            resultZh: '研究副本开放给后来者，原件的安静成为长期保护条件。',
            resultEn: 'Study copies open to future readers while silence becomes a lasting protection for the originals.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'sora',
        introZh: '港务室找到一把能同时打开三座旧仓库的钥匙，但其中一座已改作避雨站。',
        introEn: 'The harbor office finds one key for three old warehouses, one now serving as a rain shelter.',
        promptZh: '这把跨越旧用途的钥匙应该归谁管理？',
        promptEn: 'Who should manage a key that crosses old and current uses?',
        options: [option({
            labelZh: '拆分权限而非钥匙',
            labelEn: 'Separate permissions, not metal',
            outcomeZh: '门锁获得独立授权名单。',
            outcomeEn: 'Each door receives its own authorization list.',
            resultZh: '同一把钥匙不再意味着对三处空间拥有同等进入权。',
            resultEn: 'One key no longer implies equal entry rights to all three spaces.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让避雨站自行保管',
            labelEn: 'Give shelter custody',
            outcomeZh: '值守者只持有自己那扇门的副钥匙。',
            outcomeEn: 'Shelter stewards hold a copy limited to their door.',
            resultZh: '当前使用者获得真实控制，而旧港务记录仍保留来源。',
            resultEn: 'Current users gain real control while old harbor records keep provenance.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '绘制开锁审计图',
            labelEn: 'Draw an access audit map',
            outcomeZh: '三条历史开锁线各自标注时间与目的。',
            outcomeEn: 'Three historical access paths gain time and purpose labels.',
            resultZh: '异常不再隐藏在万能钥匙名下，后续访问都可解释。',
            resultEn: 'Anomalies no longer hide beneath the master-key label, and later access stays explainable.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用总钥匙',
            labelEn: 'Retire the master key',
            outcomeZh: '钥匙封入透明盒，新锁先从避雨站更换。',
            outcomeEn: 'The key enters a clear case and replacement begins at the shelter.',
            resultZh: '一项果断停用消除越权风险，却没有删除旧钥匙的历史。',
            resultEn: 'A decisive retirement removes overreach without deleting the key’s history.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '设置双人开启',
            labelEn: 'Require two keepers',
            outcomeZh: '需要两名不同职责的人共同确认。',
            outcomeEn: 'Two people with different roles must confirm together.',
            resultZh: '高影响进入获得相互制衡，普通避雨入口仍保持自由可达。',
            resultEn: 'High-impact access gains mutual checks while ordinary shelter entry stays freely reachable.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'ferry-of-echoes': [scene({
        speaker: 'sora',
        introZh: '渡轮储物柜里有七只贴错码头的行李箱，箱主只留下虚构图案作为识别。',
        introEn: 'Seven lockers hold luggage tagged for the wrong docks, with fictional symbols as the only identifiers.',
        promptZh: '怎样归还箱子而不要求乘客公开更多身份？',
        promptEn: 'How can the cases return without demanding more identity?',
        options: [option({
            labelZh: '用图案配对',
            labelEn: 'Match the symbols',
            outcomeZh: '候船区展示图案而不展示姓名。',
            outcomeEn: 'The waiting room displays symbols without names.',
            resultZh: '最低必要信息足以完成归还，渡轮不再索取额外证明。',
            resultEn: 'Minimum necessary information completes the return without extra proof.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供私密领取码',
            labelEn: 'Issue private claim codes',
            outcomeZh: '每位认领者获得一次性短码。',
            outcomeEn: 'Each claimant receives a one-use short code.',
            resultZh: '领取记录可审计，却不会把虚构图案连到公开身份。',
            resultEn: 'The claim stays auditable without linking fictional symbols to public identity.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '检查装船顺序',
            labelEn: 'Review loading order',
            outcomeZh: '时间线解释了标签在暴雨中整体错位。',
            outcomeEn: 'The timeline explains how all tags shifted during the storm.',
            resultZh: '系统修正批次错误，而不是把责任推给逐个乘客。',
            resultEn: 'The system corrects a batch failure instead of blaming individual passengers.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '冻结柜门等待确认',
            labelEn: 'Freeze locker access',
            outcomeZh: '柜门保持关闭并写明重新开放条件。',
            outcomeEn: 'Lockers remain shut with reopening conditions posted.',
            resultZh: '保护措施有结束点，暂停领取不会变成永久没收。',
            resultEn: 'The safeguard has an endpoint, so paused claims cannot become permanent seizure.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让乘客选择放弃认领',
            labelEn: 'Offer voluntary release',
            outcomeZh: '两只箱子被明确捐给虚构道具库。',
            outcomeEn: 'Two cases are voluntarily released to the fictional prop archive.',
            resultZh: '放弃来自主动选择，未回应的箱子仍受到同等保护。',
            resultEn: 'Release comes from an active choice, while unanswered cases retain equal protection.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'mika',
        introZh: '回声甲板会把一句道歉重复到听者回应为止，哪怕听者已经离船。',
        introEn: 'The echo deck repeats an apology until the listener responds, even after that listener has left.',
        promptZh: '怎样阻止一条道歉变成持续催促？',
        promptEn: 'How should an apology be prevented from becoming persistent pressure?',
        options: [option({
            labelZh: '只投递一次',
            labelEn: 'Deliver once',
            outcomeZh: '甲板记录已送达后停止回声。',
            outcomeEn: 'The deck stops after recording one delivery.',
            resultZh: '表达与索取回应被拆开，道歉不再占用他人的安静。',
            resultEn: 'Expression separates from demanding an answer, preserving the other person’s quiet.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让收件人控制回放',
            labelEn: 'Give playback control',
            outcomeZh: '回声按钮只出现在收件人的私人面板。',
            outcomeEn: 'A replay control appears only on the recipient’s private panel.',
            resultZh: '是否重听由接收者决定，发件人看不到打开次数。',
            resultEn: 'The recipient chooses whether to listen again, and the sender sees no open count.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '保留发送上下文',
            labelEn: 'Keep sending context',
            outcomeZh: '日志写明时间、频道与一次性状态。',
            outcomeEn: 'The log records time, channel, and one-shot status.',
            resultZh: '审计能解释发生过什么，却不猜测沉默的含义。',
            resultEn: 'Audit explains what happened without guessing what silence means.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '立即关闭强制循环',
            labelEn: 'Disable the loop now',
            outcomeZh: '旧回声被移入只读检修区。',
            outcomeEn: 'Old echoes move into a read-only maintenance area.',
            resultZh: '有害默认值被果断停用，历史仍可供修复团队检查。',
            resultEn: 'The harmful default stops decisively while history remains available for repair.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '增加撤回窗口',
            labelEn: 'Add a withdrawal window',
            outcomeZh: '发件人可在未读取前撤回那句话。',
            outcomeEn: 'The sender may withdraw the sentence before it is read.',
            resultZh: '双方都获得边界控制，撤回也不会留下公开羞辱标记。',
            resultEn: 'Both sides gain boundary control, and withdrawal leaves no public shame marker.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'salt-page-library': [scene({
        speaker: 'mika',
        introZh: '一册航海索引把“未归还”与“无法联系”合并为同一个红色状态。',
        introEn: 'A voyage index merges not returned and unreachable into one red status.',
        promptZh: '怎样拆开这两个含义而不制造新的惩罚标签？',
        promptEn: 'How should the meanings be separated without creating new punitive labels?',
        options: [option({
            labelZh: '改为事实字段',
            labelEn: 'Use factual fields',
            outcomeZh: '页面分别显示归还状态与联络状态。',
            outcomeEn: 'The page shows return and contact states separately.',
            resultZh: '系统停止从无法联系推断占有或过错。',
            resultEn: 'The system stops inferring possession or fault from unavailable contact.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许隐藏联络状态',
            labelEn: 'Make contact state private',
            outcomeZh: '读者只看见馆藏是否可借。',
            outcomeEn: 'Readers see only whether the item is available.',
            resultZh: '运营所需信息与公开展示分离，隐私成为默认。',
            resultEn: 'Operational data separates from public display, making privacy the default.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追溯红标来源',
            labelEn: 'Trace the red label',
            outcomeZh: '旧规则来自一次临时停电补丁。',
            outcomeEn: 'The old rule came from a temporary outage patch.',
            resultZh: '临时设计被标明来源和期限，不再悄悄变成永久政策。',
            resultEn: 'The temporary design gains provenance and expiry instead of silently becoming policy.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂停红标展示',
            labelEn: 'Suspend the red marker',
            outcomeZh: '界面先恢复中性可用状态。',
            outcomeEn: 'The interface returns to a neutral availability state.',
            resultZh: '伤害性颜色立即退出，同时保留修复前快照供审计。',
            resultEn: 'The harmful color leaves immediately while a pre-fix snapshot remains for audit.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '请受影响者审阅新词',
            labelEn: 'Invite affected review',
            outcomeZh: '反馈选择“待确认”作为中性措辞。',
            outcomeEn: 'Reviewers choose pending confirmation as neutral wording.',
            resultZh: '被标签的人参与规则修订，却不必披露私人原因。',
            resultEn: 'People affected help revise the rule without disclosing private reasons.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'ori',
        introZh: '修复台收到一页被盐水粘住的双面日记，分开会损伤其中一面。',
        introEn: 'The repair desk receives a two-sided journal page fused by saltwater; separation would damage one side.',
        promptZh: '两面都重要时，修复应从哪里开始？',
        promptEn: 'Where should repair begin when both sides matter?',
        options: [option({
            labelZh: '先做透光扫描',
            labelEn: 'Begin with transmitted-light scans',
            outcomeZh: '两面文字以不同角度形成副本。',
            outcomeEn: 'Both texts form copies under different angles.',
            resultZh: '研究先从无损方法开始，原页没有为便利被牺牲。',
            resultEn: 'Study begins without damage, and the original is not sacrificed for convenience.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保存双面并列视图',
            labelEn: 'Keep a paired view',
            outcomeZh: '读者可切换方向而不宣称正反主次。',
            outcomeEn: 'Readers switch sides without declaring one primary.',
            resultZh: '界面长期承认两面同等重要。',
            resultEn: 'The interface permanently recognizes both sides as equally important.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '测试边角盐度',
            labelEn: 'Test a margin sample',
            outcomeZh: '数据只回答是否可能安全分离。',
            outcomeEn: 'A margin sample answers only whether separation may be safe.',
            resultZh: '实验不会被夸大成修复授权，下一步仍需单独决定。',
            resultEn: 'The test is not inflated into permission to repair; the next step remains separate.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝不可逆剥离',
            labelEn: 'Decline irreversible separation',
            outcomeZh: '修复单写明当前技术不足。',
            outcomeEn: 'The work order records current technical limits.',
            resultZh: '承认做不到保护了两面，也为未来方法留下机会。',
            resultEn: 'Admitting limits protects both sides and leaves room for a future method.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '征集两种阅读摘要',
            labelEn: 'Collect two reading summaries',
            outcomeZh: '两位读者各自描述可见部分。',
            outcomeEn: 'Two readers summarize the portions they can see.',
            resultZh: '局部理解并列进入目录，没有摘要冒充完整原文。',
            resultEn: 'Partial readings enter side by side and neither summary impersonates the whole.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'lighthouse-kitchen': [scene({
        speaker: 'ori',
        introZh: '灯塔厨房的旧菜单用“大家都喜欢”掩盖了从未被询问的三张空座。',
        introEn: 'The lighthouse menu says everyone likes this, hiding three empty seats that were never asked.',
        promptZh: '新菜单怎样避免把缺席写成同意？',
        promptEn: 'How should the new menu avoid treating absence as consent?',
        options: [option({
            labelZh: '删除全体断言',
            labelEn: 'Remove the universal claim',
            outcomeZh: '菜单只写实际收到的选择。',
            outcomeEn: 'The menu lists only choices actually received.',
            resultZh: '未知偏好保持未知，空座不再被代表。',
            resultEn: 'Unknown preferences remain unknown, and empty seats are no longer spoken for.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供可跳过投票',
            labelEn: 'Offer a skippable poll',
            outcomeZh: '未投票不会自动归入任何选项。',
            outcomeEn: 'No response falls into no option automatically.',
            resultZh: '参与和缺席被明确分开，结果旁显示回答范围。',
            resultEn: 'Participation separates from absence, and the result states its response scope.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '查找措辞来源',
            labelEn: 'Trace the wording',
            outcomeZh: '原句来自一次临时庆功宴。',
            outcomeEn: 'The sentence came from a one-time celebration dinner.',
            resultZh: '特殊场景不再被复制成永久共同偏好。',
            resultEn: 'A special occasion no longer masquerades as a permanent group preference.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂停共享菜单',
            labelEn: 'Pause the shared menu',
            outcomeZh: '厨房先开放独立点选卡。',
            outcomeEn: 'The kitchen opens individual selection cards first.',
            resultZh: '停止错误概括不会让任何人失去基本用餐入口。',
            resultEn: 'Stopping a false summary removes no one’s basic dining access.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留空白选项',
            labelEn: 'Keep an explicit blank',
            outcomeZh: '座位卡允许稍后决定或始终不填。',
            outcomeEn: 'Seat cards allow later choice or permanent blank.',
            resultZh: '空白成为合法状态，不会被系统追着补全。',
            resultEn: 'Blank becomes a valid state that the system does not chase.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'vale',
        introZh: '冷藏室警示灯只能显示一种颜色，维修员因此看不出门是开启、故障还是静音。',
        introEn: 'The cold-room warning uses one color, leaving staff unable to distinguish open, fault, and muted states.',
        promptZh: '怎样重做提示而不依赖颜色？',
        promptEn: 'How should the cue be rebuilt without relying on color?',
        options: [option({
            labelZh: '加入形状与文字',
            labelEn: 'Add shape and text',
            outcomeZh: '三种状态获得独立图标和短标签。',
            outcomeEn: 'Each state gains a distinct icon and short label.',
            resultZh: '关键信息可由多种感官读取，颜色只剩装饰作用。',
            resultEn: 'Critical information becomes multimodal while color remains decorative.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供可选声音',
            labelEn: 'Offer optional audio',
            outcomeZh: '低声提示可单独关闭并调节。',
            outcomeEn: 'A soft cue can be adjusted or disabled independently.',
            resultZh: '可访问性增加选择而不是制造新的强制刺激。',
            resultEn: 'Accessibility adds choice instead of another compulsory stimulus.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '记录误读事件',
            labelEn: 'Document misread states',
            outcomeZh: '维修簿区分界面问题与设备故障。',
            outcomeEn: 'The maintenance log separates interface confusion from hardware failure.',
            resultZh: '修复依据来自真实失效路径，不责怪使用者。',
            resultEn: 'The repair follows actual failure paths instead of blaming users.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '先停用含糊警示',
            labelEn: 'Disable the ambiguous cue',
            outcomeZh: '门旁改用机械状态牌过渡。',
            outcomeEn: 'A mechanical status card serves during transition.',
            resultZh: '不可靠信号立即退出关键路径。',
            resultEn: 'An unreliable signal leaves the critical path immediately.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让值守者试用三版',
            labelEn: 'Let stewards test three versions',
            outcomeZh: '不同感官需求都进入反馈表。',
            outcomeEn: 'Different sensory needs enter the review.',
            resultZh: '最终设计由多种使用方式共同塑造。',
            resultEn: 'The final design is shaped by multiple ways of using it.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'anchor-garden': [scene({
        speaker: 'vale',
        introZh: '花圃把每株新苗拴在旧锚上，风停后绳结仍限制根系生长。',
        introEn: 'The garden ties every new seedling to an old anchor, and the knots still restrict roots after the wind stops.',
        promptZh: '保护措施何时应该解除？',
        promptEn: 'When should a protective measure be removed?',
        options: [option({
            labelZh: '写明解除条件',
            labelEn: 'Define release conditions',
            outcomeZh: '绳牌标出风速与复核日期。',
            outcomeEn: 'Tags name wind speed and a review date.',
            resultZh: '临时保护不再无限延长。',
            resultEn: 'Temporary protection can no longer extend forever.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让苗圃逐株选择',
            labelEn: 'Review each seedling',
            outcomeZh: '根系稳定的幼苗先获得松绑。',
            outcomeEn: 'Seedlings with stable roots are released first.',
            resultZh: '差异被尊重，统一时间表不再压过实际需要。',
            resultEn: 'Differences are respected instead of forcing one schedule over actual needs.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较锚绳痕迹',
            labelEn: 'Inspect anchor marks',
            outcomeZh: '磨损数据指出两处过紧绳结。',
            outcomeEn: 'Wear data identifies two overly tight knots.',
            resultZh: '花圃根据证据修订结法，不把损伤解释为幼苗脆弱。',
            resultEn: 'The garden revises knotting from evidence instead of calling the seedlings weak.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '立即剪开危险绳',
            labelEn: 'Cut hazardous ties',
            outcomeZh: '两株受压幼苗先恢复自由。',
            outcomeEn: 'Two compressed seedlings regain freedom first.',
            resultZh: '紧急解除保护了生命，旧绳仍留样供复盘。',
            resultEn: 'Urgent release protects life while samples remain for review.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '改用可自行脱落结',
            labelEn: 'Use self-releasing knots',
            outcomeZh: '新绳在根茎扩张时自动松开。',
            outcomeEn: 'New ties loosen as stems expand.',
            resultZh: '安全机制开始服从成长，而不是要求成长服从机制。',
            resultEn: 'The safeguard now follows growth instead of requiring growth to obey it.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'niko',
        introZh: '尼可发现一枚锚牌把“移植成功”定义为植物永远留在原地。',
        introEn: 'Niko finds an anchor plaque defining successful transplant as staying forever.',
        promptZh: '成功定义应怎样容纳再次迁移？',
        promptEn: 'How should success allow another move?',
        options: [option({
            labelZh: '改成安全扎根',
            labelEn: 'Define safe establishment',
            outcomeZh: '指标关注存活与恢复，而非永久位置。',
            outcomeEn: 'The measure tracks survival and recovery, not permanence.',
            resultZh: '离开不再抹去曾经成功的适应。',
            resultEn: 'Leaving no longer erases a successful period of adaptation.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '加入自选迁移窗',
            labelEn: 'Add voluntary move windows',
            outcomeZh: '每季都有可选择的换土时间。',
            outcomeEn: 'Each season offers an optional repotting window.',
            resultZh: '植物的下一站不由旧锚替它决定。',
            resultEn: 'The old anchor no longer decides the plant’s next home.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追查旧定义',
            labelEn: 'Trace the old metric',
            outcomeZh: '文字来自只服务固定树种的早期试验。',
            outcomeEn: 'The wording came from an early trial for stationary trees.',
            resultZh: '适用范围写回档案，旧规则不再冒充普遍真理。',
            resultEn: 'Scope returns to the archive, and the old rule stops posing as universal truth.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤下误导牌',
            labelEn: 'Remove the plaque',
            outcomeZh: '入口换成“可留下，也可继续”。',
            outcomeEn: 'The entrance now reads stay or continue.',
            resultZh: '错误目标立刻退出评价系统。',
            resultEn: 'The false target leaves evaluation immediately.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保存多次扎根史',
            labelEn: 'Keep a multi-root history',
            outcomeZh: '每次适应都拥有独立日期和土壤记录。',
            outcomeEn: 'Each establishment gains its own date and soil record.',
            resultZh: '迁徙成为连续成长，而不是前一次失败。',
            resultEn: 'Migration becomes continuous growth rather than failure of the prior home.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'room-beneath-pier': [scene({
        speaker: 'niko',
        introZh: '码头下的房间有两套门牌：一套写“储藏”，另一套写“临时避难”。',
        introEn: 'The room beneath the pier carries two signs: storage and temporary shelter.',
        promptZh: '当空间用途冲突时，哪种记录最诚实？',
        promptEn: 'Which record is most honest when uses conflict?',
        options: [option({
            labelZh: '并列当前用途',
            labelEn: 'List both current uses',
            outcomeZh: '门牌写明时段与优先条件。',
            outcomeEn: 'The sign names time windows and priority conditions.',
            resultZh: '共享空间不再被一个简短名称独占。',
            resultEn: 'A shared space is no longer owned by one short label.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '避难时自动优先',
            labelEn: 'Prioritize shelter during need',
            outcomeZh: '气象阈值触发清空储物通道。',
            outcomeEn: 'A weather threshold clears the storage aisle.',
            resultZh: '紧急使用获得范围明确的优先权。',
            resultEn: 'Emergency use gains bounded, explicit priority.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '保留用途变更史',
            labelEn: 'Keep use history',
            outcomeZh: '墙上时间线记录每次转换原因。',
            outcomeEn: 'A wall timeline records why each change occurred.',
            resultZh: '后来者能理解空间演变，而不是猜测谁越界。',
            resultEn: 'Later users understand the room’s evolution without guessing who overstepped.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '移走阻塞物',
            labelEn: 'Remove blocking storage',
            outcomeZh: '出口周围的旧箱先搬到高架。',
            outcomeEn: 'Old cases move away from the exit first.',
            resultZh: '果断清障恢复避难功能，同时清单保存物品去向。',
            resultEn: 'Decisive clearing restores shelter while an inventory preserves where items went.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让两组使用者共订规则',
            labelEn: 'Let both groups set rules',
            outcomeZh: '储物员与值守者共同标出不可占用区。',
            outcomeEn: 'Storekeepers and shelter stewards mark a no-block zone together.',
            resultZh: '空间治理来自实际使用者，而非远端代填。',
            resultEn: 'Governance comes from actual users rather than distant assumptions.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'aya',
        introZh: '阿雅在地板下找到一扇封死的小窗，旧图纸称它是唯一通风口。',
        introEn: 'Aya finds a sealed window under the floor that old plans call the only vent.',
        promptZh: '验证旧图纸前，房间应该如何继续使用？',
        promptEn: 'How should the room operate while the old plan is verified?',
        options: [option({
            labelZh: '测量当前空气',
            labelEn: 'Measure present air',
            outcomeZh: '传感记录确认另一条暗管仍工作。',
            outcomeEn: 'Readings confirm another hidden duct is working.',
            resultZh: '使用决策依赖当前证据，不被旧图纸单独支配。',
            resultEn: 'Use depends on present evidence rather than an old drawing alone.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '降低容量开放',
            labelEn: 'Open at reduced capacity',
            outcomeZh: '人数上限与换气间隔写在入口。',
            outcomeEn: 'The entrance posts a smaller capacity and ventilation interval.',
            resultZh: '空间继续可用，却不把不确定风险转给访客。',
            resultEn: 'The room stays usable without transferring uncertain risk to visitors.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比对三版蓝图',
            labelEn: 'Compare three plan versions',
            outcomeZh: '中间版本标出了后加的暗管。',
            outcomeEn: 'A middle revision shows the later duct.',
            resultZh: '版本差异解释冲突，最老图纸不再自动权威。',
            resultEn: 'Version differences explain the conflict, and the oldest plan loses automatic authority.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂时关闭房间',
            labelEn: 'Close temporarily',
            outcomeZh: '门牌给出复测时间与替代避难点。',
            outcomeEn: 'The sign gives a retest time and alternate shelter.',
            resultZh: '谨慎关闭有清楚期限，也不剥夺基本安全入口。',
            resultEn: 'The cautious closure has a clear limit and preserves basic safety access.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '邀请值守者现场复核',
            labelEn: 'Invite steward inspection',
            outcomeZh: '常用角落的实际气流被纳入报告。',
            outcomeEn: 'Real airflow in frequently used corners enters the report.',
            resultZh: '技术图纸与日常经验并列，修复不再只看纸面。',
            resultEn: 'Technical plans and lived use stand together in the repair.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'storm-name-market': [scene({
        speaker: 'aya',
        introZh: '风暴名集市把最响亮的提案放在入口，较小声音只能写在背面。',
        introEn: 'The storm-name market puts the loudest proposal at the entrance while quieter names stay on the back.',
        promptZh: '怎样让命名不被音量决定？',
        promptEn: 'How can naming stop being decided by volume?',
        options: [option({
            labelZh: '随机轮换入口',
            labelEn: 'Rotate the entrance fairly',
            outcomeZh: '每个有来源的名字都获得同等展示时段。',
            outcomeEn: 'Every sourced name receives equal display time.',
            resultZh: '可见性不再奖励更响的发言。',
            resultEn: 'Visibility no longer rewards louder speech.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '设置并列名册',
            labelEn: 'Keep a parallel register',
            outcomeZh: '正反两面改成同一页多列。',
            outcomeEn: 'Front and back become equal columns on one page.',
            resultZh: '少数名称从附注变成正式可达记录。',
            resultEn: 'Minority names move from footnotes into first-class reachable records.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '标注名称来源',
            labelEn: 'Label provenance',
            outcomeZh: '每张牌写出提出场景与适用范围。',
            outcomeEn: 'Each card names its proposing context and scope.',
            resultZh: '名字可以不同而不必争夺唯一真实性。',
            resultEn: 'Names may differ without competing for sole truth.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停止音量排行',
            labelEn: 'End loudness ranking',
            outcomeZh: '入口计声器被关闭并封存。',
            outcomeEn: 'The entrance sound meter is switched off and archived.',
            resultZh: '伤害性排序立即停止，历史配置仍可审计。',
            resultEn: 'The harmful ranking ends while its historical configuration stays auditable.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许港口自称',
            labelEn: 'Let harbors self-name',
            outcomeZh: '各港保留自己的首选名称与语言。',
            outcomeEn: 'Each harbor keeps its preferred name and language.',
            resultZh: '共同地图展示差异，不强迫所有地点服从一个称呼。',
            resultEn: 'The shared map displays difference without forcing one label on every place.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'ren',
        introZh: '任发现一张高价牌宣称购买某个风暴名就能得到更安全的天气。',
        introEn: 'Ren finds a premium sign claiming that buying a storm name produces safer weather.',
        promptZh: '集市应怎样处理这项虚假承诺？',
        promptEn: 'How should the market handle this false promise?',
        options: [option({
            labelZh: '撤下安全宣称',
            labelEn: 'Remove the safety claim',
            outcomeZh: '牌面只保留虚构纪念用途。',
            outcomeEn: 'The sign keeps only its fictional souvenir purpose.',
            resultZh: '消费与真实安全被明确分离。',
            resultEn: 'Spending becomes explicitly separate from real safety.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '公开免费命名入口',
            labelEn: 'Publish the free route',
            outcomeZh: '所有人都能提交不涉及付款的名称。',
            outcomeEn: 'Everyone gains a naming path with no payment.',
            resultZh: '基本参与不再被价格门槛遮挡。',
            resultEn: 'Basic participation is no longer hidden behind price.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追查错误来源',
            labelEn: 'Trace the claim',
            outcomeZh: '记录显示文案误用了旧庆典玩笑。',
            outcomeEn: 'Records show the copy misused an old festival joke.',
            resultZh: '更正与原广告长期关联，错误不会被悄悄删除。',
            resultEn: 'The correction stays linked to the original ad rather than silently erasing it.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '冻结该摊位',
            labelEn: 'Freeze the stall',
            outcomeZh: '所有相关交易在复核前停止。',
            outcomeEn: 'All related trades stop pending review.',
            resultZh: '果断暂停阻止更多误导，也不影响免费地图入口。',
            resultEn: 'A decisive pause prevents more deception without touching free map access.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '向已购买者主动说明',
            labelEn: 'Notify prior buyers',
            outcomeZh: '通知不要求放弃已有纪念牌。',
            outcomeEn: 'The notice does not require surrendering existing souvenirs.',
            resultZh: '承认错误不撤销已得物品，也不把责任推给购买者。',
            resultEn: 'Acknowledging the error preserves earned items and does not blame buyers.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'island-in-inbox': [scene({
        speaker: 'ren',
        introZh: '收件箱里的岛屿每天移动一格，却把所有未读消息都拖到同一个沙滩。',
        introEn: 'The inbox island moves one cell daily and drags every unread message onto one beach.',
        promptZh: '怎样避免未读状态变成不断增加的压力？',
        promptEn: 'How can unread state avoid becoming accumulating pressure?',
        options: [option({
            labelZh: '取消未读惩罚排序',
            labelEn: 'Remove unread priority penalties',
            outcomeZh: '消息按类型与自选时间排列。',
            outcomeEn: 'Messages sort by type and chosen time.',
            resultZh: '阅读速度不再改变关系或资格。',
            resultEn: 'Reading speed no longer changes relationship or eligibility.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供安静收纳湾',
            labelEn: 'Offer a quiet cove',
            outcomeZh: '消息可入箱但不显示红色计数。',
            outcomeEn: 'Messages may persist without a red counter.',
            resultZh: '接收与被实时提醒分离，安静成为正常模式。',
            resultEn: 'Receiving separates from live prompting, making quiet a normal mode.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '记录岛屿移动史',
            labelEn: 'Log island movement',
            outcomeZh: '地图保存每天位置而不推断未读原因。',
            outcomeEn: 'The map keeps daily positions without inferring why items remain unread.',
            resultZh: '诊断获得必要事实，却不收集私人解释。',
            resultEn: 'Diagnostics gain necessary facts without private explanations.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用自动拖拽',
            labelEn: 'Disable automatic dragging',
            outcomeZh: '原位置与文件夹立即恢复。',
            outcomeEn: 'Original folders and positions return immediately.',
            resultZh: '错误聚合停止，用户的组织选择重新生效。',
            resultEn: 'Faulty aggregation stops and user organization takes effect again.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让每封信选择停靠点',
            labelEn: 'Let each message choose a dock',
            outcomeZh: '任务、故事与庆祝分别进入独立港湾。',
            outcomeEn: 'Quests, stories, and celebrations enter separate coves.',
            resultZh: '不同消息不再互相制造紧迫感。',
            resultEn: 'Different message types no longer manufacture urgency for one another.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '岛中心出现一封没有发件人的邀请，按钮只有“接受”，没有关闭或稍后。',
        introEn: 'An invitation without a sender appears at the island center with only an accept button.',
        promptZh: '这封缺少边界的邀请应怎样修复？',
        promptEn: 'How should this boundaryless invitation be repaired?',
        options: [option({
            labelZh: '补全来源字段',
            labelEn: 'Require provenance',
            outcomeZh: '邀请在来源不可验证时保持不可操作。',
            outcomeEn: 'The invitation stays inert until its source is verified.',
            resultZh: '未知发件人不能借界面获得行动权。',
            resultEn: 'An unknown sender cannot gain action authority through the interface.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '加入拒绝与延期',
            labelEn: 'Add decline and postpone',
            outcomeZh: '三个选择拥有同等大小与可达性。',
            outcomeEn: 'All three choices receive equal size and reachability.',
            resultZh: '接受不再是唯一明显路径，拒绝也没有关系惩罚。',
            resultEn: 'Acceptance is no longer the only visible route, and decline carries no relationship penalty.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '检查生成链',
            labelEn: 'Inspect generation history',
            outcomeZh: '命令来源指向一次失败的旧迁移。',
            outcomeEn: 'The command traces to a failed old migration.',
            resultZh: '技术事故获得解释和修复记录，而不是被包装成神秘事件。',
            resultEn: 'A technical accident gains explanation and repair history instead of becoming manufactured mystery.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '立即隔离邀请',
            labelEn: 'Quarantine the invite',
            outcomeZh: '按钮从收件箱动作区移除。',
            outcomeEn: 'The button leaves the inbox action area.',
            resultZh: '不安全对象被果断隔离，其内容哈希仍供审计。',
            resultEn: 'The unsafe object is isolated while its content hash remains auditable.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '请求岛主确认可见性',
            labelEn: 'Ask the creator about visibility',
            outcomeZh: '邀请可被隐藏、归档或举报。',
            outcomeEn: 'The invitation can be hidden, archived, or reported.',
            resultZh: '收件人获得完整控制，不必先执行邀请才能处理它。',
            resultEn: 'The recipient gains full control without acting on the invitation first.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'choir-of-foghorns': [scene({
        speaker: 'lumen',
        introZh: '雾笛合唱把沉默的第四座塔标成缺席，尽管它正处于预约检修。',
        introEn: 'The foghorn choir marks the silent fourth tower absent even though it is under scheduled maintenance.',
        promptZh: '合唱记录怎样区分沉默、离线和拒绝？',
        promptEn: 'How should the choir distinguish silence, offline status, and decline?',
        options: [option({
            labelZh: '采用明确状态',
            labelEn: 'Use explicit states',
            outcomeZh: '检修、静音与主动退出获得不同标签。',
            outcomeEn: 'Maintenance, mute, and voluntary exit gain distinct labels.',
            resultZh: '系统停止把所有沉默写成同一种关系判断。',
            resultEn: 'The system stops turning every silence into one relationship judgment.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '隐藏非必要状态',
            labelEn: 'Hide unnecessary status',
            outcomeZh: '普通听众只看见本场声部是否可用。',
            outcomeEn: 'Ordinary listeners see only whether the part is available now.',
            resultZh: '运营细节不再成为公开评价。',
            resultEn: 'Operational detail no longer becomes public evaluation.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '保留状态时间线',
            labelEn: 'Keep a state timeline',
            outcomeZh: '每次变化都有来源与期限。',
            outcomeEn: 'Every change carries provenance and duration.',
            resultZh: '复盘能解释缺声，却不猜测塔为何选择静音。',
            resultEn: 'Review explains a missing part without guessing why a tower chose mute.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除缺席评分',
            labelEn: 'Remove absence scoring',
            outcomeZh: '总谱不再因未发声扣分。',
            outcomeEn: 'The score no longer subtracts for silence.',
            resultZh: '检修与拒绝都不会损害既得记录。',
            resultEn: 'Maintenance and decline no longer harm earned records.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许空声部',
            labelEn: 'Allow an empty part',
            outcomeZh: '编曲为沉默保留完整小节。',
            outcomeEn: 'The arrangement reserves a full measure for silence.',
            resultZh: '合唱承认不发声也能是主动而完整的选择。',
            resultEn: 'The choir recognizes not sounding as an active, complete choice.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'sora',
        introZh: '三座雾笛收到同一指挥脉冲，却因海湾延迟在不同时间响起。',
        introEn: 'Three foghorns receive one conducting pulse but sound at different times because of bay latency.',
        promptZh: '怎样评价这次不同步而不惩罚最远的塔？',
        promptEn: 'How should this desynchronization be judged without penalizing the farthest tower?',
        options: [option({
            labelZh: '校准各自延迟',
            labelEn: 'Calibrate per tower',
            outcomeZh: '服务器保存三条独立往返时间。',
            outcomeEn: 'The server keeps three separate round-trip times.',
            resultZh: '计分依据可测延迟修正，而不是假设距离相同。',
            resultEn: 'Scoring adjusts for measured latency instead of assuming equal distance.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '改成轮唱编排',
            labelEn: 'Compose a canon',
            outcomeZh: '延迟被写进三段接力旋律。',
            outcomeEn: 'The delay becomes a three-part relay phrase.',
            resultZh: '差异转成合作结构，不再被称作落后。',
            resultEn: 'Difference becomes cooperative structure instead of lateness.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '分析潮汐传播',
            labelEn: 'Study tidal propagation',
            outcomeZh: '报告区分网络、声学与操作时间。',
            outcomeEn: 'The report separates network, acoustic, and action timing.',
            resultZh: '原因保持多层，不把复杂延迟归咎于一位参与者。',
            resultEn: 'The cause stays layered rather than blaming one participant for complex delay.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停止统一拍点考核',
            labelEn: 'End one-clock grading',
            outcomeZh: '本场只保存各塔自己的准确性。',
            outcomeEn: 'This session preserves only each tower’s local accuracy.',
            resultZh: '不公平比较被果断移除，历史原始时间仍可复核。',
            resultEn: 'The unfair comparison is removed while raw timing remains reviewable.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让塔选择模式',
            labelEn: 'Let towers choose mode',
            outcomeZh: '同步、轮唱与只听三种入口并列。',
            outcomeEn: 'Sync, canon, and listen-only modes stand together.',
            resultZh: '参与方式由每座塔选择，任何模式都不影响关系。',
            resultEn: 'Each tower chooses participation mode, and none changes relationship state.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'reef-of-promises': [scene({
        speaker: 'sora',
        introZh: '承诺礁保存一块写着“永远在线”的旧石牌，潮水已把“永远”冲掉一半。',
        introEn: 'Promise Reef holds an old stone saying always online, with the tide erasing half of always.',
        promptZh: '这条无法长期成立的承诺该怎样归档？',
        promptEn: 'How should an unsustainable promise be archived?',
        options: [option({
            labelZh: '标记为历史愿望',
            labelEn: 'Mark it as historical intent',
            outcomeZh: '石牌旁写明当时语境与结束日期。',
            outcomeEn: 'A plaque names its original context and end date.',
            resultZh: '旧愿望保留价值，却不再约束今天的连接。',
            resultEn: 'The old wish keeps meaning without governing today’s connection.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '邀请双方重新选择',
            labelEn: 'Invite fresh choices',
            outcomeZh: '新的连接偏好各自独立保存。',
            outcomeEn: 'New connection preferences save independently.',
            resultZh: '过去的共同句子不能替今天任何一方作决定。',
            resultEn: 'A past shared sentence cannot decide for either person today.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '研究侵蚀顺序',
            labelEn: 'Study the erosion',
            outcomeZh: '潮痕显示文字本就经历多次改写。',
            outcomeEn: 'Tide marks show the wording was revised several times already.',
            resultZh: '变化进入来源记录，承诺不再被伪装成从未改变。',
            resultEn: 'Change enters provenance, and the promise stops pretending permanence.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拆除危险石牌',
            labelEn: 'Remove the unstable stone',
            outcomeZh: '松动石块移到岸上展柜。',
            outcomeEn: 'The loose slab moves to an onshore case.',
            resultZh: '物理风险立即解除，历史仍以安全形式可见。',
            resultEn: 'Physical danger ends while history remains safely visible.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '改刻可恢复连接',
            labelEn: 'Engrave resumable connection',
            outcomeZh: '新牌写“可以离开，也可以回来”。',
            outcomeEn: 'The new stone reads you may leave and you may return.',
            resultZh: '连接协议把恢复权放在持续在线要求之前。',
            resultEn: 'The connection pact places recovery rights before constant presence.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'mika',
        introZh: '礁石缝里卡着两封互相矛盾的约定书，一封要求同行，一封允许分航。',
        introEn: 'Two contradictory pacts lodge in the reef: one requires traveling together and one permits separate routes.',
        promptZh: '哪份约定应该控制下一段航程？',
        promptEn: 'Which pact should govern the next voyage?',
        options: [option({
            labelZh: '采用较新且可撤回版本',
            labelEn: 'Use the newer revocable pact',
            outcomeZh: '日期与撤回条款得到确认。',
            outcomeEn: 'The date and withdrawal clause are verified.',
            resultZh: '可撤回的当前选择优先于不可验证的旧强制。',
            resultEn: 'A current revocable choice outranks an unverifiable old demand.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让双方各自选择',
            labelEn: 'Let each traveler decide',
            outcomeZh: '两条航线可同时存在。',
            outcomeEn: 'Both routes may exist at once.',
            resultZh: '同行与分航不再互相否定，也不会改变既得关系。',
            resultEn: 'Traveling together and separately stop invalidating one another or earned relationship.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '保存冲突注释',
            labelEn: 'Preserve the contradiction',
            outcomeZh: '档案明确写出两份文本不能同时履行。',
            outcomeEn: 'The archive states that both texts cannot be fulfilled at once.',
            resultZh: '矛盾没有被编辑掉，后来决定能看见真实历史。',
            resultEn: 'The conflict is not edited away, so later decisions can see actual history.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝执行强制同行',
            labelEn: 'Reject compelled travel',
            outcomeZh: '要求捆绑的文书退出操作流程。',
            outcomeEn: 'The binding document leaves the operational flow.',
            resultZh: '果断拒绝保护独立离开权。',
            resultEn: 'A decisive refusal protects independent exit rights.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '写一份不互相扣留的新约定',
            labelEn: 'Write a nonbinding pact',
            outcomeZh: '新文本允许不同速度、停靠和终点。',
            outcomeEn: 'The new text permits different speeds, stops, and destinations.',
            resultZh: '合作从共同控制改成自愿相遇。',
            resultEn: 'Cooperation changes from shared control into voluntary meeting.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'moon-pool-rehearsal': [scene({
        speaker: 'mika',
        introZh: '月池彩排要求每次失误都重头开始，最慢声部因此永远到不了结尾。',
        introEn: 'The moon-pool rehearsal restarts after every miss, keeping the slowest part from ever reaching the ending.',
        promptZh: '排练规则怎样容纳不同学习速度？',
        promptEn: 'How should rehearsal accommodate different learning speeds?',
        options: [option({
            labelZh: '保存分段检查点',
            labelEn: 'Save phrase checkpoints',
            outcomeZh: '每段完成后可从下一小节继续。',
            outcomeEn: 'Each completed phrase unlocks the next starting point.',
            resultZh: '重复练习不再抹去已经掌握的部分。',
            resultEn: 'Repeated practice no longer erases what has been learned.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供独立速度轨',
            labelEn: 'Offer independent tempos',
            outcomeZh: '各声部先在舒适速度练习。',
            outcomeEn: 'Each part rehearses first at a comfortable tempo.',
            resultZh: '不同速度在合奏前得到同等尊重。',
            resultEn: 'Different tempos receive equal respect before ensemble play.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '分析失误类型',
            labelEn: 'Classify the miss',
            outcomeZh: '报告区分听错、延迟与界面误触。',
            outcomeEn: 'The report separates mishearing, latency, and interface slips.',
            resultZh: '练习依据真实原因调整，不把所有问题归为能力不足。',
            resultEn: 'Practice adjusts to real causes rather than calling every issue lack of skill.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '取消强制重启',
            labelEn: 'Remove forced restart',
            outcomeZh: '失误后小节继续并留下可选回顾点。',
            outcomeEn: 'The measure continues after a miss and leaves an optional review point.',
            resultZh: '有害规则立即退出，完成整曲终于可达。',
            resultEn: 'The harmful rule leaves and the full piece becomes reachable.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让声部选择回看',
            labelEn: 'Let each part choose review',
            outcomeZh: '回看只影响自己的练习轨。',
            outcomeEn: 'Review affects only the choosing part’s practice track.',
            resultZh: '一人的需要不会把另一人拖回起点。',
            resultEn: 'One person’s need no longer drags the other back to the start.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'ori',
        introZh: '水面投影把观众的沉默解释为不满意，并自动延长返场。',
        introEn: 'The pool projection interprets audience silence as dissatisfaction and automatically extends the encore.',
        promptZh: '怎样让演出正常结束而不猜测沉默？',
        promptEn: 'How should the performance end without guessing silence?',
        options: [option({
            labelZh: '按预定时间收束',
            labelEn: 'Close on schedule',
            outcomeZh: '终曲结束后灯光转为离场指引。',
            outcomeEn: 'After the finale, lights become exit guidance.',
            resultZh: '沉默不再触发额外劳动。',
            resultEn: 'Silence no longer triggers extra labor.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供可选返场投票',
            labelEn: 'Offer an optional encore poll',
            outcomeZh: '未投票不计入任何立场。',
            outcomeEn: 'No response counts toward no position.',
            resultZh: '想继续的人能表达，安静观众也不被代表。',
            resultEn: 'People who want more may say so without speaking for quiet viewers.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审查旧推断模型',
            labelEn: 'Audit the old inference',
            outcomeZh: '规则来自一次掌声传感器故障。',
            outcomeEn: 'The rule came from one applause-sensor failure.',
            resultZh: '错误来源被记录，沉默含义不再由机器猜测。',
            resultEn: 'The failure gains provenance and the machine stops guessing silence.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用自动延长',
            labelEn: 'Disable auto-extension',
            outcomeZh: '返场只能由明确人工确认启动。',
            outcomeEn: 'An encore now requires explicit human confirmation.',
            resultZh: '强制继续被果断移除，演出者恢复正常结束权。',
            resultEn: 'Compelled continuation ends and performers regain a normal stopping right.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保存安静谢幕模式',
            labelEn: 'Keep a quiet-bow mode',
            outcomeZh: '没有掌声也能完成并归档本场。',
            outcomeEn: 'The show may complete and archive without applause.',
            resultZh: '安静被承认为完整结尾，而非待修复的空缺。',
            resultEn: 'Quiet becomes a complete ending rather than a gap to repair.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'relay-two': [scene({
        speaker: 'ori',
        introZh: '二号中继把断线后的补拉事件和实时事件混在同一列表，旧消息看起来像刚发生。',
        introEn: 'Relay Two mixes catch-up events with live events, making old messages appear new.',
        promptZh: '中继应怎样恢复正确顺序？',
        promptEn: 'How should the relay restore correct order?',
        options: [option({
            labelZh: '以持久序号排序',
            labelEn: 'Order by durable sequence',
            outcomeZh: '快照水位以下的事件只用于确认。',
            outcomeEn: 'Events below the snapshot watermark serve only acknowledgement.',
            resultZh: '恢复不会重复渲染，也不把历史冒充现场。',
            resultEn: 'Recovery neither renders duplicates nor impersonates live activity.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '分别标记补拉与实时',
            labelEn: 'Label catch-up and live',
            outcomeZh: '界面显示来源而不改变事件内容。',
            outcomeEn: 'The interface shows delivery origin without changing event content.',
            resultZh: '归来者理解时间线，却不被大量旧通知催促。',
            resultEn: 'Returning users understand the timeline without pressure from old notices.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较事件ID与序号',
            labelEn: 'Compare IDs and sequence',
            outcomeZh: '重复ID被去重，缺口触发单次补拉。',
            outcomeEn: 'Duplicate IDs collapse and a gap triggers one catch-up.',
            resultZh: '诊断依据明确协议，不依赖到达顺序猜测。',
            resultEn: 'Diagnostics follow explicit protocol rather than arrival-order guesses.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂停错误广播',
            labelEn: 'Pause faulty fanout',
            outcomeZh: '实时推送在水位重建前停止。',
            outcomeEn: 'Live push pauses until the watermark is rebuilt.',
            resultZh: '果断暂停防止更多乱序，持久事件仍安全保存。',
            resultEn: 'The decisive pause prevents more disorder while durable events remain safe.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让成员确认最高序号',
            labelEn: 'Let members acknowledge high water',
            outcomeZh: '双方各自保存单调确认值。',
            outcomeEn: 'Each member keeps an independent monotonic acknowledgement.',
            resultZh: '一人的断线不再重置另一人的恢复位置。',
            resultEn: 'One disconnect no longer resets the other member’s recovery point.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '新核心准备上线，却发现第一版快照仍被一段未完成航程绑定。',
        introEn: 'The new core is ready, but one unfinished voyage remains bound to the first snapshot.',
        promptZh: '升级怎样保护这段旧航程？',
        promptEn: 'How should the upgrade protect the old voyage?',
        options: [option({
            labelZh: '按绑定版本继续',
            labelEn: 'Continue on the bound version',
            outcomeZh: '旧run从自己的不可变快照恢复。',
            outcomeEn: 'The old run resumes from its immutable snapshot.',
            resultZh: '新内容不会原地改写已开始的选择。',
            resultEn: 'New content cannot rewrite choices already underway.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '并行开放新版本',
            labelEn: 'Open the new version beside it',
            outcomeZh: '新航程使用新入口，旧航程保留恢复键。',
            outcomeEn: 'New voyages use a new entrance while the old keeps its resume control.',
            resultZh: '不同版本同时可达，不逼迫任何人放弃进度。',
            resultEn: 'Both versions remain reachable without forcing abandoned progress.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '校验完整内容哈希',
            labelEn: 'Verify the full content hash',
            outcomeZh: '节点数、选择数与快照哈希全部匹配。',
            outcomeEn: 'Node count, choice count, and snapshot hash all match.',
            resultZh: '种子碰撞会失败关闭，不会静默接受漂移。',
            resultEn: 'A seed collision fails closed instead of accepting drift silently.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝原地覆盖',
            labelEn: 'Reject in-place overwrite',
            outcomeZh: '部署流程停止并保留旧核心。',
            outcomeEn: 'Deployment stops and preserves the old core.',
            resultZh: '果断失败保护历史语义，也不删除准备好的新版本。',
            resultEn: 'A decisive failure protects history without deleting the prepared release.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '完成后自愿迁移',
            labelEn: 'Offer migration after completion',
            outcomeZh: '结局归档后才显示新季入口。',
            outcomeEn: 'The new-season entrance appears only after the conclusion is archived.',
            resultZh: '迁移成为自愿下一步，而不是当前航程的条件。',
            resultEn: 'Migration becomes an optional next step rather than a condition of the current voyage.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })]
};