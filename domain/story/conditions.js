'use strict';

const MAX_DEPTH = 6;
const MAX_CHILDREN = 12;
const TOKEN = /^[a-z][a-z0-9_.-]{1,119}$/;
const AXES = new Set(['trust', 'curiosity', 'courage', 'harmony']);

class StoryConditionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StoryConditionError';
        this.code = 'STORY_CONDITION_INVALID';
    }
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function only(value, allowed) {
    return plain(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function token(value, label) {
    if (typeof value !== 'string' || !TOKEN.test(value)) throw new StoryConditionError(`Invalid ${label}`);
    return value;
}

function integer(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new StoryConditionError(`Invalid ${label}`);
    return value;
}

function validateCondition(raw, depth = 0) {
    if (!plain(raw) || depth > MAX_DEPTH) throw new StoryConditionError('Condition is malformed or too deep');
    if (raw.op === 'always') {
        if (!only(raw, ['op'])) throw new StoryConditionError('Invalid always condition');
        return Object.freeze({ op: 'always' });
    }
    if (raw.op === 'all' || raw.op === 'any') {
        if (!only(raw, ['op', 'conditions']) || !Array.isArray(raw.conditions)
            || raw.conditions.length < 1 || raw.conditions.length > MAX_CHILDREN) throw new StoryConditionError('Invalid condition group');
        return Object.freeze({ op: raw.op, conditions: Object.freeze(raw.conditions.map((item) => validateCondition(item, depth + 1))) });
    }
    if (raw.op === 'not') {
        if (!only(raw, ['op', 'condition'])) throw new StoryConditionError('Invalid negative condition');
        return Object.freeze({ op: 'not', condition: validateCondition(raw.condition, depth + 1) });
    }
    if (raw.op === 'flag') {
        if (!only(raw, ['op', 'key', 'equals'])) throw new StoryConditionError('Invalid flag condition');
        if (!['string', 'boolean'].includes(typeof raw.equals) || (typeof raw.equals === 'string' && (raw.equals.length > 120 || /[\u0000-\u001f\u007f]/u.test(raw.equals)))) throw new StoryConditionError('Invalid flag comparison');
        return Object.freeze({ op: 'flag', key: token(raw.key, 'flag key'), equals: raw.equals });
    }
    if (raw.op === 'axis') {
        if (!only(raw, ['op', 'axis', 'minimum']) || !AXES.has(raw.axis)) throw new StoryConditionError('Invalid relationship-axis condition');
        return Object.freeze({ op: 'axis', axis: raw.axis, minimum: integer(raw.minimum, 0, 1000, 'axis minimum') });
    }
    if (['item', 'clue', 'route', 'achievement', 'episode_complete'].includes(raw.op)) {
        if (!only(raw, ['op', 'key'])) throw new StoryConditionError(`Invalid ${raw.op} condition`);
        return Object.freeze({ op: raw.op, key: token(raw.key, `${raw.op} key`) });
    }
    if (raw.op === 'character_relationship') {
        if (!only(raw, ['op', 'character', 'minimum'])) throw new StoryConditionError('Invalid character relationship condition');
        return Object.freeze({ op: raw.op, character: token(raw.character, 'character'), minimum: integer(raw.minimum, -100, 100, 'character minimum') });
    }
    throw new StoryConditionError('Unknown story condition');
}

function evaluateCondition(raw, state) {
    const condition = validateCondition(raw);
    const evaluate = (node) => {
        if (node.op === 'always') return true;
        if (node.op === 'all') return node.conditions.every(evaluate);
        if (node.op === 'any') return node.conditions.some(evaluate);
        if (node.op === 'not') return !evaluate(node.condition);
        if (node.op === 'flag') return state.flags?.[node.key] === node.equals;
        if (node.op === 'axis') return Number(state.axes?.[node.axis] || 0) >= node.minimum;
        if (node.op === 'item') return Boolean(state.inventory?.[node.key]);
        if (node.op === 'clue') return Boolean(state.clues?.[node.key]);
        if (node.op === 'route') return Boolean(state.routes?.[node.key]);
        if (node.op === 'achievement') return Boolean(state.achievements?.[node.key]);
        if (node.op === 'episode_complete') return Boolean(state.completedEpisodes?.[node.key]);
        if (node.op === 'character_relationship') return Number(state.characterRelationships?.[node.character] || 0) >= node.minimum;
        return false;
    };
    return evaluate(condition);
}

module.exports = { AXES, StoryConditionError, evaluateCondition, validateCondition };
