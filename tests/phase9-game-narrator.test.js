'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    FakeCustomEvent,
    FakeEvent,
    append,
    createBrowser,
    source
} = require('./helpers/phase9-dom');

function createRun(overrides = {}) {
    return {
        id: '00000000-0000-4000-a000-000000000001',
        status: 'active',
        revision: 3,
        score: 240,
        actorRole: 'creator',
        mode: 'solo',
        state: {
            turn: 4,
            solution: ['hidden'],
            graph: { secret: ['right'] },
            submissions: { owner: { choice: 2 } }
        },
        ...overrides
    };
}

function narratorFixture(options = {}) {
    const scheduled = [];
    const browser = createBrowser({
        lang: options.lang || 'en',
        online: options.online !== false,
        setTimeout(callback, delay) {
            if (options.immediateTimers !== false) callback();
            else scheduled.push({ callback, delay });
            return scheduled.length + 1;
        },
        clearTimeout() {}
    });
    browser.document.body.dataset.lang = options.lang || 'en';
    browser.document.body.dataset.gameId = options.gameId || 'constellation-repair';
    const main = append(browser.document, browser.document.body, 'main');
    const status = append(browser.document, main, 'div', { id: 'sg-status' });
    const actions = append(browser.document, main, 'div', { id: 'sg-actions' });
    const history = append(browser.document, main, 'ul', { id: 'sg-history' });
    let model = { run: options.run === undefined ? createRun() : options.run };
    let refreshCalls = 0;
    browser.window.StreamerGameModel = {
        get() {
            return model;
        },
        async refresh() {
            refreshCalls += 1;
            return model;
        }
    };
    browser.window.CreatorShell = {
        announcements: [],
        announce(message, priority) {
            this.announcements.push({ message, priority });
        }
    };
    const addAction = ({ type = 'place', disabled = false, hidden = false, label = 'Action' } = {}) => {
        const button = append(browser.document, actions, 'button', {
            text: label,
            disabled,
            hidden,
            dataset: { type }
        });
        button.type = 'button';
        return button;
    };
    const addHistory = (label = 'completed · standard · 500') => append(browser.document, history, 'li', { text: label });
    if (options.addDefaults !== false) {
        addAction({ label: 'Place' });
        addAction({ label: 'Blocked', disabled: true });
        addHistory();
    }
    browser.run('public/js/games/game-state-narrator.js');
    return {
        browser,
        status,
        actions,
        history,
        scheduled,
        addAction,
        addHistory,
        setModel(next) {
            model = next;
        },
        refreshCalls() {
            return refreshCalls;
        }
    };
}

function state(browser) {
    return JSON.parse(JSON.stringify(browser.window.StreamerGameNarrator.state()));
}

test('game narrator mounts beside recent history with labelled region', () => {
    const { browser, history } = narratorFixture();
    const root = browser.document.getElementById('sg-state-narrator');
    assert.ok(root);
    assert.equal(root.getAttribute('aria-labelledby'), 'sg-state-narrator-title');
    assert.equal(browser.document.getElementById('sg-state-narrator-title').textContent, 'Run state assistant');
    assert.equal(history.nextSibling, root);
    assert.equal(browser.document.querySelectorAll('#sg-state-narrator').length, 1);
});

test('game narrator refuses to mount without public model API', () => {
    const browser = createBrowser();
    append(browser.document, browser.document.body, 'div', { id: 'sg-actions' });
    append(browser.document, browser.document.body, 'div', { id: 'sg-status' });
    append(browser.document, browser.document.body, 'ul', { id: 'sg-history' });
    browser.run('public/js/games/game-state-narrator.js');
    assert.equal(browser.document.getElementById('sg-state-narrator'), null);
    assert.equal(browser.window.StreamerGameNarrator, undefined);
});

test('game narrator exposes active public status and bounded metrics', () => {
    const { browser } = narratorFixture();
    const summary = browser.document.querySelector('.sg-state-narrator-summary');
    const metrics = browser.document.querySelector('.sg-state-narrator-metrics');
    assert.equal(summary.textContent, 'Run in progress');
    assert.equal(summary.dataset.status, 'active');
    assert.equal(metrics.children.length, 4);
    assert.equal(metrics.children[0].textContent, 'Revision3');
    assert.equal(metrics.children[1].textContent, 'Turn4');
    assert.equal(metrics.children[2].textContent, 'Score240');
    assert.equal(metrics.children[3].textContent, 'Rolecreator');
});

