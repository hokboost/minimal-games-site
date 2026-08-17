'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, seeded, token } = require('../streamer-games/shared');
const SYMBOLS = Object.freeze(['circle', 'wave', 'star', 'leaf', 'bell', 'key']);

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(item => item.id === id);
    if (!challenge) throw new TypeError('Unknown echo challenge');
    return challenge;
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    const random = seeded(challenge.seed);
    const length = difficultyValue(difficulty, config.lengths);
    const sequence = Array.from({ length }, () => SYMBOLS[Math.floor(random() * SYMBOLS.length)]);
    return { ...baseState('echo-memory', challenge, difficulty, mode), sequence, studied: [], recallIndex: 0, phase: 'study' };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Echo run is not active');
    const action = assertKeys(raw, ['type', 'symbol'], 'echo action');
    let next = { ...state };
    if (action.type === 'study') {
        if (action.symbol !== undefined) throw new TypeError('Study has no symbol');
        const role = state.mode === 'solo' ? 'creator' : context.actorRole;
        if (state.studied.includes(role)) throw new TypeError('Role already studied');
        const studied = [...state.studied, role];
        next = { ...state, studied, phase: state.mode === 'solo' || studied.includes('creator') && studied.includes('owner') ? 'recall' : 'study' };
    } else if (action.type === 'echo') {
        if (state.phase !== 'recall') throw new TypeError('Study before recall');
        token(action.symbol, /^(circle|wave|star|leaf|bell|key)$/, 'symbol');
        const expectedRole = state.mode === 'solo' ? context.actorRole : state.recallIndex % 2 === 0 ? 'creator' : 'owner';
        if (context.actorRole !== expectedRole && state.mode !== 'solo') throw new TypeError('Partner recall turn required');
        const correct = state.sequence[state.recallIndex] === action.symbol;
        const mistakes = state.mistakes + (correct ? 0 : 1);
        const recallIndex = state.recallIndex + (correct ? 1 : 0);
        const completed = recallIndex === state.sequence.length;
        next = { ...state, mistakes, recallIndex, status: completed ? 'completed' : mistakes > difficultyValue(state.difficulty, config.mistakes) ? 'failed' : 'active',
            score: completed ? Math.max(100, 1000 - mistakes * 150) : state.score };
    } else throw new TypeError('Unknown echo action');
    next.turn = state.turn + 1;
    next.history = appendHistory(state, { type: action.type, actorRole: context.actorRole });
    return next;
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    const solo = state.mode === 'solo';
    const indices = state.sequence.map((_, index) => index).filter(index => solo || (viewerRole === 'creator' ? index % 2 === 0 : index % 2 === 1));
    const clue = indices.map(index => ({ index, symbol: state.sequence[index] }));
    return { ...publicBase(state, challenge), phase: state.phase, studied: state.studied,
        recallIndex: state.recallIndex, length: state.sequence.length,
        yourTurn: state.phase === 'study' ? !state.studied.includes(viewerRole) : solo || (state.recallIndex % 2 === 0 ? viewerRole === 'creator' : viewerRole === 'owner'),
        privateClue: state.phase === 'study' ? clue : [], symbols: SYMBOLS };
}

module.exports = { applyAction, challengeById, createState, project };
