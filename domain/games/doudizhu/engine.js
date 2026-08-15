'use strict';

const {
    COMBINATION_TYPES: TYPES,
    RULE_PROFILE
} = require('./constants');
const {
    assertCardId,
    createDeck,
    drawRandomIndex,
    formatCard,
    shuffleCards,
    sortCards
} = require('./cards');
const {
    chooseDescriptor,
    classifyAllCards,
    classifyCards,
    descriptorKey
} = require('./combinations');

const PHASES = new Set(['bidding', 'playing', 'finished']);
const PUBLIC_EVENT_TYPES = new Set([
    'deal',
    'redeal',
    'bid',
    'landlord-assigned',
    'play',
    'pass',
    'trick-reset',
    'game-finished'
]);

class DoudizhuRuleError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DoudizhuRuleError';
        this.code = code;
    }
}

function fail(code, message) {
    throw new DoudizhuRuleError(code, message);
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertSeat(seat, label = 'seat') {
    if (!Number.isSafeInteger(seat) || seat < 0 || seat >= RULE_PROFILE.playerCount) {
        throw new TypeError(`${label} must be 0, 1, or 2`);
    }
    return seat;
}

function nextSeat(seat) {
    return (assertSeat(seat) + 1) % RULE_PROFILE.playerCount;
}

function makeSeats(humanSeat) {
    const botIds = ['bot-a', 'bot-b'];
    let botIndex = 0;
    return Array.from({ length: RULE_PROFILE.playerCount }, (_, seat) => {
        if (seat === humanSeat) return { seat, id: 'human', kind: 'human' };
        const player = { seat, id: botIds[botIndex], kind: 'bot' };
        botIndex += 1;
        return player;
    });
}

function dealCards(rng) {
    const deck = shuffleCards(createDeck(), rng);
    const hands = Array.from({ length: RULE_PROFILE.playerCount }, () => []);
    const dealtCount = RULE_PROFILE.cardsPerPlayer * RULE_PROFILE.playerCount;
    for (let index = 0; index < dealtCount; index += 1) {
        hands[index % RULE_PROFILE.playerCount].push(deck[index]);
    }
    const markerIndex = drawRandomIndex(rng, dealtCount);
    return {
        hands: hands.map(sortCards),
        bottomCards: sortCards(deck.slice(dealtCount)),
        markerCard: deck[markerIndex],
        firstBidder: markerIndex % RULE_PROFILE.playerCount
    };
}

function publicEvent(event, sequence, revision) {
    return {
        sequence,
        revision,
        ...cloneJson(event)
    };
}

function freshRoundFields(rng) {
    const dealt = dealCards(rng);
    return {
        hands: dealt.hands,
        bottomCards: dealt.bottomCards,
        bottomRevealed: false,
        markerCard: dealt.markerCard,
        firstBidder: dealt.firstBidder,
        turnSeat: dealt.firstBidder,
        bidding: {
            highestBid: 0,
            highestBidder: null,
            actions: []
        },
        landlordSeat: null,
        contractBid: 0,
        roles: ['pending', 'pending', 'pending'],
        trick: {
            lastMove: null,
            lastPlayerSeat: null,
            passCount: 0
        },
        playedCards: [],
        nonPassPlays: [0, 0, 0],
        bombCount: 0,
        multiplier: 1,
        winner: null,
        score: null
    };
}

function createGame({ rng, humanSeat } = {}) {
    const selectedHumanSeat = humanSeat === undefined || humanSeat === null
        ? drawRandomIndex(rng, RULE_PROFILE.playerCount)
        : assertSeat(humanSeat, 'humanSeat');
    const round = freshRoundFields(rng);
    const state = {
        rulesVersion: RULE_PROFILE.version,
        phase: 'bidding',
        revision: 0,
        dealNumber: 1,
        humanSeat: selectedHumanSeat,
        seats: makeSeats(selectedHumanSeat),
        ...round,
        history: [publicEvent({
            type: 'deal',
            dealNumber: 1,
            firstBidder: round.firstBidder,
            markerCard: round.markerCard,
            cardCounts: [17, 17, 17]
        }, 0, 0)]
    };
    validateState(state);
    return state;
}

function legalBids(state) {
    if (state.phase !== 'bidding') return [];
    const bids = [0];
    for (let bid = state.bidding.highestBid + 1; bid <= RULE_PROFILE.maximumBid; bid += 1) {
        bids.push(bid);
    }
    return bids;
}

function assignLandlord(state, events) {
    const landlordSeat = state.bidding.highestBidder;
    if (landlordSeat === null || state.bidding.highestBid < 1) {
        throw new Error('Cannot assign a landlord without a positive bid');
    }
    state.landlordSeat = landlordSeat;
    state.contractBid = state.bidding.highestBid;
    state.bottomRevealed = true;
    state.hands[landlordSeat] = sortCards([
        ...state.hands[landlordSeat],
        ...state.bottomCards
    ]);
    state.roles = state.roles.map((_, seat) => (
        seat === landlordSeat ? 'landlord' : 'farmer'
    ));
    state.phase = 'playing';
    state.turnSeat = landlordSeat;
    events.push({
        type: 'landlord-assigned',
        landlordSeat,
        contractBid: state.contractBid,
        bottomCards: [...state.bottomCards]
    });
}

function redeal(state, rng, events) {
    const round = freshRoundFields(rng);
    state.dealNumber += 1;
    state.phase = 'bidding';
    Object.assign(state, round);
    events.push({
        type: 'redeal',
        dealNumber: state.dealNumber,
        firstBidder: state.firstBidder,
        markerCard: state.markerCard,
        cardCounts: [17, 17, 17]
    });
}

function applyBid(state, command, rng, events) {
    if (state.phase !== 'bidding') fail('WRONG_PHASE', 'The match is not in bidding');
    const bid = command.bid;
    if (!Number.isSafeInteger(bid) || !legalBids(state).includes(bid)) {
        fail('ILLEGAL_BID', `Bid must be pass or greater than ${state.bidding.highestBid}`);
    }
    state.bidding.actions.push({ seat: command.seat, bid });
    if (bid > state.bidding.highestBid) {
        state.bidding.highestBid = bid;
        state.bidding.highestBidder = command.seat;
    }
    events.push({
        type: 'bid',
        seat: command.seat,
        bid,
        highestBid: state.bidding.highestBid,
        highestBidder: state.bidding.highestBidder
    });

    if (bid === RULE_PROFILE.maximumBid) {
        assignLandlord(state, events);
        return;
    }
    if (state.bidding.actions.length === RULE_PROFILE.playerCount) {
        if (state.bidding.highestBid === 0) {
            redeal(state, rng, events);
        } else {
            assignLandlord(state, events);
        }
        return;
    }
    state.turnSeat = nextSeat(command.seat);
}

function removeCardsFromHand(hand, cardIds) {
    const remaining = [...hand];
    for (const cardId of cardIds) {
        const index = remaining.indexOf(cardId);
        if (index === -1) fail('CARD_NOT_OWNED', `Card ${cardId} is not in the acting hand`);
        remaining.splice(index, 1);
    }
    return sortCards(remaining);
}

function calculateScore(state, finishingSeat) {
    const winningTeam = finishingSeat === state.landlordSeat ? 'landlord' : 'farmers';
    const farmerSeats = [0, 1, 2].filter((seat) => seat !== state.landlordSeat);
    const spring = winningTeam === 'landlord'
        && farmerSeats.every((seat) => state.nonPassPlays[seat] === 0);
    const antiSpring = winningTeam === 'farmers'
        && state.nonPassPlays[state.landlordSeat] === 1;
    const multiplier = 2 ** (state.bombCount + Number(spring) + Number(antiSpring));
    const unit = state.contractBid * multiplier;
    const landlordDelta = winningTeam === 'landlord' ? 2 * unit : -2 * unit;
    const farmerDelta = winningTeam === 'landlord' ? -unit : unit;
    const deltas = [farmerDelta, farmerDelta, farmerDelta];
    deltas[state.landlordSeat] = landlordDelta;
    return {
        winner: { team: winningTeam, finishingSeat },
        score: {
            contractBid: state.contractBid,
            bombCount: state.bombCount,
            spring,
            antiSpring,
            multiplier,
            unit,
            deltas
        }
    };
}

function applyPlay(state, command, events) {
    if (state.phase !== 'playing') fail('WRONG_PHASE', 'The match is not in card play');
    if (!Array.isArray(command.cardIds) || command.cardIds.length < 1
        || command.cardIds.length > RULE_PROFILE.maximumSelectedCards) {
        fail('INVALID_CARDS', 'cardIds must contain between 1 and 20 cards');
    }
    let cardIds;
    try {
        cardIds = sortCards(command.cardIds);
    } catch (error) {
        fail('INVALID_CARD_ID', error.message);
    }
    if (new Set(cardIds).size !== cardIds.length) fail('DUPLICATE_CARD', 'A card may be selected once');
    const nextHand = removeCardsFromHand(state.hands[command.seat], cardIds);
    const plainCombination = classifyCards(cardIds);
    if (!plainCombination) fail('INVALID_COMBINATION', 'Selected cards are not a legal combination');
    const target = state.trick.lastMove?.combination || null;
    const combination = chooseDescriptor(cardIds, target);
    if (!combination) fail('MOVE_DOES_NOT_BEAT', 'Selected cards do not beat the current move');

    state.hands[command.seat] = nextHand;
    state.playedCards.push(...cardIds);
    state.nonPassPlays[command.seat] += 1;
    if (combination.type === TYPES.BOMB || combination.type === TYPES.ROCKET) {
        state.bombCount += 1;
        state.multiplier = 2 ** state.bombCount;
    }
    state.trick = {
        lastMove: {
            seat: command.seat,
            cardIds,
            combination
        },
        lastPlayerSeat: command.seat,
        passCount: 0
    };
    events.push({
        type: 'play',
        seat: command.seat,
        cardIds,
        combination,
        remainingCards: nextHand.length,
        bombCount: state.bombCount,
        multiplier: state.multiplier
    });

    if (nextHand.length === 0) {
        const result = calculateScore(state, command.seat);
        state.phase = 'finished';
        state.turnSeat = null;
        state.winner = result.winner;
        state.score = result.score;
        events.push({
            type: 'game-finished',
            winningTeam: result.winner.team,
            finishingSeat: command.seat,
            score: result.score
        });
        return;
    }
    state.turnSeat = nextSeat(command.seat);
}

function applyPass(state, command, events) {
    if (state.phase !== 'playing') fail('WRONG_PHASE', 'The match is not in card play');
    if (!state.trick.lastMove) fail('LEADER_CANNOT_PASS', 'The trick leader must play cards');
    state.trick.passCount += 1;
    events.push({
        type: 'pass',
        seat: command.seat,
        passCount: state.trick.passCount
    });
    if (state.trick.passCount >= 2) {
        const leaderSeat = state.trick.lastPlayerSeat;
        state.trick = { lastMove: null, lastPlayerSeat: null, passCount: 0 };
        state.turnSeat = leaderSeat;
        events.push({ type: 'trick-reset', leaderSeat });
        return;
    }
    state.turnSeat = nextSeat(command.seat);
}

function appendEvents(state, events) {
    const sequenceStart = state.history.length;
    const publicEvents = events.map((event, index) => publicEvent(
        event,
        sequenceStart + index,
        state.revision
    ));
    state.history.push(...publicEvents);
    return publicEvents;
}

function applyCommand(inputState, command, { rng } = {}) {
    validateState(inputState);
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
        fail('INVALID_COMMAND', 'Command must be an object');
    }
    if (inputState.phase === 'finished') fail('GAME_FINISHED', 'The match is already finished');
    const seat = command.seat;
    try {
        assertSeat(seat);
    } catch (error) {
        fail('INVALID_SEAT', error.message);
    }
    if (seat !== inputState.turnSeat) fail('OUT_OF_TURN', 'It is not this seat\'s turn');

    const state = cloneJson(inputState);
    const events = [];
    switch (command.type) {
    case 'bid':
        applyBid(state, command, rng, events);
        break;
    case 'play':
        applyPlay(state, command, events);
        break;
    case 'pass':
        applyPass(state, command, events);
        break;
    default:
        fail('INVALID_COMMAND', `Unknown command type: ${String(command.type)}`);
    }
    state.revision += 1;
    const publicEvents = appendEvents(state, events);
    validateState(state);
    return { state, events: publicEvents };
}

