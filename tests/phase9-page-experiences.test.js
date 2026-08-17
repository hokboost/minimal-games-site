'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    FakeEvent,
    append,
    createBrowser,
    source
} = require('./helpers/phase9-dom');

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function shellAndExplorer({ online = true, lang = 'en' } = {}) {
    const browser = createBrowser({
        lang,
        online,
        setTimeout: () => 1,
        clearTimeout() {}
    });
    browser.document.body.dataset.lang = lang;
    const layout = append(browser.document, browser.document.body, 'div', { className: 'site-layout' });
    append(browser.document, layout, 'main', { id: 'creator-main' });
    browser.run('public/js/creator-shell.js');
    browser.run('public/js/creator-explorer.js');
    return browser;
}

function explorerFixture(count = 25) {
    const browser = shellAndExplorer();
    const main = browser.document.getElementById('creator-main');
    const root = append(browser.document, main, 'section', { id: 'records-panel' });
    append(browser.document, root, 'h2', { text: 'Records' });
    const grid = append(browser.document, root, 'div', { className: 'record-grid' });
    const records = [];
    for (let index = 0; index < count; index += 1) {
        const status = index % 3 === 0 ? 'active' : index % 3 === 1 ? 'returned' : 'completed';
        const category = index % 2 === 0 ? 'story' : 'coop';
        const card = append(browser.document, grid, 'article', {
            className: 'record-card',
            dataset: {
                status,
                category,
                points: String(100 - index)
            }
        });
        append(browser.document, card, 'h3', { text: `Record ${String(index + 1).padStart(2, '0')}` });
        append(browser.document, card, 'p', { text: `${category} ${status} body ${index + 1}` });
        records.push(card);
    }
    const controller = browser.window.CreatorExplorer.mount({
        id: 'records',
        root: '#records-panel',
        collection: '.record-grid',
        item: '.record-card',
        pageSize: 8,
        filters: [
            {
                key: 'status',
                label: 'Status',
                field: 'data.status',
                options: [
                    { value: 'active', label: 'Active' },
                    { value: 'returned', label: 'Returned' },
                    { value: 'completed', label: 'Completed' }
                ]
            },
            {
                key: 'category',
                label: 'Category',
                field: 'data.category',
                options: [
                    { value: 'story', label: 'Story' },
                    { value: 'coop', label: 'Co-op' }
                ]
            }
        ],
        sorts: [
            { key: 'title', label: 'Title', field: 'h3' },
            { key: 'points-high', label: 'Points high', field: 'data.points', numeric: true, direction: 'desc' },
            { key: 'points-low', label: 'Points low', field: 'data.points', numeric: true }
        ]
    });
    return { browser, root, grid, records, controller };
}

test('Creator Explorer mounts accessible search, filters, summary, and pagination', () => {
    const { root, controller } = explorerFixture();
    assert.ok(controller);
    const controls = root.querySelector('.creator-explorer-controls');
    assert.ok(controls);
    assert.equal(controls.getAttribute('aria-label'), 'Filter and pagination');
    assert.ok(root.querySelector('#records-search'));
    assert.ok(root.querySelector('#records-status'));
    assert.ok(root.querySelector('#records-category'));
    assert.ok(root.querySelector('#records-sort'));
    const summary = root.querySelector('#records-summary');
    assert.equal(summary.getAttribute('role'), 'status');
    assert.equal(summary.getAttribute('aria-live'), 'polite');
    assert.equal(summary.textContent, 'Showing 1–8 of 25');
    assert.equal(root.querySelector('.creator-explorer-pagination').getAttribute('aria-label'), 'Result pages');
});

test('Creator Explorer initial page exposes only the bounded page size', () => {
    const { records, controller } = explorerFixture();
    assert.equal(records.filter(record => !record.hidden).length, 8);
    assert.equal(records.filter(record => record.hidden).length, 17);
    assert.deepEqual(plain(controller.state()), {
        page: 1,
        query: '',
        sortKey: 'title',
        filteredCount: 25,
        renderCount: 1
    });
});

