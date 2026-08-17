'use strict';
(() => {
    const experience = {
        gameId: 'keeper-prediction',
        titleZh: '守望者猜心局',
        titleEn: 'Keeper Prediction Table',
        summary: {
            zh: '双方对虚构世界偏好同时密封选择并预测伙伴答案，服务器在两份提交齐备后才揭示默契。',
            en: 'Partners seal a fictional preference and prediction; the server reveals alignment only after both submissions arrive.'
        },
        instructions: [
            {
                zh: '题目只涉及虚构场景、游戏路线或想象选择，不要求现实身份、健康、政治或消费画像。',
                en: 'Prompts cover fictional scenes, game routes, or imagined choices—not identity, health, politics, or spending profiles.'
            },
            {
                zh: '先选择自己的答案，再选择你猜伙伴会选的答案；两项会作为一份密封提交发送。',
                en: 'Choose your answer, then predict your partner; both are sent as one sealed submission.'
            },
            {
                zh: '提交后不能查看或修改伙伴选择。两人完成前页面只显示“已封存”。',
                en: 'After submitting you cannot inspect or edit the partner choice. The page says only “sealed” until both finish.'
            },
            {
                zh: '揭示记录只说明该回合的虚构默契分，不建立真实人物偏好档案。',
                en: 'Reveal history shows fictional alignment points for the round and builds no real-person preference profile.'
            }
        ],
        shortcuts: [
            {
                key: { zh: 'Tab / Shift+Tab', en: 'Tab / Shift+Tab' },
                description: { zh: '在答案与预测组合按钮间移动。', en: 'Move among answer-prediction combination buttons.' }
            },
            {
                key: { zh: '回车', en: 'Enter' },
                description: { zh: '密封提交当前聚焦组合。', en: 'Seal the focused answer-prediction pair.' }
            },
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '浏览所有组合、历史揭示和恢复信息。', en: 'Review combinations, reveal history, and recovery information.' }
            }
        ],
        boundary: {
            zh: '未揭示选择、伙伴密封内容和真实用户画像不进入投影；题库验证器拒绝敏感属性。',
            en: 'Unrevealed choices, partner sealed content, and real-user profiles stay out of projection; catalog validation rejects sensitive attributes.'
        },
        describeState(state, lang) {
            const round = Math.min((state.round || 0) + 1, state.roundCount || 0);
            if (state.submitted) {
                return lang === 'zh'
                    ? `第 ${round}/${state.roundCount || '—'} 回合已封存，等待安全揭示。`
                    : `Round ${round}/${state.roundCount || '—'} is sealed and awaiting a safe reveal.`;
            }
            return lang === 'zh'
                ? `第 ${round}/${state.roundCount || '—'} 回合可选择；当前题目包含 ${state.choicesZh?.length || 0} 个虚构选项。`
                : `Round ${round}/${state.roundCount || '—'} is open with ${state.choicesEn?.length || 0} fictional options.`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            const points = state.reveals?.reduce((sum, reveal) => sum + Number(reveal.points || 0), 0) || 0;
            return [
                [zh ? '当前回合' : 'Current round', `${Math.min((state.round || 0) + 1, state.roundCount || 0)}/${state.roundCount || '—'}`],
                [zh ? '已揭示' : 'Revealed rounds', String(state.reveals?.length || 0)],
                [zh ? '默契分' : 'Alignment points', String(points)],
                [zh ? '提交状态' : 'Submission', state.submitted ? (zh ? '已封存' : 'Sealed') : (zh ? '未提交' : 'Open')]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
