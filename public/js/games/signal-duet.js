'use strict';
(() => {
    const experience = {
        gameId: 'signal-duet',
        titleZh: '信号双奏节拍台',
        titleEn: 'Signal Duet Timing Desk',
        summary: {
            zh: '服务器逐拍开启判定窗；双方交替回应视觉信号，刷新后会从下一拍重新校准。',
            en: 'The server opens each timing window; partners alternate visual cues, and refresh recalibrates the next beat.'
        },
        instructions: [
            {
                zh: '等待倒计时显示“现在击打”；每一拍的时间来自服务器，不采信浏览器提交的耗时。',
                en: 'Wait for “Tap now.” Beat time comes from the server, never a browser-submitted duration.'
            },
            {
                zh: '轮到你时按空格或按钮一次。快速连按不会制造额外有效节拍。',
                en: 'Press Space or the button once on your turn. Rapid repeats cannot create extra accepted beats.'
            },
            {
                zh: '不同颜色是可见节奏提示，不代表隐藏评分；完成标记来自权威快照。',
                en: 'Colors are visible rhythm cues, not hidden scores; completion marks come from the authoritative snapshot.'
            },
            {
                zh: '错过窗口后等待服务器给出下一可恢复窗口，不要刷新并重开另一局。',
                en: 'After a missed window wait for the next recoverable server window instead of starting another run.'
            }
        ],
        shortcuts: [
            {
                key: { zh: '空格', en: 'Space' },
                description: { zh: '在你的判定窗内击打当前信号。', en: 'Tap the current signal during your window.' }
            },
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '在击打、恢复和帮助控件间移动。', en: 'Move among tap, recovery, and help controls.' }
            },
            {
                key: { zh: '回车（恢复页按钮）', en: 'Enter (Recovery button)' },
                description: { zh: '在恢复页聚焦按钮后重新读取时钟校准状态。', en: 'Reload clock-calibrated state after focusing the Recovery button.' }
            }
        ],
        boundary: {
            zh: '页面只计算显示倒计时；命中、连击和分数均由服务器时间判定。',
            en: 'The page only displays a countdown; hits, streaks, and score are judged by server time.'
        },
        describeState(state, lang) {
            const done = state.completedBeats || 0;
            const total = state.visibleBeats?.length || state.beatCount || 0;
            const turn = state.yourTurn
                ? (lang === 'zh' ? '判定窗属于你' : 'the timing window belongs to you')
                : (lang === 'zh' ? '等待伙伴回应' : 'waiting for your partner');
            return lang === 'zh'
                ? `已经完成 ${done}/${total} 拍，${turn}。`
                : `${done}/${total} beats are complete; ${turn}.`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '完成节拍' : 'Completed beats', `${state.completedBeats || 0}/${state.visibleBeats?.length || '—'}`],
                [zh ? '速度' : 'Tempo', `${state.bpm || '—'} BPM`],
                [zh ? '判定窗' : 'Timing window', `${state.timingWindowMs || '—'} ms`],
                [zh ? '当前行动' : 'Current action', state.yourTurn ? (zh ? '击打' : 'Tap') : (zh ? '等待' : 'Wait')]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
