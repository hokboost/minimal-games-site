'use strict';

const { validateRule } = require('../../../domain/quests/v2/rules');

function quest(slug, category, titleZh, titleEn, descriptionZh, descriptionEn, options = {}) {
    const evidenceKind = options.evidenceKind || 'text';
    const completionRule = options.completionRule || { op: 'evidence_approved' };
    return Object.freeze({
        slug,
        version: 1,
        status: 'active',
        category,
        tags: Object.freeze(options.tags || [category, 'phase2']),
        difficulty: options.difficulty || 'guided',
        estimatedMinutes: options.estimatedMinutes || 15,
        safetyClass: category === 'wellbeing' ? 'wellbeing' : 'standard',
        titleZh,
        titleEn,
        descriptionZh,
        descriptionEn,
        hintZh: options.hintZh || '按步骤完成后提交有界证据；主观任务需要人工审核。',
        hintEn: options.hintEn || 'Follow the steps and submit bounded evidence; subjective quests require review.',
        completionZh: options.completionZh || '任务已完成，星图上亮起了一枚新坐标。',
        completionEn: options.completionEn || 'Quest complete. A new coordinate lights up on the star map.',
        verificationMode: evidenceKind === 'trusted_event' ? 'automatic' : 'manual',
        consentCategory: category,
        eligibilityRule: validateRule({ op: 'relationship_level', minimum: 1 }),
        completionRule: validateRule(completionRule),
        evidenceKind,
        rewardPoints: options.rewardPoints ?? 80,
        cooldownHours: options.cooldownHours ?? 168,
        repeatable: false
    });
}

