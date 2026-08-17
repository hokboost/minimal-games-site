'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, seeded } = require('../streamer-games/shared');
const DIRECTIONS = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(item => item.id === id);
    if (!challenge) throw new TypeError('Unknown maze challenge');
    return challenge;
}

function buildMaze(size, seed) {
    const random = seeded(seed);
    const graph = Object.fromEntries(Array.from({ length: size * size }, (_, index) => [`${index % size}:${Math.floor(index / size)}`, []]));
    const visited = new Set(['0:0']);
    const stack = [{ x: 0, y: 0 }];
    while (stack.length) {
        const current = stack.at(-1);
        const options = Object.entries(DIRECTIONS).map(([direction, [dx, dy]]) => ({
            direction, x: current.x + dx, y: current.y + dy
        })).filter(cell => cell.x >= 0 && cell.y >= 0 && cell.x < size && cell.y < size && !visited.has(`${cell.x}:${cell.y}`));
        if (!options.length) {
            stack.pop();
            continue;
        }
        const next = options[Math.floor(random() * options.length)];
        const fromKey = `${current.x}:${current.y}`;
        const toKey = `${next.x}:${next.y}`;
        graph[fromKey].push(next.direction);
        const reverse = { up: 'down', down: 'up', left: 'right', right: 'left' }[next.direction];
        graph[toKey].push(reverse);
        visited.add(toKey);
        stack.push({ x: next.x, y: next.y });
    }
    return graph;
}

function shortestDirections(graph, start, goal) {
    const queue = [{ ...start, directions: [] }];
    const visited = new Set([`${start.x}:${start.y}`]);
    while (queue.length) {
        const current = queue.shift();
        if (current.x === goal.x && current.y === goal.y) return current.directions;
        for (const direction of graph[`${current.x}:${current.y}`]) {
            const [dx, dy] = DIRECTIONS[direction];
            const next = { x: current.x + dx, y: current.y + dy };
            const key = `${next.x}:${next.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                queue.push({ ...next, directions: [...current.directions, direction] });
            }
        }
    }
    throw new TypeError('Maze goal is unreachable');
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack, creatorUsername = '', serverDateKey = '' }) {
    const challenge = challengeById(challengeId, contentPack);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serverDateKey)) throw new TypeError('Server date is required');
    const identitySeed = [...creatorUsername].reduce((sum, char) => (sum + char.codePointAt(0) * 31) >>> 0, 0);
    const dateSeed = Number(serverDateKey.replaceAll('-', ''));
    const size = difficultyValue(difficulty, config.sizes);
    return {
        ...baseState('dream-maze', challenge, difficulty, mode),
        dailyKey: serverDateKey,
        size,
        graph: buildMaze(size, challenge.seed ^ identitySeed ^ dateSeed),
        goal: { x: size - 1, y: size - 1 },
        position: { x: 0, y: 0 },
        visited: ['0:0'],
        hintsRemaining: difficultyValue(difficulty, config.hints),
        lastHint: null
    };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Maze run is not active');
    if (raw?.type === 'hint') {
        const action = assertKeys(raw, ['type'], 'maze hint');
        if (state.mode === 'coop' && context.actorRole !== 'owner') throw new TypeError('Only the owner sends maze hints');
        if (state.hintsRemaining < 1) throw new TypeError('No maze hint available');
        const direction = shortestDirections(state.graph, state.position, state.goal)[0];
        return { ...state, hintsRemaining: state.hintsRemaining - 1, lastHint: direction,
            turn: state.turn + 1, history: appendHistory(state, { type: 'hint' }) };
    }
    const action = assertKeys(raw, ['type', 'direction'], 'maze move');
    if (context.actorRole !== 'creator') throw new TypeError('Only the creator navigates the maze');
    if (action.type !== 'move' || !Object.hasOwn(DIRECTIONS, action.direction)) throw new TypeError('Unknown maze action');
    const [dx, dy] = DIRECTIONS[action.direction];
    const target = { x: state.position.x + dx, y: state.position.y + dy };
    const correct = state.graph[`${state.position.x}:${state.position.y}`].includes(action.direction);
    const mistakes = state.mistakes + (correct ? 0 : 1);
    const complete = correct && target.x === state.goal.x && target.y === state.goal.y;
    const failed = state.turn + 1 >= config.maximumActions;
    const position = correct ? target : state.position;
    return {
        ...state,
        position,
        visited: correct ? [...new Set([...state.visited, `${target.x}:${target.y}`])] : state.visited,
        lastHint: null,
        mistakes,
        turn: state.turn + 1,
        status: complete ? 'completed' : failed ? 'failed' : 'active',
        score: complete ? Math.max(100, 1200 - mistakes * 70 - (difficultyValue(state.difficulty, config.hints) - state.hintsRemaining) * 40) : state.score,
        history: appendHistory(state, { type: 'move', direction: action.direction, correct })
    };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    const legalDirections = state.graph[`${state.position.x}:${state.position.y}`];
    return { ...publicBase(state, challenge), dailyKey: state.dailyKey, size: state.size,
        position: state.position, visited: state.visited, hintsRemaining: state.hintsRemaining,
        lastHint: state.lastHint, canNavigate: viewerRole === 'creator', canHint: state.mode === 'solo' || viewerRole === 'owner', legalDirections };
}

module.exports = { applyAction, buildMaze, challengeById, createState, project, shortestDirections };
