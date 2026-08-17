'use strict';
(() => {
    const shell = window.CreatorShell;
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const message = document.getElementById('quest-message') || document.getElementById('director-message');
    const state = {
        query: '',
        status: '',
        page: 1,
        pageSize: 20,
        visibleRows: 0,
        lastError: null
    };

    function create(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function normalize(value) {
        return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    }

    function installTableNavigator() {
        const table = document.querySelector('.creator-table, .quest-table-wrap table');
        if (!table || document.getElementById('admin-table-tools')) return;
        const wrapper = table.closest('.creator-table-wrap, .quest-table-wrap');
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const tools = create('section', 'creator-explorer-controls');
        tools.id = 'admin-table-tools';
        tools.setAttribute('aria-label', t('管理表格筛选', 'Admin table filters'));
        const searchLabel = create('label', 'creator-explorer-field');
        searchLabel.append(create('span', '', t('搜索当前页', 'Search current page')));
        const search = create('input', 'creator-explorer-search');
        search.type = 'search';
        search.placeholder = t('账号、标题、状态或版本', 'Account, title, status, or version');
        searchLabel.append(search);
        const statusLabel = create('label', 'creator-explorer-field');
        statusLabel.append(create('span', '', t('状态', 'Status')));
        const status = create('select', 'creator-explorer-select');
        const any = create('option', '', t('全部状态', 'All states'));
        any.value = '';
        status.append(any);
        const values = new Set();
        for (const row of rows) {
            const value = row.children?.[2]?.textContent.trim()
                || row.querySelector('.live-status')?.textContent.trim()
                || '';
            row.dataset.adminStatus = normalize(value);
            if (value) values.add(value);
        }
        for (const value of Array.from(values).sort()) {
            const option = create('option', '', value);
            option.value = normalize(value);
            status.append(option);
        }
        statusLabel.append(status);
        const clear = create('button', 'creator-explorer-clear', t('清除', 'Clear'));
        clear.type = 'button';
        const summary = create('p', 'creator-explorer-summary');
        summary.setAttribute('role', 'status');
        summary.setAttribute('aria-live', 'polite');
        tools.append(searchLabel, statusLabel, clear, summary);
        wrapper.before(tools);

        const pager = create('nav', 'creator-inline-pager');
        pager.setAttribute('aria-label', t('表格结果分页', 'Table result pages'));
        const previous = create('button', '', t('上一页', 'Previous'));
        previous.type = 'button';
        const page = create('span');
        const next = create('button', '', t('下一页', 'Next'));
        next.type = 'button';
        pager.append(previous, page, next);
        wrapper.after(pager);

        function filtered() {
            return rows.filter(row => {
                if (state.query && !normalize(row.textContent).includes(state.query)) return false;
                if (state.status && row.dataset.adminStatus !== state.status) return false;
                return true;
            });
        }

        function render() {
            const matches = filtered();
            const pageCount = Math.max(1, Math.ceil(matches.length / state.pageSize));
            state.page = Math.min(Math.max(state.page, 1), pageCount);
            const start = (state.page - 1) * state.pageSize;
            const visible = new Set(matches.slice(start, start + state.pageSize));
            for (const row of rows) {
                row.hidden = !visible.has(row);
                row.setAttribute('aria-hidden', String(!visible.has(row)));
            }
            state.visibleRows = visible.size;
            summary.textContent = t(`当前页显示 ${visible.size} 行，共匹配 ${matches.length} 行。`,
                `${visible.size} rows on this page; ${matches.length} match.`);
            page.textContent = t(`第 ${state.page}/${pageCount} 页`, `Page ${state.page} of ${pageCount}`);
            previous.disabled = state.page <= 1;
            next.disabled = state.page >= pageCount;
            pager.hidden = matches.length <= state.pageSize;
        }

        function apply() {
            state.query = normalize(search.value);
            state.status = status.value;
            state.page = 1;
            render();
        }
        search.addEventListener('input', apply);
        status.addEventListener('change', apply);
        clear.addEventListener('click', () => {
            search.value = '';
            status.value = '';
            apply();
            search.focus();
        });
        previous.addEventListener('click', () => {
            state.page -= 1;
            render();
        });
        next.addEventListener('click', () => {
            state.page += 1;
            render();
        });
        render();
    }

    function enhanceDraftBuilder() {
        const form = document.getElementById('quest-draft-form');
        if (!form) return;
        const explanation = create('details', 'creator-boundary-disclosure');
        const heading = create('summary', '', t('草稿发布边界', 'Draft publication boundary'));
        const list = create('ol');
        for (const text of [
            t('保存只创建 draft；不会分配给主播或发放积分。', 'Save creates a draft only; it neither assigns creators nor awards points.'),
            t('可信事件必须来自关闭注册表，浏览器字段不能注册新事件类型。',
                'Trusted events must come from the closed registry; browser fields cannot register new event types.'),
            t('发布会冻结内容哈希、步骤和规则，后续修改必须使用新版本。',
                'Publication freezes content hash, steps, and rules; later changes require a new version.'),
            t('人工证据只进入审核队列；批准、总账、结算与审计同事务。',
                'Manual evidence enters review only; approval, ledger, settlement, and audit share a transaction.')
        ]) list.append(create('li', '', text));
        explanation.append(heading, list);
        form.before(explanation);

        for (const field of form.querySelectorAll('input[maxlength],textarea[maxlength]')) {
            const maximum = Number(field.maxLength);
            const counter = create('small', 'creator-input-counter');
            counter.setAttribute('aria-live', 'polite');
            const update = () => {
                counter.textContent = `${Array.from(field.value || '').length}/${maximum}`;
                counter.dataset.nearLimit = String(field.value.length >= maximum * 0.9);
            };
            field.after(counter);
            field.addEventListener('input', update);
            update();
        }

        const verification = form.elements.verificationMode;
        const evidence = form.elements.evidenceKind;
        const eventType = form.elements.eventType;
        const updateMode = () => {
            const automatic = verification.value === 'automatic';
            eventType.disabled = !automatic;
            evidence.disabled = automatic;
            if (automatic) evidence.value = 'trusted_event';
            shell.announce(automatic
                ? t('自动任务将使用已注册可信事件。', 'Automatic quest will use a registered trusted event.')
                : t('人工任务需要有界证据审核。', 'Manual quest requires bounded evidence review.'));
        };
        verification.addEventListener('change', updateMode);
        updateMode();
    }

    function enhanceDirectorComposer() {
        const composer = document.getElementById('director-composer');
        if (!composer) return;
        composer.setAttribute('role', 'dialog');
        composer.setAttribute('aria-modal', 'false');
        composer.setAttribute('aria-labelledby', composer.querySelector('h2')?.id || 'director-target');
        const send = document.getElementById('director-send');
        const cancel = document.getElementById('director-cancel');
        cancel?.addEventListener('click', () => {
            document.querySelector('[data-director-action="compose"]')?.focus();
            shell.announce(t('已取消结构化发送。', 'Structured send cancelled.'));
        });
        send?.addEventListener('click', event => {
            if (navigator.onLine !== false) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            shell.announce(t('当前离线，结构化互动没有持久保存。',
                'You are offline; the structured interaction was not persisted.'), 'error');
        }, true);
        new MutationObserver(() => {
            if (composer.hidden) return;
            composer.querySelector('select,textarea,button')?.focus();
            shell.announce(t('结构化发送编辑器已打开。', 'Structured send composer opened.'));
        }).observe(composer, { attributes: true, attributeFilter: ['hidden'] });
    }

    function enhanceReviewQueue() {
        const reports = document.getElementById('director-reports');
        const questCards = Array.from(document.querySelectorAll('[data-review]'));
        const cards = reports
            ? Array.from(reports.querySelectorAll('[data-report-id]'))
            : questCards.map(button => button.closest('.quest-card')).filter((card, index, values) => values.indexOf(card) === index);
        if (!cards.length) return;
        const parent = reports || cards[0].parentElement;
        const summary = create('p', 'creator-review-summary', t(
            `${cards.length} 项等待有权限的管理员处理。`,
            `${cards.length} items await an authorized administrator.`
        ));
        parent.before(summary);
        for (const card of cards) {
            card.querySelector('textarea')?.setAttribute('aria-label', t('审核说明', 'Review note'));
            for (const button of card.querySelectorAll('button')) {
                button.addEventListener('click', () => {
                    shell.announce(t('正在以事务方式保存审核决定。', 'Saving the review decision transactionally.'));
                });
            }
        }
    }

    function guardAdminMutationsOffline() {
        document.addEventListener('click', event => {
            const mutation = event.target.closest('[data-review],[data-publish-version],[data-director-action],[data-report-action]');
            if (!mutation || navigator.onLine !== false) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            shell.announce(t('当前离线；管理操作没有执行。', 'You are offline; no admin operation was executed.'), 'error');
        }, true);
    }

    function observeErrors() {
        if (!message) return;
        new MutationObserver(() => {
            const value = message.textContent.trim();
            if (!value) return;
            const conflict = /409|revision|修订|冲突|conflict/i.test(value);
            state.lastError = value;
            shell.announce(conflict
                ? t('页面状态已经变化，请刷新权威数据后重试。', 'Page state changed; reload authoritative data before retrying.')
                : value, 'error');
            if (!conflict || document.getElementById('admin-conflict-recovery')) return;
            const recovery = create('button', 'creator-access-button', t('刷新权威状态', 'Reload authoritative state'));
            recovery.type = 'button';
            recovery.id = 'admin-conflict-recovery';
            recovery.addEventListener('click', () => location.reload());
            message.after(recovery);
        }).observe(message, { childList: true, subtree: true, characterData: true });
    }

    installTableNavigator();
    enhanceDraftBuilder();
    enhanceDirectorComposer();
    enhanceReviewQueue();
    guardAdminMutationsOffline();
    observeErrors();
    window.AdminWorkspaceExperience = Object.freeze({ state: () => ({ ...state }) });
})();
