'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { source } = require('./helpers/phase9-dom');

const gameFiles = Object.freeze({
    'constellation-repair': 'public/js/games/constellation-repair.js',
    'signal-duet': 'public/js/games/signal-duet.js',
    'mystery-board': 'public/js/games/mystery-board.js',
    'story-weaver': 'public/js/games/story-weaver.js',
    'studio-crafting': 'public/js/games/studio-crafting.js',
    'meteor-defense': 'public/js/games/meteor-defense.js',
    'dream-maze': 'public/js/games/dream-maze.js',
    'broadcast-bingo': 'public/js/games/broadcast-bingo.js',
    'echo-memory': 'public/js/games/echo-memory.js',
    'keeper-prediction': 'public/js/games/keeper-prediction.js'
});

function definition(gameId) {
    let captured = null;
    const context = {
        window: {
            StreamerGameExperience: {
                register(value) {
                    captured = value;
                    return true;
                }
            }
        },
        Object,
        Array,
        String,
        Number,
        Math,
        JSON
    };
    vm.runInNewContext(source(gameFiles[gameId]), context, { filename: gameFiles[gameId] });
    assert.ok(captured, `${gameId} must register an experience`);
    return captured;
}

function keyboard() {
    const context = { window: {}, globalThis: {} };
    vm.runInNewContext(source('public/js/streamer-game-ui-state.js'), context);
    return context.window.StreamerGameUIState;
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertCommonContract(gameId, item) {
    assert.equal(item.gameId, gameId);
    assert.ok(item.titleZh.length >= 4);
    assert.ok(item.titleEn.length >= 8);
    assert.ok(item.summary.zh.length >= 20);
    assert.ok(item.summary.en.length >= 40);
    assert.ok(item.instructions.length >= 4);
    assert.ok(item.shortcuts.length >= 3);
    assert.ok(item.boundary.zh.length >= 20);
    assert.ok(item.boundary.en.length >= 40);
    assert.equal(typeof item.describeState, 'function');
    assert.equal(typeof item.metrics, 'function');
    for (const instruction of item.instructions) {
        assert.ok(instruction.zh.length >= 15, `${gameId} zh instruction`);
        assert.ok(instruction.en.length >= 25, `${gameId} en instruction`);
    }
    for (const shortcut of item.shortcuts) {
        assert.ok(shortcut.key.zh);
        assert.ok(shortcut.key.en);
        assert.ok(shortcut.description.zh.length >= 8);
        assert.ok(shortcut.description.en.length >= 12);
    }
}

test('all ten game experience modules register complete, distinct, bilingual contracts', () => {
    const titlesZh = new Set();
    const titlesEn = new Set();
    const summariesZh = new Set();
    const summariesEn = new Set();
    for (const gameId of Object.keys(gameFiles)) {
        const item = definition(gameId);
        assertCommonContract(gameId, item);
        titlesZh.add(item.titleZh);
        titlesEn.add(item.titleEn);
        summariesZh.add(item.summary.zh);
        summariesEn.add(item.summary.en);
    }
    assert.equal(titlesZh.size, 10);
    assert.equal(titlesEn.size, 10);
    assert.equal(summariesZh.size, 10);
    assert.equal(summariesEn.size, 10);
});

test('all game guides avoid claiming unsupported arrow-key focus behavior', () => {
    for (const gameId of ['constellation-repair', 'echo-memory', 'keeper-prediction']) {
        const item = definition(gameId);
        const keys = item.shortcuts.map(shortcut => shortcut.key.en).join(' ');
        assert.doesNotMatch(keys, /Arrow keys/i, gameId);
        assert.match(keys, /Tab/i, gameId);
    }
});

test('signal guide documents only implemented Space and focus-based recovery controls', () => {
    const item = definition('signal-duet');
    const keys = item.shortcuts.map(shortcut => shortcut.key.en).join(' | ');
    assert.match(keys, /Space/);
    assert.match(keys, /Tab/);
    assert.match(keys, /Enter \(Recovery button\)/);
    assert.doesNotMatch(keys, /R \(Recovery/);
});

test('constellation summary exposes progress and turn without solution or partner clue', () => {
    const item = definition('constellation-repair');
    const state = {
        placements: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        yourTurn: false,
        destination: { x: 3, y: 4 },
        turnsRemaining: 2,
        width: 5,
        height: 6,
        hiddenSolution: ['0:0', '1:0', '2:0'],
        partnerClue: { forbiddenRow: 2 }
    };
    const english = item.describeState(state, 'en');
    const chinese = item.describeState(state, 'zh');
    assert.match(english, /2 cells/);
    assert.match(english, /Waiting for your partner/);
    assert.match(english, /4,5/);
    assert.match(chinese, /线路已铺设 2 格/);
    assert.doesNotMatch(english, /hiddenSolution|forbiddenRow|2:0/);
    assert.deepEqual(plain(item.metrics(state, 'en')), [
        ['Cells placed', '2'],
        ['Turns remaining', '2'],
        ['Board', '5 × 6'],
        ['Actor', 'Partner']
    ]);
});

test('signal summary uses visible beat count and never serializes server epochs', () => {
    const item = definition('signal-duet');
    const state = {
        completedBeats: 3,
        visibleBeats: [{}, {}, {}, {}, {}],
        yourTurn: true,
        bpm: 96,
        timingWindowMs: 360,
        nextBeatAtMs: 999999999,
        serverNowMs: 888888888
    };
    assert.equal(item.describeState(state, 'en'), '3/5 beats are complete; the timing window belongs to you.');
    const rendered = JSON.stringify(item.metrics(state, 'en'));
    assert.match(rendered, /96 BPM/);
    assert.match(rendered, /360 ms/);
    assert.doesNotMatch(rendered, /999999999|888888888/);
});

test('mystery summary reports only visible clue, link, and budget counts', () => {
    const item = definition('mystery-board');
    const state = {
        evidence: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        links: ['a:b'],
        linksRemaining: 2,
        suspects: [{ nameEn: 'Lark' }, { nameEn: 'Moth' }],
        culpritIndex: 1,
        solutionLinks: ['a:c']
    };
    const description = item.describeState(state, 'en');
    assert.match(description, /3 clues/);
    assert.match(description, /1 current links/);
    assert.match(description, /2 links remaining/);
    assert.doesNotMatch(description, /Moth|a:c|culprit/);
    assert.deepEqual(plain(item.metrics(state, 'en')), [
        ['Clues', '3'],
        ['Current links', '1'],
        ['Budget left', '2'],
        ['Suspects', '2']
    ]);
});

test('story weaver summary distinguishes asynchronous partner turn and visible hand', () => {
    const item = definition('story-weaver');
    const state = {
        passages: [{ id: 'one' }, { id: 'two' }],
        hand: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        yourTurn: false,
        branchLabel: 'Lantern route',
        turn: 4,
        futurePassages: [{ secret: true }]
    };
    assert.equal(item.describeState(state, 'en'), 'The story has 2 passages and your hand has 3 cards. Your partner is writing.');
    const metrics = plain(item.metrics(state, 'en'));
    assert.deepEqual(metrics, [
        ['Passages', '2'],
        ['Cards available', '3'],
        ['Current branch', 'Lantern route'],
        ['Turn', '4']
    ]);
    assert.doesNotMatch(JSON.stringify(metrics), /futurePassages|secret/);
});

test('crafting summary follows gather then decorate lifecycle', () => {
    const item = definition('studio-crafting');
    const gathering = {
        challengeId: 'moon-lamp',
        materials: { paper: 1, light: 0 },
        recipe: { paper: 2, light: 1 },
        crafted: [],
        nextMaterial: 'paper'
    };
    assert.equal(item.describeState(gathering, 'en'), '1 materials are gathered; next is paper.');
    assert.equal(plain(item.metrics(gathering, 'en'))[2][1], 'Gathering');
    const decorating = {
        ...gathering,
        materials: { paper: 2, light: 1 },
        crafted: ['moon-lamp'],
        nextMaterial: null
    };
    assert.equal(item.describeState(decorating, 'en'), 'The item is crafted and awaits a room slot.');
    assert.equal(plain(item.metrics(decorating, 'en'))[2][1], 'Crafted');
});

test('meteor summary clearly identifies creator main-defense role', () => {
    const item = definition('meteor-defense');
    const state = {
        wave: 1,
        waveCount: 5,
        integrity: 8,
        energy: 3,
        yourRole: 'creator',
        fortifiedThisWave: false,
        beacon: null,
        futureThreats: [{ lane: 2, strength: 9 }]
    };
    assert.equal(item.describeState(state, 'en'), 'Wave 2/5, integrity 8; you hold the main defense.');
    const metrics = plain(item.metrics(state, 'en'));
    assert.deepEqual(metrics, [
        ['Integrity', '8'],
        ['Energy', '3'],
        ['Wave', '2/5'],
        ['Action used', 'No']
    ]);
    assert.doesNotMatch(JSON.stringify(metrics), /futureThreats|strength/);
});

test('meteor summary clearly identifies owner support role without relationship impact', () => {
    const item = definition('meteor-defense');
    const state = {
        wave: 0,
        waveCount: 3,
        integrity: 10,
        energy: 2,
        yourRole: 'owner',
        fortifiedThisWave: false,
        beacon: 1
    };
    assert.equal(item.describeState(state, 'en'), 'Wave 1/3, integrity 10; you hold the support role.');
    assert.equal(plain(item.metrics(state, 'en'))[3][1], 'Yes');
    assert.match(item.summary.en, /owner places support beacons/i);
    assert.doesNotMatch(item.summary.en, /relationship|affinity|penalty/i);
});

test('maze summary exposes local exits but not perfect-maze graph or answer path', () => {
    const item = definition('dream-maze');
    const state = {
        position: { x: 2, y: 4 },
        legalDirections: ['left', 'down'],
        hintsRemaining: 1,
        steps: 7,
        dailyLabel: '2026-08-17',
        walls: { secret: true },
        solution: ['up', 'right']
    };
    assert.equal(item.describeState(state, 'en'), 'Position 3,5 has 2 local exits and 1 hints remain.');
    const metrics = plain(item.metrics(state, 'en'));
    assert.equal(metrics[0][1], '7');
    assert.equal(metrics[1][1], '2');
    assert.equal(metrics[2][1], '1');
    assert.doesNotMatch(JSON.stringify(metrics), /walls|solution|up|right/);
});

test('bingo summary is read-only and names trusted service input', () => {
    const item = definition('broadcast-bingo');
    const cells = Array.from({ length: 25 }, (_, index) => ({ marked: index < 6 }));
    const state = { cells, completedLines: 1, sourceEvents: ['provider:secret'] };
    assert.equal(item.describeState(state, 'en'), '6/25 cells are confirmed, completing 1 lines.');
    const metrics = plain(item.metrics(state, 'en'));
    assert.equal(metrics[0][1], '6');
    assert.equal(metrics[3][1], 'Trusted service event');
    assert.doesNotMatch(JSON.stringify(metrics), /provider:secret/);
    assert.match(item.boundary.en, /browser has no mark command/i);
});

test('echo summary reports only own clue count and aggregate progress', () => {
    const item = definition('echo-memory');
    const state = {
        phase: 'study',
        recallIndex: 0,
        length: 8,
        privateClue: [{ index: 0, symbol: '△' }, { index: 2, symbol: '○' }],
        yourTurn: true,
        partnerClue: [{ index: 1, symbol: '□' }],
        answer: ['△', '□', '○']
    };
    assert.match(item.describeState(state, 'en'), /studying a private fragment/);
    assert.match(item.describeState(state, 'en'), /You may act/);
    const metrics = plain(item.metrics(state, 'en'));
    assert.equal(metrics[2][1], '2');
    assert.doesNotMatch(JSON.stringify(metrics), /partnerClue|answer|□/);
});

test('prediction summary uses fictional round state and sealed status only', () => {
    const item = definition('keeper-prediction');
    const state = {
        round: 1,
        roundCount: 4,
        submitted: true,
        choicesEn: ['Cloud stair', 'Moon ferry', 'Lantern tram'],
        reveals: [{ points: 1 }],
        partnerChoice: 2,
        partnerPrediction: 0
    };
    assert.equal(item.describeState(state, 'en'), 'Round 2/4 is sealed and awaiting a safe reveal.');
    const metrics = plain(item.metrics(state, 'en'));
    assert.deepEqual(metrics, [
        ['Current round', '2/4'],
        ['Revealed rounds', '1'],
        ['Alignment points', '1'],
        ['Submission', 'Sealed']
    ]);
    assert.doesNotMatch(JSON.stringify(metrics), /partnerChoice|partnerPrediction/);
});

test('signal Space submits exactly the server-visible current beat on creator turn', () => {
    const ui = keyboard();
    const action = ui.keyboardAction('signal-duet', {
        yourTurn: true,
        completedBeats: 4,
        nextBeatAtMs: 999999,
        serverNowMs: 888888
    }, 'Space');
    assert.deepEqual(plain(action), { type: 'tap', beatIndex: 4 });
});

test('signal Space is ignored while waiting for the partner', () => {
    const ui = keyboard();
    assert.equal(ui.keyboardAction('signal-duet', {
        yourTurn: false,
        completedBeats: 4
    }, 'Space'), null);
});

test('maze arrow submits only a currently legal local direction', () => {
    const ui = keyboard();
    const state = {
        canNavigate: true,
        legalDirections: ['left', 'down'],
        canHint: false,
        hintsRemaining: 0
    };
    assert.deepEqual(plain(ui.keyboardAction('dream-maze', state, 'ArrowLeft')), {
        type: 'move',
        direction: 'left'
    });
    assert.equal(ui.keyboardAction('dream-maze', state, 'ArrowRight'), null);
});

test('maze movement is disabled for owner hint-only role', () => {
    const ui = keyboard();
    const state = {
        canNavigate: false,
        legalDirections: ['left'],
        canHint: true,
        hintsRemaining: 1
    };
    assert.equal(ui.keyboardAction('dream-maze', state, 'ArrowLeft'), null);
    assert.deepEqual(plain(ui.keyboardAction('dream-maze', state, 'KeyH')), {
        type: 'hint'
    });
});

test('maze H refuses to overspend hints', () => {
    const ui = keyboard();
    assert.equal(ui.keyboardAction('dream-maze', {
        canNavigate: false,
        canHint: true,
        hintsRemaining: 0
    }, 'KeyH'), null);
});

test('story weaver number chooses only an existing hand card', () => {
    const ui = keyboard();
    const state = {
        hand: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        yourTurn: true
    };
    assert.deepEqual(plain(ui.keyboardAction('story-weaver', state, 'Digit1')), {
        type: 'choose',
        cardIndex: 0
    });
    assert.deepEqual(plain(ui.keyboardAction('story-weaver', state, 'Digit3')), {
        type: 'choose',
        cardIndex: 2
    });
    assert.equal(ui.keyboardAction('story-weaver', state, 'Digit4'), null);
});

test('story weaver number cannot act during partner turn', () => {
    const ui = keyboard();
    assert.equal(ui.keyboardAction('story-weaver', {
        hand: [{ id: 'a' }],
        yourTurn: false
    }, 'Digit1'), null);
});

test('craft G gathers only the authoritative next material', () => {
    const ui = keyboard();
    assert.deepEqual(plain(ui.keyboardAction('studio-crafting', {
        nextMaterial: 'soft-light',
        materials: {},
        recipe: { 'soft-light': 1 },
        crafted: [],
        challengeId: 'lamp'
    }, 'KeyG')), {
        type: 'gather',
        material: 'soft-light'
    });
    assert.equal(ui.keyboardAction('studio-crafting', {
        nextMaterial: null
    }, 'KeyG'), null);
});

test('craft C checks the server-projected recipe before submitting', () => {
    const ui = keyboard();
    const state = {
        recipe: { paper: 2, light: 1 },
        materials: { paper: 2, light: 1 },
        crafted: [],
        challengeId: 'lamp'
    };
    assert.deepEqual(plain(ui.keyboardAction('studio-crafting', state, 'KeyC')), {
        type: 'craft'
    });
    assert.equal(ui.keyboardAction('studio-crafting', {
        ...state,
        materials: { paper: 1, light: 1 }
    }, 'KeyC'), null);
    assert.equal(ui.keyboardAction('studio-crafting', {
        ...state,
        crafted: ['lamp']
    }, 'KeyC'), null);
});

test('craft digit placement is enabled only after the item is crafted', () => {
    const ui = keyboard();
    const state = {
        recipe: {},
        materials: {},
        crafted: ['lamp'],
        challengeId: 'lamp'
    };
    assert.deepEqual(plain(ui.keyboardAction('studio-crafting', state, 'Digit1')), {
        type: 'place',
        slot: 0
    });
    assert.deepEqual(plain(ui.keyboardAction('studio-crafting', state, 'Digit6')), {
        type: 'place',
        slot: 5
    });
    assert.equal(ui.keyboardAction('studio-crafting', {
        ...state,
        crafted: []
    }, 'Digit1'), null);
});

test('echo M is accepted only for own study turn', () => {
    const ui = keyboard();
    assert.deepEqual(plain(ui.keyboardAction('echo-memory', {
        phase: 'study',
        yourTurn: true
    }, 'KeyM')), { type: 'study' });
    assert.equal(ui.keyboardAction('echo-memory', {
        phase: 'study',
        yourTurn: false
    }, 'KeyM'), null);
    assert.equal(ui.keyboardAction('echo-memory', {
        phase: 'echo',
        yourTurn: true
    }, 'KeyM'), null);
});

test('meteor number maps creator to fortify with lane bound', () => {
    const ui = keyboard();
    const state = {
        lanes: 3,
        yourRole: 'creator',
        fortifiedThisWave: false,
        energy: 2,
        beacon: null
    };
    assert.deepEqual(plain(ui.keyboardAction('meteor-defense', state, 'Digit2')), {
        type: 'fortify',
        lane: 1
    });
    assert.equal(ui.keyboardAction('meteor-defense', state, 'Digit4'), null);
});

test('meteor number maps owner to one beacon and respects phase state', () => {
    const ui = keyboard();
    const state = {
        lanes: 4,
        yourRole: 'owner',
        fortifiedThisWave: false,
        energy: 1,
        beacon: null
    };
    assert.deepEqual(plain(ui.keyboardAction('meteor-defense', state, 'Digit4')), {
        type: 'beacon',
        lane: 3
    });
    assert.equal(ui.keyboardAction('meteor-defense', {
        ...state,
        beacon: 0
    }, 'Digit2'), null);
    assert.equal(ui.keyboardAction('meteor-defense', {
        ...state,
        energy: 0
    }, 'Digit2'), null);
});

test('meteor R resolve remains unavailable to owner support role', () => {
    const ui = keyboard();
    assert.deepEqual(plain(ui.keyboardAction('meteor-defense', {
        yourRole: 'creator'
    }, 'KeyR')), { type: 'resolve' });
    assert.equal(ui.keyboardAction('meteor-defense', {
        yourRole: 'owner'
    }, 'KeyR'), null);
});

test('busy gate is single-flight and releases only after end', () => {
    const ui = keyboard();
    const gate = ui.createBusyGate();
    assert.equal(gate.active(), false);
    assert.equal(gate.begin(), true);
    assert.equal(gate.active(), true);
    assert.equal(gate.begin(), false);
    assert.equal(gate.active(), true);
    gate.end();
    assert.equal(gate.active(), false);
    assert.equal(gate.begin(), true);
});

test('countdown helper clamps late, invalid, and negative client elapsed values safely', () => {
    const ui = keyboard();
    assert.equal(ui.countdownRemaining(2000, 1000, 200), 800);
    assert.equal(ui.countdownRemaining(1000, 2000, 0), 0);
    assert.equal(ui.countdownRemaining('invalid', 2000, 0), 0);
    assert.equal(ui.countdownRemaining(2000, 1000, -100), 1100);
});

test('streamer game view loads runtime, experience framework, then selected allowlisted module', () => {
    const html = source('views/streamer-game.ejs');
    const runtime = html.indexOf('/js/streamer-game.js');
    const framework = html.indexOf('/js/games/game-experience.js');
    const module = html.indexOf('/js/games/<%= gameId %>.js');
    assert.ok(runtime > 0);
    assert.ok(framework > runtime);
    assert.ok(module > framework);
    assert.match(html, /\/game-experience\.css/);
});

test('game experience framework exposes help, history, recovery and no hidden state serialization', () => {
    const script = source('public/js/games/game-experience.js');
    assert.match(script, /\['help', 'history', 'recovery'\]/);
    assert.match(script, /Load authoritative snapshot/);
    assert.match(script, /REST snapshot \+ bounded realtime hints/);
    assert.doesNotMatch(script, /innerHTML\s*=/);
    assert.doesNotMatch(script, /solution|culpritIndex|partnerClue|answerSequence/);
});

test('game experience CSS includes mobile, coarse pointer, and reduced motion contracts', () => {
    const css = source('public/game-experience.css');
    assert.match(css, /@media \(max-width:/);
    assert.match(css, /@media \(pointer: coarse\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /min-block-size/);
    assert.doesNotMatch(css, /outline:\s*none/);
});

test('provider and balance send boundaries remain absent from every browser game module', () => {
    for (const [gameId, file] of Object.entries(gameFiles)) {
        const script = source(file);
        assert.doesNotMatch(script, /BalanceLogger|giftProvider|delivery_outbox|enqueueWishInventorySend/i, gameId);
        assert.doesNotMatch(script, /fetch\s*\(/, gameId);
        assert.doesNotMatch(script, /innerHTML\s*=/, gameId);
    }
});

test('each game guide has a different safety boundary rather than shared filler', () => {
    const boundariesZh = [];
    const boundariesEn = [];
    for (const gameId of Object.keys(gameFiles)) {
        const item = definition(gameId);
        boundariesZh.push(item.boundary.zh);
        boundariesEn.push(item.boundary.en);
    }
    assert.equal(new Set(boundariesZh).size, 10);
    assert.equal(new Set(boundariesEn).size, 10);
    assert.equal(boundariesZh.some(value => /浏览器没有“标记”命令/.test(value)), true);
    assert.equal(boundariesEn.some(value => /real-user profiles/.test(value)), true);
});
