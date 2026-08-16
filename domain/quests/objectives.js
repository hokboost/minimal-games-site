'use strict';

const MAX_TARGET = 1000000;
const CAMPAIGN_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CHAPTER_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function validateObjective(value, version = 1) {
    if (version !== 1 || !isPlainObject(value)) throw new TypeError('Unsupported quest objective');
    const keys = Object.keys(value);
    if (value.type !== 'event_count' || !keys.every((key) => ['type', 'event', 'target', 'filters'].includes(key))) {
        throw new TypeError('Unsupported quest objective type');
    }
    if (value.event !== 'adventure.chapter.completed') throw new TypeError('Unsupported quest event');
    if (!Number.isSafeInteger(value.target) || value.target < 1 || value.target > MAX_TARGET) {
        throw new TypeError('Invalid quest objective target');
    }
    const filters = value.filters === undefined ? {} : value.filters;
    if (!isPlainObject(filters) || !Object.keys(filters).every((key) => ['campaignId', 'chapterId'].includes(key))) {
        throw new TypeError('Invalid quest objective filters');
    }
    if (filters.campaignId !== undefined && (typeof filters.campaignId !== 'string' || !CAMPAIGN_PATTERN.test(filters.campaignId))) {
        throw new TypeError('Invalid quest campaign filter');
    }
    if (filters.chapterId !== undefined && (typeof filters.chapterId !== 'string' || !CHAPTER_PATTERN.test(filters.chapterId))) {
        throw new TypeError('Invalid quest chapter filter');
    }
    return Object.freeze({
        type: value.type,
        event: value.event,
        target: value.target,
        filters: Object.freeze({ ...filters })
    });
}

function validateProgressEvent(value) {
    if (!isPlainObject(value)) throw new TypeError('Quest progress event must be an object');
    const allowed = ['sourceType', 'sourceEventId', 'username', 'eventType', 'eventVersion', 'occurredAt', 'payload'];
    if (!Object.keys(value).every((key) => allowed.includes(key))) throw new TypeError('Unexpected quest progress event field');
    if (value.sourceType !== 'adventure') throw new TypeError('Unsupported quest event source');
    if (typeof value.sourceEventId !== 'string' || !/^adventure-completion:\d{1,20}$/.test(value.sourceEventId)) {
        throw new TypeError('Invalid quest source event identity');
    }
    if (typeof value.username !== 'string' || value.username.length < 3 || value.username.length > 50) {
        throw new TypeError('Invalid quest event username');
    }
    if (value.eventType !== 'adventure.chapter.completed' || value.eventVersion !== 1) {
        throw new TypeError('Unsupported quest progress event');
    }
    if (!isPlainObject(value.payload)
        || !Object.keys(value.payload).every((key) => ['campaignId', 'chapterId', 'runId', 'completionId'].includes(key))
        || typeof value.payload.campaignId !== 'string' || !CAMPAIGN_PATTERN.test(value.payload.campaignId)
        || typeof value.payload.chapterId !== 'string' || !CHAPTER_PATTERN.test(value.payload.chapterId)
        || typeof value.payload.runId !== 'string'
        || !Number.isSafeInteger(value.payload.completionId) || value.payload.completionId < 1) {
        throw new TypeError('Invalid adventure quest event payload');
    }
    const occurredAt = new Date(value.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) throw new TypeError('Invalid quest event time');
    return Object.freeze({ ...value, occurredAt: occurredAt.toISOString(), payload: Object.freeze({ ...value.payload }) });
}

function evaluateObjective(objectiveValue, event) {
    const objective = validateObjective(objectiveValue, 1);
    if (event.eventType !== objective.event) return { matched: false, increment: 0, target: objective.target };
    if (objective.filters.campaignId && event.payload.campaignId !== objective.filters.campaignId) {
        return { matched: false, increment: 0, target: objective.target };
    }
    if (objective.filters.chapterId && event.payload.chapterId !== objective.filters.chapterId) {
        return { matched: false, increment: 0, target: objective.target };
    }
    return { matched: true, increment: 1, target: objective.target };
}

module.exports = { evaluateObjective, validateObjective, validateProgressEvent };
