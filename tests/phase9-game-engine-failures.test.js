'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const batchOne = require('../content/streamer-world/games/batch-one');
const batchTwo = require('../content/streamer-world/games/batch-two');
const constellation = require('../domain/constellation-repair/engine');
const signal = require('../domain/signal-duet/engine');
const mystery = require('../domain/mystery-board/engine');
const weaver = require('../domain/story-weaver/engine');
const crafting = require('../domain/studio-crafting/engine');
const meteor = require('../domain/meteor-defense/engine');
const maze = require('../domain/dream-maze/engine');
const bingo = require('../domain/broadcast-bingo/engine');
const echo = require('../domain/echo-memory/engine');
const prediction = require('../domain/keeper-prediction/engine');
const shared = require('../domain/streamer-games/shared');

const DIFFICULTIES = ['gentle', 'standard', 'expert'];

function clone(value) {
    return structuredClone(value);
}

function challenge(pack) {
    return pack.challenges[0];
}

function common(pack, overrides = {}) {
    return {
        challengeId: challenge(pack).id,
        difficulty: 'standard',
        mode: 'solo',
        ...overrides
    };
}

function signalState(overrides = {}) {
    return signal.createState({
        ...common(batchOne['signal-duet']),
        serverStartedAtMs: 1_700_000_000_000,
        ...overrides
    });
}

function mazeState(overrides = {}) {
    return maze.createState({
        ...common(batchTwo['dream-maze']),
        creatorUsername: 'creator',
        serverDateKey: '2026-08-17',
        ...overrides
    });
}

test('shared setup accepts only the three closed difficulty values', () => {
    for (const difficulty of DIFFICULTIES) {
        const value = shared.baseState('test-game', { id: 'test-challenge' }, difficulty, 'solo');
        assert.equal(value.difficulty, difficulty);
        assert.equal(value.mode, 'solo');
        assert.equal(value.status, 'active');
    }
    assert.throws(() => shared.baseState('test-game', { id: 'test-challenge' }, 'normal', 'solo'), /Invalid game setup/);
    assert.throws(() => shared.baseState('test-game', { id: 'test-challenge' }, '', 'solo'), /Invalid game setup/);
    assert.throws(() => shared.baseState('test-game', { id: 'test-challenge' }, null, 'solo'), /Invalid game setup/);
});

test('shared setup accepts only solo and cooperative modes', () => {
    for (const mode of ['solo', 'coop']) {
        const value = shared.baseState('test-game', { id: 'test-challenge' }, 'gentle', mode);
        assert.equal(value.mode, mode);
        assert.equal(value.schemaVersion, 1);
        assert.deepEqual(value.history, []);
    }
    assert.throws(() => shared.baseState('test-game', { id: 'test-challenge' }, 'gentle', 'team'), /Invalid game setup/);
    assert.throws(() => shared.baseState('test-game', { id: 'test-challenge' }, 'gentle', 'owner'), /Invalid game setup/);
});

test('shared action validator rejects arrays, null, primitives, and unknown keys', () => {
    assert.throws(() => shared.assertKeys(null, ['type'], 'action'), /Invalid action/);
    assert.throws(() => shared.assertKeys([], ['type'], 'action'), /Invalid action/);
    assert.throws(() => shared.assertKeys('type', ['type'], 'action'), /Invalid action/);
    assert.throws(() => shared.assertKeys({ type: 'ok', hiddenState: {} }, ['type'], 'action'), /Unexpected action field: hiddenState/);
    assert.deepEqual(shared.assertKeys({ type: 'ok' }, ['type'], 'action'), { type: 'ok' });
});

test('shared safe integer rejects coercion and unsafe values', () => {
    assert.equal(shared.safeInteger(3, 0, 5, 'index'), 3);
    assert.throws(() => shared.safeInteger('3', 0, 5, 'index'), /Invalid index/);
    assert.throws(() => shared.safeInteger(3.5, 0, 5, 'index'), /Invalid index/);
    assert.throws(() => shared.safeInteger(-1, 0, 5, 'index'), /Invalid index/);
    assert.throws(() => shared.safeInteger(6, 0, 5, 'index'), /Invalid index/);
    assert.throws(() => shared.safeInteger(Number.MAX_SAFE_INTEGER + 1, 0, Number.MAX_SAFE_INTEGER, 'index'), /Invalid index/);
});

test('shared token validator is closed and does not coerce objects', () => {
    const pattern = /^[a-z][a-z0-9-]{2,20}$/;
    assert.equal(shared.token('safe-token', pattern, 'token'), 'safe-token');
    assert.throws(() => shared.token('../unsafe', pattern, 'token'), /Invalid token/);
    assert.throws(() => shared.token({ toString: () => 'safe-token' }, pattern, 'token'), /Invalid token/);
    assert.throws(() => shared.token('UPPER', pattern, 'token'), /Invalid token/);
});

test('shared deterministic generator replays the same bounded sequence', () => {
    const first = shared.seeded(12345);
    const second = shared.seeded(12345);
    const left = Array.from({ length: 40 }, () => first());
    const right = Array.from({ length: 40 }, () => second());
    assert.deepEqual(left, right);
    assert.ok(left.every(value => value >= 0));
    assert.ok(left.every(value => value < 1));
    assert.ok(new Set(left).size > 30);
});

test('shared history stays bounded and preserves newest ordered events', () => {
    let state = { history: [] };
    for (let index = 0; index < 120; index += 1) {
        state = { history: shared.appendHistory(state, { index }) };
    }
    assert.equal(state.history.length, 80);
    assert.equal(state.history[0].index, 40);
    assert.equal(state.history.at(-1).index, 119);
    assert.deepEqual(state.history.map(item => item.index), Array.from({ length: 80 }, (_, index) => index + 40));
});

test('all ten engines reject unknown challenge identifiers', () => {
    const cases = [
        () => constellation.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' }),
        () => signal.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo', serverStartedAtMs: 1 }),
        () => mystery.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' }),
        () => weaver.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' }),
        () => crafting.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' }),
        () => meteor.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' }),
        () => maze.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo', creatorUsername: 'creator', serverDateKey: '2026-08-17' }),
        () => bingo.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' }),
        () => echo.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' }),
        () => prediction.createState({ challengeId: 'unknown', difficulty: 'gentle', mode: 'solo' })
    ];
    for (const create of cases) assert.throws(create, /Unknown/);
});

