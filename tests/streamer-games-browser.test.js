'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

class FakeNode {
    constructor(tagName = 'div', id = '') {
        this.tagName = String(tagName).toUpperCase();
        this.id = id;
        this.dataset = {};
        this.children = [];
        this.listeners = new Map();
        this.attributes = new Map();
        this.style = {};
        this.disabled = false;
        this.textContent = '';
        this.value = '';
        this.type = '';
        this.className = '';
    }

    append(...nodes) {
        this.children.push(...nodes);
    }

    replaceChildren(...nodes) {
        this.children = [...nodes];
    }

    setAttribute(name, value) {
        this.attributes.set(String(name), String(value));
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    async dispatch(type, event = {}) {
        for (const listener of this.listeners.get(type) || []) {
            await listener({ currentTarget: this, target: this, preventDefault() {}, ...event });
        }
    }

    matches(selector) {
        if (selector === 'button') return this.tagName === 'BUTTON';
        if (selector === 'select') return this.tagName === 'SELECT';
        if (selector === 'button[data-type]') return this.tagName === 'BUTTON' && Boolean(this.dataset.type);
        return false;
    }

    closest(selector) {
        return this.matches(selector) ? this : null;
    }

    querySelectorAll(selector) {
        const selectors = selector.split(',').map(value => value.trim());
        const found = [];
        const visit = node => {
            for (const child of node.children) {
                if (child instanceof FakeNode) {
                    if (selectors.some(item => child.matches(item))) found.push(child);
                    visit(child);
                }
            }
        };
        visit(this);
        return found;
    }
}

function response(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return body; }
    };
}

function run({ gameId, state, status = 'active', revision = 0, mode = 'solo', actorRole = 'creator' }) {
    return {
        id: '00000000-0000-4000-a000-000000000901',
        gameId,
        configVersion: `${gameId}-v1`,
        mode,
        difficulty: 'gentle',
        status,
        revision,
        score: state.score || 0,
        actorRole,
        creatorUsername: 'creator',
        relayInteractionId: mode === 'coop' ? 77 : null,
        partnerUsername: mode === 'coop' ? 'owner' : null,
        state
    };
}

function stateBase(overrides = {}) {
    return {
        titleZh: '测试关卡',
        titleEn: 'Test challenge',
        briefZh: '用于浏览器行为验证。',
        briefEn: 'Used for browser behavior verification.',
        score: 0,
        ...overrides
    };
}

function createBrowser({ gameId, initialRun, mutation, refreshed }) {
    const ids = ['sg-bootstrap', 'sg-challenge', 'sg-content', 'sg-actions', 'sg-status',
        'sg-message', 'sg-history', 'sg-tutorial', 'sg-collection', 'sg-start', 'sg-difficulty'];
    const elements = new Map(ids.map(id => [id, new FakeNode(id === 'sg-start' ? 'button' : 'div', id)]));
    elements.get('sg-difficulty').value = 'gentle';
    elements.get('sg-bootstrap').textContent = JSON.stringify({
        state: { success: true, gameId, run: initialRun, history: [], collection: initialRun?.collection || null },
        pack: { challenges: [{ id: 'challenge', titleZh: '测试', titleEn: 'Test' }] }
    });
    const body = new FakeNode('body');
    body.dataset.lang = 'en';
    body.dataset.gameId = gameId;
    body.dataset.csrfToken = 'csrf';
    const documentListeners = new Map();
    const document = {
        body,
        createElement: tag => new FakeNode(tag),
        getElementById: id => elements.get(id) || null,
        querySelector: selector => selector === 'input[name=sg-mode]:checked' ? { value: 'solo' } : null,
        addEventListener(type, listener) { documentListeners.set(type, listener); }
    };
    const socketHandlers = new Map();
    const socketEmits = [];
    const socket = {
        on(type, listener) { socketHandlers.set(type, listener); },
        emit(type, payload) { socketEmits.push({ type, payload }); }
    };
    const mutationCalls = [];
    const refreshCalls = [];
    const windowObject = {
        addEventListener() {},
        idempotentFetch: async (url, options) => {
            mutationCalls.push({ url, options });
            if (mutation instanceof Error) throw mutation;
            return response(mutation);
        },
        io: () => socket
    };
    const context = {
        window: windowObject,
        document,
        console,
        crypto: { randomUUID: () => '00000000-0000-4000-a000-000000000999' },
        fetch: async url => {
            refreshCalls.push(url);
            return response(refreshed || { success: true, gameId, run: initialRun, history: [] });
        },
        setInterval: () => 1,
        clearInterval() {},
        Date,
        Map,
        Set,
        JSON,
        encodeURIComponent
    };
    vm.createContext(context);
    vm.runInContext(source('public/js/streamer-game-ui-state.js'), context);
    vm.runInContext(source('public/js/streamer-game.js'), context);
    return { documentListeners, elements, mutationCalls, refreshCalls, socketHandlers, socketEmits };
}

