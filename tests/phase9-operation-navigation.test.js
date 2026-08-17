'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    FakeCustomEvent,
    FakeEvent,
    append,
    createBrowser,
    projectRoot,
    source
} = require('./helpers/phase9-dom');

function operationBrowser(options = {}) {
    const scheduled = [];
    const browser = createBrowser({
        online: options.online !== false,
        lang: options.lang || 'en',
        href: options.href || 'https://example.test/creator/quests?board=current',
        pathname: options.pathname || '/creator/quests',
        setTimeout(callback, delay) {
            scheduled.push({ callback, delay });
            return scheduled.length;
        },
        clearTimeout() {}
    });
    browser.window.CreatorShell = {
        announcements: [],
        announce(message, priority) {
            this.announcements.push({ message, priority });
        }
    };
    browser.run('public/js/creator-operation-center.js');
    return { browser, scheduled };
}

function navigationBrowser(options = {}) {
    const browser = createBrowser({
        lang: options.lang || 'en',
        href: `https://example.test/creator${options.hash || ''}`,
        pathname: '/creator',
        hash: options.hash || '',
        innerWidth: options.innerWidth || 1280,
        setTimeout(callback) {
            callback();
            return 1;
        },
        clearTimeout() {}
    });
    const main = append(browser.document, browser.document.body, 'main', { id: 'creator-main' });
    const headings = [];
    const sections = options.sections || [
        ['h2', 'Current quests'],
        ['h3', 'Evidence review'],
        ['h2', 'Weekly board'],
        ['h2', 'Quest chains'],
        ['h3', 'Legacy history']
    ];
    for (const [tag, label] of sections) {
        const section = append(browser.document, main, 'section');
        const heading = append(browser.document, section, tag, { text: label });
        append(browser.document, section, 'p', { text: `${label} body` });
        headings.push(heading);
    }
    browser.run('public/js/creator-responsive-navigation.js');
    return { browser, main, headings };
}

function snapshot(browser) {
    return JSON.parse(JSON.stringify(browser.window.CreatorOperations.snapshot()));
}

test('operation center mounts once with an accessible trigger and dialog', () => {
    const { browser } = operationBrowser();
    const root = browser.document.querySelector('[data-operation-center]');
    const trigger = root.querySelector('.creator-operation-trigger');
    const dialog = root.querySelector('.creator-operation-dialog');
    assert.ok(root);
    assert.equal(root.getAttribute('aria-label'), 'Operations and recovery');
    assert.equal(trigger.type, 'button');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(trigger.getAttribute('aria-controls'), 'creator-operation-dialog');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.getAttribute('aria-labelledby'), 'creator-operation-title');
    assert.equal(dialog.hidden, true);
    assert.equal(browser.document.querySelectorAll('[data-operation-center]').length, 1);
});

test('operation center fixed copy is assembled as text nodes without innerHTML', () => {
    const code = source('public/js/creator-operation-center.js');
    assert.doesNotMatch(code, /\.innerHTML\s*=/);
    const { browser } = operationBrowser();
    assert.equal(browser.document.getElementById('creator-operation-title').textContent, 'Operations and recovery');
    assert.equal(browser.document.querySelector('.creator-operation-kicker').textContent, 'RECOVERY');
    assert.equal(browser.document.querySelector('.creator-operation-trigger').children[0].textContent, '↺');
    assert.equal(browser.document.querySelector('.creator-operation-trigger').children[1].textContent, 'Operation history');
});

test('operation center begin records a canonical same-origin route', () => {
    const { browser } = operationBrowser();
    const id = browser.window.CreatorOperations.begin({
        label: 'Accept quest',
        method: 'POST',
        path: '/api/quests/action?mode=accept',
        key: 'quest-command-00000001'
    });
    const operations = snapshot(browser);
    assert.match(id, /^page-operation-/);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].label, 'Accept quest');
    assert.equal(operations[0].method, 'POST');
    assert.equal(operations[0].path, '/api/quests/action?mode=accept');
    assert.equal(operations[0].key, 'quest-command-00000001');
    assert.equal(operations[0].status, 'pending');
    assert.equal(operations[0].retryable, false);
});

