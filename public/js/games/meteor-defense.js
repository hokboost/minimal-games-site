'use strict';
(() => {
    const experience = {
        gameId: 'meteor-defense',
        titleZh: '流星守望防线台',
        titleEn: 'Meteor Defense Watch Desk',
        summary: {
            zh: '主播调度主防线并结算波次，站主放置一次性支援信标；单人模式保留同样的行动成本。',
            en: 'The creator directs and resolves the main defense while the owner places support beacons; solo keeps the same action costs.'
        },
        instructions: [
            {
                zh: '先阅读当前航道与强度情报，再对照关卡修正规则判断需要加固的位置。',
                en: 'Read the current lane and strength, then account for the challenge modifier before choosing a fort.'
            },
            {
                zh: '主播每波最多加固一次，并负责结算；站主每波最多放置一个信标。',
                en: 'The creator may fortify once per wave and resolves it; the owner may place one beacon per wave.'
            },
            {
                zh: '能量不会因等待而恢复。无限拖延和连续加固都被服务器阶段规则拒绝。',
                en: 'Energy does not regenerate by waiting. Server phase rules reject unlimited stalling and repeated fortification.'
            },
            {
                zh: '单人后备允许主播承担支援动作，但不会降低波次强度或绕过修正规则。',
                en: 'Solo fallback lets the creator perform support actions without lowering wave strength or bypassing modifiers.'
            }
        ],
        shortcuts: [
            {
                key: { zh: '数字 1–4', en: 'Numbers 1–4' },
                description: { zh: '选择对应航道的当前角色动作。', en: 'Choose the current role action for that lane.' }
            },
            {
                key: { zh: 'R', en: 'R' },
                description: { zh: '主播在准备后结算当前波次。', en: 'Creator resolves the current wave after preparation.' }
            },
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '只遍历当前角色与阶段允许的控件。', en: 'Traverse controls allowed for the current role and phase.' }
            }
        ],
        boundary: {
            zh: '后续威胁序列、隐藏强度变化和伙伴私有决策不会随实时事件广播。',
            en: 'Future threats, hidden strength changes, and partner-private decisions are not broadcast in realtime events.'
        },
        describeState(state, lang) {
            const wave = Math.min((state.wave || 0) + 1, state.waveCount || 0);
            const role = state.yourRole === 'owner'
                ? (lang === 'zh' ? '支援位' : 'support role')
                : (lang === 'zh' ? '主防线' : 'main defense');
            return lang === 'zh'
                ? `第 ${wave}/${state.waveCount || '—'} 波，防线 ${state.integrity ?? '—'}，你处于${role}。`
                : `Wave ${wave}/${state.waveCount || '—'}, integrity ${state.integrity ?? '—'}; you hold the ${role}.`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '防线完整' : 'Integrity', String(state.integrity ?? '—')],
                [zh ? '可用能量' : 'Energy', String(state.energy ?? '—')],
                [zh ? '当前波次' : 'Wave', `${Math.min((state.wave || 0) + 1, state.waveCount || 0)}/${state.waveCount || '—'}`],
                [zh ? '已用动作' : 'Action used', state.fortifiedThisWave || state.beacon !== null ? (zh ? '是' : 'Yes') : (zh ? '否' : 'No')]
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