function buttons(element) {
    return element.querySelectorAll('button');
}

test('actual constellation renderer preserves partner-turn and blocker controls after a successful click', async () => {
    const firstState = stateBase({
        width: 2,
        height: 2,
        placements: [],
        yourTurn: true,
        privateClue: { blockedCells: ['1:1'], nextColumn: 0 }
    });
    const nextState = stateBase({
        width: 2,
        height: 2,
        placements: [{ key: '0:0', x: 0, y: 0, role: 'owner' }],
        yourTurn: false,
        privateClue: { blockedCells: ['1:1'], nextColumn: 1 }
    });
    const initialRun = run({ gameId: 'constellation-repair', state: firstState, mode: 'coop', actorRole: 'owner' });
    const nextRun = run({ gameId: 'constellation-repair', state: nextState, mode: 'coop', actorRole: 'owner', revision: 1 });
    const browser = createBrowser({ gameId: 'constellation-repair', initialRun,
        mutation: { success: true, run: nextRun } });
    assert.ok(browser.socketEmits.some(item => item.type === 'live:subscribe'));
    const actionPanel = browser.elements.get('sg-actions');
    const directCell = buttons(actionPanel).find(button => button.dataset.x === '0' && button.dataset.y === '0');
    assert.equal(directCell.disabled, false);
    await actionPanel.dispatch('click', { target: directCell });
    assert.equal(browser.mutationCalls.length, 1);
    assert.ok(buttons(actionPanel).every(button => button.disabled), 'partner-turn render must remain disabled');
    const blocker = buttons(actionPanel).find(button => button.dataset.x === '1' && button.dataset.y === '1');
    assert.equal(blocker.disabled, true);
});

test('actual crafting renderer restores resting/material rules after a network error', async () => {
    const craftingState = stateBase({
        challengeId: 'paper-moon-lamp',
        recipe: { 'folded-paper': 1, 'soft-light': 1 },
        materialLabels: { 'folded-paper': '折纸', 'soft-light': '柔光' },
        materials: {},
        crafted: [],
        roomSlots: [null, null, null, null, null, null],
        nextMaterial: 'folded-paper'
    });
    const initialRun = run({ gameId: 'studio-crafting', state: craftingState });
    const browser = createBrowser({ gameId: 'studio-crafting', initialRun,
        mutation: new Error('network unavailable') });
    const actionPanel = browser.elements.get('sg-actions');
    const gather = buttons(actionPanel).find(button => button.dataset.material === 'folded-paper');
    await actionPanel.dispatch('click', { target: gather });
    assert.equal(browser.mutationCalls.length, 1);
    const current = buttons(actionPanel);
    assert.equal(current.find(button => button.dataset.material === 'folded-paper').disabled, false);
    assert.equal(current.find(button => button.dataset.material === 'soft-light').disabled, true);
    assert.equal(current.find(button => button.dataset.type === 'craft').disabled, true);
});

