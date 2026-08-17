'use strict';
(() => {
    const shell = window.CreatorShell;
    const language = document.body.dataset.lang === 'zh' ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const items = document.getElementById('live-items');
    const events = document.getElementById('live-events');
    const connection = document.getElementById('live-connection');
    const message = document.getElementById('live-message');
    const state = {
        filter: 'all',
        eventPage: 1,
        eventPageSize: 20,
        lastConnection: connection?.textContent.trim() || '',
        renderCount: 0
    };

    function create(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function installItemFilters() {
        const panel = items?.closest('.live-panel');
        if (!panel || document.getElementById('live-item-filters')) return;
        const controls = create('div', 'creator-filter-chips');
        controls.id = 'live-item-filters';
        controls.setAttribute('role', 'toolbar');
        controls.setAttribute('aria-label', t('邀请与留言筛选', 'Invitation and note filters'));
        const definitions = [
            ['all', t('全部', 'All')],
            ['actionable', t('待回应', 'Action needed')],
            ['accepted', t('已接受', 'Accepted')],
            ['declined', t('已拒绝', 'Declined')],
            ['reported', t('已举报', 'Reported')]
        ];
        for (const [value, label] of definitions) {
            const button = create('button', 'creator-filter-chip', label);
            button.type = 'button';
            button.dataset.liveFilter = value;
            button.setAttribute('aria-pressed', String(value === state.filter));
            button.addEventListener('click', () => {
                state.filter = value;
                for (const control of controls.querySelectorAll('[data-live-filter]')) {
                    control.setAttribute('aria-pressed', String(control.dataset.liveFilter === value));
                }
                applyItemFilter();
            });
            controls.append(button);
        }
        panel.querySelector('h2')?.after(controls);
    }

    function applyItemFilter() {
        const cards = Array.from(items?.querySelectorAll('.live-item') || []);
        let visible = 0;
        for (const card of cards) {
            const cardState = card.dataset.state;
            const actionable = cardState === 'delivered' && Boolean(card.querySelector('button[data-action]'));
            const match = state.filter === 'all'
                || (state.filter === 'actionable' && actionable)
                || cardState === state.filter;
            card.hidden = !match;
            card.setAttribute('aria-hidden', String(!match));
            if (match) visible += 1;
        }
        let empty = document.getElementById('live-filter-empty');
        if (!empty) {
            empty = shell.createStatePanel('empty', t('此筛选没有项目', 'No items in this filter'),
                t('已保存的其他邀请和留言仍可通过“全部”查看。', 'Other durable invitations and notes remain available under All.'));
            empty.id = 'live-filter-empty';
            items?.after(empty);
        }
        empty.hidden = visible !== 0 || cards.length === 0;
        state.renderCount += 1;
    }

    function installEventPager() {
        const panel = events?.closest('.live-panel');
        if (!panel || document.getElementById('live-event-pager')) return;
        const pager = create('nav', 'creator-inline-pager');
        pager.id = 'live-event-pager';
        pager.setAttribute('aria-label', t('事件历史分页', 'Event history pages'));
        const previous = create('button', '', t('较新', 'Newer'));
        const status = create('span', '', '');
        status.setAttribute('aria-live', 'polite');
        const next = create('button', '', t('较早', 'Older'));
        previous.type = 'button';
        next.type = 'button';

        function render() {
            const lines = Array.from(events.querySelectorAll('li'));
            const pages = Math.max(1, Math.ceil(lines.length / state.eventPageSize));
            state.eventPage = Math.min(state.eventPage, pages);
            const start = (state.eventPage - 1) * state.eventPageSize;
            lines.forEach((line, index) => {
                line.hidden = index < start || index >= start + state.eventPageSize;
            });
            previous.disabled = state.eventPage <= 1;
            next.disabled = state.eventPage >= pages;
            status.textContent = t(`第 ${state.eventPage}/${pages} 页`, `Page ${state.eventPage} of ${pages}`);
            pager.hidden = lines.length <= state.eventPageSize;
        }
        previous.addEventListener('click', () => {
            state.eventPage -= 1;
            render();
        });
        next.addEventListener('click', () => {
            state.eventPage += 1;
            render();
        });
        pager.append(previous, status, next);
        panel.append(pager);
        new MutationObserver(render).observe(events, { childList: true });
        render();
    }

    function observeConnection() {
        if (!connection) return;
        new MutationObserver(() => {
            const value = connection.textContent.trim();
            if (!value || value === state.lastConnection) return;
            state.lastConnection = value;
            shell.announce(value, /断开|disconnected|失败|failed/i.test(value) ? 'error' : 'status');
        }).observe(connection, { childList: true, subtree: true, characterData: true });
        shell.on('network', ({ online }) => {
            if (!online) shell.announce(t('浏览器离线；持久历史仍可阅读，互动动作已暂停。',
                'Browser offline; durable history remains readable and interaction actions are paused.'), 'error');
        });
    }

    function guardOfflineActions() {
        document.addEventListener('click', event => {
            const button = event.target.closest('.live-actions button[data-action]');
            if (!button || navigator.onLine !== false) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            shell.announce(t('离线时不会提交邀请回应、静音、离开或举报。',
                'Invitation replies, mute, leave, and reports are not submitted while offline.'), 'error');
        }, true);
    }

    function watchDynamicItems() {
        if (!items) return;
        new MutationObserver(() => applyItemFilter()).observe(items, { childList: true, subtree: true });
        applyItemFilter();
    }

    installItemFilters();
    installEventPager();
    observeConnection();
    guardOfflineActions();
    watchDynamicItems();
    if (message) new MutationObserver(() => {
        const value = message.textContent.trim();
        if (value) shell.announce(value, 'error');
    }).observe(message, { childList: true, subtree: true, characterData: true });
    window.LiveInboxExperience = Object.freeze({ state: () => ({ ...state }) });
})();