test('operation center refuses to display a cross-origin request route', () => {
    const { browser } = operationBrowser();
    browser.window.CreatorOperations.begin({ path: 'https://attacker.invalid/private' });
    const [operation] = snapshot(browser);
    assert.equal(operation.path, 'Page operation');
    assert.doesNotMatch(browser.document.querySelector('.creator-operation-list').textContent, /attacker/);
});

test('operation center finish marks a server-confirmed operation complete', () => {
    const { browser } = operationBrowser();
    const id = browser.window.CreatorOperations.begin({ label: 'Save profile' });
    assert.equal(browser.window.CreatorOperations.finish(id, { status: 200 }), true);
    const [operation] = snapshot(browser);
    assert.equal(operation.status, 'complete');
    assert.equal(operation.message, 'Confirmed by server');
    assert.equal(browser.document.querySelector('.creator-operation-item').classList.contains('is-complete'), true);
    assert.equal(browser.document.querySelector('.creator-operation-count').textContent, '0');
});

test('operation center maps HTTP 409 to a non-destructive conflict state', () => {
    const { browser } = operationBrowser();
    const id = browser.window.CreatorOperations.begin({ label: 'Commit story choice' });
    browser.window.CreatorOperations.finish(id, { status: 409 });
    const [operation] = snapshot(browser);
    assert.equal(operation.status, 'conflict');
    assert.match(operation.message, /server has newer state/i);
    assert.equal(browser.document.querySelector('.creator-operation-item').classList.contains('is-conflict'), true);
    assert.equal(browser.document.querySelector('.creator-operation-count').textContent, '1');
});

test('operation center maps a revision code to conflict without trusting response text', () => {
    const { browser } = operationBrowser();
    const id = browser.window.CreatorOperations.begin({ label: 'Place constellation route' });
    browser.window.CreatorOperations.finish(id, {
        status: 200,
        code: 'REVISION_CONFLICT',
        message: '<img src=x onerror=alert(1)>'
    });
    const [operation] = snapshot(browser);
    assert.equal(operation.status, 'conflict');
    assert.doesNotMatch(operation.message, /img/);
});

test('operation center fail exposes a bounded plain-text failure message', () => {
    const { browser } = operationBrowser();
    const id = browser.window.CreatorOperations.begin({ label: 'Review evidence' });
    browser.window.CreatorOperations.fail(id, new Error('A'.repeat(900)));
    const [operation] = snapshot(browser);
    assert.equal(operation.status, 'failed');
    assert.equal(operation.message.length, 500);
    assert.equal(browser.document.querySelector('.creator-operation-item').classList.contains('is-failed'), true);
});

test('operation center begins offline work in waiting state', () => {
    const { browser } = operationBrowser({ online: false });
    const id = browser.window.CreatorOperations.begin({ label: 'Archive inbox item' });
    const [operation] = snapshot(browser);
    assert.equal(operation.id, id);
    assert.equal(operation.status, 'offline');
    assert.equal(browser.document.querySelector('.creator-operation-network').hidden, false);
    assert.equal(browser.document.querySelector('.creator-operation-count').textContent, '1');
});

test('offline event moves only unresolved pending operations to offline', async () => {
    const { browser } = operationBrowser();
    const pending = browser.window.CreatorOperations.begin({ label: 'Pending' });
    const completed = browser.window.CreatorOperations.begin({ label: 'Completed' });
    browser.window.CreatorOperations.finish(completed, { status: 200 });
    browser.navigator.onLine = false;
    await browser.emit('offline');
    const operations = snapshot(browser);
    assert.equal(operations.find(item => item.id === pending).status, 'offline');
    assert.equal(operations.find(item => item.id === completed).status, 'complete');
    assert.equal(browser.document.querySelector('.creator-operation-network').hidden, false);
    assert.match(browser.window.CreatorShell.announcements.at(-1).message, /Connection lost/);
    assert.equal(browser.window.CreatorShell.announcements.at(-1).priority, 'assertive');
});

