'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../lib/idempotency');
const { hydrateCompiledContent } = require('./compiler');

function compileAuthoredSeason(source) {
    const nodes = [];
    const memories = {};
    const messages = {};
    const routerId = `${source.slug}.ending-router`;

    source.episodes.forEach((episode, episodeIndex) => {
        episode.scenes.forEach((scene, sceneIndex) => {
            const prefix = `${episode.slug}.scene-${sceneIndex + 1}`;
            const nextScene = episode.scenes[sceneIndex + 1];
            const afterChoice = nextScene
                ? `${episode.slug}.scene-${sceneIndex + 2}.opening`
                : episode.owner ? `${episode.slug}.owner` : `${episode.slug}.archive`;
            nodes.push({
                id: `${prefix}.opening`,
                episode: episode.slug,
                type: scene.kind || 'dialogue',
                speaker: scene.speaker || episode.character,
                text: scene.text,
                visitBudget: 2,
                next: `${prefix}.choice`,
                effects: []
            });
            nodes.push({
                id: `${prefix}.choice`,
                episode: episode.slug,
                type: 'choice',
                text: scene.prompt,
                visitBudget: 2,
                options: scene.options.map((option, optionIndex) => ({
                    id: `${prefix}.option-${optionIndex + 1}`,
                    label: option.label,
                    outcome: option.outcome,
                    next: `${prefix}.result-${optionIndex + 1}`,
                    effects: [
                        { type: 'set_flag', key: `${prefix}.option-${optionIndex + 1}`, value: true },
                        { type: 'increment_axis', axis: option.axis, amount: option.amount || 2 },
                        { type: 'increment_character', character: episode.character, amount: option.relationship || 2 },
                        { type: 'add_route', key: option.route }
                    ]
                }))
            });
            scene.options.forEach((option, optionIndex) => nodes.push({
                id: `${prefix}.result-${optionIndex + 1}`,
                episode: episode.slug,
                type: 'narrative',
                text: option.result,
                visitBudget: 2,
                next: afterChoice,
                effects: option.effects || []
            }));
        });

        if (episode.owner) {
            nodes.push({
                id: `${episode.slug}.owner`,
                episode: episode.slug,
                type: 'owner_intervention',
                text: episode.owner.text,
                visitBudget: 2,
                next: `${episode.slug}.archive`,
                effects: [{ type: 'deliver_message', key: `${episode.slug}.owner-letter` }]
            });
            messages[`${episode.slug}.owner-letter`] = {
                title: episode.owner.title,
                body: episode.owner.body
            };
        }

        const nextEpisode = source.episodes[episodeIndex + 1];
        nodes.push({
            id: `${episode.slug}.archive`,
            episode: episode.slug,
            type: episode.archive.type,
            text: episode.archive.text,
            visitBudget: 3,
            next: nextEpisode ? `${nextEpisode.slug}.scene-1.opening` : routerId,
            effects: [
                { type: 'unlock_memory', key: `${episode.slug}.memory` },
                { type: 'unlock', unlockType: episode.archive.unlockType, key: episode.archive.unlockKey },
                { type: 'complete_episode', key: episode.slug }
            ]
        });
        memories[`${episode.slug}.memory`] = {
            title: episode.memory.title,
            body: episode.memory.body,
            episode: episode.slug,
            ordinal: episodeIndex + 1
        };
    });

    nodes.push({
        id: routerId,
        episode: source.episodes.at(-1).slug,
        type: 'route_conclusion',
        text: source.endingRouter,
        visitBudget: 2,
        routes: Object.fromEntries(source.endings.map((ending) => [ending.key, ending.id])),
        effects: []
    });
    source.endings.forEach((ending) => nodes.push({
        ...ending,
        episode: source.episodes.at(-1).slug,
        type: 'season_ending',
        visitBudget: 1,
        effects: [{ type: 'add_route', key: ending.route }]
    }));

    const content = {
        slug: source.slug,
        version: source.version,
        title: source.title,
        entryNode: `${source.episodes[0].slug}.scene-1.opening`,
        episodes: source.episodes.map(({ scenes, archive, memory, owner, ...episode }) => episode),
        memories,
        messages,
        nodes
    };
    const hash = crypto.createHash('sha256').update(stableStringify(content)).digest('hex');
    return hydrateCompiledContent(content, hash);
}

module.exports = { compileAuthoredSeason };