test('Creator Explorer next page advances without rendering records twice', async () => {
    const { root, records, controller } = explorerFixture();
    const next = root.querySelector('.creator-explorer-pagination').children.at(-1);
    assert.equal(next.textContent, 'Next');
    assert.equal(next.disabled, false);
    await next.dispatch('click');
    const state = plain(controller.state());
    assert.equal(state.page, 2);
    assert.equal(state.filteredCount, 25);
    assert.equal(records.filter(record => !record.hidden).length, 8);
    assert.equal(new Set(records.filter(record => !record.hidden)).size, 8);
    assert.equal(root.querySelector('#records-summary').textContent, 'Showing 9–16 of 25');
});

test('Creator Explorer previous button remains disabled on first page', () => {
    const { root } = explorerFixture();
    const previous = root.querySelector('.creator-explorer-pagination').children[0];
    assert.equal(previous.textContent, 'Previous');
    assert.equal(previous.disabled, true);
});

test('Creator Explorer page buttons mark only the selected page current', () => {
    const { root } = explorerFixture();
    const current = root.querySelectorAll('[aria-current="page"]');
    assert.equal(current.length, 1);
    assert.equal(current[0].textContent, '1');
    assert.equal(current[0].disabled, true);
});

test('Creator Explorer normalized text search narrows title and body', async () => {
    const { root, records, controller } = explorerFixture();
    const search = root.querySelector('#records-search');
    search.value = 'ＲＥＣＯＲＤ ０７';
    await search.dispatch('input');
    assert.equal(controller.state().filteredCount, 1);
    assert.equal(records[6].hidden, false);
    assert.ok(records.filter(record => record.hidden).every(record => record !== records[6]));
    assert.equal(root.querySelector('#records-summary').textContent, 'Showing 1–1 of 1');
});

test('Creator Explorer status filter performs exact normalized matching', async () => {
    const { root, records, controller } = explorerFixture();
    const status = root.querySelector('#records-status');
    status.value = 'returned';
    await status.dispatch('change');
    assert.equal(controller.state().filteredCount, records.filter(record => record.dataset.status === 'returned').length);
    assert.ok(records.filter(record => !record.hidden).every(record => record.dataset.status === 'returned'));
});

test('Creator Explorer combines category and status filters', async () => {
    const { root, records, controller } = explorerFixture();
    const status = root.querySelector('#records-status');
    const category = root.querySelector('#records-category');
    status.value = 'active';
    category.value = 'story';
    await status.dispatch('change');
    await category.dispatch('change');
    const expected = records.filter(record => record.dataset.status === 'active' && record.dataset.category === 'story');
    assert.equal(controller.state().filteredCount, expected.length);
    assert.ok(records.filter(record => !record.hidden).every(record => (
        record.dataset.status === 'active' && record.dataset.category === 'story'
    )));
});

test('Creator Explorer search combines with both select filters', async () => {
    const { root, records, controller } = explorerFixture();
    root.querySelector('#records-status').value = 'completed';
    root.querySelector('#records-category').value = 'story';
    root.querySelector('#records-search').value = 'body 5';
    await root.querySelector('#records-status').dispatch('change');
    await root.querySelector('#records-category').dispatch('change');
    await root.querySelector('#records-search').dispatch('input');
    const expected = records.filter(record => (
        record.dataset.status === 'completed'
        && record.dataset.category === 'story'
        && record.textContent.toLowerCase().includes('body 5')
    ));
    assert.equal(controller.state().filteredCount, expected.length);
});

test('Creator Explorer no-result state hides collection and keeps safe empty copy', async () => {
    const { root, grid, controller } = explorerFixture();
    const search = root.querySelector('#records-search');
    search.value = '<script>not-present</script>';
    await search.dispatch('input');
    assert.equal(controller.state().filteredCount, 0);
    assert.equal(grid.hidden, true);
    const empty = root.querySelector('[data-explorer-empty="records"]');
    assert.ok(empty);
    assert.equal(empty.hidden, false);
    assert.equal(empty.querySelectorAll('script').length, 0);
    assert.match(empty.textContent, /No matching items/);
});

