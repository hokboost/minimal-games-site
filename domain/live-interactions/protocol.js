'use strict';

const crypto = require('node:crypto');

const PROTOCOL_VERSION = 1;
// The existing PostgreSQL bus accepts 7,500 bytes including its own wrapper.
// Keeping the entire durable envelope below 6,000 leaves room for that wrapper.
const MAX_EVENT_BYTES = 6000;
const ITEM_TYPES = Object.freeze([
    'nudge', 'clue', 'celebration', 'story_letter', 'quest_invite',
    'poll', 'game_invite', 'story_intervention'
]);
const EVENT_TYPES = Object.freeze([
    'interaction.opened', 'interaction.nudge', 'interaction.clue',
    'interaction.celebration', 'interaction.story_letter',
    'interaction.quest_invite', 'interaction.poll_opened',
    'interaction.poll_voted', 'interaction.game_invite',
    'interaction.story_intervention', 'interaction.item_accepted',
    'interaction.item_declined', 'interaction.availability_changed',
    'interaction.muted', 'interaction.left', 'interaction.reported',
    'interaction.closed', 'interaction.report_resolved', 'interaction.reconsented',
    'interaction.item_expired', 'interaction.game_state_changed'
]);
const EVENT_AUDIENCES = Object.freeze(['owner', 'creator', 'both', 'system']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class LiveProtocolError extends Error {
    constructor(code, message, field = null) {
        super(message);
        this.name = 'LiveProtocolError';
        this.code = code;
        this.field = field;
    }
}

function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function semanticHash(value) {
    return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function exactObject(value, allowed, field = 'body') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new LiveProtocolError('LIVE_INVALID_INPUT', `Invalid ${field}`, field);
    }
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));
    if (unknown) throw new LiveProtocolError('LIVE_UNKNOWN_FIELD', `Unknown ${field} field`, unknown);
    return value;
}

function text(value, field, maximum, {
    required = true
} = {}) {
    const normalized = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
    if ((required && !normalized) || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
        throw new LiveProtocolError('LIVE_INVALID_INPUT', `Invalid ${field}`, field);
    }
    return normalized;
}

function uuid(value, field) {
    const normalized = String(value || '').toLowerCase();
    if (!UUID_PATTERN.test(normalized)) throw new LiveProtocolError('LIVE_INVALID_INPUT', `Invalid ${field}`, field);
    return normalized;
}

function safeInteger(value, field, {
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
} = {}) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
        throw new LiveProtocolError('LIVE_INVALID_INPUT', `Invalid ${field}`, field);
    }
    return number;
}

function validateBaseCommand(input, allowed) {
    exactObject(input, ['commandId', 'interactionId', 'expectedRevision', ...allowed]);
    return {
        commandId: uuid(input.commandId, 'commandId'),
        interactionId: safeInteger(input.interactionId, 'interactionId', {
            minimum: 1
        }),
        expectedRevision: safeInteger(input.expectedRevision, 'expectedRevision')
    };
}

function validateDirectorCommand(input) {
    const base = validateBaseCommand(input, ['creatorUsername', 'itemType', 'templateKey', 'referenceId', 'pollOptions',
        'targetStoryNode', 'expiresInMinutes'
    ]);
    const itemType = String(input.itemType || '');
    if (!ITEM_TYPES.includes(itemType)) throw new LiveProtocolError('LIVE_INVALID_INPUT', 'Invalid itemType',
        'itemType');
    const creatorUsername = text(input.creatorUsername, 'creatorUsername', 50);
    const templateKey = text(input.templateKey, 'templateKey', 100);
    if (!/^[a-z0-9][a-z0-9._-]{2,99}$/.test(templateKey)) throw new LiveProtocolError('LIVE_INVALID_INPUT',
        'Invalid templateKey', 'templateKey');
    const referenceId = input.referenceId === undefined ? null : text(input.referenceId, 'referenceId', 120);
    let pollOptions = [];
    if (itemType === 'poll') {
        if (!Array.isArray(input.pollOptions) || input.pollOptions.length < 2 || input.pollOptions.length > 5) {
            throw new LiveProtocolError('LIVE_INVALID_INPUT', 'Poll needs two to five options', 'pollOptions');
        }
        pollOptions = input.pollOptions.map((option, index) => text(option, `pollOptions.${index}`, 80));
        if (new Set(pollOptions).size !== pollOptions.length) throw new LiveProtocolError('LIVE_INVALID_INPUT',
            'Poll options must be unique', 'pollOptions');
    } else if (input.pollOptions !== undefined) {
        throw new LiveProtocolError('LIVE_INVALID_INPUT', 'pollOptions only belong to a poll', 'pollOptions');
    }
    const targetStoryNode = itemType === 'story_intervention' ?
        text(input.targetStoryNode, 'targetStoryNode', 160) :
        null;
    if (itemType !== 'story_intervention' && input.targetStoryNode !== undefined) {
        throw new LiveProtocolError('LIVE_INVALID_INPUT', 'targetStoryNode only belongs to a story intervention',
            'targetStoryNode');
    }
    const expiresInMinutes = input.expiresInMinutes === undefined ?
        1440 :
        safeInteger(input.expiresInMinutes, 'expiresInMinutes', {
            minimum: 5,
            maximum: 10080
        });
    return Object.freeze({
        ...base,
        creatorUsername,
        itemType,
        templateKey,
        referenceId,
        pollOptions,
        targetStoryNode,
        expiresInMinutes
    });
}

