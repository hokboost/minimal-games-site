'use strict';

const { COMBINATION_TYPES: TYPES, RULE_PROFILE } = require('./constants');
const {
    cardsToRankCounts,
    createDeck,
    getCardRank,
    shuffleCards,
    sortCards
} = require('./cards');
const { generateLegalMoves } = require('./moves');
const {
    DoudizhuRuleError,
    applyCommand,
    projectObservation,
    validateState
} = require('./engine');

function clampInteger(value, fallback, minimum, maximum) {
    if (value === undefined || value === null) return fallback;
    if (!Number.isFinite(value)) throw new TypeError('AI limit must be finite');
    return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function createBudget(options = {}) {
    const maxNodes = clampInteger(
        options.maxNodes,
        RULE_PROFILE.ai.defaultMaxNodes,
        1,
        RULE_PROFILE.ai.hardMaxNodes
    );
    const deadlineMs = clampInteger(
        options.deadlineMs,
        RULE_PROFILE.ai.defaultDeadlineMs,
        1,
        RULE_PROFILE.ai.hardDeadlineMs
    );
    const now = typeof options.clock === 'function' ? options.clock : Date.now;
    const deadline = now() + deadlineMs;
    return {
        maxNodes,
        nodes: 0,
        deadline,
        now,
        consume(count = 1) {
            if (this.nodes + count > this.maxNodes || this.now() >= this.deadline) return false;
            this.nodes += count;
            return true;
        },
        expired() {
            return this.nodes >= this.maxNodes || this.now() >= this.deadline;
        }
    };
}

function handKey(hand) {
    return cardsToRankCounts(hand).join('');
}

function removeMove(hand, move) {
    const selected = new Set(move.cardIds);
    return hand.filter((cardId) => !selected.has(cardId));
}

function greedyTurnEstimate(hand) {
    if (hand.length === 0) return 0;
    const counts = cardsToRankCounts(hand);
    let groups = 0;
    for (const count of counts) {
        if (count > 0) groups += 1;
    }
    // Playing each non-empty rank as one single/pair/triple/bomb is always a
    // legal decomposition, so this remains a real upper bound when search is cut short.
    return Math.max(1, groups);
}

function minimumTurns(hand, budget, cache = new Map()) {
    if (hand.length === 0) return 0;
    const key = handKey(hand);
    if (cache.has(key)) return cache.get(key);
    if (!budget.consume()) return greedyTurnEstimate(hand);
    let moves = generateLegalMoves(hand);
    if (moves.some((move) => move.cardIds.length === hand.length)) {
        cache.set(key, 1);
        return 1;
    }
    moves = moves
        .sort((left, right) => right.cardIds.length - left.cardIds.length
            || left.combination.mainRank - right.combination.mainRank)
        .slice(0, 28);
    let best = greedyTurnEstimate(hand);
    for (const move of moves) {
        if (budget.expired()) break;
        best = Math.min(best, 1 + minimumTurns(removeMove(hand, move), budget, cache));
        if (best <= 2) break;
    }
    cache.set(key, best);
    return best;
}

function controlValue(hand) {
    const counts = cardsToRankCounts(hand);
    let value = counts[14] * 5 + counts[13] * 4 + counts[12] * 1.75 + counts[11] * 0.75;
    for (let rank = 0; rank <= 12; rank += 1) {
        if (counts[rank] === 4) value += 6 + rank * 0.1;
    }
    if (counts[13] && counts[14]) value += 4;
    return value;
}

function suggestBid(observation, budget) {
    const legal = observation.bidding.legalBids;
    if (legal.length === 0) throw new DoudizhuRuleError('OUT_OF_TURN', 'Seat cannot bid now');
    const hand = observation.hand.map((card) => card.id);
    const turns = minimumTurns(hand, budget, new Map());
    const strength = controlValue(hand) + Math.max(0, 9 - turns) * 1.35;
    let target = 0;
    if (strength >= 20) target = 3;
    else if (strength >= 14) target = 2;
    else if (strength >= 8.5) target = 1;
    const available = legal.filter((bid) => bid <= target);
    return {
        type: 'bid',
        seat: observation.viewerSeat,
        bid: available.length ? Math.max(...available) : 0
    };
}

function teamForSeat(observation, seat) {
    return seat === observation.landlordSeat ? 'landlord' : 'farmers';
}

function rankCost(move) {
    const type = move.combination.type;
    const bombPenalty = type === TYPES.ROCKET ? 900
        : type === TYPES.BOMB ? 700 : 0;
    return bombPenalty + move.combination.mainRank * 2 - move.cardIds.length * 5;
}

function chooseHeuristicMove(observation, moves, budget) {
    const seat = observation.viewerSeat;
    const ownHand = observation.hand.map((card) => card.id);
    const ownRole = observation.seats[seat].role;
    const landlord = observation.seats[observation.landlordSeat];
    const lastSeat = observation.trick.lastPlayerSeat;

    const winningMoves = moves.filter((move) => move.cardIds.length === ownHand.length);
    if (winningMoves.length) return winningMoves.sort((left, right) => rankCost(left) - rankCost(right))[0];

    if (ownRole === 'farmer' && lastSeat !== null
        && lastSeat !== observation.landlordSeat
        && lastSeat !== seat
        && landlord.cardCount > 2) {
        return null;
    }

    if (observation.trick.lastMove === null && ownRole === 'farmer') {
        const teammate = observation.seats.find((player) => (
            player.seat !== seat && player.role === 'farmer'
        ));
        if (teammate?.cardCount === 1) {
            const singles = moves.filter((move) => move.combination.type === TYPES.SINGLE);
            if (singles.length) {
                return singles.sort((left, right) => left.combination.mainRank
                    - right.combination.mainRank)[0];
            }
        }
    }

    let candidates = [...moves];
    const nonBombs = candidates.filter((move) => ![TYPES.BOMB, TYPES.ROCKET].includes(
        move.combination.type
    ));
    if (nonBombs.length && !(ownRole === 'farmer' && landlord.cardCount <= 1)) {
        candidates = nonBombs;
    }
    if (ownRole === 'farmer' && landlord.cardCount === 1
        && observation.trick.lastMove === null) {
        const nonSingles = candidates.filter((move) => move.combination.type !== TYPES.SINGLE);
        if (nonSingles.length) candidates = nonSingles;
    }

    const cache = new Map();
    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const move of candidates) {
        if (budget.expired()) break;
        const remaining = removeMove(ownHand, move);
        const turns = minimumTurns(remaining, budget, cache);
        let score = turns * 100 + rankCost(move);
        if (observation.trick.lastMove && move.combination.type === TYPES.SINGLE) {
            score += move.combination.mainRank;
        }
        if (ownRole === 'farmer' && landlord.cardCount === 1
            && move.combination.type === TYPES.SINGLE) score -= 40;
        if (score < bestScore) {
            best = move;
            bestScore = score;
        }
    }
    return best;
}