function assertCardArray(cards, label) {
    if (!Array.isArray(cards)) throw new TypeError(`${label} must be an array`);
    for (const cardId of cards) assertCardId(cardId);
    if (new Set(cards).size !== cards.length) throw new TypeError(`${label} contains duplicates`);
}

function validateBidHistory(state) {
    if (!state.bidding || !Array.isArray(state.bidding.actions)
        || !Number.isSafeInteger(state.bidding.highestBid)
        || state.bidding.highestBid < 0 || state.bidding.highestBid > 3) {
        throw new TypeError('State has invalid bidding data');
    }
    if (state.bidding.actions.length > 3) throw new TypeError('Too many bidding actions');
    let expectedSeat = state.firstBidder;
    let highestBid = 0;
    let highestBidder = null;
    for (const action of state.bidding.actions) {
        assertSeat(action.seat, 'bid seat');
        if (action.seat !== expectedSeat || !Number.isSafeInteger(action.bid)
            || action.bid < 0 || action.bid > 3
            || (action.bid !== 0 && action.bid <= highestBid)) {
            throw new TypeError('State has an illegal bidding sequence');
        }
        if (action.bid > highestBid) {
            highestBid = action.bid;
            highestBidder = action.seat;
        }
        expectedSeat = nextSeat(action.seat);
    }
    if (highestBid !== state.bidding.highestBid
        || highestBidder !== state.bidding.highestBidder) {
        throw new TypeError('State bidding summary drifted from its actions');
    }
}

