'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../lib/idempotency');

const POLICIES = Object.freeze({
    quest: Object.freeze({ eventType: 'quest.chain.completed', catalogSlug: 'quiet-orbit-frame' }),
    story: Object.freeze({ eventType: 'story.season.completed', catalogSlug: 'dream-compass-key' }),
    game: Object.freeze({ eventType: 'game.run.completed', gameId: 'studio-crafting',
        catalogSlug: 'starlight-studio-badge' }),
    achievement: Object.freeze({ achievementSlug: 'constellation-first-repair',
        catalogSlug: 'paper-star-frame' }),
    season: Object.freeze({ eventType: 'story.season.completed', catalogSlug: 'memory-book-cover' })
});

function sourceGrantIdentity(prefix, ...parts) {
    if (!/^[a-z][a-z0-9-]{2,24}$/.test(prefix)) throw new TypeError('Invalid reward grant identity prefix');
    const digest = crypto.createHash('sha256').update(stableStringify(parts)).digest('hex');
    return `${prefix}:${digest}`;
}

function sourceGrantForEvent(sourceType, event, extra = {}) {
    const policy = POLICIES[sourceType];
    if (!policy || !event) return null;
    if (sourceType === 'achievement') {
        if (extra.achievementSlug !== policy.achievementSlug) return null;
    } else if (event.eventType !== policy.eventType) return null;
    if (sourceType === 'game' && event.payload?.gameId !== policy.gameId) return null;
    return Object.freeze({
        sourceType,
        sourceEventId: sourceGrantIdentity(`reward-${sourceType}`,
            event.sourceEventId || event.eventId, extra.achievementSlug || null),
        catalogSlug: policy.catalogSlug,
        payload: Object.freeze({ eventType: event.eventType,
            originalSourceEventId: event.sourceEventId || event.eventId,
            ...(extra.achievementSlug ? { achievementSlug: extra.achievementSlug } : {}),
            ...(event.payload || {}) })
    });
}

module.exports = { POLICIES, sourceGrantForEvent, sourceGrantIdentity };
