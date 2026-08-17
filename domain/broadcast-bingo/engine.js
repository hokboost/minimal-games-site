'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, token } = require('../streamer-games/shared');

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(item => item.id === id);
    if (!challenge) throw new TypeError('Unknown bingo challenge');
    return challenge;
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    const cells = Array.from({ length: 25 }, (_, index) => ({ id: `cell-${index + 1}`, eventKey: challenge.eventKeys[index % challenge.eventKeys.length], marked: false }));
    return { ...baseState('broadcast-bingo', challenge, difficulty, mode), cells, acceptedSourceEvents: [] };
}

function completedLines(cells) {
    const lines = [];
    for (let index = 0; index < 5; index += 1) {
        lines.push([0, 1, 2, 3, 4].map(offset => index * 5 + offset));
        lines.push([0, 1, 2, 3, 4].map(offset => offset * 5 + index));
    }
    lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
    return lines.filter(line => line.every(index => cells[index].marked)).length;
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Bingo run is not active');
    const action = assertKeys(raw, ['type', 'eventKey', 'sourceEventId'], 'bingo action');
    if (action.type !== 'trusted_event' || context.trusted !== true) throw new TypeError('Bingo accepts trusted server events only');
    token(action.eventKey, /^[a-z][a-z0-9_.-]{2,79}$/, 'event key');
    token(action.sourceEventId, /^[A-Za-z0-9:_.-]{8,160}$/, 'source event id');
    if (state.acceptedSourceEvents.includes(action.sourceEventId)) return state;
    const index = state.cells.findIndex(cell => !cell.marked && cell.eventKey === action.eventKey);
    const cells = state.cells.map((cell, cellIndex) => cellIndex === index ? { ...cell, marked: true } : cell);
    const lines = completedLines(cells);
    const target = difficultyValue(state.difficulty, config.lineTargets);
    const complete = state.difficulty === 'expert' ? cells.every(cell => cell.marked) : lines >= target;
    return { ...state, cells, acceptedSourceEvents: [...state.acceptedSourceEvents, action.sourceEventId].slice(-80),
        turn: state.turn + 1, status: complete ? 'completed' : 'active', score: complete ? 500 + lines * 100 : state.score,
        history: appendHistory(state, { type: 'trusted_event', eventKey: action.eventKey, matched: index >= 0 }) };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    const labels = new Map(contentPack.safeEventKinds.map(([key, zh, en]) => [key, { zh, en }]));
    return { ...publicBase(state, challenge), cells: state.cells.map(cell => ({ id: cell.id, marked: cell.marked,
        eventKey: cell.eventKey, labelZh: labels.get(cell.eventKey)?.zh, labelEn: labels.get(cell.eventKey)?.en })),
    completedLines: completedLines(state.cells), trustedEventsOnly: true, interactive: false };
}

module.exports = { applyAction, challengeById, completedLines, createState, project };