function validateCardConservation(state) {
    if (!Array.isArray(state.hands) || state.hands.length !== 3) {
        throw new TypeError('State must contain three hands');
    }
    for (let seat = 0; seat < 3; seat += 1) assertCardArray(state.hands[seat], `hand ${seat}`);
    assertCardArray(state.bottomCards, 'bottomCards');
    assertCardArray(state.playedCards, 'playedCards');
    if (state.bottomCards.length !== 3) throw new TypeError('State must contain three bottom cards');
    const handCards = state.hands.flat();
    if (new Set(handCards).size !== handCards.length) throw new TypeError('A card occurs in two hands');
    if (state.phase === 'bidding') {
        const allCards = [...handCards, ...state.bottomCards];
        if (handCards.length !== 51 || state.playedCards.length !== 0
            || allCards.length !== 54 || new Set(allCards).size !== 54) {
            throw new TypeError('Bidding state does not conserve the 54-card deck');
        }
        return;
    }
    const allActiveCards = [...handCards, ...state.playedCards];
    if (allActiveCards.length !== 54 || new Set(allActiveCards).size !== 54) {
        throw new TypeError('Playing state does not conserve the 54-card deck');
    }
    const activeSet = new Set(allActiveCards);
    if (state.bottomCards.some((cardId) => !activeSet.has(cardId))) {
        throw new TypeError('Bottom-card audit is not part of the active deck');
    }
}

