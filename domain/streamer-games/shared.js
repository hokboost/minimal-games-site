'use strict';

const DIFFICULTIES = Object.freeze(['gentle', 'standard', 'expert']);
const MODES = Object.freeze(['solo', 'coop']);

function assertObject(value, label = 'value') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
    return value;
}

function assertKeys(value, allowed, label = 'value') {
    assertObject(value, label);
    const unknown = Object.keys(value).find(key => !allowed.includes(key));
    if (unknown) throw new TypeError(`Unexpected ${label} field: ${unknown}`);
    return value;
}

function safeInteger(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`Invalid ${label}`);
    return value;
}

function token(value, pattern, label) {
    if (typeof value !== 'string' || !pattern.test(value)) throw new TypeError(`Invalid ${label}`);
    return value;
}

function seeded(seed) {
    let value = Number(seed) >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function shuffled(count, seed) {
    const values = Array.from({ length: count }, (_, index) => index);
    const random = seeded(seed);
    for (let index = values.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [values[index], values[swap]] = [values[swap], values[index]];
    }
    return values;
}

function baseState(gameId, challenge, difficulty, mode) {
    if (!DIFFICULTIES.includes(difficulty) || !MODES.includes(mode)) throw new TypeError('Invalid game setup');
    return {
        schemaVersion: 1,
        gameId,
        challengeId: challenge.id,
        difficulty,
        mode,
        status: 'active',
        turn: 0,
        score: 0,
        mistakes: 0,
        history: []
    };
}

function appendHistory(state, entry, maximum = 80) {
    return [...state.history, entry].slice(-maximum);
}

function difficultyValue(difficulty, values) {
    const index = DIFFICULTIES.indexOf(difficulty);
    if (index < 0) throw new TypeError('Invalid difficulty');
    return values[index];
}

function publicBase(state, challenge) {
    return {
        schemaVersion: state.schemaVersion,
        gameId: state.gameId,
        challengeId: state.challengeId,
        difficulty: state.difficulty,
        mode: state.mode,
        status: state.status,
        turn: state.turn,
        score: state.score,
        mistakes: state.mistakes,
        titleZh: challenge.titleZh,
        titleEn: challenge.titleEn,
        briefZh: challenge.briefZh,
        briefEn: challenge.briefEn
    };
}

module.exports = {
    DIFFICULTIES,
    MODES,
    appendHistory,
    assertKeys,
    assertObject,
    baseState,
    difficultyValue,
    publicBase,
    safeInteger,
    seeded,
    shuffled,
    token
};