test('Creator Explorer clear resets query, filters, page, and focus', async () => {
    const { browser, root, controller } = explorerFixture();
    const search = root.querySelector('#records-search');
    const status = root.querySelector('#records-status');
    search.value = 'record 20';
    status.value = 'returned';
    await search.dispatch('input');
    await status.dispatch('change');
    const clear = root.querySelector('.creator-explorer-clear');
    await clear.dispatch('click');
    assert.equal(search.value, '');
    assert.equal(status.value, '');
    assert.equal(browser.document.activeElement, search);
    assert.equal(controller.state().page, 1);
    assert.equal(controller.state().filteredCount, 25);
    assert.equal(browser.document.getElementById('creator-global-status').textContent, 'Filters cleared.');
});

test('Creator Explorer Escape clears an active search without changing filters', async () => {
    const { root, controller } = explorerFixture();
    const search = root.querySelector('#records-search');
    const category = root.querySelector('#records-category');
    category.value = 'story';
    search.value = 'record 01';
    await category.dispatch('change');
    await search.dispatch('input');
    search.focus();
    await root.querySelector('.creator-explorer-controls').dispatchEvent(new FakeEvent('keydown', {
        key: 'Escape',
        target: search
    }));
    assert.equal(search.value, '');
    assert.equal(category.value, 'story');
    assert.ok(controller.state().filteredCount > 1);
});

test('Creator Explorer numeric descending sort controls first visible record', async () => {
    const { root, grid } = explorerFixture();
    const sort = root.querySelector('#records-sort');
    sort.value = 'points-high';
    await sort.dispatch('change');
    const visible = grid.children.filter(record => !record.hidden);
    const points = visible.map(record => Number(record.dataset.points));
    assert.deepEqual(points, points.slice().sort((left, right) => right - left));
});

test('Creator Explorer numeric ascending sort controls first visible record', async () => {
    const { root, grid } = explorerFixture();
    const sort = root.querySelector('#records-sort');
    sort.value = 'points-low';
    await sort.dispatch('change');
    const visible = grid.children.filter(record => !record.hidden);
    const points = visible.map(record => Number(record.dataset.points));
    assert.deepEqual(points, points.slice().sort((left, right) => left - right));
});

test('Creator Explorer destroys controls and restores every record', () => {
    const { root, grid, records, controller } = explorerFixture();
    controller.destroy();
    assert.equal(root.querySelector('.creator-explorer-controls'), null);
    assert.equal(root.querySelector('.creator-explorer-pagination'), null);
    assert.equal(root.querySelector('[data-explorer-empty="records"]'), null);
    assert.equal(grid.hidden, false);
    assert.ok(records.every(record => !record.hidden));
    assert.ok(records.every(record => record.getAttribute('aria-hidden') === null));
});

test('Creator Explorer rejects a missing root without mutating document', () => {
    const browser = shellAndExplorer();
    const before = browser.document.body.childNodes.length;
    const controller = browser.window.CreatorExplorer.mount({
        root: '#missing',
        collection: '.grid',
        item: '.card'
    });
    assert.equal(controller, null);
    assert.equal(browser.document.body.childNodes.length, before);
});

test('Creator Explorer rejects a missing collection without adding controls', () => {
    const browser = shellAndExplorer();
    const main = browser.document.getElementById('creator-main');
    append(browser.document, main, 'section', { id: 'empty-root' });
    const controller = browser.window.CreatorExplorer.mount({
        root: '#empty-root',
        collection: '.missing-grid',
        item: '.card'
    });
    assert.equal(controller, null);
    assert.equal(browser.document.querySelector('.creator-explorer-controls'), null);
});

test('Creator Explorer clamps page size to a minimum of four', () => {
    const browser = shellAndExplorer();
    const main = browser.document.getElementById('creator-main');
    const root = append(browser.document, main, 'section', { id: 'small-page-root' });
    const grid = append(browser.document, root, 'div', { className: 'grid' });
    const cards = Array.from({ length: 8 }, (_, index) => append(browser.document, grid, 'article', {
        className: 'card',
        text: String(index)
    }));
    browser.window.CreatorExplorer.mount({
        root: '#small-page-root',
        collection: '.grid',
        item: '.card',
        pageSize: 1
    });
    assert.equal(cards.filter(card => !card.hidden).length, 4);
});

