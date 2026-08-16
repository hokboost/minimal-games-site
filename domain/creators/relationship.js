'use strict';

const LEVELS = Object.freeze([
    Object.freeze({ level: 1, minimumXp: 0, key: 'new_signal' }),
    Object.freeze({ level: 2, minimumXp: 50, key: 'familiar_voice' }),
    Object.freeze({ level: 3, minimumXp: 150, key: 'trusted_partner' }),
    Object.freeze({ level: 4, minimumXp: 400, key: 'shared_constellation' }),
    Object.freeze({ level: 5, minimumXp: 900, key: 'world_builder' })
]);

function projectRelationship(totalXp) {
    const normalized = Number(totalXp);
    if (!Number.isSafeInteger(normalized) || normalized < 0) throw new TypeError('Invalid relationship XP');
    const current = [...LEVELS].reverse().find((entry) => normalized >= entry.minimumXp);
    const next = LEVELS.find((entry) => entry.minimumXp > normalized) || null;
    return Object.freeze({
        totalXp: normalized,
        level: current.level,
        milestone: current.key,
        nextLevelXp: next?.minimumXp ?? null,
        progressToNext: next ? normalized - current.minimumXp : null,
        requiredForNext: next ? next.minimumXp - current.minimumXp : null
    });
}

module.exports = { LEVELS, projectRelationship };