test('all ten engines reject an unregistered difficulty', () => {
    const cases = [
        () => constellation.createState(common(batchOne['constellation-repair'], { difficulty: 'nightmare' })),
        () => signalState({ difficulty: 'nightmare' }),
        () => mystery.createState(common(batchOne['mystery-board'], { difficulty: 'nightmare' })),
        () => weaver.createState(common(batchOne['story-weaver'], { difficulty: 'nightmare' })),
        () => crafting.createState(common(batchOne['studio-crafting'], { difficulty: 'nightmare' })),
        () => meteor.createState(common(batchTwo['meteor-defense'], { difficulty: 'nightmare' })),
        () => mazeState({ difficulty: 'nightmare' }),
        () => bingo.createState(common(batchTwo['broadcast-bingo'], { difficulty: 'nightmare' })),
        () => echo.createState(common(batchTwo['echo-memory'], { difficulty: 'nightmare' })),
        () => prediction.createState(common(batchTwo['keeper-prediction'], { difficulty: 'nightmare' }))
    ];
    for (const create of cases) assert.throws(create, /Invalid/);
});

test('all ten engines reject an unregistered mode', () => {
    const cases = [
        () => constellation.createState(common(batchOne['constellation-repair'], { mode: 'spectator' })),
        () => signalState({ mode: 'spectator' }),
        () => mystery.createState(common(batchOne['mystery-board'], { mode: 'spectator' })),
        () => weaver.createState(common(batchOne['story-weaver'], { mode: 'spectator' })),
        () => crafting.createState(common(batchOne['studio-crafting'], { mode: 'spectator' })),
        () => meteor.createState(common(batchTwo['meteor-defense'], { mode: 'spectator' })),
        () => mazeState({ mode: 'spectator' }),
        () => bingo.createState(common(batchTwo['broadcast-bingo'], { mode: 'spectator' })),
        () => echo.createState(common(batchTwo['echo-memory'], { mode: 'spectator' })),
        () => prediction.createState(common(batchTwo['keeper-prediction'], { mode: 'spectator' }))
    ];
    for (const create of cases) assert.throws(create, /Invalid game setup/);
});

test('constellation creation is deterministic and never aliases state arrays', () => {
    const setup = common(batchOne['constellation-repair'], { difficulty: 'expert' });
    const first = constellation.createState(setup);
    const second = constellation.createState(setup);
    assert.deepEqual(first, second);
    assert.notEqual(first.solution, second.solution);
    assert.notEqual(first.blockers, second.blockers);
    assert.notEqual(first.history, second.history);
    first.solution[0].x = 99;
    assert.notEqual(second.solution[0].x, 99);
});

test('constellation projection hides complete solution and blocker layout from creator', () => {
    const state = constellation.createState(common(batchOne['constellation-repair'], { mode: 'coop' }));
    const view = constellation.project(state, 'creator');
    assert.equal(view.solution, undefined);
    assert.equal(view.blockers, undefined);
    assert.equal(view.history, undefined);
    assert.equal(view.privateClue.blockedCells, undefined);
    assert.equal(Number.isSafeInteger(view.privateClue.nextRow), true);
    assert.equal(view.placements.length, 0);
});

test('constellation owner projection hides ordered solution coordinates', () => {
    const state = constellation.createState(common(batchOne['constellation-repair'], { mode: 'coop' }));
    const view = constellation.project(state, 'owner');
    assert.equal(view.solution, undefined);
    assert.equal(view.history, undefined);
    assert.ok(Array.isArray(view.privateClue.blockedCells));
    assert.deepEqual(view.privateClue.blockedCells, state.blockers);
    assert.equal(view.privateClue.nextRow, undefined);
});

test('constellation action rejects extra hidden-state fields', () => {
    const state = constellation.createState(common(batchOne['constellation-repair']));
    const expected = state.solution[0];
    assert.throws(() => constellation.applyAction(state, {
        type: 'place',
        x: expected.x,
        y: expected.y,
        solution: state.solution
    }, { actorRole: 'creator' }), /Unexpected constellation action field: solution/);
    assert.equal(state.turn, 0);
    assert.equal(state.placements.length, 0);
});

test('constellation failed action leaves input state byte-equivalent', () => {
    const state = constellation.createState(common(batchOne['constellation-repair']));
    const before = clone(state);
    const [x, y] = state.blockers[0].split(':').map(Number);
    assert.throws(() => constellation.applyAction(state, { type: 'place', x, y }, { actorRole: 'creator' }), /blocked/);
    assert.deepEqual(state, before);
});

test('constellation successful action returns a new state without mutating source', () => {
    const state = constellation.createState(common(batchOne['constellation-repair']));
    const before = clone(state);
    const expected = state.solution[0];
    const next = constellation.applyAction(state, { type: 'place', x: expected.x, y: expected.y }, { actorRole: 'creator' });
    assert.deepEqual(state, before);
    assert.notEqual(next, state);
    assert.notEqual(next.placements, state.placements);
    assert.equal(next.turn, 1);
    assert.equal(next.placements.length, 1);
});

test('constellation terminal state rejects further placement', () => {
    const state = constellation.createState(common(batchOne['constellation-repair']));
    const terminal = { ...state, status: 'completed' };
    const expected = state.solution[0];
    assert.throws(() => constellation.applyAction(terminal, {
        type: 'place', x: expected.x, y: expected.y
    }, { actorRole: 'creator' }), /not active/);
    assert.equal(terminal.turn, 0);
});

test('signal requires an authoritative positive safe server epoch', () => {
    assert.throws(() => signal.createState({ ...common(batchOne['signal-duet']), serverStartedAtMs: undefined }), /server start time/);
    assert.throws(() => signal.createState({ ...common(batchOne['signal-duet']), serverStartedAtMs: '1700' }), /server start time/);
    assert.throws(() => signal.createState({ ...common(batchOne['signal-duet']), serverStartedAtMs: 0 }), /server start time/);
    assert.throws(() => signal.createState({ ...common(batchOne['signal-duet']), serverStartedAtMs: Number.MAX_SAFE_INTEGER + 1 }), /server start time/);
});

test('signal beat schedule is strictly increasing for every challenge', () => {
    for (const challengeValue of batchOne['signal-duet'].challenges) {
        const state = signal.createState({
            challengeId: challengeValue.id,
            difficulty: 'standard',
            mode: 'solo',
            serverStartedAtMs: 10_000
        });
        for (let index = 1; index < state.beats.length; index += 1) {
            assert.ok(state.beats[index].offsetMs > state.beats[index - 1].offsetMs, challengeValue.id);
        }
        assert.equal(new Set(state.beats.map(beat => beat.index)).size, state.beats.length);
    }
});