test('online event announces recovery without falsely completing work', async () => {
    const { browser, scheduled } = operationBrowser({ online: false });
    browser.window.CreatorOperations.begin({ label: 'Waiting' });
    browser.navigator.onLine = true;
    await browser.emit('online');
    const [operation] = snapshot(browser);
    assert.equal(operation.status, 'offline');
    assert.match(browser.document.querySelector('.creator-operation-network').textContent, /Connection restored/);
    assert.equal(browser.window.CreatorShell.announcements.at(-1).priority, 'polite');
    assert.equal(scheduled.at(-1).delay, 4000);
    scheduled.at(-1).callback();
    assert.equal(browser.document.querySelector('.creator-operation-network').hidden, true);
});

test('operation retry reuses the persisted operation key', async () => {
    const { browser } = operationBrowser();
    const calls = [];
    const id = browser.window.CreatorOperations.begin({
        label: 'Claim reward',
        key: 'reward-command-0001',
        retry(input) {
            calls.push(input);
            return Promise.resolve({ status: 200 });
        }
    });
    browser.window.CreatorOperations.fail(id, new Error('response lost'));
    await browser.window.CreatorOperations.retry(id);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ key: 'reward-command-0001', id }]);
    assert.equal(snapshot(browser)[0].status, 'complete');
    assert.equal(snapshot(browser)[0].key, 'reward-command-0001');
});

test('operation retry keeps failure state when response is lost twice', async () => {
    const { browser } = operationBrowser();
    let attempts = 0;
    const id = browser.window.CreatorOperations.begin({
        label: 'Send director item',
        retry() {
            attempts += 1;
            throw new Error('still unavailable');
        }
    });
    browser.window.CreatorOperations.fail(id, new Error('first unavailable'));
    await browser.window.CreatorOperations.retry(id);
    assert.equal(attempts, 1);
    assert.equal(snapshot(browser)[0].status, 'failed');
    assert.equal(snapshot(browser)[0].message, 'still unavailable');
});

test('operation retry does not call transport while browser remains offline', async () => {
    const { browser } = operationBrowser({ online: false });
    let attempts = 0;
    const id = browser.window.CreatorOperations.begin({
        label: 'Save evidence',
        retry() {
            attempts += 1;
        }
    });
    await browser.window.CreatorOperations.retry(id);
    assert.equal(attempts, 0);
    assert.equal(snapshot(browser)[0].status, 'offline');
    assert.match(snapshot(browser)[0].message, /Connection lost/);
});

test('operation update rejects unknown states and preserves current state', () => {
    const { browser } = operationBrowser();
    const id = browser.window.CreatorOperations.begin({ label: 'Safe state' });
    browser.window.CreatorOperations.update(id, { status: 'provider_sending', message: 'internal' });
    const [operation] = snapshot(browser);
    assert.equal(operation.status, 'pending');
    assert.equal(operation.message, 'internal');
});

test('operation update rejects missing identifiers without mutation', () => {
    const { browser } = operationBrowser();
    browser.window.CreatorOperations.begin({ label: 'Known' });
    const before = snapshot(browser);
    assert.equal(browser.window.CreatorOperations.update('missing', { status: 'complete' }), false);
    assert.deepEqual(snapshot(browser), before);
});

test('operation center handles lifecycle CustomEvents with returned identifiers', async () => {
    const { browser } = operationBrowser();
    let operationId = null;
    await browser.window.dispatchEvent(new FakeCustomEvent('creator:operation-start', {
        detail: {
            label: 'Accept invitation',
            path: '/api/live/item-action',
            resolveId(id) {
                operationId = id;
            }
        }
    }));
    assert.ok(operationId);
    assert.equal(snapshot(browser)[0].status, 'pending');
    await browser.window.dispatchEvent(new FakeCustomEvent('creator:operation-complete', {
        detail: { id: operationId, response: { status: 200 } }
    }));
    assert.equal(snapshot(browser)[0].status, 'complete');
});

