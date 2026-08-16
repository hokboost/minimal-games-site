'use strict';

const MAX_TARGET = 1000000;
const CAMPAIGN_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CHAPTER_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const RULES_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value, allowed) {
    return isPlainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function safeInteger(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validateEventCountObjective(value) {
    if (!hasOnlyKeys(value, ['type', 'event', 'target', 'filters'])
        || !['adventure.chapter.completed', 'quiz.round.completed'].includes(value.event)
        || !safeInteger(value.target, { minimum: 1, maximum: MAX_TARGET })) {
        throw new TypeError('Invalid event-count quest objective');
    }
    const filters = value.filters === undefined ? {} : value.filters;
    if (value.event === 'adventure.chapter.completed') {
        if (!hasOnlyKeys(filters, ['campaignId', 'chapterId'])) throw new TypeError('Invalid adventure objective filters');
        if (filters.campaignId !== undefined
            && (typeof filters.campaignId !== 'string' || !CAMPAIGN_PATTERN.test(filters.campaignId))) {
            throw new TypeError('Invalid quest campaign filter');
        }
        if (filters.chapterId !== undefined
            && (typeof filters.chapterId !== 'string' || !CHAPTER_PATTERN.test(filters.chapterId))) {
            throw new TypeError('Invalid quest chapter filter');
        }
    } else {
        if (!hasOnlyKeys(filters, ['minimumCorrect'])
            || (filters.minimumCorrect !== undefined
                && !safeInteger(filters.minimumCorrect, { minimum: 0, maximum: 1000 }))) {
            throw new TypeError('Invalid quiz objective filters');
        }
    }
    return Object.freeze({
        type: value.type,
        event: value.event,
        target: value.target,
        filters: Object.freeze({ ...filters })
    });
}

function validateThresholdObjective(value) {
    if (!hasOnlyKeys(value, ['type', 'event', 'field', 'operator', 'value', 'target', 'filters'])
        || value.event !== 'doudizhu.match.won'
        || value.field !== 'scoreDelta'
        || value.operator !== '>='
        || !safeInteger(value.value, { minimum: 1, maximum: 2_147_483_647 })
        || (value.target !== undefined && value.target !== 1)
        || (value.filters !== undefined && (!isPlainObject(value.filters) || Object.keys(value.filters).length !== 0))) {
        throw new TypeError('Invalid event-threshold quest objective');
    }
    return Object.freeze({
        type: value.type,
        event: value.event,
        field: value.field,
        operator: value.operator,
        value: value.value,
        target: 1,
        filters: Object.freeze({})
    });
}

function validateObjective(value, version = 1) {
    if (version !== 1 || !isPlainObject(value)) throw new TypeError('Unsupported quest objective');
    if (value.type === 'event_count') return validateEventCountObjective(value);
    if (value.type === 'event_threshold') return validateThresholdObjective(value);
    throw new TypeError('Unsupported quest objective type');
}

function validateAdventurePayload(payload) {
    return hasOnlyKeys(payload, ['campaignId', 'chapterId', 'runId', 'completionId'])
        && typeof payload.campaignId === 'string' && CAMPAIGN_PATTERN.test(payload.campaignId)
        && typeof payload.chapterId === 'string' && CHAPTER_PATTERN.test(payload.chapterId)
        && typeof payload.runId === 'string' && UUID_PATTERN.test(payload.runId)
        && safeInteger(payload.completionId, { minimum: 1 });
}

function validateQuizPayload(payload) {
    return hasOnlyKeys(payload, ['submissionId', 'sessionId', 'correct', 'total'])
        && safeInteger(payload.submissionId, { minimum: 1 })
        && typeof payload.sessionId === 'string' && TOKEN_PATTERN.test(payload.sessionId)
        && safeInteger(payload.correct, { minimum: 0, maximum: 1000 })
        && safeInteger(payload.total, { minimum: 1, maximum: 1000 })
        && payload.correct <= payload.total;
}

function validateDoudizhuPayload(payload) {
    return hasOnlyKeys(payload, ['gameId', 'rulesVersion', 'humanRole', 'scoreDelta', 'baseScore', 'multiplier'])
        && typeof payload.gameId === 'string' && UUID_PATTERN.test(payload.gameId)
        && typeof payload.rulesVersion === 'string' && RULES_VERSION_PATTERN.test(payload.rulesVersion)
        && ['landlord', 'farmer'].includes(payload.humanRole)
        && safeInteger(payload.scoreDelta, { minimum: 1, maximum: 2_147_483_647 })
        && safeInteger(payload.baseScore, { minimum: 1, maximum: 2_147_483_647 })
        && safeInteger(payload.multiplier, { minimum: 1, maximum: 2_147_483_647 });
}

const EVENT_CONTRACTS = Object.freeze({
    'adventure.chapter.completed': Object.freeze({
        sourceType: 'adventure',
        sourceIdPattern: /^adventure-completion:\d{1,20}$/,
        validatePayload: validateAdventurePayload
    }),
    'quiz.round.completed': Object.freeze({
        sourceType: 'quiz',
        sourceIdPattern: /^quiz-submission:\d{1,20}$/,
        validatePayload: validateQuizPayload
    }),
    'doudizhu.match.won': Object.freeze({
        sourceType: 'doudizhu',
        sourceIdPattern: /^doudizhu-game:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        validatePayload: validateDoudizhuPayload
    })
});

function validateProgressEvent(value) {
    if (!hasOnlyKeys(value, ['sourceType', 'sourceEventId', 'username', 'eventType', 'eventVersion', 'occurredAt', 'payload'])) {
        throw new TypeError('Unexpected quest progress event field');
    }
    const contract = EVENT_CONTRACTS[value.eventType];
    if (!contract || value.eventVersion !== 1
        || value.sourceType !== contract.sourceType
        || typeof value.sourceEventId !== 'string'
        || !contract.sourceIdPattern.test(value.sourceEventId)) {
        throw new TypeError('Unsupported quest progress event');
    }
    if (typeof value.username !== 'string' || value.username.length < 3 || value.username.length > 50) {
        throw new TypeError('Invalid quest event username');
    }
    if (!contract.validatePayload(value.payload)) throw new TypeError(`Invalid ${value.sourceType} quest event payload`);
    const occurredAt = new Date(value.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) throw new TypeError('Invalid quest event time');
    return Object.freeze({
        ...value,
        occurredAt: occurredAt.toISOString(),
        payload: Object.freeze({ ...value.payload })
    });
}

function evaluateObjective(objectiveValue, event, version = 1) {
    const objective = validateObjective(objectiveValue, version);
    if (event.eventType !== objective.event) return { matched: false, increment: 0, target: objective.target };
    if (objective.type === 'event_threshold') {
        return {
            matched: Number(event.payload[objective.field]) >= objective.value,
            increment: 1,
            target: 1
        };
    }
    if (objective.filters.campaignId && event.payload.campaignId !== objective.filters.campaignId) {
        return { matched: false, increment: 0, target: objective.target };
    }
    if (objective.filters.chapterId && event.payload.chapterId !== objective.filters.chapterId) {
        return { matched: false, increment: 0, target: objective.target };
    }
    if (objective.filters.minimumCorrect !== undefined
        && event.payload.correct < objective.filters.minimumCorrect) {
        return { matched: false, increment: 0, target: objective.target };
    }
    return { matched: true, increment: 1, target: objective.target };
}

module.exports = {
    EVENT_CONTRACTS,
    evaluateObjective,
    validateObjective,
    validateProgressEvent
};