test('signal projection does not reveal partner future beat accents', () => {
    const state = signalState({ mode: 'coop' });
    const creator = signal.project(state, 'creator');
    const owner = signal.project(state, 'owner');
    const futureCreator = creator.visibleBeats.filter(beat => !beat.completed);
    const futureOwner = owner.visibleBeats.filter(beat => !beat.completed);
    assert.ok(futureCreator.every(beat => beat.index % 2 === 0));
    assert.ok(futureOwner.every(beat => beat.index % 2 === 1));
    assert.equal(creator.beats, undefined);
    assert.equal(owner.beats, undefined);
    assert.equal(creator.startedAtMs, undefined);
});

test('signal action rejects client-authored elapsed time and score', () => {
    const state = signalState();
    assert.throws(() => signal.applyAction(state, {
        type: 'tap',
        beatIndex: 0,
        elapsedMs: state.nextBeatAtMs,
        score: 999999
    }, {
        actorRole: 'creator',
        serverNowMs: state.nextBeatAtMs
    }), /Unexpected signal action field/);
    assert.equal(state.score, 0);
    assert.equal(state.hits.length, 0);
});

test('signal action requires server clock and rejects body clock coercion', () => {
    const state = signalState();
    assert.throws(() => signal.applyAction(state, { type: 'tap', beatIndex: 0 }, {
        actorRole: 'creator'
    }), /server clock/);
    assert.throws(() => signal.applyAction(state, { type: 'tap', beatIndex: 0 }, {
        actorRole: 'creator',
        serverNowMs: String(state.nextBeatAtMs)
    }), /server clock/);
    assert.equal(state.turn, 0);
});

test('signal successful tap uses server clock and preserves source state', () => {
    const state = signalState();
    const before = clone(state);
    const next = signal.applyAction(state, { type: 'tap', beatIndex: 0 }, {
        actorRole: 'creator',
        serverNowMs: state.nextBeatAtMs
    });
    assert.deepEqual(state, before);
    assert.equal(next.hits.length, 1);
    assert.equal(next.hits[0].hit, true);
    assert.equal(next.hits[0].delta, 0);
    assert.equal(next.turn, 1);
});

test('signal terminal state rejects replayed beat mutation', () => {
    const state = signalState();
    const terminal = { ...state, status: 'failed' };
    assert.throws(() => signal.applyAction(terminal, { type: 'tap', beatIndex: 0 }, {
        actorRole: 'creator',
        serverNowMs: state.nextBeatAtMs
    }), /not active/);
});

test('mystery projection hides solution, false links, contradictions, and correctness while active', () => {
    const state = mystery.createState(common(batchOne['mystery-board']));
    const view = mystery.project(state, 'creator');
    assert.equal(view.solutionLinks, undefined);
    assert.equal(view.falseLinks, undefined);
    assert.equal(view.contradictions, undefined);
    assert.equal(view.history, undefined);
    assert.ok(view.accusations.every(entry => entry.correct === undefined));
    assert.ok(view.evidence.every(entry => entry.textZh && entry.textEn));
});

test('mystery invalid self-link is rejected without consuming link budget', () => {
    const state = mystery.createState(common(batchOne['mystery-board']));
    const evidenceId = state.evidence[0].id;
    const before = clone(state);
    assert.throws(() => mystery.applyAction(state, {
        type: 'link', left: evidenceId, right: evidenceId
    }, { actorRole: 'creator' }), /Invalid evidence link/);
    assert.deepEqual(state, before);
});

test('mystery unknown evidence cannot be linked', () => {
    const state = mystery.createState(common(batchOne['mystery-board']));
    assert.throws(() => mystery.applyAction(state, {
        type: 'link', left: state.evidence[0].id, right: 'fabricated-evidence'
    }, { actorRole: 'creator' }), /Invalid evidence link/);
    assert.equal(state.links.length, 0);
    assert.equal(state.turn, 0);
});

test('mystery duplicate link is rejected independent of endpoint order', () => {
    const state = mystery.createState(common(batchOne['mystery-board']));
    const left = state.evidence[0].id;
    const right = state.evidence[1].id;
    const linked = mystery.applyAction(state, { type: 'link', left, right }, { actorRole: 'creator' });
    assert.throws(() => mystery.applyAction(linked, {
        type: 'link', left: right, right: left
    }, { actorRole: 'creator' }), /already linked/);
    assert.equal(linked.links.length, 1);
});

test('mystery unlink restores capacity without altering authored evidence', () => {
    const state = mystery.createState(common(batchOne['mystery-board']));
    const left = state.evidence[0].id;
    const right = state.evidence[1].id;
    const linked = mystery.applyAction(state, { type: 'link', left, right }, { actorRole: 'creator' });
    const unlinked = mystery.applyAction(linked, { type: 'unlink', left, right }, { actorRole: 'creator' });
    assert.equal(unlinked.links.length, 0);
    assert.equal(unlinked.turn, 2);
    assert.deepEqual(unlinked.evidence, state.evidence);
    assert.deepEqual(state.links, []);
});

test('mystery action rejects hidden solution injection', () => {
    const state = mystery.createState(common(batchOne['mystery-board']));
    assert.throws(() => mystery.applyAction(state, {
        type: 'accuse',
        suspectIndex: 0,
        correct: true
    }, { actorRole: 'creator' }), /Unexpected mystery action field: correct/);
    assert.equal(state.accusations.length, 0);
});

test('mystery terminal projection reveals result only after terminal state', () => {
    const state = mystery.createState(common(batchOne['mystery-board']));
    const terminal = {
        ...state,
        status: 'failed',
        accusations: [{ suspect: 0, actorRole: 'creator', correct: false }]
    };
    const view = mystery.project(terminal, 'creator');
    assert.ok(view.solution);
    assert.equal(view.accusations[0].correct, false);
    assert.throws(() => mystery.applyAction(terminal, {
        type: 'accuse', suspectIndex: 0
    }, { actorRole: 'creator' }), /not active/);
});

test('weaver hand is deterministic per state and turn', () => {
    const state = weaver.createState(common(batchOne['story-weaver']));
    const first = weaver.handFor(state, 0);
    const second = weaver.handFor(state, 0);
    const next = weaver.handFor(state, 1);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.ok(first.every(card => Object.isFrozen(card)));
    assert.notDeepEqual(first.map(card => card.id), next.map(card => card.id));
});

