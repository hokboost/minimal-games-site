'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, safeInteger } = require('../streamer-games/shared');

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(entry => entry.id === id);
    if (!challenge) throw new TypeError('Unknown crafting recipe');
    return challenge;
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    return {
        ...baseState('studio-crafting', challenge, difficulty, mode),
        materials: {},
        crafted: [],
        roomSlots: [null, null, null, null, null, null],
        gatherCycle: 0
    };
}

function recipeReady(materials, recipe) {
    return Object.entries(recipe).every(([key, amount]) => (materials[key] || 0) >= amount);
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Crafting run is not active');
    const command = assertKeys(raw, ['type', 'material', 'slot'], 'crafting action');
    const challenge = challengeById(state.challengeId, context.contentPack || config.pack);
    let materials = { ...state.materials };
    let crafted = [...state.crafted];
    let roomSlots = [...state.roomSlots];
    let gatherCycle = state.gatherCycle;
    let status = state.status;
    let score = state.score;
    if (command.type === 'gather') {
        const keys = Object.keys(challenge.recipe);
        if (!keys.includes(command.material)) throw new TypeError('Material is not used by this recipe');
        const expected = keys[gatherCycle % keys.length];
        if (command.material !== expected) throw new TypeError('This material station is resting');
        const amount = difficultyValue(state.difficulty, config.gatherAmounts);
        materials[command.material] = Math.min(20, (materials[command.material] || 0) + amount);
        gatherCycle += 1;
    } else if (command.type === 'craft') {
        if (!recipeReady(materials, challenge.recipe)) throw new TypeError('Recipe materials are incomplete');
        for (const [key, amount] of Object.entries(challenge.recipe)) materials[key] -= amount;
        crafted.push(challenge.id);
        status = 'active';
        score = 700 + Math.max(0, 300 - state.turn * 20);
    } else if (command.type === 'place') {
        const slot = safeInteger(command.slot, 0, roomSlots.length - 1, 'room slot');
        if (!crafted.includes(challenge.id)) throw new TypeError('Craft the object before placing it');
        roomSlots[slot] = challenge.id;
        status = 'completed';
        score += 200;
    } else throw new TypeError('Unknown crafting action');
    const turn = state.turn + 1;
    return {
        ...state,
        materials,
        crafted,
        roomSlots,
        gatherCycle,
        status: turn >= config.maximumActions && status !== 'completed' ? 'failed' : status,
        score,
        turn,
        history: appendHistory(state, { type: command.type, actorRole: context.actorRole })
    };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    return {
        ...publicBase(state, challenge),
        recipe: challenge.recipe,
        materialLabels: challenge.materialLabels,
        materials: state.materials,
        crafted: state.crafted,
        roomSlots: state.roomSlots,
        nextMaterial: Object.keys(challenge.recipe)[state.gatherCycle % Object.keys(challenge.recipe).length]
    };
}

module.exports = { applyAction, challengeById, createState, project, recipeReady };