test('Creator Explorer clamps page size to a maximum of fifty', () => {
    const browser = shellAndExplorer();
    const main = browser.document.getElementById('creator-main');
    const root = append(browser.document, main, 'section', { id: 'large-page-root' });
    const grid = append(browser.document, root, 'div', { className: 'grid' });
    const cards = Array.from({ length: 75 }, (_, index) => append(browser.document, grid, 'article', {
        className: 'card',
        text: String(index)
    }));
    browser.window.CreatorExplorer.mount({
        root: '#large-page-root',
        collection: '.grid',
        item: '.card',
        pageSize: 1000
    });
    assert.equal(cards.filter(card => !card.hidden).length, 50);
});

test('Creator Explorer normalizer handles null, full-width, whitespace, and case', () => {
    const browser = shellAndExplorer();
    assert.equal(browser.window.CreatorExplorer.normalize(null), '');
    assert.equal(browser.window.CreatorExplorer.normalize('  ＡＢＣ  '), 'abc');
    assert.equal(browser.window.CreatorExplorer.normalize('Line\n\tBreak'), 'line break');
    assert.equal(browser.window.CreatorExplorer.normalize('MiXeD'), 'mixed');
});

function loadHelp(pathname, lang = 'en') {
    const browser = createBrowser({
        pathname,
        href: `https://example.test${pathname}`,
        lang,
        setTimeout: () => 1,
        clearTimeout() {}
    });
    browser.document.documentElement.lang = lang;
    browser.document.body.dataset.lang = lang;
    browser.window.CreatorShell = {
        trapDialog() {}
    };
    browser.context.window.CreatorShell = browser.window.CreatorShell;
    browser.run('public/js/creator-context-help.js');
    return browser;
}

test('context help selects Creator World home guidance', () => {
    const browser = loadHelp('/creator');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Creator World home help');
    assert.match(context.purpose.en, /shared memories/);
    assert.equal(context.actions.length, 3);
    assert.match(context.actions[1].en, /without deleting provenance/);
});

test('context help selects profile consent and boundary guidance', () => {
    const browser = loadHelp('/creator/profile');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Interaction preferences help');
    assert.match(context.actions[0].en, /hard boundary/);
    assert.match(context.actions[1].en, /Quiet hours override/);
    assert.match(context.actions[2].en, /never binds directly/);
});

test('context help selects Quest Journal evidence and neutral-decline guidance', () => {
    const browser = loadHelp('/quests');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Quest Journal help');
    assert.match(context.actions[0].en, /without relationship/);
    assert.match(context.actions[1].en, /never awards points directly/);
    assert.match(context.actions[2].en, /768KB/);
});

test('context help selects Story preview and monotonic recovery guidance', () => {
    const browser = loadHelp('/story');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Branching Story help');
    assert.match(context.purpose.en, /five seasons/);
    assert.match(context.actions[0].en, /preview writes no state/);
    assert.match(context.actions[1].en, /never revokes earned memories/);
    assert.match(context.actions[2].en, /Replay does not repeat/);
});

test('context help selects Live Relay replay and no-penalty guidance', () => {
    const browser = loadHelp('/live-room');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Live Relay help');
    assert.match(context.purpose.en, /durable sequence/);
    assert.match(context.actions[0].en, /without relationship penalty/);
    assert.match(context.actions[2].en, /creator reconsent/);
});

test('context help selects Rewards delivery boundary and uncertain guidance', () => {
    const browser = loadHelp('/creator-rewards');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Rewards and collection help');
    assert.match(context.purpose.en, /separate actions/);
    assert.match(context.actions[1].en, /without crossing the send boundary/);
    assert.match(context.actions[2].en, /never automatically resent or refunded/);
});

test('context help selects Achievement hidden-state and permanence guidance', () => {
    const browser = loadHelp('/creator-achievements');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Achievements and season archive help');
    assert.match(context.actions[0].en, /reveal no name/);
    assert.match(context.actions[1].en, /semantic collision fails closed/);
    assert.match(context.actions[2].en, /not revoked/);
});

