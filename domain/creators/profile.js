'use strict';

const INTERACTION_TONES = Object.freeze([
    'friend', 'co_creator', 'mentor', 'playful_rival', 'story_partner', 'quiet_support'
]);
const DIFFICULTIES = Object.freeze(['relaxed', 'guided', 'balanced', 'challenging']);
const STORY_TONES = Object.freeze(['gentle', 'mystery', 'adventure', 'dramatic']);
const COMMUNICATION_STYLES = Object.freeze(['async', 'live', 'low_frequency']);
const VISIBILITIES = Object.freeze(['private', 'owner']);
const RETENTION_POLICIES = Object.freeze(['minimum', 'standard', 'extended']);
const PREFERENCE_VALUES = Object.freeze(['allow', 'neutral', 'avoid', 'block']);
const PREFERENCE_KEYS = Object.freeze({
    quest_category: Object.freeze([
        'exploration', 'creativity', 'streaming_practice', 'game_mastery', 'story',
        'coop', 'community', 'collection', 'wellbeing'
    ]),
    communication: Object.freeze(['all_messages', 'owner_notes', 'quest_invites', 'game_invites', 'celebrations']),
    evidence: Object.freeze(['screenshot', 'text', 'checklist'])
});

class CreatorValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'CreatorValidationError';
        this.field = field;
        this.code = 'CREATOR_VALIDATION_FAILED';
    }
}

function text(value, field, max, { required = false } = {}) {
    const normalized = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
    if ((required && !normalized) || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) {
        throw new CreatorValidationError(`Invalid ${field}`, field);
    }
    return normalized;
}

function choice(value, field, allowed, fallback) {
    const normalized = value === undefined ? fallback : String(value);
    if (!allowed.includes(normalized)) throw new CreatorValidationError(`Invalid ${field}`, field);
    return normalized;
}

function validateTimezone(value) {
    const timezone = text(value || 'UTC', 'timezone', 80, { required: true });
    try {
        new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    } catch {
        throw new CreatorValidationError('Invalid timezone', 'timezone');
    }
    return timezone;
}

function validateProfile(input = {}) {
    const tones = [...new Set(Array.isArray(input.interactionTones) ? input.interactionTones.map(String) : [])];
    if (tones.length > 3 || tones.some((tone) => !INTERACTION_TONES.includes(tone))) {
        throw new CreatorValidationError('Invalid interaction tones', 'interactionTones');
    }
    const expectedVersion = Number(input.expectedVersion ?? 0);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new CreatorValidationError('Invalid profile version', 'expectedVersion');
    }
    return Object.freeze({
        displayName: text(input.displayName, 'displayName', 80, { required: true }),
        bio: text(input.bio, 'bio', 500),
        pronouns: text(input.pronouns, 'pronouns', 80),
        timezone: validateTimezone(input.timezone),
        interactionTones: Object.freeze(tones),
        difficulty: choice(input.difficulty, 'difficulty', DIFFICULTIES, 'guided'),
        storyTone: choice(input.storyTone, 'storyTone', STORY_TONES, 'gentle'),
        communicationStyle: choice(input.communicationStyle, 'communicationStyle', COMMUNICATION_STYLES, 'async'),
        liveInteractionOptIn: input.liveInteractionOptIn === true,
        profileVisibility: choice(input.profileVisibility, 'profileVisibility', VISIBILITIES, 'private'),
        evidenceRetention: choice(input.evidenceRetention, 'evidenceRetention', RETENTION_POLICIES, 'minimum'),
        expectedVersion
    });
}

function validatePreferences(input, { gameIds = [] } = {}) {
    if (!Array.isArray(input) || input.length > 40) {
        throw new CreatorValidationError('Invalid preferences', 'preferences');
    }
    const gameSet = new Set(gameIds);
    const seen = new Set();
    return Object.freeze(input.map((item) => {
        const type = String(item?.type || '');
        const key = String(item?.key || '');
        const value = String(item?.value || '');
        const allowedKeys = type === 'game' ? gameSet : new Set(PREFERENCE_KEYS[type] || []);
        if (!['quest_category', 'game', 'communication', 'evidence'].includes(type)
            || !allowedKeys.has(key) || !PREFERENCE_VALUES.includes(value) || seen.has(`${type}:${key}`)) {
            throw new CreatorValidationError('Invalid preference entry', 'preferences');
        }
        seen.add(`${type}:${key}`);
        return Object.freeze({ type, key, value });
    }));
}

function validateQuietHours(input) {
    if (!Array.isArray(input) || input.length > 7) {
        throw new CreatorValidationError('Invalid quiet hours', 'quietHours');
    }
    const days = new Set();
    return Object.freeze(input.map((window) => {
        const weekday = Number(window?.weekday);
        const startMinute = Number(window?.startMinute);
        const endMinute = Number(window?.endMinute);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || days.has(weekday)
            || !Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439
            || !Number.isInteger(endMinute) || endMinute < 0 || endMinute > 1439
            || startMinute === endMinute) {
            throw new CreatorValidationError('Invalid quiet-hours window', 'quietHours');
        }
        days.add(weekday);
        return Object.freeze({ weekday, startMinute, endMinute, enabled: window.enabled !== false });
    }));
}

function validateInteractionWindows(input) {
    if (!Array.isArray(input) || input.length > 7) {
        throw new CreatorValidationError('Invalid interaction windows', 'interactionWindows');
    }
    const days = new Set();
    return Object.freeze(input.map((window) => {
        const weekday = Number(window?.weekday);
        const startMinute = Number(window?.startMinute);
        const endMinute = Number(window?.endMinute);
        const mode = String(window?.mode || 'either');
        const duration = (endMinute - startMinute + 1440) % 1440;
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || days.has(weekday)
            || !Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439
            || !Number.isInteger(endMinute) || endMinute < 0 || endMinute > 1439
            || duration < 30 || duration > 720
            || !['async', 'live', 'either'].includes(mode)) {
            throw new CreatorValidationError('Invalid preferred interaction window', 'interactionWindows');
        }
        days.add(weekday);
        return Object.freeze({ weekday, startMinute, endMinute, mode, enabled: window.enabled !== false });
    }));
}

function validateRoomId(value) {
    const roomId = String(value || '').trim();
    if (!/^[1-9][0-9]{0,11}$/.test(roomId)) {
        throw new CreatorValidationError('Invalid Bilibili room ID', 'roomId');
    }
    return roomId;
}

module.exports = {
    COMMUNICATION_STYLES,
    CreatorValidationError,
    DIFFICULTIES,
    INTERACTION_TONES,
    PREFERENCE_KEYS,
    PREFERENCE_VALUES,
    RETENTION_POLICIES,
    STORY_TONES,
    VISIBILITIES,
    validatePreferences,
    validateInteractionWindows,
    validateProfile,
    validateQuietHours,
    validateRoomId
};