test('game narrator state contains no hidden engine fields', () => {
    const { browser } = narratorFixture();
    const snapshot = state(browser);
    const serialized = JSON.stringify(snapshot);
    assert.equal(snapshot.current.id, '00000000-0000-4000-a000-000000000001');
    assert.equal(snapshot.current.revision, 3);
    assert.equal(snapshot.current.turn, 4);
    assert.doesNotMatch(serialized, /solution/);
    assert.doesNotMatch(serialized, /graph/);
    assert.doesNotMatch(serialized, /submissions/);
    assert.doesNotMatch(serialized, /hidden/);
});

test('game narrator counts only visible enabled mutation controls', () => {
    const { browser, addAction } = narratorFixture({ addDefaults: false });
    addAction({ label: 'Available one' });
    addAction({ label: 'Available two' });
    addAction({ label: 'Disabled', disabled: true });
    addAction({ label: 'Hidden', hidden: true });
    browser.window.StreamerGameNarrator.render();
    assert.equal(state(browser).availableActions, 2);
    assert.equal(browser.document.querySelector('.sg-state-narrator-actions').textContent, 'Available actions: 2 available actions');
});

test('game narrator uses singular action copy for one enabled control', () => {
    const { browser } = narratorFixture();
    assert.equal(state(browser).availableActions, 1);
    assert.equal(browser.document.querySelector('.sg-state-narrator-actions').textContent, 'Available actions: 1 available action');
});

test('game narrator reports no action when all controls are blocked', () => {
    const { browser, addAction } = narratorFixture({ addDefaults: false });
    addAction({ disabled: true });
    browser.window.StreamerGameNarrator.render();
    assert.equal(state(browser).availableActions, 0);
    assert.equal(browser.document.querySelector('.sg-state-narrator-actions').textContent, 'Available actions: No actions are currently available');
    assert.equal(browser.document.querySelector('.sg-state-narrator-controls').children[0].disabled, true);
});

test('game narrator no-run projection clears stale metrics and actions', () => {
    const { browser } = narratorFixture({ run: null, addDefaults: false });
    assert.equal(browser.document.querySelector('.sg-state-narrator-summary').textContent, 'No run has started');
    assert.equal(browser.document.querySelector('.sg-state-narrator-metrics').children.length, 0);
    assert.equal(browser.document.querySelector('.sg-state-narrator-actions').textContent, 'No actions are currently available');
    assert.equal(state(browser).current, null);
});

test('matching game model event records revision change', async () => {
    const fixture = narratorFixture();
    fixture.setModel({ run: createRun({ revision: 4 }) });
    await fixture.browser.document.dispatchEvent(new FakeCustomEvent('streamer-game:model', {
        detail: { gameId: 'constellation-repair', revision: 4 }
    }));
    const snapshot = state(fixture.browser);
    assert.equal(snapshot.current.revision, 4);
    assert.equal(snapshot.changes.length, 2);
    assert.match(snapshot.changes[0].message, /Revision 4/);
});

test('foreign game model event cannot alter current narrator state', async () => {
    const fixture = narratorFixture();
    fixture.setModel({ run: createRun({ revision: 99 }) });
    await fixture.browser.document.dispatchEvent(new FakeCustomEvent('streamer-game:model', {
        detail: { gameId: 'signal-duet', revision: 99 }
    }));
    assert.equal(state(fixture.browser).current.revision, 3);
    assert.equal(state(fixture.browser).changes.length, 1);
});

test('new turn event records turn without hidden action details', async () => {
    const fixture = narratorFixture();
    fixture.setModel({ run: createRun({ revision: 4, state: { turn: 5, solution: ['secret'] } }) });
    await fixture.browser.document.dispatchEvent(new FakeCustomEvent('streamer-game:model', {
        detail: { gameId: 'constellation-repair' }
    }));
    const latest = state(fixture.browser).changes[0];
    assert.equal(latest.message, 'New turn 5');
    assert.doesNotMatch(JSON.stringify(latest), /secret|solution/);
});

test('terminal event announces assertively and records controls closed', async () => {
    const fixture = narratorFixture();
    fixture.setModel({ run: createRun({ status: 'completed', revision: 4, score: 900 }) });
    await fixture.browser.document.dispatchEvent(new FakeCustomEvent('streamer-game:model', {
        detail: { gameId: 'constellation-repair' }
    }));
    const latest = state(fixture.browser).changes[0];
    assert.match(latest.message, /Run completed/);
    assert.match(latest.message, /terminal state/);
    assert.equal(fixture.browser.window.CreatorShell.announcements.at(-1).priority, 'assertive');
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-summary').dataset.status, 'completed');
});

