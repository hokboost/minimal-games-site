'use strict';

const {
    validateEligibilityRule,
    validateRule
} = require('../../../domain/quests/v2/rules');

function quest(slug, category, titleZh, titleEn, descriptionZh, descriptionEn, evidenceKind = 'text') {
    return Object.freeze({
        slug, version: 1, status: 'active', category,
        tags: Object.freeze([category, 'phase8']), difficulty: 'guided', estimatedMinutes: 15,
        safetyClass: category === 'wellbeing' ? 'wellbeing' : 'standard',
        titleZh, titleEn, descriptionZh, descriptionEn,
        hintZh: '只提交虚构或站内信息；可以保存草稿、跳过或稍后继续。',
        hintEn: 'Use fictional or in-product information only; save a draft, skip, or continue later.',
        completionZh: '成果已进入长期档案，不会随每周轮换消失。',
        completionEn: 'The result enters the lasting archive and will not expire with weekly rotation.',
        verificationMode: 'manual', consentCategory: category,
        eligibilityRule: validateEligibilityRule({ op: 'relationship_level', minimum: 1 }),
        completionRule: validateRule({ op: 'evidence_approved' }), evidenceKind,
        rewardPoints: 0, cooldownHours: 168, repeatable: false
    });
}

const rows = [
    ['harbor-source-map','exploration','港灯来源地图','Harbor Provenance Map','为三条虚构航线标注观测、推测和未知来源。','Label observation, inference, and unknown sources for three fictional routes.'],
    ['exit-before-entry','exploration','先画出口','Draw the Exit First','为一个合作场景先设计安全退出，再补入口。','Design a safe exit for a co-op scene before adding its entrance.','checklist'],
    ['quiet-inbox-walkthrough','exploration','安静收件箱走查','Quiet Inbox Walkthrough','检查安静时段消息只入箱、不产生实时催促。','Check that quiet-hour messages persist without live pressure.','checklist'],
    ['version-window-tour','exploration','版本窗巡游','Version Window Tour','比较同一虚构档案的两个版本并写出差异来源。','Compare two fictional archive versions and record where they differ.'],
    ['unknown-label-practice','exploration','未知标签练习','Unknown Label Practice','把一项无法确认的信息明确写成未知而非猜测。','Mark one unconfirmed fact as unknown rather than guessing.'],
    ['parallel-entrance-sketch','exploration','平行入口草图','Parallel Entrance Sketch','为手机、键盘和低干扰模式各画一条同等入口。','Sketch equal mobile, keyboard, and low-distraction entrances.'],
    ['archive-return-path','exploration','档案返程线','Archive Return Path','验证归档项目仍能恢复且不会重复领取价值。','Verify an archived item can return without settling value twice.','checklist'],
    ['consent-state-reading','exploration','同意状态辨读','Read Consent States','用虚构例子区分允许、静音、拒绝和撤回。','Use fictional examples to distinguish allow, mute, decline, and withdraw.'],
    ['season-snapshot-check','exploration','赛季快照检查','Season Snapshot Check','确认旧故事运行仍显示绑定版本而非当前内容。','Confirm an old story run uses its bound version rather than current content.','checklist'],
    ['collection-no-expiry-check','exploration','收藏无期限检查','No-Expiry Collection Check','找到一项已得收藏并确认轮换不会回收。','Find an earned collectible and confirm rotation cannot reclaim it.','checklist'],

    ['repair-blocker-route','game_mastery','绕开损坏星格','Route Around a Broken Star','在星图协修中规划一条不穿过阻挡格的路线。','Plan a Constellation Repair route that avoids blocked cells.'],
    ['duet-window-reflection','game_mastery','双奏窗口复盘','Duet Window Reflection','记录一次按服务器节拍窗行动的成功或失误。','Reflect on one action made against a server-timed duet window.'],
    ['mystery-false-link','game_mastery','撤销错误证据线','Undo a False Evidence Link','在谜案拼图中识别并移除一条不成立的连接。','Identify and remove one unsupported Mystery Board connection.','checklist'],
    ['weaver-constraint-plan','game_mastery','接龙约束计划','Weaver Constraint Plan','为故事接龙选择三个能产生不同分支的封闭卡片。','Choose three closed Story Weaver cards that create distinct branches.'],
    ['craft-conservation-audit','game_mastery','工坊守恒检查','Craft Conservation Audit','核对一次制作前后材料、收藏和房间槽位守恒。','Check material, collection, and room-slot conservation around one craft.','checklist'],
    ['meteor-role-debrief','game_mastery','流星角色复盘','Meteor Role Debrief','比较主防线与支援信标对同一回合的不同贡献。','Compare main defense and support-beacon contributions to one turn.'],
    ['maze-dead-end-note','game_mastery','迷宫死路笔记','Maze Dead-End Note','记录一个本地出口如何成为死路而未泄露完整解。','Record how a local exit became a dead end without exposing the full solution.'],
    ['bingo-trusted-source','game_mastery','宾果可信来源','Bingo Trusted Source','说明为何浏览器自报事件不能推进直播宾果。','Explain why a browser-reported event cannot advance Broadcast Bingo.'],
    ['echo-view-boundary','game_mastery','回声视角边界','Echo View Boundary','比较两名玩家投影并确认彼此隐藏线索未泄露。','Compare two player projections and confirm clues remain asymmetric.','checklist'],
    ['prediction-fiction-check','game_mastery','猜心虚构检查','Prediction Fiction Check','确认猜心题只描述虚构偏好，不含真实敏感画像。','Confirm a prediction prompt uses fictional preferences and no sensitive profile.','checklist'],

    ['harbor-letter-scene','story','港口退信场景','Harbor Returned-Letter Scene','写一段角色退回邀请且关系不受惩罚的场景。','Write a scene where a character returns an invitation without relationship penalty.'],
    ['two-valid-memories','story','两份都成立的记忆','Two Valid Memories','为同一虚构时刻写两份矛盾但可并存的回忆。','Write two conflicting yet coexisting memories of one fictional moment.'],
    ['expired-promise-ending','story','过期承诺结局','Expired Promise Ending','设计一个承认旧承诺失效而仍保持尊重的结局。','Design an ending that respects an expired promise without enforcing it.'],
    ['unnamed-star-dialogue','story','未命名星对话','Unnamed Star Dialogue','写一段角色拒绝被分类并仍能进入档案的对话。','Write dialogue where a character declines classification and remains archived.'],
    ['quiet-reunion-beat','story','安静重逢节拍','Quiet Reunion Beat','描述一次不播放旧留言也能成立的重逢。','Describe a reunion that works without replaying old messages.'],
    ['five-door-conclusion','story','五门共同结论','Five-Door Conclusion','为五个同等入口写一个没有官方正门的结论。','Write a conclusion with five equal entrances and no official front door.'],
    ['repair-with-visible-tear','story','留着裂口的修复','Repair With a Visible Tear','写一段修复没有假装过去完整的叙事。','Write a repair scene that does not pretend the past was whole.'],
    ['open-part-monologue','story','空声部独白','Open-Part Monologue','让角色说明空位为何不是等待某人的压力。','Have a character explain why an open part pressures no one to arrive.'],
    ['return-with-changed-soil','story','带着新土归来','Return With Changed Soil','写一段归来者不必恢复原样的欢迎词。','Write a welcome where a returnee need not restore an old form.'],
    ['home-as-right','story','把家写成权利','Write Home as a Right','分别用返回、离开与拒绝定义虚构的家。','Define fictional home through return, leaving, and refusal.'],

    ['paper-moon-label','creativity','纸月安全标签','Paper Moon Safety Label','为不会复制手写内容的纸月写材料说明。','Write a material note for a paper moon that copies no handwriting.'],
    ['centerless-chart','creativity','无中心星图','Centerless Star Chart','设计一张可从任意点开始阅读的星图。','Design a star chart readable from any starting point.'],
    ['silent-firework-card','creativity','安静烟花卡','Quiet Firework Card','制作一张不闪烁、不倒计时的庆祝概念。','Create a celebration concept without flashing or countdown.'],
    ['multicolor-boundary-key','creativity','多色边界图例','Multicolor Boundary Key','为十二种虚构叶色写不分高低的边界图例。','Create a nonranked boundary legend for twelve fictional leaf colors.'],
    ['retry-chair-design','creativity','重试椅设计','Retry Chair Design','设计一把让失败局与首通同桌的收藏椅。','Design a collectible chair that seats retries beside first clears.'],
    ['windowed-archive-poster','creativity','有窗档案海报','Windowed Archive Poster','用两个图层表达历史正文与当前天气旁注。','Use two layers to show archive text and current-weather notes.'],
    ['keyless-foyer-model','creativity','无钥匙门厅模型','Keyless Foyer Model','描述一个无需身份也能进入的公共门厅。','Describe a public foyer that needs no identity to enter.'],
    ['safe-provenance-icon','creativity','安全来源图标','Safe Provenance Icon','设计分别表示观察、推测、更正和未知的图标。','Design icons for observation, inference, correction, and unknown.'],
    ['nonfunctional-keepsake','creativity','无功能纪念物','Nonfunctional Keepsake','为不宣称能运行的旧设备写收藏卡。','Write a collection card for an old device that claims no function.'],
    ['unfinished-constellation','creativity','未完成星座','Unfinished Constellation','留出一段可扩展空线并说明它不等待指定人物。','Leave an extensible blank line that waits for no named person.'],

    ['offline-opening-rehearsal','streaming_practice','离线开场彩排','Offline Opening Rehearsal','排练一段无需真实开播的清楚开场。','Rehearse a clear opening without going live.'],
    ['break-without-apology','streaming_practice','无需道歉的休息卡','Break Card Without Apology','写一张不解释私人原因的休息提示。','Write a break notice without private explanations.'],
    ['equal-volume-check','streaming_practice','等权音量检查','Equal-Weight Volume Check','确认响亮反馈不会比安静反馈获得更高权重。','Confirm loud feedback receives no more weight than quiet feedback.','checklist'],
    ['fallback-scene-switch','streaming_practice','备用场景切换','Fallback Scene Switch','练习从主场景安全切换到无需等待的备用页。','Practice switching safely to a fallback page that asks no one to wait.','checklist'],
    ['private-media-cleanup','streaming_practice','私人介质清理','Private Media Cleanup','用虚构样本检查设备验收不播放旧私人内容。','Use fictional media to verify device acceptance plays no old private content.','checklist'],
    ['quiet-presence-test','streaming_practice','安静在线状态测试','Quiet Presence Test','确认安静时段持久收件但不广播presence。','Confirm quiet hours persist inbox delivery without broadcasting presence.','checklist'],
    ['keyboard-exit-drill','streaming_practice','键盘退出演练','Keyboard Exit Drill','仅用键盘找到并触发一个无惩罚退出动作。','Find and trigger a penalty-free exit using keyboard only.','checklist'],
    ['mobile-busy-state','streaming_practice','移动端忙碌状态','Mobile Busy State','检查提交期间所有操作被禁用且规则禁用保持不变。','Check all actions disable during mutation while rule-disabled controls stay disabled.','checklist'],
    ['reconnect-catchup-check','streaming_practice','重连补拉检查','Reconnect Catch-Up Check','模拟刷新并确认只补拉缺失序号、不重复渲染。','Simulate refresh and confirm only missing sequences render.','checklist'],
    ['gentle-closing-cue','streaming_practice','温和收尾提示','Gentle Closing Cue','排练一个不要求观众继续停留的结尾。','Rehearse a close that never asks viewers to remain.'],

    ['asymmetric-map-handshake','coop','不对称地图握手','Asymmetric Map Handshake','为双方各写一条足够协作但不泄露答案的线索。','Write one clue per partner that supports cooperation without revealing answers.'],
    ['partner-offline-fallback','coop','搭档离线替代线','Partner Offline Fallback','设计搭档断线后可安全完成或退出的步骤。','Design steps to finish or leave safely after a partner disconnects.'],
    ['mutual-ready-protocol','coop','双方准备协议','Mutual Ready Protocol','用明确状态区分邀请、接受、准备和开始。','Distinguish invite, accept, ready, and start with explicit states.'],
    ['support-without-control','coop','支援但不代操作','Support Without Taking Control','写一条只提供提示、不替对方提交行动的支援规则。','Write a support rule that offers a clue without submitting another player’s action.'],
    ['shared-stop-control','coop','共同停止键','Shared Stop Control','确认任何一方都能停止合作且不扣关系。','Confirm either partner may stop co-op without relationship loss.','checklist'],
    ['role-swap-debrief','coop','角色交换复盘','Role-Swap Debrief','比较交换角色前后隐藏信息和决策负担。','Compare hidden information and decision load before and after role swap.'],
    ['coop-command-replay','coop','合作命令重放','Co-op Command Replay','说明同一命令重放为何不能增加revision或奖励。','Explain why replaying one command cannot add revision or reward.'],
    ['bounded-signal-payload','coop','有界协作信号','Bounded Co-op Signal','设计一个不含自由HTML和敏感字段的短信号。','Design a short signal with no free HTML or sensitive fields.'],
    ['different-ending-agreement','coop','不同结尾也同行','Together With Different Endings','写一份允许双方选择不同结论的合作约定。','Write a co-op agreement that permits different conclusions.'],
    ['quiet-team-window','coop','安静协作窗口','Quiet Co-op Window','安排不覆盖任何一方安静时间的可选协作窗。','Arrange an optional co-op window outside both partners’ quiet hours.','checklist'],

    ['plain-language-rule','community','白话社区规则','Plain-Language Community Rule','把一条复杂虚构规则改写成可执行短句。','Rewrite one complex fictional rule as an actionable sentence.'],
    ['neutral-decline-template','community','中性拒绝模板','Neutral Decline Template','写一句拒绝邀请且不评价对方的回复。','Write a decline that does not judge the inviter.'],
    ['report-without-retaliation','community','无报复举报流程','Report Without Retaliation','列出举报后仍保留的关系、收藏和资格。','List relationship, collection, and eligibility states preserved after reporting.','checklist'],
    ['moderation-source-audit','community','审核来源审计','Moderation Source Audit','用虚构记录区分举报人、审核人和重新同意人。','Use fictional records to distinguish reporter, reviewer, and reconsenting creator.'],
    ['anonymous-question-board','community','匿名问答板','Anonymous Question Board','设计一个不索取身份的公共问题。','Design a public question that requests no identity.'],
    ['correction-beside-rumor','community','更正紧邻传闻','Correction Beside Rumor','为一条虚构误传写可长期关联的更正。','Write a lasting correction linked to a fictional rumor.'],
    ['minority-name-preservation','community','少数名字保留','Preserve Minority Names','说明投票为何不能删除有来源的少数名称。','Explain why voting cannot delete sourced minority names.'],
    ['accessible-community-entry','community','社区平等入口','Equal Community Entrance','检查一个无门槛入口与主入口拥有相同功能。','Check a step-free entrance offers the same functions as the main entrance.','checklist'],
    ['no-attendance-ranking','community','取消出席排名','No Attendance Ranking','把活动榜单改成不记录谁缺席的归档。','Turn an event leaderboard into an archive that records no absence.'],
    ['community-rest-signal','community','社区休止符','Community Rest Signal','设计任何成员都能提出且无需解释的暂停信号。','Design a pause signal any member may use without explanation.'],

    ['memory-title-and-source','collection','记忆标题与来源','Memory Title and Source','为虚构记忆写标题、来源和当前可见范围。','Give a fictional memory a title, provenance, and current visibility.'],
    ['six-slot-showcase','collection','六格展柜编排','Six-Slot Showcase','把六件已拥有物品排入展柜而不改变库存。','Arrange six owned items in a showcase without changing inventory.','checklist'],
    ['archive-without-revoke','collection','归档不撤销','Archive Without Revocation','确认隐藏展示不会删除已拥有记录。','Confirm hiding a display never deletes ownership.','checklist'],
    ['season-keepsake-index','collection','赛季纪念索引','Season Keepsake Index','为五季各选一件不会过期的虚构纪念物。','Choose one nonexpiring fictional keepsake for each season.'],
    ['duplicate-provenance-check','collection','重复来源碰撞检查','Duplicate Provenance Check','比较同key不同payload为何必须失败关闭。','Compare why identical keys with different payloads must fail closed.'],
    ['crafted-item-conservation','collection','制作物守恒记录','Crafted Item Conservation','记录材料减少、收藏增加和房间放置的对应关系。','Record material decrease, collection increase, and room placement.','checklist'],
    ['gift-inventory-boundary','collection','礼物背包边界','Gift Inventory Boundary','说明入背包为何不等于自动跨越发送边界。','Explain why stored inventory does not automatically cross the send boundary.'],
    ['nonmonetary-unlock-card','collection','非货币解锁卡','Nonmonetary Unlock Card','设计不包含积分或provider字段的解锁说明。','Design an unlock note with no point or provider fields.'],
    ['returned-seed-keepsake','collection','归种纪念袋','Returned-Seed Keepsake','为带着新土归来的虚构种子写收藏记录。','Write a keepsake record for a fictional seed returning with new soil.'],
    ['collection-export-scope','collection','收藏导出范围','Collection Export Scope','检查个人导出不包含他人的私人展示偏好。','Check personal export excludes another person’s private display preferences.','checklist'],

    ['pause-without-reason','wellbeing','无需理由的暂停','Pause Without a Reason','练习用一句话暂停虚构活动且不解释私人原因。','Practice pausing a fictional activity without private explanation.'],
    ['no-countdown-celebration','wellbeing','无倒计时庆祝','Countdown-Free Celebration','设计任何一天都能重新打开的庆祝方式。','Design a celebration that can be reopened on any day.'],
    ['comfortable-sensory-route','wellbeing','舒适感官路线','Comfortable Sensory Route','为声音、动画和亮度各写一个可关闭入口。','Give sound, animation, and brightness independent off controls.','checklist'],
    ['rest-is-not-failure','wellbeing','休息不是失败','Rest Is Not Failure','写一段把休息记录为中性状态的产品文案。','Write product copy that records rest as neutral.'],
    ['quiet-day-planning','wellbeing','安静日计划','Quiet-Day Planning','选择一天只保留持久收件、不接收实时推送。','Choose a day for persistent inbox delivery with no live pushes.','checklist'],
    ['skip-friendly-routine','wellbeing','可跳过日常','Skip-Friendly Routine','设计跳过后不补课、不连败的短流程。','Design a routine with no catch-up or streak loss after skipping.'],
    ['uncertainty-without-anxiety','wellbeing','温和未知标签','Gentle Unknown Label','把一个虚构未知写成不制造紧迫感的提示。','Write a fictional unknown notice without urgency.'],
    ['stop-after-one-step','wellbeing','一步后也可结束','Stop After One Step','完成一个小步骤后练习正常结束任务。','Practice ending a quest normally after one small step.'],
    ['private-reflection-draft','wellbeing','私密复盘草稿','Private Reflection Draft','写一段默认不共享、可随时删除的虚构复盘。','Write a fictional reflection that defaults private and remains deletable.'],
    ['return-without-debt','wellbeing','回来不欠进度','Return Without Progress Debt','描述离开一周后无需追回任何进度的体验。','Describe returning after a week with no progress debt.'],

    ['evidence-boundary-check','community','证据边界检查','Evidence Boundary Check','确认任务证据不含任意HTML、真实地址或provider字段。','Confirm quest evidence contains no arbitrary HTML, real address, or provider field.','checklist'],
    ['review-return-language','community','退回修改用语','Review Return Language','写一条说明缺少什么但不羞辱提交者的退回意见。','Write a return note that names missing evidence without shaming the submitter.'],
    ['appeal-timeline-map','community','申诉时间线','Appeal Timeline Map','用虚构事件绘制提交、审核、退回和申诉顺序。','Map fictional submit, review, return, and appeal events.'],
    ['trusted-event-collision','game_mastery','可信事件碰撞','Trusted Event Collision','说明同source identity不同payload为何必须冲突。','Explain why one source identity with different payload must conflict.'],
    ['quota-before-upload','streaming_practice','上传前配额提示','Pre-Upload Quota Notice','设计在读取PNG前就显示尺寸与次数上限的提示。','Design a size and count notice shown before reading a PNG.'],
    ['retention-tombstone','collection','保留期墓碑','Retention Tombstone','描述证据到期清除内容但保留hash与审核记录。','Describe expiry clearing content while retaining hash and review history.'],
    ['weekly-board-choice','exploration','周板自主选择','Weekly Board Choice','从当前周板挑一项并明确跳过其他项没有损失。','Choose one board item and confirm skipping others causes no loss.'],
    ['chain-postpone-path','exploration','任务链延期线','Quest Chain Postpone Path','练习在不丢失已完成步骤的情况下延期下一节点。','Practice postponing a chain node without losing completed steps.'],
    ['manual-review-no-reward','community','审核前不发奖','No Reward Before Review','说明客户端提交证据为何只能进入审核状态。','Explain why client evidence can only enter review before settlement.'],
    ['settlement-rollback-map','game_mastery','结算回滚地图','Settlement Rollback Map','列出奖励、ledger、assignment、audit和响应同事务边界。','List reward, ledger, assignment, audit, and response inside one transaction.'],

    ['story-choice-trusted-hook','story','剧情选择可信钩子','Trusted Story Choice Hook','说明首次选择事件如何推进任务且重放不重复。','Explain how a first choice event advances a quest without replay duplication.'],
    ['episode-first-clear-hook','story','章节首通钩子','Episode First-Clear Hook','区分首通和重玩对关系与任务事件的影响。','Distinguish first clear from replay for relationship and quest events.'],
    ['achievement-hidden-rule','collection','成就隐藏规则','Hidden Achievement Rule','设计未解锁时不泄露条件、进度或奖励的安全投影。','Design a locked achievement projection that leaks no condition, progress, or reward.'],
    ['achievement-source-dedupe','collection','成就来源去重','Achievement Source Dedupe','用两个相同可信事件证明成就只结算一次。','Use duplicate trusted events to show an achievement settles exactly once.'],
    ['season-archive-view','collection','赛季归档视图','Season Archive View','列出归档季节仍可查看的结局、记忆和收藏。','List conclusions, memories, and collections still visible in an archived season.'],
    ['owner-note-quiet-boundary','story','守望者信件安静边界','Owner Note Quiet Boundary','确认信件可持久保存但安静时段不实时推送。','Confirm an owner note may persist without a quiet-hour live push.','checklist'],
    ['director-structured-invite','coop','导演台结构化邀请','Structured Director Invite','设计只引用已注册任务或游戏的邀请载荷。','Design an invite payload referencing only registered quests or games.'],
    ['invite-action-path-safety','coop','邀请入口安全','Safe Invite Action Path','确认actionPath只来自服务端站内allowlist。','Confirm actionPath comes only from a server-side internal allowlist.','checklist'],
    ['reported-room-lock','community','举报房间阻断','Reported Room Lock','描述审核与主动重新同意前为何不能重开互动房间。','Describe why a reported room cannot reopen before review and voluntary reconsent.'],
    ['expired-invite-replay','coop','过期邀请重放','Expired Invite Replay','说明首次过期转换和丢失响应重放应返回同形结果。','Explain why expiry transition and lost-response replay return the same result.'],

    ['reward-budget-preview','collection','奖励预算预览','Reward Budget Preview','在不暴露provider字段的情况下解释个人与全局预算。','Explain personal and global budgets without exposing provider fields.'],
    ['stored-inventory-choice','collection','背包主动送出','Stored Inventory Choice','说明领取入库后为什么仍需用户主动点击送出。','Explain why stored inventory still needs an explicit user send action.'],
    ['uncertain-delivery-state','collection','不确定送达状态','Uncertain Delivery State','写一条既不自动退款也不自动重发的状态说明。','Write a status note that neither auto-refunds nor auto-resends.'],
    ['provider-history-provenance','collection','送达历史来源','Delivery History Provenance','从虚构inventory记录回链reward order而不显示provider id。','Link fictional inventory back to a reward order without showing provider id.'],
    ['owner-grant-consent','community','站主赠予同意','Owner Grant Consent','描述结构化赠予如何尊重静音、安静时段和主动领取。','Describe a structured grant respecting mute, quiet hours, and active claim.'],
    ['high-value-approval-lock','community','高值审批复核','High-Value Approval Recheck','列出审批时必须重新检查的库存、预算、冷却和余额。','List stock, budget, cooldown, and balance checks repeated at approval.'],
    ['claimed-grant-no-revoke','collection','已领取不可撤销','Claimed Grant Is Final','说明已领取或provider started状态为什么不能被普通撤销。','Explain why claimed or provider-started grants cannot be ordinarily revoked.'],
    ['balance-session-refresh','exploration','余额会话同步','Balance Session Sync','确认积分兑换成功后页面会话余额同步更新。','Confirm session balance updates after successful point redemption.','checklist'],
    ['provider-boundary-audit','community','发送器边界审计','Provider Boundary Audit','检查任务、故事、游戏和成就模块都不导入发送器。','Check quest, story, game, and achievement modules import no provider sender.','checklist'],
    ['reward-without-lootbox','collection','无抽箱奖励','Reward Without Loot Boxes','设计结果固定、无随机付费和无失去恐惧的收藏解锁。','Design a deterministic collectible unlock without paid randomness or FOMO.']
];

