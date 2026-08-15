'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const doudizhu = require('../domain/games/doudizhu');

const {
    COMBINATION_TYPES: TYPES,
    RULE_PROFILE,
    advanceBots,
    applyCommand,
    canBeat,
    classifyAllCards,
    classifyCards,
    createDeck,
    createGame,
    generateLegalMoves,
    getCardRank,
    projectObservation,
    projectState,
    suggestMove,
    validateState
} = doudizhu;

const SUITS = ['S', 'H', 'C', 'D'];

function rankCards(rank, count = 1) {
    if (rank === 'LJ' || rank === 'BJ') {
        assert.equal(count, 1);
        return [rank];
    }
    return SUITS.slice(0, count).map((suit) => `${suit}${rank}`);
}

function cards(...groups) {
    return groups.flatMap(([rank, count]) => rankCards(rank, count));
}

function lcg(seed) {
    let value = seed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function assertRuleError(code, operation) {
    assert.throws(operation, (error) => error?.code === code);
}

function combinationSignature(cardIds) {
    const counts = Array(15).fill(0);
    for (const cardId of cardIds) counts[getCardRank(cardId)] += 1;
    return counts.join(',');
}

function buildPlayingState({
    landlordSeat = 0,
    turnSeat = landlordSeat,
    hands,
    lastMove = null,
    passCount = 0,
    nonPassPlays = [0, 0, 0],
    bombCount = 0,
    contractBid = 1,
    humanSeat = 0
}) {
    const state = createGame({ rng: lcg(9), humanSeat });
    const normalizedHands = hands.map((hand) => [...hand]);
    const active = new Set(normalizedHands.flat());
    assert.equal(active.size, normalizedHands.flat().length, 'fixture hands must be disjoint');
    const playedCards = createDeck().filter((cardId) => !active.has(cardId));
    state.phase = 'playing';
    state.hands = normalizedHands.map(doudizhu.sortCards);
    state.playedCards = playedCards;
    state.bottomCards = [...state.hands[landlordSeat], ...state.playedCards].slice(0, 3);
    state.bottomRevealed = true;
    state.landlordSeat = landlordSeat;
    state.contractBid = contractBid;
    state.roles = [0, 1, 2].map((seat) => seat === landlordSeat ? 'landlord' : 'farmer');
    state.firstBidder = landlordSeat;
    state.bidding = {
        highestBid: contractBid,
        highestBidder: landlordSeat,
        actions: [
            { seat: landlordSeat, bid: contractBid },
            { seat: (landlordSeat + 1) % 3, bid: 0 },
            { seat: (landlordSeat + 2) % 3, bid: 0 }
        ]
    };
    state.turnSeat = turnSeat;
    state.trick = lastMove ? {
        lastMove: {
            seat: lastMove.seat,
            cardIds: [...lastMove.cardIds],
            combination: classifyCards(lastMove.cardIds)
        },
        lastPlayerSeat: lastMove.seat,
        passCount
    } : { lastMove: null, lastPlayerSeat: null, passCount: 0 };
    state.nonPassPlays = [...nonPassPlays];
    state.bombCount = bombCount;
    state.multiplier = 2 ** bombCount;
    state.winner = null;
    state.score = null;
    state.markerCard = state.hands[landlordSeat][0] || state.playedCards[0];
    validateState(state);
    return state;
}

test('classic-jj-v1 profile and card helpers are immutable and complete', () => {
    assert.equal(RULE_PROFILE.id, 'classic-jj-v1');
    assert.equal(RULE_PROFILE.version, 'classic-jj-v1');
    assert.equal(Object.isFrozen(RULE_PROFILE), true);
    assert.equal(Object.isFrozen(RULE_PROFILE.attachments), true);
    assert.equal(createDeck().length, 54);
    assert.equal(new Set(createDeck()).size, 54);
    assert.deepEqual(doudizhu.formatCard('S3', 'neutral'), {
        id: 'S3', rank: '3', rankValue: 0, suit: 'S', suitLabel: '♠', color: 'black', label: '♠3'
    });
    assert.deepEqual(doudizhu.formatCard('LJ', 'neutral'), {
        id: 'LJ', rank: 'LJ', rankValue: 13, suit: null, suitLabel: '', color: 'black', label: 'LJ'
    });
});

test('deal randomizes the human seat, deals 17/17/17 plus 3, and assigns marker bidder', () => {
    const observedSeats = [0.1, 0.4, 0.8].map((value) => createGame({ rng: () => value }).humanSeat);
    assert.deepEqual(observedSeats, [0, 1, 2]);
    const state = createGame({ rng: lcg(123), humanSeat: 2 });
    assert.equal(state.phase, 'bidding');
    assert.deepEqual(state.hands.map((hand) => hand.length), [17, 17, 17]);
    assert.equal(state.bottomCards.length, 3);
    assert.equal(new Set([...state.hands.flat(), ...state.bottomCards]).size, 54);
    assert.equal(state.hands[state.firstBidder].includes(state.markerCard), true);
    assert.equal(state.turnSeat, state.firstBidder);
    assert.equal(validateState(JSON.parse(JSON.stringify(state))), true);
});

test('classifier recognizes every frozen combination and rejects rule-boundary near misses', () => {
    const cases = [
        [cards(['3', 1]), TYPES.SINGLE],
        [cards(['3', 2]), TYPES.PAIR],
        [cards(['3', 3]), TYPES.TRIPLE],
        [cards(['3', 3], ['4', 1]), TYPES.TRIPLE_SINGLE],
        [cards(['3', 3], ['4', 2]), TYPES.TRIPLE_PAIR],
        [cards(['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1]), TYPES.STRAIGHT],
        [cards(['3', 2], ['4', 2], ['5', 2]), TYPES.PAIR_STRAIGHT],
        [cards(['3', 3], ['4', 3]), TYPES.TRIPLE_STRAIGHT],
        [cards(['3', 3], ['4', 3], ['5', 2]), TYPES.PLANE_SINGLE],
        [cards(['3', 3], ['4', 3], ['5', 2], ['6', 2]), TYPES.PLANE_PAIR],
        [cards(['3', 4], ['4', 2]), TYPES.FOUR_TWO_SINGLE],
        [cards(['3', 4], ['4', 2], ['5', 2]), TYPES.FOUR_TWO_PAIR],
        [cards(['3', 4]), TYPES.BOMB],
        [['LJ', 'BJ'], TYPES.ROCKET]
    ];
    for (const [selection, type] of cases) {
        assert.equal(classifyCards(selection)?.type, type, `${selection.join(' ')} should be ${type}`);
        assert.equal(classifyCards([...selection].reverse())?.type, type, 'order must not matter');
    }

    assert.equal(classifyCards(cards(
        ['10', 1], ['J', 1], ['Q', 1], ['K', 1], ['A', 1], ['2', 1]
    )), null, '2 cannot be in a straight');
    assert.equal(classifyCards(cards(['3', 4], ['4', 4])), null, 'a second quad is not two pair wings');
    assert.equal(classifyAllCards(cards(
        ['3', 3], ['4', 3], ['5', 3], ['6', 3]
    )).some((entry) => entry.type === TYPES.PLANE_SINGLE), false,
    'a triple cannot be split into single wings');
    assert.throws(() => classifyCards(['S3', 'S3']), /Duplicate card/);
    assert.throws(() => classifyCards(['not-a-card']), /Invalid Dou Dizhu card id/);
});

test('sequence and airplane minimum/maximum boundaries exclude 2 and jokers', () => {
    assert.equal(classifyCards(cards(
        ['3', 1], ['4', 1], ['5', 1], ['6', 1]
    )), null, 'a straight needs at least five ranks');
    assert.equal(classifyCards(cards(
        ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1],
        ['9', 1], ['10', 1], ['J', 1], ['Q', 1], ['K', 1], ['A', 1]
    ))?.type, TYPES.STRAIGHT, '3 through A is the maximum single straight');
    assert.equal(classifyCards(cards(['3', 2], ['4', 2])), null,
        'a pair straight needs at least three ranks');
    assert.equal(classifyCards(cards(
        ['3', 2], ['4', 2], ['5', 2], ['6', 2], ['7', 2],
        ['8', 2], ['9', 2], ['10', 2], ['J', 2], ['Q', 2]
    ))?.type, TYPES.PAIR_STRAIGHT, 'a 20-card hand can contain a ten-rank pair straight');
    assert.equal(classifyCards(cards(['K', 3], ['A', 3]))?.type, TYPES.TRIPLE_STRAIGHT);
    assert.equal(classifyCards(cards(['A', 3], ['2', 3])), null,
        '2 cannot enter a triple straight');
    assert.equal(classifyCards(cards(
        ['3', 3], ['4', 3], ['5', 3], ['6', 3], ['7', 3],
        ['8', 1], ['9', 1], ['10', 1], ['J', 1], ['Q', 1]
    ))?.type, TYPES.PLANE_SINGLE, 'five-body airplane with singles fits exactly 20 cards');
    assert.equal(classifyCards(cards(
        ['3', 3], ['4', 3], ['5', 3], ['6', 3],
        ['7', 2], ['8', 2], ['9', 2], ['10', 2]
    ))?.type, TYPES.PLANE_PAIR, 'four-body airplane with pairs fits exactly 20 cards');
});

test('comparison enforces type and chain length while bombs and rocket override', () => {
    assert.equal(canBeat(cards(['4', 1]), cards(['3', 1])), true);
    assert.equal(canBeat(cards(['4', 2]), cards(['3', 1])), false);
    assert.equal(canBeat(
        cards(['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1]),
        cards(['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1])
    ), true);
    assert.equal(canBeat(
        cards(['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1]),
        cards(['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1])
    ), false, 'different straight lengths cannot compare');
    assert.equal(canBeat(cards(['3', 4]), cards(['A', 1])), true);
    assert.equal(canBeat(['LJ', 'BJ'], cards(['2', 4])), true);
    assert.equal(canBeat(cards(['2', 4]), ['LJ', 'BJ']), false);
    assert.equal(canBeat(
        cards(['4', 3], ['3', 1]),
        cards(['3', 3], ['2', 1])
    ), true, 'attachments do not determine combination strength');
});

test('structural move generator is complete modulo suit identity for small hands', () => {
    const fixtures = [
        cards(['3', 3], ['4', 2], ['5', 1], ['6', 1]),
        cards(['3', 4], ['4', 2], ['5', 2]),
        cards(['3', 3], ['4', 3], ['5', 2]),
        cards(['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1])
    ];
    for (const hand of fixtures) {
        const expected = new Set();
        for (let mask = 1; mask < 2 ** hand.length; mask += 1) {
            const selection = hand.filter((_, index) => mask & (1 << index));
            if (classifyCards(selection)) expected.add(combinationSignature(selection));
        }
        const actualMoves = generateLegalMoves(hand);
        const actual = new Set(actualMoves.map((move) => combinationSignature(move.cardIds)));
        assert.deepEqual(actual, expected);
        assert.equal(actualMoves.every((move) => classifyCards(move.cardIds)), true);
        assert.equal(new Set(actualMoves.map((move) => combinationSignature(move.cardIds))).size,
            actualMoves.length);
    }

    const hand = cards(['3', 4], ['4', 2], ['5', 1], ['6', 1]);
    const target = classifyCards(cards(['3', 2]));
    const generated = generateLegalMoves(hand, target);
    const expected = new Set();
    for (let mask = 1; mask < 2 ** hand.length; mask += 1) {
        const selection = hand.filter((_, index) => mask & (1 << index));
        if (canBeat(selection, target)) expected.add(combinationSignature(selection));
    }
    assert.deepEqual(new Set(generated.map((move) => combinationSignature(move.cardIds))), expected);
});

test('bidding accepts only pass or a higher score, 3 ends immediately, and the winner gets bottom cards', () => {
    let state = createGame({ rng: lcg(4), humanSeat: 0 });
    const first = state.turnSeat;
    ({ state } = applyCommand(state, { type: 'bid', seat: first, bid: 1 }));
    assert.equal(state.bidding.highestBidder, first);
    assertRuleError('ILLEGAL_BID', () => applyCommand(
        state,
        { type: 'bid', seat: state.turnSeat, bid: 1 }
    ));
    const second = state.turnSeat;
    ({ state } = applyCommand(state, { type: 'bid', seat: second, bid: 2 }));
    const third = state.turnSeat;
    ({ state } = applyCommand(state, { type: 'bid', seat: third, bid: 0 }));
    assert.equal(state.phase, 'playing');
    assert.equal(state.landlordSeat, second);
    assert.equal(state.hands[second].length, 20);
    assert.equal(state.bottomRevealed, true);
    assert.equal(state.turnSeat, second);

    let immediate = createGame({ rng: lcg(5), humanSeat: 0 });
    const caller = immediate.turnSeat;
    ({ state: immediate } = applyCommand(immediate, { type: 'bid', seat: caller, bid: 3 }));
    assert.equal(immediate.phase, 'playing');
    assert.equal(immediate.landlordSeat, caller);
    assert.equal(immediate.bidding.actions.length, 1);
});

test('three passes redeal with fixed seats, a fresh deal, and a new marker turn', () => {
    let state = createGame({ rng: lcg(6), humanSeat: 2 });
    const originalSeats = JSON.stringify(state.seats);
    const originalCards = JSON.stringify(state.hands);
    const events = [];
    for (let index = 0; index < 3; index += 1) {
        const result = applyCommand(
            state,
            { type: 'bid', seat: state.turnSeat, bid: 0 },
            { rng: lcg(100 + index) }
        );
        state = result.state;
        events.push(...result.events);
    }
    assert.equal(state.phase, 'bidding');
    assert.equal(state.dealNumber, 2);
    assert.equal(JSON.stringify(state.seats), originalSeats);
    assert.notEqual(JSON.stringify(state.hands), originalCards);
    assert.deepEqual(state.bidding.actions, []);
    assert.equal(state.turnSeat, state.firstBidder);
    assert.equal(events.at(-1).type, 'redeal');
    assert.equal(validateState(state), true);
});

test('play FSM validates ownership and turn, forbids leader pass, and resets after two passes', () => {
    const lead = cards(['3', 1]);
    let state = buildPlayingState({
        landlordSeat: 0,
        turnSeat: 1,
        hands: [cards(['4', 1]), cards(['5', 1]), cards(['6', 1])],
        lastMove: { seat: 0, cardIds: lead }
    });
    assertRuleError('OUT_OF_TURN', () => applyCommand(state, { type: 'pass', seat: 2 }));
    assertRuleError('CARD_NOT_OWNED', () => applyCommand(
        state,
        { type: 'play', seat: 1, cardIds: cards(['7', 1]) }
    ));
    ({ state } = applyCommand(state, { type: 'pass', seat: 1 }));
    assert.equal(state.turnSeat, 2);
    const secondPass = applyCommand(state, { type: 'pass', seat: 2 });
    state = secondPass.state;
    assert.equal(state.turnSeat, 0);
    assert.equal(state.trick.lastMove, null);
    assert.equal(secondPass.events.some((event) => event.type === 'trick-reset'), true);
    assertRuleError('LEADER_CANNOT_PASS', () => applyCommand(state, { type: 'pass', seat: 0 }));
});

test('finishing determines teams, bomb/spring multipliers, and zero-sum score', () => {
    let landlord = buildPlayingState({
        landlordSeat: 0,
        turnSeat: 0,
        hands: [cards(['3', 1]), cards(['4', 2]), cards(['5', 2])],
        nonPassPlays: [2, 0, 0],
        bombCount: 1,
        contractBid: 2
    });
    ({ state: landlord } = applyCommand(landlord, {
        type: 'play', seat: 0, cardIds: cards(['3', 1])
    }));
    assert.equal(landlord.phase, 'finished');
    assert.deepEqual(landlord.winner, { team: 'landlord', finishingSeat: 0 });
    assert.equal(landlord.score.spring, true);
    assert.equal(landlord.score.antiSpring, false);
    assert.equal(landlord.score.multiplier, 4);
    assert.deepEqual(landlord.score.deltas, [16, -8, -8]);
    assert.equal(landlord.score.deltas.reduce((sum, delta) => sum + delta, 0), 0);

    let farmers = buildPlayingState({
        landlordSeat: 0,
        turnSeat: 1,
        hands: [cards(['7', 2]), cards(['4', 1]), cards(['5', 2])],
        nonPassPlays: [1, 2, 1],
        contractBid: 1
    });
    ({ state: farmers } = applyCommand(farmers, {
        type: 'play', seat: 1, cardIds: cards(['4', 1])
    }));
    assert.deepEqual(farmers.winner, { team: 'farmers', finishingSeat: 1 });
    assert.equal(farmers.score.antiSpring, true);
    assert.equal(farmers.score.multiplier, 2);
    assert.deepEqual(farmers.score.deltas, [-4, 2, 2]);
});

test('projection is locale-neutral and reveals only the viewer hand and public cards', () => {
    let state = createGame({ rng: lcg(33), humanSeat: 1 });
    const viewer = state.humanSeat;
    const projection = projectState(state, viewer);
    const serialized = JSON.stringify(projection);
    const forbidden = new Set([
        ...state.bottomCards,
        ...state.hands.flatMap((hand, seat) => seat === viewer ? [] : hand)
    ]);
    forbidden.delete(state.markerCard);
    for (const cardId of forbidden) assert.equal(serialized.includes(`\"${cardId}\"`), false);
    assert.equal(Object.hasOwn(projection, 'hands'), false);
    assert.equal(projection.hand.length, 17);
    assert.deepEqual(projection.bottomCards, []);
    assert.equal(projection.markerCard.rank, projection.markerCard.id.slice(1) || projection.markerCard.id);
    assert.match(projection.markerCard.suitLabel, /^[♠♥♣♦]$/);
    assert.equal(serialized.includes('小王'), false);
    assert.deepEqual(projectObservation(state, viewer), projection);

    const taintedState = JSON.parse(JSON.stringify(state));
    taintedState.history[0].hands = taintedState.hands;
    taintedState.history[0].privateBottom = taintedState.bottomCards;
    const sanitizedHistory = JSON.stringify(projectState(taintedState, viewer).history);
    assert.equal(sanitizedHistory.includes('hands'), false);
    assert.equal(sanitizedHistory.includes('privateBottom'), false);

    projection.hand.length = 0;
    assert.equal(state.hands[viewer].length, 17, 'projection mutation must not alter private state');

    ({ state } = applyCommand(state, { type: 'bid', seat: state.turnSeat, bid: 3 }));
    const afterBid = projectState(state, viewer);
    assert.equal(afterBid.bottomCards.length, 3);
    assert.equal(afterBid.seats[state.landlordSeat].cardCount, 20);
});

test('AI bids and plays legal actions under hard node and time limits', () => {
    const rng = lcg(77);
    let state = createGame({ rng, humanSeat: 0 });
    let command = suggestMove(state, state.turnSeat, { rng, maxNodes: 1, deadlineMs: 1 });
    assert.equal(command.type, 'bid');
    assert.equal(state.bidding.highestBid === 0 || command.bid > state.bidding.highestBid
        || command.bid === 0, true);
    ({ state } = applyCommand(state, command, { rng }));
    while (state.phase === 'bidding') {
        command = { type: 'bid', seat: state.turnSeat, bid: state.bidding.highestBid === 0 ? 1 : 0 };
        ({ state } = applyCommand(state, command, { rng }));
    }
    const before = state;
    command = suggestMove(state, state.turnSeat, { rng, maxNodes: 32, deadlineMs: 20 });
    assert.doesNotThrow(() => applyCommand(before, command, { rng }));
});

test('AI decisions are invariant to true hidden hands when the public observation is identical', () => {
    const common = {
        landlordSeat: 0,
        turnSeat: 0,
        humanSeat: 0
    };
    const first = buildPlayingState({
        ...common,
        hands: [
            cards(['3', 2], ['4', 1]),
            cards(['7', 2], ['8', 1]),
            cards(['9', 2], ['10', 1])
        ]
    });
    const second = buildPlayingState({
        ...common,
        hands: [
            cards(['3', 2], ['4', 1]),
            cards(['9', 2], ['10', 1]),
            cards(['7', 2], ['8', 1])
        ]
    });
    assert.deepEqual(projectObservation(first, 0), projectObservation(second, 0));
    const firstHint = suggestMove(first, 0, {
        rng: lcg(301), maxNodes: 2000, deadlineMs: 100
    });
    const secondHint = suggestMove(second, 0, {
        rng: lcg(301), maxNodes: 2000, deadlineMs: 100
    });
    assert.deepEqual(firstHint, secondHint, 'hidden server truth must not affect the AI policy');
    assert.equal(firstHint.type, 'play');
    assert.doesNotThrow(() => applyCommand(first, firstHint));
});

test('farmer heuristic passes a teammate lead and feeds a one-card teammate when leading', () => {
    let following = buildPlayingState({
        landlordSeat: 2,
        turnSeat: 1,
        humanSeat: 0,
        hands: [cards(['7', 4]), cards(['4', 1], ['5', 1]), cards(['8', 8])],
        lastMove: { seat: 0, cardIds: cards(['3', 1]) }
    });
    const pass = suggestMove(following, 1, { maxNodes: 20, deadlineMs: 20 });
    assert.deepEqual(pass, { type: 'pass', seat: 1 });

    const leading = buildPlayingState({
        landlordSeat: 2,
        turnSeat: 0,
        humanSeat: 0,
        hands: [cards(['3', 1], ['6', 1], ['9', 2]), cards(['A', 1]), cards(['4', 4], ['5', 4])]
    });
    const feed = suggestMove(leading, 0, { maxNodes: 100, deadlineMs: 30 });
    assert.equal(feed.type, 'play');
    assert.equal(classifyCards(feed.cardIds).type, TYPES.SINGLE);
    assert.equal(classifyCards(feed.cardIds).mainRank, 0);
});

test('farmer takes over a teammate lead when the landlord has one card left', () => {
    const threatened = buildPlayingState({
        landlordSeat: 2,
        turnSeat: 1,
        humanSeat: 0,
        hands: [
            cards(['7', 2], ['8', 2], ['9', 2], ['10', 2]),
            cards(['4', 1], ['5', 1], ['6', 2]),
            cards(['A', 1])
        ],
        lastMove: { seat: 0, cardIds: cards(['3', 1]) }
    });
    const block = suggestMove(threatened, 1, { maxNodes: 100, deadlineMs: 30 });
    assert.equal(block.type, 'play');
    assert.equal(classifyCards(block.cardIds).type, TYPES.SINGLE);
    assert.equal(canBeat(block.cardIds, threatened.trick.lastMove.combination), true);
    assert.doesNotThrow(() => applyCommand(threatened, block));
});

test('advanceBots stops at the human turn and preserves a fully valid state', () => {
    const rng = lcg(91);
    let state = createGame({ rng, humanSeat: 0 });
    if (state.turnSeat === state.humanSeat) {
        ({ state } = applyCommand(state, { type: 'bid', seat: state.humanSeat, bid: 1 }, { rng }));
    }
    const result = advanceBots(state, {
        rng,
        maxNodes: 100,
        deadlineMs: 30,
        maxActions: 12
    });
    assert.equal(validateState(result.state), true);
    assert.equal(result.state.phase === 'finished'
        || result.state.turnSeat === result.state.humanSeat
        || result.events.length === 12, true);
    assert.equal(result.events.every((event) => Number.isSafeInteger(event.sequence)), true);
});

test('bounded AI can complete deterministic games without illegal actions', () => {
    for (const seed of [2, 19, 41]) {
        const rng = lcg(seed);
        let state = createGame({ rng, humanSeat: seed % 3 });
        let actionCount = 0;
        while (state.phase !== 'finished' && actionCount < 300) {
            const command = suggestMove(state, state.turnSeat, {
                rng,
                maxNodes: 180,
                deadlineMs: 40
            });
            ({ state } = applyCommand(state, command, { rng }));
            actionCount += 1;
        }
        assert.equal(state.phase, 'finished', `seed ${seed} did not finish`);
        assert.ok(actionCount < 300);
        assert.equal(validateState(state), true);
        assert.equal(state.score.deltas.reduce((sum, delta) => sum + delta, 0), 0);
    }
});

test('classifier and generator stay inside practical CPU bounds', () => {
    const hand = cards(
        ['3', 3], ['4', 3], ['5', 3], ['6', 2], ['7', 2], ['8', 2], ['9', 1], ['2', 2], ['LJ', 1], ['BJ', 1]
    );
    const started = process.hrtime.bigint();
    let moveCount = 0;
    for (let iteration = 0; iteration < 30; iteration += 1) {
        moveCount += generateLegalMoves(hand).length;
        classifyCards(hand.slice(0, 8));
    }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(moveCount > 0);
    assert.ok(elapsedMs < 1500, `rule operations took ${elapsedMs.toFixed(1)}ms`);
});
