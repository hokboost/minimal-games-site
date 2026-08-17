'use strict';
(() => {
    const root = document.documentElement;
    const body = document.body;
    const language = body.dataset.lang === 'en' ? 'en' : 'zh';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const preferenceKey = 'creator-access-preferences-v1';
    const allowedPreferences = new Set(['contrast', 'largeText', 'reduceMotion']);
    const listeners = new Map();
    let currentPreferences = readPreferences();
    let lastFocused = null;

    function readPreferences() {
        try {
            const parsed = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
            return Object.fromEntries([...allowedPreferences].map(key => [key, parsed[key] === true]));
        } catch {
            return { contrast: false, largeText: false, reduceMotion: false };
        }
    }

    function writePreferences() {
        try {
            localStorage.setItem(preferenceKey, JSON.stringify(currentPreferences));
        } catch {
            announce(t('浏览器未保存显示偏好。', 'The browser could not save display preferences.'), 'warning');
        }
    }

    function applyPreferences() {
        body.classList.toggle('creator-high-contrast', currentPreferences.contrast);
        body.classList.toggle('creator-large-text', currentPreferences.largeText);
        body.classList.toggle('creator-reduce-motion', currentPreferences.reduceMotion);
        document.querySelectorAll('[data-creator-preference]').forEach(button => {
            button.setAttribute('aria-pressed', String(Boolean(currentPreferences[button.dataset.creatorPreference])));
        });
        emit('preferences', { ...currentPreferences });
    }

    function emit(type, detail) {
        for (const callback of listeners.get(type) || []) callback(detail);
        document.dispatchEvent(new CustomEvent(`creator:${type}`, { detail }));
    }

    function on(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
        return () => listeners.get(type)?.delete(callback);
    }

    function createButton(label, preference) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'creator-access-button';
        button.dataset.creatorPreference = preference;
        button.textContent = label;
        button.setAttribute('aria-pressed', String(Boolean(currentPreferences[preference])));
        button.addEventListener('click', () => {
            currentPreferences = { ...currentPreferences, [preference]: !currentPreferences[preference] };
            writePreferences();
            applyPreferences();
            announce(t('显示偏好已更新。', 'Display preference updated.'), 'success');
        });
        return button;
    }

    function installShell() {
        body.classList.add('creator-access-shell', 'creator-focus-ring');
        const main = document.querySelector('main');
        if (main) {
            if (!main.id) main.id = 'creator-main';
            main.tabIndex = -1;
            main.classList.add('creator-main-target');
        }

        const skip = document.createElement('a');
        skip.className = 'creator-skip-link';
        skip.href = main ? `#${main.id}` : '#';
        skip.textContent = t('跳到主要内容', 'Skip to main content');
        body.prepend(skip);

        const toolbar = document.createElement('nav');
        toolbar.className = 'creator-access-toolbar';
        toolbar.setAttribute('aria-label', t('显示与辅助功能', 'Display and accessibility'));
        const title = document.createElement('strong');
        title.textContent = t('主播世界辅助工具', 'Creator World accessibility');
        toolbar.append(
            title,
            createButton(t('高对比', 'High contrast'), 'contrast'),
            createButton(t('大字', 'Large text'), 'largeText'),
            createButton(t('减少动态', 'Reduce motion'), 'reduceMotion')
        );
        const layout = document.querySelector('.site-layout');
        (layout || body).prepend(toolbar);

        const banner = document.createElement('aside');
        banner.className = 'creator-network-banner';
        banner.hidden = navigator.onLine !== false;
        banner.setAttribute('role', 'status');
        const bannerText = document.createElement('p');
        bannerText.textContent = t(
            '当前离线。已加载内容仍可查看；写操作会保留原命令并等待你重试。',
            'You are offline. Loaded content remains readable; writes keep their original command for retry.'
        );
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'creator-access-button';
        retry.textContent = t('检查连接', 'Check connection');
        retry.addEventListener('click', () => {
            emit('network-retry', {});
            announce(navigator.onLine === false
                ? t('仍处于离线状态。', 'Still offline.')
                : t('连接已恢复。', 'Connection restored.'), navigator.onLine === false ? 'warning' : 'success');
        });
        banner.append(bannerText, retry);
        toolbar.after(banner);

        const live = document.createElement('div');
        live.id = 'creator-global-status';
        live.className = 'creator-live-region';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        body.append(live);

        window.addEventListener('offline', () => {
            banner.hidden = false;
            announce(t('连接已断开，页面进入只读恢复模式。', 'Connection lost; the page is in read-only recovery mode.'), 'warning');
            emit('network', { online: false });
        });
        window.addEventListener('online', () => {
            banner.hidden = true;
            announce(t('连接已恢复，可以安全重试。', 'Connection restored; retry is safe.'), 'success');
            emit('network', { online: true });
        });
        applyPreferences();
    }

    function announce(message, tone = 'info', timeout = 6000) {
        const live = document.getElementById('creator-global-status');
        if (!live) return;
        live.dataset.tone = tone;
        live.textContent = String(message || '');
        clearTimeout(announce.timer);
        if (message && timeout > 0) {
            announce.timer = setTimeout(() => {
                if (live.textContent === message) live.textContent = '';
            }, timeout);
        }
    }

    function busy(container, value, label = t('正在保存…', 'Saving…')) {
        if (!container) return;
        container.setAttribute('aria-busy', String(Boolean(value)));
        if (value) {
            lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            container.dataset.loadingLabel = label;
        } else {
            delete container.dataset.loadingLabel;
            if (lastFocused?.isConnected && !lastFocused.disabled) lastFocused.focus();
            lastFocused = null;
        }
        container.querySelectorAll('button, input, select, textarea').forEach(control => {
            if (value) {
                control.dataset.creatorWasDisabled = String(control.disabled);
                control.disabled = true;
            } else if (control.dataset.creatorWasDisabled !== undefined) {
                control.disabled = control.dataset.creatorWasDisabled === 'true';
                delete control.dataset.creatorWasDisabled;
            }
        });
    }

    function normalizeText(value) {
        return String(value || '').normalize('NFKC').toLocaleLowerCase(language === 'zh' ? 'zh-CN' : 'en-US').trim();
    }

    function paginate(items, page, pageSize) {
        const size = Math.max(1, Math.min(100, Number(pageSize) || 12));
        const pages = Math.max(1, Math.ceil(items.length / size));
        const selected = Math.max(1, Math.min(pages, Number(page) || 1));
        return {
            items: items.slice((selected - 1) * size, selected * size),
            page: selected,
            pageSize: size,
            pages,
            total: items.length
        };
    }

    function renderPagination(container, result, onPage) {
        container.replaceChildren();
        container.className = 'creator-pagination';
        container.setAttribute('aria-label', t('分页', 'Pagination'));
        const add = (label, page, disabled, current = false) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'creator-page-button';
            button.textContent = label;
            button.disabled = disabled;
            if (current) button.setAttribute('aria-current', 'page');
            button.addEventListener('click', () => onPage(page));
            container.append(button);
        };
        add(t('上一页', 'Previous'), result.page - 1, result.page <= 1);
        const start = Math.max(1, result.page - 2);
        const end = Math.min(result.pages, result.page + 2);
        for (let page = start; page <= end; page += 1) add(String(page), page, false, page === result.page);
        add(t('下一页', 'Next'), result.page + 1, result.page >= result.pages);
    }

    function filterItems(items, { query = '', status = '', category = '' }, fields = {}) {
        const needle = normalizeText(query);
        return items.filter(item => {
            if (status && String(item[fields.status || 'status'] || '') !== status) return false;
            if (category && String(item[fields.category || 'category'] || '') !== category) return false;
            if (!needle) return true;
            const searchable = (fields.search || ['title', 'description', 'status'])
                .map(key => normalizeText(item[key]))
                .join(' ');
            return searchable.includes(needle);
        });
    }

    function createStatePanel(type, title, description, retryCallback) {
        const panel = document.createElement('section');
        panel.className = `creator-${type}-state`;
        const heading = document.createElement('h2');
        heading.textContent = title;
        const copy = document.createElement('p');
        copy.textContent = description;
        panel.append(heading, copy);
        if (retryCallback) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'creator-access-button';
            button.textContent = t('重试', 'Retry');
            button.addEventListener('click', retryCallback);
            panel.append(button);
        }
        return panel;
    }

    function safeRequest(factory, { container, loading, success, failure, retry } = {}) {
        busy(container, true, loading || t('正在加载…', 'Loading…'));
        return Promise.resolve()
            .then(factory)
            .then(value => {
                if (success) announce(success, 'success');
                return value;
            })
            .catch(error => {
                const message = error?.status === 409
                    ? t('状态已在其他页面更新，正在读取最新版本。', 'State changed elsewhere; loading the latest version.')
                    : failure || t('暂时无法完成，请安全重试。', 'Unable to finish right now; retry is safe.');
                announce(message, error?.status === 409 ? 'warning' : 'error', 9000);
                if (retry) emit('request-retryable', { retry, error });
                throw error;
            })
            .finally(() => busy(container, false));
    }

    function trapDialog(dialog) {
        const focusable = () => [...dialog.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )].filter(element => !element.hidden);
        const handler = event => {
            if (event.key === 'Escape') dialog.close();
            if (event.key !== 'Tab') return;
            const controls = focusable();
            if (!controls.length) return;
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        dialog.addEventListener('keydown', handler);
        dialog.addEventListener('close', () => {
            dialog.removeEventListener('keydown', handler);
            if (lastFocused?.isConnected) lastFocused.focus();
        }, { once: true });
        lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        queueMicrotask(() => focusable()[0]?.focus());
    }

    installShell();
    window.CreatorShell = Object.freeze({
        announce,
        busy,
        createStatePanel,
        filterItems,
        normalizeText,
        on,
        paginate,
        renderPagination,
        safeRequest,
        trapDialog,
        preferences: () => ({ ...currentPreferences })
    });
})();