test('operation center lifecycle failure event records network-safe state', async () => {
    const { browser } = operationBrowser();
    const id = browser.window.CreatorOperations.begin({ label: 'Start game' });
    await browser.window.dispatchEvent(new FakeCustomEvent('creator:operation-failed', {
        detail: { id, error: Object.assign(new Error('revision changed'), { status: 409 }) }
    }));
    assert.equal(snapshot(browser)[0].status, 'conflict');
    assert.match(snapshot(browser)[0].message, /revision changed/);
});

test('operation center limits retained page history to twenty records', () => {
    const { browser } = operationBrowser();
    for (let index = 0; index < 28; index += 1) {
        const id = browser.window.CreatorOperations.begin({ label: `Operation ${index}` });
        if (index % 2 === 0) browser.window.CreatorOperations.finish(id, { status: 200 });
    }
    const operations = snapshot(browser);
    assert.equal(operations.length, 20);
    assert.equal(new Set(operations.map(item => item.id)).size, 20);
    assert.ok(operations.some(item => item.status === 'pending'));
    assert.ok(operations.every(item => item.label.startsWith('Operation')));
});

test('clear completed keeps unresolved recovery records', async () => {
    const { browser } = operationBrowser();
    const pending = browser.window.CreatorOperations.begin({ label: 'Pending' });
    const complete = browser.window.CreatorOperations.begin({ label: 'Complete' });
    browser.window.CreatorOperations.finish(complete, { status: 200 });
    await browser.document.querySelector('.creator-operation-clear').dispatch('click');
    const operations = snapshot(browser);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].id, pending);
    assert.equal(operations[0].status, 'pending');
});

test('dismiss removes one terminal operation without touching others', async () => {
    const { browser } = operationBrowser();
    const first = browser.window.CreatorOperations.begin({ label: 'First' });
    const second = browser.window.CreatorOperations.begin({ label: 'Second' });
    browser.window.CreatorOperations.finish(first, { status: 200 });
    browser.window.CreatorOperations.finish(second, { status: 200 });
    const item = browser.document.querySelector(`[data-operation-id="${first}"]`);
    const dismiss = item.querySelector('.creator-operation-actions').children.at(-1);
    await dismiss.dispatch('click');
    const operations = snapshot(browser);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].id, second);
});