test('failed run renders bounded terminal status without stack or reason', async () => {
    const fixture = narratorFixture();
    fixture.setModel({ run: createRun({ status: 'failed', failureReason: 'database secret' }) });
    await fixture.browser.document.dispatchEvent(new FakeCustomEvent('streamer-game:model', {
        detail: { gameId: 'constellation-repair' }
    }));
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-summary').textContent, 'Run ended');
    assert.doesNotMatch(fixture.browser.document.getElementById('sg-state-narrator').textContent, /database secret/);
});

test('announcement toggle changes aria state and pauses state announcements', async () => {
    const fixture = narratorFixture();
    const toggle = fixture.browser.document.querySelector('.sg-state-narrator-toggle');
    const before = fixture.browser.window.CreatorShell.announcements.length;
    await toggle.dispatch('click');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(toggle.textContent, 'Enable state announcements');
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-events').getAttribute('aria-live'), 'off');
    assert.equal(fixture.browser.window.CreatorShell.announcements.length, before + 1);
    fixture.setModel({ run: createRun({ revision: 8 }) });
    await fixture.browser.document.dispatchEvent(new FakeCustomEvent('streamer-game:model', {
        detail: { gameId: 'constellation-repair' }
    }));
    assert.equal(fixture.browser.window.CreatorShell.announcements.length, before + 1);
});

test('announcement toggle can safely resume polite updates', async () => {
    const fixture = narratorFixture();
    const toggle = fixture.browser.document.querySelector('.sg-state-narrator-toggle');
    await toggle.dispatch('click');
    await toggle.dispatch('click');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(toggle.textContent, 'Pause state announcements');
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-events').getAttribute('aria-live'), 'polite');
    assert.equal(fixture.browser.window.CreatorShell.announcements.at(-1).message, 'State announcements enabled');
});

test('narrator bounds state change history to twelve newest entries', () => {
    const fixture = narratorFixture();
    for (let revision = 4; revision <= 30; revision += 1) {
        fixture.setModel({ run: createRun({ revision }) });
        fixture.browser.window.StreamerGameNarrator.render();
    }
    const snapshot = state(fixture.browser);
    assert.equal(snapshot.changes.length, 12);
    assert.match(snapshot.changes[0].message, /Revision 30/);
    assert.ok(snapshot.changes.every(change => change.message.length <= 240));
    assert.equal(fixture.browser.document.querySelectorAll('.sg-state-narrator-events li').length, 12);
});

test('clear state history preserves current run summary', async () => {
    const fixture = narratorFixture();
    fixture.setModel({ run: createRun({ revision: 4 }) });
    fixture.browser.window.StreamerGameNarrator.render();
    const clear = fixture.browser.document.querySelector('.sg-state-narrator-controls').children[2];
    assert.equal(clear.disabled, false);
    await clear.dispatch('click');
    assert.equal(state(fixture.browser).changes.length, 0);
    assert.equal(state(fixture.browser).current.revision, 4);
    assert.equal(clear.disabled, true);
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-empty').hidden, false);
});

test('focus action control moves to first enabled visible mutation', () => {
    const fixture = narratorFixture({ addDefaults: false });
    const disabled = fixture.addAction({ label: 'Disabled', disabled: true });
    const available = fixture.addAction({ label: 'Available' });
    fixture.addAction({ label: 'Later' });
    assert.equal(fixture.browser.window.StreamerGameNarrator.focusActions(), true);
    assert.notEqual(fixture.browser.document.activeElement, disabled);
    assert.equal(fixture.browser.document.activeElement, available);
});

test('focus action reports false when no safe mutation exists', () => {
    const fixture = narratorFixture({ addDefaults: false });
    fixture.addAction({ disabled: true });
    fixture.addAction({ hidden: true });
    assert.equal(fixture.browser.window.StreamerGameNarrator.focusActions(), false);
    assert.equal(fixture.browser.document.activeElement, fixture.browser.document.body);
});

test('F6 keyboard shortcut focuses first enabled action and prevents browser default', async () => {
    const fixture = narratorFixture();
    const action = fixture.actions.querySelector('button[data-type]');
    const event = new FakeEvent('keydown', { key: 'F6', target: fixture.browser.document });
    await fixture.browser.document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(fixture.browser.document.activeElement, action);
});

test('focus history targets newest history row and adds programmatic tabindex', () => {
    const fixture = narratorFixture();
    const first = fixture.history.querySelector('li');
    fixture.addHistory('older');
    assert.equal(fixture.browser.window.StreamerGameNarrator.focusHistory(), true);
    assert.equal(fixture.browser.document.activeElement, first);
    assert.equal(first.tabIndex, -1);
});

test('focus history reports false for an empty history', () => {
    const fixture = narratorFixture({ addDefaults: false });
    assert.equal(fixture.browser.window.StreamerGameNarrator.focusHistory(), false);
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-controls').children[1].disabled, true);
});

