'use strict';

function requireValue(name, minimumLength = 1) {
    const value = String(process.env[name] || '');
    if (Buffer.byteLength(value, 'utf8') < minimumLength) {
        throw new Error(`Missing or invalid ${name}`);
    }
    return value;
}

function validateInteger(name, { min, max }) {
    const value = process.env[name];
    if (value === undefined || value === '') return;
    if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} is outside the supported range`);
    }
}

function validateBoolean(name) {
    const value = process.env[name];
    if (value !== undefined && !['true', 'false'].includes(value)) {
        throw new Error(`${name} must be true or false`);
    }
}

function validateOrigins() {
    const origins = String(process.env.PUBLIC_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    for (const origin of origins) {
        const url = new URL(origin);
        if (url.origin !== origin || url.username || url.password
            || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
            throw new Error('PUBLIC_ORIGINS contains an invalid origin');
        }
    }
}

function validateCommonNumericEnvironment() {
    validateInteger('PORT', { min: 1, max: 65535 });
    validateInteger('DB_PORT', { min: 1, max: 65535 });
    validateInteger('DB_POOL_MAX', { min: 2, max: 50 });
    validateInteger('DATABASE_STATEMENT_TIMEOUT_MS', { min: 1000, max: 60000 });
    validateInteger('PAID_ACTION_MAX_IN_FLIGHT', { min: 1, max: 1000 });
    validateInteger('PAID_ACTION_MAX_PER_USER', { min: 1, max: 20 });
    validateInteger('PAID_ACTION_MAX_POOL_WAITERS', { min: 0, max: 1000 });
    validateInteger('PAID_ACTION_MAX_EVENT_LOOP_LAG_MS', { min: 10, max: 10000 });
    for (const name of [
        'DB_SSL',
        'DB_SSL_REJECT_UNAUTHORIZED',
        'CSRF_TEST_MODE',
        'CSRF_AUTO_FILL'
    ]) validateBoolean(name);
}

function validateServerEnvironment() {
    if (process.env.NODE_ENV && !['development', 'test', 'production'].includes(process.env.NODE_ENV)) {
        throw new Error('NODE_ENV must be development, test, or production');
    }
    validateCommonNumericEnvironment();
    validateOrigins();

    if (process.env.NODE_ENV === 'production') {
        for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS']) requireValue(name);
        const sessionSecret = requireValue('SESSION_SECRET', 16);
        const windowsApiKey = requireValue('WINDOWS_API_KEY', 32);
        requireValue('GIFT_TASKS_HMAC_SECRET', 32);
        if (sessionSecret === 'your-secret-key-change-this-in-production'
            || windowsApiKey === 'your-secret-api-key-2024') {
            throw new Error('Production secrets must not use placeholder values');
        }
        if (process.env.CSRF_TEST_MODE === 'true' || process.env.CSRF_AUTO_FILL === 'true') {
            throw new Error('CSRF bypass flags are forbidden in production');
        }
        const localDatabase = ['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST);
        if (!localDatabase && process.env.DB_SSL === 'false') {
            throw new Error('Remote database TLS cannot be disabled in production');
        }
        if (!localDatabase && process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
            throw new Error('Remote database TLS verification cannot be disabled in production');
        }
    }
    const totpSecret = String(process.env.ADMIN_TOTP_SECRET || '').replace(/[\s=-]/g, '');
    if (totpSecret && (!/^[A-Z2-7]+$/i.test(totpSecret) || totpSecret.length < 16)) {
        throw new Error('ADMIN_TOTP_SECRET must be a valid Base32 secret');
    }
}

function validateWorkerEnvironment() {
    requireValue('WINDOWS_API_KEY', 32);
    requireValue('GIFT_TASKS_HMAC_SECRET', 32);
    validateInteger('PK_MAX_RUNNERS', { min: 1, max: 16 });
    const serverUrl = new URL(String(
        process.env.SERVER_URL || 'https://minimal-games-site.onrender.com'
    ));
    const local = ['localhost', '127.0.0.1'].includes(serverUrl.hostname);
    if (serverUrl.username || serverUrl.password || serverUrl.origin !== serverUrl.href.replace(/\/$/, '')
        || (!local && serverUrl.protocol !== 'https:')) {
        throw new Error('SERVER_URL must be an HTTPS origin');
    }
    const threeServerBackend = String(process.env.THREESERVER_BACKEND || 'http').toLowerCase();
    if (!['http', 'giftsend', 'api'].includes(threeServerBackend)) {
        throw new Error('THREESERVER_BACKEND must use provider-confirmed HTTP delivery');
    }
}

module.exports = {
    validateServerEnvironment,
    validateWorkerEnvironment
};
