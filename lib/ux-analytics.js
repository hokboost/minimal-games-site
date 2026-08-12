const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_PATTERN = /^[a-zA-Z0-9_.:-]+$/;

function isUuid(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

function clampInteger(value, min, max, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
}

function optionalString(value, maxLength, pattern = null) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().slice(0, maxLength);
    if (!trimmed || (pattern && !pattern.test(trimmed))) return null;
    return trimmed;
}

function normalizeRoute(value) {
    if (typeof value !== 'string') return '/unknown';
    const route = value.split(/[?#]/, 1)[0].trim();
    if (!route.startsWith('/') || /[\u0000-\u001f\u007f]/.test(route)) return '/unknown';
    return route.slice(0, 180) || '/';
}

function normalizeTimestamp(value, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const maxPastMs = options.maxPastMs ?? 24 * 60 * 60 * 1000;
    const maxFutureMs = options.maxFutureMs ?? 5 * 60 * 1000;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return now;
    if (parsed.getTime() < now.getTime() - maxPastMs) return new Date(now.getTime() - maxPastMs);
    if (parsed.getTime() > now.getTime() + maxFutureMs) return now;
    return parsed;
}

function sanitizeLanguages(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .map((item) => optionalString(item, 35, /^[a-zA-Z0-9-]+$/))
        .filter(Boolean))]
        .slice(0, 10);
}

function sanitizeMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const output = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, 16)) {
        const key = optionalString(rawKey, 40, /^[a-zA-Z][a-zA-Z0-9_]*$/);
        if (!key) continue;
        if (typeof rawValue === 'string') output[key] = rawValue.slice(0, 200);
        else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) output[key] = rawValue;
        else if (typeof rawValue === 'boolean' || rawValue === null) output[key] = rawValue;
        else if (Array.isArray(rawValue)) {
            output[key] = rawValue.slice(0, 10).map((item) => {
                if (typeof item === 'string') return item.slice(0, 80);
                if (typeof item === 'number' && Number.isFinite(item)) return item;
                if (typeof item === 'boolean' || item === null) return item;
                return null;
            });
        }
    }
    const serialized = JSON.stringify(output);
    return serialized.length <= 3000 ? output : {};
}

function sanitizePreferences(value) {
    const input = value && typeof value === 'object' ? value : {};
    const enumValue = (raw, allowed, fallback = null) => allowed.includes(raw) ? raw : fallback;
    return {
        deviceType: enumValue(input.deviceType, ['desktop', 'tablet', 'mobile', 'unknown'], 'unknown'),
        platform: optionalString(input.platform, 80),
        browserLanguage: optionalString(input.browserLanguage, 35, /^[a-zA-Z0-9-]+$/),
        preferredLanguages: sanitizeLanguages(input.preferredLanguages),
        appLanguage: optionalString(input.appLanguage, 12, /^[a-zA-Z0-9-]+$/),
        timezone: optionalString(input.timezone, 80, /^[a-zA-Z0-9_+\/-]+$/),
        timezoneOffsetMinutes: clampInteger(input.timezoneOffsetMinutes, -900, 900, 0),
        screenWidth: clampInteger(input.screenWidth, 1, 20000, null),
        screenHeight: clampInteger(input.screenHeight, 1, 20000, null),
        viewportWidth: clampInteger(input.viewportWidth, 1, 20000, null),
        viewportHeight: clampInteger(input.viewportHeight, 1, 20000, null),
        pixelRatio: Number.isFinite(Number(input.pixelRatio))
            ? Math.min(20, Math.max(0.1, Number(input.pixelRatio)))
            : null,
        orientation: optionalString(input.orientation, 20, NAME_PATTERN),
        colorScheme: enumValue(input.colorScheme, ['light', 'dark', 'unknown']),
        reducedMotion: input.reducedMotion === true,
        highContrast: input.highContrast === true,
        touchCapable: input.touchCapable === true,
        cookiesEnabled: input.cookiesEnabled === true,
        standalone: input.standalone === true,
        hardwareConcurrency: clampInteger(input.hardwareConcurrency, 1, 512, null),
        deviceMemoryGb: Number.isFinite(Number(input.deviceMemoryGb))
            ? Math.min(1024, Math.max(0.1, Number(input.deviceMemoryGb)))
            : null,
        connectionType: optionalString(input.connectionType, 20, NAME_PATTERN),
        saveData: input.saveData === true
    };
}

module.exports = {
    NAME_PATTERN,
    clampInteger,
    isUuid,
    normalizeRoute,
    normalizeTimestamp,
    optionalString,
    sanitizeMetadata,
    sanitizePreferences
};
