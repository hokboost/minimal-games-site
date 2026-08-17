'use strict';

const { validateCondition } = require('./conditions');
const { validateEffect } = require('./effects');

const NODE_TYPES = new Set([
    'narrative', 'dialogue', 'choice', 'puzzle', 'quest_gate', 'game_launch',
    'inventory_gate', 'relationship_gate', 'achievement_gate', 'owner_intervention',
    'timed_wait', 'message_delivery', 'memory_unlock', 'checkpoint',
    'route_conclusion', 'season_ending'
]);
const ID = /^[a-z][a-z0-9_.-]{2,119}$/;

class StoryContentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StoryContentError';
        this.code = 'STORY_CONTENT_INVALID';
    }
}

function bilingual(value, label) {
    if (!value || typeof value !== 'object') throw new StoryContentError(`Missing ${label}`);
    for (const language of ['zh', 'en']) {
        const text = typeof value[language] === 'string' ? value[language].normalize('NFKC').trim() : '';
        if (text.length < 4 || text.length > 1200 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
            throw new StoryContentError(`Invalid ${label}.${language}`);
        }
    }
    return value;
}

function validateStoryContent(content) {
    if (!content || !ID.test(content.slug) || !Number.isSafeInteger(content.version) || content.version < 1) {
        throw new StoryContentError('Invalid story identity');
    }
    if (!Array.isArray(content.episodes) || content.episodes.length !== 12) throw new StoryContentError('Season One requires twelve episodes');
    const episodeIds = new Set();
    for (const episode of content.episodes) {
        if (!episode || !ID.test(episode.slug) || episodeIds.has(episode.slug) || !ID.test(episode.character) || !ID.test(episode.cameo)) throw new StoryContentError('Invalid or duplicate episode');
        bilingual(episode.title, `${episode.slug}.title`); episodeIds.add(episode.slug);
    }
    if (!Array.isArray(content.nodes) || content.nodes.length < 144 || content.nodes.length > 2000) throw new StoryContentError('Story graph size is outside bounds');
    const nodes = new Map();
    const prose = new Set();
    const proseShapes = new Map();
    const recordText = (value, label) => {
        bilingual(value, label);
        for (const language of ['zh', 'en']) {
            const key = `${language}:${value[language].toLocaleLowerCase(language === 'zh' ? 'zh-CN' : 'en-US')}`;
            if (prose.has(key)) throw new StoryContentError(`Duplicated authored prose at ${label}.${language}`);
            prose.add(key);
            if (/第[0-9.]+次交汇|at crossing\s+[0-9.]+/iu.test(value[language])) throw new StoryContentError(`Number-templated prose at ${label}.${language}`);
            const shape = value[language].toLocaleLowerCase(language === 'zh' ? 'zh-CN' : 'en-US').slice(0, language === 'zh' ? 18 : 48);
            proseShapes.set(shape, Number(proseShapes.get(shape) || 0) + 1);
            if (proseShapes.get(shape) > 6) throw new StoryContentError(`Excessively repeated prose opening at ${label}.${language}`);
        }
    };
    for (const node of content.nodes) {
        if (!node || !ID.test(node.id) || nodes.has(node.id) || !NODE_TYPES.has(node.type)) throw new StoryContentError('Invalid or duplicate story node');
        if (!ID.test(node.episode) || !episodeIds.has(node.episode)) throw new StoryContentError(`Invalid episode for ${node.id}`);
        if (!Number.isSafeInteger(node.visitBudget) || node.visitBudget < 1 || node.visitBudget > 20) throw new StoryContentError(`Invalid visit budget for ${node.id}`);
        recordText(node.text, `${node.id}.text`);
        if (node.condition) validateCondition(node.condition);
        (node.effects || []).forEach(validateEffect);
        (node.successEffects || []).forEach(validateEffect);
        (node.failureEffects || []).forEach(validateEffect);
        if (node.type === 'choice') {
            if (!Array.isArray(node.options) || node.options.length < 2 || node.options.length > 6) throw new StoryContentError(`Invalid choices at ${node.id}`);
            const optionIds = new Set();
            for (const option of node.options) {
                if (!ID.test(option.id) || !ID.test(option.next)) throw new StoryContentError(`Invalid choice at ${node.id}`);
                if (optionIds.has(option.id)) throw new StoryContentError(`Duplicate choice at ${node.id}`); optionIds.add(option.id);
                recordText(option.label, `${node.id}.${option.id}.label`);
                recordText(option.outcome, `${node.id}.${option.id}.outcome`);
                if (option.condition) validateCondition(option.condition);
                const effects = (option.effects || []).map(validateEffect);
                if (!effects.some((effect) => ['set_flag', 'increment_axis', 'increment_character', 'add_route'].includes(effect.type))) {
                    throw new StoryContentError(`Choice ${option.id} has no persistent consequence`);
                }
            }
        }
        if (node.type === 'puzzle' && (!ID.test(node.answerKey) || !ID.test(node.successNext) || !ID.test(node.failureNext))) throw new StoryContentError(`Invalid puzzle ${node.id}`);
        if (node.type === 'puzzle') {
            if (!Array.isArray(node.answerOptions) || node.answerOptions.length < 2 || node.answerOptions.length > 8
                || !node.answerOptions.some((option) => option.id === node.answerKey)) throw new StoryContentError(`Invalid puzzle answers ${node.id}`);
            for (const option of node.answerOptions) {
                if (!ID.test(option.id)) throw new StoryContentError(`Invalid puzzle answer ${node.id}`);
                recordText(option.label, `${node.id}.${option.id}.label`);
            }
        }
        if (node.type === 'timed_wait' && (!Number.isSafeInteger(node.waitSeconds) || node.waitSeconds < 1 || node.waitSeconds > 86400)) throw new StoryContentError(`Invalid wait ${node.id}`);
        nodes.set(node.id, node);
    }
    if (!nodes.has(content.entryNode)) throw new StoryContentError('Missing entry node');
    const refs = (node) => {
        const result = [];
        if (node.next) result.push(node.next);
        if (node.successNext) result.push(node.successNext);
        if (node.failureNext) result.push(node.failureNext);
        if (node.routes) result.push(...Object.values(node.routes));
        if (node.options) result.push(...node.options.map((option) => option.next));
        return result;
    };
    for (const node of nodes.values()) for (const ref of refs(node)) if (!nodes.has(ref)) throw new StoryContentError(`Missing node reference ${ref}`);
    const reached = new Set();
    const queue = [content.entryNode];
    while (queue.length) {
        const id = queue.shift();
        if (reached.has(id)) continue;
        reached.add(id);
        queue.push(...refs(nodes.get(id)));
    }
    if (reached.size !== nodes.size) throw new StoryContentError(`Unreachable nodes: ${nodes.size - reached.size}`);
    for (const node of nodes.values()) {
        if (node.type !== 'season_ending' && refs(node).length === 0) throw new StoryContentError(`Unexpected dead end ${node.id}`);
    }
    const characters = new Set(content.episodes.map((episode) => episode.character));
    if (characters.size < 12) throw new StoryContentError('Season requires twelve recurring characters');
    const appearances = new Map();
    for (const node of nodes.values()) if (node.speaker) appearances.set(node.speaker, Number(appearances.get(node.speaker) || 0) + 1);
    for (const character of characters) if (Number(appearances.get(character) || 0) < 2) throw new StoryContentError(`Character is not recurring: ${character}`);
    const endings = content.nodes.filter((node) => node.type === 'season_ending');
    if (endings.length < 5) throw new StoryContentError('Season requires five conclusions');
    if (Object.keys(content.memories || {}).length < 10) throw new StoryContentError('Season requires ten memories');
    for (const [key, memory] of Object.entries(content.memories || {})) {
        if (!ID.test(key)) throw new StoryContentError('Invalid memory key'); bilingual(memory.title, `${key}.title`); bilingual(memory.body, `${key}.body`);
    }
    for (const [key, message] of Object.entries(content.messages || {})) {
        if (!ID.test(key)) throw new StoryContentError('Invalid message key'); bilingual(message.title, `${key}.title`); bilingual(message.body, `${key}.body`);
    }
    for (const node of nodes.values()) for (const effect of [...(node.effects || []), ...(node.options || []).flatMap((option) => option.effects || [])]) {
        if (effect.type === 'unlock_memory' && !content.memories?.[effect.key]) throw new StoryContentError(`Missing memory ${effect.key}`);
        if (effect.type === 'deliver_message' && !content.messages?.[effect.key]) throw new StoryContentError(`Missing message ${effect.key}`);
    }
    return Object.freeze({ nodeCount: nodes.size, proseCount: prose.size, characters: characters.size, endings: endings.length });
}

module.exports = { NODE_TYPES, StoryContentError, bilingual, validateStoryContent };
