'use strict';

const MAX_DEPTH = 6;
const MAX_CHILDREN = 12;
const MAX_WINDOW_SECONDS = 31 * 24 * 60 * 60;
const MAX_TARGET = 1_000_000;
const TOKEN = /^[a-z][a-z0-9_.-]{1,119}$/;
const FILTER_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

class QuestRuleError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QuestRuleError';
        this.code = 'QUEST_RULE_INVALID';
    }
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function keys(value, allowed) {
    return plain(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function integer(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new QuestRuleError(`Invalid ${label}`);
    }
    return value;
}

function token(value, label) {
    if (typeof value !== 'string' || !TOKEN.test(value)) throw new QuestRuleError(`Invalid ${label}`);
    return value;
}

function validateFilters(value = {}) {
    if (!plain(value) || Object.keys(value).length > 8) throw new QuestRuleError('Invalid event filters');
    const normalized = {};
    for (const [key, filterValue] of Object.entries(value)) {
        if (!FILTER_KEY.test(key)) throw new QuestRuleError('Invalid filter key');
        const comparator = plain(filterValue)
            && keys(filterValue, ['op', 'value'])
            && ['eq', 'gte', 'lte'].includes(filterValue.op)
            && ['string', 'number', 'boolean'].includes(typeof filterValue.value)
            && !(typeof filterValue.value === 'string' && filterValue.value.length > 120)
            && !(typeof filterValue.value === 'number' && !Number.isSafeInteger(filterValue.value));
        const scalar = ['string', 'number', 'boolean'].includes(typeof filterValue)
            && !(typeof filterValue === 'string' && filterValue.length > 120)
            && !(typeof filterValue === 'number' && !Number.isSafeInteger(filterValue));
        if (!comparator && !scalar) {
            throw new QuestRuleError('Invalid event filter value');
        }
        normalized[key] = comparator ? Object.freeze({ op: filterValue.op, value: filterValue.value }) : filterValue;
    }
    return Object.freeze(normalized);
}

function validateRule(raw, depth = 0) {
    if (!plain(raw) || depth > MAX_DEPTH) throw new QuestRuleError('Quest rule is too deep or malformed');
    const op = raw.op;
    if (['all', 'any'].includes(op)) {
        if (!keys(raw, ['op', 'rules']) || !Array.isArray(raw.rules)
            || raw.rules.length < 1 || raw.rules.length > MAX_CHILDREN) {
            throw new QuestRuleError(`Invalid ${op} rule`);
        }
        return Object.freeze({ op, rules: Object.freeze(raw.rules.map((rule) => validateRule(rule, depth + 1))) });
    }
    if (op === 'not') {
        if (!keys(raw, ['op', 'rule'])) throw new QuestRuleError('Invalid not rule');
        return Object.freeze({ op, rule: validateRule(raw.rule, depth + 1) });
    }
    if (op === 'within_window') {
        if (!keys(raw, ['op', 'seconds', 'rule'])) throw new QuestRuleError('Invalid within-window rule');
        return Object.freeze({
            op,
            seconds: integer(raw.seconds, 60, MAX_WINDOW_SECONDS, 'rule window'),
            rule: validateRule(raw.rule, depth + 1)
        });
    }
    if (op === 'event_count') {
        if (!keys(raw, ['op', 'event', 'target', 'filters'])) throw new QuestRuleError('Invalid event-count rule');
        return Object.freeze({
            op,
            event: token(raw.event, 'event type'),
            target: integer(raw.target, 1, MAX_TARGET, 'event target'),
            filters: validateFilters(raw.filters)
        });
    }
    if (op === 'distinct_days' || op === 'streak') {
        if (!keys(raw, ['op', 'event', 'target', 'windowDays', 'filters'])) throw new QuestRuleError(`Invalid ${op} rule`);
        return Object.freeze({
            op,
            event: token(raw.event, 'event type'),
            target: integer(raw.target, 1, 365, 'day target'),
            windowDays: integer(raw.windowDays, 1, 365, 'day window'),
            filters: validateFilters(raw.filters)
        });
    }
    if (op === 'threshold_sum') {
        if (!keys(raw, ['op', 'event', 'field', 'target', 'filters'])) throw new QuestRuleError('Invalid threshold-sum rule');
        return Object.freeze({
            op,
            event: token(raw.event, 'event type'),
            field: token(raw.field, 'event field'),
            target: integer(raw.target, 1, 1_000_000_000, 'sum target'),
            filters: validateFilters(raw.filters)
        });
    }
    if (op === 'ordered_sequence') {
        if (!keys(raw, ['op', 'events']) || !Array.isArray(raw.events)
            || raw.events.length < 2 || raw.events.length > MAX_CHILDREN) {
            throw new QuestRuleError('Invalid ordered-sequence rule');
        }
        return Object.freeze({ op, events: Object.freeze(raw.events.map((event) => token(event, 'sequence event'))) });
    }
    if (op === 'has_achievement' || op === 'story_flag' || op === 'owns_collection_item') {
        const field = op === 'has_achievement' ? 'slug' : op === 'story_flag' ? 'flag' : 'item';
        const allowed = op === 'story_flag' ? ['op', field, 'value'] : ['op', field];
        if (!keys(raw, allowed)) throw new QuestRuleError(`Invalid ${op} rule`);
        const result = { op, [field]: token(raw[field], field) };
        if (op === 'story_flag') {
            if (!['string', 'boolean'].includes(typeof raw.value)
                || (typeof raw.value === 'string' && raw.value.length > 120)) {
                throw new QuestRuleError('Invalid story flag value');
            }
            result.value = raw.value;
        }
        return Object.freeze(result);
    }
    if (op === 'relationship_level') {
        if (!keys(raw, ['op', 'minimum'])) throw new QuestRuleError('Invalid relationship-level rule');
        return Object.freeze({ op, minimum: integer(raw.minimum, 1, 1000, 'relationship level') });
    }
    if (op === 'admin_confirmation' || op === 'evidence_approved') {
        if (!keys(raw, ['op'])) throw new QuestRuleError(`Invalid ${op} rule`);
        return Object.freeze({ op });
    }
    throw new QuestRuleError('Unknown quest rule operation');
}

function eventMatches(event, type, filters) {
    return event?.eventType === type
        && Object.entries(filters).every(([key, expected]) => {
            const actual = event.payload?.[key];
            if (!plain(expected)) return actual === expected;
            if (expected.op === 'eq') return actual === expected.value;
            if (expected.op === 'gte') return typeof actual === 'number' && actual >= expected.value;
            if (expected.op === 'lte') return typeof actual === 'number' && actual <= expected.value;
            return false;
        });
}

function evaluateRule(ruleValue, context = {}) {
    const rule = validateRule(ruleValue);
    const events = Array.isArray(context.events) ? context.events : [];
    const evaluate = (node, scopedEvents = events) => {
        if (node.op === 'all') return node.rules.every((child) => evaluate(child, scopedEvents));
        if (node.op === 'any') return node.rules.some((child) => evaluate(child, scopedEvents));
        if (node.op === 'not') return !evaluate(node.rule, scopedEvents);
        if (node.op === 'within_window') {
            const cutoff = Number(context.nowMs || Date.now()) - node.seconds * 1000;
            return evaluate(node.rule, scopedEvents.filter((event) => new Date(event.occurredAt).getTime() >= cutoff));
        }
        if (node.op === 'event_count') {
            return scopedEvents.filter((event) => eventMatches(event, node.event, node.filters)).length >= node.target;
        }
        if (node.op === 'threshold_sum') {
            return scopedEvents.filter((event) => eventMatches(event, node.event, node.filters))
                .reduce((sum, event) => sum + Number(event.payload?.[node.field] || 0), 0) >= node.target;
        }
        if (node.op === 'distinct_days') {
            const cutoff = Number(context.nowMs || Date.now()) - node.windowDays * 86400000;
            return new Set(scopedEvents
                .filter((event) => eventMatches(event, node.event, node.filters)
                    && new Date(event.occurredAt).getTime() >= cutoff)
                .map((event) => new Date(event.occurredAt).toISOString().slice(0, 10))).size >= node.target;
        }
        if (node.op === 'streak') {
            const days = [...new Set(scopedEvents
                .filter((event) => eventMatches(event, node.event, node.filters))
                .map((event) => new Date(event.occurredAt).toISOString().slice(0, 10)))].sort();
            let longest = 0;
            let current = 0;
            let previous = null;
            for (const day of days) {
                const timestamp = new Date(`${day}T00:00:00.000Z`).getTime();
                current = previous !== null && timestamp - previous === 86400000 ? current + 1 : 1;
                longest = Math.max(longest, current);
                previous = timestamp;
            }
            return longest >= node.target;
        }
        if (node.op === 'ordered_sequence') {
            let index = 0;
            for (const event of scopedEvents.slice().sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))) {
                if (event.eventType === node.events[index]) index += 1;
                if (index === node.events.length) return true;
            }
            return false;
        }
        if (node.op === 'has_achievement') return new Set(context.achievements || []).has(node.slug);
        if (node.op === 'story_flag') return context.storyFlags?.[node.flag] === node.value;
        if (node.op === 'relationship_level') return Number(context.relationshipLevel || 0) >= node.minimum;
        if (node.op === 'owns_collection_item') return new Set(context.collectionItems || []).has(node.item);
        if (node.op === 'admin_confirmation') return context.adminConfirmed === true;
        if (node.op === 'evidence_approved') return context.evidenceApproved === true;
        return false;
    };
    return evaluate(rule);
}

module.exports = { MAX_CHILDREN, MAX_DEPTH, QuestRuleError, evaluateRule, validateRule };