const QUESTS = Object.freeze([
    quest('welcome-map-reading', 'exploration', '读懂欢迎星图', 'Read the Welcome Star Map', '查看主播世界首页，找出关系等级、共享记忆与收件箱三个区域。', 'Visit Creator World and locate the relationship level, shared memories, and inbox.'),
    quest('privacy-controls-tour', 'exploration', '隐私控制巡游', 'Privacy Controls Tour', '确认资料可见范围、证据保留和实时互动三个控制项当前符合你的边界。', 'Confirm that profile visibility, evidence retention, and live interaction match your boundaries.', { evidenceKind: 'checklist' }),
    quest('quiet-hours-check', 'exploration', '安静时间校准', 'Quiet Hours Check', '检查一周安静时间，确保至少一天准确反映不希望被打扰的时段。', 'Review weekly quiet hours and ensure at least one day reflects when you do not want interruptions.', { evidenceKind: 'checklist' }),
    quest('preferred-window-check', 'exploration', '偏好窗口校准', 'Preferred Window Check', '设置一个不会覆盖安静时间的偏好互动窗口。', 'Set one preferred interaction window that does not override quiet hours.', { evidenceKind: 'checklist' }),
    quest('memory-pin-practice', 'exploration', '收藏第一束星光', 'Pin the First Starlight', '在共享记忆中置顶一段你愿意保留的时刻。', 'Pin one shared memory you would like to keep close.', { evidenceKind: 'checklist' }),
    quest('inbox-archive-practice', 'exploration', '整理联络站收件箱', 'Tidy the Relay Inbox', '阅读一条系统消息，并练习归档不再需要的消息。', 'Read a system message and practice archiving one you no longer need.', { evidenceKind: 'checklist' }),
    quest('data-export-awareness', 'exploration', '带走你的数据', 'Take Your Data With You', '打开数据导出，确认你能看到资料、偏好、记忆和同意历史。', 'Open the data export and confirm it includes profile, preferences, memories, and consent history.', { evidenceKind: 'checklist' }),
    quest('room-request-safety-read', 'exploration', '读懂房间绑定边界', 'Understand Room Binding Safety', '阅读房间申请说明，用一句话解释为什么申请不会直接触发送礼。', 'Read the room request notice and explain in one sentence why a request cannot directly send gifts.'),

    quest('quiz-steady-eight', 'game_mastery', '知识航标：稳定八分', 'Knowledge Beacon: Steady Eight', '在一轮答题中至少答对八题，结果只由服务器结算事件确认。', 'Answer at least eight questions correctly in one quiz round; only the server settlement counts.', { evidenceKind: 'trusted_event', completionRule: { op: 'event_count', event: 'quiz.round.completed', target: 1, filters: { correct: { op: 'gte', value: 8 } } }, rewardPoints: 90 }),
    quest('quiz-three-landings', 'game_mastery', '知识航标：三次着陆', 'Knowledge Beacon: Three Landings', '完成三轮答题，不要求连续或上传截图。', 'Complete three quiz rounds without requiring a streak or screenshot.', { evidenceKind: 'trusted_event', completionRule: { op: 'event_count', event: 'quiz.round.completed', target: 3, filters: {} }, rewardPoints: 120 }),
    quest('adventure-first-signal', 'game_mastery', '旧星档案：第一枚信号', 'Star Archive: First Signal', '完成任意一个旧剧情章节，保留原有奖励语义。', 'Complete any legacy adventure chapter while preserving its original reward semantics.', { evidenceKind: 'trusted_event', completionRule: { op: 'event_count', event: 'adventure.chapter.completed', target: 1, filters: { campaignId: 'star-archive-v1' } }, rewardPoints: 90 }),
    quest('adventure-three-signals', 'game_mastery', '旧星档案：三枚信号', 'Star Archive: Three Signals', '完成三个旧剧情章节，进度由服务器完成记录推进。', 'Complete three legacy adventure chapters; server completion records advance progress.', { evidenceKind: 'trusted_event', completionRule: { op: 'event_count', event: 'adventure.chapter.completed', target: 3, filters: { campaignId: 'star-archive-v1' } }, rewardPoints: 150 }),
    quest('doudizhu-table-victory', 'game_mastery', '牌桌信标：一场胜利', 'Table Beacon: One Victory', '赢下一局斗地主；浏览器声明不计入进度。', 'Win one Dou Dizhu match; browser claims do not count.', { evidenceKind: 'trusted_event', completionRule: { op: 'event_count', event: 'doudizhu.match.won', target: 1, filters: {} }, rewardPoints: 100 }),
    quest('game-reflection-note', 'game_mastery', '复盘一局好游戏', 'Reflect on a Good Round', '用不超过两百字记录一次有效决策和下一次想尝试的变化。', 'In at most 200 words, record one useful decision and one change to try next time.'),
    quest('keyboard-route-practice', 'game_mastery', '键盘航线练习', 'Keyboard Route Practice', '只使用键盘完成一次你熟悉的站内操作，并记录遇到的障碍。', 'Complete one familiar site action using only the keyboard and note any obstacle.'),
    quest('mobile-control-check', 'game_mastery', '掌上控制检查', 'Mobile Control Check', '在手机宽度下检查一个游戏的主要按钮是否容易触达。', 'At mobile width, check whether a game’s primary controls are easy to reach.', { evidenceKind: 'checklist' }),
    quest('difficulty-fit-note', 'game_mastery', '难度合身记录', 'Difficulty Fit Note', '尝试当前难度偏好，并说明它是太轻松、合适还是太紧张。', 'Try your current difficulty preference and say whether it feels too easy, suitable, or too intense.'),
    quest('safe-retry-observation', 'game_mastery', '安全重试观察', 'Safe Retry Observation', '观察一次失败后的恢复路径，确认页面不会要求重复支付或重复提交奖励。', 'Observe recovery after a failure and confirm the page does not request duplicate payment or reward submission.', { evidenceKind: 'checklist' }),

    quest('story-tone-compass', 'story', '剧情基调罗盘', 'Story Tone Compass', '从温柔、悬疑、冒险与戏剧中选择当前最想探索的基调，并写下原因。', 'Choose the story tone you most want to explore—gentle, mystery, adventure, or dramatic—and explain why.'),
    quest('fictional-station-name', 'story', '为联络站取名', 'Name a Fictional Relay Station', '为虚构联络站起一个安全、不含真实隐私的名字。', 'Give the fictional relay station a safe name that contains no real private information.'),
    quest('two-paths-prediction', 'story', '两条路线的预想', 'Imagine Two Routes', '为同一虚构选择写出两个不同但都合理的后果。', 'Write two different but plausible outcomes for the same fictional choice.'),
    quest('gentle-boundary-scene', 'story', '温柔边界场景', 'A Gentle Boundary Scene', '写一小段角色礼貌拒绝邀请、关系不受惩罚的场景。', 'Write a short scene where a character politely declines an invitation without relationship penalties.'),
    quest('mystery-clue-label', 'story', '给线索贴标签', 'Label a Mystery Clue', '创造一条虚构线索，并区分事实、推测与未知。', 'Create a fictional clue and separate fact, inference, and unknown.'),
    quest('ending-without-reward', 'story', '无奖励结局也值得', 'An Ending Without Rewards', '描述一个仅因叙事意义而值得解锁的虚构结局。', 'Describe a fictional ending worth unlocking for narrative meaning alone.'),

    quest('broadcast-title-spark', 'creativity', '一束节目标题火花', 'A Broadcast Title Spark', '写三个不含诱导或攻击内容的虚构节目标题。', 'Write three fictional broadcast titles without manipulative or hostile content.'),
    quest('collection-card-concept', 'creativity', '收藏卡概念草图', 'Collection Card Concept', '设计一张虚构收藏卡的名称、颜色与一句说明。', 'Design a fictional collection card with a name, color, and one-line description.'),
    quest('safe-emote-concept', 'creativity', '安全表情概念', 'Safe Emote Concept', '描述一个不针对真实个人的原创表情动作。', 'Describe an original emote gesture that does not target a real person.'),
    quest('three-line-story-beat', 'creativity', '三行故事节拍', 'Three-Line Story Beat', '用三行写出开端、变化和悬念。', 'Use three lines for a beginning, a change, and a hook.'),
    quest('fictional-prop-label', 'creativity', '虚构道具标签', 'Fictional Prop Label', '为星光工坊道具写一个名称和安全使用说明。', 'Write a name and safe use note for a Starlight Workshop prop.'),
    quest('palette-of-four', 'creativity', '四色气氛板', 'A Four-Color Mood Board', '列出四种颜色，并说明它们如何表达一种直播气氛。', 'List four colors and explain how they express a broadcast mood.'),
    quest('celebration-copy', 'creativity', '不施压的庆祝文案', 'Pressure-Free Celebration Copy', '写一句庆祝成功但不要求继续挑战的话。', 'Write one line that celebrates success without pressuring anyone to continue.'),
    quest('alternate-button-labels', 'creativity', '按钮文案双方案', 'Two Button Label Options', '为一个虚构互动按钮写两种清晰、无误导的标签。', 'Write two clear, non-misleading labels for a fictional interaction button.'),

    quest('microphone-checklist', 'streaming_practice', '麦克风检查清单', 'Microphone Check Checklist', '完成音量、静音键和监听三个不涉及公开直播的本地检查。', 'Complete local checks for volume, mute control, and monitoring without going live.', { evidenceKind: 'checklist' }),
    quest('scene-plan-three-beats', 'streaming_practice', '三段场景计划', 'Three-Beat Scene Plan', '为一次虚构直播写开场、主体和收尾三个安全节拍。', 'Plan a safe opening, middle, and closing beat for a fictional stream.'),
    quest('break-card-draft', 'streaming_practice', '休息提示卡草稿', 'Break Card Draft', '写一张简短休息提示卡，不包含健康承诺或诊断。', 'Draft a brief break card without health promises or diagnosis.'),
    quest('audio-level-note', 'streaming_practice', '音量层级记录', 'Audio Level Note', '记录说话、背景音和提示音之间的舒适相对音量。', 'Record comfortable relative levels for voice, background audio, and cues.'),
    quest('moderation-boundary-list', 'streaming_practice', '直播边界清单', 'Broadcast Boundary List', '列出三条希望聊天室遵守的清晰边界。', 'List three clear boundaries you want a chat to respect.', { evidenceKind: 'checklist' }),
    quest('offline-rehearsal', 'streaming_practice', '离线彩排十分钟', 'Ten-Minute Offline Rehearsal', '进行不公开的短彩排，并记录一个顺畅点和一个改进点。', 'Do a short private rehearsal and note one smooth moment and one improvement.'),
    quest('fallback-scene-plan', 'streaming_practice', '备用场景计划', 'Fallback Scene Plan', '为技术故障准备一个不要求观众等待的备用场景。', 'Prepare a fallback scene for technical trouble that does not pressure viewers to wait.'),
    quest('ending-ritual', 'streaming_practice', '温和收尾仪式', 'Gentle Closing Ritual', '设计一个简短、可随时跳过的收尾流程。', 'Design a brief closing routine that can always be skipped.'),

    quest('asymmetric-clue-draft', 'coop', '非对称线索草稿', 'Asymmetric Clue Draft', '写两条只有合并后才完整、单独看也不会泄露隐私的虚构线索。', 'Write two fictional clues that become complete only together and reveal no private information alone.'),
    quest('coop-role-choice', 'coop', '选择合作角色', 'Choose a Co-op Role', '在导航、解谜、记录或支援中选择偏好角色，并说明可随时更换。', 'Choose navigation, solving, recording, or support as a preferred role and note it can change anytime.'),
    quest('shared-signal-protocol', 'coop', '共享信号约定', 'Shared Signal Protocol', '设计三个简单信号表示继续、暂停与需要提示。', 'Design three simple signals for continue, pause, and hint needed.'),
    quest('coop-debrief', 'coop', '合作复盘', 'Co-op Debrief', '记录一次合作中信息如何被清晰传递，不评价真实个人。', 'Record how information was communicated clearly in a collaboration without judging a real person.'),
    quest('graceful-exit-plan', 'coop', '优雅退出方案', 'Graceful Exit Plan', '写一句任何参与者都能无惩罚退出合作房间的提示。', 'Write one prompt that lets any participant leave a co-op room without penalty.'),

    quest('opt-in-poll-draft', 'community', '自愿投票草稿', 'Opt-In Poll Draft', '写一个包含“不参与”选项的虚构站内投票。', 'Draft a fictional in-site poll that includes a “not participating” option.'),
    quest('supportive-reply-template', 'community', '支持性回复模板', 'Supportive Reply Template', '写一句不比较、不催促的支持性回复。', 'Write a supportive reply without comparison or pressure.'),
    quest('community-rule-plain-language', 'community', '社区规则白话版', 'Community Rule in Plain Language', '把一条虚构社区规则改写得简短、明确、可执行。', 'Rewrite one fictional community rule so it is short, clear, and actionable.'),
    quest('report-path-awareness', 'community', '了解举报路径', 'Know the Report Path', '说明遇到不合适任务时可以拒绝、静音或举报。', 'State that an unsuitable quest can be declined, muted, or reported.', { evidenceKind: 'checklist' }),
    quest('no-harassment-scenario', 'community', '拒绝骚扰情境', 'Reject Harassment Scenario', '为一个虚构社区情境选择不围攻、不外联骚扰的处理方式。', 'Choose a response to a fictional community scenario that avoids pile-ons and off-platform harassment.'),

    quest('artifact-name-trio', 'collection', '三件星光藏品', 'Three Starlight Artifacts', '为三件虚构藏品命名，并给出各自的一句来历。', 'Name three fictional artifacts and give each a one-line origin.'),
    quest('recipe-pairing', 'collection', '配方材料配对', 'Recipe Material Pairing', '设计一个只使用剧情与任务材料的虚构配方。', 'Design a fictional recipe using only story and quest materials.'),
    quest('collection-sort-rule', 'collection', '收藏排序规则', 'Collection Sorting Rule', '选择按颜色、来源或时间排序，并说明原因。', 'Choose sorting by color, origin, or time and explain why.'),
    quest('restoration-note', 'collection', '修复记录', 'Restoration Note', '为一件虚构旧物写修复前、处理方式与修复后三项记录。', 'Record before state, method, and after state for a fictional artifact.', { evidenceKind: 'checklist' }),
    quest('duplicate-item-choice', 'collection', '重复藏品的选择', 'A Choice for Duplicate Items', '为重复藏品设计保留、交换或分解的非货币选项。', 'Design non-monetary keep, trade, or dismantle options for duplicate collectibles.'),

    quest('optional-stretch-plan', 'wellbeing', '可选伸展计划', 'Optional Stretch Plan', '选择一个完全可跳过的短伸展提醒；不提交身体或医疗信息。', 'Choose a fully optional short stretch reminder without submitting body or medical information.', { evidenceKind: 'checklist', rewardPoints: 0 }),
    quest('comfortable-volume-check', 'wellbeing', '舒适音量检查', 'Comfortable Volume Check', '在本地调整到舒适音量，不记录听力或健康数据。', 'Adjust local volume to a comfortable level without recording hearing or health data.', { evidenceKind: 'checklist', rewardPoints: 0 }),
    quest('break-window-plan', 'wellbeing', '休息窗口计划', 'Break Window Plan', '为较长活动预留一个可自由调整的休息窗口。', 'Reserve a flexible break window for a longer activity.', { evidenceKind: 'checklist', rewardPoints: 0 }),
    quest('screen-brightness-note', 'wellbeing', '屏幕亮度自检', 'Screen Brightness Self-Check', '确认屏幕亮度由你自行决定，任务不要求提供照片。', 'Confirm screen brightness is your choice and this quest does not require a photo.', { evidenceKind: 'checklist', rewardPoints: 0 }),
    quest('stop-anytime-reminder', 'wellbeing', '随时停止提醒', 'Stop-Anytime Reminder', '写一句提醒自己任务随时可以暂停、拒绝或放弃的话。', 'Write one reminder that a quest can be paused, declined, or abandoned at any time.', { rewardPoints: 0 })
]);

