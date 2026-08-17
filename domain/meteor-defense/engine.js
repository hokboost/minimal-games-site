'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, safeInteger, seeded } = require('../streamer-games/shared');

const MODIFIER_RULES = Object.freeze({
    crosswind: 'shift', fragile: 'harsh', switchback: 'shift', flood: 'harsh', embers: 'harsh',
    gravity: 'shift', escort: 'harsh', static: 'static', steam: 'beacon', rotation: 'harsh',
    aurora: 'beacon', tremor: 'tremor', fork: 'shift', drift: 'shift', salvage: 'harsh',
    'repair-limit': 'harsh', balance: 'harsh', masked: 'masked', finale: 'harsh'
});

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(item => item.id === id);
    if (!challenge) throw new TypeError('Unknown meteor challenge');
    return challenge;
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    const rule = MODIFIER_RULES[challenge.modifier];
    if (!rule) throw new TypeError('Unknown meteor modifier');
    const random = seeded(challenge.seed + difficultyValue(difficulty, [0, 997, 1999]));
    const threats = Array.from({ length: challenge.waves }, (_, wave) => {
        let lane = Math.floor(random() * challenge.lanes);
        if (rule === 'shift' && wave % 2 === 1) lane = (lane + 1) % challenge.lanes;
        const strength = 1 + Math.floor(random() * difficultyValue(difficulty, [2, 3, 4]))
            + Number(rule === 'harsh' && wave % 3 === 2);
        return { lane, strength, wave };
    });
    return {
        ...baseState('meteor-defense', challenge, difficulty, mode),
        lanes: challenge.lanes,
        threats,
        wave: 0,
        integrity: difficultyValue(difficulty, config.integrity),
        energy: difficultyValue(difficulty, config.energy),
        forts: Array(challenge.lanes).fill(0),
        beacon: null,
        fortifiedThisWave: false,
        lastResolvedLane: null,
        modifier: challenge.modifier
    };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Meteor run is not active');
    const creatorAction = state.mode === 'solo' || context.actorRole === 'creator';
    const ownerAction = state.mode === 'solo' || context.actorRole === 'owner';
    const resolving = raw?.type === 'resolve';
    const action = assertKeys(raw, resolving ? ['type'] : ['type', 'lane'], 'meteor action');
    const lane = resolving ? null : safeInteger(action.lane, 0, state.lanes - 1, 'lane');
    let next = { ...state };
    if (action.type === 'fortify') {
        if (!creatorAction || state.energy < 1 || state.fortifiedThisWave) throw new TypeError('Creator defense action unavailable');
        next.energy -= 1;
        next.forts = state.forts.map((value, index) => value + (index === lane ? 1 : 0));
        next.fortifiedThisWave = true;
    } else if (action.type === 'beacon') {
        if (!ownerAction || state.beacon !== null || state.energy < 1) throw new TypeError('Support beacon unavailable');
        next.energy -= 1;
        next.beacon = lane;
    } else if (action.type === 'resolve') {
        if (!creatorAction) throw new TypeError('Only the creator advances the defense');
        const threat = state.threats[state.wave];
        const beaconPower = state.modifier === 'aurora' || state.modifier === 'steam' ? 3 : 2;
        const absorbed = state.forts[threat.lane] + (state.beacon === threat.lane ? beaconPower : 0);
        let damage = Math.max(0, threat.strength - absorbed);
        if (state.modifier === 'static' && state.lastResolvedLane === threat.lane) damage += 1;
        const wave = state.wave + 1;
        const integrity = state.integrity - damage;
        const completed = wave >= state.threats.length && integrity > 0;
        next = {
            ...state,
            wave,
            integrity,
            energy: state.modifier === 'tremor' && wave % 3 === 0 ? 0
                : Math.min(difficultyValue(state.difficulty, config.energy), state.energy + 1),
            forts: state.forts.map((value, index) => Math.max(0, value - (index === threat.lane ? threat.strength : 0))),
            beacon: null,
            fortifiedThisWave: false,
            lastResolvedLane: threat.lane,
            score: completed ? Math.max(100, integrity * 100 + state.energy * 20) : state.score,
            status: completed ? 'completed' : integrity <= 0 ? 'failed' : 'active'
        };
    } else {
        throw new TypeError('Unknown meteor action');
    }
    next.turn = state.turn + 1;
    if (next.turn >= config.maximumActions && next.status === 'active') next.status = 'failed';
    next.history = appendHistory(state, { type: action.type, ...(lane === null ? {} : { lane }), actorRole: context.actorRole });
    return next;
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    const threat = state.threats[state.wave];
    const solo = state.mode === 'solo';
    return {
        ...publicBase(state, challenge), lanes: state.lanes, wave: state.wave,
        waveCount: state.threats.length, integrity: state.integrity, energy: state.energy,
        forts: state.forts, beacon: state.beacon, modifier: state.modifier,
        fortifiedThisWave: state.fortifiedThisWave, yourRole: solo ? 'solo' : viewerRole,
        currentThreat: threat ? {
            lane: solo || viewerRole === 'creator' ? threat.lane : null,
            strength: solo || viewerRole === 'owner' ? threat.strength : null
        } : null
    };
}

module.exports = { MODIFIER_RULES, applyAction, challengeById, createState, project };