function validateOpenCommand(input) {
    exactObject(input, ['commandId', 'creatorUsername']);
    return Object.freeze({
        commandId: uuid(input.commandId, 'commandId'),
        creatorUsername: text(input.creatorUsername, 'creatorUsername', 50)
    });
}

function validateItemAction(input, action) {
    const extra = action === 'vote' ? ['itemId', 'optionIndex'] : ['itemId'];
    const base = validateBaseCommand(input, extra);
    const itemId = safeInteger(input.itemId, 'itemId', {
        minimum: 1
    });
    const optionIndex = action === 'vote' ?
        safeInteger(input.optionIndex, 'optionIndex', {
            minimum: 0,
            maximum: 4
        }) :
        null;
    return Object.freeze({
        ...base,
        itemId,
        optionIndex
    });
}

function validateAvailability(input) {
    const base = validateBaseCommand(input, ['availability']);
    const availability = String(input.availability || '');
    if (!['offline', 'available', 'busy'].includes(availability)) {
        throw new LiveProtocolError('LIVE_INVALID_INPUT', 'Invalid availability', 'availability');
    }
    return Object.freeze({
        ...base,
        availability
    });
}

function validateMute(input) {
    const base = validateBaseCommand(input, ['minutes']);
    return Object.freeze({
        ...base,
        minutes: safeInteger(input.minutes, 'minutes', {
            minimum: 15,
            maximum: 10080
        })
    });
}

function validateLeave(input) {
    return Object.freeze(validateBaseCommand(input, []));
}

function validateReport(input) {
    const base = validateBaseCommand(input, ['itemId', 'reasonCode', 'detail']);
    const reasonCode = String(input.reasonCode || '');
    if (!['unwanted_contact', 'unsafe_task', 'privacy', 'harassment', 'other'].includes(reasonCode)) {
        throw new LiveProtocolError('LIVE_INVALID_INPUT', 'Invalid reasonCode', 'reasonCode');
    }
    return Object.freeze({
        ...base,
        itemId: input.itemId === null || input.itemId === undefined ? null : safeInteger(input.itemId,
        'itemId', {
            minimum: 1
        }),
        reasonCode,
        detail: text(input.detail, 'detail', 500, {
            required: false
        })
    });
}

function validateModeration(input) {
    const base = validateBaseCommand(input, ['reportId', 'resolution']);
    const resolution = String(input.resolution || '');
    if (!['resolved', 'dismissed'].includes(resolution)) throw new LiveProtocolError('LIVE_INVALID_INPUT',
        'Invalid resolution', 'resolution');
    return Object.freeze({
        ...base,
        reportId: safeInteger(input.reportId, 'reportId', {
            minimum: 1
        }),
        resolution
    });
}

function validateReconsent(input) {
    const base = validateBaseCommand(input, ['reportId']);
    return Object.freeze({
        ...base,
        reportId: safeInteger(input.reportId, 'reportId', {
            minimum: 1
        })
    });
}

function validateAck(input) {
    exactObject(input, ['interactionId', 'sequence']);
    return Object.freeze({
        interactionId: safeInteger(input.interactionId, 'interactionId', {
            minimum: 1
        }),
        sequence: safeInteger(input.sequence, 'sequence')
    });
}

function validateCatchUp(query) {
    exactObject(query, ['interactionId', 'afterSequence', 'limit'], 'query');
    return Object.freeze({
        interactionId: safeInteger(query.interactionId, 'interactionId', {
            minimum: 1
        }),
        afterSequence: safeInteger(query.afterSequence ?? 0, 'afterSequence'),
        limit: safeInteger(query.limit ?? 50, 'limit', {
            minimum: 1,
            maximum: 100
        })
    });
}

function envelope(row) {
    const payload = row.payload || {};
    const result = Object.freeze({
        version: PROTOCOL_VERSION,
        interactionId: Number(row.interaction_id),
        eventId: row.event_id,
        sequence: Number(row.sequence),
        eventType: row.event_type,
        audience: row.audience,
        actor: {
            type: row.actor_type
        },
        subjectUserId: Number(row.subject_user_id),
        serverTimestamp: row.created_at,
        payload,
        correlationId: row.correlation_id,
        stateRevision: Number(row.state_revision)
    });
    if (!EVENT_TYPES.includes(result.eventType) || !EVENT_AUDIENCES.includes(result.audience)
        || Buffer.byteLength(JSON.stringify(result), 'utf8') >
        MAX_EVENT_BYTES) {
        throw new LiveProtocolError('LIVE_INVALID_EVENT', 'Stored event violates protocol');
    }
    return result;
}

module.exports = {
    EVENT_AUDIENCES,
    EVENT_TYPES,
    ITEM_TYPES,
    LiveProtocolError,
    MAX_EVENT_BYTES,
    PROTOCOL_VERSION,
    envelope,
    exactObject,
    semanticHash,
    stableJson,
    validateAck,
    validateAvailability,
    validateCatchUp,
    validateDirectorCommand,
    validateItemAction,
    validateLeave,
    validateModeration,
    validateMute,
    validateOpenCommand,
    validateReconsent,
    validateReport
};
