'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const UI_PATH = path.resolve(__dirname, '../public/js/doudizhu.js');
const UI_SOURCE = fs.readFileSync(UI_PATH, 'utf8');
const GAME_ID = '11111111-1111-4111-8111-111111111111';

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    replace(values) {
        this.values = new Set(values);
    }

    add(...names) {
        for (const name of names) this.values.add(name);
    }

    remove(...names) {
        for (const name of names) this.values.delete(name);
    }

    toggle(name, force) {
        const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
        if (enabled) this.values.add(name);
        else this.values.delete(name);
        return enabled;
    }

    contains(name) {
        return this.values.has(name);
    }

    toString() {
        return [...this.values].join(' ');
    }
}

class FakeNode {
    constructor(tagName = 'div', id = '') {
        this.tagName = String(tagName).toUpperCase();
        this.id = id;
        this.dataset = {};
        this.children = [];
        this.listeners = new Map();
        this.classList = new FakeClassList();
        this.attributes = new Map();
        this.disabled = false;
        this.hidden = false;
        this.textContent = '';
        this.scrollLeft = 0;
        this.scrollTop = 0;
        this.scrollHeight = 0;
    }

    set className(value) {
        this.classList.replace(String(value).split(/\s+/).filter(Boolean));
    }

    get className() {
        return this.classList.toString();
    }

    append(...nodes) {
        for (const node of nodes) this.appendChild(node);
    }

    appendChild(node) {
        this.children.push(node);
        return node;
    }

    replaceChildren(...nodes) {
        this.children = [];
        this.append(...nodes);
    }

    setAttribute(name, value) {
        this.attributes.set(String(name), String(value));
    }

