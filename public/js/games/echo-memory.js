'use strict';
(() => {
    const experience = {
        gameId: 'echo-memory',
        titleZh: '回声默契记忆室',
        titleEn: 'Echo Memory Chamber',
        summary: {
            zh: '双方先分别记住不对称符号片段，再轮流复原合并序列；任何角色都看不到伙伴的私有线索。',
            en: 'Partners study asymmetric symbol fragments, then alternate reconstructing the merged sequence without seeing the other private clue.'
        },
        instructions: [
            {
                zh: '学习阶段只读自己的编号符号，并在准备好后确认；不要截图交换私有线索。',
                en: 'Study only your indexed symbols and confirm when ready; do not exchange screenshots of private clues.'
            },
            {
                zh: '两人都准备后进入回声阶段，按合并顺序一次选择一个符号。',
                en: 'After both are ready, the echo phase asks for one symbol at a time in merged order.'
            },
            {
                zh: '错误会按关卡规则处理，但服务器不会在进行中返回完整答案或伙伴片段。',
                en: 'Errors follow challenge rules, but the server never returns the full answer or partner fragment mid-run.'
            },
            {
                zh: '刷新后只恢复你的角色投影；切换账户不会继承另一角色的线索。',
                en: 'Refresh restores only your role projection; switching accounts cannot inherit the other role clue.'
            }
        ],
        shortcuts: [
            {
                key: { zh: 'M', en: 'M' },
                description: { zh: '在学习阶段确认已经记住私有片段。', en: 'Confirm the private fragment is memorized during study.' }
            },
            {
                key: { zh: 'Tab / Shift+Tab', en: 'Tab / Shift+Tab' },
                description: { zh: '在当前符号按钮间移动焦点。', en: 'Move focus among current symbol buttons.' }
            },
            {
                key: { zh: '回车 / 空格', en: 'Enter / Space' },
                description: { zh: '提交一个符号或学习确认。', en: 'Submit one symbol or study confirmation.' }
            }
        ],
        boundary: {
            zh: '伙伴私有片段、完整合并序列和下一答案不会进入 HTML、实时事件或历史摘要。',
            en: 'The partner fragment, full merged sequence, and next answer never enter HTML, realtime events, or history summaries.'
        },
        describeState(state, lang) {
            const progress = `${state.recallIndex || 0}/${state.length || 0}`;
            const phase = state.phase === 'study'
                ? (lang === 'zh' ? '学习私有片段' : 'studying a private fragment')
                : (lang === 'zh' ? '共同复原回声' : 'reconstructing the shared echo');
            return lang === 'zh'
                ? `当前正在${phase}，复原进度 ${progress}。${state.yourTurn ? '现在可行动。' : '等待伙伴。'}`
                : `Currently ${phase}; recall progress is ${progress}. ${state.yourTurn ? 'You may act.' : 'Waiting for partner.'}`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '阶段' : 'Phase', state.phase === 'study' ? (zh ? '学习' : 'Study') : (zh ? '回声' : 'Echo')],
                [zh ? '复原进度' : 'Recall progress', `${state.recallIndex || 0}/${state.length || 0}`],
                [zh ? '我的线索数' : 'My clue count', String(state.privateClue?.length || 0)],
                [zh ? '行动权' : 'Turn', state.yourTurn ? (zh ? '我方' : 'Mine') : (zh ? '伙伴' : 'Partner')]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
