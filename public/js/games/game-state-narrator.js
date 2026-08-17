(function gameStateNarratorBootstrap() {
    'use strict';

    const modelApi = window.StreamerGameModel;
    const shell = window.CreatorShell;
    const actions = document.getElementById('sg-actions');
    const status = document.getElementById('sg-status');
    const historyRoot = document.getElementById('sg-history');
    if (!modelApi || !actions || !status || !historyRoot || document.getElementById('sg-state-narrator')) return;

    const language = document.body.dataset.lang === 'zh' ? 'zh' : 'en';
    const gameId = document.body.dataset.gameId;
    const copy = language === 'zh' ? {
        title: '对局状态助手',
        noRun: '尚未开始对局',
        active: '对局进行中',
        completed: '对局已完成',
        failed: '对局已结束',
        abandoned: '对局已主动结束',
        revision: '修订',
        turn: '回合',
        score: '分数',
        role: '身份',
        actions: '可用操作',
        noActions: '当前没有可用操作',
        oneAction: '1 个可用操作',
        manyActions: count => `${count} 个可用操作`,
        announcementsOn: '状态播报已开启',
        announcementsOff: '状态播报已暂停',
        toggleOn: '开启状态播报',
        toggleOff: '暂停状态播报',
        focusActions: '跳到对局操作',
        focusHistory: '跳到最近记录',
        offline: '当前离线；未确认操作会等待网络恢复。',
        online: '网络已恢复，请确认服务器状态。',
        changed: '对局状态已更新',
        newTurn: '进入新回合',
        terminal: '对局进入终态，操作控件已关闭。',
        shortcut: 'F6 聚焦操作，F7 聚焦最近记录。',
        events: '本页状态变化',
        clear: '清除本页状态变化',
        empty: '尚无状态变化。',
        at: '于'
    } : {
        title: 'Run state assistant',
        noRun: 'No run has started',
        active: 'Run in progress',
        completed: 'Run completed',
        failed: 'Run ended',
        abandoned: 'Run ended by participant',
        revision: 'Revision',
        turn: 'Turn',
        score: 'Score',
        role: 'Role',
        actions: 'Available actions',
        noActions: 'No actions are currently available',
        oneAction: '1 available action',
        manyActions: count => `${count} available actions`,
        announcementsOn: 'State announcements enabled',
        announcementsOff: 'State announcements paused',
        toggleOn: 'Enable state announcements',
        toggleOff: 'Pause state announcements',
        focusActions: 'Jump to run actions',
        focusHistory: 'Jump to recent runs',
        offline: 'You are offline. Unconfirmed actions wait for the connection to return.',
        online: 'Connection restored. Confirm the authoritative server state.',
        changed: 'Run state updated',
        newTurn: 'New turn',
        terminal: 'The run reached a terminal state and mutation controls are closed.',
        shortcut: 'F6 focuses actions; F7 focuses recent runs.',
        events: 'State changes on this page',
        clear: 'Clear page state changes',
        empty: 'No state changes yet.',
        at: 'at'
    };

    const root = document.createElement('section');
    root.id = 'sg-state-narrator';
    root.className = 'sg-state-narrator';
    root.setAttribute('aria-labelledby', 'sg-state-narrator-title');

    const heading = document.createElement('div');
    heading.className = 'sg-state-narrator-heading';
    const title = document.createElement('h3');
    title.id = 'sg-state-narrator-title';
    title.textContent = copy.title;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sg-state-narrator-toggle';
    toggle.setAttribute('aria-pressed', 'true');
    toggle.textContent = copy.toggleOff;
    heading.append(title, toggle);

    const summary = document.createElement('p');
    summary.className = 'sg-state-narrator-summary';
    summary.tabIndex = 0;

    const metrics = document.createElement('dl');
    metrics.className = 'sg-state-narrator-metrics';

    const actionSummary = document.createElement('p');
    actionSummary.className = 'sg-state-narrator-actions';

    const shortcuts = document.createElement('p');
    shortcuts.className = 'sg-state-narrator-shortcuts';
    shortcuts.textContent = copy.shortcut;

    const eventHeading = document.createElement('h4');
    eventHeading.textContent = copy.events;

    const events = document.createElement('ol');
    events.className = 'sg-state-narrator-events';
    events.setAttribute('aria-live', 'off');

    const empty = document.createElement('p');
    empty.className = 'sg-state-narrator-empty';
    empty.textContent = copy.empty;

    const controls = document.createElement('div');
    controls.className = 'sg-state-narrator-controls';

    const focusActions = document.createElement('button');
    focusActions.type = 'button';
    focusActions.textContent = copy.focusActions;

    const focusHistory = document.createElement('button');
    focusHistory.type = 'button';
    focusHistory.textContent = copy.focusHistory;

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = copy.clear;
    clear.disabled = true;

    controls.append(focusActions, focusHistory, clear);
    root.append(heading, summary, metrics, actionSummary, shortcuts, eventHeading, empty, events, controls);
    historyRoot.after(root);

    let enabled = true;
    let last = null;
    const changes = [];
    const MAX_CHANGES = 12;

    function publicRun() {
        const model = modelApi.get();
        const run = model?.run;
        if (!run) return null;
        return {
            id: String(run.id || ''),
            status: String(run.status || 'active'),
            revision: Number.isSafeInteger(run.revision) ? run.revision : 0,
            score: Number.isSafeInteger(run.score) ? run.score : 0,
            role: run.actorRole === 'owner' ? 'owner' : 'creator',
            turn: Number.isSafeInteger(run.state?.turn) ? run.state.turn : 0,
            mode: run.mode === 'coop' ? 'coop' : 'solo'
        };
    }

    function statusText(value) {
        return copy[value] || copy.failed;
    }

    function countActions() {
        return [...actions.querySelectorAll('button[data-type]')]
            .filter(control => !control.disabled && !control.hidden).length;
    }

    function actionText(count) {
        if (count === 0) return copy.noActions;
        if (count === 1) return copy.oneAction;
        return copy.manyActions(count);
    }

    function metric(term, value) {
        const row = document.createElement('div');
        const key = document.createElement('dt');
        const result = document.createElement('dd');
        key.textContent = term;
        result.textContent = String(value);
        row.append(key, result);
        return row;
    }

    function timestamp() {
        return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(new Date());
    }

    function describeChange(previous, current) {
        if (!previous && current) return `${copy.changed}: ${statusText(current.status)}`;
        if (previous && !current) return copy.noRun;
        if (!previous || !current) return copy.changed;
        if (previous.status !== current.status) {
            return current.status === 'active'
                ? `${copy.changed}: ${statusText(current.status)}`
                : `${statusText(current.status)}. ${copy.terminal}`;
        }
        if (previous.turn !== current.turn) return `${copy.newTurn} ${current.turn}`;
        if (previous.revision !== current.revision) return `${copy.changed}: ${copy.revision} ${current.revision}`;
        return '';
    }

    function renderChanges() {
        events.replaceChildren();
        for (const change of changes) {
            const item = document.createElement('li');
            const description = document.createElement('span');
            const time = document.createElement('time');
            description.textContent = change.message;
            time.dateTime = change.iso;
            time.textContent = `${copy.at} ${change.time}`;
            item.append(description, time);
            events.append(item);
        }
        empty.hidden = changes.length > 0;
        clear.disabled = changes.length === 0;
    }

    function record(message) {
        if (!message) return;
        changes.unshift({
            message: String(message).slice(0, 240),
            time: timestamp(),
            iso: new Date().toISOString()
        });
        changes.splice(MAX_CHANGES);
        renderChanges();
        if (enabled) shell?.announce?.(message, /terminal|完成|结束/.test(message) ? 'assertive' : 'polite');
    }

    function render() {
        const current = publicRun();
        const change = describeChange(last, current);
        const previous = last;
        last = current;

        if (!current) {
            summary.textContent = copy.noRun;
            metrics.replaceChildren();
            actionSummary.textContent = actionText(0);
            focusActions.disabled = true;
            focusHistory.disabled = historyRoot.children.length === 0;
            if (previous) record(change);
            return;
        }

        summary.textContent = statusText(current.status);
        summary.dataset.status = current.status;
        metrics.replaceChildren(
            metric(copy.revision, current.revision),
            metric(copy.turn, current.turn),
            metric(copy.score, current.score),
            metric(copy.role, current.role)
        );
        const available = countActions();
        actionSummary.textContent = `${copy.actions}: ${actionText(available)}`;
        focusActions.disabled = available === 0;
        focusHistory.disabled = historyRoot.children.length === 0;
        if (change) record(change);
    }

    function focusFirstAction() {
        const target = [...actions.querySelectorAll('button[data-type], select')]
            .find(control => !control.disabled && !control.hidden);
        target?.focus();
        return Boolean(target);
    }

    function focusRecentHistory() {
        const target = historyRoot.querySelector('li');
        if (!target) return false;
        target.tabIndex = -1;
        target.focus();
        return true;
    }

    toggle.addEventListener('click', () => {
        enabled = !enabled;
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.textContent = enabled ? copy.toggleOff : copy.toggleOn;
        events.setAttribute('aria-live', enabled ? 'polite' : 'off');
        shell?.announce?.(enabled ? copy.announcementsOn : copy.announcementsOff, 'polite');
    });

    focusActions.addEventListener('click', focusFirstAction);
    focusHistory.addEventListener('click', focusRecentHistory);
    clear.addEventListener('click', () => {
        changes.length = 0;
        renderChanges();
    });

    document.addEventListener('streamer-game:model', event => {
        if (event.detail?.gameId !== gameId) return;
        window.requestAnimationFrame(render);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'F6') {
            event.preventDefault();
            focusFirstAction();
        }
        if (event.key === 'F7') {
            event.preventDefault();
            focusRecentHistory();
        }
    });

    window.addEventListener('offline', () => record(copy.offline));
    window.addEventListener('online', () => {
        record(copy.online);
        modelApi.refresh().catch(() => {});
    });

    window.StreamerGameNarrator = Object.freeze({
        render,
        focusActions: focusFirstAction,
        focusHistory: focusRecentHistory,
        state: () => ({
            enabled,
            current: last ? { ...last } : null,
            changes: changes.map(change => ({ ...change })),
            availableActions: countActions()
        })
    });

    renderChanges();
    render();
})();
