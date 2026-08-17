'use strict';

const { WORKER_ID_PATTERN, parseWorkerCredentials } = require('./worker-credentials');
const { FLAG_NAMES, readStreamerWorldFlags } = require('./streamer-world-flags');

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
        'CSRF_AUTO_FILL',
        'ALLOW_PLAINTEXT_BILI_COOKIE',
        'AUTO_MIGRATE',
        'EXTERNAL_GIFTS_ENABLED',
        'PK_EXTERNAL_SEND_ENABLED'
    ]) validateBoolean(name);
    for (const name of FLAG_NAMES) validateBoolean(name);
    validateInteger('DAILY_GIFT_SPEND_LIMIT', { min: 1, max: 1000000000 });
    validateInteger('DAILY_USER_GIFT_SPEND_LIMIT', { min: 1, max: 100000000 });

    const applicationName = process.env.DB_APPLICATION_NAME;
    if (applicationName && !/^[A-Za-z0-9._:-]{1,63}$/.test(applicationName)) {
        throw new Error('DB_APPLICATION_NAME contains unsupported characters');
    }
    const creatorOwner = process.env.STREAMER_WORLD_OWNER_USERNAME;
    if (creatorOwner && !/^[\p{L}\p{N}_-]{3,32}$/u.test(creatorOwner.normalize('NFKC').trim())) {
        throw new Error('STREAMER_WORLD_OWNER_USERNAME contains unsupported characters');
    }
    const streamerWorldFlags = readStreamerWorldFlags(process.env);
    if (streamerWorldFlags.liveInteractionsEnabled && !streamerWorldFlags.ownerUsername) {
        throw new Error('LIVE_INTERACTIONS_ENABLED requires STREAMER_WORLD_OWNER_USERNAME');
    }
}

function validateServerEnvironment() {
    if (process.env.NODE_ENV && !['development', 'test', 'production'].includes(process.env.NODE_ENV)) {
        throw new Error('NODE_ENV must be development, test, or production');
    }
    validateCommonNumericEnvironment();
    validateOrigins();

    if (process.env.NODE_ENV === 'production') {
        if (process.env.ENABLE_TEST_FAULT_INJECTION === 'true' || process.env.TEST_FAULT_TOKEN) {
            throw new Error('Test fault injection is forbidden in production');
        }
        for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS']) requireValue(name);
        const sessionSecret = requireValue('SESSION_SECRET', 32);
        for (const name of [
            'IDEMPOTENCY_HMAC_SECRET',
            'RESET_TOKEN_SECRET',
            'ANALYTICS_TOKEN_SECRET',
            'DICTATION_TOKEN_SECRET',
            'LOG_HASH_SECRET'
        ]) requireValue(name, 32);
        const workerCredentials = parseWorkerCredentials(process.env.WORKER_CREDENTIALS_JSON);
        requireValue('READINESS_TOKEN', 32);
        if (process.env.AUTO_MIGRATE === 'true') {
            throw new Error('AUTO_MIGRATE is forbidden in the production web process');
        }
        if (sessionSecret === 'your-secret-key-change-this-in-production'
            || [...workerCredentials.values()].some(
                (credential) => credential.apiKey === 'your-secret-api-key-2024'
            )) {
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
    if (process.env.ENABLE_TEST_FAULT_INJECTION === 'true') {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Test fault injection requires NODE_ENV=test');
        }
        requireValue('TEST_FAULT_TOKEN', 32);
        validateInteger('TEST_FAULT_PAUSE_MS', { min: 100, max: 10000 });
    }
}

function validateMigrationEnvironment() {
    if (process.env.NODE_ENV && !['development', 'test', 'production'].includes(process.env.NODE_ENV)) {
        throw new Error('NODE_ENV must be development, test, or production');
    }
    for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS']) requireValue(name);
    validateInteger('DB_PORT', { min: 1, max: 65535 });
    validateBoolean('DB_SSL');
    validateBoolean('DB_SSL_REJECT_UNAUTHORIZED');
    const localDatabase = ['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST);
    if (process.env.NODE_ENV === 'production' && !localDatabase
        && (process.env.DB_SSL === 'false' || process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false')) {
        throw new Error('Production migrations require verified database TLS');
    }
}

function validateWorkerEnvironment({ platform = process.platform } = {}) {
    const credentialId = String(process.env.WORKER_CREDENTIAL_ID || '');
    if (!WORKER_ID_PATTERN.test(credentialId)) {
        throw new Error('WORKER_CREDENTIAL_ID must be a stable 8-100 character identifier');
    }
    requireValue('WORKER_API_KEY', 32);
    requireValue('WORKER_HMAC_SECRET', 32);
    validateInteger('PK_MAX_RUNNERS', { min: 1, max: 16 });
    validateBoolean('ALLOW_PLAINTEXT_BILI_COOKIE');
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
    const cookiePath = String(process.env.BILI_COOKIE_PATH || '');
    if (platform === 'win32'
        && process.env.ALLOW_PLAINTEXT_BILI_COOKIE !== 'true'
        && cookiePath
        && !cookiePath.toLowerCase().endsWith('.dpapi')) {
        throw new Error('BILI_COOKIE_PATH must use a DPAPI-protected file on Windows');
    }
}

module.exports = {
    validateMigrationEnvironment,
    validateServerEnvironment,
    validateWorkerEnvironment
};
