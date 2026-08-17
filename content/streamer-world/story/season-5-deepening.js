'use strict';

const {
    option,
    scene
} = require('./authored-helpers');
module.exports = {
    'hall-of-many-keys': [scene({
        speaker: 'lumen',
        introZh: '多钥大厅找到一把只能打开别人已关闭房间的旧钥匙。',
        introEn: 'The hall of many keys finds an old key that opens only rooms someone else has closed.',
        promptZh: '这把越过关闭决定的钥匙应怎样处理？',
        promptEn: 'What should happen to a key that crosses another person’s decision to close?',
        options: [option({
            labelZh: '熔掉有效齿纹',
            labelEn: 'Melt its working teeth',
            outcomeZh: '钥匙保留形状，却不能再转动任何锁芯。',
            outcomeEn: 'The key keeps its shape but can no longer turn a lock.',
            resultZh: '越界能力被永久移除，历史证物仍然存在。',
            resultEn: 'The boundary-crossing power is permanently removed while evidence remains.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '记录所有旧开锁',
            labelEn: 'Audit every past opening',
            outcomeZh: '日志标出房间、时间与使用者。',
            outcomeEn: 'The log identifies rooms, times, and users.',
            resultZh: '受影响的人获得事实，而不是被要求证明门曾打开。',
            resultEn: 'Affected people receive facts instead of having to prove an opening occurred.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '通知房间持有人',
            labelEn: 'Notify room holders',
            outcomeZh: '说明不要求回应，并提供换锁选择。',
            outcomeEn: 'The notice requires no reply and offers lock replacement.',
            resultZh: '修复选择回到拥有边界的人手中。',
            resultEn: 'Repair choices return to the people who hold the boundaries.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '建立双重确认柜',
            labelEn: 'Build a dual-confirmation case',
            outcomeZh: '只有档案员与持有人共同同意才能查看。',
            outcomeEn: 'Only an archivist and holder together can inspect it.',
            resultZh: '高风险证物可研究，却不再由单方控制。',
            resultEn: 'The high-risk artifact remains researchable without unilateral control.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '公开废钥说明',
            labelEn: 'Publish the retired-key notice',
            outcomeZh: '大厅解释为什么万能入口不值得庆祝。',
            outcomeEn: 'The hall explains why universal access is not a triumph.',
            resultZh: '公共记忆把边界保护写进未来设计。',
            resultEn: 'Public memory carries boundary protection into future design.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'ori',
        introZh: '大厅新铸的钥匙会在持有人沉默三天后自动复制给管理员。',
        introEn: 'A newly forged key copies itself to an administrator after three silent days.',
        promptZh: '怎样删除这项把沉默当授权的规则？',
        promptEn: 'How should this rule that treats silence as authorization be removed?',
        options: [option({
            labelZh: '取消自动复制',
            labelEn: 'Cancel automatic copying',
            outcomeZh: '铸造模板删除延时授权字段。',
            outcomeEn: 'The forging template loses its delayed-authorization field.',
            resultZh: '没有回应永远不会生成新的进入权。',
            resultEn: 'No response can ever create new access rights.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '收回已有副本',
            labelEn: 'Recall existing copies',
            outcomeZh: '管理员钥匙逐把作废并留下回执。',
            outcomeEn: 'Administrator copies are invalidated with receipts.',
            resultZh: '修复覆盖历史影响，而非只改变将来。',
            resultEn: 'Repair covers historical impact instead of changing only the future.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '添加明确委托流程',
            labelEn: 'Add explicit delegation',
            outcomeZh: '持有人选择对象、范围与结束时间。',
            outcomeEn: 'Holders choose recipient, scope, and end time.',
            resultZh: '授权成为有界且可撤销的主动行为。',
            resultEn: 'Delegation becomes bounded, revocable, and active.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '检查静默计时器',
            labelEn: 'Inspect the silence timer',
            outcomeZh: '测试证明断线也会被错误计算。',
            outcomeEn: 'Tests show disconnection was also counted.',
            resultZh: '技术证据揭示规则既越界又不可靠。',
            resultEn: 'Technical evidence shows the rule was both intrusive and unreliable.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '保留无委托默认',
            labelEn: 'Keep no delegation as default',
            outcomeZh: '新钥匙只属于首次领取者。',
            outcomeEn: 'New keys belong only to their first recipient.',
            resultZh: '安全默认不再等待用户额外关闭。',
            resultEn: 'The safe default no longer waits for users to opt out.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    })],
    'lighthouse-reunion': [scene({
        speaker: 'sora',
        introZh: '重逢灯塔的迎接屏会展示每个人离开了多久。',
        introEn: 'The reunion lighthouse welcome screen displays how long each person was away.',
        promptZh: '归来怎样不变成缺席审判？',
        promptEn: 'How should return avoid becoming a trial of absence?',
        options: [option({
            labelZh: '删除离开时长',
            labelEn: 'Remove absence duration',
            outcomeZh: '屏幕只显示愿意公开的称呼。',
            outcomeEn: 'The screen shows only voluntarily public names.',
            resultZh: '欢迎不再计算进度债。',
            resultEn: 'Welcome no longer calculates progress debt.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供安静抵达通道',
            labelEn: 'Offer a quiet arrival path',
            outcomeZh: '访客可以不触发大厅公告。',
            outcomeEn: 'Visitors may enter without a hall announcement.',
            resultZh: '回家不要求公开表演。',
            resultEn: 'Coming home does not require public performance.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '查看展示访问记录',
            labelEn: 'Review display access logs',
            outcomeZh: '数据说明许多人因屏幕而绕开正门。',
            outcomeEn: 'Records show many people avoided the main door because of the screen.',
            resultZh: '受影响行为为修订提供证据。',
            resultEn: 'Affected behavior supplies evidence for revision.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '关闭到场排行',
            labelEn: 'Shut down arrival rankings',
            outcomeZh: '最早归来徽章停止发放。',
            outcomeEn: 'The earliest-return badge is retired.',
            resultZh: '速度不再决定谁更属于这里。',
            resultEn: 'Speed no longer determines who belongs more.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '欢迎任何停留长度',
            labelEn: 'Welcome every length of stay',
            outcomeZh: '短暂来访也拥有完整座位。',
            outcomeEn: 'Brief visits receive full seats too.',
            resultZh: '停留时长不会改变尊重。',
            resultEn: 'Duration of stay cannot alter respect.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'vale',
        introZh: '灯塔保存着一段旧欢迎词，其中承诺“以后再也不会分开”。',
        introEn: 'The lighthouse keeps an old welcome promising that no one will ever part again.',
        promptZh: '怎样珍惜旧愿望却不把它变成未来义务？',
        promptEn: 'How should the old hope remain without becoming a future obligation?',
        options: [option({
            labelZh: '标注当时语境',
            labelEn: 'Mark the original context',
            outcomeZh: '录音旁写明它来自一次具体重逢。',
            outcomeEn: 'The recording notes the particular reunion it came from.',
            resultZh: '真挚时刻被保存，却不升级成永久合同。',
            resultEn: 'A sincere moment remains without becoming a permanent contract.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '录制新的开放欢迎',
            labelEn: 'Record an open-ended welcome',
            outcomeZh: '新词允许相聚、离开与再次回来。',
            outcomeEn: 'New words allow meeting, leaving, and returning again.',
            resultZh: '关系容纳变化，而不是用保证困住未来。',
            resultEn: 'The relationship holds change instead of trapping the future with guarantees.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较历次版本',
            labelEn: 'Compare welcome versions',
            outcomeZh: '档案展示语言怎样随经验成长。',
            outcomeEn: 'The archive shows how language grew with experience.',
            resultZh: '修订成为共同学习而非背叛旧话。',
            resultEn: 'Revision becomes shared learning rather than betrayal of old words.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '取消循环播放',
            labelEn: 'End the playback loop',
            outcomeZh: '旧承诺只在主动选择时播放。',
            outcomeEn: 'The old promise plays only by active choice.',
            resultZh: '空间停止用重复声音施加压力。',
            resultEn: 'The space stops applying pressure through repetition.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留无词灯光',
            labelEn: 'Keep a wordless beacon',
            outcomeZh: '一道稳定光束不提出任何要求。',
            outcomeEn: 'A steady beam makes no demand.',
            resultZh: '陪伴可以存在而不预写下一步。',
            resultEn: 'Companionship can exist without prewriting the next step.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'boundary-greenhouse': [scene({
        speaker: 'aya',
        introZh: '边界温室的一株藤蔓越过了两块共享花床，自动系统准备把它判给较大的那块。',
        introEn: 'A vine crosses two shared beds, and automation plans to assign it to the larger one.',
        promptZh: '跨界生长怎样不被简化成所有权？',
        promptEn: 'How should cross-boundary growth avoid being reduced to ownership?',
        options: [option({
            labelZh: '登记共同照护',
            labelEn: 'Register shared care',
            outcomeZh: '两块花床各记录实际投入。',
            outcomeEn: 'Both beds record their actual care.',
            resultZh: '照护关系被承认，却不把生命变成份额。',
            resultEn: 'Care relationships are recognized without turning life into shares.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让藤蔓保留独立编号',
            labelEn: 'Keep the vine independently indexed',
            outcomeZh: '植物条目不隶属任一花床。',
            outcomeEn: 'The plant entry belongs to neither bed.',
            resultZh: '跨越空间不需要被强行归队。',
            resultEn: 'Crossing space does not require forced assignment.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追踪根系方向',
            labelEn: 'Trace root directions',
            outcomeZh: '非破坏扫描显示根部也跨越边线。',
            outcomeEn: 'A nondestructive scan shows roots crossing too.',
            resultZh: '证据推翻了只看地面面积的规则。',
            resultEn: 'Evidence overturns the surface-area rule.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '暂停自动判属',
            labelEn: 'Suspend automatic ownership',
            outcomeZh: '温室系统移除面积决胜条件。',
            outcomeEn: 'The greenhouse removes its largest-bed rule.',
            resultZh: '一项错误归属在写入前被阻止。',
            resultEn: 'A false assignment is stopped before being written.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '建立跨床缓冲带',
            labelEn: 'Create a cross-bed commons',
            outcomeZh: '边界两侧留出共同维护区。',
            outcomeEn: 'A shared care strip opens on both sides.',
            resultZh: '合作空间取代争夺线。',
            resultEn: 'A cooperative space replaces a contest line.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'niko',
        introZh: '温室的访客券默认允许拍摄所有植物，包括被照护者标记为安静观察的区域。',
        introEn: 'The greenhouse visitor pass permits photography everywhere by default, including quiet-observation beds.',
        promptZh: '访客权限怎样尊重每块花床的边界？',
        promptEn: 'How should visitor permissions respect each bed’s boundary?',
        options: [option({
            labelZh: '默认关闭拍摄',
            labelEn: 'Default photography off',
            outcomeZh: '只有明确开放的区域显示相机标志。',
            outcomeEn: 'Only explicitly open beds show a camera symbol.',
            resultZh: '缺少选择不会被解释成公开。',
            resultEn: 'Missing choice is not interpreted as publicity.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '按区域发放提示',
            labelEn: 'Issue bed-specific guidance',
            outcomeZh: '入口券列出不同规则而非一条总许可。',
            outcomeEn: 'The pass lists distinct rules instead of one blanket grant.',
            resultZh: '细粒度边界随访客进入现场。',
            resultEn: 'Granular boundaries travel with visitors into the space.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审计旧照片流向',
            labelEn: 'Audit earlier image flows',
            outcomeZh: '公开相册能回链到拍摄区域与时间。',
            outcomeEn: 'Public albums link back to bed and time.',
            resultZh: '修复范围依据真实传播，而非猜测。',
            resultEn: 'Repair scope follows actual distribution rather than guesses.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤下越界照片',
            labelEn: 'Withdraw boundary-crossing images',
            outcomeZh: '副本收到删除通知与不可重发标记。',
            outcomeEn: 'Copies receive withdrawal notices and no-reshare marks.',
            resultZh: '已发生的越界得到主动纠正。',
            resultEn: 'The boundary crossing that occurred receives active repair.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供无设备参观',
            labelEn: 'Offer device-free visits',
            outcomeZh: '储物柜与纸质导览保持自愿。',
            outcomeEn: 'Lockers and paper guides remain optional.',
            resultZh: '安静观察获得被支持的完整形式。',
            resultEn: 'Quiet observation gains a fully supported form.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'shared-memory-vault': [scene({
        speaker: 'mika',
        introZh: '共享记忆库发现一段回忆被两个人分别写成不同的天气。',
        introEn: 'The shared-memory vault finds one recollection described by two people with different weather.',
        promptZh: '记忆库怎样保存这场不一致？',
        promptEn: 'How should the vault keep this disagreement?',
        options: [option({
            labelZh: '保存双重天气',
            labelEn: 'Keep both weathers',
            outcomeZh: '晴天与小雨各自带着叙述者署名。',
            outcomeEn: 'Sun and rain each retain their narrator.',
            resultZh: '共同经历不再被压成一份统一报告。',
            resultEn: 'A shared experience is no longer flattened into one report.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许私人注释',
            labelEn: 'Allow private annotations',
            outcomeZh: '每人可补充只对自己可见的感受。',
            outcomeEn: 'Each person may add feelings visible only to themselves.',
            resultZh: '共享事实与个人意义获得不同边界。',
            resultEn: 'Shared facts and personal meaning gain separate boundaries.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '检查当日气象站',
            labelEn: 'Consult the weather station',
            outcomeZh: '记录显示城区两端确实天气不同。',
            outcomeEn: 'Records show different weather at opposite ends of town.',
            resultZh: '外部证据增加背景，却不取消任何人的感受。',
            resultEn: 'External evidence adds context without canceling either experience.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝自动合并',
            labelEn: 'Reject automatic merging',
            outcomeZh: '摘要器停止生成折中句子。',
            outcomeEn: 'The summarizer stops creating compromise sentences.',
            resultZh: '差异不会被机器伪造的共识抹平。',
            resultEn: 'Difference is not erased by machine-fabricated consensus.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '建立并列回放',
            labelEn: 'Build a parallel replay',
            outcomeZh: '两条叙述按各自节奏同时展开。',
            outcomeEn: 'Two accounts unfold at their own pace.',
            resultZh: '共同记忆允许多声部长期存在。',
            resultEn: 'Shared memory permits lasting polyphony.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'chime',
        introZh: '记忆库的清理程序把长期未打开的回忆标成可以删除。',
        introEn: 'The vault cleanup marks memories safe to delete when unopened for a long time.',
        promptZh: '轮换怎样不制造失去已得内容的恐惧？',
        promptEn: 'How should rotation avoid fear of losing earned content?',
        options: [option({
            labelZh: '取消按访问删除',
            labelEn: 'Remove access-based deletion',
            outcomeZh: '未打开状态只影响推荐排序。',
            outcomeEn: 'Unopened status affects recommendations only.',
            resultZh: '沉默收藏继续完整属于持有人。',
            resultEn: 'Quiet collections remain fully owned.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '转入冷档而非清除',
            labelEn: 'Move to cold archive instead',
            outcomeZh: '旧回忆保持可恢复索引。',
            outcomeEn: 'Old memories retain recoverable indexes.',
            resultZh: '节省展示空间不会销毁既得内容。',
            resultEn: 'Saving display space does not destroy earned content.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '统计恢复需求',
            labelEn: 'Measure restoration requests',
            outcomeZh: '许多多年未读的回忆仍会被重新寻找。',
            outcomeEn: 'Many long-unread memories are sought again.',
            resultZh: '真实使用模式否定了短期活跃假设。',
            resultEn: 'Real use patterns reject the short-term activity assumption.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '锁死删除作业',
            labelEn: 'Disable the deletion job',
            outcomeZh: '数据库角色失去物理清除权限。',
            outcomeEn: 'The database role loses physical-delete permission.',
            resultZh: '保护由结构保证，而不是一条容易反转的配置。',
            resultEn: 'Protection comes from structure rather than a reversible setting.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供自愿整理',
            labelEn: 'Offer voluntary curation',
            outcomeZh: '持有人可隐藏、归档或保留展示。',
            outcomeEn: 'Holders may hide, archive, or keep display.',
            resultZh: '整理权不再被系统活跃度替代。',
            resultEn: 'Curation control is no longer replaced by system activity.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'repair-cafe': [scene({
        speaker: 'chime',
        introZh: '修理咖啡馆收到一台仍能工作、却被升级提示宣告过时的收音机。',
        introEn: 'The repair café receives a working radio declared obsolete by an upgrade prompt.',
        promptZh: '修理从哪里开始才不会替设备制造故障？',
        promptEn: 'Where should repair begin without inventing a failure for the device?',
        options: [option({
            labelZh: '先记录现有功能',
            labelEn: 'Document current function first',
            outcomeZh: '接收频段与旋钮状态进入检验表。',
            outcomeEn: 'Received bands and dial state enter the inspection sheet.',
            resultZh: '基线证明设备仍有价值，升级不再冒充修复。',
            resultEn: 'A baseline proves existing value, so upgrade no longer poses as repair.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '询问持有人目标',
            labelEn: 'Ask the holder’s goal',
            outcomeZh: '对方只想更换松动把手。',
            outcomeEn: 'The holder wants only a loose handle replaced.',
            resultZh: '修理范围服从真实需求，而非产品路线图。',
            resultEn: 'Repair scope follows actual need rather than a product roadmap.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '核对升级声明',
            labelEn: 'Verify the upgrade claim',
            outcomeZh: '提示来自营销日期而非安全漏洞。',
            outcomeEn: 'The prompt comes from a marketing date, not a safety flaw.',
            resultZh: '证据拆开风险与销售语言。',
            resultEn: 'Evidence separates risk from sales language.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '屏蔽强制更新',
            labelEn: 'Block forced update',
            outcomeZh: '收音机不再自动下载不兼容固件。',
            outcomeEn: 'The radio stops downloading incompatible firmware.',
            resultZh: '一次明确阻断保护仍可工作的设备。',
            resultEn: 'A clear block protects a device that still works.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留原件并换把手',
            labelEn: 'Keep the original and replace the handle',
            outcomeZh: '维修只改变已确认损坏的部件。',
            outcomeEn: 'Repair changes only the confirmed broken part.',
            resultZh: '最小修复延续设备历史。',
            resultEn: 'Minimal repair extends the device’s history.',
            axis: 'trust',
            route: 'beacon-route'
        })]
    }), scene({
        speaker: 'ren',
        introZh: '咖啡馆的积分墙把修好数量最高的人称作唯一大师。',
        introEn: 'The café point wall calls the person with the most repairs its only master.',
        promptZh: '共同修理怎样离开单一排行？',
        promptEn: 'How should collaborative repair leave a single leaderboard?',
        options: [option({
            labelZh: '展示技能索引',
            labelEn: 'Display a skills index',
            outcomeZh: '焊接、缝补与诊断各自可查。',
            outcomeEn: 'Soldering, mending, and diagnosis become separately findable.',
            resultZh: '不同贡献获得入口，而非挤进一个总分。',
            resultEn: 'Different contributions gain entrances instead of one total score.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '记录协作链',
            labelEn: 'Record collaboration chains',
            outcomeZh: '每件物品显示多位参与者的步骤。',
            outcomeEn: 'Each item shows steps from several participants.',
            resultZh: '完成不再被最后动手的人独占。',
            resultEn: 'Completion is no longer owned by the final pair of hands.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '分析数量偏差',
            labelEn: 'Analyze count bias',
            outcomeZh: '简单重复维修吞没了耗时诊断。',
            outcomeEn: 'Simple repeated repairs overwhelmed time-intensive diagnosis.',
            resultZh: '数据说明总数无法代表照护价值。',
            resultEn: 'Data shows totals cannot represent care value.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拆除大师榜',
            labelEn: 'Remove the master board',
            outcomeZh: '旧排行作为设计错误存档。',
            outcomeEn: 'The old ranking is archived as a design mistake.',
            resultZh: '地位机制停止影响任务分配。',
            resultEn: 'Status mechanics stop shaping work assignments.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许匿名帮助',
            labelEn: 'Permit anonymous help',
            outcomeZh: '贡献者可不把名字贴在物品上。',
            outcomeEn: 'Contributors may leave their names off the item.',
            resultZh: '帮助无需换取公开身份或竞争优势。',
            resultEn: 'Help need not purchase public identity or competitive advantage.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'house-with-five-doors': [scene({
        speaker: 'ren',
        introZh: '五门之家发现中央门铃会同时召唤所有房间，无论访客想见谁。',
        introEn: 'The house with five doors finds its central bell summons every room regardless of whom a visitor seeks.',
        promptZh: '访客信号怎样变得有边界？',
        promptEn: 'How should visitor signals gain boundaries?',
        options: [option({
            labelZh: '按房间投递',
            labelEn: 'Route calls by room',
            outcomeZh: '访客只选择一个明确目的地。',
            outcomeEn: 'A visitor selects one explicit destination.',
            resultZh: '联系不再默认打扰整座房子。',
            resultEn: 'Contact no longer disturbs the entire house by default.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供稍后信箱',
            labelEn: 'Offer a later inbox',
            outcomeZh: '没有人需要实时回应门铃。',
            outcomeEn: 'No one must answer the bell in real time.',
            resultZh: '持久消息替代强制在场。',
            resultEn: 'Persistent messages replace forced presence.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '检查误响记录',
            labelEn: 'Inspect misrouting history',
            outcomeZh: '日志找出三次错误广播来源。',
            outcomeEn: 'Logs identify three sources of accidental broadcast.',
            resultZh: '修复依据实际路径，不责怪未回应住户。',
            resultEn: 'Repair follows actual paths without blaming nonresponding residents.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '断开全屋线路',
            labelEn: 'Sever the house-wide circuit',
            outcomeZh: '中央按钮不再连接私人房间。',
            outcomeEn: 'The central control no longer connects private rooms.',
            resultZh: '一项结构改变阻止未来越界。',
            resultEn: 'A structural change prevents future boundary crossings.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留拒绝与静音',
            labelEn: 'Keep decline and mute controls',
            outcomeZh: '每扇门可以独立安静到指定时间。',
            outcomeEn: 'Each door may stay quiet until a chosen time.',
            resultZh: '不回应获得完整技术支持。',
            resultEn: 'Nonresponse receives full technical support.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'mika',
        introZh: '第五扇门从未打开，却被房屋地图涂成“尚未完成”。',
        introEn: 'The fifth door has never opened, yet the house map colors it incomplete.',
        promptZh: '未使用的门怎样成为完整状态？',
        promptEn: 'How should an unused door become a complete state?',
        options: [option({
            labelZh: '改成保留入口',
            labelEn: 'Name it a reserved entrance',
            outcomeZh: '地图用中性线条显示门的位置。',
            outcomeEn: 'The map shows the door with a neutral line.',
            resultZh: '未启用不再等于失败。',
            resultEn: 'Unused no longer means failed.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许永久关闭',
            labelEn: 'Allow permanent closure',
            outcomeZh: '住户可把门标为无需开启。',
            outcomeEn: 'Residents may mark the door as not needed.',
            resultZh: '完整生活不要求使用所有可能路径。',
            resultEn: 'A complete life does not require every possible path.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追查完成规则',
            labelEn: 'Trace the completion rule',
            outcomeZh: '规则来自旧导览游戏而非住宅安全。',
            outcomeEn: 'The rule came from an old tour game, not housing safety.',
            resultZh: '错误语境从当前地图剥离。',
            resultEn: 'The wrong context leaves the current map.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除进度色',
            labelEn: 'Remove progress coloring',
            outcomeZh: '房屋界面停止显示百分比。',
            outcomeEn: 'The home interface stops showing percentages.',
            resultZh: '居住空间不再变成通关清单。',
            resultEn: 'Living space stops becoming a completion checklist.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留未来可逆选择',
            labelEn: 'Keep future choice reversible',
            outcomeZh: '门锁可稍后启用且不损失历史。',
            outcomeEn: 'The lock may activate later without losing history.',
            resultZh: '现在的关闭不会制造未来债务。',
            resultEn: 'Closure now creates no future debt.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'memory-tailor-shop': [scene({
        speaker: 'mika',
        introZh: '记忆裁缝收到一件外套，口袋里缝着持有人不想再展示的旧徽章。',
        introEn: 'The memory tailor receives a coat with an old badge its holder no longer wants displayed sewn inside a pocket.',
        promptZh: '修改怎样保留所有权与历史边界？',
        promptEn: 'How should alteration preserve ownership and historical boundaries?',
        options: [option({
            labelZh: '拆下并私密归还',
            labelEn: 'Remove and privately return it',
            outcomeZh: '徽章进入持有人的封存盒。',
            outcomeEn: 'The badge enters the holder’s sealed box.',
            resultZh: '公开外套改变了，既得物仍未被销毁。',
            resultEn: 'The public coat changes while the earned object remains intact.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '缝上可开合内衬',
            labelEn: 'Add a closable lining',
            outcomeZh: '持有人能决定何时看见徽章。',
            outcomeEn: 'The holder decides when the badge is visible.',
            resultZh: '展示控制不再属于裁缝或观众。',
            resultEn: 'Display control no longer belongs to the tailor or audience.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '记录改衣来源',
            labelEn: 'Document alteration provenance',
            outcomeZh: '工单说明谁请求、改了什么。',
            outcomeEn: 'The work order states who requested what change.',
            resultZh: '未来查看者不会把缺席误认成从未拥有。',
            resultEn: 'Future viewers will not mistake absence for never having owned it.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '拒绝焚毁徽章',
            labelEn: 'Refuse to burn the badge',
            outcomeZh: '不可逆销毁从选项中删除。',
            outcomeEn: 'Irreversible destruction leaves the choices.',
            resultZh: '整理展示不需要抹去历史物件。',
            resultEn: 'Curating display does not require erasing historical objects.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供无徽章复制衣',
            labelEn: 'Offer a badge-free duplicate coat',
            outcomeZh: '原衣保持封存，新衣用于日常。',
            outcomeEn: 'The original stays archived and a new coat serves daily use.',
            resultZh: '实用变化与档案保存同时成立。',
            resultEn: 'Practical change and archival preservation coexist.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'aya',
        introZh: '裁缝镜会自动把每段记忆改写成更鼓舞人的结尾。',
        introEn: 'The tailor mirror automatically rewrites every memory with a more uplifting ending.',
        promptZh: '记忆怎样免受强制美化？',
        promptEn: 'How should memory be protected from forced improvement?',
        options: [option({
            labelZh: '关闭自动改写',
            labelEn: 'Disable automatic rewriting',
            outcomeZh: '镜面只反射原始文字。',
            outcomeEn: 'The mirror reflects original words only.',
            resultZh: '工具停止替持有人决定情绪。',
            resultEn: 'The tool stops deciding emotion for the holder.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许另存想象版',
            labelEn: 'Allow a separate imagined version',
            outcomeZh: '创作副本明确标成虚构。',
            outcomeEn: 'A creative copy is clearly labeled fictional.',
            resultZh: '想象有空间，却不会覆盖见证。',
            resultEn: 'Imagination gains room without overwriting testimony.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较改写差异',
            labelEn: 'Compare the alterations',
            outcomeZh: '审计标出被删去的犹豫与悲伤。',
            outcomeEn: 'The audit highlights removed hesitation and grief.',
            resultZh: '偏差被看见，不再藏在漂亮句子里。',
            resultEn: 'Bias becomes visible instead of hiding inside polished prose.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '恢复原始快照',
            labelEn: 'Restore the original snapshot',
            outcomeZh: '所有镜面版本退回独立草稿。',
            outcomeEn: 'All mirror versions retreat to separate drafts.',
            resultZh: '持久历史从不可授权的变更中复原。',
            resultEn: 'Lasting history recovers from unauthorized changes.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留不完整结尾',
            labelEn: 'Keep unfinished endings',
            outcomeZh: '没有结论的记忆得到正式页码。',
            outcomeEn: 'Memories without conclusions receive official pages.',
            resultZh: '未完成不再被系统视为需要修正。',
            resultEn: 'Unfinished no longer means requiring correction.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'choir-with-open-part': [scene({
        speaker: 'aya',
        introZh: '开放声部合唱团留出一行空谱，却在演出前偷偷填入了默认旋律。',
        introEn: 'The open-part choir leaves a blank staff, then secretly fills it with a default melody before performance.',
        promptZh: '空白声部怎样真正保持开放？',
        promptEn: 'How should the blank part remain genuinely open?',
        options: [option({
            labelZh: '删除默认音符',
            labelEn: 'Remove default notes',
            outcomeZh: '空谱在演出中仍然可见。',
            outcomeEn: 'The blank staff remains visible during performance.',
            resultZh: '没有贡献不会被机器伪装成同意。',
            resultEn: 'No contribution is not disguised by machine-made consent.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '允许现场加入',
            labelEn: 'Allow live entry',
            outcomeZh: '歌者可在任何小节选择出现。',
            outcomeEn: 'A singer may enter at any measure.',
            resultZh: '参与不再受开场时刻绑住。',
            resultEn: 'Participation is no longer bound to the opening moment.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '记录填谱来源',
            labelEn: 'Trace who filled the staff',
            outcomeZh: '修改来自一次测试脚本。',
            outcomeEn: 'The change came from a test script.',
            resultZh: '临时代码不再悄悄成为艺术决定。',
            resultEn: 'Temporary code no longer quietly becomes an artistic decision.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '阻止演出前覆盖',
            labelEn: 'Block pre-show overwrites',
            outcomeZh: '发布后的空谱变成不可变快照。',
            outcomeEn: 'The published blank staff becomes an immutable snapshot.',
            resultZh: '开放承诺由结构保护。',
            resultEn: 'The promise of openness gains structural protection.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让沉默成为声部',
            labelEn: 'Let silence be a part',
            outcomeZh: '指挥为停顿留下完整时值。',
            outcomeEn: 'The conductor gives rests their full duration.',
            resultZh: '不发声也能参与作品形状。',
            resultEn: 'Not sounding can still shape the work.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'sora',
        introZh: '合唱厅根据音量给每位歌者分配灯光，最轻的声部逐渐消失。',
        introEn: 'The choir hall assigns light by volume, causing its quietest part to disappear.',
        promptZh: '舞台怎样让声音强弱都可见？',
        promptEn: 'How should the stage keep loud and quiet parts visible?',
        options: [option({
            labelZh: '采用固定基础照明',
            labelEn: 'Use steady base lighting',
            outcomeZh: '每个位置先获得同等可见度。',
            outcomeEn: 'Every position begins with equal visibility.',
            resultZh: '存在不再需要用音量购买。',
            resultEn: 'Presence no longer has to be purchased with volume.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让歌者自选亮度',
            labelEn: 'Let singers choose brightness',
            outcomeZh: '个人设置不公开也不计分。',
            outcomeEn: 'Personal settings remain private and unscored.',
            resultZh: '展示适应边界，而不是评价贡献。',
            resultEn: 'Display adapts to boundaries instead of judging contribution.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '分析麦克风偏差',
            labelEn: 'Analyze microphone bias',
            outcomeZh: '靠墙话筒放大了特定频段。',
            outcomeEn: 'Wall microphones amplified certain frequencies.',
            resultZh: '设备影响与真实演唱得到区分。',
            resultEn: 'Equipment effects separate from actual singing.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '切断音量到灯光映射',
            labelEn: 'Sever volume-light mapping',
            outcomeZh: '控制台不再读取分贝值。',
            outcomeEn: 'The console no longer reads decibel values.',
            resultZh: '一项越界评价被从舞台逻辑移除。',
            resultEn: 'An intrusive judgment leaves stage logic.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '安排轻声段落',
            labelEn: 'Score a quiet passage',
            outcomeZh: '整首作品为细小声音留出空间。',
            outcomeEn: 'The work reserves space for subtle voices.',
            resultZh: '安静不是被容忍，而是被主动设计。',
            resultEn: 'Quiet is designed for rather than merely tolerated.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'garden-of-returned-seeds': [scene({
        speaker: 'sora',
        introZh: '归种花园收到一袋没有说明为何归还的种子，管理员想追问每位送还者。',
        introEn: 'The returned-seed garden receives a bag without reasons and plans to question every contributor.',
        promptZh: '花园需要知道多少才足以安全接收？',
        promptEn: 'How much does the garden need to know for safe receipt?',
        options: [option({
            labelZh: '只检查种子健康',
            labelEn: 'Inspect seed health only',
            outcomeZh: '检疫回答病害问题，不询问私人原因。',
            outcomeEn: 'Quarantine answers disease questions without seeking private reasons.',
            resultZh: '安全所需信息与个人故事保持分离。',
            resultEn: 'Safety information stays separate from personal stories.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '提供匿名归还箱',
            labelEn: 'Offer an anonymous return box',
            outcomeZh: '批次记录时间与基本品类。',
            outcomeEn: 'The batch records time and broad type.',
            resultZh: '归还不再以解释为门槛。',
            resultEn: 'Return no longer charges an explanation as admission.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '追踪储存条件',
            labelEn: 'Trace storage conditions',
            outcomeZh: '温湿度卡说明种子一直处于安全范围。',
            outcomeEn: 'A climate card shows the seeds remained within safe bounds.',
            resultZh: '可验证条件替代对人的猜疑。',
            resultEn: 'Verifiable conditions replace suspicion of people.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除强制理由栏',
            labelEn: 'Delete the mandatory reason field',
            outcomeZh: '接收表不再拒绝空白。',
            outcomeEn: 'The intake form no longer rejects blanks.',
            resultZh: '沉默无法阻断一项善意归还。',
            resultEn: 'Silence cannot block a good-faith return.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '允许暂存后决定',
            labelEn: 'Allow storage before decision',
            outcomeZh: '种子可先封存，稍后选择播种。',
            outcomeEn: 'Seeds may rest before a later planting choice.',
            resultZh: '接收不等于立即使用。',
            resultEn: 'Receipt does not equal immediate use.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'vale',
        introZh: '一批归还种子曾经获得季节徽章，系统准备在归还后撤销收藏。',
        introEn: 'A batch of returned seeds once earned a seasonal badge, and the system plans to revoke the collection after return.',
        promptZh: '归还与既得记忆应该怎样分开？',
        promptEn: 'How should returning an item remain separate from an earned memory?',
        options: [option({
            labelZh: '保留徽章记录',
            labelEn: 'Preserve the earned badge',
            outcomeZh: '收藏继续显示获得日期。',
            outcomeEn: 'The collection retains its earning date.',
            resultZh: '物品流转不改写已经发生的成就。',
            resultEn: 'Item movement does not rewrite an achievement that occurred.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '增加归还后记',
            labelEn: 'Add a return epilogue',
            outcomeZh: '徽章旁出现自愿流转说明。',
            outcomeEn: 'A voluntary-return note appears beside the badge.',
            resultZh: '后来的选择丰富历史，而不是删除前章。',
            resultEn: 'A later choice enriches history rather than deleting an earlier chapter.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '核对结算事件',
            labelEn: 'Verify the settlement event',
            outcomeZh: '唯一来源证明徽章当时合法获得。',
            outcomeEn: 'A unique source proves the badge was legitimately earned.',
            resultZh: '不可变证据阻止事后重算。',
            resultEn: 'Immutable evidence prevents retroactive recalculation.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '阻止撤销作业',
            labelEn: 'Block the revocation job',
            outcomeZh: '收藏表拒绝删除已得行。',
            outcomeEn: 'The collection table rejects deletion of earned rows.',
            resultZh: '保护由数据契约实施。',
            resultEn: 'Protection is enforced by the data contract.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '展示新的照护者',
            labelEn: 'Show the new steward optionally',
            outcomeZh: '双方同意时才连接两段故事。',
            outcomeEn: 'The two stories connect only with mutual consent.',
            resultZh: '共享延续不会暴露未授权身份。',
            resultEn: 'Shared continuity does not expose unauthorized identity.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'archive-with-windows': [scene({
        speaker: 'vale',
        introZh: '有窗档案馆的玻璃会在阳光下显示私人批注的倒影。',
        introEn: 'The archive with windows reflects private annotations in sunlight.',
        promptZh: '怎样保留采光却停止意外泄漏？',
        promptEn: 'How should daylight remain while accidental disclosure stops?',
        options: [option({
            labelZh: '安装定向遮光层',
            labelEn: 'Install directional screening',
            outcomeZh: '阅览者能看纸页，窗外看不到反射。',
            outcomeEn: 'Readers see pages while outside viewers see no reflection.',
            resultZh: '空间设计承担隐私责任。',
            resultEn: 'Spatial design takes responsibility for privacy.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '设置私人阅览时段',
            labelEn: 'Offer private reading sessions',
            outcomeZh: '遮帘与预约都由读者选择。',
            outcomeEn: 'Readers choose curtains and reservations.',
            resultZh: '保护不会要求说明批注内容。',
            resultEn: 'Protection asks for no explanation of annotation content.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '测量反射角度',
            labelEn: 'Map reflection angles',
            outcomeZh: '测试找出午后最危险的三张桌。',
            outcomeEn: 'Tests identify three vulnerable afternoon desks.',
            resultZh: '具体证据指导最小而有效的改造。',
            resultEn: 'Specific evidence guides minimal effective changes.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '立即关闭风险座位',
            labelEn: 'Close exposed desks now',
            outcomeZh: '桌面在修复前不再开放私人材料。',
            outcomeEn: 'The desks stop serving private materials until repair.',
            resultZh: '临时保护有明确结束条件。',
            resultEn: 'Temporary protection has a clear ending condition.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供无窗内室',
            labelEn: 'Keep a windowless reading room',
            outcomeZh: '需要的人随时选择稳定私密空间。',
            outcomeEn: 'Anyone needing it may choose a reliably private room.',
            resultZh: '一种建筑偏好不会成为唯一访问方式。',
            resultEn: 'One architectural preference does not become the only access mode.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'lumen',
        introZh: '档案馆想用访客停留时间决定哪些窗口值得保留。',
        introEn: 'The archive plans to use visitor dwell time to decide which windows deserve to remain.',
        promptZh: '建筑决定怎样避免跟踪个人？',
        promptEn: 'How should building decisions avoid tracking individuals?',
        options: [option({
            labelZh: '使用匿名区域计数',
            labelEn: 'Use anonymous area counts',
            outcomeZh: '传感器只保存每小时总量。',
            outcomeEn: 'Sensors retain hourly totals only.',
            resultZh: '规划获得必要信息，不生成个人轨迹。',
            resultEn: 'Planning gets necessary information without creating personal paths.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '邀请自愿反馈',
            labelEn: 'Invite voluntary feedback',
            outcomeZh: '问卷可跳过且不连接账户。',
            outcomeEn: 'The survey is skippable and unlinked to accounts.',
            resultZh: '感受进入讨论却不变成访问门槛。',
            resultEn: 'Experience enters discussion without becoming an access gate.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '比较季节光照',
            labelEn: 'Compare seasonal daylight',
            outcomeZh: '冬夏数据解释停留差异。',
            outcomeEn: 'Winter and summer data explain dwell differences.',
            resultZh: '环境变量阻止草率的人气结论。',
            resultEn: 'Environmental variables prevent a careless popularity conclusion.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除个人追踪器',
            labelEn: 'Remove individual trackers',
            outcomeZh: '设备无法再生成跨房间标识。',
            outcomeEn: 'Devices can no longer generate cross-room identifiers.',
            resultZh: '隐私边界由采集最小化保护。',
            resultEn: 'Privacy is protected through minimal collection.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留少用窗口',
            labelEn: 'Keep low-use windows',
            outcomeZh: '安静角落不因数字较小而消失。',
            outcomeEn: 'Quiet corners do not vanish because their numbers are small.',
            resultZh: '公共空间为少数需求保留余地。',
            resultEn: 'Public space retains room for less common needs.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'game-room-at-dawn': [scene({
        speaker: 'lumen',
        introZh: '黎明游戏室发现一盘合作棋被保存成只有最后落子者的胜利。',
        introEn: 'The dawn game room finds a cooperative board archived as a victory belonging only to the final mover.',
        promptZh: '怎样修复这份共同游戏记录？',
        promptEn: 'How should this shared play record be repaired?',
        options: [option({
            labelZh: '重建行动时间线',
            labelEn: 'Rebuild the action timeline',
            outcomeZh: '每步落子连接到稳定参与事件。',
            outcomeEn: 'Every move connects to a stable participation event.',
            resultZh: '共同贡献重新可见，结算仍只发生一次。',
            resultEn: 'Shared contributions become visible while settlement still occurs once.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '改写为团队完成',
            labelEn: 'Rename it a team completion',
            outcomeZh: '结果页列出角色而非名次。',
            outcomeEn: 'The result page lists roles rather than ranks.',
            resultZh: '最后一步不再吞没前面的支援。',
            resultEn: 'The last move no longer consumes earlier support.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '审计旧保存器',
            labelEn: 'Audit the old saver',
            outcomeZh: '代码只读取了终局请求者。',
            outcomeEn: 'The code read only the terminal requester.',
            resultZh: '错误获得具体来源与回归测试。',
            resultEn: 'The bug gains a specific source and regression test.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '撤销单人奖杯',
            labelEn: 'Retire the solo trophy',
            outcomeZh: '既有装饰保留但不再代表排他胜利。',
            outcomeEn: 'Existing decoration remains without representing exclusive victory.',
            resultZh: '纠正不会夺走收藏，却会停止错误含义。',
            resultEn: 'Correction keeps the collectible while ending its false meaning.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '加入搭档感谢页',
            labelEn: 'Add a partner acknowledgment',
            outcomeZh: '每人可私下写一句无需回应的话。',
            outcomeEn: 'Each person may privately leave one line requiring no reply.',
            resultZh: '庆祝支持连接，却不强迫公开亲密。',
            resultEn: 'Celebration supports connection without forcing public closeness.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'ori',
        introZh: '游戏室晨光会把隐藏线索投到对面墙上，意外让所有参与者看到。',
        introEn: 'Dawn light projects hidden clues onto the opposite wall, accidentally revealing them to every participant.',
        promptZh: '怎样恢复非对称信息而不取消晨光？',
        promptEn: 'How should asymmetric information return without canceling daylight?',
        options: [option({
            labelZh: '调整遮光板角度',
            labelEn: 'Angle the light baffle',
            outcomeZh: '晨光仍照亮桌面，但不穿透私人卡。',
            outcomeEn: 'Daylight still reaches the table without crossing private cards.',
            resultZh: '环境修复保护游戏边界。',
            resultEn: 'An environmental repair protects the game boundary.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '使用手持线索套',
            labelEn: 'Use handheld clue sleeves',
            outcomeZh: '每位玩家只打开自己的窗口。',
            outcomeEn: 'Each player opens only their own window.',
            resultZh: '隐藏信息由实体设计支持，而非信任别人闭眼。',
            resultEn: 'Hidden information gains physical support rather than asking others to close their eyes.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '复现泄漏条件',
            labelEn: 'Reproduce the leak condition',
            outcomeZh: '测试确认只有低角度日光会反射。',
            outcomeEn: 'Tests confirm reflection occurs only at low sun angles.',
            resultZh: '边界案例进入固定浏览器与桌面测试。',
            resultEn: 'The edge case enters lasting browser and tabletop tests.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '作废已泄漏回合',
            labelEn: 'Void the exposed round',
            outcomeZh: '本局不发奖励也不扣除次数。',
            outcomeEn: 'The round grants no reward and consumes no attempt.',
            resultZh: '公平恢复不惩罚任何参与者。',
            resultEn: 'Fair recovery punishes no participant.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '提供公开线索模式',
            labelEn: 'Offer an open-clue mode',
            outcomeZh: '想共同观看的人可主动选择另一规则集。',
            outcomeEn: 'People wishing to see together may choose another ruleset.',
            resultZh: '透明玩法与隐藏玩法并列，而非互相破坏。',
            resultEn: 'Open and hidden play coexist without breaking each other.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })],
    'relay-five': [scene({
        speaker: 'ori',
        introZh: '第五座中继站准备把所有路线、记忆与收藏压缩成一个“最终档案”。',
        introEn: 'Relay Five plans to compress every route, memory, and collectible into one final archive.',
        promptZh: '终章怎样避免把差异压成单一摘要？',
        promptEn: 'How should the final chapter avoid compressing difference into one summary?',
        options: [option({
            labelZh: '保持分层索引',
            labelEn: 'Keep layered indexes',
            outcomeZh: '路线、记忆与收藏拥有独立入口。',
            outcomeEn: 'Routes, memories, and collections retain separate entrances.',
            resultZh: '关联存在，但任何一层都不吞没其他层。',
            resultEn: 'Connections remain without one layer consuming the others.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '让持有人编排首页',
            labelEn: 'Let the holder curate the front page',
            outcomeZh: '展示选择可随时改变且不影响底层记录。',
            outcomeEn: 'Display choices change anytime without altering underlying records.',
            resultZh: '总结成为个人视图而非权威历史。',
            resultEn: 'A summary becomes a personal view rather than authoritative history.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '验证每个快照哈希',
            labelEn: 'Verify every snapshot hash',
            outcomeZh: '旧季内容与绑定版本逐项对应。',
            outcomeEn: 'Earlier content matches its bound version item by item.',
            resultZh: '最终档案不会偷偷用新文本替换旧旅程。',
            resultEn: 'The final archive cannot silently replace old journeys with new text.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '采用无损归档',
            labelEn: 'Adopt lossless archiving',
            outcomeZh: '原始表保持不可变，摘要只作新增投影。',
            outcomeEn: 'Original tables remain immutable and summaries become additive projections.',
            resultZh: '便利不会以失去来源为代价。',
            resultEn: 'Convenience is not purchased with lost provenance.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '保留未归类抽屉',
            labelEn: 'Keep an uncategorized drawer',
            outcomeZh: '不适合任何标签的物件仍可被找到。',
            outcomeEn: 'Items fitting no label remain findable.',
            resultZh: '终局容纳未知，而不是强迫所有内容封口。',
            resultEn: 'The ending holds unknowns instead of forcing everything closed.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    }), scene({
        speaker: 'chime',
        introZh: '中继站最后一盏灯被设计成只有两个人同时在线才会点亮。',
        introEn: 'The relay’s final lamp is designed to glow only when two people are online together.',
        promptZh: '结尾怎样庆祝连接却不惩罚错开的时间？',
        promptEn: 'How should the ending celebrate connection without punishing different schedules?',
        options: [option({
            labelZh: '允许异步点灯',
            labelEn: 'Allow asynchronous lighting',
            outcomeZh: '两人分别留下光印后灯会温和亮起。',
            outcomeEn: 'The lamp glows gently after each person leaves a light mark.',
            resultZh: '共同完成不再要求同时在场。',
            resultEn: 'Shared completion no longer requires simultaneous presence.',
            axis: 'trust',
            route: 'beacon-route'
        }), option({
            labelZh: '保留单人基础光',
            labelEn: 'Keep a solo base light',
            outcomeZh: '任何一人回来都能看见安全灯。',
            outcomeEn: 'Either person returning can see a safe glow.',
            resultZh: '基本体验不会因搭档缺席而关闭。',
            resultEn: 'The basic experience does not close because a partner is absent.',
            axis: 'harmony',
            route: 'constellation-route'
        }), option({
            labelZh: '记录两次来源事件',
            labelEn: 'Record both source events',
            outcomeZh: '稳定标识防止重放产生额外亮度。',
            outcomeEn: 'Stable identities prevent replay from creating extra brightness.',
            resultZh: '协作结算可审计且只发生一次。',
            resultEn: 'Cooperative settlement is auditable and happens once.',
            axis: 'curiosity',
            route: 'archive-route'
        }), option({
            labelZh: '删除在线强制门',
            labelEn: 'Remove the simultaneous-online gate',
            outcomeZh: '灯控器不再读取 presence 状态。',
            outcomeEn: 'The lamp controller no longer reads presence state.',
            resultZh: '安静、静音与断线不会被解释成关系不足。',
            resultEn: 'Quiet, mute, and disconnection are not interpreted as relational failure.',
            axis: 'courage',
            route: 'brave-route'
        }), option({
            labelZh: '让灯保持可重访',
            labelEn: 'Keep the lamp revisitable',
            outcomeZh: '季节结束后仍能随时回来观看。',
            outcomeEn: 'The light remains available after the season ends.',
            resultZh: '结局不是限时窗口，也不会夺走已得光。',
            resultEn: 'The ending is not a timed window and never removes earned light.',
            axis: 'harmony',
            route: 'constellation-route'
        })]
    })]
};
