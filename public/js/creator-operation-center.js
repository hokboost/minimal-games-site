(function creatorOperationCenterBootstrap() {
    'use strict';

    const shell = window.CreatorShell;
    if (!shell || !document.body || document.querySelector('[data-operation-center]')) return;

    const language = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const copy = language === 'zh' ? {
        title: '操作与恢复',
        open: '操作记录',
        close: '关闭操作记录',
        empty: '本页尚无操作。发起任务、选择或保存后，恢复状态会显示在这里。',
        pending: '处理中',
        complete: '已完成',
        conflict: '状态已更新',
        failed: '需要重试',
        offline: '等待网络',
        retry: '重试',
        dismiss: '移除',
        clear: '清除已完成',
        networkBack: '网络已恢复，可以重试等待中的操作。',
        networkLost: '网络中断。未确认的操作不会被标记完成。',
        conflictHelp: '服务器状态较新。页面已请求刷新，请确认最新内容后再操作。',
        failureHelp: '操作没有得到确认。使用原操作键安全重试，避免重复提交。',
        details: '详细状态',
        time: '时间',
        state: '状态',
        route: '请求',
        unknown: '页面操作',
        saved: '服务器已确认',
        copied: '恢复编号已复制',
        copyId: '复制恢复编号'
    } : {
        title: 'Operations and recovery',
        open: 'Operation history',
        close: 'Close operation history',
        empty: 'No operations on this page yet. Recovery status appears here after a task, choice, or save.',
        pending: 'In progress',
        complete: 'Complete',
        conflict: 'State changed',
        failed: 'Retry needed',
        offline: 'Waiting for network',
        retry: 'Retry',
        dismiss: 'Remove',
        clear: 'Clear completed',
        networkBack: 'Connection restored. Waiting operations can be retried.',
        networkLost: 'Connection lost. Unconfirmed operations will not be marked complete.',
        conflictHelp: 'The server has newer state. A refresh was requested; review it before acting again.',
        failureHelp: 'The operation was not confirmed. Retry with its original operation key to avoid duplicates.',
        details: 'Detailed status',
        time: 'Time',
        state: 'State',
        route: 'Request',
        unknown: 'Page operation',
        saved: 'Confirmed by server',
        copied: 'Recovery ID copied',
        copyId: 'Copy recovery ID'
    };

    const MAX_OPERATIONS = 20;
    const operations = [];
    let serial = 0;
    let dialogOpen = false;
    let lastFocus = null;

    const root = document.createElement('section');
    root.className = 'creator-operation-center';
    root.dataset.operationCenter = 'true';
    root.setAttribute('aria-label', copy.title);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'creator-operation-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'creator-operation-dialog');
    const triggerIcon = document.createElement('span');
    triggerIcon.setAttribute('aria-hidden', 'true');
    triggerIcon.textContent = '↺';
    const triggerText = document.createElement('span');
    triggerText.textContent = copy.open;
    const triggerCount = document.createElement('span');
    triggerCount.className = 'creator-operation-count';
    triggerCount.setAttribute('aria-label', '0');
    triggerCount.textContent = '0';
    trigger.append(triggerIcon, triggerText, triggerCount);

    const dialog = document.createElement('div');
    dialog.id = 'creator-operation-dialog';
    dialog.className = 'creator-operation-dialog';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'creator-operation-title');

    const heading = document.createElement('div');
    heading.className = 'creator-operation-heading';
    const headingText = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'creator-operation-kicker';
    kicker.textContent = 'RECOVERY';
    const dialogTitle = document.createElement('h2');
    dialogTitle.id = 'creator-operation-title';
    dialogTitle.textContent = copy.title;
    headingText.append(kicker, dialogTitle);
    heading.append(headingText);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'creator-operation-close';
    close.setAttribute('aria-label', copy.close);
    close.textContent = '×';
    heading.append(close);

    const network = document.createElement('p');
    network.className = 'creator-operation-network';
    network.setAttribute('role', 'status');
    network.hidden = navigator.onLine;
    network.textContent = copy.networkLost;

    const list = document.createElement('ol');
    list.className = 'creator-operation-list';
    list.setAttribute('aria-live', 'polite');
    list.setAttribute('aria-relevant', 'additions text');

    const empty = document.createElement('p');
    empty.className = 'creator-operation-empty';
    empty.textContent = copy.empty;

    const footer = document.createElement('div');
    footer.className = 'creator-operation-footer';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'creator-operation-clear';
    clear.textContent = copy.clear;
    footer.append(clear);
    dialog.append(heading, network, empty, list, footer);
    root.append(trigger, dialog);
    document.body.append(root);

    function safePath(value) {
        try {
            const url = new URL(String(value || ''), window.location.origin);
            return url.origin === window.location.origin ? `${url.pathname}${url.search}` : copy.unknown;
        } catch (_) {
            return copy.unknown;
        }
    }

    function operationLabel(operation) {
        if (operation.label) return operation.label;
        const method = operation.method && operation.method !== 'GET' ? `${operation.method} ` : '';
        return `${method}${operation.path || copy.unknown}`;
    }

    function statusCopy(status) {
        return copy[status] || copy.failed;
    }

    function statusHelp(operation) {
        if (operation.status === 'conflict') return copy.conflictHelp;
        if (operation.status === 'failed' || operation.status === 'offline') return operation.message || copy.failureHelp;
        if (operation.status === 'complete') return operation.message || copy.saved;
        return operation.message || statusCopy(operation.status);
    }

    function formatTime(timestamp) {
        return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(new Date(timestamp));
    }

    function setCount() {
        const count = operations.filter(item => ['pending', 'failed', 'offline', 'conflict'].includes(item.status)).length;
        const badge = trigger.querySelector('.creator-operation-count');
        badge.textContent = String(count);
        badge.setAttribute('aria-label', String(count));
        trigger.classList.toggle('has-attention', count > 0);
    }

    function renderOperation(operation) {
        const item = document.createElement('li');
        item.className = `creator-operation-item is-${operation.status}`;
        item.dataset.operationId = operation.id;

        const summary = document.createElement('div');
        summary.className = 'creator-operation-summary';

        const state = document.createElement('span');
        state.className = 'creator-operation-state';
        state.textContent = statusCopy(operation.status);

        const title = document.createElement('strong');
        title.textContent = operationLabel(operation);

        const time = document.createElement('time');
        time.dateTime = new Date(operation.updatedAt).toISOString();
        time.textContent = formatTime(operation.updatedAt);
        summary.append(state, title, time);

        const help = document.createElement('p');
        help.textContent = statusHelp(operation);

        const details = document.createElement('details');
        const detailsSummary = document.createElement('summary');
        detailsSummary.textContent = copy.details;
        const description = document.createElement('dl');
        const detailsRows = [
            [copy.state, statusCopy(operation.status)],
            [copy.route, operation.path || copy.unknown],
            [copy.time, formatTime(operation.startedAt)]
        ];
        detailsRows.forEach(([term, value]) => {
            const row = document.createElement('div');
            const definitionTerm = document.createElement('dt');
            const definitionValue = document.createElement('dd');
            definitionTerm.textContent = term;
            definitionValue.textContent = value;
            row.append(definitionTerm, definitionValue);
            description.append(row);
        });
        details.append(detailsSummary, description);

        const actions = document.createElement('div');
        actions.className = 'creator-operation-actions';

        if (operation.retry && ['failed', 'offline', 'conflict'].includes(operation.status)) {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = copy.retry;
            retry.addEventListener('click', () => retryOperation(operation.id));
            actions.append(retry);
        }

        if (operation.key && navigator.clipboard?.writeText) {
            const copyButton = document.createElement('button');
            copyButton.type = 'button';
            copyButton.textContent = copy.copyId;
            copyButton.addEventListener('click', async () => {
                await navigator.clipboard.writeText(operation.key);
                shell.announce(copy.copied, 'polite');
            });
            actions.append(copyButton);
        }

        if (operation.status !== 'pending') {
            const dismiss = document.createElement('button');
            dismiss.type = 'button';
            dismiss.textContent = copy.dismiss;
            dismiss.addEventListener('click', () => removeOperation(operation.id));
            actions.append(dismiss);
        }

        item.append(summary, help, details, actions);
        return item;
    }

    function render() {
        list.replaceChildren(...operations.map(renderOperation));
        empty.hidden = operations.length > 0;
        clear.disabled = !operations.some(operation => operation.status === 'complete');
        setCount();
    }

    function openDialog() {
        if (dialogOpen) return;
        dialogOpen = true;
        lastFocus = document.activeElement;
        dialog.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        document.body.classList.add('creator-operation-open');
        close.focus();
    }

    function closeDialog() {
        if (!dialogOpen) return;
        dialogOpen = false;
        dialog.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('creator-operation-open');
        lastFocus?.focus?.();
    }

    function trim() {
        while (operations.length > MAX_OPERATIONS) {
            const completeIndex = operations.findLastIndex(operation => operation.status === 'complete');
            operations.splice(completeIndex >= 0 ? completeIndex : operations.length - 1, 1);
        }
    }

    function begin(input = {}) {
        const operation = {
            id: input.id || `page-operation-${Date.now()}-${++serial}`,
            key: input.key || null,
            label: input.label || '',
            method: String(input.method || 'POST').toUpperCase(),
            path: safePath(input.path || window.location.pathname),
            status: navigator.onLine ? 'pending' : 'offline',
            message: input.message || '',
            startedAt: Date.now(),
            updatedAt: Date.now(),
            retry: typeof input.retry === 'function' ? input.retry : null
        };
        operations.unshift(operation);
        trim();
        render();
        return operation.id;
    }

    function update(id, patch = {}) {
        const operation = operations.find(candidate => candidate.id === id);
        if (!operation) return false;
        const allowedStatus = ['pending', 'complete', 'conflict', 'failed', 'offline'];
        if (patch.status && allowedStatus.includes(patch.status)) operation.status = patch.status;
        if (typeof patch.message === 'string') operation.message = patch.message.slice(0, 500);
        if (typeof patch.retry === 'function') operation.retry = patch.retry;
        if (typeof patch.key === 'string') operation.key = patch.key.slice(0, 180);
        operation.updatedAt = Date.now();
        render();
        return true;
    }

    function finish(id, response) {
        const conflict = response?.status === 409 || response?.code === 'REVISION_CONFLICT';
        return update(id, {
            status: conflict ? 'conflict' : 'complete',
            message: conflict ? copy.conflictHelp : copy.saved
        });
    }

    function fail(id, error) {
        const offline = !navigator.onLine || error?.name === 'OfflineError';
        const conflict = error?.status === 409 || error?.code === 'REVISION_CONFLICT';
        return update(id, {
            status: offline ? 'offline' : conflict ? 'conflict' : 'failed',
            message: String(error?.message || (offline ? copy.networkLost : copy.failureHelp)).slice(0, 500)
        });
    }

    async function retryOperation(id) {
        const operation = operations.find(candidate => candidate.id === id);
        if (!operation || !operation.retry || operation.status === 'pending') return;
        if (!navigator.onLine) {
            update(id, { status: 'offline', message: copy.networkLost });
            return;
        }
        update(id, { status: 'pending', message: '' });
        try {
            const result = await operation.retry({ key: operation.key, id: operation.id });
            finish(id, result);
        } catch (error) {
            fail(id, error);
        }
    }

    function removeOperation(id) {
        const index = operations.findIndex(candidate => candidate.id === id);
        if (index < 0) return;
        operations.splice(index, 1);
        render();
    }

    function clearCompleted() {
        for (let index = operations.length - 1; index >= 0; index -= 1) {
            if (operations[index].status === 'complete') operations.splice(index, 1);
        }
        render();
    }

    function handleOperationEvent(event) {
        const detail = event.detail || {};
        if (event.type === 'creator:operation-start') {
            const id = begin(detail);
            if (typeof detail.resolveId === 'function') detail.resolveId(id);
            return;
        }
        if (!detail.id) return;
        if (event.type === 'creator:operation-complete') finish(detail.id, detail.response);
        if (event.type === 'creator:operation-failed') fail(detail.id, detail.error);
        if (event.type === 'creator:operation-update') update(detail.id, detail);
    }

    function markPendingOffline() {
        operations.forEach(operation => {
            if (operation.status === 'pending') {
                operation.status = 'offline';
                operation.message = copy.networkLost;
                operation.updatedAt = Date.now();
            }
        });
        network.hidden = false;
        network.textContent = copy.networkLost;
        render();
        shell.announce(copy.networkLost, 'assertive');
    }

    function markOnline() {
        network.hidden = false;
        network.textContent = copy.networkBack;
        shell.announce(copy.networkBack, 'polite');
        window.setTimeout(() => {
            if (navigator.onLine) network.hidden = true;
        }, 4000);
    }

    trigger.addEventListener('click', () => dialogOpen ? closeDialog() : openDialog());
    close.addEventListener('click', closeDialog);
    clear.addEventListener('click', clearCompleted);
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog();
        }
        if (event.key !== 'Tab') return;
        const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], summary, input, select, textarea')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    window.addEventListener('offline', markPendingOffline);
    window.addEventListener('online', markOnline);
    window.addEventListener('creator:operation-start', handleOperationEvent);
    window.addEventListener('creator:operation-complete', handleOperationEvent);
    window.addEventListener('creator:operation-failed', handleOperationEvent);
    window.addEventListener('creator:operation-update', handleOperationEvent);

    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason;
        if (!reason || reason.operationVisible === false) return;
        const id = begin({
            label: reason.operationLabel || copy.unknown,
            path: reason.path || window.location.pathname
        });
        fail(id, reason);
    });

    window.CreatorOperations = Object.freeze({
        begin,
        update,
        finish,
        fail,
        retry: retryOperation,
        open: openDialog,
        close: closeDialog,
        snapshot: () => operations.map(operation => ({
            id: operation.id,
            key: operation.key,
            label: operation.label,
            method: operation.method,
            path: operation.path,
            status: operation.status,
            message: operation.message,
            startedAt: operation.startedAt,
            updatedAt: operation.updatedAt,
            retryable: Boolean(operation.retry)
        }))
    });

    render();
})();
