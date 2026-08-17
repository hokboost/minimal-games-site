'use strict';
(() => {
    const shell = window.CreatorShell;
    const explorer = window.CreatorExplorer;
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const memoryPanel = document.getElementById('memory-title')?.closest('.creator-panel');
    const inboxPanel = document.getElementById('inbox-title')?.closest('.creator-panel');
    const controllers = [];

    function classifyEntries() {
        for (const entry of memoryPanel?.querySelectorAll('.creator-entry') || []) {
            entry.dataset.entryState = entry.classList.contains('is-archived') ? 'archived' : 'current';
            entry.dataset.pinned = entry.querySelector('[data-pinned="false"]') ? 'pinned' : 'regular';
        }
        for (const entry of inboxPanel?.querySelectorAll('.creator-entry') || []) {
            entry.dataset.entryState = entry.classList.contains('is-unread') ? 'unread' : 'read';
            entry.dataset.actionable = entry.querySelector('a') ? 'actionable' : 'information';
        }
    }

    function assignPanelIds() {
        if (memoryPanel) memoryPanel.id = 'creator-memory-panel';
        if (inboxPanel) inboxPanel.id = 'creator-inbox-panel';
    }

    function mountMemoryExplorer() {
        if (!memoryPanel || !explorer) return;
        controllers.push(explorer.mount({
            id: 'creator-memories',
            root: '#creator-memory-panel',
            collection: ':scope',
            item: '.creator-entry',
            pageSize: 8,
            searchPlaceholder: t('搜索共享记忆', 'Search shared memories'),
            filters: [
                {
                    key: 'state',
                    label: t('记忆状态', 'Memory state'),
                    field: 'data.entryState',
                    options: [
                        { value: 'current', label: t('当前', 'Current') },
                        { value: 'archived', label: t('已归档', 'Archived') }
                    ]
                },
                {
                    key: 'pin',
                    label: t('置顶', 'Pin'),
                    field: 'data.pinned',
                    options: [
                        { value: 'pinned', label: t('已置顶', 'Pinned') },
                        { value: 'regular', label: t('普通', 'Regular') }
                    ]
                }
            ],
            sorts: [
                { key: 'title', label: t('标题', 'Title'), field: 'h3' },
                { key: 'state', label: t('状态', 'State'), field: 'data.entryState' }
            ],
            emptyTitle: t('没有匹配记忆', 'No matching memories'),
            emptyBody: t('隐藏或归档只改变你的投影，不删除审计来源。',
                'Hide or archive changes your projection without deleting audit provenance.')
        }));
    }

    function mountInboxExplorer() {
        if (!inboxPanel || !explorer) return;
        controllers.push(explorer.mount({
            id: 'creator-inbox',
            root: '#creator-inbox-panel',
            collection: ':scope',
            item: '.creator-entry',
            pageSize: 8,
            searchPlaceholder: t('搜索持久消息', 'Search durable messages'),
            filters: [
                {
                    key: 'read',
                    label: t('阅读状态', 'Read state'),
                    field: 'data.entryState',
                    options: [
                        { value: 'unread', label: t('未读', 'Unread') },
                        { value: 'read', label: t('已读', 'Read') }
                    ]
                },
                {
                    key: 'action',
                    label: t('消息用途', 'Message purpose'),
                    field: 'data.actionable',
                    options: [
                        { value: 'actionable', label: t('包含安全入口', 'Has safe action') },
                        { value: 'information', label: t('仅信息', 'Information only') }
                    ]
                }
            ],
            sorts: [
                { key: 'title', label: t('标题', 'Title'), field: 'h3' },
                { key: 'read', label: t('未读优先', 'Unread first'), field: 'data.entryState', direction: 'desc' }
            ],
            emptyTitle: t('没有匹配消息', 'No matching messages'),
            emptyBody: t('收件箱内容先持久保存；实时连接并不是阅读它们的前提。',
                'Inbox content is persisted first; a realtime connection is not required to read it.')
        }));
    }

    function improveProgress() {
        const progress = document.querySelector('.creator-level-card progress');
        if (!progress) return;
        progress.setAttribute('aria-label', t('距离下一关系等级的进度', 'Progress toward next relationship level'));
        progress.setAttribute('aria-valuetext', t(
            `${progress.value}/${progress.max} 关系经验`,
            `${progress.value} of ${progress.max} relationship XP`
        ));
        const note = document.createElement('small');
        note.className = 'creator-boundary-note';
        note.textContent = t(
            '拒绝任务、邀请或实时互动不会减少这里的数值。',
            'Declining a quest, invitation, or live interaction never reduces this value.'
        );
        progress.after(note);
    }

    function guardOfflineActions() {
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-memory-id],[data-inbox-action]');
            if (!button || navigator.onLine !== false) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            shell.announce(t('当前离线，记忆与收件箱状态没有改变。',
                'You are offline; memory and inbox state did not change.'), 'error');
        }, true);
    }

    function observeMessages() {
        const message = document.getElementById('creator-message');
        if (!message) return;
        new MutationObserver(() => {
            const value = message.textContent.trim();
            if (!value) return;
            shell.announce(value, /失败|error|冲突|conflict/i.test(value) ? 'error' : 'success');
        }).observe(message, { childList: true, subtree: true, characterData: true });
    }

    assignPanelIds();
    classifyEntries();
    mountMemoryExplorer();
    mountInboxExplorer();
    improveProgress();
    guardOfflineActions();
    observeMessages();
    window.CreatorHomeExperience = Object.freeze({ controllers });
})();