for (const gameId of [
    'constellation-repair',
    'signal-duet',
    'mystery-board',
    'story-weaver',
    'studio-crafting',
    'meteor-defense',
    'dream-maze',
    'broadcast-bingo',
    'echo-memory',
    'keeper-prediction'
]) {
    test(`context help recognizes the ${gameId} route as an authoritative streamer game`, () => {
        const browser = loadHelp(`/${gameId}`);
        const context = browser.window.CreatorContextHelp.currentContext();
        assert.equal(context.title.en, 'Streamer game help');
        assert.match(context.purpose.en, /database snapshot is authoritative/);
        assert.match(context.actions[0].en, /game-specific steps/);
        assert.match(context.actions[1].en, /at least 44px/);
        assert.match(context.actions[2].en, /never call balance or gift delivery/);
    });
}

test('context help selects Quest Studio immutable publication guidance', () => {
    const browser = loadHelp('/admin/quest-studio');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Quest Studio help');
    assert.match(context.actions[0].en, /closed AST/);
    assert.match(context.actions[1].en, /raw PNG bytes never render/);
    assert.match(context.actions[2].en, /share one transaction/);
});

test('context help selects Director owner privacy and structured-send guidance', () => {
    const browser = loadHelp('/admin/creator-director');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Creator Director help');
    assert.match(context.actions[0].en, /Non-owner admins/);
    assert.match(context.actions[1].en, /server allowlisted/);
    assert.match(context.actions[2].en, /persists first/);
});

test('context help uses safe generic fallback for an unknown Creator route', () => {
    const browser = loadHelp('/creator/unknown');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.en, 'Creator World help');
    assert.match(context.purpose.en, /current account projection/);
    assert.deepEqual(plain(context.actions), []);
});

test('context help installs a fixed launcher and dialog with shortcut metadata', () => {
    const browser = loadHelp('/story');
    const button = browser.document.querySelector('.creator-help-launcher');
    const dialog = browser.document.getElementById('creator-context-help');
    assert.ok(button);
    assert.equal(button.textContent, 'Help');
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(button.getAttribute('aria-keyshortcuts'), 'Shift+?');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute('aria-labelledby'), 'creator-context-help-title');
    assert.equal(dialog.querySelector('h2').textContent, 'Branching Story help');
});

test('context help renders all copy through text nodes rather than executable HTML', () => {
    const browser = loadHelp('/creator-rewards');
    const dialog = browser.document.getElementById('creator-context-help');
    assert.equal(dialog.querySelectorAll('script').length, 0);
    assert.equal(dialog.querySelectorAll('[onclick]').length, 0);
    assert.match(dialog.textContent, /An uncertain state is never automatically resent or refunded/);
    assert.doesNotMatch(source('public/js/creator-context-help.js'), /innerHTML\s*=/);
    assert.doesNotMatch(source('public/js/creator-context-help.js'), /insertAdjacentHTML/);
});

test('context help uses Chinese copy from the same bounded route definition', () => {
    const browser = loadHelp('/live-room', 'zh-CN');
    const context = browser.window.CreatorContextHelp.currentContext();
    assert.equal(context.title.zh, '实时联络帮助');
    assert.match(context.actions[0].zh, /不会扣关系进度/);
    assert.equal(browser.document.querySelector('.creator-help-launcher').textContent, '帮助');
    assert.equal(browser.document.querySelector('.creator-help-close').textContent, '关闭');
});

test('context help launcher opens a safe dialog without network or mutation calls', async () => {
    const browser = loadHelp('/creator');
    const dialog = browser.document.getElementById('creator-context-help');
    const button = browser.document.querySelector('.creator-help-launcher');
    assert.equal(dialog.getAttribute('open'), null);
    await button.dispatch('click');
    assert.equal(dialog.getAttribute('open'), '');
    assert.equal(browser.document.activeElement, dialog.querySelector('.creator-help-close'));
});

test('context help close returns focus to its launcher', async () => {
    const browser = loadHelp('/creator');
    const button = browser.document.querySelector('.creator-help-launcher');
    await button.dispatch('click');
    const close = browser.document.querySelector('.creator-help-close');
    await close.dispatch('click');
    assert.equal(browser.document.getElementById('creator-context-help').getAttribute('open'), null);
    assert.equal(browser.document.activeElement, button);
});