test('weaver expert hand is smaller than gentle hand without changing authored cards', () => {
    const gentle = weaver.createState(common(batchOne['story-weaver'], { difficulty: 'gentle' }));
    const expert = weaver.createState(common(batchOne['story-weaver'], { difficulty: 'expert' }));
    const gentleHand = weaver.handFor(gentle, 0);
    const expertHand = weaver.handFor(expert, 0);
    assert.equal(gentleHand.length, 5);
    assert.equal(expertHand.length, 3);
    assert.ok(expertHand.every(card => weaver.CARDS.includes(card)));
    assert.equal(weaver.CARDS.length, 10);
});

test('weaver rejects free text and client-authored passage fields', () => {
    const state = weaver.createState(common(batchOne['story-weaver']));
    assert.throws(() => weaver.applyAction(state, {
        type: 'choose',
        cardIndex: 0,
        text: '<script>alert(1)</script>'
    }, { actorRole: 'creator' }), /Unexpected weaver action field: text/);
    assert.equal(state.passages.length, 0);
    assert.equal(state.turn, 0);
});

test('weaver passage comes only from closed authored card', () => {
    const state = weaver.createState(common(batchOne['story-weaver']));
    const selected = weaver.handFor(state, 0)[0];
    const next = weaver.applyAction(state, { type: 'choose', cardIndex: 0 }, { actorRole: 'creator' });
    assert.equal(next.passages[0].cardId, selected.id);
    assert.equal(next.passages[0].textZh, selected.passageZh);
    assert.equal(next.passages[0].textEn, selected.passageEn);
    assert.equal(next.passages[0].actorRole, 'creator');
    assert.deepEqual(state.passages, []);
});

test('weaver cooperative turn cannot be taken by the wrong participant', () => {
    const state = weaver.createState(common(batchOne['story-weaver'], { mode: 'coop' }));
    assert.throws(() => weaver.applyAction(state, {
        type: 'choose', cardIndex: 0
    }, { actorRole: 'owner' }), /Partner writing turn/);
    assert.equal(state.turn, 0);
    assert.equal(state.history.length, 0);
});

test('weaver projection returns no hand after completion', () => {
    const state = weaver.createState(common(batchOne['story-weaver']));
    const terminal = { ...state, status: 'completed' };
    const view = weaver.project(terminal, 'creator');
    assert.deepEqual(view.hand, []);
    assert.equal(view.seed, undefined);
    assert.equal(view.history, undefined);
    assert.throws(() => weaver.applyAction(terminal, {
        type: 'choose', cardIndex: 0
    }, { actorRole: 'creator' }), /not active/);
});

test('crafting rejects material not present in the bound recipe', () => {
    const state = crafting.createState(common(batchOne['studio-crafting']));
    const before = clone(state);
    assert.throws(() => crafting.applyAction(state, {
        type: 'gather', material: '__prototype__'
    }, { actorRole: 'creator' }), /not used/);
    assert.deepEqual(state, before);
});

test('crafting enforces station rest order', () => {
    const state = crafting.createState(common(batchOne['studio-crafting']));
    const materials = Object.keys(crafting.challengeById(state.challengeId).recipe);
    assert.ok(materials.length >= 2);
    assert.throws(() => crafting.applyAction(state, {
        type: 'gather', material: materials[1]
    }, { actorRole: 'creator' }), /station is resting/);
    assert.equal(state.gatherCycle, 0);
    assert.deepEqual(state.materials, {});
});

test('crafting gather uses server difficulty amount and caps inventory', () => {
    const gentle = crafting.createState(common(batchOne['studio-crafting'], { difficulty: 'gentle' }));
    const material = Object.keys(crafting.challengeById(gentle.challengeId).recipe)[0];
    const gathered = crafting.applyAction(gentle, { type: 'gather', material }, { actorRole: 'creator' });
    assert.equal(gathered.materials[material], 3);
    const capped = { ...gentle, materials: { [material]: 20 } };
    const cappedResult = crafting.applyAction(capped, { type: 'gather', material }, { actorRole: 'creator' });
    assert.equal(cappedResult.materials[material], 20);
    assert.equal(gentle.materials[material], undefined);
});

test('crafting cannot craft before all recipe materials exist', () => {
    const state = crafting.createState(common(batchOne['studio-crafting']));
    assert.throws(() => crafting.applyAction(state, {
        type: 'craft'
    }, { actorRole: 'creator' }), /materials are incomplete/);
    assert.equal(state.status, 'active');
    assert.deepEqual(state.crafted, []);
    assert.equal(state.score, 0);
});

test('crafting cannot place before crafting and cannot inject item identifier', () => {
    const state = crafting.createState(common(batchOne['studio-crafting']));
    assert.throws(() => crafting.applyAction(state, {
        type: 'place', slot: 0
    }, { actorRole: 'creator' }), /before placing/);
    assert.throws(() => crafting.applyAction(state, {
        type: 'place', slot: 0, itemId: 'admin-crown'
    }, { actorRole: 'creator' }), /Unexpected crafting action field/);
    assert.ok(state.roomSlots.every(slot => slot === null));
});

test('crafting rejects out-of-range and coerced room slots', () => {
    const state = crafting.createState(common(batchOne['studio-crafting']));
    const ready = { ...state, crafted: [state.challengeId] };
    assert.throws(() => crafting.applyAction(ready, { type: 'place', slot: -1 }, { actorRole: 'creator' }), /room slot/);
    assert.throws(() => crafting.applyAction(ready, { type: 'place', slot: 6 }, { actorRole: 'creator' }), /room slot/);
    assert.throws(() => crafting.applyAction(ready, { type: 'place', slot: '0' }, { actorRole: 'creator' }), /room slot/);
    assert.ok(ready.roomSlots.every(slot => slot === null));
});

test('crafting terminal state freezes all mutation actions', () => {
    const state = crafting.createState(common(batchOne['studio-crafting']));
    const terminal = { ...state, status: 'completed' };
    const material = Object.keys(crafting.challengeById(state.challengeId).recipe)[0];
    assert.throws(() => crafting.applyAction(terminal, {
        type: 'gather', material
    }, { actorRole: 'creator' }), /not active/);
});

test('meteor rejects every challenge whose modifier lacks a closed rule', () => {
    const original = batchTwo['meteor-defense'];
    const mutatedChallenge = { ...challenge(original), modifier: 'browser-defined-weather' };
    const contentPack = { ...original, challenges: [mutatedChallenge] };
    assert.throws(() => meteor.createState({
        challengeId: mutatedChallenge.id,
        difficulty: 'gentle',
        mode: 'solo',
        contentPack
    }), /Unknown meteor modifier/);
});