function forceKnownCard(cardId, ownerSeat, ownSeat, playedSet, unknownSet, forcedHands) {
    if (!cardId || ownerSeat === ownSeat || playedSet.has(cardId) || !unknownSet.has(cardId)) return;
    unknownSet.delete(cardId);
    forcedHands[ownerSeat].push(cardId);
}

function determinizeObservation(observation, rng) {
    const ownSeat = observation.viewerSeat;
    const ownHand = observation.hand.map((card) => card.id);
    const played = observation.history
        .filter((event) => event.type === 'play')
        .flatMap((event) => event.cardIds || []);
    const playedSet = new Set(played);
    const known = new Set([...ownHand, ...played]);
    const unknownSet = new Set(createDeck().filter((cardId) => !known.has(cardId)));
    const hands = Array.from({ length: 3 }, () => []);
    hands[ownSeat] = sortCards(ownHand);

    if (observation.landlordSeat !== null) {
        for (const card of observation.bottomCards) {
            forceKnownCard(
                card.id,
                observation.landlordSeat,
                ownSeat,
                playedSet,
                unknownSet,
                hands
            );
        }
    }
    forceKnownCard(
        observation.markerCard.id,
        observation.firstBidder,
        ownSeat,
        playedSet,
        unknownSet,
        hands
    );

    const shuffled = shuffleCards([...unknownSet], rng);
    let cursor = 0;
    for (const player of observation.seats) {
        if (player.seat === ownSeat) continue;
        const needed = player.cardCount - hands[player.seat].length;
        if (needed < 0 || cursor + needed > shuffled.length) return null;
        hands[player.seat].push(...shuffled.slice(cursor, cursor + needed));
        hands[player.seat] = sortCards(hands[player.seat]);
        cursor += needed;
    }
    if (cursor !== shuffled.length) return null;
    return {
        hands,
        turnSeat: observation.turnSeat,
        landlordSeat: observation.landlordSeat,
        lastMove: observation.trick.lastMove ? {
            seat: observation.trick.lastMove.seat,
            cardIds: [...observation.trick.lastMove.cardIds],
            combination: { ...observation.trick.lastMove.combination }
        } : null,
        lastPlayerSeat: observation.trick.lastPlayerSeat,
        passCount: observation.trick.passCount,
        winnerTeam: null
    };
}

