'use strict';

const {
    option,
    scene
} = require('./authored-helpers');
module.exports = {
    'clockwork-arcade': [scene({
        speaker: 'lumen',
        introZh: '街机厅把每次犹豫都换算成欠下的秒数。',
        introEn: 'The arcade converts every hesitation into seconds owed.',
        promptZh: '怎样让思考时间不再成为债务？',
        promptEn: 'How should thinking time stop becoming debt?',
        options: [option({
            labelZh: '删除犹豫计费',
            labelEn: 'Remove hesitation billing',
            outcomeZh: '计时器恢复中性。',
            outcomeEn: 'The timer becomes neutral.',
            resultZh: '思考不会再减少任何资格。',
            resultEn: 'Thinking no longer reduces eligibility.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让玩家自选计时',
            labelEn: 'Let players choose timing',
            outcomeZh: '三种节奏并列开放。',
            outcomeEn: 'Three tempos open equally.',
            resultZh: '速度成为偏好而非排名。',
            resultEn: 'Speed becomes preference, not rank.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追查秒数算法',
            labelEn: 'Trace the seconds',
            outcomeZh: '旧补丁重复累计停顿。',
            outcomeEn: 'An old patch doubles pauses.',
            resultZh: '错误来源进入版本记录。',
            resultEn: 'The error enters version history.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用债务面板',
            labelEn: 'Disable the debt panel',
            outcomeZh: '红色欠时栏消失。',
            outcomeEn: 'The red debt bar disappears.',
            resultZh: '伤害性显示立即退出。',
            resultEn: 'The harmful display ends immediately.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保存无时限入口',
            labelEn: 'Keep an untimed entrance',
            outcomeZh: '普通游玩不再隐藏。',
            outcomeEn: 'Untimed play is no longer hidden.',
            resultZh: '基本入口永远无需借时。',
            resultEn: 'Basic access never borrows time.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'mika',
        introZh: '奖品柜只奖励最短通关，却把探索路线叫作浪费。',
        introEn: 'The prize case rewards only fastest clears and calls exploration waste.',
        promptZh: '怎样重写这项评价？',
        promptEn: 'How should this evaluation change?',
        options: [option({
            labelZh: '并列探索记录',
            labelEn: 'Add exploration records',
            outcomeZh: '发现数量获得独立页。',
            outcomeEn: 'Discoveries gain a separate page.',
            resultZh: '不同玩法不再互相淘汰。',
            resultEn: 'Play styles stop eliminating one another.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让奖品固定',
            labelEn: 'Make keepsakes deterministic',
            outcomeZh: '完成即可获得纪念。',
            outcomeEn: 'Completion grants the keepsake.',
            resultZh: '收藏脱离竞速压力。',
            resultEn: 'Collection leaves race pressure.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审计旧分数',
            labelEn: 'Audit old scoring',
            outcomeZh: '排行偏差被量化。',
            outcomeEn: 'Ranking bias is measured.',
            resultZh: '更正紧邻原始榜单。',
            resultEn: 'The correction stays beside the board.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤下羞辱措辞',
            labelEn: 'Remove shaming copy',
            outcomeZh: '“浪费”标签被封存。',
            outcomeEn: 'The waste label is archived.',
            resultZh: '界面停止贬低探索者。',
            resultEn: 'The interface stops belittling explorers.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许隐藏排行',
            labelEn: 'Allow hidden rankings',
            outcomeZh: '个人可只看自己的轨迹。',
            outcomeEn: 'Players may view only their path.',
            resultZh: '公开竞争不再强制。',
            resultEn: 'Public competition becomes optional.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'museum-of-tomorrow': [scene({
        speaker: 'mika',
        introZh: '明日博物馆展出一件尚未制作的奖杯，并提前写好得主名字。',
        introEn: 'The Museum of Tomorrow displays an unmade trophy with a winner already named.',
        promptZh: '这件预设未来的展品应如何处理？',
        promptEn: 'How should this predetermined future exhibit be handled?',
        options: [option({
            labelZh: '改成空白铭牌',
            labelEn: 'Use a blank plaque',
            outcomeZh: '名字栏恢复开放。',
            outcomeEn: 'The name field reopens.',
            resultZh: '未来不再替参与者决定。',
            resultEn: 'The future stops deciding for participants.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '展示多种可能',
            labelEn: 'Show several outcomes',
            outcomeZh: '五块小牌并列出现。',
            outcomeEn: 'Five small plaques appear.',
            resultZh: '分支获得同等展位。',
            resultEn: 'Branches gain equal display space.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '查明预测来源',
            labelEn: 'Inspect the prediction',
            outcomeZh: '名字来自测试数据。',
            outcomeEn: 'The name came from test data.',
            resultZh: '演示值不再冒充事实。',
            resultEn: 'A demo value no longer poses as fact.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤走奖杯',
            labelEn: 'Remove the trophy',
            outcomeZh: '空台先保留。',
            outcomeEn: 'The pedestal remains empty.',
            resultZh: '拒绝伪结论保护选择。',
            resultEn: 'Rejecting false certainty protects choice.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让访客自写结尾',
            labelEn: 'Invite visitor endings',
            outcomeZh: '便签不参与评分。',
            outcomeEn: 'Notes affect no score.',
            resultZh: '想象与结算彻底分离。',
            resultEn: 'Imagination separates from settlement.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'ori',
        introZh: '馆内时钟把未来事件标成已经发生，导览因此跳过整间展厅。',
        introEn: 'Museum clocks mark future events complete, causing tours to skip a hall.',
        promptZh: '时间状态怎样恢复诚实？',
        promptEn: 'How should temporal state become honest again?',
        options: [option({
            labelZh: '分开计划与完成',
            labelEn: 'Separate planned and done',
            outcomeZh: '两种状态使用不同字段。',
            outcomeEn: 'Two states use distinct fields.',
            resultZh: '计划不会提前结算。',
            resultEn: 'Plans no longer settle early.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许游客返回',
            labelEn: 'Permit later return',
            outcomeZh: '跳过者保留入口。',
            outcomeEn: 'Skipped visitors keep an entrance.',
            resultZh: '错过不再永久关闭内容。',
            resultEn: 'A miss no longer closes content forever.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较服务器时钟',
            labelEn: 'Compare server clocks',
            outcomeZh: '偏移来自错误时区。',
            outcomeEn: 'The drift comes from a wrong timezone.',
            resultZh: '修复依据可验证时间。',
            resultEn: 'The fix follows verifiable time.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '冻结错误导览',
            labelEn: 'Freeze the faulty tour',
            outcomeZh: '自动跳厅立即停止。',
            outcomeEn: 'Automatic skipping stops.',
            resultZh: '新伤害在修复前被阻断。',
            resultEn: 'New harm is blocked before repair.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '显示状态来源',
            labelEn: 'Show state provenance',
            outcomeZh: '每个标签注明谁确认。',
            outcomeEn: 'Each label names its confirmer.',
            resultZh: '完成不再由界面猜测。',
            resultEn: 'Completion is no longer inferred by UI.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'tram-at-1259': [scene({
        speaker: 'ori',
        introZh: '十二点五十九分的电车每次延误都从乘客车票里扣掉一分钟。',
        introEn: 'The 12:59 tram deducts one minute from tickets whenever it is late.',
        promptZh: '谁应承担系统延误？',
        promptEn: 'Who should bear a system delay?',
        options: [option({
            labelZh: '返还全部分钟',
            labelEn: 'Return every minute',
            outcomeZh: '票面余额复原。',
            outcomeEn: 'Ticket time is restored.',
            resultZh: '运营延误不再转嫁乘客。',
            resultEn: 'Operational delay stops shifting to riders.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供无时票',
            labelEn: 'Offer timeless tickets',
            outcomeZh: '基础乘车不再计分。',
            outcomeEn: 'Basic travel becomes untimed.',
            resultZh: '通行权脱离倒计时。',
            resultEn: 'Transit access leaves countdown pressure.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审计延误日志',
            labelEn: 'Audit delays',
            outcomeZh: '三次信号故障被确认。',
            outcomeEn: 'Three signal faults are confirmed.',
            resultZh: '原因写回运营记录。',
            resultEn: 'Causes enter operations history.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停用扣时机',
            labelEn: 'Disable deductions',
            outcomeZh: '闸机只验证车次。',
            outcomeEn: 'Gates verify the route only.',
            resultZh: '错误收费立即终止。',
            resultEn: 'Faulty charging ends immediately.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许改乘',
            labelEn: 'Allow route changes',
            outcomeZh: '换线不收额外分钟。',
            outcomeEn: 'Transfers cost no extra minutes.',
            resultZh: '乘客可安全调整计划。',
            resultEn: 'Riders may safely revise plans.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'sora',
        introZh: '末班车广播要求所有人同时下车，但一位乘客需要更长的无障碍坡道时间。',
        introEn: 'The last-tram announcement demands simultaneous exit though one rider needs a longer ramp window.',
        promptZh: '怎样重做离车流程？',
        promptEn: 'How should disembarking change?',
        options: [option({
            labelZh: '延长安全停靠',
            labelEn: 'Extend the stop',
            outcomeZh: '车门等待确认。',
            outcomeEn: 'Doors wait for confirmation.',
            resultZh: '时间表服从安全离车。',
            resultEn: 'The timetable yields to safe exit.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '开放多段离车',
            labelEn: 'Use staged exit',
            outcomeZh: '不同车门分批引导。',
            outcomeEn: 'Doors guide separate waves.',
            resultZh: '速度差异不再制造羞辱。',
            resultEn: 'Different speeds stop creating shame.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '记录坡道耗时',
            labelEn: 'Measure ramp timing',
            outcomeZh: '数据更新班表。',
            outcomeEn: 'Data updates the schedule.',
            resultZh: '未来计划依据真实需求。',
            resultEn: 'Future planning follows actual need.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝强制关门',
            labelEn: 'Block forced closure',
            outcomeZh: '驾驶台取消倒计时。',
            outcomeEn: 'The cab cancels the countdown.',
            resultZh: '果断停止危险动作。',
            resultEn: 'A dangerous action is decisively stopped.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让乘客发准备信号',
            labelEn: 'Let riders signal ready',
            outcomeZh: '按钮不要求解释。',
            outcomeEn: 'The button asks no explanation.',
            resultZh: '离车控制回到乘客手中。',
            resultEn: 'Exit control returns to riders.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'tailor-of-pauses': [scene({
        speaker: 'sora',
        introZh: '停顿裁缝把每次沉默缝成同一种灰色补丁。',
        introEn: 'The tailor of pauses sews every silence into the same gray patch.',
        promptZh: '怎样保留不同沉默的边界？',
        promptEn: 'How should different silences retain their boundaries?',
        options: [option({
            labelZh: '只记录发生过停顿',
            labelEn: 'Record pause only',
            outcomeZh: '补丁不再猜测原因。',
            outcomeEn: 'The patch stops guessing cause.',
            resultZh: '事实与解释保持分离。',
            resultEn: 'Fact and interpretation stay separate.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让本人选择纹样',
            labelEn: 'Let owners choose texture',
            outcomeZh: '可留白或不展示。',
            outcomeEn: 'Blank and hidden remain options.',
            resultZh: '沉默者控制自己的呈现。',
            resultEn: 'The quiet person controls presentation.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '拆解旧分类',
            labelEn: 'Inspect old categories',
            outcomeZh: '灰色来自缺省值。',
            outcomeEn: 'Gray came from a default.',
            resultZh: '默认不再冒充共同含义。',
            resultEn: 'The default stops posing as shared meaning.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '剪掉推断标签',
            labelEn: 'Cut inference labels',
            outcomeZh: '旧标签进入样本册。',
            outcomeEn: 'Old labels enter a sample book.',
            resultZh: '错误解释退出当前衣物。',
            resultEn: 'False interpretation leaves current garments.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留未命名补丁',
            labelEn: 'Keep unnamed patches',
            outcomeZh: '边缘只写日期。',
            outcomeEn: 'Only a date marks the edge.',
            resultZh: '未知获得长期合法位置。',
            resultEn: 'Unknown gains a lasting valid place.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'vale',
        introZh: '一件外套只有不断加长袖口才能保持“连续使用”记录。',
        introEn: 'A coat must keep lengthening its sleeves to maintain a continuous-use record.',
        promptZh: '怎样取消这项荒谬连续要求？',
        promptEn: 'How should this absurd continuity rule end?',
        options: [option({
            labelZh: '按实际穿用记录',
            labelEn: 'Log actual use',
            outcomeZh: '停穿日期保持中性。',
            outcomeEn: 'Unused dates remain neutral.',
            resultZh: '间隔不再清空历史。',
            resultEn: 'Gaps no longer erase history.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许季节收纳',
            labelEn: 'Allow seasonal storage',
            outcomeZh: '衣物可安全归柜。',
            outcomeEn: 'The garment may rest safely.',
            resultZh: '暂停成为正常周期。',
            resultEn: 'Pauses become a normal cycle.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '查找规则来源',
            labelEn: 'Trace the rule',
            outcomeZh: '旧展示赛遗留条件。',
            outcomeEn: 'It came from an old showcase.',
            resultZh: '竞赛规则退出日常衣橱。',
            resultEn: 'Contest rules leave daily wardrobes.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拆除加长机构',
            labelEn: 'Remove the extender',
            outcomeZh: '机器停止拉扯布料。',
            outcomeEn: 'The machine stops pulling fabric.',
            resultZh: '损伤源被立即移除。',
            resultEn: 'The source of damage is removed.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保存短袖原型',
            labelEn: 'Keep the original cut',
            outcomeZh: '初版进入可穿档案。',
            outcomeEn: 'The first cut enters a wearable archive.',
            resultZh: '成长不要求否定原来形态。',
            resultEn: 'Growth need not deny earlier form.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'rain-check-bank': [scene({
        speaker: 'vale',
        introZh: '延期银行把每次“稍后”都加上利息，最终比原任务更重。',
        introEn: 'The rain-check bank adds interest to every later until the task grows heavier.',
        promptZh: '怎样让延期真正中性？',
        promptEn: 'How should postponement become genuinely neutral?',
        options: [option({
            labelZh: '冻结原始范围',
            labelEn: 'Freeze original scope',
            outcomeZh: '延期不再增加步骤。',
            outcomeEn: 'Delay adds no steps.',
            resultZh: '稍后不会制造进度债。',
            resultEn: 'Later creates no progress debt.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许无期限取消',
            labelEn: 'Allow cancellation',
            outcomeZh: '关闭账户不扣关系。',
            outcomeEn: 'Closing costs no relationship.',
            resultZh: '离开与延期都安全。',
            resultEn: 'Leaving and postponing stay safe.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追查延期增量',
            labelEn: 'Audit interest',
            outcomeZh: '增长来自错误重复任务。',
            outcomeEn: 'Growth came from duplicated tasks.',
            resultZh: '系统缺陷被明确归因。',
            resultEn: 'The defect receives correct attribution.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停收延期费用',
            labelEn: 'Stop delay fees',
            outcomeZh: '所有利息栏归零。',
            outcomeEn: 'Every interest field resets.',
            resultZh: '有害结算立即回滚。',
            resultEn: 'Harmful settlement reverses immediately.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留已完成步骤',
            labelEn: 'Keep completed steps',
            outcomeZh: '下次从真实位置继续。',
            outcomeEn: 'Next time resumes at the real point.',
            resultZh: '暂停不抹去劳动。',
            resultEn: 'A pause does not erase work.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'niko',
        introZh: '柜员要求解释私人原因才允许使用雨票。',
        introEn: 'A clerk demands a private reason before allowing a rain check.',
        promptZh: '怎样移除这道不必要的门槛？',
        promptEn: 'How should this unnecessary gate be removed?',
        options: [option({
            labelZh: '只询问新日期',
            labelEn: 'Ask only for timing',
            outcomeZh: '原因字段被删除。',
            outcomeEn: 'The reason field is removed.',
            resultZh: '最小信息足以延期。',
            resultEn: 'Minimum information is enough to postpone.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供一键稍后',
            labelEn: 'Offer one-click later',
            outcomeZh: '按钮无需自由文本。',
            outcomeEn: 'The control needs no free text.',
            resultZh: '边界表达变得轻量。',
            resultEn: 'Boundary expression becomes lightweight.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '查看访问日志',
            labelEn: 'Inspect access logs',
            outcomeZh: '拒绝集中在空原因字段。',
            outcomeEn: 'Denials cluster on blank reasons.',
            resultZh: '证据揭示门槛伤害。',
            resultEn: 'Evidence reveals the gate’s harm.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '立即停止审核原因',
            labelEn: 'Stop reason review',
            outcomeZh: '柜员不能再查看旧说明。',
            outcomeEn: 'Clerks lose access to old explanations.',
            resultZh: '私人信息退出决策。',
            resultEn: 'Private data leaves the decision.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让用户删除旧理由',
            labelEn: 'Let users erase old reasons',
            outcomeZh: '历史只保留延期事实。',
            outcomeEn: 'History keeps only postponement fact.',
            resultZh: '审计与隐私同时保全。',
            resultEn: 'Audit and privacy both survive.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'hourglass-greenhouse': [scene({
        speaker: 'niko',
        introZh: '沙漏温室规定每株花必须在同一分钟开放。',
        introEn: 'The hourglass greenhouse requires every flower to open in the same minute.',
        promptZh: '怎样承认不同花期？',
        promptEn: 'How should different bloom times be honored?',
        options: [option({
            labelZh: '记录各自节律',
            labelEn: 'Record individual rhythms',
            outcomeZh: '花期获得独立窗口。',
            outcomeEn: 'Blooms gain separate windows.',
            resultZh: '差异不再算作迟到。',
            resultEn: 'Difference stops counting as lateness.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '分区调节光照',
            labelEn: 'Zone the lighting',
            outcomeZh: '每区采用适合周期。',
            outcomeEn: 'Each zone gets fitting cycles.',
            resultZh: '环境适应植物而非相反。',
            resultEn: 'The environment adapts to plants.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '研究种源',
            labelEn: 'Study provenance',
            outcomeZh: '品种来自不同纬度。',
            outcomeEn: 'Varieties come from different latitudes.',
            resultZh: '来源解释节律差异。',
            resultEn: 'Provenance explains rhythm differences.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停止统一倒计时',
            labelEn: 'End the shared countdown',
            outcomeZh: '中央沙漏被封存。',
            outcomeEn: 'The central hourglass is archived.',
            resultZh: '强迫同步立即结束。',
            resultEn: 'Forced synchronization ends.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许不开花',
            labelEn: 'Allow no bloom',
            outcomeZh: '休眠也标为健康。',
            outcomeEn: 'Dormancy may be healthy.',
            resultZh: '不展示仍是完整状态。',
            resultEn: 'Non-display remains complete.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'aya',
        introZh: '温室把一次提前开花标成透支未来季节。',
        introEn: 'The greenhouse labels an early bloom as borrowing from a future season.',
        promptZh: '怎样摆脱时间债叙事？',
        promptEn: 'How should the time-debt story be removed?',
        options: [option({
            labelZh: '改写为本季事件',
            labelEn: 'Call it this season’s event',
            outcomeZh: '记录不预测来年。',
            outcomeEn: 'The record predicts no next year.',
            resultZh: '一次变化不制造未来欠款。',
            resultEn: 'One change creates no future debt.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让园丁自定解释',
            labelEn: 'Let gardeners choose notes',
            outcomeZh: '可写环境或留白。',
            outcomeEn: 'They may note context or leave blank.',
            resultZh: '解释权不归系统。',
            resultEn: 'Interpretation belongs outside the system.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较历史花期',
            labelEn: 'Compare records',
            outcomeZh: '提前幅度仍在自然范围。',
            outcomeEn: 'The timing is within natural range.',
            resultZh: '数据推翻夸张警报。',
            resultEn: 'Data disproves the alarm.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除透支告警',
            labelEn: 'Remove the debt warning',
            outcomeZh: '红色标记立刻消失。',
            outcomeEn: 'The red mark vanishes.',
            resultZh: '未来不再被当作债主。',
            resultEn: 'The future stops acting as creditor.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留惊喜标签',
            labelEn: 'Keep a surprise note',
            outcomeZh: '花期只被称作意外。',
            outcomeEn: 'The bloom is simply unexpected.',
            resultZh: '未知不必转成惩罚。',
            resultEn: 'Unknown need not become punishment.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'timezone-orchard': [scene({
        speaker: 'aya',
        introZh: '时区果园用一个午夜同时重置所有树的灌溉记录。',
        introEn: 'The timezone orchard resets every tree at one midnight.',
        promptZh: '怎样避免远端树失去当天记录？',
        promptEn: 'How should distant trees keep their daily records?',
        options: [option({
            labelZh: '按树所在时区',
            labelEn: 'Use each tree’s timezone',
            outcomeZh: '本地日期独立计算。',
            outcomeEn: 'Local dates calculate independently.',
            resultZh: '日界线不再删除进度。',
            resultEn: 'Date boundaries stop deleting progress.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '使用滚动窗口',
            labelEn: 'Use rolling windows',
            outcomeZh: '灌溉按二十四小时统计。',
            outcomeEn: 'Watering uses a 24-hour window.',
            resultZh: '地域不再决定资格。',
            resultEn: 'Region no longer decides eligibility.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审计重置事件',
            labelEn: 'Audit resets',
            outcomeZh: '丢失集中在东侧园区。',
            outcomeEn: 'Loss clusters in eastern plots.',
            resultZh: '错误模式得到证实。',
            resultEn: 'The failure pattern is confirmed.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂停全球重置',
            labelEn: 'Pause global reset',
            outcomeZh: '旧任务停止执行。',
            outcomeEn: 'The old job stops.',
            resultZh: '数据损失立即被阻断。',
            resultEn: 'Data loss is immediately blocked.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '恢复缺失记录',
            labelEn: 'Restore missing entries',
            outcomeZh: '备份按来源回填。',
            outcomeEn: 'Backups restore by provenance.',
            resultZh: '修复不重复结算奖励。',
            resultEn: 'Repair does not settle rewards twice.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'ren',
        introZh: '一棵跨时区移植的树同时出现在两个每日榜单。',
        introEn: 'A transplanted tree appears on two daily boards across timezones.',
        promptZh: '怎样防止重复计入？',
        promptEn: 'How should duplicate counting be prevented?',
        options: [option({
            labelZh: '使用稳定事件ID',
            labelEn: 'Use stable event identity',
            outcomeZh: '两条投影合并。',
            outcomeEn: 'The two projections merge.',
            resultZh: '一次灌溉只记录一次。',
            resultEn: 'One watering records once.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保留两地展示',
            labelEn: 'Keep both displays',
            outcomeZh: '计数只在来源地结算。',
            outcomeEn: 'Settlement occurs at source only.',
            resultZh: '可见性不等于重复价值。',
            resultEn: 'Visibility does not mean duplicate value.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较语义载荷',
            labelEn: 'Compare payload semantics',
            outcomeZh: '同ID内容完全一致。',
            outcomeEn: 'Same-ID payloads match.',
            resultZh: '重放被安全识别。',
            resultEn: 'Replay is safely recognized.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝第二次结算',
            labelEn: 'Reject double settlement',
            outcomeZh: '重复命令返回原响应。',
            outcomeEn: 'The duplicate returns original response.',
            resultZh: '账本保持唯一。',
            resultEn: 'The ledger stays unique.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '记录迁移时间线',
            labelEn: 'Log transplantation',
            outcomeZh: '两地历史连续相连。',
            outcomeEn: 'Both histories stay linked.',
            resultZh: '搬迁不抹去旧土来源。',
            resultEn: 'Moving does not erase old-soil provenance.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'midnight-lost-found': [scene({
        speaker: 'ren',
        introZh: '午夜失物处把超过一周未认领的故事道具自动标成无人需要。',
        introEn: 'The midnight lost-and-found marks story props unwanted after one week.',
        promptZh: '怎样去掉这项过期推断？',
        promptEn: 'How should this expiry inference be removed?',
        options: [option({
            labelZh: '改成等待认领',
            labelEn: 'Use awaiting claim',
            outcomeZh: '状态不解释意愿。',
            outcomeEn: 'The state infers no desire.',
            resultZh: '时间不会替失主决定。',
            resultEn: 'Time does not decide for owners.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许长期归档',
            labelEn: 'Allow long archive',
            outcomeZh: '道具移库但不删除。',
            outcomeEn: 'Props move storage, not ownership.',
            resultZh: '轮换不制造失去恐惧。',
            resultEn: 'Rotation creates no fear of loss.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '检查认领周期',
            labelEn: 'Study claim timing',
            outcomeZh: '许多物品数月后归还。',
            outcomeEn: 'Many items return months later.',
            resultZh: '数据否定一周期限。',
            resultEn: 'Data rejects the one-week rule.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停止自动处置',
            labelEn: 'Stop automatic disposal',
            outcomeZh: '清理任务被关闭。',
            outcomeEn: 'The cleanup job is disabled.',
            resultZh: '既得物品立即受保护。',
            resultEn: 'Held items gain immediate protection.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供主动放弃',
            labelEn: 'Provide an intentional transfer',
            outcomeZh: '只有明确选择才转赠。',
            outcomeEn: 'Only explicit choice transfers props.',
            resultZh: '放弃成为可审计行为。',
            resultEn: 'Release becomes auditable.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '一只失物箱里装着来自五个版本的同一把虚构钥匙。',
        introEn: 'One lost box contains the same fictional key from five versions.',
        promptZh: '这些相似钥匙怎样保存？',
        promptEn: 'How should these similar keys be preserved?',
        options: [option({
            labelZh: '按版本分格',
            labelEn: 'Separate by version',
            outcomeZh: '每把钥匙绑定快照。',
            outcomeEn: 'Each key binds its snapshot.',
            resultZh: '旧入口继续可解释。',
            resultEn: 'Old entrances remain explainable.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '并列展示差异',
            labelEn: 'Display differences',
            outcomeZh: '齿形变化获得标签。',
            outcomeEn: 'Tooth changes receive labels.',
            resultZh: '更新不否定旧形态。',
            resultEn: 'Updates do not deny prior forms.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '校验内容哈希',
            labelEn: 'Verify content hashes',
            outcomeZh: '五把钥匙都不相同。',
            outcomeEn: 'All five keys differ.',
            resultZh: '相似外观不掩盖身份。',
            resultEn: 'Similar looks do not hide identity.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝合并覆盖',
            labelEn: 'Reject overwrite merge',
            outcomeZh: '系统停止选最新替换。',
            outcomeEn: 'The system stops replacing with latest.',
            resultZh: '历史物件不被原地改写。',
            resultEn: 'Historical objects are not rewritten.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让持有人选展示版',
            labelEn: 'Let holders choose display',
            outcomeZh: '其他版本仍留库。',
            outcomeEn: 'Other versions remain archived.',
            resultZh: '展示选择不改变所有权。',
            resultEn: 'Display choice does not alter ownership.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'calendar-observatory': [scene({
        speaker: 'lumen',
        introZh: '日历观测台把所有空白日期画成失败的黑点。',
        introEn: 'The calendar observatory paints every blank date as a failed black mark.',
        promptZh: '空白日期应该怎样呈现？',
        promptEn: 'How should blank dates appear?',
        options: [option({
            labelZh: '恢复无状态空白',
            labelEn: 'Restore neutral blank',
            outcomeZh: '日历只显示真实事件。',
            outcomeEn: 'The calendar shows actual events only.',
            resultZh: '未参与不再等于失败。',
            resultEn: 'Non-participation no longer means failure.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许隐藏日历',
            labelEn: 'Allow calendar hiding',
            outcomeZh: '视图可完全关闭。',
            outcomeEn: 'The view may be disabled.',
            resultZh: '连续展示不再强制。',
            resultEn: 'Continuous display is no longer forced.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追查黑点规则',
            labelEn: 'Trace black marks',
            outcomeZh: '设计源自旧签到赛。',
            outcomeEn: 'The design came from a check-in contest.',
            resultZh: '竞赛语义退出长期档案。',
            resultEn: 'Contest semantics leave lasting archives.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除失败图例',
            labelEn: 'Remove failure legend',
            outcomeZh: '黑色解释被封存。',
            outcomeEn: 'The black legend is archived.',
            resultZh: '羞辱性含义立即停止。',
            resultEn: 'The shaming meaning ends.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '加入休息标记',
            labelEn: 'Add optional rest marks',
            outcomeZh: '休息由本人选择记录。',
            outcomeEn: 'Rest is recorded only by choice.',
            resultZh: '停顿可见但不被推断。',
            resultEn: 'Pauses may be visible without inference.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'sora',
        introZh: '观测员发现闰秒被系统算成一项逾期任务。',
        introEn: 'Observers find a leap second counted as an overdue task.',
        promptZh: '这项不存在的逾期怎样清理？',
        promptEn: 'How should this nonexistent overdue item be cleared?',
        options: [option({
            labelZh: '按服务器时间重算',
            labelEn: 'Recalculate by server time',
            outcomeZh: '任务回到准时。',
            outcomeEn: 'The task returns on time.',
            resultZh: '权威时间纠正错误。',
            resultEn: 'Authoritative time corrects the error.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保护用户状态',
            labelEn: 'Preserve user state',
            outcomeZh: '完成步骤全部保留。',
            outcomeEn: 'Completed steps remain.',
            resultZh: '修复不让用户承担代价。',
            resultEn: 'Users bear no repair cost.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '保留异常样本',
            labelEn: 'Keep anomaly evidence',
            outcomeZh: '闰秒事件进入测试库。',
            outcomeEn: 'The leap-second event enters tests.',
            resultZh: '边界案例不会再次遗忘。',
            resultEn: 'The edge case will not be forgotten.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤销逾期结论',
            labelEn: 'Revoke overdue result',
            outcomeZh: '相关提醒全部停止。',
            outcomeEn: 'All related reminders stop.',
            resultZh: '错误状态被果断清除。',
            resultEn: 'The false state is decisively cleared.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '通知而不催促',
            labelEn: 'Notify without pressure',
            outcomeZh: '说明修复且无需操作。',
            outcomeEn: 'The notice requires no action.',
            resultZh: '透明更正不制造新任务。',
            resultEn: 'Transparent correction creates no new task.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'secondhand-sunrise': [scene({
        speaker: 'sora',
        introZh: '二手日出附带上一位持有者的闹钟，清晨自动响起。',
        introEn: 'A secondhand sunrise includes its prior holder’s alarm, which rings at dawn.',
        promptZh: '新持有者怎样取得控制？',
        promptEn: 'How should the new holder gain control?',
        options: [option({
            labelZh: '重置全部闹钟',
            labelEn: 'Reset alarms',
            outcomeZh: '旧计划被清除。',
            outcomeEn: 'Old schedules are cleared.',
            resultZh: '所有权不继承私人提醒。',
            resultEn: 'Ownership does not inherit private reminders.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '逐项选择保留',
            labelEn: 'Choose items individually',
            outcomeZh: '每个提示都可关闭。',
            outcomeEn: 'Every cue can be disabled.',
            resultZh: '设置迁移需要主动同意。',
            resultEn: 'Settings transfer needs active consent.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '查看来源版本',
            labelEn: 'Inspect provenance',
            outcomeZh: '闹钟属于旧快照。',
            outcomeEn: 'The alarm belongs to an old snapshot.',
            resultZh: '绑定错误得到解释。',
            resultEn: 'The binding error is explained.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '断开旧账户',
            labelEn: 'Sever old account link',
            outcomeZh: '自动同步立即停止。',
            outcomeEn: 'Automatic sync ends.',
            resultZh: '隐私越界被果断阻断。',
            resultEn: 'The privacy breach is stopped.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保存无闹钟日出',
            labelEn: 'Keep an alarm-free sunrise',
            outcomeZh: '光照独立存在。',
            outcomeEn: 'The light exists independently.',
            resultZh: '体验不再以提醒为条件。',
            resultEn: 'The experience no longer requires prompts.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'vale',
        introZh: '日出商店声称错过今天就永远失去这束光。',
        introEn: 'The sunrise shop claims that missing today loses the light forever.',
        promptZh: '怎样移除失去恐惧？',
        promptEn: 'How should fear of missing out be removed?',
        options: [option({
            labelZh: '改为随时重开',
            labelEn: 'Make it reopenable',
            outcomeZh: '日出进入长期目录。',
            outcomeEn: 'The sunrise enters a lasting catalog.',
            resultZh: '日期不再撤销访问。',
            resultEn: 'Dates no longer revoke access.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保留已得版本',
            labelEn: 'Keep earned versions',
            outcomeZh: '轮换只改变展示。',
            outcomeEn: 'Rotation changes display only.',
            resultZh: '收藏不会过期。',
            resultEn: 'Collections do not expire.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '检查库存事实',
            labelEn: 'Check stock reality',
            outcomeZh: '光束是可重复内容。',
            outcomeEn: 'The light is reproducible content.',
            resultZh: '虚假稀缺被揭示。',
            resultEn: 'False scarcity is exposed.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤下倒计时',
            labelEn: 'Remove countdown',
            outcomeZh: '紧迫横幅消失。',
            outcomeEn: 'The urgency banner disappears.',
            resultZh: '操纵性提示立即停止。',
            resultEn: 'Manipulative prompting ends.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供安静愿望单',
            labelEn: 'Offer a quiet wishlist',
            outcomeZh: '提醒默认关闭。',
            outcomeEn: 'Reminders default off.',
            resultZh: '兴趣不会变成压力。',
            resultEn: 'Interest does not become pressure.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'city-wide-snooze': [scene({
        speaker: 'vale',
        introZh: '全城稍后按钮只暂停十分钟，之后把所有提醒同时推送。',
        introEn: 'The city snooze pauses ten minutes and then pushes every reminder at once.',
        promptZh: '怎样让暂停真正可控？',
        promptEn: 'How should snooze become controllable?',
        options: [option({
            labelZh: '选择恢复时间',
            labelEn: 'Choose return time',
            outcomeZh: '用户决定何时重开。',
            outcomeEn: 'Users decide when to reopen.',
            resultZh: '暂停不再由系统抢回。',
            resultEn: 'The system no longer seizes the pause.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '分类型恢复',
            labelEn: 'Resume by category',
            outcomeZh: '任务与消息独立开启。',
            outcomeEn: 'Quests and messages reopen separately.',
            resultZh: '边界控制更细致。',
            resultEn: 'Boundary control becomes granular.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '分析提醒洪峰',
            labelEn: 'Analyze the burst',
            outcomeZh: '拥塞来自批量调度。',
            outcomeEn: 'Congestion comes from batch scheduling.',
            resultZh: '根因进入修复计划。',
            resultEn: 'The root cause enters repair plans.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '停止自动恢复',
            labelEn: 'Disable auto-resume',
            outcomeZh: '静音保持到主动解除。',
            outcomeEn: 'Mute lasts until active release.',
            resultZh: '安静权被立即保护。',
            resultEn: 'Quiet rights gain immediate protection.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '只保留持久入箱',
            labelEn: 'Keep inbox only',
            outcomeZh: '暂停时没有实时推送。',
            outcomeEn: 'No live push occurs during pause.',
            resultZh: '消息仍可恢复且不催促。',
            resultEn: 'Messages remain recoverable without pressure.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'niko',
        introZh: '城市把提前结束休眠的人列为最勤奋居民。',
        introEn: 'The city ranks people who end rest early as most diligent.',
        promptZh: '怎样取消对休息的竞争？',
        promptEn: 'How should competition around rest end?',
        options: [option({
            labelZh: '删除早起排行',
            labelEn: 'Remove wake rankings',
            outcomeZh: '休眠记录回归私密。',
            outcomeEn: 'Rest records become private.',
            resultZh: '恢复时间不再产生地位。',
            resultEn: 'Return time no longer creates status.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '展示中性状态',
            labelEn: 'Show neutral states',
            outcomeZh: '在线与休息无高低。',
            outcomeEn: 'Online and resting have no rank.',
            resultZh: '不同节奏同等有效。',
            resultEn: 'Different rhythms are equally valid.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审计排行影响',
            labelEn: 'Audit ranking harm',
            outcomeZh: '记录显示提醒次数上升。',
            outcomeEn: 'Records show prompts increased.',
            resultZh: '证据支持取消设计。',
            resultEn: 'Evidence supports removal.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '关闭勤奋徽章',
            labelEn: 'Retire the badge',
            outcomeZh: '既有收藏保留但不再发放。',
            outcomeEn: 'Earned items remain but issuance ends.',
            resultZh: '停止机制不撤销已得物。',
            resultEn: 'Ending the mechanism does not revoke earned items.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '庆祝正常返回',
            labelEn: 'Celebrate any return',
            outcomeZh: '回来不问离开多久。',
            outcomeEn: 'Return asks no absence length.',
            resultZh: '归来没有进度债。',
            resultEn: 'Return carries no progress debt.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'borrowed-hour-court': [scene({
        speaker: 'niko',
        introZh: '借时法庭把未回复邀请列作证据，声称沉默就是违约。',
        introEn: 'The borrowed-hour court treats unanswered invites as evidence that silence breached a pact.',
        promptZh: '法庭应怎样修正这项推断？',
        promptEn: 'How should the court correct this inference?',
        options: [option({
            labelZh: '排除沉默证据',
            labelEn: 'Exclude silence as proof',
            outcomeZh: '未回复不再定性。',
            outcomeEn: 'No response receives no judgment.',
            resultZh: '缺席无法冒充同意或拒绝。',
            resultEn: 'Absence cannot pose as consent or decline.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '承认无需回应',
            labelEn: 'Recognize no duty to answer',
            outcomeZh: '邀请默认可忽略。',
            outcomeEn: 'Invites may be ignored by default.',
            resultZh: '边界不要求解释。',
            resultEn: 'Boundaries require no explanation.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追查判例来源',
            labelEn: 'Trace precedent',
            outcomeZh: '规则来自错误自动化。',
            outcomeEn: 'The rule came from faulty automation.',
            resultZh: '机器推断不再伪装法律。',
            resultEn: 'Machine inference stops posing as law.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤销相关裁定',
            labelEn: 'Vacate rulings',
            outcomeZh: '受影响记录恢复中性。',
            outcomeEn: 'Affected records become neutral.',
            resultZh: '错误伤害被果断纠正。',
            resultEn: 'False harm is decisively corrected.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许自愿补充',
            labelEn: 'Allow optional context',
            outcomeZh: '说明不会改变基本资格。',
            outcomeEn: 'Context changes no basic eligibility.',
            resultZh: '表达成为选择而非门票。',
            resultEn: 'Explanation becomes choice, not admission.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '法庭中央摆着一只装满过期分钟的沙漏，准备把它们退给未来居民。',
        introEn: 'A central hourglass holds expired minutes and plans to charge them to future residents.',
        promptZh: '这些历史债务应该怎样结束？',
        promptEn: 'How should these historical debts end?',
        options: [option({
            labelZh: '宣布分钟无效',
            labelEn: 'Void the minutes',
            outcomeZh: '沙漏停止计息。',
            outcomeEn: 'The hourglass stops accruing.',
            resultZh: '未来居民不继承旧错误。',
            resultEn: 'Future residents inherit no old error.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保留只读展品',
            labelEn: 'Keep a read-only exhibit',
            outcomeZh: '沙粒只用于解释历史。',
            outcomeEn: 'The sand explains history only.',
            resultZh: '审计不等于继续执行。',
            resultEn: 'Audit does not mean continued enforcement.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '核对结算来源',
            labelEn: 'Verify settlement provenance',
            outcomeZh: '没有合法账本支持。',
            outcomeEn: 'No valid ledger supports it.',
            resultZh: '伪债务失去依据。',
            resultEn: 'The false debt loses foundation.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '打破收费连接',
            labelEn: 'Break the charging link',
            outcomeZh: '出账路径被永久关闭。',
            outcomeEn: 'The billing path closes permanently.',
            resultZh: '错误不再传播到新账户。',
            resultEn: 'The error cannot spread to new accounts.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '写入无债宪章',
            labelEn: 'Write a debt-free charter',
            outcomeZh: '离线与暂停不得累积欠款。',
            outcomeEn: 'Offline time and pauses accrue no debt.',
            resultZh: '城市把休息权写入长期规则。',
            resultEn: 'The city makes rest a lasting right.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })]
};