    getAttribute(name) {
        return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    async click() {
        if (this.disabled) return false;
        for (const listener of this.listeners.get('click') || []) {
            await listener.call(this, { currentTarget: this, target: this });
        }
        return true;
    }

    matches(selector) {
        if (selector === 'strong') return this.tagName === 'STRONG';
        if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
        if (selector === '[data-bid]') return Object.hasOwn(this.dataset, 'bid');
        return false;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const matches = [];
        const visit = (node) => {
            for (const child of node.children) {
                if (child.matches(selector)) matches.push(child);
                visit(child);
            }
        };
        visit(this);
        return matches;
    }
}

function createDom() {
    const elements = new Map();
    const buttonIds = new Set([
        'startDoudizhuBtn',
        'outcomeRestartBtn',
        'hintBtn',
        'passBtn',
        'playBtn'
    ]);
    const ids = [
        'startDoudizhuBtn',
        'outcomeRestartBtn',
        'statusText',
        'dealNumber',
        'humanRole',
        'contractBid',
        'multiplier',
        'opponentLeft',
        'opponentRight',
        'selfSeat',
        'bottomLabel',
        'bottomCards',
        'turnIndicator',
        'trickLabel',
        'lastPlay',
        'combinationLabel',
        'bidControls',
        'playControls',
        'hintBtn',
        'passBtn',
        'playBtn',
        'selectionStatus',
        'humanHand',
        'outcomePanel',
        'outcomeTitle',
        'outcomeSummary',
        'eventLog'
    ];

    for (const id of ids) {
        elements.set(id, new FakeNode(buttonIds.has(id) ? 'button' : 'div', id));
    }

    for (const seatId of ['opponentLeft', 'opponentRight', 'selfSeat']) {
        for (const className of ['ddz-seat-name', 'ddz-role', 'ddz-card-count']) {
            const child = new FakeNode('span');
            child.className = className;
            elements.get(seatId).appendChild(child);
        }
    }

    elements.get('turnIndicator').appendChild(new FakeNode('strong'));
    for (let bid = 0; bid <= 3; bid += 1) {
        const button = new FakeNode('button');
        button.dataset.bid = String(bid);
        elements.get('bidControls').appendChild(button);
    }

    const body = new FakeNode('body');
    body.dataset.csrfToken = 'csrf-token';
    body.dataset.username = 'alice';

    return {
        elements,
        document: {
            body,
            documentElement: { lang: 'zh-CN' },
            createElement(tagName) {
                return new FakeNode(tagName);
            },
            getElementById(id) {
                return elements.get(id) || null;
            }
        }
    };
}

function createPlayableState(overrides = {}) {
    return {
        gameId: GAME_ID,
        phase: 'playing',
        revision: 1,
        dealNumber: 1,
        humanSeat: 0,
        turnSeat: 0,
        firstBidder: 0,
        landlordSeat: 0,
        contractBid: 3,
        multiplier: 1,
        markerCard: { id: 'D5', rank: '5', suit: 'D', color: 'red', label: '♦5' },
        bottomCards: [],
        hand: [
            { id: 'S3', rank: '3', suit: 'S', color: 'black', label: '♠3' },
            { id: 'H4', rank: '4', suit: 'H', color: 'red', label: '♥4' }
        ],
        seats: [
            { seat: 0, kind: 'human', role: 'landlord', isViewer: true, cardCount: 2 },
            { seat: 1, kind: 'bot', role: 'farmer', isViewer: false, cardCount: 17 },
            { seat: 2, kind: 'bot', role: 'farmer', isViewer: false, cardCount: 17 }
        ],
        bidding: { highestBid: 3, highestBidder: 0, actions: [], legalBids: [] },
        trick: { lastMove: null, lastPlayerSeat: null, passCount: 0 },
        history: [],
        legal: { canAct: true, canPass: false, mustLead: true, legalBids: [] },
        outcome: null,
        ...overrides
    };
}

function createResponse(body, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        async json() {
            return body;
        }
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

async function flushAsyncWork() {
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    await Promise.resolve();
}

async function bootUi({ state = null, post }) {
    const { document, elements } = createDom();
    const requests = [];
    const errors = [];
    const window = {
        confirm() {
            return true;
        },
        async idempotentFetch(requestPath, options) {
            requests.push({ path: requestPath, options });
            return post(requestPath, options);
        }
    };
    const sandbox = {
        console: {
            error(...args) {
                errors.push(args);
            }
        },
        decodeURIComponent,
        document,
        encodeURIComponent,
        fetch: async (requestPath, options) => {
            requests.push({ path: requestPath, options });
            return createResponse({ success: true, state });
        },
        window
    };

    vm.createContext(sandbox);
    vm.runInContext(UI_SOURCE, sandbox, { filename: UI_PATH });
    await flushAsyncWork();

    return { elements, errors, requests };
}

function postRequests(harness, requestPath) {
    return harness.requests.filter((request) => request.path === requestPath);
}

test('a successful start POST unlocks the rendered hand without requiring Hint', async () => {
    const request = deferred();
    const harness = await bootUi({
        post(requestPath) {
            assert.equal(requestPath, '/api/doudizhu/start');
            return request.promise;
        }
    });
    const start = harness.elements.get('startDoudizhuBtn');
    const hand = harness.elements.get('humanHand');
    const play = harness.elements.get('playBtn');

    const startClick = start.click();
    await flushAsyncWork();
    assert.equal(start.disabled, true, 'the start control is disabled while its POST is pending');

    request.resolve(createResponse({ success: true, state: createPlayableState() }));
    await startClick;
    await flushAsyncWork();

    assert.equal(postRequests(harness, '/api/doudizhu/start').length, 1);
    assert.equal(postRequests(harness, '/api/doudizhu/hint').length, 0);
    assert.equal(hand.children.length, 2);
    assert.equal(hand.children.every((card) => card.disabled === false), true);
    assert.equal(play.disabled, true, 'Play remains disabled until the user selects a card');

    assert.equal(await hand.children[0].click(), true);
    const selected = hand.children.find((card) => card.getAttribute('aria-pressed') === 'true');
    assert.ok(selected, 'clicking an unlocked card selects it');
    assert.equal(selected.classList.contains('is-selected'), true);
    assert.equal(play.disabled, false, 'selecting a card enables Play');
    assert.match(harness.elements.get('selectionStatus').textContent, /已选 1 张牌/);
    assert.equal(postRequests(harness, '/api/doudizhu/hint').length, 0);

    assert.equal(await selected.click(), true);
    assert.equal(hand.children.some((card) => card.getAttribute('aria-pressed') === 'true'), false);
    assert.equal(play.disabled, true);
});

test('a failed play POST restores card interaction and preserves the pending selection', async () => {
    const request = deferred();
    const harness = await bootUi({
        state: createPlayableState(),
        post(requestPath) {
            assert.equal(requestPath, '/api/doudizhu/action');
            return request.promise;
        }
    });
    const hand = harness.elements.get('humanHand');
    const play = harness.elements.get('playBtn');

    await hand.children[0].click();
    assert.equal(play.disabled, false);
    assert.equal(await play.click(), true);
    assert.equal(hand.children.every((card) => card.disabled === true), true,
        'cards are disabled while the action is in flight');

    request.reject(new Error('simulated network failure'));
    await flushAsyncWork();

    assert.equal(postRequests(harness, '/api/doudizhu/action').length, 1);
    assert.equal(postRequests(harness, '/api/doudizhu/hint').length, 0);
    assert.equal(hand.children.every((card) => card.disabled === false), true,
        'cards are unlocked again when the request settles');
    const selected = hand.children.find((card) => card.getAttribute('aria-pressed') === 'true');
    assert.ok(selected, 'the user can retry the same selection after a network failure');
    assert.equal(selected.classList.contains('is-selected'), true);
    assert.equal(play.disabled, false);
    assert.equal(harness.elements.get('statusText').classList.contains('is-error'), true);

    assert.equal(await selected.click(), true);
    assert.equal(play.disabled, true, 'the recovered hand remains interactive');
});