test('dialog trigger opens, focuses close, and restores trigger focus on close', async () => {
    const { browser } = operationBrowser();
    const trigger = browser.document.querySelector('.creator-operation-trigger');
    const dialog = browser.document.querySelector('.creator-operation-dialog');
    const close = browser.document.querySelector('.creator-operation-close');
    trigger.focus();
    await trigger.dispatch('click');
    assert.equal(dialog.hidden, false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(browser.document.activeElement, close);
    assert.equal(browser.document.body.classList.contains('creator-operation-open'), true);
    await close.dispatch('click');
    assert.equal(dialog.hidden, true);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(browser.document.activeElement, trigger);
});

test('dialog Escape closes the operation history', async () => {
    const { browser } = operationBrowser();
    browser.window.CreatorOperations.open();
    const dialog = browser.document.querySelector('.creator-operation-dialog');
    const event = new FakeEvent('keydown', { key: 'Escape', target: dialog });
    await dialog.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(dialog.hidden, true);
});

test('Chinese operation center exposes translated recovery states', () => {
    const { browser } = operationBrowser({ lang: 'zh' });
    const id = browser.window.CreatorOperations.begin({ label: '保存资料' });
    browser.window.CreatorOperations.finish(id, { status: 409 });
    assert.equal(browser.document.getElementById('creator-operation-title').textContent, '操作与恢复');
    assert.equal(browser.document.querySelector('.creator-operation-state').textContent, '状态已更新');
    assert.match(browser.document.querySelector('.creator-operation-item').textContent, /服务器状态较新/);
});

test('responsive navigator inserts a visible-on-focus skip link', () => {
    const { browser, main } = navigationBrowser();
    const skip = browser.document.querySelector('.creator-skip-link');
    assert.ok(skip);
    assert.equal(skip.href, '#creator-main');
    assert.equal(skip.textContent, 'Skip to main content');
    assert.equal(main.id, 'creator-main');
});

test('responsive navigator assigns stable unique heading identifiers', () => {
    const { headings } = navigationBrowser({
        sections: [
            ['h2', 'Quest history'],
            ['h2', 'Quest history'],
            ['h3', 'Evidence & review']
        ]
    });
    assert.equal(headings[0].id, 'creator-quest-history');
    assert.equal(headings[1].id, 'creator-quest-history-2');
    assert.equal(headings[2].id, 'creator-evidence-review');
    assert.equal(new Set(headings.map(heading => heading.id)).size, 3);
    assert.ok(headings.every(heading => heading.dataset.navigationHeading === 'true'));
    assert.ok(headings.every(heading => heading.tabIndex === -1));
});

test('responsive navigator preserves authored heading identifiers', () => {
    const browser = createBrowser();
    const main = append(browser.document, browser.document.body, 'main', { id: 'main' });
    const first = append(browser.document, main, 'h2', { id: 'authored-one', text: 'One' });
    const second = append(browser.document, main, 'h2', { id: 'authored-two', text: 'Two' });
    browser.run('public/js/creator-responsive-navigation.js');
    assert.equal(first.id, 'authored-one');
    assert.equal(second.id, 'authored-two');
    assert.equal(browser.document.querySelectorAll('.creator-section-list a').length, 2);
});

test('responsive navigator does not mount on a page with fewer than two headings', () => {
    const browser = createBrowser();
    const main = append(browser.document, browser.document.body, 'main');
    append(browser.document, main, 'h2', { text: 'Only section' });
    browser.run('public/js/creator-responsive-navigation.js');
    assert.equal(browser.document.querySelector('[data-section-navigation]'), null);
});

test('responsive navigator ignores headings inside hidden containers', () => {
    const browser = createBrowser();
    const main = append(browser.document, browser.document.body, 'main');
    append(browser.document, main, 'h2', { text: 'Visible one' });
    const hidden = append(browser.document, main, 'section', { hidden: true });
    append(browser.document, hidden, 'h2', { text: 'Secret draft controls' });
    append(browser.document, main, 'h2', { text: 'Visible two' });
    browser.run('public/js/creator-responsive-navigation.js');
    const links = browser.document.querySelectorAll('.creator-section-list a');
    assert.equal(links.length, 2);
    assert.ok(links.every(link => !link.textContent.includes('Secret')));
});

test('responsive navigator marks exactly one current section', () => {
    const { browser } = navigationBrowser();
    const links = browser.document.querySelectorAll('.creator-section-list a');
    assert.equal(links.filter(link => link.getAttribute('aria-current') === 'location').length, 1);
    assert.equal(links[0].getAttribute('aria-current'), 'location');
    assert.equal(browser.document.querySelector('.creator-section-progress').value, 1);
});

test('responsive navigator state exposes no heading body content', () => {
    const { browser } = navigationBrowser();
    const state = JSON.parse(JSON.stringify(browser.window.CreatorSectionNavigation.state()));
    assert.deepEqual(state, {
        activeIndex: 0,
        expanded: false,
        sectionCount: 5,
        activeId: 'creator-current-quests'
    });
    assert.doesNotMatch(JSON.stringify(state), /body/);
});

test('responsive navigator opens panel and focuses the current link', () => {
    const { browser } = navigationBrowser();
    browser.window.CreatorSectionNavigation.open();
    const panel = browser.document.querySelector('.creator-section-panel');
    const trigger = browser.document.querySelector('.creator-section-toggle');
    const current = browser.document.querySelector('[aria-current="location"]');
    assert.equal(panel.hidden, false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(browser.document.activeElement, current);
    assert.equal(browser.window.CreatorSectionNavigation.state().expanded, true);
});

test('responsive navigator closes panel and restores trigger focus', () => {
    const { browser } = navigationBrowser();
    browser.window.CreatorSectionNavigation.open();
    browser.window.CreatorSectionNavigation.close();
    const panel = browser.document.querySelector('.creator-section-panel');
    const trigger = browser.document.querySelector('.creator-section-toggle');
    assert.equal(panel.hidden, true);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(browser.document.activeElement, trigger);
});

test('responsive navigator next focuses and scrolls to the following heading', () => {
    const { browser, headings } = navigationBrowser();
    browser.window.CreatorSectionNavigation.next();
    assert.equal(browser.window.CreatorSectionNavigation.state().activeIndex, 1);
    assert.equal(browser.document.activeElement, headings[1]);
    assert.equal(headings[1].lastScrollOptions.behavior, 'smooth');
    assert.equal(headings[1].lastScrollOptions.block, 'start');
    assert.equal(browser.document.querySelector('.creator-section-progress').value, 2);
});

test('responsive navigator honors reduced motion while moving', () => {
    const browser = createBrowser({
        matchMedia(query) {
            return { matches: query === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} };
        }
    });
    const main = append(browser.document, browser.document.body, 'main');
    const first = append(browser.document, main, 'h2', { text: 'First' });
    const second = append(browser.document, main, 'h2', { text: 'Second' });
    browser.run('public/js/creator-responsive-navigation.js');
    browser.window.CreatorSectionNavigation.next();
    assert.equal(first.lastScrollOptions, undefined);
    assert.equal(second.lastScrollOptions.behavior, 'auto');
});

test('responsive navigator bounds previous and next at page edges', () => {
    const { browser } = navigationBrowser();
    browser.window.CreatorSectionNavigation.previous();
    assert.equal(browser.window.CreatorSectionNavigation.state().activeIndex, 0);
    browser.window.CreatorSectionNavigation.goTo(999);
    assert.equal(browser.window.CreatorSectionNavigation.state().activeIndex, 4);
    browser.window.CreatorSectionNavigation.next();
    assert.equal(browser.window.CreatorSectionNavigation.state().activeIndex, 4);
});

test('responsive navigator updates progress text and navigation control state', () => {
    const { browser } = navigationBrowser();
    browser.window.CreatorSectionNavigation.goTo(2);
    const label = browser.document.querySelector('.creator-section-progress-label');
    const controls = browser.document.querySelector('.creator-section-controls');
    assert.equal(label.textContent, 'Reading progress: 3/5');
    assert.equal(controls.children[0].disabled, false);
    assert.equal(controls.children[1].disabled, false);
    browser.window.CreatorSectionNavigation.goTo(4);
    assert.equal(controls.children[1].disabled, true);
});

test('responsive navigator link click updates hash without full navigation', async () => {
    const { browser, headings } = navigationBrowser();
    const link = browser.document.querySelectorAll('.creator-section-list a')[2];
    const event = new FakeEvent('click', { target: link });
    await link.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(browser.window.CreatorSectionNavigation.state().activeIndex, 2);
    assert.equal(browser.location.hash, `#${headings[2].id}`);
    assert.deepEqual(browser.history.entries.at(-1), {
        state: null,
        title: '',
        url: `#${headings[2].id}`
    });
});

test('responsive navigator list supports ArrowDown and ArrowUp focus movement', async () => {
    const { browser } = navigationBrowser();
    browser.window.CreatorSectionNavigation.open();
    const links = browser.document.querySelectorAll('.creator-section-list a');
    links[0].focus();
    const down = new FakeEvent('keydown', { key: 'ArrowDown', target: links[0] });
    await links[0].dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(browser.document.activeElement, links[1]);
    const up = new FakeEvent('keydown', { key: 'ArrowUp', target: links[1] });
    await links[1].dispatchEvent(up);
    assert.equal(up.defaultPrevented, true);
    assert.equal(browser.document.activeElement, links[0]);
});

test('responsive navigator list supports Home and End focus movement', async () => {
    const { browser } = navigationBrowser();
    const links = browser.document.querySelectorAll('.creator-section-list a');
    links[2].focus();
    await links[2].dispatchEvent(new FakeEvent('keydown', { key: 'End', target: links[2] }));
    assert.equal(browser.document.activeElement, links.at(-1));
    await links.at(-1).dispatchEvent(new FakeEvent('keydown', { key: 'Home', target: links.at(-1) }));
    assert.equal(browser.document.activeElement, links[0]);
});

test('responsive navigator Escape closes an open panel', async () => {
    const { browser } = navigationBrowser();
    browser.window.CreatorSectionNavigation.open();
    const panel = browser.document.querySelector('.creator-section-panel');
    const event = new FakeEvent('keydown', { key: 'Escape', target: panel });
    await panel.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(panel.hidden, true);
    assert.equal(browser.document.activeElement, browser.document.querySelector('.creator-section-toggle'));
});

test('responsive navigator collapses after section selection on mobile', () => {
    const { browser } = navigationBrowser({ innerWidth: 390 });
    browser.window.CreatorSectionNavigation.open();
    browser.window.CreatorSectionNavigation.goTo(3);
    assert.equal(browser.window.CreatorSectionNavigation.state().activeIndex, 3);
    assert.equal(browser.window.CreatorSectionNavigation.state().expanded, false);
    assert.equal(browser.document.querySelector('.creator-section-panel').hidden, true);
});

test('responsive navigator initializes from a matching fragment', () => {
    const { browser } = navigationBrowser({ hash: '#creator-weekly-board' });
    const state = browser.window.CreatorSectionNavigation.state();
    assert.equal(state.activeIndex, 2);
    assert.equal(state.activeId, 'creator-weekly-board');
    assert.equal(browser.document.querySelectorAll('[aria-current="location"]').length, 1);
});

test('responsive navigator destroy removes only its own navigation', () => {
    const { browser, main } = navigationBrowser();
    browser.window.CreatorSectionNavigation.destroy();
    assert.equal(browser.document.querySelector('[data-section-navigation]'), null);
    assert.ok(main.isConnected);
    assert.ok(browser.document.querySelector('.creator-skip-link'));
});

test('Chinese responsive navigator translates controls and progress', () => {
    const { browser } = navigationBrowser({ lang: 'zh' });
    assert.equal(browser.document.querySelector('.creator-section-toggle').children[1].textContent, '本页导航');
    assert.equal(browser.document.querySelector('.creator-section-progress-label').textContent, '阅读进度: 1/5');
    assert.equal(browser.document.querySelector('.creator-section-controls').children[0].textContent, '← 上一节');
    assert.equal(browser.document.querySelector('.creator-section-controls').children[1].textContent, '下一节 →');
});

test('all enhanced creator and admin views statically load operation recovery', () => {
    const views = [
        'views/creator-home.ejs',
        'views/creator-profile.ejs',
        'views/creator-rewards.ejs',
        'views/creator-achievements.ejs',
        'views/quest-journal.ejs',
        'views/story-world.ejs',
        'views/live-room.ejs',
        'views/streamer-game.ejs',
        'views/admin-creator-director.ejs',
        'views/admin-quest-studio.ejs'
    ];
    for (const relativePath of views) {
        const template = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
        assert.match(template, /<script src="\/js\/creator-operation-center\.js"><\/script>/, relativePath);
        assert.match(template, /<script src="\/js\/creator-responsive-navigation\.js"><\/script>/, relativePath);
        assert.ok(template.indexOf('/js/creator-shell.js') < template.indexOf('/js/creator-operation-center.js'), relativePath);
        assert.ok(template.indexOf('/js/creator-operation-center.js') < template.indexOf('/js/creator-responsive-navigation.js'), relativePath);
    }
});

test('shared recovery modules are syntax-valid and avoid dynamic script injection', () => {
    const operationSource = source('public/js/creator-operation-center.js');
    const navigationSource = source('public/js/creator-responsive-navigation.js');
    assert.doesNotThrow(() => new Function(operationSource));
    assert.doesNotThrow(() => new Function(navigationSource));
    assert.doesNotMatch(operationSource, /createElement\(['"]script/);
    assert.doesNotMatch(navigationSource, /createElement\(['"]script/);
    assert.doesNotMatch(operationSource, /eval\s*\(/);
    assert.doesNotMatch(navigationSource, /eval\s*\(/);
});
