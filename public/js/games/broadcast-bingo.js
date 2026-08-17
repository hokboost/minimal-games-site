'use strict';
(() => {
    const experience = {
        gameId: 'broadcast-bingo',
        titleZh: '直播宾果观察台',
        titleEn: 'Broadcast Bingo Observation Desk',
        summary: {
            zh: '宾果格只由经过管理员确认的安全直播事件推进；主播页面负责观察、恢复与核对，不负责自报。',
            en: 'Only admin-confirmed safe broadcast events advance the card; the creator page observes and reconciles rather than self-reporting.'
        },
        instructions: [
            {
                zh: '开始后阅读二十五个安全事件格；它们不要求披露私人谈话或现实敏感信息。',
                en: 'Review the twenty-five safe event cells; none require private conversations or sensitive real-world information.'
            },
            {
                zh: '普通游戏动作不能标记格子。确认入口由固定站主管理路由调用可信适配器。',
                en: 'Normal game actions cannot mark cells. A fixed owner-admin route invokes the trusted confirmation adapter.'
            },
            {
                zh: '页面活动时会有界轮询权威快照；同一来源事件只计算一次。',
                en: 'The active page polls the authoritative snapshot within bounds; one source event counts only once.'
            },
            {
                zh: '断线期间发生的已确认事件会在恢复后出现，不需要主播再次提交。',
                en: 'Confirmed events received while disconnected appear after recovery without creator resubmission.'
            }
        ],
        shortcuts: [
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '逐格阅读标签，并前往恢复或结束控件。', en: 'Read cells in order and reach recovery or end controls.' }
            },
            {
                key: { zh: 'R（恢复页）', en: 'R (Recovery tab)' },
                description: { zh: '请求读取最新已确认事件结果。', en: 'Request the latest confirmed-event result.' }
            },
            {
                key: { zh: 'Escape', en: 'Escape' },
                description: { zh: '离开辅助对话框并回到宾果板。', en: 'Leave an assistance dialog and return to the board.' }
            }
        ],
        boundary: {
            zh: '浏览器没有“标记”命令；来源身份、确认人和语义摘要只在可信服务事务中写入。',
            en: 'The browser has no mark command; source identity, confirmer, and semantic digest are written only by the trusted service transaction.'
        },
        describeState(state, lang) {
            const marked = state.cells?.filter(cell => cell.marked).length || 0;
            return lang === 'zh'
                ? `宾果板已确认 ${marked}/${state.cells?.length || 25} 格，完成 ${state.completedLines || 0} 条连线。`
                : `${marked}/${state.cells?.length || 25} cells are confirmed, completing ${state.completedLines || 0} lines.`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '已确认格' : 'Confirmed cells', String(state.cells?.filter(cell => cell.marked).length || 0)],
                [zh ? '完成连线' : 'Completed lines', String(state.completedLines || 0)],
                [zh ? '卡片大小' : 'Card size', String(state.cells?.length || 25)],
                [zh ? '输入来源' : 'Input source', zh ? '可信服务事件' : 'Trusted service event']
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