function validateState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        throw new TypeError('Dou Dizhu state must be an object');
    }
    if (state.rulesVersion !== RULE_PROFILE.version || !PHASES.has(state.phase)
        || !Number.isSafeInteger(state.revision) || state.revision < 0
        || !Number.isSafeInteger(state.dealNumber) || state.dealNumber < 1) {
        throw new TypeError('State has invalid metadata');
    }
    assertSeat(state.humanSeat, 'humanSeat');
    if (!Array.isArray(state.seats) || state.seats.length !== 3
        || state.seats.some((player, seat) => player?.seat !== seat
            || !['human', 'bot'].includes(player.kind))
        || state.seats.filter((player) => player.kind === 'human').length !== 1
        || state.seats[state.humanSeat].kind !== 'human') {
        throw new TypeError('State has invalid seats');
    }
    assertSeat(state.firstBidder, 'firstBidder');
    assertCardId(state.markerCard);
    if (state.phase === 'finished') {
        if (state.turnSeat !== null || !state.winner || !state.score) {
            throw new TypeError('Finished state is missing its outcome');
        }
    } else {
        assertSeat(state.turnSeat, 'turnSeat');
        if (state.winner !== null || state.score !== null) {
            throw new TypeError('Unfinished state cannot have an outcome');
        }
    }
    validateBidHistory(state);
    validateCardConservation(state);
    if (!Array.isArray(state.roles) || state.roles.length !== 3
        || !Array.isArray(state.nonPassPlays) || state.nonPassPlays.length !== 3
        || state.nonPassPlays.some((count) => !Number.isSafeInteger(count) || count < 0)
        || !Number.isSafeInteger(state.bombCount) || state.bombCount < 0
        || state.multiplier !== 2 ** state.bombCount) {
        throw new TypeError('State has invalid role or play counters');
    }
    if (state.phase === 'bidding') {
        if (state.landlordSeat !== null || state.contractBid !== 0 || state.bottomRevealed
            || state.roles.some((role) => role !== 'pending')) {
            throw new TypeError('Bidding state exposed landlord data');
        }
        const expectedTurn = state.bidding.actions.length === 0
            ? state.firstBidder
            : nextSeat(state.bidding.actions.at(-1).seat);
        if (state.turnSeat !== expectedTurn || !state.hands[state.firstBidder].includes(state.markerCard)) {
            throw new TypeError('Bidding state has an invalid turn or marker owner');
        }
    } else {
        assertSeat(state.landlordSeat, 'landlordSeat');
        if (!state.bottomRevealed || state.contractBid < 1 || state.contractBid > 3
            || state.contractBid !== state.bidding.highestBid
            || state.landlordSeat !== state.bidding.highestBidder
            || (state.bidding.actions.length !== 3
                && state.bidding.highestBid !== RULE_PROFILE.maximumBid)
            || state.roles.some((role, seat) => role
                !== (seat === state.landlordSeat ? 'landlord' : 'farmer'))) {
            throw new TypeError('Playing state has invalid landlord data');
        }
        const played = new Set(state.playedCards);
        if ((!played.has(state.markerCard)
                && !state.hands[state.firstBidder].includes(state.markerCard))
            || state.bottomCards.some((cardId) => !played.has(cardId)
                && !state.hands[state.landlordSeat].includes(cardId))) {
            throw new TypeError('Playing state has an invalid known-card owner');
        }
    }
    if (!state.trick || !Number.isSafeInteger(state.trick.passCount)
        || state.trick.passCount < 0 || state.trick.passCount > 1) {
        throw new TypeError('State has invalid trick data');
    }
    if (state.trick.lastMove === null) {
        if (state.trick.lastPlayerSeat !== null || state.trick.passCount !== 0) {
            throw new TypeError('Empty trick contains stale lead data');
        }
    } else {
        assertSeat(state.trick.lastMove.seat, 'last move seat');
        const classified = Array.isArray(state.trick.lastMove.cardIds)
            ? classifyAllCards(state.trick.lastMove.cardIds)
            : [];
        if (state.trick.lastMove.seat !== state.trick.lastPlayerSeat
            || classified.length === 0
            || !classified.some((combination) => descriptorKey(combination)
                === descriptorKey(state.trick.lastMove.combination))
            || state.trick.lastMove.cardIds.some((cardId) => !state.playedCards.includes(cardId))) {
            throw new TypeError('State has an invalid last move');
        }
        if (state.phase !== 'finished') {
            const expectedTurn = (state.trick.lastPlayerSeat + state.trick.passCount + 1) % 3;
            if (state.turnSeat !== expectedTurn) {
                throw new TypeError('State trick and turn have drifted');
            }
        }
    }
    if (!Array.isArray(state.history)
        || state.history.some((event, index) => !event || event.sequence !== index
            || !PUBLIC_EVENT_TYPES.has(event.type)
            || !Number.isSafeInteger(event.revision) || event.revision < 0
            || event.revision > state.revision)) {
        throw new TypeError('State has invalid public history');
    }
    if (state.phase === 'finished') {
        assertSeat(state.winner.finishingSeat, 'finishingSeat');
        const expected = calculateScore(state, state.winner.finishingSeat);
        if (state.hands[state.winner.finishingSeat].length !== 0
            || JSON.stringify(state.winner) !== JSON.stringify(expected.winner)
            || JSON.stringify(state.score) !== JSON.stringify(expected.score)) {
            throw new TypeError('Finished state has an invalid score');
        }
    }
    JSON.stringify(state);
    return true;
}

