'use strict';
(() => {
    const experience = {
        gameId: 'studio-crafting',
        titleZh: '星光工坊制作台',
        titleEn: 'Studio Crafting Workbench',
        summary: {
            zh: '按配方顺序收集材料、制作收藏物，再把成品放入持久收藏房间的六个位置之一。',
            en: 'Gather recipe materials in order, craft a collectible, then place it in one of six persistent room slots.'
        },
        instructions: [
            {
                zh: '查看配方和“下一材料”；休整中的采集站保持禁用，不能靠连点绕过顺序。',
                en: 'Read the recipe and “next material.” Resting stations remain disabled and rapid clicks cannot bypass order.'
            },
            {
                zh: '材料数量满足服务器配方后，制作按钮才会开放；成品不会产生积分或礼物发送。',
                en: 'Crafting opens only after the server recipe is satisfied; the item creates no points or gift delivery.'
            },
            {
                zh: '制作后选择收藏房间位置才完成本局。已有物品会继续显示在房间投影中。',
                en: 'Choose a collection-room slot after crafting to complete the run. Existing items remain in the room projection.'
            },
            {
                zh: '网络失败后先读取恢复页；材料守恒和收藏唯一性由同一事务保护。',
                en: 'After a network failure use Recovery first; material conservation and collection uniqueness share one transaction.'
            }
        ],
        shortcuts: [
            {
                key: { zh: 'G', en: 'G' },
                description: { zh: '聚焦当前合法采集站。', en: 'Focus the currently legal gathering station.' }
            },
            {
                key: { zh: 'C', en: 'C' },
                description: { zh: '材料齐全时制作收藏物。', en: 'Craft the collectible when materials are complete.' }
            },
            {
                key: { zh: '数字 1–6', en: 'Numbers 1–6' },
                description: { zh: '制作后选择收藏房间位置。', en: 'Choose a collection-room slot after crafting.' }
            },
            {
                key: { zh: 'Tab', en: 'Tab' },
                description: { zh: '跳过禁用站点并浏览当前可用动作。', en: 'Skip disabled stations and review available actions.' }
            }
        ],
        boundary: {
            zh: '配方、材料变化、收藏所有权与房间位置由服务器保存；客户端不能自造物品键。',
            en: 'Recipes, material changes, ownership, and room placement are server-owned; clients cannot invent item keys.'
        },
        describeState(state, lang) {
            const crafted = state.crafted?.includes(state.challengeId);
            const materialCount = Object.values(state.materials || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
            return lang === 'zh'
                ? `${crafted ? '成品已经完成，等待选择房间位置。' : `已收集 ${materialCount} 份材料，下一站是 ${state.nextMaterial || '制作台'}。`}`
                : `${crafted ? 'The item is crafted and awaits a room slot.' : `${materialCount} materials are gathered; next is ${state.nextMaterial || 'the workbench'}.`}`;
        },
        metrics(state, lang) {
            const zh = lang === 'zh';
            return [
                [zh ? '材料总数' : 'Materials held', String(Object.values(state.materials || {}).reduce((sum, value) => sum + Number(value || 0), 0))],
                [zh ? '配方种类' : 'Recipe materials', String(Object.keys(state.recipe || {}).length)],
                [zh ? '制作状态' : 'Craft state', state.crafted?.includes(state.challengeId) ? (zh ? '已制作' : 'Crafted') : (zh ? '采集中' : 'Gathering')],
                [zh ? '下一材料' : 'Next material', state.nextMaterial || '—']
            ];
        }
    };

    window.StreamerGameExperience.register(experience);
})();
