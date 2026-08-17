'use strict';
(() => {
    const experience = {
        gameId: 'dream-maze',
        titleZh: '梦境迷航罗盘',
        titleEn: 'Dream Maze Compass',
        summary: {
            zh: '每天由日期与身份生成同一座完美迷宫；主播探索局部出口，站主使用数量有限的方向提示。',
            en: 'Date and identity produce the same perfect maze each day; the creator explores local exits while the owner spends limited hints.'
        },
        instructions: [
            {
                zh: '页面只显示当前房间的开放出口和已到访位置，不显示完整墙体或通往终点的正确路线。',
                en: 'The page shows local exits and visited rooms, never the full walls or correct route to the goal.'
            },
            {
                zh: '主播选择一个开放方向移动。死路也是迷宫的一部分，可以沿原路返回。',
                en: 'The creator moves through an open exit. Dead ends are part of the maze and may be backtracked.'
            },
            {
                zh: '站主可消耗有限提示指出一个安全方向；单人模式由主播同时控制提示。',
                en: 'The owner may spend a limited hint on a safe direction; solo lets the creator control hints too.'
            },
            {
                zh: '同一天完成后不能通过重开刷第二份完成事件；次日会得到新的确定性迷宫。',
                en: 'A completed daily run cannot be restarted for another completion event; the next day yields a new deterministic maze.'
            }
        ],
        shortcuts: [
            {
                key: { zh: '方向键 / WASD', en: 'Arrow keys / WASD' },
                description: { zh: '尝试沿当前房间的开放出口移动。', en: 'Move through an open exit in the current room.' }
            },
            {
                key: { zh: 'H', en: 'H' },
                description: { zh: '有权限且有余量时发送一次伙伴提示。', en: 'Spend one partner hint when authorized and available.' }
            },
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '浏览局部出口、提示和恢复控件。', en: 'Review local exits, hint, and recovery controls.' }
            }
        ],
        boundary: {
            zh: '完整迷宫图、答案路径与未到访房间内容只存在于绑定版本快照，投影只含局部可见信息。',
            en: 'The full graph, solution path, and unvisited room content stay in the bound snapshot; projection is local only.'
        },
        describeState(state, lang) {
            const position = state.position || {};
            const exits = state.legalDirections?.length || 0;
            return lang === 'zh'
                ? `当前位置 ${Number(position.x || 0) + 1},${Number(position.y || 0) + 1}，发现 ${exits} 个局部出口，提示剩余 ${state.hintsRemaining ?? '—'}。`
                : `Position ${Number(position.x || 0) + 1},${Number(position.y || 0) + 1} has ${exits} local exits and ${state.hintsRemaining ?? '—'} hints remain.`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '已走步数' : 'Steps taken', String(state.steps || state.visitedCount || 0)],
                [zh ? '当前出口' : 'Local exits', String(state.legalDirections?.length || 0)],
                [zh ? '提示剩余' : 'Hints left', String(state.hintsRemaining ?? '—')],
                [zh ? '每日标识' : 'Daily key', state.dailyLabel || (zh ? '今日迷宫' : 'Today')]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
