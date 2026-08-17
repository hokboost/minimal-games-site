'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, safeInteger, seeded } = require('../streamer-games/shared');

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(entry => entry.id === id);
    if (!challenge) throw new TypeError('Unknown constellation challenge');
    return challenge;
}

function createSolution(challenge) {
    const random = seeded(challenge.seed);
    const moves = [
        ...Array.from({ length: challenge.width - 1 }, () => 'right'),
        ...Array.from({ length: challenge.height - 1 }, () => 'down')
    ];
    for (let index = moves.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [moves[index], moves[swap]] = [moves[swap], moves[index]];
    }
    const cells = [];
    let x = 0;
    let y = 0;
    cells.push({ x, y, role: 'creator' });
    for (const move of moves) {
        if (move === 'right') x += 1;
        else y += 1;
        cells.push({ x, y, role: cells.length % 2 ? 'owner' : 'creator' });
    }
    return cells;
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    const solution = createSolution(challenge);
    const pathKeys = new Set(solution.map(cell => `${cell.x}:${cell.y}`));
    const random = seeded(challenge.seed ^ 0x51f15e);
    const candidates = [];
    for (let y = 0; y < challenge.height; y += 1) {
        for (let x = 0; x < challenge.width; x += 1) {
            const key = `${x}:${y}`;
            if (!pathKeys.has(key)) candidates.push(key);
        }
    }
    for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
    }
    const desired = difficultyValue(difficulty, [3, 5, 8]);
    const blockers = candidates.slice(0, Math.min(desired, candidates.length));
    return {
        ...baseState('constellation-repair', challenge, difficulty, mode),
        width: challenge.width,
        height: challenge.height,
        budget: solution.length + difficultyValue(difficulty, [5, 3, 1]),
        solution,
        blockers,
        placements: []
    };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Constellation run is not active');
    const command = assertKeys(raw, ['type', 'x', 'y'], 'constellation action');
    if (command.type !== 'place') throw new TypeError('Unknown constellation action');
    const x = safeInteger(command.x, 0, state.width - 1, 'x');
    const y = safeInteger(command.y, 0, state.height - 1, 'y');
    const key = `${x}:${y}`;
    if (state.blockers.includes(key)) throw new TypeError('Cell is blocked');
    if (state.placements.some(cell => cell.key === key)) throw new TypeError('Cell already placed');
    if (state.turn >= state.budget) throw new TypeError('Routing budget exhausted');

    const expected = state.solution[state.placements.length];
    const permitted = state.mode === 'solo' || expected.role === context.actorRole;
    if (!permitted) throw new TypeError('Partner turn required');
    const correct = expected.x === x && expected.y === y;
    const mistakes = state.mistakes + (correct ? 0 : 1);
    const limit = difficultyValue(state.difficulty, config.mistakeLimits);
    const placements = correct ? [...state.placements, { key, x, y, role: context.actorRole }] : state.placements;
    const complete = placements.length === state.solution.length;
    const failed = mistakes > limit || state.turn + 1 >= config.maximumActions;
    return {
        ...state,
        placements,
        mistakes,
        turn: state.turn + 1,
        score: complete ? Math.max(100, 1200 - mistakes * 90 - state.turn * 8) : state.score,
        status: complete ? 'completed' : failed ? 'failed' : 'active',
        history: appendHistory(state, { type: 'place', actorRole: context.actorRole, correct })
    };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    const next = state.solution[state.placements.length];
    const role = state.mode === 'solo' ? 'solo' : viewerRole;
    return {
        ...publicBase(state, challenge),
        width: state.width,
        height: state.height,
        budget: state.budget,
        placements: state.placements,
        remaining: state.solution.length - state.placements.length,
        yourTurn: state.status === 'active' && (role === 'solo' || next?.role === role),
        privateClue: role === 'owner'
            ? { blockedCells: state.blockers, nextColumn: next?.x ?? null }
            : role === 'creator' ? { nextRow: next?.y ?? null, pathLength: state.solution.length }
                : { blockedCells: state.blockers, nextColumn: next?.x ?? null, nextRow: next?.y ?? null }
    };
}

module.exports = { applyAction, challengeById, createState, project };