function positionKey(position, depth) {
    const hands = position.hands.map((hand) => handKey(hand)).join('|');
    const target = position.lastMove
        ? `${position.lastMove.seat}:${position.lastMove.combination.type}:${position.lastMove.combination.mainRank}:${position.lastMove.combination.chainLength}:${position.lastMove.combination.cardCount}`
        : '-';
    return `${depth}/${position.turnSeat}/${position.lastPlayerSeat ?? '-'}/${position.passCount}/${target}/${hands}`;
}

function simulateAction(position, action) {
    const next = {
        ...position,
        hands: position.hands.map((hand) => [...hand]),
        lastMove: position.lastMove ? {
            ...position.lastMove,
            cardIds: [...position.lastMove.cardIds],
            combination: { ...position.lastMove.combination }
        } : null
    };
    const seat = position.turnSeat;
    if (action === null) {
        const passCount = position.passCount + 1;
        if (passCount >= 2) {
            next.turnSeat = position.lastPlayerSeat;
            next.lastMove = null;
            next.lastPlayerSeat = null;
            next.passCount = 0;
        } else {
            next.turnSeat = (seat + 1) % 3;
            next.passCount = passCount;
        }
        return next;
    }
    next.hands[seat] = removeMove(next.hands[seat], action);
    if (next.hands[seat].length === 0) {
        next.winnerTeam = seat === next.landlordSeat ? 'landlord' : 'farmers';
        return next;
    }
    next.lastMove = {
        seat,
        cardIds: [...action.cardIds],
        combination: { ...action.combination }
    };
    next.lastPlayerSeat = seat;
    next.passCount = 0;
    next.turnSeat = (seat + 1) % 3;
    return next;
}

function staticPositionValue(position, rootTeam) {
    if (position.winnerTeam) return position.winnerTeam === rootTeam ? 100000 : -100000;
    const landlordCards = position.hands[position.landlordSeat].length;
    const farmerCards = position.hands
        .filter((_, seat) => seat !== position.landlordSeat)
        .map((hand) => hand.length);
    const landlordAdvantage = Math.min(...farmerCards) * 14 - landlordCards * 12
        + controlValue(position.hands[position.landlordSeat]);
    return rootTeam === 'landlord' ? landlordAdvantage : -landlordAdvantage;
}

function orderedPositionActions(position) {
    const seat = position.turnSeat;
    const moves = generateLegalMoves(position.hands[seat], position.lastMove?.combination || null);
    moves.sort((left, right) => {
        const leftWins = left.cardIds.length === position.hands[seat].length ? 1 : 0;
        const rightWins = right.cardIds.length === position.hands[seat].length ? 1 : 0;
        return rightWins - leftWins
            || right.cardIds.length - left.cardIds.length
            || rankCost(left) - rankCost(right);
    });
    if (position.lastMove) moves.push(null);
    return moves;
}

