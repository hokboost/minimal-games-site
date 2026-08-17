'use strict';
(() => {
    const experience = {
        gameId: 'constellation-repair',
        titleZh: '星图协修操作手册',
        titleEn: 'Constellation Repair Field Guide',
        summary: {
            zh: '你与伙伴掌握不同线索，轮流铺设一条避开阻断星格、满足转弯预算的修复线路。',
            en: 'You and your partner hold different clues and alternate cells to route around blockers within the turn budget.'
        },
        instructions: [
            {
                zh: '先读自己的私人线索；不要要求伙伴把隐藏线索抄到聊天中。',
                en: 'Read your private clue first; do not ask your partner to copy hidden clues into chat.'
            },
            {
                zh: '轮到你时选择与当前线路相邻的星格。阻断格、已占用格和越界格不可选。',
                en: 'On your turn choose a cell adjacent to the route. Blocked, occupied, and out-of-bounds cells are unavailable.'
            },
            {
                zh: '路线必须抵达终点，并保留足够的转弯次数通过最后几段。',
                en: 'Reach the destination while reserving enough turns for the final sections.'
            },
            {
                zh: '协作断线时不要重开；恢复面板会继续读取同一局的数据库快照。',
                en: 'Do not restart after a co-op disconnect; Recovery reloads the same database snapshot.'
            }
        ],
        shortcuts: [
            {
                key: { zh: 'Tab / Shift+Tab', en: 'Tab / Shift+Tab' },
                description: { zh: '按 DOM 顺序在可选星格间移动焦点。', en: 'Move focus among available star cells in DOM order.' }
            },
            {
                key: { zh: '回车 / 空格', en: 'Enter / Space' },
                description: { zh: '确认当前聚焦的星格。', en: 'Confirm the focused star cell.' }
            },
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '离开棋盘并前往帮助或恢复控件。', en: 'Leave the grid for help or recovery controls.' }
            }
        ],
        boundary: {
            zh: '完整解法和伙伴线索永不进入你的投影；实时事件只携带局号与修订提示。',
            en: 'The full solution and partner clue never enter your projection; realtime events carry only run and revision hints.'
        },
        describeState(state, lang) {
            const placed = state.placements?.length || 0;
            const destination = state.destination || state.goal;
            if (lang === 'zh') {
                return `线路已铺设 ${placed} 格。${state.yourTurn ? '现在轮到你。' : '正在等待伙伴。'}终点位于 ${destination?.x + 1 || '未知'},${destination?.y + 1 || '未知'}。`;
            }
            return `${placed} cells are routed. ${state.yourTurn ? 'It is your turn.' : 'Waiting for your partner.'} The destination is ${destination?.x + 1 || 'unknown'},${destination?.y + 1 || 'unknown'}.`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '已铺星格' : 'Cells placed', String(state.placements?.length || 0)],
                [zh ? '剩余转弯' : 'Turns remaining', String(state.turnsRemaining ?? '—')],
                [zh ? '棋盘' : 'Board', `${state.width || '—'} × ${state.height || '—'}`],
                [zh ? '行动方' : 'Actor', state.yourTurn ? (zh ? '你' : 'You') : (zh ? '伙伴' : 'Partner')]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