test('meteor projection hides lane from owner and strength from creator', () => {
    const state = meteor.createState(common(batchTwo['meteor-defense'], { mode: 'coop' }));
    const creator = meteor.project(state, 'creator');
    const owner = meteor.project(state, 'owner');
    assert.equal(creator.currentThreat.strength, null);
    assert.equal(typeof creator.currentThreat.lane, 'number');
    assert.equal(owner.currentThreat.lane, null);
    assert.equal(typeof owner.currentThreat.strength, 'number');
    assert.equal(creator.threats, undefined);
    assert.equal(owner.threats, undefined);
});

test('meteor uses strict per-action schemas for resolve and lane actions', () => {
    const state = meteor.createState(common(batchTwo['meteor-defense']));
    assert.throws(() => meteor.applyAction(state, {
        type: 'resolve', lane: 0
    }, { actorRole: 'creator' }), /Unexpected meteor action field: lane/);
    assert.throws(() => meteor.applyAction(state, {
        type: 'fortify'
    }, { actorRole: 'creator' }), /lane/);
    assert.equal(state.turn, 0);
});

test('meteor owner cannot fortify or resolve cooperative defense', () => {
    const state = meteor.createState(common(batchTwo['meteor-defense'], { mode: 'coop' }));
    assert.throws(() => meteor.applyAction(state, {
        type: 'fortify', lane: 0
    }, { actorRole: 'owner' }), /Creator defense action unavailable/);
    assert.throws(() => meteor.applyAction(state, {
        type: 'resolve'
    }, { actorRole: 'owner' }), /Only the creator/);
    assert.equal(state.turn, 0);
});

test('meteor creator cannot place cooperative support beacon', () => {
    const state = meteor.createState(common(batchTwo['meteor-defense'], { mode: 'coop' }));
    assert.throws(() => meteor.applyAction(state, {
        type: 'beacon', lane: 0
    }, { actorRole: 'creator' }), /Support beacon unavailable/);
    assert.equal(state.beacon, null);
    assert.equal(state.energy > 0, true);
});

test('meteor prevents repeated fortification and beacon stalling in one wave', () => {
    let state = meteor.createState(common(batchTwo['meteor-defense'], { mode: 'coop' }));
    state = meteor.applyAction(state, { type: 'fortify', lane: 0 }, { actorRole: 'creator' });
    assert.throws(() => meteor.applyAction(state, {
        type: 'fortify', lane: 1
    }, { actorRole: 'creator' }), /unavailable/);
    state = meteor.applyAction(state, { type: 'beacon', lane: 1 }, { actorRole: 'owner' });
    assert.throws(() => meteor.applyAction(state, {
        type: 'beacon', lane: 2
    }, { actorRole: 'owner' }), /unavailable/);
    assert.equal(state.fortifiedThisWave, true);
    assert.equal(state.beacon, 1);
});

test('meteor successful resolve resets wave-scoped support state', () => {
    let state = meteor.createState(common(batchTwo['meteor-defense']));
    state = meteor.applyAction(state, { type: 'fortify', lane: 0 }, { actorRole: 'creator' });
    state = meteor.applyAction(state, { type: 'beacon', lane: 0 }, { actorRole: 'creator' });
    const before = clone(state);
    const next = meteor.applyAction(state, { type: 'resolve' }, { actorRole: 'creator' });
    assert.deepEqual(state, before);
    assert.equal(next.wave, 1);
    assert.equal(next.beacon, null);
    assert.equal(next.fortifiedThisWave, false);
    assert.equal(next.lastResolvedLane, state.threats[0].lane);
});

test('meteor terminal defense rejects additional support', () => {
    const state = meteor.createState(common(batchTwo['meteor-defense']));
    const terminal = { ...state, status: 'failed' };
    assert.throws(() => meteor.applyAction(terminal, {
        type: 'beacon', lane: 0
    }, { actorRole: 'creator' }), /not active/);
});

test('maze requires an exact server date and never accepts a client timestamp', () => {
    const setup = common(batchTwo['dream-maze'], { creatorUsername: 'creator' });
    assert.throws(() => maze.createState({ ...setup, serverDateKey: '' }), /Server date/);
    assert.throws(() => maze.createState({ ...setup, serverDateKey: '2026-8-17' }), /Server date/);
    assert.throws(() => maze.createState({ ...setup, serverDateKey: '2026-08-17T00:00:00Z' }), /Server date/);
    assert.throws(() => maze.createState({ ...setup, serverDateKey: 20260817 }), /Server date/);
});

test('maze seed binds creator identity as well as date and challenge', () => {
    const first = mazeState({ creatorUsername: 'creator-a' });
    const replay = mazeState({ creatorUsername: 'creator-a' });
    const other = mazeState({ creatorUsername: 'creator-b' });
    assert.deepEqual(first.graph, replay.graph);
    assert.notDeepEqual(first.graph, other.graph);
    assert.equal(first.dailyKey, '2026-08-17');
    assert.equal(other.dailyKey, '2026-08-17');
});

test('maze projection exposes only current local exits and visited trail', () => {
    const state = mazeState({ mode: 'coop' });
    const view = maze.project(state, 'creator');
    assert.equal(view.graph, undefined);
    assert.equal(view.goal, undefined);
    assert.equal(view.lastHint, null);
    assert.ok(Array.isArray(view.legalDirections));
    assert.deepEqual(view.position, { x: 0, y: 0 });
    assert.deepEqual(view.visited, ['0:0']);
    assert.ok(view.legalDirections.length >= 1);
});

test('maze closed wall records a bounded mistake without moving', () => {
    const state = mazeState();
    const allDirections = ['up', 'down', 'left', 'right'];
    const open = new Set(state.graph['0:0']);
    const blocked = allDirections.find(direction => !open.has(direction));
    assert.ok(blocked);
    const before = clone(state);
    const next = maze.applyAction(state, {
        type: 'move', direction: blocked
    }, { actorRole: 'creator' });
    assert.deepEqual(state, before);
    assert.deepEqual(next.position, state.position);
    assert.equal(next.mistakes, state.mistakes + 1);
    assert.equal(next.turn, state.turn + 1);
});

test('maze owner cannot move and creator cannot hint in cooperative mode', () => {
    const state = mazeState({ mode: 'coop' });
    const direction = state.graph['0:0'][0];
    assert.throws(() => maze.applyAction(state, {
        type: 'move', direction
    }, { actorRole: 'owner' }), /Only the creator navigates/);
    assert.throws(() => maze.applyAction(state, {
        type: 'hint'
    }, { actorRole: 'creator' }), /Only the owner/);
    assert.equal(state.turn, 0);
    assert.equal(state.hintsRemaining, 3);
});

