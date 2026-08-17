'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../lib/idempotency');
const { validateStoryContent } = require('./validator');

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value); for (const item of Object.values(value)) deepFreeze(item, seen); return Object.freeze(value);
}
function hydrateCompiledContent(content, contentHash) {
    validateStoryContent(content); deepFreeze(content);
    const nodeMap = new Map(content.nodes.map((node) => [node.id, node]));
    const nodesById = Object.freeze({ get: (id) => nodeMap.get(id), has: (id) => nodeMap.has(id) });
    return Object.freeze({ ...content, contentHash, nodesById });
}

function compileSeason(source) {
    const nodes = [];
    const specials = new Map(source.episodes.map((episode) => [episode.slug, episode.special]));
    source.episodes.forEach((episode, episodeIndex) => {
        episode.moments.forEach((moment, momentIndex) => {
            const prefix = `${episode.slug}.m${momentIndex + 1}`;
            const nextPrefix = momentIndex < episode.moments.length - 1
                ? `${episode.slug}.m${momentIndex + 2}.intro`
                : episode.ownerIntervention ? `${episode.slug}.owner` : `${episode.slug}.special`;
            nodes.push({ id: `${prefix}.intro`, episode: episode.slug, type: momentIndex % 2 ? 'dialogue' : 'narrative', speaker: momentIndex % 2 ? episode.cameo : episode.character, text: moment.intro, visitBudget: 2, next: `${prefix}.choice`, effects: [] });
            nodes.push({
                id: `${prefix}.choice`, episode: episode.slug, type: 'choice', text: moment.prompt, visitBudget: 2,
                options: ['left', 'right'].map((side) => ({
                    id: `${prefix}.${side}`, label: moment[side].label, outcome: moment[side].outcome,
                    next: `${prefix}.${side}.result`, effects: [
                        { type: 'set_flag', key: `${prefix}.${side}`, value: true },
                        { type: 'increment_axis', axis: moment[side].axis, amount: moment[side].amount },
                        { type: 'increment_character', character: episode.character, amount: moment[side].relationship },
                        { type: 'add_route', key: moment[side].route }
                    ]
                }))
            });
            for (const side of ['left', 'right']) nodes.push({
                id: `${prefix}.${side}.result`, episode: episode.slug, type: 'narrative', text: moment[side].result,
                visitBudget: 2, next: nextPrefix, effects: moment[side].resultEffects || []
            });
        });
        if (episode.ownerIntervention) nodes.push({
            id: `${episode.slug}.owner`, episode: episode.slug, type: 'owner_intervention', visitBudget: 2,
            text: episode.ownerIntervention, next: `${episode.slug}.special`,
            effects: [{ type: 'deliver_message', key: `${episode.slug}.owner-note` }]
        });
        const special = specials.get(episode.slug);
        const nextEpisode = source.episodes[episodeIndex + 1];
        const standardNext = nextEpisode ? `${nextEpisode.slug}.m1.intro` : 'season-one.ending-router';
        const branched = ['puzzle', 'quest_gate', 'inventory_gate', 'relationship_gate', 'achievement_gate'].includes(special.type);
        nodes.push({ ...special,
            ...(branched ? { successNext: `${episode.slug}.special.success`, failureNext: `${episode.slug}.special.failure` } : {}),
            id: `${episode.slug}.special`, episode: episode.slug, visitBudget: special.visitBudget || 3,
            next: special.next || standardNext,
            effects: [...(special.effects || []), { type: 'complete_episode', key: episode.slug }] });
        if (branched) {
            nodes.push({ id: `${episode.slug}.special.success`, episode: episode.slug, type: 'narrative', visitBudget: 2,
                text: special.successText, next: standardNext, effects: special.successResultEffects || [] });
            nodes.push({ id: `${episode.slug}.special.failure`, episode: episode.slug, type: 'narrative', visitBudget: 2,
                text: special.failureText, next: standardNext, effects: special.failureResultEffects || [] });
        }
    });
    nodes.push({
        id: 'season-one.ending-router', episode: 'relay-one', type: 'route_conclusion', visitBudget: 2,
        text: source.endingRouterText, effects: [], routes: source.endings.reduce((map, ending) => ({ ...map, [ending.key]: ending.id }), {})
    });
    for (const ending of source.endings) nodes.push({ ...ending, episode: 'relay-one', type: 'season_ending', visitBudget: 1, effects: ending.effects || [] });
    const content = { slug: source.slug, version: source.version, title: source.title, entryNode: `${source.episodes[0].slug}.m1.intro`, episodes: source.episodes.map(({ moments, special, ...episode }) => episode), memories: source.memories, messages: source.messages, nodes };
    const snapshot = stableStringify(content);
    return hydrateCompiledContent(content, crypto.createHash('sha256').update(snapshot).digest('hex'));
}

module.exports = { compileSeason, hydrateCompiledContent };
