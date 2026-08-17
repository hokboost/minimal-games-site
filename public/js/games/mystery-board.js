'use strict';
(() => {
    const experience = {
        gameId: 'mystery-board',
        titleZh: '谜案拼图调查册',
        titleEn: 'Mystery Board Casebook',
        summary: {
            zh: '把手写证据连成推理路线，撤销错误连接，并在有限预算内指出与矛盾相符的嫌疑人。',
            en: 'Link authored evidence into a theory, undo weak links, and identify the suspect within a limited budget.'
        },
        instructions: [
            {
                zh: '先逐条阅读证据；时间、地点与证词之间的冲突比关键词相同更重要。',
                en: 'Read every clue first; conflicts in time, place, and testimony matter more than shared keywords.'
            },
            {
                zh: '从两个下拉框选择证据后建立连接。连接会消耗预算，但可以明确移除。',
                en: 'Choose two clues in the selectors and link them. Links use budget but can be explicitly removed.'
            },
            {
                zh: '矛盾提示只缩小观察范围，不会显示隐藏的正确连接或真凶。',
                en: 'A contradiction hint narrows your attention without exposing correct hidden links or the culprit.'
            },
            {
                zh: '只有准备好结论时才选择嫌疑人；结案后页面不会再显示变更按钮。',
                en: 'Select a suspect only when ready to conclude; terminal cases expose no further mutation controls.'
            }
        ],
        shortcuts: [
            {
                key: { zh: 'Tab / Shift+Tab', en: 'Tab / Shift+Tab' },
                description: { zh: '依次浏览证据选择、连接、撤销与结论。', en: 'Traverse evidence selectors, link, unlink, and conclusion controls.' }
            },
            {
                key: { zh: '方向键', en: 'Arrow keys' },
                description: { zh: '在下拉证据列表中更换条目。', en: 'Change the highlighted clue in a selector.' }
            },
            {
                key: { zh: '回车', en: 'Enter' },
                description: { zh: '执行聚焦的连接、移除或结论。', en: 'Execute the focused link, removal, or conclusion.' }
            }
        ],
        boundary: {
            zh: '正确链接、错误链接标签和真凶在终局前均留在服务器内容快照中。',
            en: 'Correct-link labels, false-link labels, and the culprit remain in the server content snapshot until terminal.'
        },
        describeState(state, lang) {
            const evidence = state.evidence?.length || 0;
            const links = state.links?.length || 0;
            return lang === 'zh'
                ? `调查板上有 ${evidence} 条证据和 ${links} 条当前连接；仍可用 ${state.linksRemaining ?? '未知'} 次连接。`
                : `The board holds ${evidence} clues and ${links} current links, with ${state.linksRemaining ?? 'an unknown number of'} links remaining.`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '证据' : 'Clues', String(state.evidence?.length || 0)],
                [zh ? '当前连接' : 'Current links', String(state.links?.length || 0)],
                [zh ? '剩余预算' : 'Budget left', String(state.linksRemaining ?? '—')],
                [zh ? '候选人' : 'Suspects', String(state.suspects?.length || 0)]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