function coalitionSearch(position, rootTeam, depth, alpha, beta, budget, memo) {
    if (position.winnerTeam || depth <= 0 || !budget.consume()) {
        return { value: staticPositionValue(position, rootTeam), action: null };
    }
    const key = positionKey(position, depth);
    if (memo.has(key)) return { value: memo.get(key), action: null };
    const actions = orderedPositionActions(position);
    const maximizing = teamForSeat({ landlordSeat: position.landlordSeat }, position.turnSeat)
        === rootTeam;
    let bestValue = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    let bestAction = actions[0] ?? null;
    for (const action of actions) {
        if (budget.expired()) break;
        const child = simulateAction(position, action);
        const value = coalitionSearch(child, rootTeam, depth - 1, alpha, beta, budget, memo).value;
        if ((maximizing && value > bestValue) || (!maximizing && value < bestValue)) {
            bestValue = value;
            bestAction = action;
        }
        if (maximizing) alpha = Math.max(alpha, bestValue);
        else beta = Math.min(beta, bestValue);
        if (beta <= alpha) break;
    }
    if (!Number.isFinite(bestValue)) bestValue = staticPositionValue(position, rootTeam);
    memo.set(key, bestValue);
    return { value: bestValue, action: bestAction };
}

function chooseEndgameMove(observation, budget, rng) {
    const totalCards = observation.seats.reduce((sum, player) => sum + player.cardCount, 0);
    if (totalCards > RULE_PROFILE.ai.exactEndgameCardLimit || budget.expired()) return undefined;
    const position = determinizeObservation(observation, rng);
    if (!position) return undefined;
    const rootTeam = teamForSeat(observation, observation.viewerSeat);
    const depth = Math.min(40, totalCards * 3 + 4);
    return coalitionSearch(
        position,
        rootTeam,
        depth,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        budget,
        new Map()
    ).action;
}

function suggestFromObservation(observation, options = {}) {
    const budget = createBudget(options);
    if (!observation.legal.canAct) {
        throw new DoudizhuRuleError('OUT_OF_TURN', 'Seat cannot act now');
    }
    if (observation.phase === 'bidding') return suggestBid(observation, budget);
    if (observation.phase !== 'playing') {
        throw new DoudizhuRuleError('GAME_FINISHED', 'The match is already finished');
    }
    const hand = observation.hand.map((card) => card.id);
    const target = observation.trick.lastMove?.combination || null;
    const moves = generateLegalMoves(hand, target);
    if (moves.length === 0) {
        if (!observation.legal.canPass) {
            throw new Error('Move generator found no legal lead');
        }
        return { type: 'pass', seat: observation.viewerSeat };
    }

    const exact = chooseEndgameMove(observation, budget, options.rng);
    let selected;
    if (exact === null && observation.legal.canPass) {
        return { type: 'pass', seat: observation.viewerSeat };
    }
    if (exact) {
        selected = moves.find((move) => move.cardIds.join(',') === exact.cardIds.join(','));
    }
    if (!selected) selected = chooseHeuristicMove(observation, moves, budget);
    if (!selected) return { type: 'pass', seat: observation.viewerSeat };
    return { type: 'play', seat: observation.viewerSeat, cardIds: [...selected.cardIds] };
}

function suggestMove(state, seat, options = {}) {
    validateState(state);
    const observation = projectObservation(state, seat);
    return suggestFromObservation(observation, options);
}

function advanceBots(inputState, options = {}) {
    validateState(inputState);
    const maxActions = clampInteger(
        options.maxActions,
        RULE_PROFILE.ai.defaultMaxBotActions,
        1,
        RULE_PROFILE.ai.hardMaxBotActions
    );
    let state = inputState;
    const events = [];
    let actions = 0;
    while (state.phase !== 'finished' && state.seats[state.turnSeat].kind === 'bot'
        && actions < maxActions) {
        const command = suggestMove(state, state.turnSeat, options);
        const applied = applyCommand(state, command, { rng: options.rng });
        state = applied.state;
        events.push(...applied.events);
        actions += 1;
    }
    return { state, events };
}

module.exports = {
    advanceBots,
    createBudget,
    minimumTurns,
    suggestFromObservation,
    suggestMove
};
