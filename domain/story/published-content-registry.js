'use strict';

const { seasons } = require('../../content/streamer-world/story');

function buildPublishedStoryInterventionRegistry(contents = seasons) {
    if (!Array.isArray(contents) || contents.length === 0) {
        throw new TypeError('Published story registry requires content versions');
    }
    const bindings = [];
    const seasonRows = [];
    const bindingKeys = new Set();
    for (const content of contents) {
        if (!content || typeof content.slug !== 'string' || !Number.isSafeInteger(content.version)
            || !Array.isArray(content.nodes)) {
            throw new TypeError('Invalid published story content version');
        }
        const nodes = content.nodes.filter(node => node.type === 'owner_intervention');
        if (nodes.length === 0) throw new TypeError(`Published story season has no owner intervention: ${content.slug}`);
        seasonRows.push(Object.freeze({ season: content.slug, version: content.version,
            interventionCount: nodes.length }));
        for (const node of nodes) {
            const bindingKey = `${content.slug}@${content.version}:${node.id}`;
            if (bindingKeys.has(bindingKey)) throw new TypeError(`Duplicate story intervention binding: ${bindingKey}`);
            bindingKeys.add(bindingKey);
            bindings.push(Object.freeze({ bindingKey, season: content.slug, version: content.version,
                nodeId: node.id }));
        }
    }
    return Object.freeze({
        seasons: Object.freeze(seasonRows),
        nodes: Object.freeze(bindings),
        nodeIds: Object.freeze([...new Set(bindings.map(row => row.nodeId))]),
        hasBinding(season, version, nodeId) {
            return bindingKeys.has(`${season}@${version}:${nodeId}`);
        }
    });
}

const publishedStoryInterventionRegistry = buildPublishedStoryInterventionRegistry();

module.exports = { buildPublishedStoryInterventionRegistry, publishedStoryInterventionRegistry };