test('maze hint decrements a bounded server counter without changing position', () => {
    const state = mazeState({ mode: 'coop' });
    const before = clone(state);
    const next = maze.applyAction(state, { type: 'hint' }, { actorRole: 'owner' });
    assert.deepEqual(state, before);
    assert.equal(next.hintsRemaining, state.hintsRemaining - 1);
    assert.deepEqual(next.position, state.position);
    assert.ok(['up', 'down', 'left', 'right'].includes(next.lastHint));
    assert.equal(next.turn, 1);
});

test('maze rejects hint payload attempting to inject a solution', () => {
    const state = mazeState({ mode: 'coop' });
    assert.throws(() => maze.applyAction(state, {
        type: 'hint',
        direction: 'right'
    }, { actorRole: 'owner' }), /Unexpected maze hint field/);
    assert.equal(state.hintsRemaining, 3);
});

test('maze consumes no more than configured hint count', () => {
    let state = mazeState({ mode: 'coop', difficulty: 'expert' });
    assert.equal(state.hintsRemaining, 1);
    state = maze.applyAction(state, { type: 'hint' }, { actorRole: 'owner' });
    assert.equal(state.hintsRemaining, 0);
    assert.throws(() => maze.applyAction(state, {
        type: 'hint'
    }, { actorRole: 'owner' }), /No maze hint/);
    assert.equal(state.turn, 1);
});

test('maze terminal state rejects both movement and hints', () => {
    const state = mazeState({ mode: 'coop' });
    const terminal = { ...state, status: 'completed' };
    assert.throws(() => maze.applyAction(terminal, {
        type: 'hint'
    }, { actorRole: 'owner' }), /not active/);
    assert.throws(() => maze.applyAction(terminal, {
        type: 'move', direction: 'right'
    }, { actorRole: 'creator' }), /not active/);
});

test('bingo projection never exposes source event identifiers or dedupe history', () => {
    const state = bingo.createState(common(batchTwo['broadcast-bingo']));
    const view = bingo.project(state, 'creator');
    assert.equal(view.acceptedSourceEvents, undefined);
    assert.equal(view.history, undefined);
    assert.equal(view.interactive, false);
    assert.equal(view.trustedEventsOnly, true);
    assert.equal(view.cells.length, 25);
    assert.ok(view.cells.every(cell => cell.id && cell.eventKey && cell.labelZh && cell.labelEn));
});

test('bingo rejects otherwise-shaped action from an untrusted browser', () => {
    const state = bingo.createState(common(batchTwo['broadcast-bingo']));
    const eventKey = state.cells[0].eventKey;
    assert.throws(() => bingo.applyAction(state, {
        type: 'trusted_event',
        eventKey,
        sourceEventId: 'source:event:0001'
    }, {
        actorRole: 'creator',
        trusted: false
    }), /trusted server events only/);
    assert.equal(state.cells.some(cell => cell.marked), false);
});

test('bingo rejects arbitrary client event and source tokens', () => {
    const state = bingo.createState(common(batchTwo['broadcast-bingo']));
    assert.throws(() => bingo.applyAction(state, {
        type: 'trusted_event',
        eventKey: '../../../gift.sent',
        sourceEventId: 'source:event:0001'
    }, { trusted: true }), /Invalid event key/);
    assert.throws(() => bingo.applyAction(state, {
        type: 'trusted_event',
        eventKey: state.cells[0].eventKey,
        sourceEventId: 'short'
    }, { trusted: true }), /Invalid source event id/);
});

test('bingo semantic engine replay returns same state object for same source ID', () => {
    const state = bingo.createState(common(batchTwo['broadcast-bingo']));
    const eventKey = state.cells[0].eventKey;
    const first = bingo.applyAction(state, {
        type: 'trusted_event', eventKey, sourceEventId: 'source:event:0001'
    }, { trusted: true });
    const replay = bingo.applyAction(first, {
        type: 'trusted_event', eventKey, sourceEventId: 'source:event:0001'
    }, { trusted: true });
    assert.equal(replay, first);
    assert.equal(replay.turn, 1);
    assert.equal(replay.cells.filter(cell => cell.marked).length, 1);
});

test('bingo unmatched allowlisted event advances audit history but marks no cell', () => {
    const state = bingo.createState(common(batchTwo['broadcast-bingo']));
    const next = bingo.applyAction(state, {
        type: 'trusted_event',
        eventKey: 'safe.internal.event',
        sourceEventId: 'source:event:9999'
    }, { trusted: true });
    assert.equal(next.cells.filter(cell => cell.marked).length, 0);
    assert.equal(next.turn, 1);
    assert.equal(next.history[0].matched, false);
    assert.deepEqual(state.history, []);
});

test('bingo terminal board rejects additional trusted event', () => {
    const state = bingo.createState(common(batchTwo['broadcast-bingo']));
    const terminal = { ...state, status: 'completed' };
    assert.throws(() => bingo.applyAction(terminal, {
        type: 'trusted_event', eventKey: state.cells[0].eventKey, sourceEventId: 'source:event:0002'
    }, { trusted: true }), /not active/);
});

test('echo cooperative private clues are disjoint and cover the sequence', () => {
    const state = echo.createState(common(batchTwo['echo-memory'], { mode: 'coop', difficulty: 'expert' }));
    const creator = echo.project(state, 'creator').privateClue;
    const owner = echo.project(state, 'owner').privateClue;
    const creatorIndices = new Set(creator.map(item => item.index));
    const ownerIndices = new Set(owner.map(item => item.index));
    assert.ok([...creatorIndices].every(index => !ownerIndices.has(index)));
    assert.equal(new Set([...creatorIndices, ...ownerIndices]).size, state.sequence.length);
    assert.ok(creator.every(item => item.index % 2 === 0));
    assert.ok(owner.every(item => item.index % 2 === 1));
});

test('echo study action rejects client-injected symbol', () => {
    const state = echo.createState(common(batchTwo['echo-memory']));
    assert.throws(() => echo.applyAction(state, {
        type: 'study', symbol: state.sequence[0]
    }, { actorRole: 'creator' }), /Study has no symbol/);
    assert.deepEqual(state.studied, []);
    assert.equal(state.phase, 'study');
});

test('echo participant may study only once', () => {
    const state = echo.createState(common(batchTwo['echo-memory'], { mode: 'coop' }));
    const studied = echo.applyAction(state, { type: 'study' }, { actorRole: 'creator' });
    assert.deepEqual(studied.studied, ['creator']);
    assert.throws(() => echo.applyAction(studied, {
        type: 'study'
    }, { actorRole: 'creator' }), /already studied/);
    assert.equal(studied.turn, 1);
});

