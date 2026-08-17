'use strict';

const { AXES } = require('./conditions');

const TOKEN = /^[a-z][a-z0-9_.-]{1,119}$/;
const UNLOCK_TYPES = new Set(['quest', 'game', 'achievement', 'collection', 'reward_catalog_visibility']);

class StoryEffectError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StoryEffectError';
        this.code = 'STORY_EFFECT_INVALID';
    }
}

function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function only(value, allowed) { return plain(value) && Object.keys(value).every((key) => allowed.includes(key)); }
function token(value, label) {
    if (typeof value !== 'string' || !TOKEN.test(value)) throw new StoryEffectError(`Invalid ${label}`);
    return value;
}
function integer(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new StoryEffectError(`Invalid ${label}`);
    return value;
}

function validateEffect(raw) {
    if (!plain(raw)) throw new StoryEffectError('Effect is malformed');
    if (raw.type === 'set_flag') {
        if (!only(raw, ['type', 'key', 'value']) || !['string', 'boolean'].includes(typeof raw.value)
            || (typeof raw.value === 'string' && (raw.value.length > 120 || /[\u0000-\u001f\u007f]/u.test(raw.value)))) throw new StoryEffectError('Invalid flag effect');
        return Object.freeze({ type: raw.type, key: token(raw.key, 'flag key'), value: raw.value });
    }
    if (raw.type === 'increment_axis') {
        if (!only(raw, ['type', 'axis', 'amount']) || !AXES.has(raw.axis)) throw new StoryEffectError('Invalid axis effect');
        return Object.freeze({ type: raw.type, axis: raw.axis, amount: integer(raw.amount, -10, 10, 'axis amount') });
    }
    if (raw.type === 'increment_character') {
        if (!only(raw, ['type', 'character', 'amount'])) throw new StoryEffectError('Invalid character effect');
        return Object.freeze({ type: raw.type, character: token(raw.character, 'character'), amount: integer(raw.amount, -10, 10, 'character amount') });
    }
    if (['add_clue', 'add_item', 'add_route', 'complete_episode'].includes(raw.type)) {
        if (!only(raw, ['type', 'key'])) throw new StoryEffectError(`Invalid ${raw.type} effect`);
        return Object.freeze({ type: raw.type, key: token(raw.key, `${raw.type} key`) });
    }
    if (raw.type === 'unlock_memory') {
        if (!only(raw, ['type', 'key'])) throw new StoryEffectError('Invalid memory effect');
        return Object.freeze({ type: raw.type, key: token(raw.key, 'memory key') });
    }
    if (raw.type === 'unlock') {
        if (!only(raw, ['type', 'unlockType', 'key']) || !UNLOCK_TYPES.has(raw.unlockType)) throw new StoryEffectError('Invalid unlock effect');
        return Object.freeze({ type: raw.type, unlockType: raw.unlockType, key: token(raw.key, 'unlock key') });
    }
    if (raw.type === 'deliver_message') {
        if (!only(raw, ['type', 'key'])) throw new StoryEffectError('Invalid message effect');
        return Object.freeze({ type: raw.type, key: token(raw.key, 'message key') });
    }
    throw new StoryEffectError('Unknown story effect');
}

function initialStoryState() {
    return {
        flags: {}, axes: { trust: 0, curiosity: 0, courage: 0, harmony: 0 },
        characterRelationships: {}, clues: {}, inventory: {}, memories: {}, routes: {},
        unlocks: {}, messages: {}, completedEpisodes: {}, committedChoices: [],
        visits: {}, waitStartedAt: {}
    };
}

function applyEffects(stateValue, effectsValue) {
    const state = structuredClone(stateValue || initialStoryState());
    const effects = effectsValue.map(validateEffect);
    const emitted = [];
    for (const effect of effects) {
        if (effect.type === 'set_flag') state.flags[effect.key] = effect.value;
        else if (effect.type === 'increment_axis') state.axes[effect.axis] = Math.max(0, Math.min(1000, Number(state.axes[effect.axis] || 0) + effect.amount));
        else if (effect.type === 'increment_character') state.characterRelationships[effect.character] = Math.max(-100, Math.min(100, Number(state.characterRelationships[effect.character] || 0) + effect.amount));
        else if (effect.type === 'add_clue') state.clues[effect.key] = true;
        else if (effect.type === 'add_item') state.inventory[effect.key] = true;
        else if (effect.type === 'add_route') state.routes[effect.key] = true;
        else if (effect.type === 'complete_episode') state.completedEpisodes[effect.key] = true;
        else if (effect.type === 'unlock_memory') { state.memories[effect.key] = true; emitted.push(effect); }
        else if (effect.type === 'unlock') { state.unlocks[`${effect.unlockType}:${effect.key}`] = true; emitted.push(effect); }
        else if (effect.type === 'deliver_message') { state.messages[effect.key] = true; emitted.push(effect); }
    }
    return Object.freeze({ state, emitted: Object.freeze(emitted) });
}

module.exports = { StoryEffectError, UNLOCK_TYPES, applyEffects, initialStoryState, validateEffect };