const QUESTS = Object.freeze(rows.map((row) => quest(...row)));
const chainRows = [
    ['safe-harbor-orientation','安全港口定向','Safe Harbor Orientation',['harbor-source-map','exit-before-entry','quiet-inbox-walkthrough','consent-state-reading']],
    ['versioned-archive-walk','版本档案漫步','Versioned Archive Walk',['version-window-tour','season-snapshot-check','archive-return-path','collection-no-expiry-check']],
    ['cooperative-game-foundations','合作玩法基础','Co-op Game Foundations',['repair-blocker-route','duet-window-reflection','partner-offline-fallback','shared-stop-control']],
    ['mystery-and-memory-method','谜案与记忆方法','Mystery and Memory Method',['mystery-false-link','echo-view-boundary','asymmetric-map-handshake','different-ending-agreement']],
    ['authored-branch-workshop','手写分支工坊','Authored Branch Workshop',['harbor-letter-scene','two-valid-memories','expired-promise-ending','five-door-conclusion']],
    ['homeward-writing-table','归家写作桌','Homeward Writing Table',['quiet-reunion-beat','repair-with-visible-tear','return-with-changed-soil','home-as-right']],
    ['accessible-broadcast-rehearsal','易用节目彩排','Accessible Broadcast Rehearsal',['offline-opening-rehearsal','break-without-apology','keyboard-exit-drill','mobile-busy-state']],
    ['resilient-live-session','可恢复直播会话','Resilient Live Session',['fallback-scene-switch','quiet-presence-test','reconnect-catchup-check','gentle-closing-cue']],
    ['community-boundary-practice','社区边界练习','Community Boundary Practice',['plain-language-rule','neutral-decline-template','report-without-retaliation','community-rest-signal']],
    ['correction-and-inclusion','更正与包容','Correction and Inclusion',['correction-beside-rumor','minority-name-preservation','accessible-community-entry','no-attendance-ranking']],
    ['lasting-collection-stewardship','长期收藏保管','Lasting Collection Stewardship',['memory-title-and-source','six-slot-showcase','archive-without-revoke','season-keepsake-index']],
    ['provenance-and-conservation','来源与守恒','Provenance and Conservation',['duplicate-provenance-check','crafted-item-conservation','gift-inventory-boundary','collection-export-scope']],
    ['rest-without-pressure','无压力休息','Rest Without Pressure',['pause-without-reason','no-countdown-celebration','rest-is-not-failure','return-without-debt']],
    ['gentle-sensory-routine','温和感官日常','Gentle Sensory Routine',['comfortable-sensory-route','quiet-day-planning','skip-friendly-routine','stop-after-one-step']],
    ['evidence-safety-lifecycle','证据安全生命周期','Evidence Safety Lifecycle',['evidence-boundary-check','quota-before-upload','retention-tombstone','review-return-language']],
    ['trusted-settlement-audit','可信结算审计','Trusted Settlement Audit',['trusted-event-collision','manual-review-no-reward','settlement-rollback-map','provider-boundary-audit']],
    ['story-achievement-bridge','故事成就桥','Story Achievement Bridge',['story-choice-trusted-hook','episode-first-clear-hook','achievement-hidden-rule','season-archive-view']],
    ['director-invitation-safety','导演邀请安全','Director Invitation Safety',['director-structured-invite','invite-action-path-safety','reported-room-lock','expired-invite-replay']],
    ['reward-delivery-boundaries','奖励送达边界','Reward Delivery Boundaries',['reward-budget-preview','stored-inventory-choice','uncertain-delivery-state','provider-history-provenance']],
    ['fair-grant-governance','公平赠予治理','Fair Grant Governance',['owner-grant-consent','high-value-approval-lock','claimed-grant-no-revoke','reward-without-lootbox']]
];
const CHAINS = Object.freeze(chainRows.map(([slug,titleZh,titleEn,quests]) => Object.freeze({
    slug,titleZh,titleEn,quests:Object.freeze(quests)
})));

if (QUESTS.length !== 120 || CHAINS.length !== 20) throw new Error('Phase 8 quest expansion count mismatch');
if (new Set(QUESTS.map((item) => item.slug)).size !== QUESTS.length
    || new Set(QUESTS.map((item) => item.titleZh)).size !== QUESTS.length
    || new Set(QUESTS.map((item) => item.titleEn)).size !== QUESTS.length) {
    throw new Error('Phase 8 quest expansion must be unique');
}
if (CHAINS.some((item) => /(?:route|航线)\s*\d+$/iu.test(item.titleZh) || /(?:route|航线)\s*\d+$/iu.test(item.titleEn))) {
    throw new Error('Quest chains must not use numbered title templates');
}

module.exports = { CHAINS, QUESTS };
