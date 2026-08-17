'use strict';
(() => {
    const registry = new Map();
    const language = document.body.dataset.lang === 'en' ? 'en' : 'zh';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const gameId = document.body.dataset.gameId;
    const shell = window.CreatorShell;
    const panel = document.querySelector('.sg-panel:last-of-type');
    const board = document.querySelector('.sg-board');
    const content = document.getElementById('sg-content');
    const actions = document.getElementById('sg-actions');
    const status = document.getElementById('sg-status');
    const bootstrap = JSON.parse(document.getElementById('sg-bootstrap')?.textContent || '{}');
    const state = {
        selectedTab: 'help',
        lastSnapshot: bootstrap.state?.run || null,
        historyPage: 1,
        eventLog: [],
        offline: navigator.onLine === false,
        renderCount: 0
    };
    let experience = null;
    let observer = null;

    function element(tag, className, text) {
        const value = document.createElement(tag);
        if (className) value.className = className;
        if (text !== undefined) value.textContent = text;
        return value;
    }

    function register(definition) {
        if (!definition || definition.gameId !== gameId || registry.has(definition.gameId)) return false;
        const required = ['titleZh', 'titleEn', 'summary', 'instructions', 'shortcuts', 'describeState'];
        if (required.some(key => definition[key] === undefined)) throw new TypeError(`Incomplete game experience: ${definition.gameId}`);
        registry.set(definition.gameId, Object.freeze(definition));
        experience = definition;
        install();
        return true;
    }

    function localized(value) {
        if (typeof value === 'function') return value(language);
        if (value && typeof value === 'object') return language === 'zh' ? value.zh : value.en;
        return String(value || '');
    }

    function snapshot() {
        const latest = window.StreamerGameModel?.get?.() || state.lastSnapshot;
        return latest?.run || latest || null;
    }

    function log(type, message) {
        state.eventLog.unshift({
            type,
            message,
            occurredAt: new Date().toISOString()
        });
        state.eventLog = state.eventLog.slice(0, 80);
        renderCurrentTab();
    }

    function setTab(tab) {
        if (!['help', 'history', 'recovery'].includes(tab)) return;
        state.selectedTab = tab;
        document.querySelectorAll('[data-game-tab]').forEach(button => {
            const selected = button.dataset.gameTab === tab;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        renderCurrentTab();
        document.getElementById(`game-tab-${tab}`)?.focus();
    }

    function installTabs() {
        if (!panel || document.getElementById('game-experience-tabs')) return;
        const wrapper = element('section', 'game-experience');
        wrapper.id = 'game-experience-tabs';
        wrapper.setAttribute('aria-labelledby', 'game-experience-title');
        const title = element('h2', '', language === 'zh' ? experience.titleZh : experience.titleEn);
        title.id = 'game-experience-title';
        const summary = element('p', 'game-experience-summary', localized(experience.summary));
        const tabs = element('div', 'game-experience-tablist');
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', t('玩法辅助面板', 'Game assistance panel'));
        for (const [id, zh, en] of [
            ['help', '玩法帮助', 'How to play'],
            ['history', '本局记录', 'Run history'],
            ['recovery', '恢复状态', 'Recovery']
        ]) {
            const button = element('button', 'game-experience-tab', t(zh, en));
            button.type = 'button';
            button.id = `game-tab-${id}`;
            button.dataset.gameTab = id;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', 'game-experience-panel');
            button.addEventListener('click', () => setTab(id));
            button.addEventListener('keydown', event => {
                const order = ['help', 'history', 'recovery'];
                const index = order.indexOf(id);
                if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    setTab(order[(index + 1) % order.length]);
                }
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    setTab(order[(index + order.length - 1) % order.length]);
                }
                if (event.key === 'Home') {
                    event.preventDefault();
                    setTab(order[0]);
                }
                if (event.key === 'End') {
                    event.preventDefault();
                    setTab(order.at(-1));
                }
            });
            tabs.append(button);
        }
        const tabPanel = element('div', 'game-experience-panel');
        tabPanel.id = 'game-experience-panel';
        tabPanel.setAttribute('role', 'tabpanel');
        tabPanel.setAttribute('aria-live', 'polite');
        wrapper.append(title, summary, tabs, tabPanel);
        panel.append(wrapper);
        setTab('help');
    }

    function renderHelp(target) {
        const heading = element('h3', '', t('步骤', 'Steps'));
        const list = element('ol', 'game-help-steps');
        for (const instruction of experience.instructions) list.append(element('li', '', localized(instruction)));
        const shortcutHeading = element('h3', '', t('键盘操作', 'Keyboard controls'));
        const shortcuts = element('dl', 'game-shortcut-list');
        for (const shortcut of experience.shortcuts) {
            const key = element('dt', '', localized(shortcut.key));
            const description = element('dd', '', localized(shortcut.description));
            shortcuts.append(key, description);
        }
        const boundaryHeading = element('h3', '', t('安全与隐藏信息', 'Safety and hidden information'));
        const boundary = element('p', 'game-boundary-note', localized(experience.boundary || {
            zh: '服务器保存权威状态；页面只显示当前角色可以知道的内容。',
            en: 'The server stores authoritative state; the page shows only what the current role may know.'
        }));
        target.append(heading, list, shortcutHeading, shortcuts, boundaryHeading, boundary);
    }

    function renderHistory(target) {
        const run = snapshot();
        if (!run) {
            target.append(shell.createStatePanel('empty', t('还没有本局记录', 'No run history yet'),
                t('开始挑战后，这里会显示安全的动作摘要。', 'Start a challenge to see safe action summaries here.')));
            return;
        }
        const current = run.state || run;
        const summary = experience.describeState(current, language);
        const heading = element('h3', '', t('当前快照', 'Current snapshot'));
        const description = element('p', 'game-state-description', summary);
        const metrics = element('dl', 'game-state-metrics');
        const values = experience.metrics ? experience.metrics(current, language) : [
            [t('状态', 'Status'), current.status || run.status || 'active'],
            [t('回合', 'Turn'), String(current.turn ?? 0)],
            [t('分数', 'Score'), String(current.score ?? 0)]
        ];
        for (const [label, value] of values) metrics.append(element('dt', '', label), element('dd', '', value));
        const eventsHeading = element('h3', '', t('本页事件', 'Page events'));
        const events = element('ol', 'game-safe-events');
        for (const event of state.eventLog.slice(0, 12)) {
            const item = element('li', 'game-safe-event');
            const time = document.createElement('time');
            time.dateTime = event.occurredAt;
            time.textContent = new Date(event.occurredAt).toLocaleTimeString();
            item.append(time, document.createTextNode(` · ${event.message}`));
            events.append(item);
        }
        if (!state.eventLog.length) events.append(element('li', '', t('尚无页面事件。', 'No page events yet.')));
        target.append(heading, description, metrics, eventsHeading, events);
    }

    function renderRecovery(target) {
        const online = navigator.onLine !== false;
        const run = snapshot();
        const heading = element('h3', '', online ? t('连接可用', 'Connection available') : t('离线恢复模式', 'Offline recovery mode'));
        const copy = element('p', '', online
            ? t('数据库快照是权威状态。重试会复用原命令，409 会读取最新修订。',
                'The database snapshot is authoritative. Retry reuses the original command; a 409 loads the latest revision.')
            : t('不要重复点击。原命令身份会保留，连接恢复后可以安全重试。',
                'Do not repeat clicks. The original command identity is retained for safe retry after reconnect.'));
        const details = element('dl', 'game-recovery-details');
        const rows = [
            [t('网络', 'Network'), online ? t('在线', 'Online') : t('离线', 'Offline')],
            [t('运行编号', 'Run ID'), run?.id || t('尚未开始', 'Not started')],
            [t('修订', 'Revision'), String(run?.revision ?? '—')],
            [t('同步方式', 'Sync path'), t('REST 快照 + 有界实时提示', 'REST snapshot + bounded realtime hints')]
        ];
        for (const [label, value] of rows) details.append(element('dt', '', label), element('dd', '', value));
        const retry = element('button', 'creator-access-button', t('读取权威快照', 'Load authoritative snapshot'));
        retry.type = 'button';
        retry.disabled = !online || !run?.id;
        retry.addEventListener('click', () => {
            window.dispatchEvent(new Event('focus'));
            shell.announce(t('已请求最新游戏快照。', 'Latest game snapshot requested.'), 'success');
            log('recovery', t('请求了权威快照', 'Requested authoritative snapshot'));
        });
        target.append(heading, copy, details, retry);
    }

    function renderCurrentTab() {
        const target = document.getElementById('game-experience-panel');
        if (!target || !experience) return;
        target.replaceChildren();
        target.setAttribute('aria-labelledby', `game-tab-${state.selectedTab}`);
        if (state.selectedTab === 'help') renderHelp(target);
        if (state.selectedTab === 'history') renderHistory(target);
        if (state.selectedTab === 'recovery') renderRecovery(target);
    }

    function observeGame() {
        if (!board || observer) return;
        observer = new MutationObserver(mutations => {
            if (!mutations.some(mutation => mutation.type === 'childList' || mutation.type === 'attributes')) return;
            state.renderCount += 1;
            const run = snapshot();
            if (run) state.lastSnapshot = run;
            renderCurrentTab();
        });
        observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-busy'] });
        actions?.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            log('action', t(`执行：${button.textContent.trim()}`, `Action: ${button.textContent.trim()}`));
        });
        document.getElementById('sg-start')?.addEventListener('click', () => {
            log('start', t('请求开始或恢复挑战', 'Requested challenge start or resume'));
        });
    }

    function installLandmarks() {
        board?.setAttribute('aria-label', t('权威游戏状态', 'Authoritative game state'));
        content?.setAttribute('role', 'region');
        content?.setAttribute('aria-label', t('玩法区域', 'Play area'));
        actions?.setAttribute('aria-label', t('可用动作', 'Available actions'));
        status?.setAttribute('aria-live', 'polite');
        status?.setAttribute('aria-atomic', 'true');
    }

    function install() {
        installLandmarks();
        installTabs();
        observeGame();
        shell?.on('network', ({ online }) => {
            state.offline = !online;
            renderCurrentTab();
        });
        shell?.on('preferences', () => renderCurrentTab());
    }

    window.StreamerGameExperience = Object.freeze({ register, log, state: () => ({ ...state }) });
    document.dispatchEvent(new CustomEvent('streamer-game-experience-ready', { detail: { gameId } }));
})();
