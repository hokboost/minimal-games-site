'use strict';
(() => {
    const explorer = window.CreatorExplorer;
    const shell = window.CreatorShell;
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const panel = document.getElementById('achievement-chart-panel');
    if (!panel || !explorer) return;

    const cards = Array.from(panel.querySelectorAll('.achievement-card'));
    const unlocked = cards.filter(card => card.dataset.status === 'unlocked').length;
    const visible = cards.filter(card => card.dataset.hidden === 'visible').length;
    const summary = document.createElement('section');
    summary.className = 'creator-achievement-summary';
    summary.setAttribute('aria-label', t('成就总览', 'Achievement overview'));
    const heading = document.createElement('h3');
    heading.textContent = t('长期进度', 'Long-term progress');
    const description = document.createElement('p');
    description.textContent = t(
        `已解锁 ${unlocked}/${cards.length}。${cards.length - visible} 项隐藏条件仍受保护。`,
        `${unlocked}/${cards.length} unlocked. ${cards.length - visible} hidden conditions remain protected.`
    );
    const meter = document.createElement('progress');
    meter.max = Math.max(cards.length, 1);
    meter.value = unlocked;
    meter.setAttribute('aria-label', t('成就解锁进度', 'Achievement unlock progress'));
    summary.append(heading, description, meter);
    panel.querySelector('h2')?.after(summary);

    const controller = explorer.mount({
        id: 'achievement-chart',
        root: '#achievement-chart-panel',
        collection: '.achievement-grid',
        item: '.achievement-card',
        pageSize: 12,
        searchPlaceholder: t('搜索已公开成就', 'Search revealed achievements'),
        filters: [
            {
                key: 'status',
                label: t('解锁状态', 'Unlock status'),
                field: 'data.status',
                options: [
                    { value: 'unlocked', label: t('已解锁', 'Unlocked') },
                    { value: 'locked', label: t('未解锁', 'Locked') }
                ]
            },
            {
                key: 'visibility',
                label: t('条件可见性', 'Condition visibility'),
                field: 'data.hidden',
                options: [
                    { value: 'visible', label: t('公开', 'Visible') },
                    { value: 'hidden', label: t('隐藏', 'Hidden') }
                ]
            }
        ],
        sorts: [
            { key: 'title', label: t('标题', 'Title'), field: 'h3' },
            { key: 'progress-high', label: t('进度从高到低', 'Progress: high to low'), field: 'data.progress', numeric: true, direction: 'desc' },
            { key: 'progress-low', label: t('进度从低到高', 'Progress: low to high'), field: 'data.progress', numeric: true }
        ],
        onRender(state) {
            shell.announce(t(`成就筛选显示 ${state.filtered.length} 项。`,
                `Achievement filter shows ${state.filtered.length} items.`));
        }
    });

    for (const card of cards) {
        const progress = card.querySelector('progress');
        if (!progress) continue;
        const current = Number(progress.value || 0);
        const target = Number(progress.max || 1);
        progress.setAttribute('aria-valuetext', t(`${current}/${target} 已完成`, `${current} of ${target} complete`));
    }

    window.AchievementBrowser = Object.freeze({
        controller,
        summary: () => ({ total: cards.length, unlocked, hidden: cards.length - visible })
    });
})();
