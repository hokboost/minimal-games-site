'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {
    FakeEvent,
    append,
    createBrowser,
    response,
    source
} = require('./helpers/phase9-dom');

function shellBrowser(options = {}) {
    const timers = [];
    const browser = createBrowser({
        lang: options.lang || 'en',
        online: options.online,
        storage: options.storage,
        setTimeout(callback, delay) {
            timers.push({ callback, delay });
            return timers.length;
        },
        clearTimeout(id) {
            if (timers[id - 1]) timers[id - 1].cleared = true;
        }
    });
    browser.document.body.dataset.lang = options.lang || 'en';
    const layout = append(browser.document, browser.document.body, 'div', { className: 'site-layout' });
    const main = append(browser.document, layout, 'main', { className: 'creator-shell' });
    browser.run('public/js/creator-shell.js');
    return { ...browser, layout, main, timers };
}

function buttons(root) {
    return root.querySelectorAll('button');
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test('shared shell installs a main landmark, skip link, toolbar, banner, and live region', () => {
    const browser = shellBrowser();
    assert.equal(browser.main.id, 'creator-main');
    assert.equal(browser.main.tabIndex, -1);
    assert.equal(browser.main.classList.contains('creator-main-target'), true);
    const skip = browser.document.querySelector('.creator-skip-link');
    assert.ok(skip);
    assert.equal(skip.href, '#creator-main');
    assert.equal(skip.textContent, 'Skip to main content');
    const toolbar = browser.document.querySelector('.creator-access-toolbar');
    assert.ok(toolbar);
    assert.equal(toolbar.getAttribute('aria-label'), 'Display and accessibility');
    assert.equal(buttons(toolbar).length, 3);
    const banner = browser.document.querySelector('.creator-network-banner');
    assert.ok(banner);
    assert.equal(banner.hidden, true);
    const live = browser.document.getElementById('creator-global-status');
    assert.ok(live);
    assert.equal(live.getAttribute('aria-live'), 'polite');
});

test('shared shell renders Chinese accessibility labels when the page language is zh', () => {
    const browser = shellBrowser({ lang: 'zh' });
    assert.equal(browser.document.querySelector('.creator-skip-link').textContent, '跳到主要内容');
    assert.equal(browser.document.querySelector('.creator-access-toolbar strong').textContent, '主播世界辅助工具');
    assert.deepEqual(buttons(browser.document.querySelector('.creator-access-toolbar')).map(button => button.textContent), [
        '高对比',
        '大字',
        '减少动态'
    ]);
});

test('saved display preferences are restored with strict boolean semantics', () => {
    const browser = shellBrowser({
        storage: {
            'creator-access-preferences-v1': JSON.stringify({
                contrast: true,
                largeText: 1,
                reduceMotion: true,
                injected: true
            })
        }
    });
    assert.deepEqual(plain(browser.window.CreatorShell.preferences()), {
        contrast: true,
        largeText: false,
        reduceMotion: true
    });
    assert.equal(browser.document.body.classList.contains('creator-high-contrast'), true);
    assert.equal(browser.document.body.classList.contains('creator-large-text'), false);
    assert.equal(browser.document.body.classList.contains('creator-reduce-motion'), true);
    assert.equal(browser.document.body.classList.contains('injected'), false);
});

test('malformed saved display preferences fail closed to all preferences off', () => {
    const browser = shellBrowser({
        storage: {
            'creator-access-preferences-v1': '{not-json'
        }
    });
    assert.deepEqual(plain(browser.window.CreatorShell.preferences()), {
        contrast: false,
        largeText: false,
        reduceMotion: false
    });
    assert.equal(browser.document.body.classList.contains('creator-high-contrast'), false);
    assert.equal(browser.document.body.classList.contains('creator-large-text'), false);
    assert.equal(browser.document.body.classList.contains('creator-reduce-motion'), false);
});

test('contrast preference button persists, updates aria-pressed, and announces success', async () => {
    const browser = shellBrowser();
    const toolbar = browser.document.querySelector('.creator-access-toolbar');
    const contrast = toolbar.querySelector('[data-creator-preference="contrast"]');
    assert.equal(contrast.getAttribute('aria-pressed'), 'false');
    await contrast.dispatch('click');
    assert.equal(contrast.getAttribute('aria-pressed'), 'true');
    assert.equal(browser.document.body.classList.contains('creator-high-contrast'), true);
    assert.equal(JSON.parse(browser.localStorage.dump()['creator-access-preferences-v1']).contrast, true);
    const live = browser.document.getElementById('creator-global-status');
    assert.equal(live.textContent, 'Display preference updated.');
    assert.equal(live.dataset.tone, 'success');
});

test('large text preference can be toggled on and back off without affecting contrast', async () => {
    const browser = shellBrowser({
        storage: {
            'creator-access-preferences-v1': JSON.stringify({ contrast: true })
        }
    });
    const largeText = browser.document.querySelector('[data-creator-preference="largeText"]');
    await largeText.dispatch('click');
    assert.equal(browser.document.body.classList.contains('creator-large-text'), true);
    assert.equal(browser.document.body.classList.contains('creator-high-contrast'), true);
    await largeText.dispatch('click');
    assert.equal(browser.document.body.classList.contains('creator-large-text'), false);
    assert.equal(browser.document.body.classList.contains('creator-high-contrast'), true);
});

test('reduce motion preference emits a typed preference event', async () => {
    const browser = shellBrowser();
    const received = [];
    browser.window.CreatorShell.on('preferences', value => received.push(value));
    const reduceMotion = browser.document.querySelector('[data-creator-preference="reduceMotion"]');
    await reduceMotion.dispatch('click');
    assert.equal(received.length, 1);
    assert.deepEqual(plain(received[0]), {
        contrast: false,
        largeText: false,
        reduceMotion: true
    });
});

test('preference listener unsubscribe prevents later notifications', async () => {
    const browser = shellBrowser();
    const received = [];
    const unsubscribe = browser.window.CreatorShell.on('preferences', value => received.push(value));
    unsubscribe();
    await browser.document.querySelector('[data-creator-preference="contrast"]').dispatch('click');
    assert.equal(received.length, 0);
});

test('offline bootstrap shows the durable read-only recovery banner', () => {
    const browser = shellBrowser({ online: false });
    const banner = browser.document.querySelector('.creator-network-banner');
    assert.equal(banner.hidden, false);
    assert.match(banner.textContent, /offline/i);
    assert.match(banner.textContent, /original command/i);
});

test('offline event reveals banner and publishes network state to subscribers', async () => {
    const browser = shellBrowser();
    const states = [];
    browser.window.CreatorShell.on('network', value => states.push(value));
    browser.navigator.onLine = false;
    await browser.emit('offline');
    assert.equal(browser.document.querySelector('.creator-network-banner').hidden, false);
    assert.deepEqual(plain(states), [{ online: false }]);
    assert.match(browser.document.getElementById('creator-global-status').textContent, /read-only recovery/i);
});

test('online event hides banner and announces that retry is safe', async () => {
    const browser = shellBrowser({ online: false });
    const states = [];
    browser.window.CreatorShell.on('network', value => states.push(value));
    browser.navigator.onLine = true;
    await browser.emit('online');
    assert.equal(browser.document.querySelector('.creator-network-banner').hidden, true);
    assert.deepEqual(plain(states), [{ online: true }]);
    assert.match(browser.document.getElementById('creator-global-status').textContent, /retry is safe/i);
});

test('network retry button emits retry event and preserves offline truth', async () => {
    const browser = shellBrowser({ online: false });
    const retries = [];
    browser.window.CreatorShell.on('network-retry', value => retries.push(value));
    const retry = browser.document.querySelector('.creator-network-banner button');
    await retry.dispatch('click');
    assert.equal(retries.length, 1);
    assert.deepEqual(plain(retries[0]), {});
    assert.equal(browser.document.getElementById('creator-global-status').dataset.tone, 'warning');
    assert.equal(browser.document.getElementById('creator-global-status').textContent, 'Still offline.');
});

test('announce uses the requested tone and schedules bounded clearing', () => {
    const browser = shellBrowser();
    browser.window.CreatorShell.announce('Saved safely', 'success', 3210);
    const live = browser.document.getElementById('creator-global-status');
    assert.equal(live.textContent, 'Saved safely');
    assert.equal(live.dataset.tone, 'success');
    assert.equal(browser.timers.at(-1).delay, 3210);
    browser.timers.at(-1).callback();
    assert.equal(live.textContent, '');
});

test('an older announcement timer cannot clear a newer message', () => {
    const browser = shellBrowser();
    browser.window.CreatorShell.announce('First', 'info', 1000);
    const firstTimer = browser.timers.at(-1);
    browser.window.CreatorShell.announce('Second', 'warning', 1000);
    firstTimer.callback();
    assert.equal(browser.document.getElementById('creator-global-status').textContent, 'Second');
});

test('busy disables controls and restores their original rule-disabled states', () => {
    const browser = shellBrowser();
    const form = append(browser.document, browser.main, 'form');
    const allowed = append(browser.document, form, 'button', { text: 'Allowed' });
    const blocked = append(browser.document, form, 'button', { text: 'Blocked', disabled: true });
    const field = append(browser.document, form, 'input');
    browser.window.CreatorShell.busy(form, true, 'Saving record');
    assert.equal(form.getAttribute('aria-busy'), 'true');
    assert.equal(form.dataset.loadingLabel, 'Saving record');
    assert.equal(allowed.disabled, true);
    assert.equal(blocked.disabled, true);
    assert.equal(field.disabled, true);
    browser.window.CreatorShell.busy(form, false);
    assert.equal(form.getAttribute('aria-busy'), 'false');
    assert.equal(allowed.disabled, false);
    assert.equal(blocked.disabled, true);
    assert.equal(field.disabled, false);
});

test('busy supports an empty container without throwing', () => {
    const browser = shellBrowser();
    const section = append(browser.document, browser.main, 'section');
    assert.doesNotThrow(() => browser.window.CreatorShell.busy(section, true));
    assert.equal(section.getAttribute('aria-busy'), 'true');
    assert.doesNotThrow(() => browser.window.CreatorShell.busy(section, false));
    assert.equal(section.getAttribute('aria-busy'), 'false');
});

test('normalizeText performs NFKC normalization and language-aware lower casing', () => {
    const browser = shellBrowser();
    assert.equal(browser.window.CreatorShell.normalizeText('  ＡBC  '), 'abc');
    assert.equal(browser.window.CreatorShell.normalizeText(null), '');
    assert.equal(browser.window.CreatorShell.normalizeText('Mixed CASE'), 'mixed case');
});

test('pagination clamps invalid page and page-size inputs', () => {
    const browser = shellBrowser();
    const values = Array.from({ length: 250 }, (_, index) => index + 1);
    const first = browser.window.CreatorShell.paginate(values, -10, 0);
    assert.equal(first.page, 1);
    assert.equal(first.pageSize, 12);
    assert.equal(first.items.length, 12);
    const last = browser.window.CreatorShell.paginate(values, 99, 999);
    assert.equal(last.pageSize, 100);
    assert.equal(last.pages, 3);
    assert.equal(last.page, 3);
    assert.deepEqual(last.items, values.slice(200));
});

test('pagination returns a stable empty first page for no items', () => {
    const browser = shellBrowser();
    const result = browser.window.CreatorShell.paginate([], 8, 20);
    assert.deepEqual(plain(result), {
        items: [],
        page: 1,
        pageSize: 20,
        pages: 1,
        total: 0
    });
});

test('renderPagination produces bounded neighboring pages and working callbacks', async () => {
    const browser = shellBrowser();
    const nav = append(browser.document, browser.main, 'nav');
    const selected = [];
    browser.window.CreatorShell.renderPagination(nav, {
        page: 5,
        pages: 12,
        total: 240,
        pageSize: 20,
        items: []
    }, page => selected.push(page));
    const labels = buttons(nav).map(button => button.textContent);
    assert.deepEqual(labels, ['Previous', '3', '4', '5', '6', '7', 'Next']);
    assert.equal(buttons(nav)[3].getAttribute('aria-current'), 'page');
    await buttons(nav)[0].dispatch('click');
    await buttons(nav).at(-1).dispatch('click');
    assert.deepEqual(selected, [4, 6]);
});

test('renderPagination disables previous and current state on first page', () => {
    const browser = shellBrowser();
    const nav = append(browser.document, browser.main, 'nav');
    browser.window.CreatorShell.renderPagination(nav, {
        page: 1,
        pages: 1,
        total: 0,
        pageSize: 20,
        items: []
    }, () => {});
    assert.equal(buttons(nav)[0].disabled, true);
    assert.equal(buttons(nav)[1].getAttribute('aria-current'), 'page');
    assert.equal(buttons(nav).at(-1).disabled, true);
});

test('filterItems applies exact status and category before normalized search', () => {
    const browser = shellBrowser();
    const items = [
        { title: 'Moon Route', description: 'Quiet repair', status: 'active', category: 'story' },
        { title: 'Star Song', description: 'Rhythm practice', status: 'offered', category: 'coop' },
        { title: 'Archive', description: 'Moon record', status: 'completed', category: 'story' }
    ];
    const result = browser.window.CreatorShell.filterItems(items, {
        query: 'ＭＯＯＮ',
        status: 'active',
        category: 'story'
    });
    assert.deepEqual(result, [items[0]]);
});

test('filterItems supports explicit field mappings without reading hidden properties', () => {
    const browser = shellBrowser();
    const items = [
        { name: 'Visible clue', body: 'safe', lifecycle: 'open', group: 'quest', secret: 'culprit' },
        { name: 'Another item', body: 'visible', lifecycle: 'open', group: 'story', secret: 'visible clue' }
    ];
    const fields = {
        status: 'lifecycle',
        category: 'group',
        search: ['name', 'body']
    };
    assert.deepEqual(browser.window.CreatorShell.filterItems(items, {
        query: 'visible clue',
        status: 'open',
        category: 'quest'
    }, fields), [items[0]]);
    assert.deepEqual(browser.window.CreatorShell.filterItems(items, {
        query: 'culprit',
        status: 'open',
        category: 'quest'
    }, fields), []);
});

test('state panel escapes content by assigning textContent and can expose retry', async () => {
    const browser = shellBrowser();
    let retried = 0;
    const panel = browser.window.CreatorShell.createStatePanel(
        'error',
        '<img src=x onerror=alert(1)>',
        '<script>throw 1</script>',
        () => { retried += 1; }
    );
    assert.equal(panel.className, 'creator-error-state');
    assert.equal(panel.querySelector('h2').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(panel.querySelector('p').textContent, '<script>throw 1</script>');
    assert.equal(panel.querySelectorAll('script').length, 0);
    await panel.querySelector('button').dispatch('click');
    assert.equal(retried, 1);
});

test('safeRequest announces success and restores controls after resolution', async () => {
    const browser = shellBrowser();
    const form = append(browser.document, browser.main, 'form');
    const submit = append(browser.document, form, 'button');
    const result = await browser.window.CreatorShell.safeRequest(
        async () => ({ saved: true }),
        { container: form, loading: 'Persisting', success: 'Saved' }
    );
    assert.deepEqual(result, { saved: true });
    assert.equal(form.getAttribute('aria-busy'), 'false');
    assert.equal(submit.disabled, false);
    assert.equal(browser.document.getElementById('creator-global-status').textContent, 'Saved');
    assert.equal(browser.document.getElementById('creator-global-status').dataset.tone, 'success');
});

test('safeRequest maps revision conflict to recoverable warning and rethrows', async () => {
    const browser = shellBrowser();
    const container = append(browser.document, browser.main, 'section');
    const error = Object.assign(new Error('stale revision'), { status: 409 });
    await assert.rejects(browser.window.CreatorShell.safeRequest(
        async () => { throw error; },
        { container }
    ), error);
    const live = browser.document.getElementById('creator-global-status');
    assert.equal(live.dataset.tone, 'warning');
    assert.match(live.textContent, /State changed elsewhere/);
    assert.equal(container.getAttribute('aria-busy'), 'false');
});

test('safeRequest publishes retryable failure metadata without invoking retry automatically', async () => {
    const browser = shellBrowser();
    const received = [];
    let retried = 0;
    const retry = () => { retried += 1; };
    browser.window.CreatorShell.on('request-retryable', value => received.push(value));
    const error = new Error('network lost');
    await assert.rejects(browser.window.CreatorShell.safeRequest(
        async () => { throw error; },
        { retry, failure: 'Connection unavailable' }
    ));
    assert.equal(retried, 0);
    assert.equal(received.length, 1);
    assert.equal(received[0].retry, retry);
    assert.equal(received[0].error, error);
    assert.equal(browser.document.getElementById('creator-global-status').textContent, 'Connection unavailable');
});

test('shared shell source contains no innerHTML assignment or arbitrary HTML insertion', () => {
    const script = source('public/js/creator-shell.js');
    assert.doesNotMatch(script, /\.innerHTML\s*=/);
    assert.doesNotMatch(script, /insertAdjacentHTML/);
    assert.doesNotMatch(script, /document\.write/);
    assert.match(script, /textContent/);
});

test('creator shell CSS provides visible focus and forced-colors fallbacks', () => {
    const css = source('public/creator-shell.css');
    assert.match(css, /:focus-visible/);
    assert.match(css, /outline:/);
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(max-width: 38rem\)/);
    assert.doesNotMatch(css, /outline:\s*none/);
});

test('creator shell CSS keeps touch targets and responsive explorer controls usable', () => {
    const css = source('public/creator-shell.css');
    assert.match(css, /min-block-size:\s*2\.75rem/);
    assert.match(css, /grid-template-columns:\s*1fr/);
    assert.match(css, /creator-explorer-pagination/);
    assert.match(css, /creator-filter-chip/);
    assert.match(css, /creator-form-navigator/);
});

test('all enhanced creator views load the shared accessibility shell exactly once', () => {
    const views = [
        'views/creator-home.ejs',
        'views/creator-profile.ejs',
        'views/quest-journal.ejs',
        'views/story-world.ejs',
        'views/live-room.ejs',
        'views/creator-rewards.ejs',
        'views/creator-achievements.ejs',
        'views/admin-quest-studio.ejs',
        'views/admin-creator-director.ejs',
        'views/streamer-game.ejs'
    ];
    for (const view of views) {
        const html = source(view);
        assert.equal((html.match(/\/creator-shell\.css/g) || []).length, 1, view);
        assert.equal((html.match(/\/js\/creator-shell\.js/g) || []).length, 1, view);
    }
});

test('enhanced creator views preserve CSRF and idempotency helpers for write pages', () => {
    for (const view of [
        'views/creator-home.ejs',
        'views/creator-profile.ejs',
        'views/quest-journal.ejs',
        'views/story-world.ejs',
        'views/live-room.ejs',
        'views/creator-rewards.ejs',
        'views/admin-quest-studio.ejs',
        'views/admin-creator-director.ejs'
    ]) {
        const html = source(view);
        assert.match(html, /csrfToken|data-csrf-token/, view);
        assert.doesNotMatch(html, /onclick\s*=/i, view);
    }
});

test('safe request can wrap an actual response factory without trusting response HTML', async () => {
    const calls = [];
    const browser = shellBrowser();
    browser.context.fetch = async (url, options) => {
        calls.push({ url, options });
        return response({ success: true, revision: 8 });
    };
    const result = await browser.window.CreatorShell.safeRequest(async () => {
        const reply = await browser.context.fetch('/api/safe-state', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });
        return reply.json();
    });
    assert.deepEqual(result, { success: true, revision: 8 });
    assert.deepEqual(calls, [{
        url: '/api/safe-state',
        options: {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        }
    }]);
});

test('browser event primitive supports default prevention used by offline guards', async () => {
    const browser = shellBrowser();
    const button = append(browser.document, browser.main, 'button');
    button.addEventListener('click', event => event.preventDefault());
    const event = new FakeEvent('click', { target: button });
    const accepted = await button.dispatchEvent(event);
    assert.equal(accepted, false);
    assert.equal(event.defaultPrevented, true);
});