const CHAINS = Object.freeze([
    Object.freeze({ slug: 'relay-onboarding', titleZh: '联络站入门', titleEn: 'Relay Onboarding', quests: Object.freeze(['welcome-map-reading', 'privacy-controls-tour', 'quiet-hours-check']) }),
    Object.freeze({ slug: 'privacy-first', titleZh: '边界优先', titleEn: 'Boundaries First', quests: Object.freeze(['preferred-window-check', 'room-request-safety-read', 'data-export-awareness']) }),
    Object.freeze({ slug: 'knowledge-beacon', titleZh: '知识航标', titleEn: 'Knowledge Beacon', quests: Object.freeze(['quiz-steady-eight', 'quiz-three-landings', 'game-reflection-note']) }),
    Object.freeze({ slug: 'archive-route', titleZh: '旧星档案路线', titleEn: 'Star Archive Route', quests: Object.freeze(['adventure-first-signal', 'adventure-three-signals', 'two-paths-prediction']) }),
    Object.freeze({ slug: 'story-crafter', titleZh: '故事工匠', titleEn: 'Story Crafter', quests: Object.freeze(['fictional-station-name', 'three-line-story-beat', 'ending-without-reward']) }),
    Object.freeze({ slug: 'broadcast-basics', titleZh: '直播基础练习', titleEn: 'Broadcast Basics', quests: Object.freeze(['microphone-checklist', 'scene-plan-three-beats', 'offline-rehearsal']) }),
    Object.freeze({ slug: 'calm-broadcast', titleZh: '从容直播路线', titleEn: 'Calm Broadcast Route', quests: Object.freeze(['break-card-draft', 'fallback-scene-plan', 'ending-ritual']) }),
    Object.freeze({ slug: 'coop-signals', titleZh: '合作信号', titleEn: 'Co-op Signals', quests: Object.freeze(['coop-role-choice', 'shared-signal-protocol', 'graceful-exit-plan']) }),
    Object.freeze({ slug: 'kind-community', titleZh: '友善社区', titleEn: 'Kind Community', quests: Object.freeze(['supportive-reply-template', 'community-rule-plain-language', 'no-harassment-scenario']) }),
    Object.freeze({ slug: 'artifact-keeper', titleZh: '藏品守望者', titleEn: 'Artifact Keeper', quests: Object.freeze(['artifact-name-trio', 'recipe-pairing', 'restoration-note']) })
]);