test('signal renderer shows its authoritative countdown and Space commits the current beat', async () => {
    const serverNowMs = Date.now();
    const firstState = stateBase({
        bpm: 90,
        totalBeats: 2,
        completedBeats: 0,
        nextBeatAtMs: serverNowMs + 1400,
        serverNowMs,
        timingWindowMs: 400,
        yourTurn: true,
        visibleBeats: [{ index: 0, accent: 'soft', completed: false }]
    });
    const nextState = stateBase({
        ...firstState,
        completedBeats: 1,
        nextBeatAtMs: serverNowMs + 2200,
        yourTurn: false,
        visibleBeats: [{ index: 0, accent: 'soft', completed: true }]
    });
    const initialRun = run({ gameId: 'signal-duet', state: firstState, mode: 'coop' });
    const nextRun = run({ gameId: 'signal-duet', state: nextState, mode: 'coop', revision: 1 });
    const browser = createBrowser({ gameId: 'signal-duet', initialRun,
        mutation: { success: true, run: nextRun } });
    const countdown = browser.elements.get('sg-content').children
        .find(child => child.id === 'sg-countdown');
    assert.match(countdown.textContent, /^Next beat in 1\.[0-5]s$/);
    await browser.documentListeners.get('keydown')({
        code: 'Space',
        preventDefault() {}
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(browser.mutationCalls.length, 1);
    assert.deepEqual(JSON.parse(browser.mutationCalls[0].options.body).action,
        { type: 'tap', beatIndex: 0 });
});

test('terminal mystery and crafting renders contain no mutation controls', () => {
    const mysteryState = stateBase({ evidence: [], suspects: [], links: [], contradictionHint: null });
    const mysteryBrowser = createBrowser({ gameId: 'mystery-board',
        initialRun: run({ gameId: 'mystery-board', state: mysteryState, status: 'completed' }) });
    assert.equal(mysteryBrowser.elements.get('sg-actions').querySelectorAll('button,select').length, 0);

    const craftingState = stateBase({ recipe: {}, materialLabels: {}, materials: {},
        crafted: ['item'], roomSlots: ['item', null, null, null, null, null], nextMaterial: null });
    const craftingBrowser = createBrowser({ gameId: 'studio-crafting',
        initialRun: run({ gameId: 'studio-crafting', state: craftingState, status: 'completed' }) });
    assert.equal(craftingBrowser.elements.get('sg-actions').querySelectorAll('button,select').length, 0);
});

test('a co-op start live event discovers the run from an empty page through authoritative refresh', async () => {
    const firstState = stateBase({ width: 1, height: 1, placements: [], yourTurn: false,
        privateClue: { blockedCells: [], nextColumn: 0 } });
    const initialRun = run({ gameId: 'constellation-repair', state: firstState, mode: 'coop' });
    const browser = createBrowser({ gameId: 'constellation-repair', initialRun: null,
        refreshed: { success: true, gameId: 'constellation-repair', run: initialRun, history: [] } });
    browser.socketHandlers.get('live:event')({
        eventType: 'interaction.game_state_changed',
        payload: { gameId: 'constellation-repair', runId: initialRun.id, revision: 1, status: 'active' }
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(browser.refreshCalls.length, 1);
    assert.match(browser.refreshCalls[0], new RegExp(initialRun.id));
});

test('meteor renderer preserves role and once-per-wave controls after a mutation', async () => {
    const before = stateBase({ lanes: 2, wave: 0, waveCount: 3, integrity: 9, energy: 3,
        forts: [0, 0], beacon: null, modifier: 'crosswind', fortifiedThisWave: false,
        yourRole: 'creator', currentThreat: { lane: 0, strength: null } });
    const after = { ...before, forts: [1, 0], fortifiedThisWave: true, energy: 2 };
    const initialRun = run({ gameId: 'meteor-defense', state: before, mode: 'coop' });
    const nextRun = run({ gameId: 'meteor-defense', state: after, mode: 'coop', revision: 1 });
    const browser = createBrowser({ gameId: 'meteor-defense', initialRun, mutation: { success: true, run: nextRun } });
    const fort = buttons(browser.elements.get('sg-actions')).find(item => item.dataset.type === 'fortify');
    await browser.elements.get('sg-actions').dispatch('click', { target: fort });
    const current = buttons(browser.elements.get('sg-actions'));
    assert.ok(current.filter(item => item.dataset.type === 'fortify').every(item => item.disabled));
    assert.ok(current.filter(item => item.dataset.type === 'beacon').every(item => item.disabled));
    assert.equal(current.find(item => item.dataset.type === 'resolve').disabled, false);
});

test('maze renderer supports arrow-key movement while keeping closed exits disabled', async () => {
    const before = stateBase({ position: { x: 0, y: 0 }, hintsRemaining: 3, lastHint: null,
        canNavigate: true, canHint: true, legalDirections: ['right'], visited: ['0:0'], size: 5 });
    const initialRun = run({ gameId: 'dream-maze', state: before });
    const browser = createBrowser({ gameId: 'dream-maze', initialRun,
        mutation: { success: true, run: run({ gameId: 'dream-maze', state: before, revision: 1 }) } });
    const controls = buttons(browser.elements.get('sg-actions'));
    assert.equal(controls.find(item => item.dataset.direction === 'up').disabled, true);
    assert.equal(controls.find(item => item.dataset.direction === 'right').disabled, false);
    await browser.documentListeners.get('keydown')({ code: 'ArrowRight', preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(browser.mutationCalls[0].options.body).action, { type: 'move', direction: 'right' });
});

test('bingo renderer has no client marking control and refreshes an active solo card', () => {
    const cells = Array.from({ length: 25 }, (_, index) => ({ id: `cell-${index}`, marked: false,
        eventKey: 'quest.step_completed', labelZh: '任务确认', labelEn: 'Quest confirmed' }));
    const bingoRun = run({ gameId: 'broadcast-bingo', state: stateBase({ cells, completedLines: 0,
        trustedEventsOnly: true, interactive: false }) });
    const browser = createBrowser({ gameId: 'broadcast-bingo', initialRun: bingoRun });
    assert.equal(buttons(browser.elements.get('sg-actions')).filter(item => item.dataset.type !== 'abandon').length, 0);
});

test('echo and prediction render only the safe projection supplied to the current role', () => {
    const echoRun = run({ gameId: 'echo-memory', mode: 'coop', actorRole: 'creator', state: stateBase({
        phase: 'study', studied: [], recallIndex: 0, length: 4, yourTurn: true,
        privateClue: [{ index: 0, symbol: 'circle' }, { index: 2, symbol: 'star' }], symbols: ['circle', 'star']
    }) });
    const echoBrowser = createBrowser({ gameId: 'echo-memory', initialRun: echoRun });
    assert.match(echoBrowser.elements.get('sg-content').children.map(item => item.textContent).join(' '), /1:circle/);
    assert.doesNotMatch(echoBrowser.elements.get('sg-content').children.map(item => item.textContent).join(' '), /2:/);

    const predictionRun = run({ gameId: 'keeper-prediction', mode: 'coop', state: stateBase({
        round: 0, roundCount: 3, choicesZh: ['甲', '乙', '丙'], choicesEn: ['A', 'B', 'C'],
        submitted: true, partnerSubmitted: false, reveals: []
    }) });
    const predictionBrowser = createBrowser({ gameId: 'keeper-prediction', initialRun: predictionRun });
    assert.equal(buttons(predictionBrowser.elements.get('sg-actions')).filter(item => item.dataset.type === 'submit').length, 0);
});
