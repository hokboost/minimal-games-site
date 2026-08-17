'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, safeInteger, seeded } = require('../streamer-games/shared');

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(entry => entry.id === id);
    if (!challenge) throw new TypeError('Unknown signal challenge');
    return challenge;
}

function beatPattern(challenge) {
    const random = seeded(challenge.seed);
    const interval = Math.round(60000 / challenge.bpm);
    let offsetMs = 0;
    return Array.from({ length: challenge.beats }, (_, index) => {
        if (index > 0) offsetMs += interval + (random() > 0.72 ? Math.round(interval / 2) : 0);
        return { index, offsetMs, intervalMs: interval,
            role: index % 2 ? 'owner' : 'creator', accent: random() > 0.66 ? 'bright' : 'soft' };
    });
}

function createState({ challengeId, difficulty, mode, serverStartedAtMs, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    safeInteger(serverStartedAtMs, 1, Number.MAX_SAFE_INTEGER, 'server start time');
    return {
        ...baseState('signal-duet', challenge, difficulty, mode),
        bpm: challenge.bpm,
        beats: beatPattern(challenge),
        hits: [],
        startedAtMs: serverStartedAtMs,
        nextBeatAtMs: serverStartedAtMs + 1800
    };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Signal run is not active');
    const command = assertKeys(raw, ['type', 'beatIndex'], 'signal action');
    if (command.type !== 'tap') throw new TypeError('Unknown signal action');
    const beatIndex = safeInteger(command.beatIndex, 0, state.beats.length - 1, 'beat index');
    if (beatIndex !== state.hits.length) throw new TypeError('Beat order mismatch');
    const beat = state.beats[beatIndex];
    if (state.mode === 'coop' && beat.role !== context.actorRole) throw new TypeError('Partner beat required');
    const serverNowMs = safeInteger(context.serverNowMs, 1, Number.MAX_SAFE_INTEGER, 'server clock');
    const delta = Math.abs(serverNowMs - state.nextBeatAtMs);
    const windowMs = difficultyValue(state.difficulty, config.timingWindowsMs);
    const hit = delta <= windowMs;
    const hits = [...state.hits, { index: beatIndex, role: context.actorRole, hit, delta: Math.min(delta, 9999) }];
    const complete = hits.length === state.beats.length;
    const mistakes = state.mistakes + (hit ? 0 : 1);
    const nextBeat = state.beats[hits.length];
    return {
        ...state,
        hits,
        nextBeatAtMs: nextBeat ? serverNowMs + nextBeat.intervalMs : null,
        mistakes,
        turn: state.turn + 1,
        score: complete ? Math.max(100, hits.filter(entry => entry.hit).length * 100 - mistakes * 20) : state.score,
        status: complete ? 'completed' : state.turn + 1 >= config.maximumActions ? 'failed' : 'active',
        history: appendHistory(state, { type: 'tap', actorRole: context.actorRole, hit })
    };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    const next = state.beats[state.hits.length];
    const role = state.mode === 'solo' ? 'solo' : viewerRole;
    const visible = state.beats
        .filter(beat => role === 'solo' || beat.role === role || beat.index < state.hits.length)
        .map(beat => ({ index: beat.index, accent: beat.accent, completed: beat.index < state.hits.length }));
    return {
        ...publicBase(state, challenge),
        bpm: state.bpm,
        totalBeats: state.beats.length,
        completedBeats: state.hits.length,
        nextBeatAtMs: state.nextBeatAtMs,
        timingWindowMs: difficultyValue(state.difficulty, config.timingWindowsMs),
        yourTurn: state.status === 'active' && (role === 'solo' || next?.role === role),
        visibleBeats: visible
    };
}

module.exports = { applyAction, beatPattern, challengeById, createState, project };