function projectEvent(event) {
    const base = { sequence: event.sequence, revision: event.revision, type: event.type };
    switch (event.type) {
    case 'deal':
    case 'redeal':
        return {
            ...base,
            dealNumber: event.dealNumber,
            firstBidder: event.firstBidder,
            markerCard: formatCard(event.markerCard, 'neutral'),
            cardCounts: [...event.cardCounts]
        };
    case 'bid':
        return {
            ...base,
            seat: event.seat,
            bid: event.bid,
            highestBid: event.highestBid,
            highestBidder: event.highestBidder
        };
    case 'landlord-assigned':
        return {
            ...base,
            landlordSeat: event.landlordSeat,
            contractBid: event.contractBid,
            bottomCards: event.bottomCards.map((cardId) => formatCard(cardId, 'neutral'))
        };
    case 'play':
        return {
            ...base,
            seat: event.seat,
            cardIds: [...event.cardIds],
            cards: event.cardIds.map((cardId) => formatCard(cardId, 'neutral')),
            combination: cloneJson(event.combination),
            remainingCards: event.remainingCards,
            bombCount: event.bombCount,
            multiplier: event.multiplier
        };
    case 'pass':
        return { ...base, seat: event.seat, passCount: event.passCount };
    case 'trick-reset':
        return { ...base, leaderSeat: event.leaderSeat };
    case 'game-finished':
        return {
            ...base,
            winningTeam: event.winningTeam,
            finishingSeat: event.finishingSeat,
            score: cloneJson(event.score)
        };
    default:
        return base;
    }
}