test('F7 keyboard shortcut focuses recent history and prevents browser default', async () => {
    const fixture = narratorFixture();
    const row = fixture.history.querySelector('li');
    const event = new FakeEvent('keydown', { key: 'F7', target: fixture.browser.document });
    await fixture.browser.document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(fixture.browser.document.activeElement, row);
});

test('unrelated key cannot trigger narrator focus movement', async () => {
    const fixture = narratorFixture();
    fixture.browser.document.body.focus();
    const event = new FakeEvent('keydown', { key: 'F8', target: fixture.browser.document });
    await fixture.browser.document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(fixture.browser.document.activeElement, fixture.browser.document.body);
});

test('offline event creates explicit recovery note without completing action', async () => {
    const fixture = narratorFixture();
    fixture.browser.navigator.onLine = false;
    await fixture.browser.emit('offline');
    const snapshot = state(fixture.browser);
    assert.match(snapshot.changes[0].message, /offline/);
    assert.equal(snapshot.current.status, 'active');
    assert.equal(snapshot.current.revision, 3);
    assert.equal(fixture.browser.window.CreatorShell.announcements.at(-1).priority, 'polite');
});

test('online event records recovery and requests authoritative state once', async () => {
    const fixture = narratorFixture();
    await fixture.browser.emit('online');
    const snapshot = state(fixture.browser);
    assert.match(snapshot.changes[0].message, /Connection restored/);
    assert.equal(fixture.refreshCalls(), 1);
    assert.equal(snapshot.current.revision, 3);
});

test('online refresh rejection is contained and does not create unhandled state', async () => {
    const fixture = narratorFixture();
    fixture.browser.window.StreamerGameModel.refresh = async () => {
        throw new Error('network down');
    };
    await assert.doesNotReject(fixture.browser.emit('online'));
    assert.match(state(fixture.browser).changes[0].message, /Connection restored/);
    assert.doesNotMatch(fixture.browser.document.getElementById('sg-state-narrator').textContent, /network down/);
});

test('Chinese narrator renders translated run status and controls', () => {
    const fixture = narratorFixture({ lang: 'zh' });
    assert.equal(fixture.browser.document.getElementById('sg-state-narrator-title').textContent, '对局状态助手');
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-summary').textContent, '对局进行中');
    assert.equal(fixture.browser.document.querySelector('.sg-state-narrator-toggle').textContent, '暂停状态播报');
    assert.match(fixture.browser.document.querySelector('.sg-state-narrator-actions').textContent, /1 个可用操作/);
    assert.match(fixture.browser.document.querySelector('.sg-state-narrator-shortcuts').textContent, /F6/);
});

test('game view loads narrator after authoritative game renderer', () => {
    const template = source('views/streamer-game.ejs');
    const renderer = template.indexOf('/js/streamer-game.js');
    const narrator = template.indexOf('/js/games/game-state-narrator.js');
    assert.ok(renderer >= 0);
    assert.ok(narrator > renderer);
    assert.match(template, /<script src="\/js\/games\/game-state-narrator\.js"><\/script>/);
});

test('game renderer reports start and action outcomes to operation recovery center', () => {
    const renderer = source('public/js/streamer-game.js');
    assert.match(renderer, /window\.CreatorOperations\?\.begin/);
    assert.match(renderer, /\/api\/\$\{gameId\}\/action/);
    assert.match(renderer, /\/api\/\$\{gameId\}\/start/);
    assert.match(renderer, /window\.CreatorOperations\.finish/);
    assert.match(renderer, /window\.CreatorOperations\.fail/);
    assert.match(renderer, /GAME_ACTIVE_RUN_EXISTS/);
});

test('narrator source uses text nodes and contains no HTML or script sink', () => {
    const code = source('public/js/games/game-state-narrator.js');
    assert.doesNotMatch(code, /\.innerHTML\s*=/);
    assert.doesNotMatch(code, /insertAdjacentHTML/);
    assert.doesNotMatch(code, /createElement\(['"]script/);
    assert.doesNotMatch(code, /eval\s*\(/);
    assert.match(code, /textContent/);
});

test('narrator style includes mobile, high contrast, and bounded event history', () => {
    const css = source('public/game-experience.css');
    assert.match(css, /\.sg-state-narrator/);
    assert.match(css, /max-block-size:\s*12rem/);
    assert.match(css, /@media \(max-width: 480px\)/);
    assert.match(css, /@media \(prefers-contrast: more\)/);
    assert.match(css, /min-block-size:\s*2\.65rem/);
});
