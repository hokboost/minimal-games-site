'use strict';

const EVENT_FIELDS = Object.freeze({
    'story.episode.completed': new Set(['runId','season','episode']),
    'story.choice.committed': new Set(['runId','season','episode','choiceId']),
    'story.owner_letter.persisted': new Set(['runId','season','messageKey','quiet']),
    'story.season.completed': new Set(['runId','season','conclusion','contentVersion']),
    'game.run.completed': new Set(['runId','gameId','challengeId','difficulty','mode','score','authoritativeScore','resumed']),
    'quest.assignment.completed': new Set(['assignmentId','questSlug','category','verification','rewardPoints','board','resubmitted','chainNode']),
    'quest.chain.completed': new Set(['chain','assignmentId']),
    'quest.assignment.declined': new Set(['assignmentId','questSlug']),
    'quest.assignment.postponed': new Set(['assignmentId','questSlug']),
    'quest.appeal.resolved': new Set(['assignmentId','appealId']),
    'quest.evidence.redacted': new Set(['assignmentId','evidenceId']),
    'live.item.resolved': new Set(['interactionId','itemId','type','status']),
    'live.item.persisted': new Set(['interactionId','itemId','type','quiet','muted']),
    'live.report.reconsented': new Set(['interactionId','reportId'])
});
const DISTINCT_FIELDS = new Set(['season','episode','gameId','runId','assignmentId','category','chain','chainNode']);
const ID = /^[a-z][a-z0-9_.-]{2,119}$/;

class AchievementRuleError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AchievementRuleError';
        this.code = 'ACHIEVEMENT_RULE_INVALID';
    }
}

function validateDefinition(raw) {
    if (!raw || !ID.test(raw.slug) || !EVENT_FIELDS[raw.eventType]
        || !Number.isSafeInteger(raw.target) || raw.target < 1 || raw.target > 1000000
        || !raw.filters || typeof raw.filters !== 'object' || Array.isArray(raw.filters)) {
        throw new AchievementRuleError('Invalid achievement definition');
    }
    const allowed = EVENT_FIELDS[raw.eventType];
    for (const [field, value] of Object.entries(raw.filters)) {
        if (field === 'distinct') {
            if (!DISTINCT_FIELDS.has(value) || !allowed.has(value)) throw new AchievementRuleError('Unknown distinct achievement field');
            continue;
        }
        if (!allowed.has(field) || !['string','number','boolean'].includes(typeof value)) {
            throw new AchievementRuleError(`Unknown achievement filter: ${field}`);
        }
    }
    if (!ID.test(raw.collectionKey) || typeof raw.hidden !== 'boolean'
        || (raw.season !== null && raw.season !== undefined && (!Number.isSafeInteger(raw.season) || raw.season < 1 || raw.season > 5))) {
        throw new AchievementRuleError('Invalid achievement settlement policy');
    }
    return raw;
}

function validateTrustedEvent(raw) {
    if (!raw || !EVENT_FIELDS[raw.eventType] || !['story','streamer_game','quest','live_interaction'].includes(raw.sourceType)
        || typeof raw.sourceEventId !== 'string' || !/^[A-Za-z0-9:._-]{8,180}$/.test(raw.sourceEventId)
        || !raw.payload || typeof raw.payload !== 'object' || Array.isArray(raw.payload)
        || !Number.isFinite(Date.parse(raw.occurredAt))) throw new AchievementRuleError('Invalid trusted achievement event');
    const allowed = EVENT_FIELDS[raw.eventType];
    if (Object.keys(raw.payload).some((field) => !allowed.has(field))) throw new AchievementRuleError('Trusted achievement payload has unknown fields');
    return Object.freeze({ ...raw, occurredAt: new Date(raw.occurredAt).toISOString(), payload: Object.freeze({ ...raw.payload }) });
}

function progressFor(definition, event, priorKeys = []) {
    if (definition.eventType !== event.eventType) return Object.freeze({ matched: false, progressDelta: 0, keys: priorKeys });
    for (const [field, expected] of Object.entries(definition.filters)) {
        if (field !== 'distinct' && event.payload[field] !== expected) return Object.freeze({ matched: false, progressDelta: 0, keys: priorKeys });
    }
    const distinct = definition.filters.distinct;
    if (!distinct) return Object.freeze({ matched: true, progressDelta: 1, keys: priorKeys });
    const key = event.payload[distinct];
    if (!['string','number'].includes(typeof key)) return Object.freeze({ matched: false, progressDelta: 0, keys: priorKeys });
    const normalized = `${typeof key}:${key}`;
    if (priorKeys.includes(normalized)) return Object.freeze({ matched: true, progressDelta: 0, keys: priorKeys });
    return Object.freeze({ matched: true, progressDelta: 1, keys: Object.freeze([...priorKeys, normalized]) });
}

function publicAchievement(definition, progress, language = 'zh') {
    const unlocked = Boolean(progress?.unlocked_at);
    if (definition.hidden && !unlocked) return Object.freeze({ slug: definition.slug, hidden: true, locked: true });
    return Object.freeze({
        slug: definition.slug,
        hidden: Boolean(definition.hidden),
        locked: !unlocked,
        title: language === 'en' ? definition.title_en : definition.title_zh,
        description: language === 'en' ? definition.description_en : definition.description_zh,
        progress: Math.min(Number(progress?.progress || 0), Number(definition.target)),
        target: Number(definition.target),
        unlockedAt: progress?.unlocked_at || null,
        collectionKey: unlocked ? definition.collection_key : null
    });
}

module.exports = { AchievementRuleError, EVENT_FIELDS, progressFor, publicAchievement, validateDefinition, validateTrustedEvent };