const BOARDS = Object.freeze([
    Object.freeze({ slug: 'first-light', titleZh: '初灯周板', titleEn: 'First Light Board', quests: Object.freeze(['welcome-map-reading', 'privacy-controls-tour', 'quiz-steady-eight', 'story-tone-compass', 'broadcast-title-spark', 'microphone-checklist', 'coop-role-choice', 'optional-stretch-plan']) }),
    Object.freeze({ slug: 'signal-craft', titleZh: '信号工艺周板', titleEn: 'Signal Craft Board', quests: Object.freeze(['memory-pin-practice', 'adventure-first-signal', 'three-line-story-beat', 'collection-card-concept', 'scene-plan-three-beats', 'shared-signal-protocol', 'supportive-reply-template', 'comfortable-volume-check']) }),
    Object.freeze({ slug: 'quiet-orbit', titleZh: '安静轨道周板', titleEn: 'Quiet Orbit Board', quests: Object.freeze(['quiet-hours-check', 'preferred-window-check', 'game-reflection-note', 'gentle-boundary-scene', 'break-card-draft', 'graceful-exit-plan', 'report-path-awareness', 'break-window-plan']) }),
    Object.freeze({ slug: 'archive-and-artifact', titleZh: '档案与藏品周板', titleEn: 'Archive and Artifact Board', quests: Object.freeze(['data-export-awareness', 'adventure-three-signals', 'mystery-clue-label', 'fictional-prop-label', 'offline-rehearsal', 'coop-debrief', 'artifact-name-trio', 'stop-anytime-reminder']) }),
    Object.freeze({ slug: 'gentle-signal', titleZh: '温柔信号周板', titleEn: 'Gentle Signal Board', quests: Object.freeze(['inbox-archive-practice', 'quiz-three-landings', 'gentle-boundary-scene', 'celebration-copy', 'audio-level-note', 'asymmetric-clue-draft', 'opt-in-poll-draft', 'screen-brightness-note']) }),
    Object.freeze({ slug: 'makers-orbit', titleZh: '创作者轨道周板', titleEn: 'Makers Orbit Board', quests: Object.freeze(['privacy-controls-tour', 'keyboard-route-practice', 'fictional-station-name', 'palette-of-four', 'moderation-boundary-list', 'coop-role-choice', 'recipe-pairing', 'break-window-plan']) }),
    Object.freeze({ slug: 'calm-practice', titleZh: '从容练习周板', titleEn: 'Calm Practice Board', quests: Object.freeze(['preferred-window-check', 'difficulty-fit-note', 'ending-without-reward', 'alternate-button-labels', 'fallback-scene-plan', 'graceful-exit-plan', 'community-rule-plain-language', 'comfortable-volume-check']) }),
    Object.freeze({ slug: 'clue-and-color', titleZh: '线索与色彩周板', titleEn: 'Clue and Color Board', quests: Object.freeze(['room-request-safety-read', 'doudizhu-table-victory', 'mystery-clue-label', 'palette-of-four', 'scene-plan-three-beats', 'shared-signal-protocol', 'no-harassment-scenario', 'optional-stretch-plan']) }),
    Object.freeze({ slug: 'accessible-route', titleZh: '易用航线周板', titleEn: 'Accessible Route Board', quests: Object.freeze(['data-export-awareness', 'mobile-control-check', 'two-paths-prediction', 'safe-emote-concept', 'microphone-checklist', 'coop-debrief', 'collection-sort-rule', 'stop-anytime-reminder']) }),
    Object.freeze({ slug: 'kind-workshop', titleZh: '友善工坊周板', titleEn: 'Kind Workshop Board', quests: Object.freeze(['memory-pin-practice', 'safe-retry-observation', 'story-tone-compass', 'fictional-prop-label', 'break-card-draft', 'asymmetric-clue-draft', 'supportive-reply-template', 'screen-brightness-note']) }),
    Object.freeze({ slug: 'broadcast-compass', titleZh: '节目罗盘周板', titleEn: 'Broadcast Compass Board', quests: Object.freeze(['quiet-hours-check', 'game-reflection-note', 'three-line-story-beat', 'broadcast-title-spark', 'offline-rehearsal', 'shared-signal-protocol', 'report-path-awareness', 'break-window-plan']) }),
    Object.freeze({ slug: 'keeper-finale', titleZh: '守望者收束周板', titleEn: 'Keeper Finale Board', quests: Object.freeze(['inbox-archive-practice', 'adventure-first-signal', 'ending-without-reward', 'celebration-copy', 'ending-ritual', 'graceful-exit-plan', 'duplicate-item-choice', 'comfortable-volume-check']) })
]);