function projectState(state, seat) {
    validateState(state);
    assertSeat(seat, 'viewer seat');
    const canAct = state.phase !== 'finished' && state.turnSeat === seat;
    const bids = canAct && state.phase === 'bidding' ? legalBids(state) : [];
    const lastMove = state.trick.lastMove ? {
        ...cloneJson(state.trick.lastMove),
        cards: state.trick.lastMove.cardIds.map((cardId) => formatCard(cardId, 'neutral'))
    } : null;
    return {
        rulesVersion: state.rulesVersion,
        phase: state.phase,
        revision: state.revision,
        dealNumber: state.dealNumber,
        viewerSeat: seat,
        humanSeat: state.humanSeat,
        turnSeat: state.turnSeat,
        firstBidder: state.firstBidder,
        markerCard: formatCard(state.markerCard, 'neutral'),
        seats: state.seats.map((player, playerSeat) => ({
            seat: playerSeat,
            kind: player.kind,
            role: state.roles[playerSeat],
            cardCount: state.hands[playerSeat].length,
            isViewer: playerSeat === seat
        })),
        bidding: {
            highestBid: state.bidding.highestBid,
            highestBidder: state.bidding.highestBidder,
            actions: cloneJson(state.bidding.actions),
            legalBids: bids
        },
        landlordSeat: state.landlordSeat,
        contractBid: state.contractBid,
        bottomCards: state.bottomRevealed
            ? state.bottomCards.map((cardId) => formatCard(cardId, 'neutral'))
            : [],
        hand: state.hands[seat].map((cardId) => formatCard(cardId, 'neutral')),
        trick: {
            lastPlayerSeat: state.trick.lastPlayerSeat,
            passCount: state.trick.passCount,
            lastMove
        },
        bombCount: state.bombCount,
        multiplier: state.multiplier,
        history: state.history.map(projectEvent),
        legal: {
            canAct,
            canPass: canAct && state.phase === 'playing' && state.trick.lastMove !== null,
            mustLead: canAct && state.phase === 'playing' && state.trick.lastMove === null,
            legalBids: bids
        },
        outcome: state.winner ? {
            winningTeam: state.winner.team,
            finishingSeat: state.winner.finishingSeat,
            score: cloneJson(state.score)
        } : null
    };
}

function projectObservation(state, seat) {
    return projectState(state, seat);
}

module.exports = {
    DoudizhuRuleError,
    applyCommand,
    createGame,
    legalBids,
    nextSeat,
    projectObservation,
    projectState,
    validateState
};
