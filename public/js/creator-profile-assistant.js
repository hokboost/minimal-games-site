'use strict';
(() => {
    const shell = window.CreatorShell;
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const forms = Array.from(document.querySelectorAll('.creator-form'));
    const message = document.getElementById('creator-message');
    const dirty = new Set();

    function create(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function installSectionNavigator() {
        const main = document.querySelector('main');
        const firstForm = forms[0];
        if (!main || !firstForm) return;
        const nav = create('nav', 'creator-form-navigator');
        nav.setAttribute('aria-label', t('资料设置章节', 'Profile settings sections'));
        const list = create('ol');
        forms.forEach((form, index) => {
            if (!form.id) form.id = `creator-form-section-${index + 1}`;
            const title = form.querySelector('h2')?.textContent.trim() || t(`第 ${index + 1} 节`, `Section ${index + 1}`);
            const item = create('li');
            const link = create('a', '', title);
            link.href = `#${form.id}`;
            link.addEventListener('click', () => {
                shell.announce(t(`前往：${title}`, `Moving to: ${title}`));
            });
            item.append(link);
            list.append(item);
        });
        nav.append(list);
        firstForm.before(nav);
    }

    function countTextFields() {
        for (const input of document.querySelectorAll('input[maxlength],textarea[maxlength]')) {
            const maximum = Number(input.maxLength);
            if (!Number.isSafeInteger(maximum) || maximum <= 0) continue;
            const counter = create('small', 'creator-input-counter');
            counter.id = `${input.id || input.name || 'field'}-counter-${Math.random().toString(36).slice(2, 7)}`;
            counter.setAttribute('aria-live', 'polite');
            const existing = input.getAttribute('aria-describedby');
            input.setAttribute('aria-describedby', [existing, counter.id].filter(Boolean).join(' '));
            input.after(counter);
            const update = () => {
                const used = Array.from(input.value || '').length;
                counter.textContent = t(`${used}/${maximum} 字`, `${used}/${maximum} characters`);
                counter.dataset.nearLimit = String(used >= maximum * 0.9);
            };
            input.addEventListener('input', update);
            update();
        }
    }

    function validateInteractionTones() {
        const inputs = Array.from(document.querySelectorAll('input[name="interactionTones"]'));
        if (!inputs.length) return;
        const fieldset = inputs[0].closest('fieldset');
        const status = create('p', 'creator-choice-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        fieldset?.append(status);
        const update = changed => {
            const checked = inputs.filter(input => input.checked);
            if (checked.length > 3 && changed) changed.checked = false;
            const accepted = inputs.filter(input => input.checked).length;
            status.textContent = t(`已选择 ${accepted}/3 个互动身份。`, `${accepted}/3 interaction roles selected.`);
            for (const input of inputs) input.disabled = accepted >= 3 && !input.checked;
            if (checked.length > 3) shell.announce(t('最多选择三个互动身份。', 'Choose at most three interaction roles.'), 'error');
        };
        inputs.forEach(input => input.addEventListener('change', () => update(input)));
        update();
    }

    function minute(value) {
        const match = /^(\d{2}):(\d{2})$/.exec(value || '');
        if (!match) return null;
        const hour = Number(match[1]);
        const minutes = Number(match[2]);
        if (hour > 23 || minutes > 59) return null;
        return hour * 60 + minutes;
    }

    function validatePreferredWindows() {
        for (const row of document.querySelectorAll('.creator-interaction-row')) {
            const enabled = row.querySelector('.interaction-enabled');
            const start = row.querySelector('.interaction-start');
            const end = row.querySelector('.interaction-end');
            const status = create('small', 'creator-window-status');
            row.append(status);
            const update = () => {
                start.disabled = !enabled.checked;
                end.disabled = !enabled.checked;
                if (!enabled.checked) {
                    status.textContent = t('当天不设偏好窗口。', 'No preferred window this day.');
                    status.dataset.invalid = 'false';
                    return;
                }
                const startMinute = minute(start.value);
                const endMinute = minute(end.value);
                const duration = startMinute === null || endMinute === null
                    ? 0
                    : (endMinute - startMinute + 1440) % 1440;
                const valid = duration >= 30 && duration <= 720;
                status.dataset.invalid = String(!valid);
                status.textContent = valid
                    ? t(`窗口时长 ${Math.floor(duration / 60)} 小时 ${duration % 60} 分。`,
                        `Window lasts ${Math.floor(duration / 60)}h ${duration % 60}m.`)
                    : t('窗口必须为 30 分钟至 12 小时。', 'Window must last 30 minutes to 12 hours.');
            };
            enabled.addEventListener('change', update);
            start.addEventListener('input', update);
            end.addEventListener('input', update);
            update();
        }
    }

    function trackDirtyForms() {
        for (const form of forms) {
            form.addEventListener('input', () => {
                dirty.add(form.id);
                form.dataset.dirty = 'true';
            });
            form.addEventListener('submit', event => {
                if (navigator.onLine === false) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    shell.announce(t('当前离线，资料未提交。输入仍保留在此页。',
                        'You are offline; the profile was not submitted. Your input remains on this page.'), 'error');
                    return;
                }
                shell.announce(t('正在保存此章节。', 'Saving this section.'));
            }, true);
        }
        window.addEventListener('beforeunload', event => {
            if (!dirty.size) return;
            event.preventDefault();
            event.returnValue = '';
        });
    }

    function observeMessage() {
        if (!message) return;
        new MutationObserver(() => {
            const value = message.textContent.trim();
            if (!value) return;
            if (!/失败|error|冲突|conflict/i.test(value)) {
                for (const form of forms) {
                    form.dataset.dirty = 'false';
                    dirty.delete(form.id);
                }
            }
            shell.announce(value, /失败|error|冲突|conflict/i.test(value) ? 'error' : 'success');
        }).observe(message, { childList: true, subtree: true, characterData: true });
    }

    installSectionNavigator();
    countTextFields();
    validateInteractionTones();
    validatePreferredWindows();
    trackDirtyForms();
    observeMessage();
    window.CreatorProfileAssistant = Object.freeze({
        dirty: () => Array.from(dirty),
        minute
    });
})();
