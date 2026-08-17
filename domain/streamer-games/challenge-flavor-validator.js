'use strict';

const FIELDS = Object.freeze([
    'successZh', 'successEn', 'retryZh', 'retryEn', 'accessibilityZh',
    'accessibilityEn', 'questZh', 'questEn', 'storyZh', 'storyEn'
]);
const FIELD_SET = new Set(FIELDS);

function normalized(value) {
    return value.normalize('NFKC').toLocaleLowerCase('en-US')
        .replace(/[0-9]+/g, '#')
        .replace(/[\p{P}\p{S}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function validateChallengeFlavor(flavorByGame, expectedIdsByGame) {
    const seen = new Map();
    for (const [gameId, expectedIds] of Object.entries(expectedIdsByGame)) {
        const entries = flavorByGame[gameId];
        if (!entries || Object.keys(entries).length !== expectedIds.length) {
            throw new TypeError(`Challenge flavor count mismatch for ${gameId}`);
        }
        for (const challengeId of expectedIds) {
            const value = entries[challengeId];
            if (!value || Object.keys(value).some(key => !FIELD_SET.has(key))
                || Object.keys(value).length !== FIELDS.length) {
                throw new TypeError(`Invalid challenge flavor shape for ${gameId}:${challengeId}`);
            }
            for (const field of FIELDS) {
                const text = typeof value[field] === 'string' ? value[field].normalize('NFKC').trim() : '';
                if (text.length < 4 || text.length > 300 || /[<>\u0000-\u001f\u007f]/u.test(text)) {
                    throw new TypeError(`Invalid challenge flavor text for ${gameId}:${challengeId}:${field}`);
                }
                const language = field.endsWith('Zh') ? 'zh' : 'en';
                const key = `${language}:${normalized(text)}`;
                if (seen.has(key)) throw new TypeError(`Repeated challenge flavor at ${gameId}:${challengeId}:${field}`);
                seen.set(key, `${gameId}:${challengeId}:${field}`);
            }
        }
    }
    return Object.freeze({ challenges: Object.values(expectedIdsByGame).flat().length, fields: seen.size });
}

module.exports = { FIELDS, normalized, validateChallengeFlavor };