test('echo cannot recall before both cooperative roles study', () => {
    const state = echo.createState(common(batchTwo['echo-memory'], { mode: 'coop' }));
    const studied = echo.applyAction(state, { type: 'study' }, { actorRole: 'creator' });
    assert.equal(studied.phase, 'study');
    assert.throws(() => echo.applyAction(studied, {
        type: 'echo', symbol: studied.sequence[0]
    }, { actorRole: 'owner' }), /Study before recall/);
    assert.equal(studied.recallIndex, 0);
});

test('echo wrong cooperative role cannot reveal a partner symbol', () => {
    let state = echo.createState(common(batchTwo['echo-memory'], { mode: 'coop' }));
    state = echo.applyAction(state, { type: 'study' }, { actorRole: 'creator' });
    state = echo.applyAction(state, { type: 'study' }, { actorRole: 'owner' });
    assert.equal(state.phase, 'recall');
    assert.throws(() => echo.applyAction(state, {
        type: 'echo', symbol: state.sequence[0]
    }, { actorRole: 'owner' }), /Partner recall turn/);
    assert.equal(state.recallIndex, 0);
});

test('echo invalid symbol is rejected by closed vocabulary', () => {
    let state = echo.createState(common(batchTwo['echo-memory']));
    state = echo.applyAction(state, { type: 'study' }, { actorRole: 'creator' });
    assert.throws(() => echo.applyAction(state, {
        type: 'echo', symbol: 'password'
    }, { actorRole: 'creator' }), /Invalid symbol/);
    assert.equal(state.recallIndex, 0);
});

test('echo wrong symbol increments mistakes without advancing sequence', () => {
    let state = echo.createState(common(batchTwo['echo-memory']));
    state = echo.applyAction(state, { type: 'study' }, { actorRole: 'creator' });
    const wrong = ['circle', 'wave', 'star', 'leaf', 'bell', 'key'].find(symbol => symbol !== state.sequence[0]);
    const next = echo.applyAction(state, { type: 'echo', symbol: wrong }, { actorRole: 'creator' });
    assert.equal(next.mistakes, 1);
    assert.equal(next.recallIndex, 0);
    assert.equal(next.status, 'active');
    assert.equal(state.mistakes, 0);
});

test('echo projection clears private clue after recall begins', () => {
    let state = echo.createState(common(batchTwo['echo-memory']));
    assert.ok(echo.project(state, 'creator').privateClue.length > 0);
    state = echo.applyAction(state, { type: 'study' }, { actorRole: 'creator' });
    const view = echo.project(state, 'creator');
    assert.equal(view.phase, 'recall');
    assert.deepEqual(view.privateClue, []);
    assert.equal(view.sequence, undefined);
});

test('echo terminal run rejects additional recall', () => {
    const state = echo.createState(common(batchTwo['echo-memory']));
    const terminal = { ...state, status: 'completed', phase: 'recall' };
    assert.throws(() => echo.applyAction(terminal, {
        type: 'echo', symbol: 'circle'
    }, { actorRole: 'creator' }), /not active/);
});

test('prediction projection seals participant choices before reveal', () => {
    const state = prediction.createState(common(batchTwo['keeper-prediction'], { mode: 'coop' }));
    const submitted = prediction.applyAction(state, {
        type: 'submit', choice: 1, prediction: 2
    }, { actorRole: 'creator' });
    const ownerView = prediction.project(submitted, 'owner');
    const creatorView = prediction.project(submitted, 'creator');
    assert.equal(ownerView.partnerSubmitted, true);
    assert.equal(ownerView.submitted, false);
    assert.equal(creatorView.submitted, true);
    assert.equal(ownerView.submissions, undefined);
    assert.equal(ownerView.creatorChoice, undefined);
    assert.deepEqual(ownerView.reveals, []);
});

test('prediction accepts only fixed choice and prediction indices', () => {
    const state = prediction.createState(common(batchTwo['keeper-prediction']));
    assert.throws(() => prediction.applyAction(state, {
        type: 'submit', choice: -1, prediction: 0
    }, { actorRole: 'creator' }), /Invalid choice/);
    assert.throws(() => prediction.applyAction(state, {
        type: 'submit', choice: 0, prediction: 3
    }, { actorRole: 'creator' }), /Invalid prediction/);
    assert.throws(() => prediction.applyAction(state, {
        type: 'submit', choice: '0', prediction: 0
    }, { actorRole: 'creator' }), /Invalid choice/);
    assert.equal(state.turn, 0);
});

test('prediction rejects sensitive or client-authored profile fields', () => {
    const state = prediction.createState(common(batchTwo['keeper-prediction']));
    assert.throws(() => prediction.applyAction(state, {
        type: 'submit',
        choice: 0,
        prediction: 1,
        politicalPreference: 'private',
        healthProfile: {}
    }, { actorRole: 'creator' }), /Unexpected prediction action field/);
    assert.deepEqual(state.submissions, {});
});

test('prediction participant cannot replace a sealed submission', () => {
    const state = prediction.createState(common(batchTwo['keeper-prediction'], { mode: 'coop' }));
    const submitted = prediction.applyAction(state, {
        type: 'submit', choice: 0, prediction: 1
    }, { actorRole: 'creator' });
    assert.throws(() => prediction.applyAction(submitted, {
        type: 'submit', choice: 2, prediction: 2
    }, { actorRole: 'creator' }), /already submitted/);
    assert.deepEqual(submitted.submissions.creator, { choice: 0, prediction: 1 });
});

test('prediction reveal uses only both sealed submissions and clears active round state', () => {
    const state = prediction.createState(common(batchTwo['keeper-prediction'], { mode: 'coop' }));
    const creatorSubmitted = prediction.applyAction(state, {
        type: 'submit', choice: 0, prediction: 1
    }, { actorRole: 'creator' });
    const revealed = prediction.applyAction(creatorSubmitted, {
        type: 'submit', choice: 1, prediction: 0
    }, { actorRole: 'owner' });
    assert.deepEqual(revealed.submissions, {});
    assert.equal(revealed.reveals.length, 1);
    assert.equal(revealed.reveals[0].creatorChoice, 0);
    assert.equal(revealed.reveals[0].ownerChoice, 1);
    assert.equal(revealed.reveals[0].points, 2);
    assert.deepEqual(creatorSubmitted.reveals, []);
});

