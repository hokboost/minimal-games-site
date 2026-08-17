'use strict';
(() => {
    const experience = {
        gameId: 'story-weaver',
        titleZh: '故事接龙写作桌',
        titleEn: 'Story Weaver Writing Table',
        summary: {
            zh: '双方异步挑选受限叙事卡，服务器把选择编织成双语段落，并保留分支与轮次。',
            en: 'Partners asynchronously choose constrained narrative cards; the server weaves bilingual passages and preserves branches.'
        },
        instructions: [
            {
                zh: '阅读已经形成的段落，确认当前场景的语气、人物与未解决冲突。',
                en: 'Read the existing passages and note the scene tone, characters, and unresolved tension.'
            },
            {
                zh: '从手牌选择一张叙事卡。卡牌文字是封闭内容，不接受自由文本或 HTML。',
                en: 'Choose one narrative card. Card text is closed content; free text and HTML are not accepted.'
            },
            {
                zh: '每张卡会引向不同连接段；不要只按分数猜测，留意它对故事节奏的作用。',
                en: 'Each card leads to a different connective passage; consider pacing rather than guessing by score.'
            },
            {
                zh: '异步等待时可离开页面；伙伴提交后实时提示只触发权威快照刷新。',
                en: 'You may leave while waiting; a partner submission realtime hint only triggers an authoritative refresh.'
            }
        ],
        shortcuts: [
            {
                key: { zh: '数字 1–5', en: 'Numbers 1–5' },
                description: { zh: '选择对应位置的叙事卡。', en: 'Choose the narrative card in that position.' }
            },
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '逐张浏览可用卡牌及其完整文字。', en: 'Review each available card and its full text.' }
            },
            {
                key: { zh: '回车', en: 'Enter' },
                description: { zh: '确认聚焦卡牌，仅发送卡牌索引。', en: 'Confirm the focused card, sending only its index.' }
            }
        ],
        boundary: {
            zh: '未抽到的卡牌、未来连接段和伙伴手牌不会进入当前投影。',
            en: 'Undrawn cards, future connective passages, and the partner hand never enter the current projection.'
        },
        describeState(state, lang) {
            const passages = state.passages?.length || 0;
            const hand = state.hand?.length || 0;
            return lang === 'zh'
                ? `故事已有 ${passages} 段，当前手牌 ${hand} 张。${state.yourTurn ? '现在由你续写。' : '伙伴正在续写。'}`
                : `The story has ${passages} passages and your hand has ${hand} cards. ${state.yourTurn ? 'You write next.' : 'Your partner is writing.'}`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '已成段落' : 'Passages', String(state.passages?.length || 0)],
                [zh ? '可选卡牌' : 'Cards available', String(state.hand?.length || 0)],
                [zh ? '当前分支' : 'Current branch', state.branchLabel || (zh ? '尚未命名' : 'Unnamed')],
                [zh ? '轮次' : 'Turn', String(state.turn ?? state.passages?.length ?? 0)]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