test('context help Shift+? shortcut opens and prevents browser default', async () => {
    const browser = loadHelp('/creator-achievements');
    const event = new FakeEvent('keydown', {
        key: '?',
        target: browser.document.body
    });
    event.shiftKey = true;
    await browser.document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(browser.document.getElementById('creator-context-help').getAttribute('open'), '');
});

test('plain question mark without Shift does not open context help', async () => {
    const browser = loadHelp('/creator-achievements');
    const event = new FakeEvent('keydown', {
        key: '?',
        target: browser.document.body
    });
    event.shiftKey = false;
    await browser.document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(browser.document.getElementById('creator-context-help').getAttribute('open'), null);
});

test('every enhanced view loads contextual help after the shared shell', () => {
    for (const file of [
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
    ]) {
        const html = source(file);
        const shellIndex = html.indexOf('/js/creator-shell.js');
        const helpIndex = html.indexOf('/js/creator-context-help.js');
        assert.ok(shellIndex >= 0, file);
        assert.ok(helpIndex > shellIndex, file);
        assert.equal((html.match(/creator-context-help\.js/g) || []).length, 1, file);
    }
});

test('context help contains no direct balance, gift provider, or delivery mutation', () => {
    const script = source('public/js/creator-context-help.js');
    assert.doesNotMatch(script, /fetch\s*\(/);
    assert.doesNotMatch(script, /idempotentFetch/);
    assert.doesNotMatch(script, /BalanceLogger/);
    assert.doesNotMatch(script, /giftProvider/);
    assert.doesNotMatch(script, /delivery_outbox/);
});

test('page enhancement sources avoid arbitrary HTML and client-authored URLs', () => {
    for (const file of [
        'public/js/creator-explorer.js',
        'public/js/quest-journal-experience.js',
        'public/js/reward-collection-experience.js',
        'public/js/achievement-browser.js',
        'public/js/story-archive-experience.js',
        'public/js/live-inbox-experience.js',
        'public/js/creator-home-experience.js',
        'public/js/creator-profile-assistant.js',
        'public/js/admin-workspace-experience.js',
        'public/js/creator-archive-experience.js',
        'public/js/creator-table-access.js'
    ]) {
        const script = source(file);
        assert.doesNotMatch(script, /innerHTML\s*=/, file);
        assert.doesNotMatch(script, /insertAdjacentHTML/, file);
        assert.doesNotMatch(script, /javascript:/i, file);
        assert.doesNotMatch(script, /eval\s*\(/, file);
        assert.doesNotMatch(script, /new Function/, file);
    }
});

test('offline guards intercept mutations before existing page handlers', () => {
    for (const file of [
        'public/js/quest-journal-experience.js',
        'public/js/reward-collection-experience.js',
        'public/js/story-archive-experience.js',
        'public/js/live-inbox-experience.js',
        'public/js/creator-home-experience.js',
        'public/js/creator-profile-assistant.js',
        'public/js/admin-workspace-experience.js'
    ]) {
        const script = source(file);
        assert.match(script, /navigator\.onLine\s*!==?\s*false|navigator\.onLine === false/, file);
        assert.match(script, /preventDefault\(\)/, file);
        assert.match(script, /stopImmediatePropagation\(\)/, file);
        assert.match(script, /true\s*\)/, file);
    }
});

test('profile assistant minute parser accepts bounded times and rejects malformed input', () => {
    const script = source('public/js/creator-profile-assistant.js');
    assert.match(script, /\^\(\\d\{2\}\):\(\\d\{2\}\)\$/);
    assert.match(script, /hour > 23/);
    assert.match(script, /minutes > 59/);
    assert.match(script, /duration >= 30 && duration <= 720/);
});

test('profile assistant enforces at most three interaction roles in the actual UI', () => {
    const script = source('public/js/creator-profile-assistant.js');
    assert.match(script, /checked\.length > 3/);
    assert.match(script, /changed\.checked = false/);
    assert.match(script, /accepted >= 3 && !input\.checked/);
    assert.match(script, /Choose at most three interaction roles/);
});

test('admin workspace exposes a deterministic 409 recovery instead of blind replay', () => {
    const script = source('public/js/admin-workspace-experience.js');
    assert.match(script, /409\|revision/);
    assert.match(script, /Reload authoritative state/);
    assert.match(script, /location\.reload\(\)/);
    assert.doesNotMatch(script, /setInterval\([^)]*location\.reload/);
});

test('admin workspace explains draft, trusted event, evidence, and transaction boundaries', () => {
    const script = source('public/js/admin-workspace-experience.js');
    assert.match(script, /Save creates a draft only/);
    assert.match(script, /closed registry/);
    assert.match(script, /Publication freezes content hash/);
    assert.match(script, /ledger, settlement, and audit share a transaction/);
});

test('Director composer keeps structured fields and never adds arbitrary URL input', () => {
    const runtime = source('public/js/admin-live-director.js');
    const experience = source('public/js/admin-workspace-experience.js');
    assert.match(runtime, /director-reference/);
    assert.match(runtime, /director-story-node/);
    assert.match(runtime, /director-options/);
    assert.doesNotMatch(runtime, /type\s*=\s*['"]url['"]/);
    assert.doesNotMatch(experience, /type\s*=\s*['"]url['"]/);
});

test('quest experience connects three bounded explorers and a safe evidence counter', () => {
    const script = source('public/js/quest-journal-experience.js');
    assert.match(script, /active-quests/);
    assert.match(script, /weekly-board/);
    assert.match(script, /quest-chains/);
    assert.match(script, /768 \* 1024/);
    assert.match(script, /file\.type !== 'image\/png'/);
});

test('reward experience explains stored inventory and uncertain delivery boundaries', () => {
    const script = source('public/js/reward-collection-experience.js');
    assert.match(script, /stores an entitlement in the existing backpack/);
    assert.match(script, /separate explicit action/);
    assert.match(script, /never automatically resent, refunded, or charged again/);
    assert.match(script, /no provider identifier/);
});

test('story experience timeline records only visible heading and prose', () => {
    const script = source('public/js/story-archive-experience.js');
    assert.match(script, /stage\.querySelector\('h2'\)/);
    assert.match(script, /stage\.querySelector\('p'\)/);
    assert.doesNotMatch(script, /effects_digest|hiddenEffects|conditionKey|answerKey/);
    assert.match(script, /history\.length > 50/);
});

test('live inbox experience keeps event pages and item filters bounded', () => {
    const script = source('public/js/live-inbox-experience.js');
    assert.match(script, /eventPageSize:\s*20/);
    assert.match(script, /index < start \|\| index >= start \+ state\.eventPageSize/);
    assert.match(script, /\['all',/);
    assert.match(script, /actionable/);
    assert.match(script, /reported/);
});

test('achievement browser does not search hidden server conditions', () => {
    const script = source('public/js/achievement-browser.js');
    assert.match(script, /item: '\.achievement-card'/);
    assert.match(script, /data\.status/);
    assert.match(script, /data\.hidden/);
    assert.match(script, /data\.progress/);
    assert.doesNotMatch(script, /conditionKey|ruleAst|sourceEvent/);
});

test('archive experience searches only rendered collection and conclusion text', () => {
    const script = source('public/js/creator-archive-experience.js');
    assert.match(script, /shell\.normalizeText\(item\.textContent\)/);
    assert.doesNotMatch(script, /fetch\s*\(/);
    assert.doesNotMatch(script, /snapshot_hash|content_snapshot|state_snapshot/);
    assert.match(script, /pageSize:\s*10/);
});

test('table accessibility labels cells from escaped rendered headers', () => {
    const script = source('public/js/creator-table-access.js');
    assert.match(script, /safeLabel\(cell\.textContent\)/);
    assert.match(script, /slice\(0, 120\)/);
    assert.match(script, /cell\.dataset\.columnLabel/);
    assert.match(script, /cell\.setAttribute\('aria-label'/);
    assert.doesNotMatch(script, /innerHTML/);
});
