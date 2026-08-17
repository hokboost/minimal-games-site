'use strict';

const definitions = [
    ['nudge.gentle-reset', 'nudge', '慢一点也算前进', 'A gentler pace still counts',
        '先放下必须立刻完成的念头。选一件十分钟内能收尾的小事，我们从那里重新接上。',
        'Release the need to finish everything now. Pick one thing you can close in ten minutes, and we will reconnect from there.'
    ],
    ['nudge.open-window', 'nudge', '给今天开一扇小窗', 'Open one small window today',
        '如果现在有一点余力，就告诉我最想继续哪条线；没有余力，也可以只留一个稍后再见的标记。',
        'If you have a little room, tell me which thread you want to continue. If not, leave a simple marker for later.'
    ],
    ['clue.check-the-edges', 'clue', '线索藏在边缘', 'The clue lives at the edge',
        '别急着重排中心的答案。先比较两侧最不起眼的记号，它们共享一个只出现过一次的方向。',
        'Do not rearrange the center yet. Compare the quiet marks at both edges; they share a direction used only once.'
    ],
    ['clue.listen-before-counting', 'clue', '先听，再数', 'Listen before counting', '这一段的节拍不是均匀重复。留意最长停顿之后的第一个回应，那才是起点。',
        'This rhythm does not repeat evenly. The first response after the longest pause is the true starting point.'
    ],
    ['celebration.steady-finish', 'celebration', '把稳定走完也很了不起', 'A steady finish is worth celebrating',
        '你没有靠运气冲过终点，而是把每一步都守住了。这份耐心值得被认真记住。',
        'You did not luck into the finish; you held every step. That patience deserves to be remembered.'
    ],
    ['celebration.brave-detour', 'celebration', '为那次勇敢的绕路庆祝', 'Celebrating the brave detour',
        '你选择了不确定但诚实的方向，让后来的人也看见另一条路。今天的掌声属于这个决定。',
        'You chose an uncertain but honest direction and made another path visible. Today’s applause belongs to that choice.'
    ],
    ['story-letter.lantern-platform', 'story_letter', '寄自无灯站台的信', 'A letter from the unlit platform',
        '站牌上的名字已经褪色，但长椅下还压着一张双人车票。它在等你决定：带走，还是留给下一位夜行者。',
        'The station name has faded, but a ticket for two waits beneath the bench. Decide whether to carry it or leave it for the next night traveler.'
    ],
    ['story-letter.tide-archive', 'story_letter', '潮汐档案的回信', 'A reply from the tide archive',
        '档案员找到了你上次遗漏的页角。上面没有答案，只有一句提醒：记忆也会选择谁来保存它。',
        'The archivist found the corner you missed. It holds no answer, only a reminder: memories also choose who gets to keep them.'
    ],
    ['quest-invite.small-signal', 'quest_invite', '一起接住一束小信号', 'Catch a small signal together',
        '这项任务不要求一次做完。先确认邀请，任务日志会保留步骤、证据边界和随时可以拒绝的出口。',
        'This quest does not need to be finished at once. Accept to see its steps, evidence limits, and the exit you may use at any time.',
        [],
        ['welcome-map-reading']
    ],
    ['quest-invite.weekly-anchor', 'quest_invite', '本周锚点邀请', 'Weekly anchor invitation',
        '我挑了一项适合慢慢推进的本周任务。接受邀请不会立刻完成任务，也不会绕过任务日志的审核。',
        'I picked a weekly quest that can unfold slowly. Accepting does not complete it or bypass journal review.',
        [],
        ['quiet-hours-check']
    ],
    ['poll.next-horizon', 'poll', '下一段旅程往哪边', 'Which horizon comes next?', '没有标准答案。投票只决定我们优先准备的方向，未选择的路线不会因此永久消失。',
        'There is no correct answer. The vote only sets our preparation priority; unchosen routes do not vanish forever.'
    ],
    ['poll.stream-mood', 'poll', '今天想留下什么气氛', 'What mood should today leave behind?',
        '选一个最接近此刻的词。结果只用于这次互动，不会推断现实身份或私密偏好。',
        'Choose the word closest to this moment. The result is only for this interaction and will not infer identity or private preferences.'
    ],
    ['game-invite.doudizhu-table', 'game_invite', '来一局斗地主', 'A Dou Dizhu table invitation',
        '接受后会打开现有斗地主牌桌。你可以拒绝、静音或中途离开，系统不会把这些选择当作关系失败。',
        'Accept to open the existing Dou Dizhu table. You may decline, mute, or leave; none of those choices counts as relationship failure.',
        [],
        ['doudizhu']
    ],
    ['game-invite.adventure-route', 'game_invite', '一起走一段冒险路线', 'An Adventure route invitation',
        '接受后会打开现有冒险地图，由你自己决定关卡和节奏；邀请不会替你提交任何游戏操作。',
        'Accept to open the existing Adventure map. You choose the stage and pace; the invitation never submits a game action for you.',
        [],
        ['adventure']
    ],
    ['story-intervention.sealed-compass', 'story_intervention', '留给静默频道的另一种读法',
        'Another reading for the quiet channel', '抵达那段需要站主回应的频道时再打开：别追逐最响的声音，先问哪一道停顿正在保护人。',
        'Open this at the channel awaiting an owner reply: do not chase the loudest voice; ask which pause is protecting someone.',
        ['quiet-frequency.owner']
    ],
    ['story-intervention.promise-bridge', 'story_intervention', '留给导线两端的话', 'Words for both ends of the wire',
        '当两端终于同时受力时再打开：如果两种承诺无法同时保全，先保护仍愿意说出真相的人。',
        'Open this when both ends finally hold tension: if two promises cannot both survive, protect the person still willing to tell the truth.',
        ['locked-window.owner']
    ],
    ['nudge.one-breath', 'nudge', '只做一个呼吸长度的准备', 'Prepare for one breath only', '先把下一步缩短到一次呼吸能说完。完成以后，你仍可以决定停下或继续。',
        'Shrink the next step until it fits in one breath. Afterward, you may still stop or continue.'
    ],
    ['clue.shadow-order', 'clue', '影子也有阅读顺序', 'Shadows have a reading order', '从最晚出现却最先消失的影子开始，它与缺失的那一格共享边界。',
        'Begin with the shadow that arrived last but vanished first; it shares an edge with the missing space.'
    ],
    ['celebration.clear-boundary', 'celebration', '为清楚说出边界鼓掌', 'Applause for a clear boundary',
        '你把可以、暂缓和不愿意说得很清楚。这样的选择让合作更安全，也值得庆祝。',
        'You made yes, later, and no equally clear. That choice makes collaboration safer and deserves celebration.'
    ],
    ['story-letter.green-stair', 'story_letter', '绿色阶梯寄来的叶片', 'A leaf from the green stair',
        '叶脉记录了昨夜天线的方向。它没有催你登顶，只把下一处可以休息的平台画了出来。',
        'Its veins record last night’s antenna direction. It does not hurry you upward; it maps the next resting platform.'
    ],
    ['quest-invite.archive-pause', 'quest_invite', '档案整理的小任务', 'A small archive quest',
        '这份邀请只涉及可撤回的文字或清单证据。先在任务日志查看完整要求，再决定是否领取。',
        'This invitation uses only retractable text or checklist evidence. Review every requirement in the journal before claiming it.',
        [],
        ['data-export-awareness']
    ],
    ['poll.coop-role', 'poll', '合作开始时先选什么', 'What should cooperation choose first?',
        '这次投票决定准备阶段先讨论节奏、角色还是退出信号；任何选项都不会削弱你的控制权。',
        'This vote chooses whether setup begins with pace, roles, or an exit signal; no option reduces your control.'
    ],
    ['game-invite.quiz-round', 'game_invite', '问答热身邀请', 'Quiz warm-up invitation',
        '接受后只会打开现有问答入口，不会自动开始或扣除任何内容。拒绝和离开都会被当作正常结束。',
        'Accepting only opens the existing quiz entry; it never starts or charges anything automatically. Declining or leaving is a normal ending.',
        [],
        ['quiz']
    ],
    ['story-intervention.star-table', 'story_intervention', '星片桌边的预留回应', 'A prepared reply beside the star table',
        '当星片盒被放到桌上时再读：裂缝不是需要隐藏的失败，它也可以成为彼此辨认的边。',
        'Read this when the star box reaches the table: a crack is not a failure to hide; it can become an edge by which we recognize each other.',
        ['constellation-pieces.owner']
    ]
];

const TEMPLATES = Object.freeze(Object.fromEntries(definitions.map(([key, type, titleZh, titleEn, bodyZh, bodyEn,
    storyNodeIds = [], referenceIds = []
]) => [key, Object.freeze({
    key,
    type,
    titleZh,
    titleEn,
    bodyZh,
    bodyEn,
    storyNodeIds: Object.freeze(storyNodeIds),
    referenceIds: Object.freeze(referenceIds)
})])));

function getTemplate(key, expectedType) {
    const template = TEMPLATES[key];
    if (!template || template.type !== expectedType) return null;
    return template;
}

module.exports = {
    TEMPLATES,
    getTemplate
};