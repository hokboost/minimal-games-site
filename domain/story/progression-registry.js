'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../lib/idempotency');
const { seasons } = require('../../content/streamer-world/story');

const BRANCH_POLICY = Object.freeze({
    progressionScope: 'branch_local',
    provenanceType: 'branch_effect',
    publishedBindingHash: null,
    economicEligible: false
});

// Economic eligibility is deliberately narrower than authored story unlocks.
// A new reward-facing binding requires a reviewed source change here as well as
// an immutable published-content milestone.
const ECONOMIC_ENTITLEMENT_BINDINGS = Object.freeze(new Set([
    'tides-of-return@1:storm-name-market.archive:reward_catalog_visibility:tides.storm-label:episode_first_clear:storm-name-market'
]));

function bindingDescriptor(content, node, effect, milestoneKey) {
    return `${content.slug}@${content.version}:${node.id}:${effect.unlockType}:${effect.key}:episode_first_clear:${milestoneKey}`;
}

function runtimeBindingKey(content, nodeId, unlockType, unlockKey) {
    return `${content.slug}@${content.version}:${content.contentHash}:${nodeId}:${unlockType}:${unlockKey}`;
}

function bindingHash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function buildPublishedStoryProgressionRegistry(contents = seasons, {
    economicBindings = ECONOMIC_ENTITLEMENT_BINDINGS
} = {}) {
    if (!Array.isArray(contents) || contents.length === 0) {
        throw new TypeError('Published story progression registry requires content versions');
    }
    const rows = [];
    const byRuntimeKey = new Map();
    const seenDescriptors = new Set();
    const publishedPrefixes = new Set(contents.map(content => `${content?.slug}@${content?.version}:`));
    for (const content of contents) {
        if (!content || typeof content.slug !== 'string' || !Number.isSafeInteger(content.version)
            || !/^[a-f0-9]{64}$/.test(content.contentHash) || !Array.isArray(content.nodes)) {
            throw new TypeError('Invalid published story progression content');
        }
        for (const node of content.nodes) {
            const milestoneKeys = (node.effects || [])
                .filter(effect => effect.type === 'complete_episode')
                .map(effect => effect.key);
            for (const effect of (node.effects || []).filter(value => value.type === 'unlock')) {
                // Choice and ordinary branch effects are intentionally absent.
                // Only a node-level unlock bound to that episode's first clear is
                // eligible to outlive checkpoint recovery.
                if (!milestoneKeys.includes(node.episode)) continue;
                const descriptor = bindingDescriptor(content, node, effect, node.episode);
                if (seenDescriptors.has(descriptor)) {
                    throw new TypeError(`Duplicate story progression binding: ${descriptor}`);
                }
                seenDescriptors.add(descriptor);
                const row = Object.freeze({
                    descriptor,
                    season: content.slug,
                    version: content.version,
                    contentHash: content.contentHash,
                    nodeId: node.id,
                    unlockType: effect.unlockType,
                    unlockKey: effect.key,
                    progressionScope: 'account_entitlement',
                    provenanceType: 'episode_first_clear',
                    provenanceKey: node.episode,
                    publishedBindingHash: bindingHash({
                        descriptor,
                        contentHash: content.contentHash
                    }),
                    economicEligible: economicBindings.has(descriptor)
                });
                if (row.economicEligible && row.unlockType !== 'reward_catalog_visibility') {
                    throw new TypeError(`Economic story binding is not reward visibility: ${descriptor}`);
                }
                const key = runtimeBindingKey(content, node.id, effect.unlockType, effect.key);
                if (byRuntimeKey.has(key)) throw new TypeError(`Story progression runtime collision: ${key}`);
                byRuntimeKey.set(key, row);
                rows.push(row);
            }
        }
    }
    for (const descriptor of economicBindings) {
        if ([...publishedPrefixes].some(prefix => descriptor.startsWith(prefix))
            && !seenDescriptors.has(descriptor)) {
            throw new TypeError(`Unknown economic story progression binding: ${descriptor}`);
        }
    }
    return Object.freeze({
        bindings: Object.freeze(rows),
        bindingsFor(content) {
            return Object.freeze(rows.filter(row => row.season === content.slug
                && row.version === content.version
                && row.contentHash === content.contentHash));
        },
        resolve(content, nodeId, effect, firstClearEpisodes = new Set()) {
            const fallback = Object.freeze({ ...BRANCH_POLICY, provenanceKey: nodeId });
            if (!effect || effect.type !== 'unlock' || !(firstClearEpisodes instanceof Set)) return fallback;
            const row = byRuntimeKey.get(runtimeBindingKey(content, nodeId, effect.unlockType, effect.key));
            if (!row || !firstClearEpisodes.has(row.provenanceKey)) return fallback;
            return row;
        }
    });
}

const publishedStoryProgressionRegistry = buildPublishedStoryProgressionRegistry();

module.exports = {
    BRANCH_POLICY,
    ECONOMIC_ENTITLEMENT_BINDINGS,
    bindingDescriptor,
    buildPublishedStoryProgressionRegistry,
    publishedStoryProgressionRegistry,
    runtimeBindingKey
};