test('prediction solo synthetic owner choice is deterministic and fictional', () => {
    const first = prediction.createState(common(batchTwo['keeper-prediction']));
    const second = prediction.createState(common(batchTwo['keeper-prediction']));
    const firstResult = prediction.applyAction(first, {
        type: 'submit', choice: 2, prediction: 1
    }, { actorRole: 'creator' });
    const secondResult = prediction.applyAction(second, {
        type: 'submit', choice: 2, prediction: 1
    }, { actorRole: 'creator' });
    assert.deepEqual(firstResult, secondResult);
    assert.equal(firstResult.reveals.length, 1);
    assert.ok(firstResult.reveals[0].ownerChoice >= 0 && firstResult.reveals[0].ownerChoice <= 2);
    assert.equal(Object.keys(firstResult.reveals[0]).some(key => /health|politic|religion|identity/i.test(key)), false);
});

test('prediction terminal state rejects another sealed response', () => {
    const state = prediction.createState(common(batchTwo['keeper-prediction']));
    const terminal = { ...state, status: 'completed' };
    assert.throws(() => prediction.applyAction(terminal, {
        type: 'submit', choice: 0, prediction: 0
    }, { actorRole: 'creator' }), /not active/);
});

test('all ten active public projections omit generic internal history', () => {
    const projections = [
        constellation.project(constellation.createState(common(batchOne['constellation-repair'])), 'creator'),
        signal.project(signalState(), 'creator'),
        mystery.project(mystery.createState(common(batchOne['mystery-board'])), 'creator'),
        weaver.project(weaver.createState(common(batchOne['story-weaver'])), 'creator'),
        crafting.project(crafting.createState(common(batchOne['studio-crafting'])), 'creator'),
        meteor.project(meteor.createState(common(batchTwo['meteor-defense'])), 'creator'),
        maze.project(mazeState(), 'creator'),
        bingo.project(bingo.createState(common(batchTwo['broadcast-bingo'])), 'creator'),
        echo.project(echo.createState(common(batchTwo['echo-memory'])), 'creator'),
        prediction.project(prediction.createState(common(batchTwo['keeper-prediction'])), 'creator')
    ];
    for (const view of projections) {
        assert.equal(view.history, undefined, view.gameId);
        assert.equal(view.schemaVersion, 1, view.gameId);
        assert.equal(view.status, 'active', view.gameId);
        assert.equal(view.score, 0, view.gameId);
    }
});

test('all ten public projections contain bounded bilingual challenge identity', () => {
    const projections = [
        constellation.project(constellation.createState(common(batchOne['constellation-repair'])), 'creator'),
        signal.project(signalState(), 'creator'),
        mystery.project(mystery.createState(common(batchOne['mystery-board'])), 'creator'),
        weaver.project(weaver.createState(common(batchOne['story-weaver'])), 'creator'),
        crafting.project(crafting.createState(common(batchOne['studio-crafting'])), 'creator'),
        meteor.project(meteor.createState(common(batchTwo['meteor-defense'])), 'creator'),
        maze.project(mazeState(), 'creator'),
        bingo.project(bingo.createState(common(batchTwo['broadcast-bingo'])), 'creator'),
        echo.project(echo.createState(common(batchTwo['echo-memory'])), 'creator'),
        prediction.project(prediction.createState(common(batchTwo['keeper-prediction'])), 'creator')
    ];
    for (const view of projections) {
        assert.match(view.gameId, /^[a-z][a-z0-9-]+$/);
        assert.match(view.challengeId, /^[a-z][a-z0-9-]+$/);
        assert.ok(view.titleZh.length >= 2);
        assert.ok(view.titleEn.length >= 2);
        assert.ok(view.briefZh.length >= 4);
        assert.ok(view.briefEn.length >= 4);
        assert.ok(JSON.stringify(view).length < 120_000, view.gameId);
    }
});

test('all ten engines leave original state unchanged after a representative successful action', () => {
    const constellationState = constellation.createState(common(batchOne['constellation-repair']));
    const signalInitial = signalState();
    const mysteryState = mystery.createState(common(batchOne['mystery-board']));
    const weaverState = weaver.createState(common(batchOne['story-weaver']));
    const craftingState = crafting.createState(common(batchOne['studio-crafting']));
    const meteorState = meteor.createState(common(batchTwo['meteor-defense']));
    const mazeInitial = mazeState();
    const bingoState = bingo.createState(common(batchTwo['broadcast-bingo']));
    const echoState = echo.createState(common(batchTwo['echo-memory']));
    const predictionState = prediction.createState(common(batchTwo['keeper-prediction']));
    const fixtures = [
        [constellationState, () => constellation.applyAction(constellationState, { type: 'place', x: constellationState.solution[0].x, y: constellationState.solution[0].y }, { actorRole: 'creator' })],
        [signalInitial, () => signal.applyAction(signalInitial, { type: 'tap', beatIndex: 0 }, { actorRole: 'creator', serverNowMs: signalInitial.nextBeatAtMs })],
        [mysteryState, () => mystery.applyAction(mysteryState, { type: 'link', left: mysteryState.evidence[0].id, right: mysteryState.evidence[1].id }, { actorRole: 'creator' })],
        [weaverState, () => weaver.applyAction(weaverState, { type: 'choose', cardIndex: 0 }, { actorRole: 'creator' })],
        [craftingState, () => crafting.applyAction(craftingState, { type: 'gather', material: Object.keys(crafting.challengeById(craftingState.challengeId).recipe)[0] }, { actorRole: 'creator' })],
        [meteorState, () => meteor.applyAction(meteorState, { type: 'fortify', lane: 0 }, { actorRole: 'creator' })],
        [mazeInitial, () => maze.applyAction(mazeInitial, { type: 'move', direction: mazeInitial.graph['0:0'][0] }, { actorRole: 'creator' })],
        [bingoState, () => bingo.applyAction(bingoState, { type: 'trusted_event', eventKey: bingoState.cells[0].eventKey, sourceEventId: 'source:event:1000' }, { trusted: true })],
        [echoState, () => echo.applyAction(echoState, { type: 'study' }, { actorRole: 'creator' })],
        [predictionState, () => prediction.applyAction(predictionState, { type: 'submit', choice: 0, prediction: 0 }, { actorRole: 'creator' })]
    ];
    for (const [state, apply] of fixtures) {
        const before = clone(state);
        const next = apply();
        assert.deepEqual(state, before, state.gameId);
        assert.notEqual(next, state, state.gameId);
        assert.equal(next.turn, state.turn + 1, state.gameId);
    }
});