function validatePack() {
    if (QUESTS.length !== 60 || CHAINS.length !== 10 || BOARDS.length !== 12) {
        throw new Error('Phase 2 quest pack has unexpected counts');
    }
    const slugs = new Set();
    const titlesZh = new Set();
    const titlesEn = new Set();
    for (const definition of QUESTS) {
        if (slugs.has(definition.slug) || titlesZh.has(definition.titleZh) || titlesEn.has(definition.titleEn)) {
            throw new Error(`Duplicate Phase 2 quest content: ${definition.slug}`);
        }
        slugs.add(definition.slug);
        titlesZh.add(definition.titleZh);
        titlesEn.add(definition.titleEn);
    }
    for (const chain of CHAINS) {
        if (chain.quests.length < 3 || chain.quests.length > 8
            || chain.quests.some((slug) => !slugs.has(slug))) throw new Error(`Invalid quest chain: ${chain.slug}`);
    }
    for (const board of BOARDS) {
        if (board.quests.length !== 8 || board.quests.some((slug) => !slugs.has(slug))) {
            throw new Error(`Invalid quest board: ${board.slug}`);
        }
    }
    return Object.freeze({ quests: QUESTS.length, chains: CHAINS.length, boards: BOARDS.length });
}

const PACK_COUNTS = validatePack();

module.exports = { BOARDS, CHAINS, PACK_COUNTS, QUESTS, validatePack };
